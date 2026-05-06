#define SOL_ALL_SAFETIES_ON 1

#include "../primitives/scripting/LuaEngine.h"
#include "../primitives/scripting/ScriptableProcessor.h"
#include "../primitives/scripting/core/LuaCoreEngine.h"
#include "../primitives/control/OSCEndpointRegistry.h"
#include "../primitives/control/OSCQuery.h"
#include "../primitives/control/OSCServer.h"
#include "../primitives/control/ControlServer.h"
#include "../primitives/control/EndpointResolver.h"
#include "../primitives/control/CommandParser.h"
#include "../primitives/dsp/CaptureBuffer.h"
#include "../engine/ManifoldLayer.h"
#include "../primitives/ui/Canvas.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>

#include <cstdio>
#include <string>
#include <unordered_map>
#include <vector>

// ============================================================================
// MockScriptableProcessor — captures all side effects for contract verification
// ============================================================================

class MockScriptableProcessor : public ScriptableProcessor {
public:
  MockScriptableProcessor() {
    capture.setSize(512);
    capture.setNumChannels(2);
    for (int i = 0; i < capture.getSize(); ++i) {
      float sample = std::sin(2.0f * 3.14159265f * (float)i / 32.0f) * 0.25f;
      capture.write(sample, 0);
      capture.write(sample, 1);
    }
    for (int i = 0; i < getNumLayers(); ++i) {
      layers[(size_t)i].copyFromCapture(capture, 0, 128, false);
      layers[(size_t)i].setVolume(1.0f);
      layers[(size_t)i].setSpeed(1.0f);
      layers[(size_t)i].setReversed(false);
    }
    endpointRegistry.setNumLayers(4);
    endpointRegistry.rebuild();
  }

  // ---- Control command side effects ----
  bool postControlCommandPayload(const ControlCommand& command) override {
    commands.push_back(command);
    if (command.type == ControlCommand::Type::SetTempo) tempo = command.floatParam;
    if (command.type == ControlCommand::Type::SetTargetBPM) targetBPM = command.floatParam;
    if (command.type == ControlCommand::Type::SetMasterVolume) masterVolume = command.floatParam;
    if (command.type == ControlCommand::Type::SetInputVolume) inputVolume = command.floatParam;
    if (command.type == ControlCommand::Type::SetPassthroughEnabled) passthroughEnabled = (command.intParam != 0);
    if (command.type == ControlCommand::Type::SetActiveLayer) activeLayer = command.intParam;
    if (command.type == ControlCommand::Type::SetRecordMode) recordModeIndex = command.intParam;
    if (command.type == ControlCommand::Type::StartRecording) isRecordingFlag = true;
    if (command.type == ControlCommand::Type::StopRecording) isRecordingFlag = false;
    if (command.type == ControlCommand::Type::SetOverdubEnabled) overdubEnabled = (command.intParam != 0);
    if (command.type == ControlCommand::Type::ForwardCommit) forwardArmed = true;
    if (command.type == ControlCommand::Type::GlobalPlay) transportPlaying = true;
    if (command.type == ControlCommand::Type::GlobalPause) transportPlaying = false;
    if (command.type == ControlCommand::Type::GlobalStop) transportPlaying = false;
    if (command.type == ControlCommand::Type::LayerSeek) lastSeekLayer = command.intParam;
    if (command.type == ControlCommand::Type::Commit) commitCount++;
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

  // ---- Server accessors ----
  ControlServer& getControlServer() override { return controlServer; }
  OSCServer& getOSCServer() override { return oscServer; }
  OSCEndpointRegistry& getEndpointRegistry() override { return endpointRegistry; }
  OSCQueryServer& getOSCQueryServer() override { return oscQueryServer; }

  // ---- DSP script operations ----
  bool loadDspScript(const juce::File&, const std::string& slot) override {
    dspScriptLastError.clear();
    if (slot == "default") {
      dspLastErrorCode = "no_default_dsp";
      return false;
    }
    loadedDspSlots.insert(slot);
    return true;
  }

  bool loadDspScriptFromString(const std::string& code, const std::string& sourceName,
                                const std::string& slot) override {
    dspScriptLastError.clear();
    if (code.find("function buildPlugin") == std::string::npos) {
      dspLastErrorCode = "invalid_dsp_script";
      return false;
    }
    loadedDspSlots.insert(slot.empty() ? "default" : slot);
    return true;
  }

  bool reloadDspScript() override { return false; }
  bool reloadDspScript(const std::string&) override { return false; }
  bool unloadDspSlot(const std::string& slot) override {
    loadedDspSlots.erase(slot);
    return true;
  }
  bool isDspScriptLoaded() const override {
    return !dspScriptLastError.empty() || loadedDspSlots.find("default") != loadedDspSlots.end();
  }
  bool isDspSlotLoaded(const std::string& slot) const override {
    return loadedDspSlots.find(slot) != loadedDspSlots.end();
  }
  const std::string& getDspScriptLastError() const override { return dspScriptLastError; }

  // ---- Graph ----
  std::shared_ptr<dsp_primitives::PrimitiveGraph> getPrimitiveGraph() override {
    if (!primitiveGraph) {
      primitiveGraph = std::make_shared<dsp_primitives::PrimitiveGraph>();
    }
    return primitiveGraph;
  }

  // ---- Generic param access - direct internal dispatch, matches getParamByPath ----
  bool setParamByPath(const std::string& path, float value) override {
    if (path == "/looper/tempo") { tempo = value; return true; }
    if (path == "/looper/targetbpm") { targetBPM = value; return true; }
    if (path == "/looper/volume") { masterVolume = value; return true; }
    if (path == "/looper/inputVolume") { inputVolume = value; return true; }
    if (path == "/looper/passthrough") { passthroughEnabled = (value != 0.0f); return true; }
    if (path == "/looper/recording") { isRecordingFlag = (value != 0.0f); return true; }
    if (path == "/looper/overdub") { overdubEnabled = (value != 0.0f); return true; }
    if (path == "/looper/layer") { activeLayer = static_cast<int>(value); return true; }
    if (path == "/looper/forwardArmed") { forwardArmed = (value != 0.0f); return true; }
    if (path == "/looper/forwardBars") { forwardBars = value; return true; }
    if (path == "/looper/mode") { recordModeIndex = static_cast<int>(value); return true; }
    return false;
  }

  float getParamByPath(const std::string& path) const override {
    if (path == "/looper/tempo") return tempo;
    if (path == "/looper/targetbpm") return targetBPM;
    if (path == "/looper/volume") return masterVolume;
    if (path == "/looper/inputVolume") return inputVolume;
    if (path == "/looper/passthrough") return passthroughEnabled ? 1.0f : 0.0f;
    if (path == "/looper/recording") return isRecordingFlag ? 1.0f : 0.0f;
    if (path == "/looper/overdub") return overdubEnabled ? 1.0f : 0.0f;
    if (path == "/looper/layer") return static_cast<float>(activeLayer);
    if (path == "/looper/forwardArmed") return forwardArmed ? 1.0f : 0.0f;
    if (path == "/looper/forwardBars") return forwardBars;
    if (path == "/looper/samplesPerBar") return samplesPerBar;
    if (path == "/looper/sampleRate") return static_cast<float>(sampleRate);
    if (path == "/looper/captureSize") return static_cast<float>(capture.getSize());
    if (path == "/looper/mode") return static_cast<float>(recordModeIndex);
    if (path == "/looper/commitCount") return static_cast<float>(commitCount);
    if (path.find("/looper/layer/") == 0) {
      int layerIdx = -1;
      if (sscanf(path.c_str(), "/looper/layer/%d/", &layerIdx) == 1 && layerIdx >= 0 && layerIdx < getNumLayers()) {
        size_t slashPos = path.find('/', 14);
        if (slashPos != std::string::npos) {
          std::string rest = path.substr(slashPos + 1);
          const auto& layer = layers[(size_t)layerIdx];
          if (rest == "speed") return layer.getSpeed();
          if (rest == "volume") return layer.getVolume();
          if (rest == "reverse") return layer.isReversed() ? 1.0f : 0.0f;
          if (rest == "length") return static_cast<float>(layer.getLength());
          if (rest == "position") {
            int len = layer.getLength();
            return (len > 0) ? static_cast<float>(layer.getPosition()) / static_cast<float>(len) : 0.0f;
          }
        }
      }
    }
    return 0.0f;
  }

  bool hasEndpoint(const std::string& path) const override {
    if (path == "/looper/tempo") return true;
    if (path == "/looper/targetbpm") return true;
    if (path == "/looper/volume") return true;
    if (path == "/looper/inputVolume") return true;
    if (path == "/looper/passthrough") return true;
    if (path == "/looper/recording") return true;
    if (path == "/looper/overdub") return true;
    if (path == "/looper/layer") return true;
    if (path == "/looper/forwardArmed") return true;
    if (path == "/looper/forwardBars") return true;
    if (path == "/looper/samplesPerBar") return true;
    if (path == "/looper/sampleRate") return true;
    if (path == "/looper/captureSize") return true;
    if (path == "/looper/mode") return true;
    if (path == "/looper/commitCount") return true;
    if (path.find("/looper/layer/") == 0) return true;
    // Fallback to endpoint registry for custom OSC endpoints
    OSCEndpoint endpoint = endpointRegistry.findEndpoint(juce::String(path));
    return endpoint.path.isNotEmpty();
  }

  // ---- Layer / state queries ----
  int getNumLayers() const override { return 4; }
  bool getLayerSnapshot(int index, ScriptableLayerSnapshot& out) const override {
    if (index < 0 || index >= getNumLayers()) return false;
    const auto& layer = layers[(size_t)index];
    out.index = index;
    out.length = layer.getLength();
    out.position = layer.getPosition();
    out.speed = layer.getSpeed();
    out.reversed = layer.isReversed();
    out.volume = layer.getVolume();
    out.state = static_cast<ScriptableLayerState>(layer.getState());
    return true;
  }
  int getCaptureSize() const override { return capture.getSize(); }

  bool computeLayerPeaks(int layerIndex, int numBuckets, std::vector<float>& outPeaks) const override {
    outPeaks.clear();
    if (layerIndex < 0 || layerIndex >= getNumLayers() || numBuckets <= 0) return false;
    outPeaks.assign((size_t)numBuckets, 0.5f);
    return true;
  }
  bool computeCapturePeaks(int startAgo, int endAgo, int numBuckets, std::vector<float>& outPeaks) const override {
    outPeaks.clear();
    if (numBuckets <= 0 || endAgo <= startAgo) return false;
    outPeaks.assign((size_t)numBuckets, 0.25f);
    return true;
  }

  float getTempo() const override { return tempo; }
  float getTargetBPM() const override { return targetBPM; }
  float getSamplesPerBar() const override { return samplesPerBar; }
  double getSampleRate() const override { return sampleRate; }
  double getPlayTimeSamples() const override { return 0.0; }
  float getMasterVolume() const override { return masterVolume; }
  float getInputVolume() const override { return inputVolume; }
  bool isPassthroughEnabled() const override { return passthroughEnabled; }
  bool isRecording() const override { return isRecordingFlag; }
  bool isOverdubEnabled() const override { return overdubEnabled; }
  int getActiveLayerIndex() const override { return activeLayer; }
  bool isForwardCommitArmed() const override { return forwardArmed; }
  float getForwardCommitBars() const override { return forwardBars; }
  int getRecordModeIndex() const override { return recordModeIndex; }
  int getCommitCount() const override { return commitCount; }
  std::array<float, 32> getSpectrumData() const override { return spectrum; }

  // ---- Test accessors for contract dumping ----
  const std::vector<ControlCommand>& getCommands() const { return commands; }

  // ---- Public state for contract capture ----
  float tempo = 120.0f;
  float targetBPM = 120.0f;
  float samplesPerBar = 88200.0f;
  double sampleRate = 44100.0;
  float masterVolume = 1.0f;
  float inputVolume = 1.0f;
  bool passthroughEnabled = true;
  bool isRecordingFlag = false;
  bool overdubEnabled = false;
  int activeLayer = 0;
  bool forwardArmed = false;
  float forwardBars = 0.0f;
  int recordModeIndex = 0;
  std::array<float, 32> spectrum{};
  int commitCount = 0;
  bool graphEnabled = true;
  bool linkEnabled = false;
  float linkTempo = 120.0f;
  bool transportPlaying = false;
  int lastSeekLayer = -1;

  // DSP slot tracking
  std::string dspScriptLastError;
  std::string dspLastErrorCode;
  std::unordered_set<std::string> loadedDspSlots;

  // OSC events captured via endpoint registry
  std::vector<juce::String> registeredOscEndpoints;
  std::vector<juce::String> removedOscEndpoints;

private:
  OSCServer oscServer;
  ControlServer controlServer;
  OSCEndpointRegistry endpointRegistry;
  OSCQueryServer oscQueryServer;
  CaptureBuffer capture;
  std::array<ManifoldLayer, 4> layers;
  std::vector<ControlCommand> commands;
  std::shared_ptr<dsp_primitives::PrimitiveGraph> primitiveGraph;
};

// ============================================================================
// Contract builder
// ============================================================================

namespace {

using namespace contract_harness_utils;

juce::var runTestScript(LuaEngine& engine, MockScriptableProcessor& mock,
                        const juce::String& scriptSource,
                        const juce::String& scriptName) {
  auto* root = new juce::DynamicObject();
  root->setProperty("script", scriptName);

  juce::File script = juce::File::getSpecialLocation(juce::File::tempDirectory)
      .getChildFile("lua_bindings_behavior_" + scriptName + ".lua");
  script.replaceWithText(scriptSource);

  bool loaded = engine.loadScript(script);
  if (!loaded) {
    root->setProperty("loadError", engine.getLastError().c_str());
    return juce::var(root);
  }

  engine.notifyUpdate();

  // Capture side effects
  const auto& cmds = mock.getCommands();

  // Commands summary
  juce::Array<juce::var> cmdSummary;
  for (const auto& cmd : cmds) {
    auto* c = new juce::DynamicObject();
    c->setProperty("type", static_cast<int>(cmd.type));
    c->setProperty("intParam", cmd.intParam);
    c->setProperty("floatParam", cmd.floatParam);
    cmdSummary.add(juce::var(c));
  }
  root->setProperty("commands", cmdSummary);

  // DSP slot state
  juce::Array<juce::var> loadedSlots;
  for (const auto& slot : mock.loadedDspSlots) {
    loadedSlots.add(juce::var(slot.c_str()));
  }
  root->setProperty("loadedDspSlots", loadedSlots);
  root->setProperty("dspLastError", mock.dspScriptLastError.c_str());

  // State snapshots
  root->setProperty("tempo", mock.tempo);
  root->setProperty("targetBPM", mock.targetBPM);
  root->setProperty("masterVolume", mock.masterVolume);
  root->setProperty("inputVolume", mock.inputVolume);
  root->setProperty("passthrough", mock.passthroughEnabled);
  root->setProperty("recording", mock.isRecordingFlag);
  root->setProperty("overdub", mock.overdubEnabled);
  root->setProperty("activeLayer", mock.activeLayer);
  root->setProperty("forwardArmed", mock.forwardArmed);
  root->setProperty("recordModeIndex", mock.recordModeIndex);
  root->setProperty("commitCount", mock.commitCount);
  root->setProperty("graphEnabled", mock.graphEnabled);
  root->setProperty("linkEnabled", mock.linkEnabled);
  root->setProperty("linkTempo", mock.linkTempo);
  root->setProperty("transportPlaying", mock.transportPlaying);

  return juce::var(root);
}

// ----- Control/Command tests -----
juce::String commandTestScript = juce::String(R"(
function ui_init(root)
  -- Test command() with various canonical forms
  command("SET", "/core/behavior/tempo", "130")
  command("SET", "/core/behavior/volume", "0.75")
  command("SET", "/core/behavior/passthrough", "0")
  command("SET", "/core/behavior/inputVolume", "0.5")
  command("SET", "/core/behavior/layer", "2")
  command("SET", "/core/behavior/mode", "1")
  command("SET", "/core/behavior/recording", "1")
  command("SET", "/core/behavior/overdub", "1")

  -- Test getParam before/after
  local tempoBefore = getParam("/looper/tempo")
  local volBefore = getParam("/looper/volume")

  -- Test setParam
  local setOk = setParam("/looper/tempo", 135.0)
  local tempoAfter = getParam("/looper/tempo")

  -- Test hasEndpoint
  local hasTempo = hasEndpoint("/looper/tempo")
  local hasLayer0Speed = hasEndpoint("/looper/layer/0/speed")
  local hasNonexistent = hasEndpoint("/nonexistent/path")

  -- Test seekLayer
  seekLayer(1, 0.5)

  -- Test listEndpoints with filters (registry uses /core/behavior/ prefix)
  local allEndpoints = listEndpoints()
  local layerEndpoints = listEndpoints("/core/behavior/layer", false, false)
  local writableEndpoints = listEndpoints("", true, true)

  -- Store for verification
  results = {
    tempoBefore = tempoBefore,
    volBefore = volBefore,
    setOk = setOk,
    tempoAfter = tempoAfter,
    hasTempo = hasTempo,
    hasLayer0Speed = hasLayer0Speed,
    hasNonexistent = hasNonexistent,
    allCount = #allEndpoints,
    layerCount = #layerEndpoints,
    writableCount = #writableEndpoints,
  }
end

function ui_update(state)
end
)").trimStart();

// ----- DSP bindings tests -----
juce::String dspTestScript = juce::String(R"(
function ui_init(root)
  -- Test DSP script load/unload queries
  results = {}

  -- loadDspScript with invalid file
  results.loadFail = loadDspScript("/nonexistent.lua")

  -- loadDspScriptInSlot with custom slot
  results.loadSlotOk = loadDspScriptInSlot("/some/script.lua", "slot-dsp")

  -- loadDspScriptFromString with valid Lua
  results.loadStringOk = loadDspScriptFromString("function buildPlugin(ctx) return {} end", "test")

  -- loadDspScriptFromString with invalid Lua
  results.loadStringInvalid = loadDspScriptFromString("garbage", "bad")

  -- loadDspScriptFromStringInSlot
  results.loadStringSlot = loadDspScriptFromStringInSlot("function buildPlugin(ctx) return {} end", "test", "slot-b")

  -- DSP load status queries
  results.isDspLoaded = isDspScriptLoaded()
  results.isSlotLoaded = isDspSlotLoaded("slot-dsp")
  results.isMissingSlotLoaded = isDspSlotLoaded("nonexistent")

  -- unloadDspSlot
  results.unloadSlot = unloadDspSlot("slot-dsp")
  results.isSlotAfterUnload = isDspSlotLoaded("slot-dsp")

  -- Default slot operations
  results.unloadDefault = loadDspScriptInSlot("", "default")
  results.defaultIsLoaded = isDspSlotLoaded("default")
end

function ui_update(state)
end
)").trimStart();

// ----- Graph bindings tests -----
juce::String graphTestScript = juce::String(R"(
function ui_init(root)
  results = {}

  -- Check initial graph state
  results.initialNodeCount = getGraphNodeCount()
  results.initialConnCount = getGraphConnectionCount()
  results.initialCycle = hasGraphCycle()
end

function ui_update(state)
end
)").trimStart();

// ----- OSC bindings tests -----
juce::String oscTestScript = juce::String(R"(
function ui_init(root)
  results = {}

  -- Register custom endpoint
  osc.registerEndpoint("/custom/param1", {
    type = "f",
    access = 3,
    rangeMin = 0,
    rangeMax = 1,
    description = "custom float param"
  })

  -- Register another endpoint
  osc.registerEndpoint("/custom/trigger", {
    type = "i",
    access = 2,
    rangeMin = 0,
    rangeMax = 1,
    description = "custom int trigger"
  })

  -- Verify hasEndpoint sees custom endpoints
  results.hasCustom1 = hasEndpoint("/custom/param1")
  results.hasCustom2 = hasEndpoint("/custom/trigger")
  results.hasNonCustom = hasEndpoint("/custom/nonexistent")

  -- List custom endpoints
  local allEndpoints = listEndpoints("/custom", false, false)
  results.customCount = #allEndpoints

  if #allEndpoints >= 1 then
    results.firstCustomPath = allEndpoints[1].path
    results.firstCustomType = allEndpoints[1].type
    results.firstCustomAccess = allEndpoints[1].access
  end
end

function ui_update(state)
end
)").trimStart();

// ----- Canvas/UI bindings tests -----
juce::String uiTestScript = juce::String(R"(
function ui_init(root)
  results = {}

  -- Canvas hierarchy
  local panel = root:addChild("panel")
  panel:setUserData("type", "Panel")
  panel:setUserData("x", 100)
  panel:setUserData("y", 50)
  panel:setUserData("width", 200)
  panel:setUserData("height", 300)

  local button = panel:addChild("button")
  button:setUserData("type", "Button")
  button:setUserData("label", "Click Me")

  -- Verify hierarchy
  results.rootChildren = 1
  results.panelChildren = 1
  results.panelType = panel:getUserData("type")
  results.buttonType = button:getUserData("type")
  results.buttonLabel = button:getUserData("label")

  -- UserData management
  results.hasType = button:hasUserData("type")
  results.hasMissing = button:hasUserData("missing")

  -- Keys
  local keys = button:getUserDataKeys()
  results.keysCount = #keys

  -- Clear one key
  button:clearUserData("label")
  results.afterClearHasLabel = button:hasUserData("label")
  results.afterClearHasType = button:hasUserData("type")

  -- Clear all
  local childA = root:addChild("childA")
  childA:setUserData("name", "Alpha")
  childA:clearAllUserData()
  results.afterClearAll = childA:hasUserData("name")

  -- Independent data
  local childB = root:addChild("childB")
  local childC = root:addChild("childC")
  childB:setUserData("value", 42)
  childC:setUserData("value", 99)
  results.childBVal = childB:getUserData("value")
  results.childCVal = childC:getUserData("value")

  -- Missing key returns nil
  local missing = childB:getUserData("nonexistent")
  results.missingIsNil = (missing == nil)
end

function ui_update(state)
end
)").trimStart();

// ----- Event bindings tests -----
juce::String eventTestScript = juce::String(R"(
function ui_init(root)
  results = {}

  -- Test registering event listeners
  results.tempoOk = looper.onTempoChanged(function() end, false)
  results.commitOk = looper.onCommit(function() end, true)
  results.recordingOk = looper.onRecordingChanged(function() end)
  results.layerStateOk = looper.onLayerStateChanged(function() end)

end

function ui_update(state)
end
)").trimStart();

// ----- Utility bindings tests -----
juce::String utilityTestScript = juce::String(R"(
function ui_init(root)
  results = {}

  -- Time
  results.hasTime = (getTime() ~= nil)
  results.timeIsNumber = (type(getTime()) == "number")

  -- Clipboard round-trip
  setClipboardText("test-clipboard-123")
  results.clipboardText = getClipboardText()

  -- Debug outlines toggle
  results.outlinesInitial = areDebugOutlinesEnabled()
  setDebugOutlinesEnabled(true)
  results.outlinesAfter = areDebugOutlinesEnabled()
  setDebugOutlinesEnabled(false)

  -- Copy ID mode toggle
  results.copyIdInitial = isCopyIdModeEnabled()
  setCopyIdModeEnabled(true)
  results.copyIdAfter = isCopyIdModeEnabled()
  setCopyIdModeEnabled(false)

  -- UI renderer mode
  setUIRendererMode("contract-test")
  results.rendererMode = getUIRendererMode()
  setUIRendererMode("default")

  -- Overlay state
  results.overlayInitial = isOverlayActive()

  -- Script path
  results.scriptPath = getCurrentScriptPath()
end

function ui_update(state)
end
)").trimStart();

// ----- Waveform bindings tests -----
juce::String waveformTestScript = juce::String(R"(
function ui_init(root)
  results = {}

  -- Layer peaks (mock returns 0.5-filled array)
  local peaks0 = getLayerPeaks(0, 6)
  results.peaksCount = #peaks0
  if #peaks0 >= 1 then
    results.peaksFirst = peaks0[1]
  end

  -- Invalid layer index returns empty
  local peaksNeg = getLayerPeaks(-1, 10)
  results.peaksNegCount = #peaksNeg

  -- Capture peaks (mock returns 0.25-filled array)
  local capturePeaks = getCapturePeaks(0, 100, 4)
  results.capturePeaksCount = #capturePeaks
  if #capturePeaks >= 1 then
    results.capturePeaksFirst = capturePeaks[1]
  end

  -- Invalid capture range returns empty
  local captureEmpty = getCapturePeaks(100, 0, 4)
  results.captureEmptyCount = #captureEmpty

  -- Cache invalidation (should not throw)
  invalidateWaveformPeakCache()

  -- Cache stats
  local stats = getWaveformPeakCacheStats(false)
  results.cacheStatsType = type(stats)
end

function ui_update(state)
end
)").trimStart();

// ============================================================================
// Main
// ============================================================================

juce::var buildFullContract() {
  juce::ScopedJuceInitialiser_GUI juceInit;

  MockScriptableProcessor mock;
  Canvas root("root");
  LuaEngine engine;
  engine.initialise(&mock, &root);

  auto* rootObj = new juce::DynamicObject();
  rootObj->setProperty("contractVersion", 1);

  // Run each test script and capture side effects
  rootObj->setProperty("command",
    runTestScript(engine, mock, commandTestScript, "command"));

  rootObj->setProperty("dsp",
    runTestScript(engine, mock, dspTestScript, "dsp"));

  rootObj->setProperty("graph",
    runTestScript(engine, mock, graphTestScript, "graph"));

  rootObj->setProperty("osc",
    runTestScript(engine, mock, oscTestScript, "osc"));

  rootObj->setProperty("ui",
    runTestScript(engine, mock, uiTestScript, "ui"));

  rootObj->setProperty("event",
    runTestScript(engine, mock, eventTestScript, "event"));

  rootObj->setProperty("utility",
    runTestScript(engine, mock, utilityTestScript, "utility"));

  rootObj->setProperty("waveform",
    runTestScript(engine, mock, waveformTestScript, "waveform"));

  engine.clearAttachedUiLuaState();
  return juce::var(rootObj);
}

juce::String indentString(int indent) {
  juce::String out;
  for (int i = 0; i < indent; ++i) out += "  ";
  return out;
}

void appendCanonicalJson(const juce::var& value, juce::String& out, int indent) {
  if (auto* object = value.getDynamicObject()) {
    struct PropertyEntry { juce::String name; juce::var value; };
    std::vector<PropertyEntry> properties;
    const auto& namedValues = object->getProperties();
    properties.reserve(static_cast<std::size_t>(namedValues.size()));
    for (int i = 0; i < namedValues.size(); ++i)
      properties.push_back({namedValues.getName(i).toString(), namedValues.getValueAt(i)});
    std::sort(properties.begin(), properties.end(),
      [](const PropertyEntry& a, const PropertyEntry& b) { return a.name < b.name; });

    out += "{\n";
    for (std::size_t i = 0; i < properties.size(); ++i) {
      out += indentString(indent + 1);
      out += juce::JSON::toString(juce::var(properties[i].name), true);
      out += ": ";
      appendCanonicalJson(properties[i].value, out, indent + 1);
      if (i + 1 < properties.size()) out += ",";
      out += "\n";
    }
    out += indentString(indent);
    out += "}";
    return;
  }

  if (auto* array = value.getArray()) {
    out += "[";
    if (!array->isEmpty()) {
      out += "\n";
      for (int i = 0; i < array->size(); ++i) {
        out += indentString(indent + 1);
        appendCanonicalJson(array->getReference(i), out, indent + 1);
        if (i + 1 < array->size()) out += ",";
        out += "\n";
      }
      out += indentString(indent);
    }
    out += "]";
    return;
  }

  out += juce::JSON::toString(value, true);
}

} // namespace

int main(int argc, char* argv[]) {
  HarnessOptions opts;
  if (!parseOptions(argc, argv, opts)) return 1;

  const juce::String contractJson = [&]() {
    juce::String out;
    appendCanonicalJson(buildFullContract(), out, 0);
    out += "\n";
    return out;
  }();

  return finishJsonContract(opts, "LuaBindingsBehavior contract", contractJson.toStdString());
}
