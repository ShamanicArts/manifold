#pragma once

#include "../primitives/scripting/ScriptableProcessor.h"
#include "../primitives/control/BehaviorControlStateView.h"
#include "../primitives/control/BehaviorRuntimeTelemetryView.h"
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
        auto controlState = manifold::control_state_view::BehaviorControlStateView(
            controlServer.getBehaviorControlState());
        auto runtimeTelemetry =
            manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryView(
                controlServer.getBehaviorRuntimeTelemetry());

        controlState.setTempo(123.5f);
        controlState.setTargetBpm(128.0f);
        runtimeTelemetry.setSamplesPerBar(96000.0f);
        runtimeTelemetry.setSampleRate(48000.0);
        runtimeTelemetry.setCaptureSize(2048);
        runtimeTelemetry.setCaptureWritePos(321);
        runtimeTelemetry.setCaptureLevel(0.42f);
        controlState.setIsRecording(true);
        controlState.setOverdubEnabled(false);
        controlState.setForwardArmed(true);
        controlState.setForwardBars(2.0f);
        controlState.setGraphEnabled(true);
        runtimeTelemetry.setGraphEnabled(true);
        controlState.setRecordMode(1);
        controlState.setActiveLayer(2);
        controlState.setMasterVolume(0.8f);
        controlState.setInputVolume(0.65f);
        controlState.setPassthroughEnabled(false);
        runtimeTelemetry.setPlayTime(1536.0);
        runtimeTelemetry.setCommitCount(7);
        runtimeTelemetry.setUptimeSeconds(42.5);

        for (int i = 0; i < manifold::BehaviorControlState::MAX_LAYERS; ++i) {
            runtimeTelemetry.setLayerState(i, (i == 0) ? 1 : (i == 1) ? 2 : (i == 2) ? 5 : 0);
            runtimeTelemetry.setLayerLength(i, 1000 + i * 250);
            runtimeTelemetry.setLayerPlayheadPos(i, 100 + i * 75);
            controlState.setLayerSpeed(i, 1.0f + 0.25f * static_cast<float>(i));
            controlState.setLayerReversed(i, (i % 2) == 1);
            controlState.setLayerVolume(i, 0.9f - 0.1f * static_cast<float>(i));
            runtimeTelemetry.setLayerNumBars(i, 1.0f + 0.5f * static_cast<float>(i));
            controlState.setLayerMuted(i, false);
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
        const auto controlState =
            manifold::control_state_view::BehaviorControlStateConstView(
                controlServer.getBehaviorControlState());
        const auto runtimeTelemetry =
            manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryConstView(
                controlServer.getBehaviorRuntimeTelemetry());
        out.index = index;
        out.length = runtimeTelemetry.layerLength(index);
        out.position = runtimeTelemetry.layerPlayheadPos(index);
        out.speed = controlState.layerSpeed(index);
        out.reversed = controlState.layerReversed(index);
        out.volume = controlState.layerVolume(index);
        out.state = static_cast<ScriptableLayerState>(runtimeTelemetry.layerState(index));
        out.muted = controlState.layerMuted(index);
        return true;
    }

    int getCaptureSize() const override {
        return manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryConstView(
            controlServer.getBehaviorRuntimeTelemetry())
            .captureSize();
    }

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

    float getTempo() const override {
        return manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryConstView(
            controlServer.getBehaviorRuntimeTelemetry())
            .tempo();
    }
    float getTargetBPM() const override {
        return manifold::control_state_view::BehaviorControlStateConstView(
            controlServer.getBehaviorControlState())
            .targetBpm();
    }
    float getSamplesPerBar() const override {
        return manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryConstView(
            controlServer.getBehaviorRuntimeTelemetry())
            .samplesPerBar();
    }
    double getSampleRate() const override {
        return manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryConstView(
            controlServer.getBehaviorRuntimeTelemetry())
            .sampleRate();
    }
    double getPlayTimeSamples() const override {
        return manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryConstView(
            controlServer.getBehaviorRuntimeTelemetry())
            .playTime();
    }
    float getMasterVolume() const override {
        return manifold::control_state_view::BehaviorControlStateConstView(
            controlServer.getBehaviorControlState())
            .masterVolume();
    }
    float getInputVolume() const override {
        return manifold::control_state_view::BehaviorControlStateConstView(
            controlServer.getBehaviorControlState())
            .inputVolume();
    }
    bool isPassthroughEnabled() const override {
        return manifold::control_state_view::BehaviorControlStateConstView(
            controlServer.getBehaviorControlState())
            .passthroughEnabled();
    }
    bool isRecording() const override {
        return manifold::control_state_view::BehaviorControlStateConstView(
            controlServer.getBehaviorControlState())
            .isRecording();
    }
    bool isOverdubEnabled() const override {
        return manifold::control_state_view::BehaviorControlStateConstView(
            controlServer.getBehaviorControlState())
            .overdubEnabled();
    }
    int getActiveLayerIndex() const override {
        return manifold::control_state_view::BehaviorControlStateConstView(
            controlServer.getBehaviorControlState())
            .activeLayer();
    }
    bool isForwardCommitArmed() const override {
        return manifold::control_state_view::BehaviorControlStateConstView(
            controlServer.getBehaviorControlState())
            .forwardArmed();
    }
    float getForwardCommitBars() const override {
        return manifold::control_state_view::BehaviorControlStateConstView(
            controlServer.getBehaviorControlState())
            .forwardBars();
    }
    int getRecordModeIndex() const override {
        return manifold::control_state_view::BehaviorControlStateConstView(
            controlServer.getBehaviorControlState())
            .recordMode();
    }
    int getCommitCount() const override {
        return manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryConstView(
            controlServer.getBehaviorRuntimeTelemetry())
            .commitCount();
    }
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
