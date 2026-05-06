// DSPHostLifecycleContractHarness.cpp
//
// Tests the DSPPluginScriptHost lifecycle: initialise, load, param access,
// process callback, reload, unload, and deferred mutation propagation.
// Follows the same contract pattern as DspNodeContractHarness et al:
//   --print-contract | --write-contract PATH | --verify-contract PATH

#include "../../manifold/primitives/scripting/DSPPluginScriptHost.h"
#include "../../manifold/primitives/scripting/PrimitiveGraph.h"
#include "../../manifold/primitives/scripting/GraphRuntime.h"
#include "../../manifold/primitives/control/OSCServer.h"
#include "../../manifold/primitives/control/OSCEndpointRegistry.h"
#include "../../manifold/primitives/control/OSCQuery.h"
#include "../../manifold/primitives/control/ControlServer.h"
#include "../../manifold/primitives/control/CommandParser.h"
#include "../../manifold/primitives/core/Settings.h"
#include "../../dsp/core/nodes/GainNode.h"
#include "../../dsp/core/nodes/PassthroughNode.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>
#include <memory>

#include <juce_core/juce_core.h>

// ============================================================================
// Mock DSP processor
// ============================================================================
class MockDspProcessor : public ScriptableProcessor {
public:
    MockDspProcessor()
        : graph_(std::make_shared<dsp_primitives::PrimitiveGraph>())
    {
        endpointRegistry_.setNumLayers(2);
        endpointRegistry_.rebuild();
    }

    std::shared_ptr<dsp_primitives::PrimitiveGraph> getPrimitiveGraph() override { return graph_; }
    void requestGraphRuntimeSwap(std::unique_ptr<dsp_primitives::GraphRuntime>) override {}
    void beginGraphMutation() override {}
    void endGraphMutation() override {}

    double getSampleRate() const override { return 44100.0; }
    int getGraphBlockSize() const override { return 512; }
    int getGraphOutputChannels() const override { return 2; }

    ControlServer& getControlServer() override { return controlServer_; }
    OSCServer& getOSCServer() override { return oscServer_; }
    OSCEndpointRegistry& getEndpointRegistry() override { return endpointRegistry_; }
    OSCQueryServer& getOSCQueryServer() override { return oscQueryServer_; }

    bool postControlCommandPayload(const ControlCommand& command) override {
        commands_.push_back(command);
        if (command.type == ControlCommand::Type::SetTempo) tempo_ = command.floatParam;
        return true;
    }

    bool postControlCommand(ControlCommand::Type type, int intParam, float floatParam) override {
        ControlCommand cmd;
        cmd.operation = ControlOperation::Legacy;
        cmd.type = type;
        cmd.intParam = intParam;
        cmd.floatParam = floatParam;
        return postControlCommandPayload(cmd);
    }

    bool setParamByPath(const std::string& path, float value) override {
        ParseResult result = CommandParser::buildResolverSetCommand(
            &endpointRegistry_, juce::String(path), juce::var(value));
        if (result.kind != ParseResult::Kind::Enqueue) return false;
        return postControlCommandPayload(result.command);
    }

    float getParamByPath(const std::string& path) const override {
        if (path == "/test/tempo") return tempo_;
        if (path == "/test/volume") return volume_;
        return 0.0f;
    }

    bool hasEndpoint(const std::string& path) const override {
        OSCEndpoint ep = endpointRegistry_.findEndpoint(juce::String(path));
        return ep.path.isNotEmpty();
    }

    int getNumLayers() const override { return 2; }
    bool getLayerSnapshot(int index, ScriptableLayerSnapshot& out) const override {
        if (index < 0 || index >= 2) return false;
        out.index = index; out.length = 44100; out.position = 0;
        out.speed = 1.0f; out.volume = 1.0f; out.state = ScriptableLayerState::Stopped;
        return true;
    }
    int getCaptureSize() const override { return 512; }
    bool computeLayerPeaks(int, int, std::vector<float>& p) const override { p.assign(64, 0.25f); return true; }
    bool computeCapturePeaks(int, int, int, std::vector<float>& p) const override { p.assign(64, 0.1f); return true; }

    float getTempo() const override { return tempo_; }
    float getTargetBPM() const override { return tempo_; }
    float getSamplesPerBar() const override { return 44100.0 * 60.0 / tempo_ * 4.0; }
    double getPlayTimeSamples() const override { return 0.0; }
    float getMasterVolume() const override { return volume_; }
    float getInputVolume() const override { return 0.8f; }
    bool isPassthroughEnabled() const override { return false; }
    bool isRecording() const override { return false; }
    bool isOverdubEnabled() const override { return false; }
    int getActiveLayerIndex() const override { return 0; }
    bool isForwardCommitArmed() const override { return false; }
    float getForwardCommitBars() const override { return 0.0f; }
    int getRecordModeIndex() const override { return 0; }
    int getCommitCount() const override { return 0; }
    std::array<float, 32> getSpectrumData() const override { return {}; }

private:
    std::shared_ptr<dsp_primitives::PrimitiveGraph> graph_;
    OSCServer oscServer_;
    ControlServer controlServer_;
    OSCEndpointRegistry endpointRegistry_;
    OSCQueryServer oscQueryServer_;
    std::vector<ControlCommand> commands_;
    float tempo_ = 120.0f;
    float volume_ = 0.75f;
};

// ============================================================================
// Test Lua script
// ============================================================================
static const char* kTestScript = R"(
function buildPlugin(ctx)
  local gain = ctx.primitives.GainNode.new(1)
  local output = ctx.primitives.PassthroughNode.new()
  ctx.graph.connect(gain, output)
  ctx.graph.nameNode(gain, "/test/mainGain")

  ctx.params.register("/test/gain", { type = "f", min = 0.0, max = 1.0, default = 1.0 })
  ctx.params.register("/test/mode", { type = "f", min = 0.0, max = 3.0, default = 0.0 })
  ctx.params.register("/test/label", { type = "s", description = "a label parameter" })
  ctx.params.bind("/test/gain", gain, "setGain")

  return {
    description = "lifecycle test script",
    params = { "/test/gain", "/test/mode", "/test/label" },
  }
end
)";

// ============================================================================
// Contract helpers
// ============================================================================

struct HarnessOptions {
    enum Mode { Print, Write, Verify } mode = Print;
    std::string contractPath;
};

void printUsage(const char* name) {
    std::fprintf(stderr,
        "Usage: %s [--print-contract | --write-contract PATH | --verify-contract PATH]\n", name);
}

bool parseOptions(int argc, char* argv[], HarnessOptions& out) {
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--print-contract")      { out.mode = HarnessOptions::Print; }
        else if (arg == "--write-contract" && i + 1 < argc) { out.mode = HarnessOptions::Write; out.contractPath = argv[++i]; }
        else if (arg == "--verify-contract" && i + 1 < argc) { out.mode = HarnessOptions::Verify; out.contractPath = argv[++i]; }
        else if (arg == "--help" || arg == "-h") { printUsage(argv[0]); return false; }
        else { std::fprintf(stderr, "Unknown argument: %s\n", argv[i]); printUsage(argv[0]); return false; }
    }
    return true;
}

std::string readFile(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) { std::fprintf(stderr, "ERROR: cannot read file: %s\n", path.c_str()); std::exit(2); }
    return std::string((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
}

bool verifyContract(const std::string& rawCurrent, const std::string& goldenPath) {
    const auto rawGolden = readFile(goldenPath);
    const auto goldenVar = juce::JSON::parse(rawGolden);
    const auto currentVar = juce::JSON::parse(rawCurrent);
    if (goldenVar.isVoid() || currentVar.isVoid()) { std::fprintf(stderr, "FAIL: could not parse contract JSON\n"); return false; }
    const auto goldenStr = juce::JSON::toString(goldenVar).toStdString();
    const auto currentStr = juce::JSON::toString(currentVar).toStdString();
    if (goldenStr == currentStr) { std::fprintf(stdout, "OK: DSP host lifecycle contract matches golden file\n"); return true; }
    const size_t minLen = std::min(goldenStr.size(), currentStr.size());
    size_t diffPos = 0;
    while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos]) ++diffPos;
    std::fprintf(stderr, "FAIL: DSP host lifecycle contract mismatch\n  golden: %zu bytes, current: %zu bytes\n  first diff at byte %zu\n", goldenStr.size(), currentStr.size(), diffPos);
    return false;
}

juce::var makeHostSnapshot(DSPPluginScriptHost& host) {
    auto* root = new juce::DynamicObject();
    root->setProperty("isLoaded", host.isLoaded());
    root->setProperty("lastError", juce::String(host.getLastError()));
    root->setProperty("hasGain", host.hasParam("/test/gain"));
    root->setProperty("hasMode", host.hasParam("/test/mode"));
    root->setProperty("hasLabel", host.hasParam("/test/label"));
    root->setProperty("hasNonexistent", host.hasParam("/nonexistent"));
    root->setProperty("gainValue", static_cast<double>(host.getParam("/test/gain")));
    root->setProperty("modeValue", static_cast<double>(host.getParam("/test/mode")));
    return juce::var(root);
}

// ============================================================================
// Main
// ============================================================================

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) return 1;

    juce::ScopedJuceInitialiser_GUI juceInit;
    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // Single host + mock for entire test, to avoid Lua GC during destruction
    MockDspProcessor mock;
    DSPPluginScriptHost host;
    host.initialise(&mock);

    // --- Domain 1: Pre-load state ---
    root->setProperty("d1_preLoad", makeHostSnapshot(host));

    // --- Domain 1: Load script ---
    bool loaded = host.loadScriptFromString(kTestScript, "lifecycle_test");
    root->setProperty("d1_loadResult", loaded);
    root->setProperty("d1_postLoad", makeHostSnapshot(host));

    // --- Domain 2: Param registration ---
    root->setProperty("d2_hasGain", host.hasParam("/test/gain"));
    root->setProperty("d2_hasMode", host.hasParam("/test/mode"));
    root->setProperty("d2_hasLabel", host.hasParam("/test/label"));
    root->setProperty("d2_hasNonexistent", host.hasParam("/nonexistent"));

    // --- Domain 2: Process callback ---
    host.process(512, 44100.0);
    host.process(256, 48000.0);
    root->setProperty("d2_afterProcess", host.isLoaded());

    // --- Domain 2: Reload ---
    bool reloadOk = host.reloadCurrentScript();
    root->setProperty("d2_reloadResult", reloadOk);
    root->setProperty("d2_afterReload", makeHostSnapshot(host));

    // --- Domain 3: Param set/get and clamping ---
    bool setOk = host.setParam("/test/gain", 0.75f);
    root->setProperty("d3_setWithinRange", setOk);
    root->setProperty("d3_gainSet75", static_cast<double>(host.getParam("/test/gain")));

    bool setHigh = host.setParam("/test/gain", 2.0f);
    root->setProperty("d3_setAboveMax", setHigh);
    root->setProperty("d3_gainClampedTo1", static_cast<double>(host.getParam("/test/gain")));

    bool setLow = host.setParam("/test/gain", -1.0f);
    root->setProperty("d3_setBelowMin", setLow);
    root->setProperty("d3_gainClampedTo0", static_cast<double>(host.getParam("/test/gain")));

    bool setUnknown = host.setParam("/nonexistent/param", 0.5f);
    root->setProperty("d3_setUnknown", setUnknown);

    host.setParam("/test/mode", 2.0f);
    root->setProperty("d3_modeValue", static_cast<double>(host.getParam("/test/mode")));

    // --- Domain 4: Mark unloaded ---
    host.markUnloaded();
    root->setProperty("d4_afterUnload", host.isLoaded());

    // --- Domain 4: Load from string again ---
    bool reloadStr = host.loadScriptFromString(kTestScript, "lifecycle_test");
    root->setProperty("d4_reloadFromString", reloadStr);
    root->setProperty("d4_afterReload", makeHostSnapshot(host));

    // --- Domain 4: Load from file ---
    juce::File tmpFile = juce::File::getSpecialLocation(
        juce::File::tempDirectory).getChildFile("dsp_lifecycle_test.lua");
    tmpFile.replaceWithText(kTestScript);

    host.markUnloaded();
    bool loadedFromFile = host.loadScript(tmpFile);
    root->setProperty("d4_loadFromFile", loadedFromFile);
    root->setProperty("d4_afterFileLoad", makeHostSnapshot(host));

    juce::File currentFile = host.getCurrentScriptFile();
    root->setProperty("d4_currentScriptFile",
        currentFile.existsAsFile() ? juce::String(currentFile.getFileName()) : juce::String());

    bool reloadFile = host.reloadCurrentScript();
    root->setProperty("d4_reloadFromFile", reloadFile);
    root->setProperty("d4_afterFileReload", makeHostSnapshot(host));

    tmpFile.deleteFile();

    // --- Domain 5: Process on unloaded host ---
    host.markUnloaded();
    host.process(512, 44100.0);
    root->setProperty("d5_processBeforeLoad", true);

    host.loadScriptFromString(kTestScript, "lifecycle_test");
    host.markUnloaded();
    host.process(512, 44100.0);
    root->setProperty("d5_processAfterUnload", true);

    // --- Serialize ---
    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();

    switch (opts.mode) {
        case HarnessOptions::Write: {
            std::ofstream file(opts.contractPath);
            if (!file.is_open()) { std::fprintf(stderr, "ERROR: cannot write to %s\n", opts.contractPath.c_str()); std::_Exit(2); }
            file << contract;
            file.close();
            std::fprintf(stdout, "OK: wrote DSP host lifecycle contract (%zu bytes) to %s\n", contract.size(), opts.contractPath.c_str());
            std::fflush(stdout); std::fflush(stderr); std::_Exit(0);
        }
        case HarnessOptions::Verify: {
            const bool ok = verifyContract(contract, opts.contractPath);
            std::fflush(stdout); std::fflush(stderr); std::_Exit(ok ? 0 : 1);
        }
        case HarnessOptions::Print: {
            std::fprintf(stdout, "%s", contract.c_str());
            std::fflush(stdout); std::fflush(stderr); std::_Exit(0);
        }
    }
    std::_Exit(0);
}
