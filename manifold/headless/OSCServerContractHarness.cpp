#include "ControlContractHarnessSupport.h"
#include "../primitives/control/OSCPacketBuilder.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <array>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <optional>
#include <string>
#include <vector>

#include <juce_core/juce_core.h>

namespace {

using namespace control_contract_support;

struct UdpListener {
    int fd = -1;
    int port = 0;

    ~UdpListener() {
        if (fd >= 0) {
            ::close(fd);
        }
    }
};

UdpListener makeUdpListener() {
    UdpListener listener;
    listener.fd = ::socket(AF_INET, SOCK_DGRAM, 0);
    if (listener.fd < 0) {
        return listener;
    }

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = 0;
    if (::bind(listener.fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        ::close(listener.fd);
        listener.fd = -1;
        return listener;
    }

    socklen_t len = sizeof(addr);
    if (::getsockname(listener.fd, reinterpret_cast<sockaddr*>(&addr), &len) == 0) {
        listener.port = ntohs(addr.sin_port);
    }
    return listener;
}

bool sendOscPacketToPort(int port,
                         const juce::String& address,
                         const std::vector<juce::var>& args) {
    const int fd = ::socket(AF_INET, SOCK_DGRAM, 0);
    if (fd < 0) {
        return false;
    }

    const auto packet = OSCPacketBuilder::build(address, args);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons(static_cast<uint16_t>(port));

    const ssize_t wrote = ::sendto(fd,
                                   packet.data(),
                                   packet.size(),
                                   0,
                                   reinterpret_cast<sockaddr*>(&addr),
                                   sizeof(addr));
    ::close(fd);
    return wrote == static_cast<ssize_t>(packet.size());
}

struct OscPacket {
    juce::String address;
    juce::String typeTags;
    juce::var firstValue;
};

std::optional<OscPacket> parseOscPacket(const std::vector<uint8_t>& bytes) {
    if (bytes.size() < 8) {
        return std::nullopt;
    }

    OscPacket out;
    int offset = 0;
    while (offset < static_cast<int>(bytes.size()) && bytes[static_cast<size_t>(offset)] != '\0') {
        out.address += static_cast<char>(bytes[static_cast<size_t>(offset++)]);
    }
    ++offset;
    while ((offset % 4) != 0) {
        ++offset;
    }
    if (offset >= static_cast<int>(bytes.size()) || bytes[static_cast<size_t>(offset)] != ',') {
        return std::nullopt;
    }
    ++offset;
    while (offset < static_cast<int>(bytes.size()) && bytes[static_cast<size_t>(offset)] != '\0') {
        out.typeTags += static_cast<char>(bytes[static_cast<size_t>(offset++)]);
    }
    ++offset;
    while ((offset % 4) != 0) {
        ++offset;
    }

    if (out.typeTags.isEmpty()) {
        return out;
    }

    const char tag = out.typeTags[0];
    if (tag == 'f' && offset + 4 <= static_cast<int>(bytes.size())) {
        uint32_t beVal = 0;
        std::memcpy(&beVal, bytes.data() + offset, 4);
        beVal = ntohl(beVal);
        float value = 0.0f;
        std::memcpy(&value, &beVal, 4);
        out.firstValue = value;
    } else if (tag == 'i' && offset + 4 <= static_cast<int>(bytes.size())) {
        uint32_t beVal = 0;
        std::memcpy(&beVal, bytes.data() + offset, 4);
        out.firstValue = static_cast<int>(ntohl(beVal));
    } else if (tag == 's') {
        juce::String value;
        while (offset < static_cast<int>(bytes.size()) && bytes[static_cast<size_t>(offset)] != '\0') {
            value += static_cast<char>(bytes[static_cast<size_t>(offset++)]);
        }
        out.firstValue = value;
    }

    return out;
}

std::optional<OscPacket> readOscPacket(int fd, int timeoutMs = 2000) {
    pollfd pfd{};
    pfd.fd = fd;
    pfd.events = POLLIN;
    if (::poll(&pfd, 1, timeoutMs) <= 0) {
        return std::nullopt;
    }

    std::vector<uint8_t> buffer(2048);
    const ssize_t got = ::recv(fd, buffer.data(), buffer.size(), 0);
    if (got <= 0) {
        return std::nullopt;
    }
    buffer.resize(static_cast<size_t>(got));
    return parseOscPacket(buffer);
}

void resetStateForBroadcastBaseline(MockControlProcessor& processor) {
    auto& state = processor.getControlServer().getAtomicState();
    state.tempo.store(120.0f);
    state.isRecording.store(false);
    state.overdubEnabled.store(false);
    state.recordMode.store(0);
    state.activeLayer.store(0);
    state.masterVolume.store(1.0f);

    for (int i = 0; i < AtomicState::MAX_LAYERS; ++i) {
        auto& layer = state.layers[i];
        layer.state.store(0);
        layer.speed.store(1.0f);
        layer.volume.store(1.0f);
        layer.reversed.store(false);
        layer.playheadPos.store(0);
        layer.length.store(0);
        layer.numBars.store(0.0f);
    }
}

juce::var oscPacketToVar(const OscPacket& packet) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("address", packet.address);
    obj->setProperty("typeTags", packet.typeTags);
    obj->setProperty("firstValue", packet.firstValue);
    return juce::var(obj);
}

juce::var setCallToVar(const MockControlProcessor::SetCall& call) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("path", juce::String(call.path));
    obj->setProperty("value", call.value);
    return juce::var(obj);
}

juce::var varsToVar(const std::vector<juce::var>& values) {
    juce::Array<juce::var> out;
    for (const auto& value : values) {
        out.add(value);
    }
    return juce::var(out);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    juce::ScopedJuceInitialiser_GUI juceInit;
    MockControlProcessor processor;
    resetStateForBroadcastBaseline(processor);

    OSCSettings settings;
    settings.inputPort = findFreeUdpPort();
    settings.queryPort = findFreeTcpPort();
    settings.oscEnabled = true;
    settings.oscQueryEnabled = false;
    processor.getOSCServer().setSettings(settings);

    processor.getOSCServer().start(&processor);
    auto stopServer = juce::ScopeGuard{[&processor]() {
        processor.getOSCServer().stop();
    }};

    UdpListener listener = makeUdpListener();
    if (listener.fd < 0 || listener.port <= 0) {
        std::fprintf(stderr, "ERROR: failed to open UDP listener\n");
        return 2;
    }

    processor.getOSCServer().addOutTarget("127.0.0.1:" + juce::String(listener.port));
    processor.getOSCServer().setBroadcastRate(60);

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // =====================================================================
    // Domain 1: lifecycle and inbound dispatch
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("running", processor.getOSCServer().isRunning());
        const auto liveSettings = processor.getOSCServer().getSettings();
        obj->setProperty("inputPortPositive", liveSettings.inputPort > 0);
        obj->setProperty("oscEnabled", liveSettings.oscEnabled);
        obj->setProperty("outTargetCount", processor.getOSCServer().getOutTargets().size());

        processor.clearHistories();
        sendOscPacketToPort(settings.inputPort, "/core/behavior/tempo", {juce::var(132.5)});
        waitUntil([&processor]() { return !processor.getCommandHistory().empty(); }, 2000, 10);

        sendOscPacketToPort(settings.inputPort, "/core/behavior/rec", {});
        waitUntil([&processor]() { return processor.getCommandHistory().size() >= 2; }, 2000, 10);

        sendOscPacketToPort(settings.inputPort, "/custom/fader", {juce::var(0.75)});
        waitUntil([&processor]() { return !processor.getSetHistory().empty(); }, 2000, 10);

        sendOscPacketToPort(settings.inputPort, "/ephemeral/foo", {juce::var(9.0)});
        waitUntil([&processor]() {
            std::vector<juce::var> args;
            return processor.getOSCServer().getCustomValue("/ephemeral/foo", args) && !args.empty();
        }, 2000, 10);

        const auto commands = processor.getCommandHistory();
        const auto sets = processor.getSetHistory();
        obj->setProperty("commandHistorySize", static_cast<int>(commands.size()));
        if (commands.size() >= 2) {
            obj->setProperty("tempoCommand", controlCommandToVar(commands[0]));
            obj->setProperty("triggerCommand", controlCommandToVar(commands[1]));
        }
        obj->setProperty("setHistorySize", static_cast<int>(sets.size()));
        if (!sets.empty()) {
            obj->setProperty("lastSet", setCallToVar(sets.back()));
        }

        std::vector<juce::var> ephemeralArgs;
        if (processor.getOSCServer().getCustomValue("/ephemeral/foo", ephemeralArgs)) {
            obj->setProperty("ephemeralCustomValue", varsToVar(ephemeralArgs));
        }

        root->setProperty("inboundDispatch", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: direct outbound broadcast and state-diff routing
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();

        processor.getOSCServer().broadcast("/custom/out", {juce::var(1.25)});
        const auto directPacket = readOscPacket(listener.fd, 2000);
        obj->setProperty("directBroadcastSeen", directPacket.has_value());
        if (directPacket.has_value()) {
            obj->setProperty("directPacket", oscPacketToVar(*directPacket));
        }

        processor.getControlServer().getAtomicState().tempo.store(135.0f);
        const auto diffPacket = readOscPacket(listener.fd, 2500);
        obj->setProperty("stateDiffSeen", diffPacket.has_value());
        if (diffPacket.has_value()) {
            obj->setProperty("stateDiffPacket", oscPacketToVar(*diffPacket));
        }

        root->setProperty("outboundRouting", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: target management semantics
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        processor.getOSCServer().addOutTarget("127.0.0.1:9999");
        auto afterAdd = processor.getOSCServer().getOutTargets();
        obj->setProperty("afterAddCount", afterAdd.size());
        obj->setProperty("afterAddContains9999", afterAdd.contains("127.0.0.1:9999"));

        processor.getOSCServer().removeOutTarget("127.0.0.1:9999");
        auto afterRemove = processor.getOSCServer().getOutTargets();
        obj->setProperty("afterRemoveCount", afterRemove.size());
        obj->setProperty("afterRemoveContains9999", afterRemove.contains("127.0.0.1:9999"));

        processor.getOSCServer().clearOutTargets();
        auto afterClear = processor.getOSCServer().getOutTargets();
        obj->setProperty("afterClearCount", afterClear.size());
        root->setProperty("targetManagement", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();

    switch (opts.mode) {
        case HarnessOptions::Write: {
            std::ofstream file(opts.contractPath);
            if (!file.is_open()) {
                std::fprintf(stderr, "ERROR: cannot write to %s\n", opts.contractPath.c_str());
                return 2;
            }
            file << contract;
            std::fprintf(stdout,
                         "OK: wrote OSCServer contract (%zu bytes) to %s\n",
                         contract.size(),
                         opts.contractPath.c_str());
            return 0;
        }
        case HarnessOptions::Verify:
            return verifyJsonContract("OSCServer contract", contract, opts.contractPath) ? 0 : 3;
        case HarnessOptions::Print:
        default:
            std::fprintf(stdout, "%s\n", contract.c_str());
            return 0;
    }
}
