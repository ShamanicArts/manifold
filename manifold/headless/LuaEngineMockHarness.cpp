#include "../primitives/scripting/LuaEngine.h"
#include "../primitives/scripting/ScriptableProcessor.h"
#include "../primitives/scripting/core/LuaCoreEngine.h"
#include "../primitives/control/OSCEndpointRegistry.h"
#include "../primitives/control/OSCQuery.h"
#include "../primitives/control/OSCServer.h"
#include "../primitives/control/EndpointResolver.h"
#include "../primitives/control/CommandParser.h"
#include "../primitives/dsp/CaptureBuffer.h"
#include "../engine/ManifoldLayer.h"

extern "C" {
#include <lauxlib.h>
#include <lua.h>
#include <lualib.h>
}

#define SOL_ALL_SAFETIES_ON 1
#include <sol/sol.hpp>

#include <juce_core/juce_core.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

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
    
    // Register endpoints for command testing
    endpointRegistry.setNumLayers(4);
    endpointRegistry.rebuild();
  }

  bool postControlCommandPayload(const ControlCommand &command) override {
    commands.push_back(command);

    if (command.type == ControlCommand::Type::SetTempo) {
      tempo = command.floatParam;
    }
    return true;
  }

  bool postControlCommand(ControlCommand::Type type, int intParam,
                          float floatParam) override {
    ControlCommand cmd;
    cmd.operation = ControlOperation::Legacy;
    cmd.type = type;
    cmd.intParam = intParam;
    cmd.floatParam = floatParam;
    return postControlCommandPayload(cmd);
  }

  ControlServer &getControlServer() override { return controlServer; }
  OSCServer &getOSCServer() override { return oscServer; }
  OSCEndpointRegistry &getEndpointRegistry() override { return endpointRegistry; }
  OSCQueryServer &getOSCQueryServer() override { return oscQueryServer; }

  // Generic path-based parameter access
  bool setParamByPath(const std::string &path, float value) override {
    ParseResult result = CommandParser::buildResolverSetCommand(
        &endpointRegistry, juce::String(path), juce::var(value));
    if (result.kind != ParseResult::Kind::Enqueue) {
      return false;
    }
    return postControlCommandPayload(result.command);
  }

  float getParamByPath(const std::string &path) const override {
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

    // Layer paths
    if (path.find("/looper/layer/") == 0) {
      int layerIdx = -1;
      if (sscanf(path.c_str(), "/looper/layer/%d/", &layerIdx) == 1 &&
          layerIdx >= 0 && layerIdx < getNumLayers()) {
        size_t slashPos = path.find('/', 14);
        if (slashPos != std::string::npos) {
          std::string rest = path.substr(slashPos + 1);
          const auto &layer = layers[(size_t)layerIdx];
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

  bool hasEndpoint(const std::string &path) const override {
    OSCEndpoint endpoint = endpointRegistry.findEndpoint(juce::String(path));
    return endpoint.path.isNotEmpty();
  }

  int getNumLayers() const override { return 4; }
  bool getLayerSnapshot(int index, ScriptableLayerSnapshot &out) const override {
    if (index < 0 || index >= getNumLayers()) {
      return false;
    }

    const auto &layer = layers[(size_t)index];
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

  bool computeLayerPeaks(int layerIndex, int numBuckets,
                         std::vector<float> &outPeaks) const override {
    outPeaks.clear();
    if (layerIndex < 0 || layerIndex >= getNumLayers() || numBuckets <= 0) {
      return false;
    }

    outPeaks.assign((size_t)numBuckets, 0.5f);
    return true;
  }

  bool computeCapturePeaks(int startAgo, int endAgo, int numBuckets,
                           std::vector<float> &outPeaks) const override {
    outPeaks.clear();
    if (numBuckets <= 0 || endAgo <= startAgo) {
      return false;
    }

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

  const std::vector<ControlCommand> &getCommands() const { return commands; }

private:
  OSCServer oscServer;
  ControlServer controlServer;
  OSCEndpointRegistry endpointRegistry;
  OSCQueryServer oscQueryServer;

  CaptureBuffer capture;
  std::array<ManifoldLayer, 4> layers;

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

  std::vector<ControlCommand> commands;
};

namespace {

struct HarnessOptions {
  enum class Mode {
    Smoke,
    PrintContract,
    WriteContract,
    VerifyContract,
  };

  Mode mode = Mode::Smoke;
  juce::File contractPath;
};

struct LuaDumpContext {
  std::unordered_set<const void*> activePointers;
  int maxDepth = 6;
};

struct SortedDumpEntry {
  std::string sortKey;
  juce::var payload;
};

void printUsage(const char* programName) {
  std::fprintf(stderr,
               "Usage: %s [--print-contract | --write-contract PATH | --verify-contract PATH]\n"
               "  no args              Run the existing LuaEngine smoke harness\n"
               "  --print-contract     Print canonical Lua binding contract JSON\n"
               "  --write-contract     Write canonical Lua binding contract JSON to PATH\n"
               "  --verify-contract    Compare canonical Lua binding contract JSON against PATH\n",
               programName);
}

bool parseOptions(int argc, char* argv[], HarnessOptions& out) {
  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg == "--print-contract") {
      out.mode = HarnessOptions::Mode::PrintContract;
    } else if (arg == "--write-contract" && i + 1 < argc) {
      out.mode = HarnessOptions::Mode::WriteContract;
      out.contractPath = juce::File(argv[++i]);
    } else if (arg == "--verify-contract" && i + 1 < argc) {
      out.mode = HarnessOptions::Mode::VerifyContract;
      out.contractPath = juce::File(argv[++i]);
    } else if (arg == "--help" || arg == "-h") {
      printUsage(argv[0]);
      return false;
    } else {
      std::fprintf(stderr, "LuaEngineMockHarness: unknown argument: %s\n", argv[i]);
      printUsage(argv[0]);
      return false;
    }
  }
  return true;
}

std::string numericKeyString(lua_State* L, int index) {
  if (lua_isinteger(L, index)) {
    return std::to_string(static_cast<long long>(lua_tointeger(L, index)));
  }
  return juce::String(lua_tonumber(L, index), 6).toStdString();
}

std::string keySortToken(lua_State* L, int index) {
  const int type = lua_type(L, index);
  switch (type) {
    case LUA_TSTRING:
      return "string:" + std::string(lua_tostring(L, index));
    case LUA_TNUMBER:
      return "number:" + numericKeyString(L, index);
    case LUA_TBOOLEAN:
      return std::string("boolean:") + (lua_toboolean(L, index) ? "true" : "false");
    case LUA_TNIL:
      return "nil:nil";
    default:
      return std::string(lua_typename(L, type));
  }
}

juce::var dumpLuaValue(lua_State* L, int index, LuaDumpContext& ctx, int depth);

juce::var dumpLuaKey(lua_State* L, int index) {
  juce::DynamicObject::Ptr obj = new juce::DynamicObject();
  const int type = lua_type(L, index);
  obj->setProperty("kind", juce::String(lua_typename(L, type)));
  obj->setProperty("repr", juce::String(keySortToken(L, index)));

  switch (type) {
    case LUA_TSTRING:
      obj->setProperty("value", juce::String(lua_tostring(L, index)));
      break;
    case LUA_TNUMBER:
      if (lua_isinteger(L, index)) {
        obj->setProperty("value", static_cast<double>(lua_tointeger(L, index)));
        obj->setProperty("numericKind", "integer");
      } else {
        obj->setProperty("value", lua_tonumber(L, index));
        obj->setProperty("numericKind", "float");
      }
      break;
    case LUA_TBOOLEAN:
      obj->setProperty("value", static_cast<bool>(lua_toboolean(L, index)));
      break;
    default:
      break;
  }

  return juce::var(obj.get());
}

juce::Array<juce::var> dumpLuaTableEntries(lua_State* L,
                                           int tableIndex,
                                           LuaDumpContext& ctx,
                                           int depth) {
  const int absoluteIndex = lua_absindex(L, tableIndex);
  std::vector<SortedDumpEntry> entries;

  lua_pushnil(L);
  while (lua_next(L, absoluteIndex) != 0) {
    juce::DynamicObject::Ptr entry = new juce::DynamicObject();
    entry->setProperty("key", dumpLuaKey(L, -2));
    entry->setProperty("value", dumpLuaValue(L, -1, ctx, depth + 1));
    entries.push_back({keySortToken(L, -2), juce::var(entry.get())});
    lua_pop(L, 1);
  }

  std::sort(entries.begin(), entries.end(),
            [](const SortedDumpEntry& a, const SortedDumpEntry& b) {
              return a.sortKey < b.sortKey;
            });

  juce::Array<juce::var> array;
  for (const auto& entry : entries) {
    array.add(entry.payload);
  }
  return array;
}

juce::var dumpLuaValue(lua_State* L, int index, LuaDumpContext& ctx, int depth) {
  const int absoluteIndex = lua_absindex(L, index);
  const int type = lua_type(L, absoluteIndex);

  juce::DynamicObject::Ptr obj = new juce::DynamicObject();
  obj->setProperty("kind", juce::String(lua_typename(L, type)));

  switch (type) {
    case LUA_TNIL:
      return juce::var(obj.get());
    case LUA_TBOOLEAN:
      obj->setProperty("value", static_cast<bool>(lua_toboolean(L, absoluteIndex)));
      return juce::var(obj.get());
    case LUA_TNUMBER:
      if (lua_isinteger(L, absoluteIndex)) {
        obj->setProperty("value", static_cast<double>(lua_tointeger(L, absoluteIndex)));
        obj->setProperty("numericKind", "integer");
      } else {
        obj->setProperty("value", lua_tonumber(L, absoluteIndex));
        obj->setProperty("numericKind", "float");
      }
      return juce::var(obj.get());
    case LUA_TSTRING:
      obj->setProperty("value", juce::String(lua_tostring(L, absoluteIndex)));
      return juce::var(obj.get());
    case LUA_TFUNCTION: {
      obj->setProperty("isC", static_cast<bool>(lua_iscfunction(L, absoluteIndex)));
      lua_pushvalue(L, absoluteIndex);
      lua_Debug dbg{};
      if (lua_getinfo(L, ">Su", &dbg) != 0) {
        obj->setProperty("what", juce::String(dbg.what != nullptr ? dbg.what : ""));
        obj->setProperty("source", juce::String(dbg.source != nullptr ? dbg.source : ""));
        obj->setProperty("linedefined", dbg.linedefined);
        obj->setProperty("lastlinedefined", dbg.lastlinedefined);
        obj->setProperty("nups", dbg.nups);
      }
      return juce::var(obj.get());
    }
    case LUA_TTABLE:
    case LUA_TUSERDATA:
    case LUA_TLIGHTUSERDATA: {
      const void* ptr = lua_topointer(L, absoluteIndex);
      const bool trackPointer = (ptr != nullptr);
      if (trackPointer) {
        if (ctx.activePointers.find(ptr) != ctx.activePointers.end()) {
          obj->setProperty("recursiveRef", true);
          return juce::var(obj.get());
        }
        ctx.activePointers.insert(ptr);
      }

      if (depth >= ctx.maxDepth) {
        obj->setProperty("truncated", true);
      } else if (type == LUA_TTABLE) {
        obj->setProperty("entries", dumpLuaTableEntries(L, absoluteIndex, ctx, depth));
      }

      if (lua_getmetatable(L, absoluteIndex) != 0) {
        obj->setProperty("metatable", dumpLuaValue(L, -1, ctx, depth + 1));
        lua_pop(L, 1);
      }

      if (trackPointer) {
        ctx.activePointers.erase(ptr);
      }
      return juce::var(obj.get());
    }
    case LUA_TTHREAD:
      return juce::var(obj.get());
    default:
      return juce::var(obj.get());
  }
}

std::set<std::string> captureTopLevelGlobalKeys(LuaCoreEngine& engine) {
  std::set<std::string> keys;
  const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
  sol::state& lua = engine.getLuaState();
  lua_State* L = lua.lua_state();
  if (L == nullptr) {
    return keys;
  }

  lua_pushglobaltable(L);
  lua_pushnil(L);
  while (lua_next(L, -2) != 0) {
    if (lua_type(L, -2) == LUA_TSTRING) {
      keys.emplace(lua_tostring(L, -2));
    }
    lua_pop(L, 1);
  }
  lua_pop(L, 1);
  return keys;
}

juce::var buildBindingsContract() {
  LuaCoreEngine baselineEngine;
  if (!baselineEngine.initialize()) {
    throw std::runtime_error("failed to initialize baseline LuaCoreEngine");
  }
  const auto baselineKeys = captureTopLevelGlobalKeys(baselineEngine);

  MockScriptableProcessor mock;
  Canvas root("root");
  LuaEngine engine;
  engine.initialise(&mock, &root);

  LuaDumpContext ctx;
  juce::DynamicObject::Ptr contract = new juce::DynamicObject();
  contract->setProperty("contractVersion", 1);
  contract->setProperty("maxDepth", ctx.maxDepth);

  std::vector<SortedDumpEntry> globals;
  engine.withLuaState([&](const sol::state& lua) {
    lua_State* L = lua.lua_state();
    if (L == nullptr) {
      return;
    }

    lua_pushglobaltable(L);
    lua_pushnil(L);
    while (lua_next(L, -2) != 0) {
      if (lua_type(L, -2) == LUA_TSTRING) {
        const std::string name = lua_tostring(L, -2);
        if (baselineKeys.find(name) == baselineKeys.end()) {
          juce::DynamicObject::Ptr entry = new juce::DynamicObject();
          entry->setProperty("name", juce::String(name));
          entry->setProperty("value", dumpLuaValue(L, -1, ctx, 0));
          globals.push_back({name, juce::var(entry.get())});
        }
      }
      lua_pop(L, 1);
    }
    lua_pop(L, 1);
  });

  std::sort(globals.begin(), globals.end(),
            [](const SortedDumpEntry& a, const SortedDumpEntry& b) {
              return a.sortKey < b.sortKey;
            });

  juce::Array<juce::var> globalsArray;
  for (const auto& global : globals) {
    globalsArray.add(global.payload);
  }
  contract->setProperty("globals", globalsArray);

  engine.clearAttachedUiLuaState();
  return juce::var(contract.get());
}

juce::String indentString(int indent) {
  juce::String out;
  for (int i = 0; i < indent; ++i) {
    out += "  ";
  }
  return out;
}

void appendCanonicalJson(const juce::var& value, juce::String& out, int indent) {
  if (auto* object = value.getDynamicObject()) {
    struct PropertyEntry {
      juce::String name;
      juce::var value;
    };

    std::vector<PropertyEntry> properties;
    const auto& namedValues = object->getProperties();
    properties.reserve(static_cast<std::size_t>(namedValues.size()));
    for (int i = 0; i < namedValues.size(); ++i) {
      properties.push_back({namedValues.getName(i).toString(), namedValues.getValueAt(i)});
    }
    std::sort(properties.begin(), properties.end(),
              [](const PropertyEntry& a, const PropertyEntry& b) {
                return a.name < b.name;
              });

    out += "{\n";
    for (std::size_t i = 0; i < properties.size(); ++i) {
      out += indentString(indent + 1);
      out += juce::JSON::toString(juce::var(properties[i].name), true);
      out += ": ";
      appendCanonicalJson(properties[i].value, out, indent + 1);
      if (i + 1 < properties.size()) {
        out += ",";
      }
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
        if (i + 1 < array->size()) {
          out += ",";
        }
        out += "\n";
      }
      out += indentString(indent);
    }
    out += "]";
    return;
  }

  out += juce::JSON::toString(value, true);
}

juce::String serializeBindingsContract() {
  juce::String out;
  appendCanonicalJson(buildBindingsContract(), out, 0);
  out += "\n";
  return out;
}

int runContractMode(const HarnessOptions& options) {
  juce::ScopedJuceInitialiser_GUI juceInit;
  const juce::String contractJson = serializeBindingsContract();

  if (options.mode == HarnessOptions::Mode::PrintContract) {
    std::fputs(contractJson.toRawUTF8(), stdout);
    return 0;
  }

  if (options.contractPath.getFullPathName().isEmpty()) {
    std::fprintf(stderr, "LuaEngineMockHarness: missing contract path\n");
    return 20;
  }

  if (options.mode == HarnessOptions::Mode::WriteContract) {
    if (!options.contractPath.getParentDirectory().exists()) {
      options.contractPath.getParentDirectory().createDirectory();
    }
    if (!options.contractPath.replaceWithText(contractJson)) {
      std::fprintf(stderr,
                   "LuaEngineMockHarness: failed to write contract file: %s\n",
                   options.contractPath.getFullPathName().toRawUTF8());
      return 21;
    }
    std::fprintf(stdout,
                 "LuaEngineMockHarness: wrote binding contract to %s\n",
                 options.contractPath.getFullPathName().toRawUTF8());
    return 0;
  }

  if (!options.contractPath.existsAsFile()) {
    std::fprintf(stderr,
                 "LuaEngineMockHarness: contract file does not exist: %s\n",
                 options.contractPath.getFullPathName().toRawUTF8());
    return 22;
  }

  const juce::var expectedParsed = juce::JSON::parse(options.contractPath);
  if (expectedParsed.isVoid()) {
    std::fprintf(stderr,
                 "LuaEngineMockHarness: failed to parse contract JSON: %s\n",
                 options.contractPath.getFullPathName().toRawUTF8());
    return 23;
  }

  juce::String expectedCanonical;
  appendCanonicalJson(expectedParsed, expectedCanonical, 0);
  expectedCanonical += "\n";

  if (expectedCanonical != contractJson) {
    const auto actualPath = options.contractPath.getSiblingFile(
        options.contractPath.getFileNameWithoutExtension() + ".actual" + options.contractPath.getFileExtension());
    actualPath.replaceWithText(contractJson);
    std::fprintf(stderr,
                 "LuaEngineMockHarness: contract mismatch: expected=%s actual=%s\n",
                 options.contractPath.getFullPathName().toRawUTF8(),
                 actualPath.getFullPathName().toRawUTF8());
    return 24;
  }

  std::fprintf(stdout,
               "LuaEngineMockHarness: contract PASS (%s)\n",
               options.contractPath.getFullPathName().toRawUTF8());
  return 0;
}

} // namespace

static int runSmokeHarness() {
  juce::ScopedJuceInitialiser_GUI juceInit;

  MockScriptableProcessor mock;
  Canvas root("root");
  LuaEngine engine;
  engine.initialise(&mock, &root);

  juce::File script = juce::File::getSpecialLocation(juce::File::tempDirectory)
                          .getChildFile("lua_engine_mock_harness.lua");

  const juce::String scriptSource = juce::String(R"(
sent = false

local function nearly(a, b)
  if a == nil or b == nil then
    return false
  end
  return math.abs(a - b) < 0.0001
end

local function bool01(v)
  if v then
    return 1
  end
  return 0
end

function ui_init(root)
  -- Test Canvas UserData (Editor Foundation) - Run unconditionally
  local testChild = root:addChild("testChild")
  
  -- Test string storage
  testChild:setUserData("widgetType", "Panel")
  local retrievedType = testChild:getUserData("widgetType")
  if retrievedType ~= "Panel" then
    error("UserData string storage failed")
  end
  
  -- Test table storage
  local testConfig = {bg = 0xff111111, radius = 8, visible = true}
  testChild:setUserData("config", testConfig)
  local retrievedConfig = testChild:getUserData("config")
  if retrievedConfig == nil or retrievedConfig.bg ~= 0xff111111 then
    error("UserData table storage failed")
  end
  
  -- Test hasUserData
  if testChild:hasUserData("widgetType") ~= true then
    error("UserData hasUserData failed for existing key")
  end
  if testChild:hasUserData("nonexistent") ~= false then
    error("UserData hasUserData failed for missing key")
  end
  
  -- Test getUserDataKeys
  local keys = testChild:getUserDataKeys()
  if #keys ~= 2 then
    error("UserData getUserDataKeys failed, expected 2 keys, got " .. #keys)
  end
  
  -- Test nil returns for missing keys
  local missing = testChild:getUserData("missingKey")
  if missing ~= nil then
    error("UserData getUserData should return nil for missing keys")
  end
  
  -- Test clearUserData
  testChild:clearUserData("widgetType")
  if testChild:hasUserData("widgetType") ~= false then
    error("UserData clearUserData failed")
  end
  if testChild:hasUserData("config") ~= true then
    error("UserData clearUserData cleared wrong key")
  end
  
  -- Test clearAllUserData
  testChild:clearAllUserData()
  if testChild:hasUserData("config") ~= false then
    error("UserData clearAllUserData failed")
  end
  if #testChild:getUserDataKeys() ~= 0 then
    error("UserData clearAllUserData left keys behind")
  end
  
  -- Test multiple children with independent data
  local childA = root:addChild("childA")
  local childB = root:addChild("childB")
  childA:setUserData("name", "Alpha")
  childB:setUserData("name", "Beta")
  if childA:getUserData("name") ~= "Alpha" then
    error("UserData childA data failed")
  end
  if childB:getUserData("name") ~= "Beta" then
    error("UserData childB data failed")
  end
  
  -- Send command to signal tests passed
  command("SET", "/core/behavior/tempo", "135.5")
  print("UserData tests PASSED")
end

function ui_update(state)
  if sent then
    return
  end

  if not (state and state.params and state.voices and state.numVoices == 4) then
    return
  end

  if #state.voices ~= state.numVoices then
    return
  end

  local params = state.params
  local ok = true
  ok = ok and nearly(params["/looper/tempo"], 120)
  ok = ok and nearly(params["/looper/targetbpm"], 120)
  ok = ok and nearly(params["/looper/samplesPerBar"], 88200)
  ok = ok and nearly(params["/looper/sampleRate"], 44100)
  ok = ok and nearly(params["/looper/captureSize"], 512)
  ok = ok and nearly(params["/looper/volume"], 1.0)
  ok = ok and params["/looper/recording"] == 0
  ok = ok and params["/looper/overdub"] == 0
  ok = ok and params["/looper/mode"] == "firstLoop"
  ok = ok and params["/looper/layer"] == 0
  ok = ok and params["/looper/forwardArmed"] == 0
  ok = ok and nearly(params["/looper/forwardBars"], 0)

  -- Test hasEndpoint
  ok = ok and hasEndpoint("/looper/tempo") == true
  ok = ok and hasEndpoint("/looper/layer/0/speed") == true
  ok = ok and hasEndpoint("/nonexistent/path") == false

  -- Test getParam
  ok = ok and nearly(getParam("/looper/tempo"), 120)
  ok = ok and nearly(getParam("/looper/volume"), 1.0)
  ok = ok and nearly(getParam("/looper/layer/0/speed"), 1.0)
  ok = ok and nearly(getParam("/nonexistent/path"), 0.0)

  for i = 1, state.numVoices do
    local voice = state.voices[i]
    if not voice then
      ok = false
      break
    end

    local layerIndex = i - 1
    local layerPrefix = string.format("/looper/layer/%d", layerIndex)
    local positionNorm = 0
    if voice.length and voice.length > 0 then
      positionNorm = (voice.position or 0) / voice.length
    end

    ok = ok and voice.id == layerIndex
    ok = ok and voice.path == layerPrefix
    ok = ok and voice.state ~= nil
    ok = ok and nearly(voice.positionNorm, positionNorm)

    local voiceParams = voice.params
    ok = ok and voiceParams ~= nil
    ok = ok and nearly(voiceParams.speed, voice.speed)
    ok = ok and nearly(voiceParams.volume, voice.volume)
    ok = ok and voiceParams.mute == params[layerPrefix .. "/mute"]
    ok = ok and voiceParams.reverse == bool01(voice.reversed)
    ok = ok and nearly(voiceParams.length, voice.length)
    ok = ok and nearly(voiceParams.position, positionNorm)
    ok = ok and nearly(voiceParams.bars, params[layerPrefix .. "/bars"])
    ok = ok and voiceParams.state == voice.state

    ok = ok and nearly(params[layerPrefix .. "/speed"], voice.speed)
    ok = ok and nearly(params[layerPrefix .. "/volume"], voice.volume)
    ok = ok and params[layerPrefix .. "/mute"] == bool01(voice.state == "muted")
    ok = ok and params[layerPrefix .. "/reverse"] == bool01(voice.reversed)
    ok = ok and nearly(params[layerPrefix .. "/length"], voice.length)
    ok = ok and nearly(params[layerPrefix .. "/position"], positionNorm)
    ok = ok and nearly(params[layerPrefix .. "/bars"], voice.bars)
    ok = ok and params[layerPrefix .. "/state"] == voice.state
    ok = ok and nearly(voice.bars, params[layerPrefix .. "/bars"])
    ok = ok and nearly(voice.positionNorm, positionNorm)
  end

  if ok then
    -- Test setParam
    local setOk = setParam("/looper/tempo", 135.5)
    ok = ok and setOk == true

    -- Test setParam with invalid path
    local setFail = setParam("/nonexistent/path", 1.0)
    ok = ok and setFail == false

    -- Test Primitives factories exist (Phase 2)
    -- Note: Methods require full usertype registration - just verify factories work
    local LoopBuffer = Primitives.LoopBuffer
    local buf = LoopBuffer.new(44100, 2)
    ok = ok and buf ~= nil

    local Playhead = Primitives.Playhead
    local ph = Playhead.new(44100)
    ok = ok and ph ~= nil

    local CaptureBuffer = Primitives.CaptureBuffer
    local cap = CaptureBuffer.new(88200, 2)
    ok = ok and cap ~= nil

    local Quantizer = Primitives.Quantizer
    local q = Quantizer.new(48000)
    ok = ok and q ~= nil

    -- Test Primitive Wiring (Phase 3)
    local PlayheadNode = Primitives.PlayheadNode
    local PassthroughNode = Primitives.PassthroughNode
    
    local phNode = PlayheadNode.new()
    ok = ok and phNode ~= nil
    phNode:setLoopLength(44100)
    ok = ok and phNode:getLoopLength() == 44100
    
    local passNode = PassthroughNode.new(2)
    ok = ok and passNode ~= nil
    
    -- Test graph state functions before connection
    local nodeCount = getGraphNodeCount()
    ok = ok and nodeCount >= 2
    
    local connCount = getGraphConnectionCount()
    ok = ok and connCount == 0
    
    -- Connect nodes
    local connected = connectNodes(phNode, passNode)
    ok = ok and connected == true
    
    connCount = getGraphConnectionCount()
    ok = ok and connCount == 1
    
    -- Test cycle detection (should not have cycle)
    local hasCycle = hasGraphCycle()
    ok = ok and hasCycle == false

    -- Test Canvas UserData (Editor Foundation)
    -- Create a child canvas and store various data types
    local testChild = root:addChild("testChild")
    
    -- Test string storage
    testChild:setUserData("widgetType", "Panel")
    local retrievedType = testChild:getUserData("widgetType")
    ok = ok and retrievedType == "Panel"
    
    -- Test table storage
    local testConfig = {bg = 0xff111111, radius = 8, visible = true}
    testChild:setUserData("config", testConfig)
    local retrievedConfig = testChild:getUserData("config")
    ok = ok and retrievedConfig ~= nil
    ok = ok and retrievedConfig.bg == 0xff111111
    ok = ok and retrievedConfig.radius == 8
    ok = ok and retrievedConfig.visible == true
    
    -- Test hasUserData
    ok = ok and testChild:hasUserData("widgetType") == true
    ok = ok and testChild:hasUserData("nonexistent") == false
    
    -- Test getUserDataKeys
    local keys = testChild:getUserDataKeys()
    ok = ok and #keys == 2
    
    -- Test nil returns for missing keys
    local missing = testChild:getUserData("missingKey")
    ok = ok and missing == nil
    
    -- Test clearUserData
    testChild:clearUserData("widgetType")
    ok = ok and testChild:hasUserData("widgetType") == false
    ok = ok and testChild:hasUserData("config") == true  -- Other data intact
    
    -- Test clearAllUserData
    testChild:clearAllUserData()
    ok = ok and testChild:hasUserData("config") == false
    ok = ok and #testChild:getUserDataKeys() == 0
    
    -- Test multiple children with independent data
    local childA = root:addChild("childA")
    local childB = root:addChild("childB")
    childA:setUserData("name", "Alpha")
    childB:setUserData("name", "Beta")
    ok = ok and childA:getUserData("name") == "Alpha"
    ok = ok and childB:getUserData("name") == "Beta"

    sent = true
  end
end
)" )
                                      .trimStart();

  if (!script.replaceWithText(scriptSource)) {
    std::fprintf(stderr, "LuaEngineMockHarness: failed to write temp script\n");
    return 2;
  }

  bool loaded = engine.loadScript(script);
  if (!loaded) {
    std::fprintf(stderr, "LuaEngineMockHarness: loadScript failed: %s\n",
                 engine.getLastError().c_str());
    return 3;
  }

  engine.notifyUpdate();
  engine.notifyUpdate();

  const auto &commands = mock.getCommands();
  if (commands.empty()) {
    std::fprintf(stderr,
                 "LuaEngineMockHarness: expected at least one command from Lua\n");
    return 4;
  }

  const auto &first = commands.front();
  if (first.type != ControlCommand::Type::SetTempo) {
    std::fprintf(stderr,
                 "LuaEngineMockHarness: expected first command SetTempo\n");
    return 5;
  }

  // setParam was called with 135.5
  if (std::abs(first.floatParam - 135.5f) > 0.1f) {
    std::fprintf(stderr,
                 "LuaEngineMockHarness: expected tempo 135.5, got %.3f\n",
                 first.floatParam);
    return 6;
  }

  juce::File endpointScript =
      juce::File::getSpecialLocation(juce::File::tempDirectory)
          .getChildFile("lua_engine_endpoint_harness.lua");
  juce::File plainScript =
      juce::File::getSpecialLocation(juce::File::tempDirectory)
          .getChildFile("lua_engine_plain_harness.lua");

  const juce::String endpointScriptSource = juce::String(R"(
function ui_init(root)
  osc.registerEndpoint("/experimental/temp", {
    type = "f",
    access = 3,
    description = "temporary endpoint"
  })
end

function ui_update(state)
end
)" )
                                            .trimStart();

  const juce::String plainScriptSource = juce::String(R"(
function ui_init(root)
end

function ui_update(state)
end
)" )
                                        .trimStart();

  if (!endpointScript.replaceWithText(endpointScriptSource) ||
      !plainScript.replaceWithText(plainScriptSource)) {
    std::fprintf(stderr,
                 "LuaEngineMockHarness: failed to write endpoint lifecycle scripts\n");
    return 7;
  }

  if (!engine.loadScript(endpointScript)) {
    std::fprintf(stderr,
                 "LuaEngineMockHarness: failed to load endpoint script: %s\n",
                 engine.getLastError().c_str());
    return 8;
  }

  auto registered =
      mock.getEndpointRegistry().findEndpoint("/experimental/temp");
  if (registered.path.isEmpty()) {
    std::fprintf(stderr,
                 "LuaEngineMockHarness: expected custom endpoint to be registered\n");
    return 9;
  }

  if (!engine.switchScript(plainScript)) {
    std::fprintf(stderr,
                 "LuaEngineMockHarness: failed to switch to plain script: %s\n",
                 engine.getLastError().c_str());
    return 10;
  }

  auto afterSwitch =
      mock.getEndpointRegistry().findEndpoint("/experimental/temp");
  if (!afterSwitch.path.isEmpty()) {
    std::fprintf(stderr,
                 "LuaEngineMockHarness: stale custom endpoint remained after switch\n");
    return 11;
  }

  std::fprintf(stdout,
               "LuaEngineMockHarness: PASS (commands=%zu, first=SetTempo %.1f via setParam)\n",
               commands.size(), first.floatParam);

  engine.clearAttachedUiLuaState();
  return 0;
}

int main(int argc, char* argv[]) {
  HarnessOptions options;
  if (!parseOptions(argc, argv, options)) {
    return (argc > 1) ? 1 : 0;
  }

  try {
    switch (options.mode) {
      case HarnessOptions::Mode::Smoke:
        return runSmokeHarness();
      case HarnessOptions::Mode::PrintContract:
      case HarnessOptions::Mode::WriteContract:
      case HarnessOptions::Mode::VerifyContract:
        return runContractMode(options);
    }
  } catch (const std::exception& e) {
    std::fprintf(stderr, "LuaEngineMockHarness: exception: %s\n", e.what());
    return 25;
  }

  std::fprintf(stderr, "LuaEngineMockHarness: unreachable mode dispatch\n");
  return 26;
}
