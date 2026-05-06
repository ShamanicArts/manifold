#pragma once

#include "../DSPPluginScriptHost.h"

#ifndef SOL_ALL_SAFETIES_ON
#define SOL_ALL_SAFETIES_ON 1
#endif
#include <sol/sol.hpp>

#include <condition_variable>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

namespace dsp_primitives {
class GainNode;
class IPrimitiveNode;
class LoopPlaybackNode;
class PlaybackStateGateNode;
class PrimitiveGraph;
struct TemporalPartialData;
} // namespace dsp_primitives

namespace dsp_host {

struct DspParamSpec {
  juce::String typeTag{"f"};
  float rangeMin = 0.0f;
  float rangeMax = 1.0f;
  float defaultValue = 0.0f;
  int access = 3;
  juce::String description;
  bool deferGraphMutation = false;
};

using PrimitiveNodePtr = std::shared_ptr<dsp_primitives::IPrimitiveNode>;
using PrimitiveGraphPtr = std::shared_ptr<dsp_primitives::PrimitiveGraph>;
using OwnedNodeList = std::vector<PrimitiveNodePtr>;
using ParamSpecMap = std::unordered_map<std::string, DspParamSpec>;
using ParamValueMap = std::unordered_map<std::string, float>;
using ParamBindingMap = std::unordered_map<std::string, std::function<void(float)>>;
using PathMap = std::unordered_map<std::string, std::string>;
using LayerPlaybackNodeList = std::vector<std::weak_ptr<dsp_primitives::LoopPlaybackNode>>;
using LayerGateNodeList = std::vector<std::weak_ptr<dsp_primitives::PlaybackStateGateNode>>;
using LayerOutputNodeList = std::vector<std::weak_ptr<dsp_primitives::GainNode>>;
using NamedNodeMap = std::unordered_map<std::string, std::weak_ptr<dsp_primitives::IPrimitiveNode>>;
using PrimitiveNodeResolverFn = std::function<PrimitiveNodePtr(const sol::object &)>;
using PathMapperFn = std::function<std::string(const std::string &)>;

struct BindingContext {
  PrimitiveGraphPtr graph;
  std::string namespaceBase{"/core/behavior"};
  std::shared_ptr<ParamSpecMap> paramSpecs = std::make_shared<ParamSpecMap>();
  std::shared_ptr<ParamValueMap> paramValues = std::make_shared<ParamValueMap>();
  std::shared_ptr<ParamBindingMap> paramBindings = std::make_shared<ParamBindingMap>();
  std::shared_ptr<PathMap> externalToInternalPath = std::make_shared<PathMap>();
  std::shared_ptr<PathMap> internalToExternalPath = std::make_shared<PathMap>();
  std::shared_ptr<LayerPlaybackNodeList> layerPlaybackNodes = std::make_shared<LayerPlaybackNodeList>();
  std::shared_ptr<LayerGateNodeList> layerGateNodes = std::make_shared<LayerGateNodeList>();
  std::shared_ptr<LayerOutputNodeList> layerOutputNodes = std::make_shared<LayerOutputNodeList>();
  std::shared_ptr<NamedNodeMap> namedNodes = std::make_shared<NamedNodeMap>();
  std::shared_ptr<OwnedNodeList> ownedNodes = std::make_shared<OwnedNodeList>();
};

struct LoadSession {
  sol::state lua;
  lua_State *luaState = nullptr;
  std::shared_ptr<BindingContext> bindingContext = std::make_shared<BindingContext>();

  std::shared_ptr<ParamSpecMap> paramSpecs = bindingContext->paramSpecs;
  std::shared_ptr<ParamValueMap> paramValues = bindingContext->paramValues;
  std::shared_ptr<ParamBindingMap> paramBindings = bindingContext->paramBindings;
  std::shared_ptr<PathMap> externalToInternalPath = bindingContext->externalToInternalPath;
  std::shared_ptr<PathMap> internalToExternalPath = bindingContext->internalToExternalPath;
  std::shared_ptr<LayerPlaybackNodeList> layerPlaybackNodes = bindingContext->layerPlaybackNodes;
  std::shared_ptr<LayerGateNodeList> layerGateNodes = bindingContext->layerGateNodes;
  std::shared_ptr<LayerOutputNodeList> layerOutputNodes = bindingContext->layerOutputNodes;
  std::shared_ptr<NamedNodeMap> namedNodes = bindingContext->namedNodes;
  std::shared_ptr<OwnedNodeList> ownedNodes = bindingContext->ownedNodes;

  sol::function onParamChange;
  sol::function process;
  sol::table pluginTable;
};

float clampParamValue(const DspParamSpec &spec, float value);
juce::String sanitizePath(const std::string &path);
bool isRegistryOwnedCategory(const juce::String &category);

inline std::string mapInternalPathToExternal(const std::string &rawPath,
                                             const std::string &namespaceBase) {
  juce::String internal = sanitizePath(rawPath);

  if (namespaceBase == "/core/behavior") {
    return internal.toStdString();
  }

  juce::String base(namespaceBase);
  if (internal == "/core/behavior") {
    return base.toStdString();
  }
  if (internal.startsWith("/core/behavior/")) {
    return (base + internal.substring(14)).toStdString();
  }

  return internal.toStdString();
}

inline std::string mapExternalPathToInternal(const std::string &rawPath,
                                             const std::string &namespaceBase) {
  juce::String external = sanitizePath(rawPath);
  juce::String base(namespaceBase);

  if (namespaceBase != "/core/behavior") {
    if (external == base) {
      return std::string("/core/behavior");
    }
    if (external.startsWith(base + "/")) {
      return (juce::String("/core/behavior") + external.substring(base.length())).toStdString();
    }
  }

  return external.toStdString();
}

template <typename NodeT>
std::shared_ptr<NodeT> tableNode(const sol::table &self) {
  sol::object obj = self["__node"];
  if (!obj.valid() || !obj.is<std::shared_ptr<NodeT>>()) {
    return nullptr;
  }
  return obj.as<std::shared_ptr<NodeT>>();
}

sol::table sampleAnalysisToLua(sol::this_state ts,
                               const dsp_primitives::SampleAnalysis &analysis);
sol::table partialDataToLua(sol::this_state ts,
                            const dsp_primitives::PartialData &partials);
sol::table temporalPartialDataToLua(
    sol::this_state ts,
    const dsp_primitives::TemporalPartialData &temporal);
sol::table sampleDerivedAdditiveDebugToLua(
    sol::this_state ts,
    const SampleDerivedAdditiveDebugState &state);
bool sampleDerivedAdditiveDebugFromLua(
    const sol::table &t,
    SampleDerivedAdditiveDebugState &outState);

void initialiseLoadSession(LoadSession &session);
bool configureModuleLoading(LoadSession &session,
                            const juce::File *scriptFile,
                            sol::table &ctx,
                            std::string &error);
bool executeBuildPlugin(LoadSession &session,
                        const juce::File *scriptFile,
                        const std::string *scriptCode,
                        sol::table &ctx,
                        std::string &error);
void registerCoreBindings(LoadSession &session,
                          PrimitiveGraphPtr graph,
                          sol::table &ctx);
void registerSynthBindings(LoadSession &session,
                           PrimitiveGraphPtr graph,
                           sol::table &ctx);
void registerFxBindings(LoadSession &session,
                        PrimitiveGraphPtr graph,
                        sol::table &ctx);
PrimitiveNodePtr toPrimitiveNode(const sol::object &obj);

// Param registry helpers — exposed for contract testing
void handleParamRegister(
    const std::string &rawPath, sol::table options,
    std::unordered_map<std::string, dsp_host::DspParamSpec> &newParamSpecs,
    std::unordered_map<std::string, float> &newParamValues,
    std::unordered_map<std::string, std::string> &newExternalToInternalPath,
    std::unordered_map<std::string, std::string> &newInternalToExternalPath,
    const dsp_host::PathMapperFn &mapInternalToExternal,
    const dsp_host::PathMapperFn &mapExternalToInternal);
bool handleParamBind(
    const std::string &rawPath, const sol::object &nodeObj,
    const std::string &method,
    std::unordered_map<std::string, std::function<void(float)>> &newParamBindings,
    PathMapperFn mapInternalToExternal);

void registerParamsApi(LoadSession &session,
                       sol::table &ctx);
void registerLoopLayerBundle(LoadSession &session,
                             PrimitiveGraphPtr graph,
                             sol::table &ctx);
void registerMidiApi(LoadSession &session,
                     ScriptableProcessor *processor,
                     sol::table &ctx,
                     bool publishHostApi = true);
void registerHostApiAndGlobals(LoadSession &session,
                                 ScriptableProcessor *processor,
                                 PrimitiveGraphPtr graph,
                                 sol::table &ctx,
                                 const PrimitiveNodeResolverFn &toPrimitiveNode);

void syncEndpoints(LoadSession &session,
                   ScriptableProcessor *processor,
                   std::vector<juce::String> &registeredEndpoints,
                   const std::map<std::string, DspParamSpec> &orderedSpecs);

} // namespace dsp_host

struct DSPPluginScriptHost::Impl {
  struct DeferredParamMutation {
    std::string path;
    float value = 0.0f;
  };

  ScriptableProcessor *processor = nullptr;

  mutable std::recursive_mutex luaMutex;
  std::shared_ptr<dsp_host::BindingContext> bindingContext;
  std::vector<std::shared_ptr<dsp_host::BindingContext>> retiredBindingContexts;
  sol::state lua;
  sol::function onParamChange;
  sol::function process;
  sol::table pluginTable;

  std::unordered_map<std::string, dsp_host::DspParamSpec> paramSpecs;
  std::unordered_map<std::string, float> paramValues;
  std::unordered_map<std::string, std::function<void(float)>> paramBindings;
  std::unordered_map<std::string, std::string> externalToInternalPath;
  std::unordered_map<std::string, std::string> internalToExternalPath;
  std::vector<juce::String> registeredEndpoints;
  std::vector<std::weak_ptr<dsp_primitives::LoopPlaybackNode>> layerPlaybackNodes;
  std::vector<std::weak_ptr<dsp_primitives::PlaybackStateGateNode>> layerGateNodes;
  std::vector<std::weak_ptr<dsp_primitives::GainNode>> layerOutputNodes;
  std::unordered_map<std::string, std::weak_ptr<dsp_primitives::IPrimitiveNode>>
      namedNodes;
  std::vector<std::shared_ptr<dsp_primitives::IPrimitiveNode>> ownedNodes;

  // Keep old Lua VMs alive to avoid tearing down a VM during nested Lua call stacks.
  std::vector<sol::state> retiredLuaStates;

  std::mutex deferredMutex;
  std::condition_variable deferredCv;
  std::deque<DeferredParamMutation> deferredMutations;
  std::thread deferredWorker;
  bool deferredWorkerRunning = false;
  bool deferredWorkerStop = false;

  std::string namespaceBase{"/core/behavior"};

  bool loaded = false;
  std::string lastError;
  juce::File currentScriptFile;
  std::string currentScriptSourceName;
  std::string currentScriptCode;
  bool currentScriptIsInMemory = false;
};
