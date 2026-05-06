// DSPHostLifecycleContractHarness.cpp
//
// Tests DSPPluginScriptHost lifecycle through the processor's public slot API.
// NOTE: PassthroughNode.new(numChannels) requires the channel argument —
// calling without it causes a Lua error that crashes the LoadSession destructor.
//
// CRITICAL: Must use std::_Exit(0) — processor's Lua GC crashes during
// static destruction. Same pattern as every other BehaviorCoreProcessor harness.
//
// Params registered in a named slot get bare internal paths (not under
// /core/slots/...) because mapInternalToExternal returns paths as-is when
// they don't start with /core/behavior/.

#include "../../manifold/core/BehaviorCoreProcessor.h"
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>
#include <memory>
#include <juce_core/juce_core.h>

static const char* kTestScript = R"(
function buildPlugin(ctx)
  local gain = ctx.primitives.GainNode.new(2)
  local output = ctx.primitives.PassthroughNode.new(2)
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
return buildPlugin
)";

struct HarnessOptions {
    enum Mode { Print, Write, Verify } mode = Print;
    std::string contractPath;
};

void printUsage(const char* name) {
    std::fprintf(stderr, "Usage: %s [--print-contract | --write-contract PATH | --verify-contract PATH]\n", name);
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

juce::var makeEndpointSnapshot(BehaviorCoreProcessor& processor) {
    auto* root = new juce::DynamicObject();
    root->setProperty("ep_gain", processor.hasEndpoint("/test/gain"));
    root->setProperty("ep_mode", processor.hasEndpoint("/test/mode"));
    root->setProperty("ep_nonexistent", processor.hasEndpoint("/nonexistent"));
    bool setGain = processor.setParamByPath("/test/gain", 0.75f);
    root->setProperty("setGainResult", setGain);
    root->setProperty("gainValue", static_cast<double>(processor.getParamByPath("/test/gain")));
    processor.setParamByPath("/test/gain", 2.0f);
    root->setProperty("gainClampedHigh", static_cast<double>(processor.getParamByPath("/test/gain")));
    processor.setParamByPath("/test/gain", -1.0f);
    root->setProperty("gainClampedLow", static_cast<double>(processor.getParamByPath("/test/gain")));
    bool setMode = processor.setParamByPath("/test/mode", 2.0f);
    root->setProperty("setModeResult", setMode);
    root->setProperty("modeValue", static_cast<double>(processor.getParamByPath("/test/mode")));
    return juce::var(root);
}

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) return 1;
    juce::ScopedJuceInitialiser_GUI juceInit;

    BehaviorCoreProcessor processor;
    processor.prepareToPlay(44100.0, 512);

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);
    root->setProperty("defaultSlotLoaded", processor.isDspSlotLoaded("default"));

    juce::File scriptFile = juce::File::getSpecialLocation(
        juce::File::tempDirectory).getChildFile("dsp_lifecycle_test.lua");
    scriptFile.replaceWithText(kTestScript);

    bool loaded = processor.loadDspScript(scriptFile, "test_lifecycle");
    root->setProperty("d1_loadResult", loaded);
    root->setProperty("d1_slotLoaded", processor.isDspSlotLoaded("test_lifecycle"));
    scriptFile.deleteFile();

    if (loaded) {
        root->setProperty("d2_endpoints", makeEndpointSnapshot(processor));
        scriptFile = juce::File::getSpecialLocation(
            juce::File::tempDirectory).getChildFile("dsp_lifecycle_test.lua");
        scriptFile.replaceWithText(kTestScript);
        bool reloaded = processor.reloadDspScript("test_lifecycle");
        root->setProperty("d3_reloadResult", reloaded);
        root->setProperty("d3_slotLoaded", processor.isDspSlotLoaded("test_lifecycle"));
        scriptFile.deleteFile();

        bool unloaded = processor.unloadDspSlot("test_lifecycle");
        root->setProperty("d4_unloadResult", unloaded);
        root->setProperty("d4_slotLoaded", processor.isDspSlotLoaded("test_lifecycle"));

        bool fromStr = processor.loadDspScriptFromString(kTestScript, "lifecycle_test", "test_lifecycle");
        root->setProperty("d5_loadFromStringResult", fromStr);
        root->setProperty("d5_slotLoaded", processor.isDspSlotLoaded("test_lifecycle"));
        if (fromStr) {
            root->setProperty("d5_endpoints", makeEndpointSnapshot(processor));
        }
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    switch (opts.mode) {
        case HarnessOptions::Write: {
            std::ofstream file(opts.contractPath);
            if (!file.is_open()) { std::fprintf(stderr, "ERROR\n"); std::_Exit(2); }
            file << contract;
            file.close();
            std::fprintf(stdout, "OK: wrote DSP host lifecycle contract (%zu bytes) to %s\n", contract.size(), opts.contractPath.c_str());
            break;
        }
        case HarnessOptions::Verify: {
            const bool ok = verifyContract(contract, opts.contractPath);
            std::fflush(stdout); std::fflush(stderr); std::_Exit(ok ? 0 : 1);
        }
        case HarnessOptions::Print: {
            std::fprintf(stdout, "%s\n", contract.c_str());
            break;
        }
    }
    std::fflush(stdout); std::fflush(stderr);
    std::_Exit(0);
}
