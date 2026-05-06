#pragma once

#include "../primitives/scripting/ScriptableProcessor.h"
#include "../primitives/control/ControlServer.h"
#include "../primitives/control/OSCQuery.h"
#include "../primitives/control/OSCServer.h"
#include "../primitives/control/OSCEndpointRegistry.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <functional>
#include <iterator>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

#include <juce_core/juce_core.h>

namespace control_contract_support {

struct HarnessOptions {
    enum Mode { Print, Write, Verify } mode = Print;
    std::string contractPath;
};

inline void printUsage(const char* name) {
    std::fprintf(stderr,
                 "Usage: %s [--print-contract | --write-contract PATH | --verify-contract PATH]\n",
                 name);
}

inline bool parseOptions(int argc, char* argv[], HarnessOptions& out) {
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--print-contract") {
            out.mode = HarnessOptions::Print;
        } else if (arg == "--write-contract" && i + 1 < argc) {
            out.mode = HarnessOptions::Write;
            out.contractPath = argv[++i];
        } else if (arg == "--verify-contract" && i + 1 < argc) {
            out.mode = HarnessOptions::Verify;
            out.contractPath = argv[++i];
        } else if (arg == "--help" || arg == "-h") {
            printUsage(argv[0]);
            return false;
        } else {
            std::fprintf(stderr, "Unknown argument: %s\n", argv[i]);
            printUsage(argv[0]);
            return false;
        }
    }
    return true;
}

inline std::string readFile(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        std::fprintf(stderr, "ERROR: cannot read file: %s\n", path.c_str());
        std::exit(2);
    }
    return std::string((std::istreambuf_iterator<char>(file)),
                       std::istreambuf_iterator<char>());
}

inline bool verifyJsonContract(const char* name,
                               const std::string& rawCurrent,
                               const std::string& goldenPath) {
    const auto rawGolden = readFile(goldenPath);
    const auto goldenVar = juce::JSON::parse(rawGolden);
    const auto currentVar = juce::JSON::parse(rawCurrent);

    if (goldenVar.isVoid() || currentVar.isVoid()) {
        std::fprintf(stderr, "FAIL: could not parse contract JSON\n");
        return false;
    }

    const auto goldenStr = juce::JSON::toString(goldenVar).toStdString();
    const auto currentStr = juce::JSON::toString(currentVar).toStdString();
    if (goldenStr == currentStr) {
        std::fprintf(stdout, "OK: %s matches golden file\n", name);
        return true;
    }

    const size_t minLen = std::min(goldenStr.size(), currentStr.size());
    size_t diffPos = 0;
    while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos]) {
        ++diffPos;
    }

    std::fprintf(stderr, "FAIL: %s mismatch\n", name);
    std::fprintf(stderr, "  golden: %zu bytes, current: %zu bytes\n",
                 goldenStr.size(), currentStr.size());
    std::fprintf(stderr, "  first diff at byte %zu\n", diffPos);
    return false;
}

inline int findFreeTcpPort() {
    const int fd = ::socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        return -1;
    }

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = 0;

    if (::bind(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        ::close(fd);
        return -1;
    }

    socklen_t len = sizeof(addr);
    if (::getsockname(fd, reinterpret_cast<sockaddr*>(&addr), &len) < 0) {
        ::close(fd);
        return -1;
    }

    const int port = ntohs(addr.sin_port);
    ::close(fd);
    return port;
}

inline int findFreeUdpPort() {
    const int fd = ::socket(AF_INET, SOCK_DGRAM, 0);
    if (fd < 0) {
        return -1;
    }

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = 0;

    if (::bind(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        ::close(fd);
        return -1;
    }

    socklen_t len = sizeof(addr);
    if (::getsockname(fd, reinterpret_cast<sockaddr*>(&addr), &len) < 0) {
        ::close(fd);
        return -1;
    }

    const int port = ntohs(addr.sin_port);
    ::close(fd);
    return port;
}

inline bool waitUntil(const std::function<bool()>& predicate,
                      int timeoutMs = 2000,
                      int sleepMs = 10) {
    const auto deadline = std::chrono::steady_clock::now() +
                          std::chrono::milliseconds(timeoutMs);
    while (std::chrono::steady_clock::now() < deadline) {
        if (predicate()) {
            return true;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(sleepMs));
    }
    return predicate();
}

inline juce::var controlValuePayloadToVar(const ControlValuePayload& value) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("kind", static_cast<int>(value.kind));
    obj->setProperty("floatValue", value.floatValue);
    obj->setProperty("intValue", value.intValue);
    obj->setProperty("boolValue", value.boolValue);
    return juce::var(obj);
}

inline juce::var controlCommandToVar(const ControlCommand& command) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("operation", static_cast<int>(command.operation));
    obj->setProperty("endpointId", command.endpointId);
    obj->setProperty("value", controlValuePayloadToVar(command.value));
    obj->setProperty("type", static_cast<int>(command.type));
    obj->setProperty("intParam", command.intParam);
    obj->setProperty("floatParam", command.floatParam);
    return juce::var(obj);
}

inline juce::var stringVectorToVar(const std::vector<std::string>& values) {
    juce::Array<juce::var> out;
    for (const auto& value : values) {
        out.add(juce::String(value));
    }
    return juce::var(out);
}

inline juce::var juceStringArrayToVar(const juce::StringArray& values) {
    juce::Array<juce::var> out;
    for (const auto& value : values) {
        out.add(value);
    }
    return juce::var(out);
}

class MockControlProcessor : public ScriptableProcessor {
public:
    struct SetCall {
        std::string path;
        float value = 0.0f;
    };

    MockControlProcessor() {
        endpointRegistry.setNumLayers(4);
        endpointRegistry.rebuild();
        registerDefaultCustomEndpoints();
        seedAtomicState();
        values["/custom/fader"] = 0.25f;
        values["/custom/gate"] = 1.0f;
    }

    void seedAtomicState() {
        auto& state = controlServer.getAtomicState();
        state.tempo.store(123.5f);
        state.targetBPM.store(128.0f);
        state.samplesPerBar.store(96000.0f);
        state.sampleRate.store(48000.0);
        state.captureSize.store(2048);
        state.captureWritePos.store(321);
        state.captureLevel.store(0.42f);
        state.isRecording.store(true);
        state.overdubEnabled.store(false);
        state.forwardArmed.store(true);
        state.forwardBars.store(2.0f);
        state.graphEnabled.store(true);
        state.recordMode.store(1);
        state.activeLayer.store(2);
        state.masterVolume.store(0.8f);
        state.inputVolume.store(0.65f);
        state.passthroughEnabled.store(false);
        state.playTime.store(1536.0);
        state.commitCount.store(7);
        state.uptimeSeconds.store(42.5);

        for (int i = 0; i < AtomicState::MAX_LAYERS; ++i) {
            auto& layer = state.layers[i];
            layer.state.store((i == 0) ? 1 : (i == 1) ? 2 : (i == 2) ? 5 : 0);
            layer.length.store(1000 + i * 250);
            layer.playheadPos.store(100 + i * 75);
            layer.speed.store(1.0f + 0.25f * static_cast<float>(i));
            layer.reversed.store((i % 2) == 1);
            layer.volume.store(0.9f - 0.1f * static_cast<float>(i));
            layer.numBars.store(1.0f + 0.5f * static_cast<float>(i));
            layer.muted.store(false);
        }
    }

    void registerDefaultCustomEndpoints() {
        OSCEndpoint fader;
        fader.path = "/custom/fader";
        fader.type = "f";
        fader.rangeMin = 0.0f;
        fader.rangeMax = 1.0f;
        fader.access = 3;
        fader.description = "Custom fader";
        fader.category = "custom";
        endpointRegistry.registerCustomEndpoint(fader);

        OSCEndpoint gate;
        gate.path = "/custom/gate";
        gate.type = "i";
        gate.rangeMin = 0.0f;
        gate.rangeMax = 1.0f;
        gate.access = 3;
        gate.description = "Custom gate";
        gate.category = "custom";
        endpointRegistry.registerCustomEndpoint(gate);

        OSCEndpoint xy;
        xy.path = "/custom/xy";
        xy.type = "ff";
        xy.rangeMin = 0.0f;
        xy.rangeMax = 1.0f;
        xy.access = 3;
        xy.description = "Custom XY";
        xy.category = "custom";
        endpointRegistry.registerCustomEndpoint(xy);
    }

    std::vector<ControlCommand> getCommandHistory() const {
        std::lock_guard<std::mutex> lock(historyMutex);
        return commandHistory;
    }

    std::vector<SetCall> getSetHistory() const {
        std::lock_guard<std::mutex> lock(valuesMutex);
        return setHistory;
    }

    void clearHistories() {
        std::lock_guard<std::mutex> historyLock(historyMutex);
        commandHistory.clear();
        std::lock_guard<std::mutex> valueLock(valuesMutex);
        setHistory.clear();
    }

    bool postControlCommandPayload(const ControlCommand& command) override {
        if (!acceptPostedCommands) {
            return false;
        }
        std::lock_guard<std::mutex> lock(historyMutex);
        commandHistory.push_back(command);
        return true;
    }

    bool postControlCommand(ControlCommand::Type type, int intParam, float floatParam) override {
        ControlCommand command;
        command.operation = ControlOperation::Legacy;
        command.type = type;
        command.intParam = intParam;
        command.floatParam = floatParam;
        return postControlCommandPayload(command);
    }

    ControlServer& getControlServer() override { return controlServer; }
    OSCServer& getOSCServer() override { return oscServer; }
    OSCEndpointRegistry& getEndpointRegistry() override { return endpointRegistry; }
    OSCQueryServer& getOSCQueryServer() override { return oscQueryServer; }

    bool setParamByPath(const std::string& path, float value) override {
        if (!acceptDirectWrites) {
            return false;
        }
        std::lock_guard<std::mutex> lock(valuesMutex);
        values[path] = value;
        setHistory.push_back(SetCall{path, value});
        return true;
    }

    float getParamByPath(const std::string& path) const override {
        std::lock_guard<std::mutex> lock(valuesMutex);
        const auto it = values.find(path);
        return it != values.end() ? it->second : 0.0f;
    }

    bool hasEndpoint(const std::string& path) const override {
        return endpointRegistry.findEndpoint(juce::String(path)).path.isNotEmpty();
    }

    int getNumLayers() const override { return 4; }

    bool getLayerSnapshot(int index, ScriptableLayerSnapshot& out) const override {
        if (index < 0 || index >= getNumLayers()) {
            return false;
        }
        auto& layer = controlServer.getAtomicState().layers[index];
        out.index = index;
        out.length = layer.length.load();
        out.position = layer.playheadPos.load();
        out.speed = layer.speed.load();
        out.reversed = layer.reversed.load();
        out.volume = layer.volume.load();
        out.state = static_cast<ScriptableLayerState>(layer.state.load());
        out.muted = layer.muted.load();
        return true;
    }

    int getCaptureSize() const override { return controlServer.getAtomicState().captureSize.load(); }

    bool computeLayerPeaks(int layerIndex,
                           int numBuckets,
                           std::vector<float>& outPeaks) const override {
        if (layerIndex < 0 || layerIndex >= getNumLayers() || numBuckets <= 0) {
            return false;
        }
        outPeaks.assign(static_cast<size_t>(numBuckets), 0.5f);
        return true;
    }

    bool computeCapturePeaks(int startAgo,
                             int endAgo,
                             int numBuckets,
                             std::vector<float>& outPeaks) const override {
        if (startAgo < 0 || endAgo <= startAgo || numBuckets <= 0) {
            return false;
        }
        outPeaks.assign(static_cast<size_t>(numBuckets), 0.25f);
        return true;
    }

    float getTempo() const override { return controlServer.getAtomicState().tempo.load(); }
    float getTargetBPM() const override { return controlServer.getAtomicState().targetBPM.load(); }
    float getSamplesPerBar() const override { return controlServer.getAtomicState().samplesPerBar.load(); }
    double getSampleRate() const override { return controlServer.getAtomicState().sampleRate.load(); }
    double getPlayTimeSamples() const override { return controlServer.getAtomicState().playTime.load(); }
    float getMasterVolume() const override { return controlServer.getAtomicState().masterVolume.load(); }
    float getInputVolume() const override { return controlServer.getAtomicState().inputVolume.load(); }
    bool isPassthroughEnabled() const override { return controlServer.getAtomicState().passthroughEnabled.load(); }
    bool isRecording() const override { return controlServer.getAtomicState().isRecording.load(); }
    bool isOverdubEnabled() const override { return controlServer.getAtomicState().overdubEnabled.load(); }
    int getActiveLayerIndex() const override { return controlServer.getAtomicState().activeLayer.load(); }
    bool isForwardCommitArmed() const override { return controlServer.getAtomicState().forwardArmed.load(); }
    float getForwardCommitBars() const override { return controlServer.getAtomicState().forwardBars.load(); }
    int getRecordModeIndex() const override { return controlServer.getAtomicState().recordMode.load(); }
    int getCommitCount() const override { return controlServer.getAtomicState().commitCount.load(); }
    std::array<float, 32> getSpectrumData() const override { return {}; }

    bool acceptPostedCommands = true;
    bool acceptDirectWrites = true;

private:
    mutable std::mutex historyMutex;
    mutable std::mutex valuesMutex;
    std::vector<ControlCommand> commandHistory;
    std::vector<SetCall> setHistory;
    std::unordered_map<std::string, float> values;

    OSCServer oscServer;
    ControlServer controlServer;
    OSCEndpointRegistry endpointRegistry;
    OSCQueryServer oscQueryServer;
};

} // namespace control_contract_support
