#include "../primitives/scripting/LuaEngine.h"
#include "../primitives/scripting/ScriptableProcessor.h"
#include "../primitives/control/OSCEndpointRegistry.h"
#include "../primitives/control/OSCQuery.h"
#include "../primitives/control/OSCServer.h"
#include "../primitives/control/ControlServer.h"
#include "../primitives/control/CommandParser.h"
#include "../primitives/dsp/CaptureBuffer.h"
#include "../engine/ManifoldLayer.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

class MockScriptableProcessor : public ScriptableProcessor {
public:
  MockScriptableProcessor() {
    capture.setSize(512);
    capture.setNumChannels(2);
    for (int i = 0; i < capture.getSize(); ++i) {
      const float sample = 0.1f;
      capture.write(sample, 0);
      capture.write(sample, 1);
    }
    endpointRegistry.setNumLayers(4);
    endpointRegistry.rebuild();
  }

  bool postControlCommandPayload(const ControlCommand& command) override {
    commands.push_back(command);
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

  ControlServer& getControlServer() override { return controlServer; }
  OSCServer& getOSCServer() override { return oscServer; }
  OSCEndpointRegistry& getEndpointRegistry() override { return endpointRegistry; }
  OSCQueryServer& getOSCQueryServer() override { return oscQueryServer; }

  bool setParamByPath(const std::string& path, float value) override {
    values[path] = value;
    return true;
  }
  float getParamByPath(const std::string& path) const override {
    auto it = values.find(path);
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
    out.index = index;
    out.length = 128;
    out.position = 0;
    out.speed = 1.0f;
    out.reversed = false;
    out.volume = 1.0f;
    out.state = ScriptableLayerState::Stopped;
    return true;
  }
  int getCaptureSize() const override { return capture.getSize(); }
  bool computeLayerPeaks(int layerIndex, int numBuckets, std::vector<float>& outPeaks) const override {
    if (layerIndex < 0 || layerIndex >= getNumLayers() || numBuckets <= 0) {
      return false;
    }
    outPeaks.assign(static_cast<size_t>(numBuckets), 0.5f);
    return true;
  }
  bool computeCapturePeaks(int startAgo, int endAgo, int numBuckets, std::vector<float>& outPeaks) const override {
    if (startAgo < 0 || endAgo <= startAgo || numBuckets <= 0) {
      return false;
    }
    outPeaks.assign(static_cast<size_t>(numBuckets), 0.25f);
    return true;
  }

  float getTempo() const override { return 120.0f; }
  float getTargetBPM() const override { return 120.0f; }
  float getSamplesPerBar() const override { return 88200.0f; }
  double getSampleRate() const override { return 44100.0; }
  double getPlayTimeSamples() const override { return 0.0; }
  float getMasterVolume() const override { return 1.0f; }
  float getInputVolume() const override { return 1.0f; }
  bool isPassthroughEnabled() const override { return true; }
  bool isRecording() const override { return false; }
  bool isOverdubEnabled() const override { return false; }
  int getActiveLayerIndex() const override { return 0; }
  bool isForwardCommitArmed() const override { return false; }
  float getForwardCommitBars() const override { return 0.0f; }
  int getRecordModeIndex() const override { return 0; }
  int getCommitCount() const override { return 0; }
  std::array<float, 32> getSpectrumData() const override { return {}; }

private:
  OSCServer oscServer;
  ControlServer controlServer;
  OSCEndpointRegistry endpointRegistry;
  OSCQueryServer oscQueryServer;
  CaptureBuffer capture;
  std::unordered_map<std::string, float> values;
  std::vector<ControlCommand> commands;
};

static const char* kUiScriptV1 = R"(
TEST_VERSION = 1
UPDATE_COUNT = 0
function ui_init(root)
  local child = root:addChild("contractRoot")
  child:setUserData("version", TEST_VERSION)
end
function ui_update(state)
  UPDATE_COUNT = UPDATE_COUNT + 1
end
)";

static const char* kUiScriptV2 = R"(
TEST_VERSION = 2
UPDATE_COUNT = 0
function ui_init(root)
  local child = root:addChild("contractRoot")
  child:setUserData("version", TEST_VERSION)
end
function ui_update(state)
  UPDATE_COUNT = UPDATE_COUNT + 1
end
)";

static const char* kUiScriptV3 = R"(
TEST_VERSION = 3
UPDATE_COUNT = 0
function ui_init(root)
  local child = root:addChild("contractRoot")
  child:setUserData("version", TEST_VERSION)
end
function ui_update(state)
  UPDATE_COUNT = UPDATE_COUNT + 1
end
)";

struct HarnessOptions {
  enum Mode { Print, Write, Verify } mode = Print;
  std::string contractPath;
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
    std::fprintf(stdout, "OK: LuaEngine contract matches golden file\n");
    return true;
  }
  const size_t minLen = std::min(goldenStr.size(), currentStr.size());
  size_t diffPos = 0;
  while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos]) {
    ++diffPos;
  }
  std::fprintf(stderr,
               "FAIL: LuaEngine contract mismatch\n  golden: %zu bytes, current: %zu bytes\n  first diff at byte %zu\n",
               goldenStr.size(), currentStr.size(), diffPos);
  return false;
}

juce::var evalRequestToVar(const std::shared_ptr<LuaEngine::EvalRequest>& request) {
  auto* obj = new juce::DynamicObject();
  obj->setProperty("completed", request->completed.load(std::memory_order_acquire));
  {
    std::lock_guard<std::mutex> lock(request->resultMutex);
    obj->setProperty("isError", request->isError);
    obj->setProperty("result", juce::String(request->result));
  }
  return juce::var(obj);
}

void pumpUpdates(LuaEngine& engine, int count) {
  for (int i = 0; i < count; ++i) {
    engine.notifyUpdate();
  }
}

std::shared_ptr<LuaEngine::EvalRequest> runEval(LuaEngine& engine, const std::string& code) {
  auto request = engine.queueEval(code);
  for (int i = 0; i < 10; ++i) {
    if (request->completed.load(std::memory_order_acquire)) {
      break;
    }
    engine.notifyUpdate();
  }
  return request;
}

} // namespace

int main(int argc, char* argv[]) {
  HarnessOptions opts;
  if (!parseOptions(argc, argv, opts)) {
    return 1;
  }

  juce::ScopedJuceInitialiser_GUI juceInit;
  MockScriptableProcessor processor;
  Canvas rootCanvas("root");
  LuaEngine engine;
  engine.initialise(&processor, &rootCanvas);

  auto* root = new juce::DynamicObject();
  root->setProperty("contractVersion", 1);
  root->setProperty("isInitialized", engine.isInitialized());

  juce::File scriptFile = juce::File::getSpecialLocation(juce::File::tempDirectory)
                              .getChildFile("lua_engine_contract.lua");

  // Domain 1: load + basic script state
  scriptFile.replaceWithText(kUiScriptV1);
  bool loaded = engine.loadScript(scriptFile);
  root->setProperty("d1_loadResult", loaded);
  root->setProperty("d1_scriptLoaded", engine.isScriptLoaded());
  root->setProperty("d1_lastError", juce::String(engine.getLastError()));
  root->setProperty("d1_currentScript", engine.getCurrentScriptFile().getFullPathName());
  pumpUpdates(engine, 2);
  root->setProperty("d1_evalVersion", evalRequestToVar(runEval(engine, "return TEST_VERSION")));
  root->setProperty("d1_evalUpdateCount", evalRequestToVar(runEval(engine, "return UPDATE_COUNT")));

  // Domain 2: eval success + eval error
  root->setProperty("d2_evalFive", evalRequestToVar(runEval(engine, "return 2 + 3")));
  root->setProperty("d2_evalError", evalRequestToVar(runEval(engine, "error('boom')")));

  // Domain 3: hot reload by file modification + notifyUpdate polling
  std::this_thread::sleep_for(std::chrono::milliseconds(1100));
  scriptFile.replaceWithText(kUiScriptV2);
  pumpUpdates(engine, 30); // set pending switch
  pumpUpdates(engine, 1);  // perform switch
  pumpUpdates(engine, 1);  // allow new script one update tick
  root->setProperty("d3_scriptLoadedAfterHotReload", engine.isScriptLoaded());
  root->setProperty("d3_lastError", juce::String(engine.getLastError()));
  root->setProperty("d3_evalVersion", evalRequestToVar(runEval(engine, "return TEST_VERSION")));
  root->setProperty("d3_evalUpdateCount", evalRequestToVar(runEval(engine, "return UPDATE_COUNT")));

  // Domain 4: explicit reloadCurrentScript with changed contents
  std::this_thread::sleep_for(std::chrono::milliseconds(1100));
  scriptFile.replaceWithText(kUiScriptV3);
  bool explicitReload = engine.reloadCurrentScript();
  root->setProperty("d4_reloadResult", explicitReload);
  root->setProperty("d4_scriptLoaded", engine.isScriptLoaded());
  root->setProperty("d4_lastError", juce::String(engine.getLastError()));
  pumpUpdates(engine, 1);
  root->setProperty("d4_evalVersion", evalRequestToVar(runEval(engine, "return TEST_VERSION")));

  // Domain 5: missing file failure
  juce::File missing = juce::File::getSpecialLocation(juce::File::tempDirectory)
                           .getChildFile("lua_engine_contract_missing.lua");
  missing.deleteFile();
  bool missingLoad = engine.loadScript(missing);
  auto* missingObj = new juce::DynamicObject();
  missingObj->setProperty("result", missingLoad);
  missingObj->setProperty("lastError", juce::String(engine.getLastError()));
  root->setProperty("d5_missingFile", juce::var(missingObj));

  scriptFile.deleteFile();
  engine.clearAttachedUiLuaState();

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
      std::fprintf(stdout, "OK: wrote LuaEngine contract (%zu bytes) to %s\n",
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
