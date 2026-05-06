// DSPHostLifecycleContractHarness.cpp
//
// Contract coverage for DSPPluginScriptHost lifecycle through BehaviorCoreProcessor
// public slot API. Covers:
//   - file load + semantic reload
//   - real param binding side effects on named nodes
//   - onParamChange side effects
//   - deferred graph mutation
//   - process callback execution via processBlock()
//   - unload / string-load / failure paths
//
// CRITICAL: use std::_Exit(0) because BehaviorCoreProcessor teardown can still
// trigger Lua/sol2 cleanup crashes during static destruction.

#include "../../manifold/core/BehaviorCoreProcessor.h"
#include "../../dsp/core/nodes/FilterNode.h"
#include "../../dsp/core/nodes/GainNode.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <functional>
#include <iterator>
#include <memory>
#include <string>
#include <thread>

#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>

namespace {

static const char* kScriptV1 = R"(
function buildPlugin(ctx)
  local gain = ctx.primitives.GainNode.new(2)
  local filter = ctx.primitives.FilterNode.new(2)
  local output = ctx.primitives.PassthroughNode.new(2)

  ctx.graph.connect(gain, filter)
  ctx.graph.connect(filter, output)
  ctx.graph.nameNode(gain, "/test/mainGain")
  ctx.graph.nameNode(filter, "/test/mainFilter")

  ctx.params.register("/test/gain",   { type = "f", min = 0.0,   max = 1.0,     default = 1.0 })
  ctx.params.register("/test/mode",   { type = "f", min = 0.0,   max = 3.0,     default = 0.0 })
  ctx.params.register("/test/cutoff", { type = "f", min = 20.0,  max = 20000.0, default = 1000.0, deferGraphMutation = true })
  ctx.params.register("/test/label",  { type = "s", description = "a label parameter" })

  ctx.params.bind("/test/gain", gain, "setGain")
  ctx.params.bind("/test/cutoff", filter, "setCutoff")

  return {
    description = "lifecycle test script v1",
    process = function(blockSize, sampleRate)
      gain:setGain(0.33)
    end,
    onParamChange = function(path, value)
      if path == "/test/mode" then
        filter:setResonance(0.5 + value * 0.1)
      end
    end,
  }
end
return buildPlugin
)";

static const char* kScriptV2 = R"(
function buildPlugin(ctx)
  local gain = ctx.primitives.GainNode.new(2)
  local filter = ctx.primitives.FilterNode.new(2)
  local output = ctx.primitives.PassthroughNode.new(2)

  ctx.graph.connect(gain, filter)
  ctx.graph.connect(filter, output)
  ctx.graph.nameNode(gain, "/test/mainGain")
  ctx.graph.nameNode(filter, "/test/mainFilter")

  ctx.params.register("/test/gain",   { type = "f", min = 0.0,   max = 1.0,     default = 0.8 })
  ctx.params.register("/test/mode",   { type = "f", min = 0.0,   max = 3.0,     default = 2.0 })
  ctx.params.register("/test/cutoff", { type = "f", min = 20.0,  max = 20000.0, default = 5000.0, deferGraphMutation = true })
  ctx.params.register("/test/label",  { type = "s", description = "a label parameter v2" })

  ctx.params.bind("/test/gain", gain, "setGain")
  ctx.params.bind("/test/cutoff", filter, "setCutoff")

  return {
    description = "lifecycle test script v2",
    process = function(blockSize, sampleRate)
      gain:setGain(0.88)
    end,
    onParamChange = function(path, value)
      if path == "/test/mode" then
        filter:setResonance(0.1 + value * 0.2)
      end
    end,
  }
end
return buildPlugin
)";

static const char* kStringScript = R"(
function buildPlugin(ctx)
  local gain = ctx.primitives.GainNode.new(2)
  local output = ctx.primitives.PassthroughNode.new(2)
  ctx.graph.connect(gain, output)
  ctx.graph.nameNode(gain, "/test/mainGain")
  ctx.params.register("/test/gain", { type = "f", min = 0.0, max = 1.0, default = 0.6 })
  ctx.params.bind("/test/gain", gain, "setGain")
  return {
    description = "string-load lifecycle script",
    process = function(blockSize, sampleRate)
      gain:setGain(0.44)
    end,
  }
end
return buildPlugin
)";

static const char* kBadMissingBuildPlugin = R"(
return 42
)";

static const char* kBadReturnType = R"(
function buildPlugin(ctx)
  return 42
end
return buildPlugin
)";

static const char* kBadSyntax = R"(
function buildPlugin(ctx)
  local gain = ctx.primitives.GainNode.new(2)
  return {
    description = "bad syntax"
  -- missing end
)";

struct HarnessOptions {
  enum Mode { Print, Write, Verify, ProbeFailure } mode = Print;
  std::string contractPath;
  std::string probeFailureKind;
  std::string probeErrorPath;
};

void printUsage(const char* name) {
  std::fprintf(stderr,
               "Usage: %s [--print-contract | --write-contract PATH | --verify-contract PATH]\n",
               name);
}

bool parseOptions(int argc, char* argv[], HarnessOptions& out) {
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
    } else if (arg == "--probe-failure" && i + 1 < argc) {
      out.mode = HarnessOptions::ProbeFailure;
      out.probeFailureKind = argv[++i];
    } else if (arg == "--probe-error-path" && i + 1 < argc) {
      out.probeErrorPath = argv[++i];
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

std::string readFile(const std::string& path) {
  std::ifstream file(path);
  if (!file.is_open()) {
    std::fprintf(stderr, "ERROR: cannot read file: %s\n", path.c_str());
    std::exit(2);
  }
  return std::string((std::istreambuf_iterator<char>(file)),
                     std::istreambuf_iterator<char>());
}

bool verifyContract(const std::string& rawCurrent, const std::string& goldenPath) {
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
    std::fprintf(stdout, "OK: DSP host lifecycle contract matches golden file\n");
    return true;
  }
  const size_t minLen = std::min(goldenStr.size(), currentStr.size());
  size_t diffPos = 0;
  while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos]) {
    ++diffPos;
  }
  std::fprintf(stderr,
               "FAIL: DSP host lifecycle contract mismatch\n  golden: %zu bytes, current: %zu bytes\n  first diff at byte %zu\n",
               goldenStr.size(), currentStr.size(), diffPos);
  return false;
}

std::shared_ptr<dsp_primitives::GainNode> getGainNode(BehaviorCoreProcessor& processor) {
  auto node = processor.getGraphNodeByPath("/test/mainGain");
  return std::dynamic_pointer_cast<dsp_primitives::GainNode>(node);
}

std::shared_ptr<dsp_primitives::FilterNode> getFilterNode(BehaviorCoreProcessor& processor) {
  auto node = processor.getGraphNodeByPath("/test/mainFilter");
  return std::dynamic_pointer_cast<dsp_primitives::FilterNode>(node);
}

bool waitFor(const std::function<bool()>& predicate,
             int maxAttempts = 100,
             int sleepMs = 10) {
  for (int i = 0; i < maxAttempts; ++i) {
    if (predicate()) {
      return true;
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(sleepMs));
  }
  return false;
}

void runProcessCallback(BehaviorCoreProcessor& processor, int numSamples = 64) {
  juce::AudioBuffer<float> buffer(2, numSamples);
  buffer.clear();
  juce::MidiBuffer midi;
  processor.processBlock(buffer, midi);
}

juce::var captureNodeSnapshot(BehaviorCoreProcessor& processor) {
  auto* obj = new juce::DynamicObject();
  auto gain = getGainNode(processor);
  auto filter = getFilterNode(processor);
  obj->setProperty("gainNodeFound", gain != nullptr);
  obj->setProperty("filterNodeFound", filter != nullptr);
  if (gain) {
    obj->setProperty("gain", static_cast<double>(gain->getGain()));
    obj->setProperty("muted", gain->isMuted());
  }
  if (filter) {
    obj->setProperty("cutoff", static_cast<double>(filter->getCutoff()));
    obj->setProperty("resonance", static_cast<double>(filter->getResonance()));
    obj->setProperty("mix", static_cast<double>(filter->getMix()));
  }
  return juce::var(obj);
}

juce::var makeEndpointSnapshot(BehaviorCoreProcessor& processor, bool includeDeferred) {
  auto* root = new juce::DynamicObject();
  root->setProperty("ep_gain", processor.hasEndpoint("/test/gain"));
  root->setProperty("ep_mode", processor.hasEndpoint("/test/mode"));
  root->setProperty("ep_cutoff", processor.hasEndpoint("/test/cutoff"));
  root->setProperty("ep_nonexistent", processor.hasEndpoint("/nonexistent"));

  auto gain = getGainNode(processor);
  auto filter = getFilterNode(processor);

  root->setProperty("initialNodeState", captureNodeSnapshot(processor));

  bool setGain = processor.setParamByPath("/test/gain", 0.75f);
  root->setProperty("setGainResult", setGain);
  root->setProperty("gainValue", static_cast<double>(processor.getParamByPath("/test/gain")));
  root->setProperty("gainNodeAfterSet", gain ? static_cast<double>(gain->getGain()) : -1.0);

  processor.setParamByPath("/test/gain", 2.0f);
  root->setProperty("gainClampedHigh", static_cast<double>(processor.getParamByPath("/test/gain")));
  root->setProperty("gainNodeClampedHigh", gain ? static_cast<double>(gain->getGain()) : -1.0);

  processor.setParamByPath("/test/gain", -1.0f);
  root->setProperty("gainClampedLow", static_cast<double>(processor.getParamByPath("/test/gain")));
  root->setProperty("gainNodeClampedLow", gain ? static_cast<double>(gain->getGain()) : -1.0);

  bool setMode = processor.setParamByPath("/test/mode", 2.0f);
  root->setProperty("setModeResult", setMode);
  root->setProperty("modeValue", static_cast<double>(processor.getParamByPath("/test/mode")));
  root->setProperty("filterResonanceAfterMode", filter ? static_cast<double>(filter->getResonance()) : -1.0);

  if (includeDeferred) {
    bool setCutoff = processor.setParamByPath("/test/cutoff", 4000.0f);
    root->setProperty("setCutoffDeferredResult", setCutoff);
    root->setProperty("cutoffStoredValue", static_cast<double>(processor.getParamByPath("/test/cutoff")));
    const bool cutoffApplied = waitFor([&]() {
      auto f = getFilterNode(processor);
      return f && std::abs(f->getCutoff() - 4000.0f) < 0.01f;
    });
    root->setProperty("cutoffDeferredApplied", cutoffApplied);
    auto refreshed = getFilterNode(processor);
    root->setProperty("cutoffNodeAfterDeferred", refreshed ? static_cast<double>(refreshed->getCutoff()) : -1.0);
  }

  return juce::var(root);
}

juce::var makeFailureSnapshot(bool result, const std::string& error, bool slotLoaded) {
  auto* obj = new juce::DynamicObject();
  obj->setProperty("result", result);
  obj->setProperty("error", juce::String(error));
  obj->setProperty("slotLoaded", slotLoaded);
  return juce::var(obj);
}

juce::String currentExecutablePath() {
  char buffer[4096]{};
  const ssize_t len = ::readlink("/proc/self/exe", buffer, sizeof(buffer) - 1);
  if (len <= 0) {
    return {};
  }
  buffer[len] = '\0';
  return juce::String(buffer);
}

juce::var probeFailureCase(const std::string& kind) {
  auto* obj = new juce::DynamicObject();
  const juce::File errFile = juce::File::getSpecialLocation(juce::File::tempDirectory)
                                 .getNonexistentChildFile("dsp_host_failure_probe", ".txt", false);
  const juce::String exe = currentExecutablePath();
  if (exe.isEmpty()) {
    obj->setProperty("spawned", false);
    obj->setProperty("error", "missing /proc/self/exe");
    return juce::var(obj);
  }

  pid_t pid = ::fork();
  if (pid == 0) {
    execl(exe.toRawUTF8(),
          exe.toRawUTF8(),
          "--probe-failure",
          kind.c_str(),
          "--probe-error-path",
          errFile.getFullPathName().toRawUTF8(),
          static_cast<char*>(nullptr));
    std::_Exit(127);
  }

  int status = 0;
  ::waitpid(pid, &status, 0);
  obj->setProperty("spawned", true);
  obj->setProperty("exitCode", WIFEXITED(status) ? WEXITSTATUS(status) : -1);
  obj->setProperty("signaled", WIFSIGNALED(status));
  obj->setProperty("signal", WIFSIGNALED(status) ? WTERMSIG(status) : 0);
  obj->setProperty("errorFileExists", errFile.existsAsFile());
  if (errFile.existsAsFile()) {
    obj->setProperty("error", errFile.loadFileAsString());
    errFile.deleteFile();
  }
  return juce::var(obj);
}

int runFailureProbe(const HarnessOptions& opts) {
  juce::ScopedJuceInitialiser_GUI juceInit;
  BehaviorCoreProcessor processor;
  processor.prepareToPlay(44100.0, 512);

  bool result = false;
  if (opts.probeFailureKind == "missing_build") {
    result = processor.loadDspScriptFromString(kBadMissingBuildPlugin, "bad_missing_build", "test_bad");
  } else if (opts.probeFailureKind == "bad_return") {
    result = processor.loadDspScriptFromString(kBadReturnType, "bad_return_type", "test_bad");
  } else if (opts.probeFailureKind == "bad_syntax") {
    result = processor.loadDspScriptFromString(kBadSyntax, "bad_syntax", "test_bad");
  } else {
    return 125;
  }

  if (!opts.probeErrorPath.empty()) {
    juce::File(opts.probeErrorPath).replaceWithText(juce::String(result ? "LOAD_SUCCEEDED" : processor.getDspScriptLastError()));
  }
  std::_Exit(result ? 2 : 0);
}

} // namespace

int main(int argc, char* argv[]) {
  HarnessOptions opts;
  if (!parseOptions(argc, argv, opts)) {
    return 1;
  }

  if (opts.mode == HarnessOptions::ProbeFailure) {
    return runFailureProbe(opts);
  }

  juce::ScopedJuceInitialiser_GUI juceInit;
  BehaviorCoreProcessor processor;
  processor.prepareToPlay(44100.0, 512);

  auto* root = new juce::DynamicObject();
  root->setProperty("contractVersion", 2);
  root->setProperty("defaultSlotLoaded", processor.isDspSlotLoaded("default"));

  juce::File scriptFile = juce::File::getSpecialLocation(juce::File::tempDirectory)
                              .getChildFile("dsp_lifecycle_test.lua");

  // Domain 1: file load + default node state
  scriptFile.replaceWithText(kScriptV1);
  bool loaded = processor.loadDspScript(scriptFile, "test_lifecycle");
  root->setProperty("d1_loadResult", loaded);
  root->setProperty("d1_slotLoaded", processor.isDspSlotLoaded("test_lifecycle"));
  root->setProperty("d1_lastError", juce::String(processor.getDspScriptLastError()));
  if (loaded) {
    root->setProperty("d1_nodeState", captureNodeSnapshot(processor));
    root->setProperty("d1_modeDefault", static_cast<double>(processor.getParamByPath("/test/mode")));
    root->setProperty("d1_cutoffDefault", static_cast<double>(processor.getParamByPath("/test/cutoff")));
  }

  // Domain 2: endpoint plumbing + real bind side effects + onParamChange + deferred mutation
  if (loaded) {
    root->setProperty("d2_endpoints", makeEndpointSnapshot(processor, true));
  }

  // Domain 3: process callback via processBlock
  if (loaded) {
    processor.setParamByPath("/test/gain", 0.10f);
    root->setProperty("d3_gainBeforeProcess", captureNodeSnapshot(processor));
    runProcessCallback(processor);
    root->setProperty("d3_gainAfterProcess", captureNodeSnapshot(processor));
  }

  // Domain 4: semantic reload from changed file contents
  if (loaded) {
    // Ensure filesystem mtime definitely changes for reload semantics.
    std::this_thread::sleep_for(std::chrono::milliseconds(1100));
    scriptFile.replaceWithText(kScriptV2);
    bool reloaded = processor.reloadDspScript("test_lifecycle");
    root->setProperty("d4_reloadResult", reloaded);
    root->setProperty("d4_slotLoaded", processor.isDspSlotLoaded("test_lifecycle"));
    root->setProperty("d4_lastError", juce::String(processor.getDspScriptLastError()));
    if (reloaded) {
      root->setProperty("d4_nodeState", captureNodeSnapshot(processor));
      root->setProperty("d4_modeDefault", static_cast<double>(processor.getParamByPath("/test/mode")));
      root->setProperty("d4_cutoffDefault", static_cast<double>(processor.getParamByPath("/test/cutoff")));
      runProcessCallback(processor);
      root->setProperty("d4_afterProcess", captureNodeSnapshot(processor));
    }
  }

  // Domain 5: unload + string load
  if (processor.isDspSlotLoaded("test_lifecycle")) {
    bool unloaded = processor.unloadDspSlot("test_lifecycle");
    root->setProperty("d5_unloadResult", unloaded);
    root->setProperty("d5_slotLoadedAfterUnload", processor.isDspSlotLoaded("test_lifecycle"));
  }

  bool fromStr = processor.loadDspScriptFromString(kStringScript, "lifecycle_test", "test_lifecycle");
  root->setProperty("d5_loadFromStringResult", fromStr);
  root->setProperty("d5_slotLoadedAfterStringLoad", processor.isDspSlotLoaded("test_lifecycle"));
  root->setProperty("d5_lastError", juce::String(processor.getDspScriptLastError()));
  if (fromStr) {
    root->setProperty("d5_nodeState", captureNodeSnapshot(processor));
    runProcessCallback(processor);
    root->setProperty("d5_afterProcess", captureNodeSnapshot(processor));
  }

  // Domain 6: failure paths isolated in subprocess probes so the parent
  // contract harness survives even if production failure cleanup segfaults.
  root->setProperty("d6_missingBuildPlugin", probeFailureCase("missing_build"));
  root->setProperty("d6_badReturnType", probeFailureCase("bad_return"));
  root->setProperty("d6_badSyntax", probeFailureCase("bad_syntax"));
  root->setProperty("d6_workingSlotStillLoaded", processor.isDspSlotLoaded("test_lifecycle"));
  root->setProperty("d6_workingSlotNodeState", captureNodeSnapshot(processor));

  scriptFile.deleteFile();

  const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
  switch (opts.mode) {
    case HarnessOptions::Write: {
      std::ofstream file(opts.contractPath);
      if (!file.is_open()) {
        std::fprintf(stderr, "ERROR: cannot write to %s\n", opts.contractPath.c_str());
        std::_Exit(2);
      }
      file << contract;
      file.close();
      std::fprintf(stdout,
                   "OK: wrote DSP host lifecycle contract (%zu bytes) to %s\n",
                   contract.size(), opts.contractPath.c_str());
      std::fflush(stdout);
      std::fflush(stderr);
      std::_Exit(0);
    }
    case HarnessOptions::Verify: {
      const bool ok = verifyContract(contract, opts.contractPath);
      std::fflush(stdout);
      std::fflush(stderr);
      std::_Exit(ok ? 0 : 1);
    }
    case HarnessOptions::Print: {
      std::fprintf(stdout, "%s\n", contract.c_str());
      std::fflush(stdout);
      std::fflush(stderr);
      std::_Exit(0);
    }
  }

  std::_Exit(0);
}
