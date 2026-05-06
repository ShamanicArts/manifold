#include "BehaviorCoreProcessor.h"

#include "BehaviorCoreEditor.h"
#include "BehaviorHousekeepingSupport.h"
#include "BehaviorParamSupport.h"
#include "BehaviorQuerySupport.h"
#include "ControlCommandSupport.h"
#include "DspSlotSupport.h"
#include "ExportPluginPerfSupport.h"
#include "GraphRuntimeSupport.h"
#include "LinkSupport.h"
#include "MidiSupport.h"
#include "StateSerializationSupport.h"
#include "../primitives/control/BehaviorControlStateView.h"
#include "../primitives/control/BehaviorRuntimeTelemetryView.h"
#include "../primitives/control/OSCSettingsPersistence.h"
#include "../primitives/core/Settings.h"
#include "../primitives/scripting/DSPPluginScriptHost.h"
#include "../primitives/scripting/GraphRuntime.h"

#include <sol/sol.hpp>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <limits>
#include <sstream>
#if defined(__GLIBC__)
#include <malloc.h>
#endif

namespace {

struct ProcessorMemorySnapshot {
    int64_t pssBytes = 0;
    int64_t privateDirtyBytes = 0;
    int64_t heapUsedBytes = 0;
    int64_t arenaBytes = 0;
};

ProcessorMemorySnapshot readProcessorMemorySnapshot() {
    ProcessorMemorySnapshot snapshot;
    std::ifstream smaps("/proc/self/smaps_rollup");
    std::string line;
    while (std::getline(smaps, line)) {
        if (line.rfind("Pss:", 0) == 0) {
            std::istringstream iss(line);
            std::string label, unit;
            int64_t kb = 0;
            iss >> label >> kb >> unit;
            snapshot.pssBytes = kb * 1024;
        } else if (line.rfind("Private_Dirty:", 0) == 0) {
            std::istringstream iss(line);
            std::string label, unit;
            int64_t kb = 0;
            iss >> label >> kb >> unit;
            snapshot.privateDirtyBytes = kb * 1024;
        }
    }
#if defined(__GLIBC__)
    const auto mi = mallinfo2();
    snapshot.heapUsedBytes = static_cast<int64_t>(mi.uordblks);
    snapshot.arenaBytes = static_cast<int64_t>(mi.arena);
#endif
    return snapshot;
}

void updateTimingStage(FrameTimingStage& stage, int64_t durationUs) {
    stage.currentUs.store(durationUs, std::memory_order_relaxed);
    const int64_t previousPeak = stage.peakUs.load(std::memory_order_relaxed);
    if (durationUs > previousPeak) {
        stage.peakUs.store(durationUs, std::memory_order_relaxed);
    }
    constexpr int64_t alphaNum = 5;
    constexpr int64_t alphaDen = 100;
    const int64_t previousAvgX100 = stage.avgUsX100.load(std::memory_order_relaxed);
    const int64_t durationX100 = durationUs * 100;
    const int64_t nextAvgX100 =
        (previousAvgX100 == 0)
            ? durationX100
            : ((previousAvgX100 * (alphaDen - alphaNum)) + (durationX100 * alphaNum)) / alphaDen;
    stage.avgUsX100.store(nextAvgX100, std::memory_order_relaxed);
}

constexpr float kDefaultTempo = 120.0f;
constexpr float kDefaultTargetBpm = 120.0f;
constexpr float kDefaultMasterVolume = 1.0f;
constexpr float kDefaultInputVolume = 1.0f;

std::string normalizeRendererModeToken(std::string mode) {
    std::transform(mode.begin(), mode.end(), mode.begin(), [](unsigned char c) {
        if (c >= 'A' && c <= 'Z') {
            return static_cast<char>(c - 'A' + 'a');
        }
        return c == '_' ? '-' : static_cast<char>(c);
    });

    if (mode == "0" || mode == "off" || mode == "false") {
        return "canvas";
    }
    if (mode == "1" || mode == "on" || mode == "true" || mode == "imgui" || mode == "overlay") {
        return "imgui-overlay";
    }
    if (mode == "full" || mode == "replace" || mode == "imgui-full") {
        return "imgui-replace";
    }
    if (mode == "direct") {
        return "imgui-direct";
    }
    return mode;
}

BehaviorCoreEditor::RootMode rootModeFromEnvironmentOrState(const ControlServer& controlServer) {
    if (const char* envRenderer = std::getenv("MANIFOLD_RENDERER")) {
        const auto normalized = normalizeRendererModeToken(envRenderer);
        if (normalized == "canvas" || normalized == "imgui-overlay" || normalized == "imgui-replace") {
            return BehaviorCoreEditor::RootMode::Canvas;
        }
        return BehaviorCoreEditor::RootMode::RuntimeNode;
    }

    switch (controlServer.getCurrentUIRendererMode()) {
        case 0:
        case 1:
        case 2:
            return BehaviorCoreEditor::RootMode::Canvas;
        case 3:
        default:
            return BehaviorCoreEditor::RootMode::RuntimeNode;
    }
}

float computeSamplesPerBar(float tempo, double sampleRate) {
    if (tempo <= 0.0f || sampleRate <= 0.0) {
        return 0.0f;
    }
    return static_cast<float>((sampleRate * 240.0) / tempo);
}


float computeBufferRms(const juce::AudioBuffer<float>& buffer) {
    const int numChannels = buffer.getNumChannels();
    const int numSamples = buffer.getNumSamples();
    if (numChannels <= 0 || numSamples <= 0) {
        return 0.0f;
    }

    double sumSq = 0.0;
    int sampleCount = 0;
    for (int ch = 0; ch < numChannels; ++ch) {
        const float* data = buffer.getReadPointer(ch);
        for (int i = 0; i < numSamples; ++i) {
            const float s = data[i];
            sumSq += static_cast<double>(s) * static_cast<double>(s);
        }
        sampleCount += numSamples;
    }

    if (sampleCount <= 0) {
        return 0.0f;
    }
    return static_cast<float>(std::sqrt(sumSq / static_cast<double>(sampleCount)));
}

bool isProjectManifestFile(const juce::File& file) {
    return file.existsAsFile() && file.getFileName().equalsIgnoreCase("manifold.project.json5");
}

juce::File resolveProjectAssetRef(const juce::File& projectRoot, const juce::String& ref) {
    if (ref.isEmpty()) {
        return {};
    }

    if (juce::File::isAbsolutePath(ref)) {
        return juce::File(ref);
    }

    return projectRoot.getChildFile(ref);
}

juce::File resolveDefaultDspScriptFromProject(const juce::File& requestedPath) {
    if (!isProjectManifestFile(requestedPath)) {
        return {};
    }

    const auto json = juce::JSON::parse(requestedPath);
    if (!json.isObject()) {
        return {};
    }

    auto* obj = json.getDynamicObject();
    if (obj == nullptr || !obj->hasProperty("dsp")) {
        return {};
    }

    auto dspVar = obj->getProperty("dsp");
    if (!dspVar.isObject()) {
        return {};
    }

    auto* dspObj = dspVar.getDynamicObject();
    if (dspObj == nullptr || !dspObj->hasProperty("default")) {
        return {};
    }

    const auto dspRef = dspObj->getProperty("default").toString();
    if (dspRef.isEmpty()) {
        return {};
    }

    return resolveProjectAssetRef(requestedPath.getParentDirectory(), dspRef);
}

} // namespace

BehaviorCoreProcessor::BehaviorCoreProcessor()
    : juce::AudioProcessor(BusesProperties()
                     #if JucePlugin_IsMidiEffect
                               // VST3 MIDI processors still need a dummy audio callback path in
                               // a bunch of hosts. We advertise the plugin as MIDI-focused via
                               // metadata, but keep silent stereo buses so processBlock() runs.
                               .withInput("Input", juce::AudioChannelSet::stereo(), true)
                               .withOutput("Output", juce::AudioChannelSet::stereo(), true)
                     #else
                      #if ! JucePlugin_IsSynth || defined(MANIFOLD_EXPORT_FORCE_AUDIO_INPUT)
                               .withInput("Input", juce::AudioChannelSet::stereo(), true)
                      #endif
                      #if defined(MANIFOLD_EXPORT_NEEDS_SIDECHAIN)
                               .withInput("Sidechain", juce::AudioChannelSet::stereo(), false)
                      #endif
                               .withOutput("Output", juce::AudioChannelSet::stereo(), true)
                     #endif
                               ),
      primitiveGraph(std::make_shared<dsp_primitives::PrimitiveGraph>()),
      dspScriptHost(std::make_unique<DSPPluginScriptHost>()),
      midiManager_(std::make_shared<midi::MidiManager>()) {
    capturePluginConstructionBaseline();
    if (dspScriptHost) {
        dspScriptHost->initialise(this, "/core/behavior");
    }
    endpointRegistry.setNumLayers(MAX_LAYERS);
    initialiseExportPluginConfig();
    endpointRegistry.setBackendEnabled(!exportPluginConfig_.enabled);
    endpointRegistry.rebuild();
    initialiseHostParameters();
    registerExportPluginEndpoints();
    initialiseAtomicState(currentSampleRate.load(std::memory_order_relaxed));
}

bool BehaviorCoreProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
   #if JucePlugin_IsMidiEffect
    juce::ignoreUnused(layouts);
    return true;
   #else
    const auto mainOut = layouts.getMainOutputChannelSet();
    if (mainOut != juce::AudioChannelSet::mono() &&
        mainOut != juce::AudioChannelSet::stereo()) {
        return false;
    }

    const auto mainIn = layouts.getMainInputChannelSet();
   #if ! JucePlugin_IsSynth || defined(MANIFOLD_EXPORT_FORCE_AUDIO_INPUT)
    if (mainIn != juce::AudioChannelSet::disabled() &&
        mainIn != juce::AudioChannelSet::mono() &&
        mainIn != juce::AudioChannelSet::stereo()) {
        return false;
    }
   #else
    juce::ignoreUnused(mainIn);
   #endif

   #if defined(MANIFOLD_EXPORT_NEEDS_SIDECHAIN)
    const auto sidechainIn = layouts.getChannelSet(true, 1);
    if (sidechainIn != juce::AudioChannelSet::disabled() &&
        sidechainIn != juce::AudioChannelSet::mono() &&
        sidechainIn != juce::AudioChannelSet::stereo()) {
        return false;
    }
   #endif

    return true;
   #endif
}

BehaviorCoreProcessor::~BehaviorCoreProcessor() {
    if (hostParams_) {
        for (const auto& alias : exportPluginConfig_.paramAliases) {
            if (!alias.hostParamId.isEmpty()) {
                hostParams_->removeParameterListener(alias.hostParamId, this);
            }
        }
    }
    releaseResources();
}

void BehaviorCoreProcessor::initialiseExportPluginConfig() {
    auto& settings = Settings::getInstance();
    const juce::File uiTarget(settings.getDefaultUiScript());
    exportPluginConfig_ = manifold::export_plugin::resolveExportPluginConfig(uiTarget);
    if (!exportPluginConfig_.enabled) {
        return;
    }

    const auto initialState = manifold::export_plugin::makeExportUiInitialState(exportPluginConfig_);
    exportViewMode_.store(initialState.viewMode, std::memory_order_relaxed);
    exportEditorWidth_.store(initialState.editorWidth, std::memory_order_relaxed);
    exportEditorHeight_.store(initialState.editorHeight, std::memory_order_relaxed);
    exportSettingsVisible_.store(initialState.settingsVisible, std::memory_order_relaxed);
    exportDevVisible_.store(initialState.devVisible, std::memory_order_relaxed);
    exportOscEnabled_.store(initialState.oscEnabled, std::memory_order_relaxed);
    exportOscQueryEnabled_.store(initialState.oscQueryEnabled, std::memory_order_relaxed);
    exportOscInputPort_.store(initialState.oscInputPort, std::memory_order_relaxed);
    exportOscQueryPort_.store(initialState.oscQueryPort, std::memory_order_relaxed);
    exportXyXParam_.store(initialState.xyXParam, std::memory_order_relaxed);
    exportXyYParam_.store(initialState.xyYParam, std::memory_order_relaxed);
}

void BehaviorCoreProcessor::initialiseHostParameters() {
    if (!exportPluginConfig_.enabled) {
        hostParams_.reset();
        return;
    }

    hostParams_ = manifold::export_plugin::createHostParameterState(*this, exportPluginConfig_);
    manifold::export_plugin::bindHostParameterAliases(exportPluginConfig_, *hostParams_, *this);
}

void BehaviorCoreProcessor::registerExportPluginEndpoints() {
    if (!exportPluginConfig_.enabled) {
        return;
    }

    const auto& uiSpecs = manifold::export_plugin::getExportUiEndpointSpecs();
    for (const auto& spec : uiSpecs) {
        endpointRegistry.unregisterCustomEndpoint(spec.path);
    }
    for (const auto& alias : exportPluginConfig_.paramAliases) {
        endpointRegistry.unregisterCustomEndpoint(alias.path);
    }

    for (const auto& spec : uiSpecs) {
        OSCEndpoint endpoint;
        endpoint.path = spec.path;
        endpoint.type = "f";
        endpoint.rangeMin = spec.rangeMin;
        endpoint.rangeMax = spec.rangeMax;
        endpoint.access = spec.access;
        endpoint.description = spec.description;
        endpoint.category = "plugin-ui";
        endpoint.commandType = ControlCommand::Type::None;
        endpoint.layerIndex = -1;
        endpointRegistry.registerCustomEndpoint(endpoint);
    }

    for (const auto& alias : exportPluginConfig_.paramAliases) {
        OSCEndpoint endpoint;
        endpoint.path = alias.path;
        endpoint.type = alias.type;
        endpoint.rangeMin = alias.rangeMin;
        endpoint.rangeMax = alias.rangeMax;
        endpoint.access = 3;
        endpoint.description = alias.description;
        endpoint.category = "plugin-param";
        endpoint.commandType = ControlCommand::Type::None;
        endpoint.layerIndex = -1;
        endpointRegistry.registerCustomEndpoint(endpoint);
    }

    oscQueryServer.rebuildTree();
}

juce::String BehaviorCoreProcessor::resolveExportInternalPath(const juce::String& path) const {
    return manifold::export_plugin::resolveExportInternalPath(exportPluginConfig_, path);
}

BehaviorCoreProcessor::ExportParamAlias* BehaviorCoreProcessor::findExportAliasByPublicPath(const juce::String& path) {
    return manifold::export_plugin::findExportAliasByPublicPath(exportPluginConfig_, path);
}

const BehaviorCoreProcessor::ExportParamAlias* BehaviorCoreProcessor::findExportAliasByPublicPath(const juce::String& path) const {
    return manifold::export_plugin::findExportAliasByPublicPath(exportPluginConfig_, path);
}

BehaviorCoreProcessor::ExportParamAlias* BehaviorCoreProcessor::findExportAliasByHostParamId(const juce::String& hostParamId) {
    return manifold::export_plugin::findExportAliasByHostParamId(exportPluginConfig_, hostParamId);
}

const BehaviorCoreProcessor::ExportParamAlias* BehaviorCoreProcessor::findExportAliasByHostParamId(const juce::String& hostParamId) const {
    return manifold::export_plugin::findExportAliasByHostParamId(exportPluginConfig_, hostParamId);
}

bool BehaviorCoreProcessor::syncPublicPathToHostParameter(const juce::String& publicPath, float value) {
    return manifold::export_plugin::syncPublicPathToHostParameter(exportPluginConfig_, hostParams_.get(), publicPath, value);
}

void BehaviorCoreProcessor::applyHostParameterSnapshotToProcessor() {
    manifold::export_plugin::applyHostParameterSnapshotToProcessor(
        exportPluginConfig_,
        hostParams_.get(),
        [this](const std::string& path, float value) {
            setParamByPath(path, value);
        });
}

void BehaviorCoreProcessor::parameterChanged(const juce::String& parameterID, float newValue) {
    if (suppressHostParameterCallbacks_.load(std::memory_order_relaxed)) {
        return;
    }

    manifold::export_plugin::applyHostParameterChange(
        exportPluginConfig_,
        parameterID,
        newValue,
        [this](const std::string& path, float value) {
            setParamByPath(path, value);
        });
}

bool BehaviorCoreProcessor::applyExportPluginPath(const std::string& path, float value) {
    if (!exportPluginConfig_.enabled) {
        return false;
    }

    int viewMode = exportViewMode_.load(std::memory_order_relaxed);
    bool settingsVisible = exportSettingsVisible_.load(std::memory_order_relaxed);
    bool devVisible = exportDevVisible_.load(std::memory_order_relaxed);
    bool oscEnabled = exportOscEnabled_.load(std::memory_order_relaxed);
    bool oscQueryEnabled = exportOscQueryEnabled_.load(std::memory_order_relaxed);
    int xyXParam = exportXyXParam_.load(std::memory_order_relaxed);
    int xyYParam = exportXyYParam_.load(std::memory_order_relaxed);

    const auto uiResult = manifold::export_plugin::applyBasicExportUiPath(
        path,
        value,
        viewMode,
        settingsVisible,
        devVisible,
        oscEnabled,
        oscQueryEnabled,
        xyXParam,
        xyYParam);
    if (uiResult.handled) {
        exportViewMode_.store(viewMode, std::memory_order_relaxed);
        exportSettingsVisible_.store(settingsVisible, std::memory_order_relaxed);
        exportDevVisible_.store(devVisible, std::memory_order_relaxed);
        exportOscEnabled_.store(oscEnabled, std::memory_order_relaxed);
        exportOscQueryEnabled_.store(oscQueryEnabled, std::memory_order_relaxed);
        exportXyXParam_.store(xyXParam, std::memory_order_relaxed);
        exportXyYParam_.store(xyYParam, std::memory_order_relaxed);
        if (uiResult.needsOscRefresh) {
            applyExportOscSettings();
        }
        return true;
    }

    const juce::String publicPath(path);
    const auto internalPath = resolveExportInternalPath(publicPath);
    if (internalPath.isNotEmpty()) {
        if (syncPublicPathToHostParameter(publicPath, value)) {
            return true;
        }
        return setParamByPath(internalPath.toStdString(), value);
    }

    return false;
}

float BehaviorCoreProcessor::readExportPluginPath(const std::string& path) const {
    if (!exportPluginConfig_.enabled) {
        return 0.0f;
    }

    if (const auto value = manifold::export_plugin::readBasicExportUiPath(
            path,
            exportViewMode_.load(std::memory_order_relaxed),
            exportSettingsVisible_.load(std::memory_order_relaxed),
            exportDevVisible_.load(std::memory_order_relaxed),
            exportOscEnabled_.load(std::memory_order_relaxed),
            exportOscQueryEnabled_.load(std::memory_order_relaxed),
            exportOscInputPort_.load(std::memory_order_relaxed),
            exportOscQueryPort_.load(std::memory_order_relaxed),
            exportXyXParam_.load(std::memory_order_relaxed),
            exportXyYParam_.load(std::memory_order_relaxed))) {
        return *value;
    }

    if (const auto value = manifold::export_plugin_perf::readPerfPath(
            path, controlServer.getFrameTimings())) {
        return *value;
    }

    const auto* alias = findExportAliasByPublicPath(juce::String(path));
    if (alias != nullptr) {
        if (alias->rawHostValue != nullptr) {
            return alias->rawHostValue->load();
        }
        if (alias->internalPath.isNotEmpty()) {
            return getParamByPath(alias->internalPath.toStdString());
        }
    }

    return 0.0f;
}

void BehaviorCoreProcessor::applyExportOscSettings() {
    if (!exportPluginConfig_.enabled) {
        return;
    }

    const auto runtimeSettings = manifold::export_plugin::computeExportOscRuntimeSettings(
        exportPluginConfig_,
        exportOscEnabled_.load(std::memory_order_relaxed),
        exportOscQueryEnabled_.load(std::memory_order_relaxed),
        exportOscInputPort_.load(std::memory_order_relaxed),
        exportOscQueryPort_.load(std::memory_order_relaxed));

    exportOscInputPort_.store(runtimeSettings.oscPort, std::memory_order_relaxed);
    exportOscQueryPort_.store(runtimeSettings.queryPort, std::memory_order_relaxed);

    oscQueryServer.stop();
    oscServer.stop();

    OSCSettings settings;
    settings.inputPort = runtimeSettings.oscPort;
    settings.queryPort = runtimeSettings.queryPort;
    settings.oscEnabled = runtimeSettings.oscEnabled;
    settings.oscQueryEnabled = runtimeSettings.oscQueryEnabled;
    oscServer.setSettings(settings);
    oscServer.start(this);
    oscQueryServer.setContext(this, &endpointRegistry);
    if (runtimeSettings.oscQueryEnabled) {
        oscQueryServer.start(this, &endpointRegistry, runtimeSettings.queryPort, runtimeSettings.oscPort);
    }
}

void BehaviorCoreProcessor::capturePluginConstructionBaseline() {
    const auto snapshot = readProcessorMemorySnapshot();
    pluginBaselinePssBytes_.store(snapshot.pssBytes, std::memory_order_relaxed);
    pluginBaselinePrivateDirtyBytes_.store(snapshot.privateDirtyBytes, std::memory_order_relaxed);
    pluginBaselineHeapBytes_.store(snapshot.heapUsedBytes, std::memory_order_relaxed);
    pluginBaselineArenaBytes_.store(snapshot.arenaBytes, std::memory_order_relaxed);
}

void BehaviorCoreProcessor::captureLuaInitSnapshot() {
    const auto baselinePss = pluginBaselinePssBytes_.load(std::memory_order_relaxed);
    const auto baselinePriv = pluginBaselinePrivateDirtyBytes_.load(std::memory_order_relaxed);
    const auto snapshot = readProcessorMemorySnapshot();
    manifold::export_plugin::captureDeltaSnapshot(
        luaInitSnapshotCaptured_,
        baselinePss,
        baselinePriv,
        snapshot.pssBytes,
        snapshot.privateDirtyBytes,
        afterLuaInitDeltaPssBytes_,
        afterLuaInitDeltaPrivateDirtyBytes_);
}

void BehaviorCoreProcessor::captureBindingsSnapshot() {
    const auto baselinePss = pluginBaselinePssBytes_.load(std::memory_order_relaxed);
    const auto baselinePriv = pluginBaselinePrivateDirtyBytes_.load(std::memory_order_relaxed);
    const auto snapshot = readProcessorMemorySnapshot();
    manifold::export_plugin::captureDeltaSnapshot(
        bindingsSnapshotCaptured_,
        baselinePss,
        baselinePriv,
        snapshot.pssBytes,
        snapshot.privateDirtyBytes,
        afterBindingsDeltaPssBytes_,
        afterBindingsDeltaPrivateDirtyBytes_);
}

void BehaviorCoreProcessor::captureScriptLoadSnapshot() {
    const auto baselinePss = pluginBaselinePssBytes_.load(std::memory_order_relaxed);
    const auto baselinePriv = pluginBaselinePrivateDirtyBytes_.load(std::memory_order_relaxed);
    const auto snapshot = readProcessorMemorySnapshot();
    manifold::export_plugin::captureDeltaSnapshot(
        scriptLoadSnapshotCaptured_,
        baselinePss,
        baselinePriv,
        snapshot.pssBytes,
        snapshot.privateDirtyBytes,
        afterScriptLoadDeltaPssBytes_,
        afterScriptLoadDeltaPrivateDirtyBytes_);
}

void BehaviorCoreProcessor::captureDspLoadedSnapshot() {
    const auto baselinePss = pluginBaselinePssBytes_.load(std::memory_order_relaxed);
    const auto baselinePriv = pluginBaselinePrivateDirtyBytes_.load(std::memory_order_relaxed);
    const auto snapshot = readProcessorMemorySnapshot();
    manifold::export_plugin::captureDeltaSnapshot(
        dspLoadedSnapshotCaptured_,
        baselinePss,
        baselinePriv,
        snapshot.pssBytes,
        snapshot.privateDirtyBytes,
        afterDspDeltaPssBytes_,
        afterDspDeltaPrivateDirtyBytes_);
}

void BehaviorCoreProcessor::captureEditorOpenSnapshot() {
    const auto baselinePss = pluginBaselinePssBytes_.load(std::memory_order_relaxed);
    const auto baselinePriv = pluginBaselinePrivateDirtyBytes_.load(std::memory_order_relaxed);
    const auto snapshot = readProcessorMemorySnapshot();
    manifold::export_plugin::captureEditorOpenSnapshot(
        editorOpenSnapshotCaptured_,
        baselinePss,
        baselinePriv,
        snapshot.pssBytes,
        snapshot.privateDirtyBytes,
        snapshot.heapUsedBytes,
        editorOpenPssBytes_,
        editorOpenPrivateDirtyBytes_,
        editorOpenHeapBytes_,
        afterUiOpenDeltaPssBytes_,
        afterUiOpenDeltaPrivateDirtyBytes_);
}

void BehaviorCoreProcessor::captureUiIdleSnapshot() {
    const auto baselinePss = pluginBaselinePssBytes_.load(std::memory_order_relaxed);
    const auto baselinePriv = pluginBaselinePrivateDirtyBytes_.load(std::memory_order_relaxed);
    const auto snapshot = readProcessorMemorySnapshot();
    manifold::export_plugin::captureDeltaSnapshot(
        uiIdleSnapshotCaptured_,
        baselinePss,
        baselinePriv,
        snapshot.pssBytes,
        snapshot.privateDirtyBytes,
        afterUiIdleDeltaPssBytes_,
        afterUiIdleDeltaPrivateDirtyBytes_);
}

bool BehaviorCoreProcessor::hasExportPluginConfig() const {
    return exportPluginConfig_.enabled;
}

int BehaviorCoreProcessor::getExportViewMode() const {
    return exportViewMode_.load(std::memory_order_relaxed);
}

int BehaviorCoreProcessor::getExportCompactWidth() const {
    return exportPluginConfig_.compactWidth;
}

int BehaviorCoreProcessor::getExportCompactHeight() const {
    return exportPluginConfig_.compactHeight;
}

int BehaviorCoreProcessor::getExportSplitWidth() const {
    return exportPluginConfig_.splitWidth;
}

int BehaviorCoreProcessor::getExportSplitHeight() const {
    return exportPluginConfig_.splitHeight;
}

int BehaviorCoreProcessor::getExportEditorWidth() const {
    return exportEditorWidth_.load(std::memory_order_relaxed);
}

int BehaviorCoreProcessor::getExportEditorHeight() const {
    return exportEditorHeight_.load(std::memory_order_relaxed);
}

int64_t BehaviorCoreProcessor::getPrimaryDspScriptSizeBytes() const {
    return (dspScriptHost && dspScriptHost->getCurrentScriptFile().existsAsFile())
               ? static_cast<int64_t>(dspScriptHost->getCurrentScriptFile().getSize())
               : 0;
}

juce::File BehaviorCoreProcessor::getPrimaryDspScriptFile() const {
    return dspScriptHost ? dspScriptHost->getCurrentScriptFile() : juce::File();
}

juce::AudioProcessorValueTreeState* BehaviorCoreProcessor::getHostParameterState() const {
    return hostParams_.get();
}

bool BehaviorCoreProcessor::isExportSettingsVisible() const {
    return exportSettingsVisible_.load(std::memory_order_relaxed);
}

void BehaviorCoreProcessor::setExportEditorSize(int width, int height) {
    if (!exportPluginConfig_.enabled) {
        return;
    }
    exportEditorWidth_.store(std::max(1, width), std::memory_order_relaxed);
    exportEditorHeight_.store(std::max(1, height), std::memory_order_relaxed);
}

void BehaviorCoreProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    currentSampleRate.store(sampleRate > 0.0 ? sampleRate : 44100.0,
                            std::memory_order_relaxed);
    currentBlockSize.store(samplesPerBlock > 0 ? samplesPerBlock : 512,
                           std::memory_order_relaxed);
    playTimeSamples.store(0.0, std::memory_order_relaxed);

    const int captureSamples = static_cast<int>(CAPTURE_SECONDS * currentSampleRate.load(std::memory_order_relaxed));
    captureBuffer.setSize(captureSamples);
    captureBuffer.setNumChannels(2);

    const int graphChannels = juce::jmax(1, getGraphOutputChannels());
    graphWetBuffer.setSize(graphChannels, currentBlockSize.load(std::memory_order_relaxed), false, true, true);
    monitorInputBuffer.setSize(graphChannels, currentBlockSize.load(std::memory_order_relaxed), false, true, true);
    sidechainInputBuffer.setSize(graphChannels, currentBlockSize.load(std::memory_order_relaxed), false, true, true);
    forwardScheduled = false;
    forwardFireAtSample = 0.0;
    forwardScheduledBars = 0.0f;

    endpointRegistry.setNumLayers(MAX_LAYERS);
    endpointRegistry.rebuild();

    controlServer.start(this);

    auto& coreSettings = Settings::getInstance();

    if (dspScriptHost && !dspScriptHost->isLoaded()) {
        const juce::File defaultUiTarget(coreSettings.getDefaultUiScript());
        const juce::File projectDspScript = resolveDefaultDspScriptFromProject(defaultUiTarget);

        if (projectDspScript.existsAsFile()) {
            if (!loadDspScript(projectDspScript)) {
                std::fprintf(stderr,
                             "BehaviorCoreProcessor: failed to load project DSP script '%s': %s\n",
                             projectDspScript.getFullPathName().toRawUTF8(),
                             getDspScriptLastError().c_str());
            }
        } else {
            const auto dspScriptsDir = coreSettings.getDspScriptsDir();
            if (dspScriptsDir.isEmpty()) {
                std::fprintf(stderr,
                             "BehaviorCoreProcessor: settings.dspScriptsDir is empty; default DSP script not loaded\n");
            } else {
                const juce::File defaultDspScript =
                    juce::File(dspScriptsDir).getChildFile("looper_primitives_dsp.lua");
                if (!defaultDspScript.existsAsFile()) {
                    std::fprintf(stderr,
                                 "BehaviorCoreProcessor: configured default DSP script missing: %s\n"
                                 "  -> Configure dspScriptsDir in .manifold.settings.json in the repo root.\n",
                                 defaultDspScript.getFullPathName().toRawUTF8());
                } else if (!loadDspScript(defaultDspScript)) {
                    std::fprintf(stderr,
                                 "BehaviorCoreProcessor: failed to load default DSP script: %s\n",
                                 getDspScriptLastError().c_str());
                }
            }
        }
    }

    applyHostParameterSnapshotToProcessor();

    // Primitives behavior runtime is graph-driven; keep graph active by default.
    graphProcessingEnabled.store(true, std::memory_order_relaxed);

    if (exportPluginConfig_.enabled) {
        applyExportOscSettings();
    } else {
        OSCSettings oscSettings = OSCSettingsPersistence::load();
        auto settingsFile = OSCSettingsPersistence::getSettingsFile();
        if (!settingsFile.existsAsFile()) {
            oscSettings.oscEnabled = true;
            oscSettings.oscQueryEnabled = true;
            oscSettings.inputPort = 9000;
            oscSettings.queryPort = 9001;
            OSCSettingsPersistence::save(oscSettings);
        }

        oscServer.setSettings(oscSettings);
        oscServer.start(this);
        oscQueryServer.setContext(this, &endpointRegistry);

        if (oscSettings.oscQueryEnabled) {
            oscQueryServer.start(this, &endpointRegistry, oscSettings.queryPort,
                                 oscSettings.inputPort);
        }
    }

    initialiseAtomicState(currentSampleRate.load(std::memory_order_relaxed));

    // Initialize Ableton Link (enabled by default)
    linkSync.initialise(currentSampleRate.load(std::memory_order_relaxed));
    linkSync.setEnabled(true);
    linkSync.setTempoSyncEnabled(true);

    captureDspLoadedSnapshot();
}

void BehaviorCoreProcessor::releaseResources() {
    // Shutdown Ableton Link first
    linkSync.shutdown();
    oscQueryServer.stop();
    oscServer.stop();
    controlServer.stop();

    drainRetiredGraphRuntimes();

    if (auto* pending = pendingRuntime.exchange(nullptr, std::memory_order_acq_rel)) {
        delete pending;
    }

    if (pendingRetireRuntime != nullptr) {
        delete pendingRetireRuntime;
        pendingRetireRuntime = nullptr;
    }

    if (activeRuntime != nullptr) {
        delete activeRuntime;
        activeRuntime = nullptr;
    }
}

void BehaviorCoreProcessor::processBlock(juce::AudioBuffer<float>& buffer,
                                         juce::MidiBuffer& midiMessages) {
    juce::ScopedNoDenormals noDenormals;
    const auto dspStart = std::chrono::steady_clock::now();

    // Process incoming MIDI from host/plugin.
    // Do not mirror host input into midiInputRing here; that ring is reserved for
    // hardware MIDI callbacks and otherwise host MIDI gets fed back into the
    // MidiManager a second time.
    processMidiInput(midiMessages, false);

    // By default, consume incoming host MIDI and only write explicit output MIDI.
    // If MIDI thru is enabled, preserve the original incoming events.
    if (!midiThruEnabled) {
        midiMessages.clear();
    }
    
    // Also process MIDI from hardware device (written to ring buffer by handleIncomingMidiMessage)
    juce::MidiBuffer hardwareMidi;
    uint8_t status, data1, data2;
    int32_t timestamp;
    while (midiInputRing.read(status, data1, data2, timestamp)) {
        hardwareMidi.addEvent(juce::MidiMessage(status, data1, data2), 0);
    }
    if (!hardwareMidi.isEmpty()) {
        processMidiInput(hardwareMidi, false);
    }

    processControlCommands();
    checkGraphRuntimeSwap();

    // Process Ableton Link - updates tempo from network if sync enabled
    const int numSamples = buffer.getNumSamples();
    if (linkSync.processAudio(numSamples)) {
        // Tempo was updated from Link, update atomic state and forward to DSP
        auto controlState = manifold::control_state_view::BehaviorControlStateView(
            controlServer.getBehaviorControlState());
        auto runtimeTelemetry =
            manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryView(
                controlServer.getBehaviorRuntimeTelemetry());
        const double linkTempo = linkSync.getTempo();
        controlState.setTempo(static_cast<float>(linkTempo));
        runtimeTelemetry.setTempo(static_cast<float>(linkTempo));
        runtimeTelemetry.setSamplesPerBar(computeSamplesPerBar(
            static_cast<float>(linkTempo),
            currentSampleRate.load(std::memory_order_relaxed)));
        // Forward tempo change to DSP script
        if (dspScriptHost) {
            (void)dspScriptHost->setParam("/core/behavior/tempo", static_cast<float>(linkTempo));
        }
        for (auto& entry : dspSlots) {
            auto* host = entry.second.get();
            if (host != nullptr) {
                (void)host->setParam("/core/behavior/tempo", static_cast<float>(linkTempo));
            }
        }
    }

    const int numChannels = buffer.getNumChannels();
    float* outL = numChannels > 0 ? buffer.getWritePointer(0) : nullptr;
    float* outR = numChannels > 1 ? buffer.getWritePointer(1) : outL;

    auto controlState = manifold::control_state_view::BehaviorControlStateView(
        controlServer.getBehaviorControlState());
    auto runtimeTelemetry =
        manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryView(
            controlServer.getBehaviorRuntimeTelemetry());

    auto mainInputBus = getBusCount(true) > 0 ? getBusBuffer(buffer, true, 0)
                                              : juce::AudioBuffer<float>();
    const int mainInputChannels = mainInputBus.getNumChannels();
    const int mainBusChannels = juce::jmax(mainInputChannels, juce::jmax(1, getTotalNumOutputChannels()));

   #if JucePlugin_IsMidiEffect
    {
        buffer.clear();
        runtimeTelemetry.setGraphEnabled(false);
        runtimeTelemetry.setCaptureLevel(0.0f);

        if (dspScriptHost && dspScriptHost->isLoaded()) {
            dspScriptHost->process(numSamples, currentSampleRate.load());
        }
        for (auto& entry : dspSlots) {
            auto* host = entry.second.get();
            if (host && host->isLoaded()) {
                host->process(numSamples, currentSampleRate.load());
            }
        }

        const double nextPlayTime =
            playTimeSamples.load(std::memory_order_relaxed) + numSamples;
        playTimeSamples.store(nextPlayTime, std::memory_order_relaxed);
        runtimeTelemetry.setPlayTime(nextPlayTime);

        const double sr = currentSampleRate.load(std::memory_order_relaxed);
        runtimeTelemetry.setUptimeSeconds(sr > 0.0 ? nextPlayTime / sr : 0.0);

        drainMidiOutput(midiMessages);

        const auto dspEnd = std::chrono::steady_clock::now();
        const auto dspUs = std::chrono::duration_cast<std::chrono::microseconds>(dspEnd - dspStart).count();
        if (auto* timings = controlServer.getFrameTimings()) {
            updateTimingStage(timings->dsp, dspUs);
        }
        return;
    }
   #endif

    // Input volume controls level going into looper (capture + graph)
    const float inputVolume = controlState.inputVolume();

    // Capture-plane source comes from the main host input bus before any wet/dry mixing.
    const float* captureL = mainInputChannels > 0 ? mainInputBus.getReadPointer(0) : nullptr;
    const float* captureR = mainInputChannels > 1 ? mainInputBus.getReadPointer(1) : captureL;

    // Capture-plane source buffer is always fed from incoming input stream
    // (or injected stream when INJECT is active), before any wet/dry mixing.
    // Apply inputVolume to capture so input knob controls what goes into looper.
    if (controlServer.isInjecting()) {
        controlServer.drainInjection(captureBuffer, numSamples, inputVolume);
    } else if (captureL != nullptr) {
        captureBuffer.writeBlock(captureL, numSamples, 0, inputVolume);
        if (captureR != nullptr) {
            captureBuffer.writeBlock(captureR, numSamples, 1, inputVolume);
        }
    }

    runtimeTelemetry.setCaptureSize(captureBuffer.getSize());
    runtimeTelemetry.setCaptureWritePos(captureBuffer.getOffsetToNow());
    const float wetGain = controlState.masterVolume();

    const bool graphEnabled = graphProcessingEnabled.load(std::memory_order_relaxed);
    runtimeTelemetry.setGraphEnabled(graphEnabled);

    const bool canProcessGraph =
        graphEnabled &&
        activeRuntime != nullptr &&
        graphWetBuffer.getNumChannels() >= mainBusChannels &&
        graphWetBuffer.getNumSamples() >= numSamples &&
        monitorInputBuffer.getNumChannels() >= mainBusChannels &&
        monitorInputBuffer.getNumSamples() >= numSamples;
    const bool mutationPauseRequested =
        graphMutationPauseRequested.load(std::memory_order_acquire);

    if (canProcessGraph && !mutationPauseRequested) {
        graphProcessDepth.fetch_add(1, std::memory_order_acq_rel);
        // INPUT -> INPUT-DSP: always active at inputVolume.
        for (int ch = 0; ch < mainBusChannels; ++ch) {
            if (mainInputChannels > 0) {
                const int srcCh = juce::jmin(ch, mainInputChannels - 1);
                graphWetBuffer.copyFrom(ch, 0, mainInputBus, srcCh, 0, numSamples);
                graphWetBuffer.applyGain(ch, 0, numSamples, inputVolume);
            } else {
                graphWetBuffer.clear(ch, 0, numSamples);
            }
        }

        // INPUT-DSP -> Monitor branch: monitor-toggle-controlled source.
        const bool passthroughEnabled = controlState.passthroughEnabled();
        const float monitorInputGain = passthroughEnabled ? inputVolume : 0.0f;
        for (int ch = 0; ch < mainBusChannels; ++ch) {
            if (mainInputChannels > 0) {
                const int srcCh = juce::jmin(ch, mainInputChannels - 1);
                monitorInputBuffer.copyFrom(ch, 0, mainInputBus, srcCh, 0, numSamples);
                monitorInputBuffer.applyGain(ch, 0, numSamples, monitorInputGain);
            } else {
                monitorInputBuffer.clear(ch, 0, numSamples);
            }
        }

        float* wetPtrs[2] = {
            graphWetBuffer.getWritePointer(0),
            graphWetBuffer.getNumChannels() > 1 ? graphWetBuffer.getWritePointer(1)
                                                : graphWetBuffer.getWritePointer(0)};
        juce::AudioBuffer<float> wetView(wetPtrs, juce::jmax(1, mainBusChannels), numSamples);

        const juce::AudioBuffer<float>* sidechainPtr = nullptr;
       #if defined(MANIFOLD_EXPORT_NEEDS_SIDECHAIN)
        if (getBusCount(true) > 1 && getBus(true, 1) != nullptr && getBus(true, 1)->isEnabled() &&
            sidechainInputBuffer.getNumChannels() > 0 &&
            sidechainInputBuffer.getNumSamples() >= numSamples) {
            auto sidechainBus = getBusBuffer(buffer, true, 1);
            const int sidechainChannels = sidechainBus.getNumChannels();
            const int destChannels = sidechainInputBuffer.getNumChannels();
            for (int ch = 0; ch < destChannels; ++ch) {
                if (sidechainChannels > 0) {
                    const int srcCh = juce::jmin(ch, sidechainChannels - 1);
                    sidechainInputBuffer.copyFrom(ch, 0, sidechainBus, srcCh, 0, numSamples);
                    sidechainInputBuffer.applyGain(ch, 0, numSamples, inputVolume);
                } else {
                    sidechainInputBuffer.clear(ch, 0, numSamples);
                }
            }
            sidechainPtr = &sidechainInputBuffer;
        }
       #endif

        activeRuntime->setMonitorEnabled(passthroughEnabled);
        activeRuntime->process(wetView, &monitorInputBuffer, sidechainPtr);

        if (outL == nullptr) {
            buffer.clear();
        } else {
            const float* wetL = graphWetBuffer.getReadPointer(0);
            const float* wetR = graphWetBuffer.getNumChannels() > 1
                                    ? graphWetBuffer.getReadPointer(1)
                                    : wetL;

            for (int i = 0; i < numSamples; ++i) {
                outL[i] = wetL[i] * wetGain;
                if (outR != nullptr && outR != outL) {
                    outR[i] = wetR[i] * wetGain;
                }
            }
        }

        if (graphProcessDepth.fetch_sub(1, std::memory_order_acq_rel) == 1) {
            std::lock_guard<std::mutex> lock(graphMutationMutex);
            graphMutationCv.notify_all();
        }
    } else {
        // No graph enabled - passthrough toggle controls direct input monitoring.
        // When ON: hear input at inputVolume level. When OFF: silence.
        const bool passthroughEnabled = controlState.passthroughEnabled();
        const float passthroughGain = passthroughEnabled ? inputVolume : 0.0f;
        if (outL == nullptr) {
            buffer.clear();
        } else {
            for (int i = 0; i < numSamples; ++i) {
                outL[i] *= passthroughGain;
                if (outR != nullptr && outR != outL) {
                    outR[i] *= passthroughGain;
                }
            }
        }
    }

    if (!mutationPauseRequested) {
        if (dspScriptHost && dspScriptHost->isLoaded()) {
            dspScriptHost->process(numSamples, currentSampleRate.load());
        }
        for (auto& entry : dspSlots) {
            auto* host = entry.second.get();
            if (host && host->isLoaded()) {
                host->process(numSamples, currentSampleRate.load());
            }
        }
    }

    runtimeTelemetry.setCaptureLevel(mainInputChannels > 0 ? computeBufferRms(mainInputBus)
                                                            : 0.0f);

    for (int i = 0; i < MAX_LAYERS; ++i) {
        const auto layerState = static_cast<ScriptableLayerState>(
            runtimeTelemetry.layerState(i));
        if (layerState != ScriptableLayerState::Playing &&
            layerState != ScriptableLayerState::Overdubbing) {
            continue;
        }

        const int length = runtimeTelemetry.layerLength(i);
        if (length <= 0) {
            continue;
        }

        const float speed = std::abs(controlState.layerSpeed(i));
        if (speed <= 0.0001f) {
            continue;
        }
        const int delta = std::max(1, static_cast<int>(std::round(speed * numSamples)));

        int pos = runtimeTelemetry.layerPlayheadPos(i);
        if (controlState.layerReversed(i)) {
            pos -= delta;
            while (pos < 0) {
                pos += length;
            }
        } else {
            pos += delta;
            while (pos >= length) {
                pos -= length;
            }
        }

        runtimeTelemetry.setLayerPlayheadPos(i, pos);
    }

    const double nextPlayTime =
        playTimeSamples.load(std::memory_order_relaxed) + numSamples;
    playTimeSamples.store(nextPlayTime, std::memory_order_relaxed);

    runtimeTelemetry.setPlayTime(nextPlayTime);

    scheduleForwardCommitIfNeeded();
    if (forwardScheduled && nextPlayTime >= forwardFireAtSample) {
        (void)setParamByPath("/core/behavior/forwardFire", 1.0f);
        forwardScheduled = false;
        forwardFireAtSample = 0.0;
        forwardScheduledBars = 0.0f;
    }

    const double sr = currentSampleRate.load(std::memory_order_relaxed);
    runtimeTelemetry.setUptimeSeconds(sr > 0.0 ? nextPlayTime / sr : 0.0);

    // Write output to recording audio ring buffer if active
    if (controlServer.isRecording()) {
        const int outChannels = buffer.getNumChannels();
        const float* outL = buffer.getReadPointer(0);
        const float* outR = outChannels > 1 ? buffer.getReadPointer(1) : outL;
        controlServer.writeAudioSamples(outL, outR, numSamples);
    }

    // Drain MIDI output messages to host MIDI buffer
    drainMidiOutput(midiMessages);

    const auto dspEnd = std::chrono::steady_clock::now();
    const auto dspUs = std::chrono::duration_cast<std::chrono::microseconds>(dspEnd - dspStart).count();
    if (auto* timings = controlServer.getFrameTimings()) {
        updateTimingStage(timings->dsp, dspUs);
    }
}

juce::AudioProcessorEditor* BehaviorCoreProcessor::createEditor() {
    return new BehaviorCoreEditor(*this, rootModeFromEnvironmentOrState(controlServer));
}

std::optional<juce::Image> BehaviorCoreProcessor::captureEditorScreenshot() {
    // Try to get existing editor
    if (auto* editor = getActiveEditor()) {
        // Create a snapshot of the editor
        const int w = editor->getWidth();
        const int h = editor->getHeight();
        if (w > 0 && h > 0) {
            // Use JUCE's component snapshot
            return editor->createComponentSnapshot(juce::Rectangle<int>(0, 0, w, h), true, 1.0f);
        }
    }
    return std::nullopt;
}

bool BehaviorCoreProcessor::postControlCommandPayload(
    const ControlCommand& command) {
    return controlServer.enqueueCommand(command);
}

bool BehaviorCoreProcessor::postControlCommand(ControlCommand::Type type,
                                               int intParam,
                                               float floatParam) {
    ControlCommand cmd;
    cmd.operation = ControlOperation::Legacy;
    cmd.type = type;
    cmd.intParam = intParam;
    cmd.floatParam = floatParam;
    return postControlCommandPayload(cmd);
}

void BehaviorCoreProcessor::requestGraphRuntimeSwap(
    std::unique_ptr<dsp_primitives::GraphRuntime> runtime) {
    manifold::graph_runtime_support::requestGraphRuntimeSwap(pendingRuntime,
                                                             std::move(runtime));
}

void BehaviorCoreProcessor::beginGraphMutation() {
    manifold::graph_runtime_support::beginGraphMutation(
        graphMutationMutex,
        graphMutationPauseRequested,
        graphProcessingEnabled,
        graphMutationRestoreEnabled,
        controlServer,
        graphMutationCv,
        graphProcessDepth);
}

void BehaviorCoreProcessor::endGraphMutation() {
    manifold::graph_runtime_support::endGraphMutation(
        graphMutationMutex,
        graphMutationPauseRequested,
        graphProcessingEnabled,
        graphMutationRestoreEnabled,
        controlServer,
        graphMutationCv);
}

DSPPluginScriptHost& BehaviorCoreProcessor::getOrCreateSlot(const std::string& slot) {
    return manifold::dsp_slot_support::getOrCreateSlot(
        dspScriptHost.get(), dspSlots, this, slot);
}

// --- Default slot (legacy compat) ---

bool BehaviorCoreProcessor::loadDspScript(const juce::File& scriptFile) {
    return manifold::dsp_slot_support::loadDefaultDspScript(
        dspScriptHost.get(), scriptFile, dspScriptLastError);
}

bool BehaviorCoreProcessor::loadDspScriptFromString(const std::string& luaCode,
                                                    const std::string& sourceName) {
    return manifold::dsp_slot_support::loadDefaultDspScriptFromString(
        dspScriptHost.get(), luaCode, sourceName, dspScriptLastError);
}

bool BehaviorCoreProcessor::reloadDspScript() {
    return manifold::dsp_slot_support::reloadDefaultDspScript(
        dspScriptHost.get(), dspScriptLastError);
}

bool BehaviorCoreProcessor::isDspScriptLoaded() const {
    return manifold::dsp_slot_support::isDspScriptLoaded(dspScriptHost.get());
}

// --- Named slot API ---

bool BehaviorCoreProcessor::loadDspScript(const juce::File& scriptFile,
                                          const std::string& slot) {
    return manifold::dsp_slot_support::loadNamedDspScript(
        dspScriptHost.get(), dspSlots, this, scriptFile, slot, dspScriptLastError);
}

bool BehaviorCoreProcessor::loadDspScriptFromString(const std::string& luaCode,
                                                    const std::string& sourceName,
                                                    const std::string& slot) {
    return manifold::dsp_slot_support::loadNamedDspScriptFromString(
        dspScriptHost.get(), dspSlots, this, luaCode, sourceName, slot,
        dspScriptLastError);
}

bool BehaviorCoreProcessor::reloadDspScript(const std::string& slot) {
    return manifold::dsp_slot_support::reloadNamedDspScript(
        dspScriptHost.get(), dspSlots, slot, dspScriptLastError);
}

bool BehaviorCoreProcessor::unloadDspSlot(const std::string& slot) {
    return manifold::dsp_slot_support::unloadNamedDspSlot(dspSlots, slot);
}

void BehaviorCoreProcessor::drainPendingSlotDestroy() {
    manifold::dsp_slot_support::drainPendingSlotDestroy();
}

bool BehaviorCoreProcessor::isDspSlotLoaded(const std::string& slot) const {
    return manifold::dsp_slot_support::isDspSlotLoaded(
        dspScriptHost.get(), dspSlots, slot);
}

const std::string& BehaviorCoreProcessor::getDspScriptLastError() const {
    return manifold::dsp_slot_support::getDspScriptLastError(
        dspScriptHost.get(), dspScriptLastError);
}

void BehaviorCoreProcessor::drainRetiredGraphRuntimes() {
    manifold::graph_runtime_support::drainRetiredGraphRuntimes(
        retiredRuntimeDrainMutex, retireQueue);
}

std::shared_ptr<dsp_primitives::IPrimitiveNode>
BehaviorCoreProcessor::getGraphNodeByPath(const std::string& path) {
    return manifold::dsp_slot_support::getGraphNodeByPath(
        dspScriptHost.get(), dspSlots, path);
}

bool BehaviorCoreProcessor::extractLayerParam(const std::string& path,
                                              int& layerIndex,
                                              std::string& paramSuffix) {
    return manifold::behavior_param_support::extractLayerParam(
        path, MAX_LAYERS, layerIndex, paramSuffix);
}

bool BehaviorCoreProcessor::applyParamPath(const std::string& path, float value) {
    return manifold::behavior_param_support::applyParamPath(
        path,
        value,
        MAX_LAYERS,
        controlServer,
        currentSampleRate,
        linkSync,
        graphProcessingEnabled,
        dspScriptHost.get(),
        forwardScheduled,
        forwardFireAtSample,
        forwardScheduledBars,
        [this]() { scheduleForwardCommitIfNeeded(); },
        [this]() { return getSamplesPerBar(); });
}

bool BehaviorCoreProcessor::setParamByPath(const std::string& path, float value) {
    if (applyExportPluginPath(path, value)) {
        return true;
    }

    if (path == "/core/behavior/dsp/reload") {
        if (value > 0.5f) {
            return reloadDspScript();
        }
        return true;
    }

    bool handled = false;

    if (dspScriptHost && dspScriptHost->hasParam(path)) {
        handled = dspScriptHost->setParam(path, value) || handled;
    }

    for (auto& entry : dspSlots) {
        auto* host = entry.second.get();
        if (host != nullptr && host->hasParam(path)) {
            handled = host->setParam(path, value) || handled;
        }
    }

    if (applyParamPath(path, value)) {
        handled = true;
    }

    if (handled) {
        return true;
    }

    const auto endpoint = endpointRegistry.findEndpoint(juce::String(path));
    return endpoint.path.isNotEmpty();
}

float BehaviorCoreProcessor::getParamByPath(const std::string& path) const {
    if (exportPluginConfig_.enabled) {
        const float exportValue = readExportPluginPath(path);
        if (path.rfind("/plugin/", 0) == 0 ||
            resolveExportInternalPath(juce::String(path)).isNotEmpty()) {
            return exportValue;
        }
    }

    if (path == "/core/behavior/dsp/reload") {
        return 0.0f;
    }

    return manifold::behavior_param_support::readCoreParamPath(
        path,
        MAX_LAYERS,
        controlServer,
        graphProcessingEnabled,
        linkSync,
        dspScriptHost.get(),
        dspSlots);
}

bool BehaviorCoreProcessor::hasEndpoint(const std::string& path) const {
    if (path == "/core/behavior/dsp/reload") {
        return true;
    }

    if (exportPluginConfig_.enabled) {
        if (path.rfind("/plugin/", 0) == 0 ||
            resolveExportInternalPath(juce::String(path)).isNotEmpty()) {
            const auto endpoint = endpointRegistry.findEndpoint(juce::String(path));
            if (endpoint.path.isNotEmpty()) {
                return true;
            }
        }
    }

    return manifold::behavior_param_support::hasCoreEndpoint(
        path, endpointRegistry, dspScriptHost.get(), dspSlots);
}

bool BehaviorCoreProcessor::getLayerSnapshot(int index,
                                             ScriptableLayerSnapshot& out) const {
    return manifold::behavior_query_support::getLayerSnapshot(
        index, MAX_LAYERS, controlServer, dspScriptHost.get(), out);
}

int BehaviorCoreProcessor::getCaptureSize() const {
    return manifold::behavior_query_support::getCaptureSize(captureBuffer);
}

bool BehaviorCoreProcessor::computeLayerPeaks(int layerIndex, int numBuckets,
                                              std::vector<float>& outPeaks) const {
    return manifold::behavior_query_support::computeLayerPeaks(
        layerIndex, numBuckets, MAX_LAYERS, dspScriptHost.get(), outPeaks);
}

bool BehaviorCoreProcessor::computeLayerPeaksForPath(const std::string& pathBase,
                                                     int layerIndex,
                                                     int numBuckets,
                                                     std::vector<float>& outPeaks) const {
    return manifold::behavior_query_support::computeLayerPeaksForPath(
        pathBase, layerIndex, numBuckets, MAX_LAYERS, dspScriptHost.get(),
        dspSlots, outPeaks);
}

bool BehaviorCoreProcessor::computeCapturePeaks(int startAgo, int endAgo,
                                                int numBuckets,
                                                std::vector<float>& outPeaks) const {
    return manifold::behavior_query_support::computeCapturePeaks(
        captureBuffer, startAgo, endAgo, numBuckets, outPeaks);
}

bool BehaviorCoreProcessor::computeSynthSamplePeaks(int numBuckets,
                                                    std::vector<float>& outPeaks) const {
    return manifold::behavior_query_support::computeSynthSamplePeaks(
        dspScriptHost.get(), numBuckets, outPeaks);
}

bool BehaviorCoreProcessor::computeDynamicSamplePeaks(int slotIndex,
                                                      int numBuckets,
                                                      std::vector<float>& outPeaks) const {
    return manifold::behavior_query_support::computeDynamicSamplePeaks(
        dspScriptHost.get(), slotIndex, numBuckets, outPeaks);
}

std::vector<float> BehaviorCoreProcessor::getVoiceSamplePositions() const {
    return manifold::behavior_query_support::getVoiceSamplePositions(
        dspScriptHost.get());
}

std::vector<float> BehaviorCoreProcessor::getDynamicSampleVoicePositions(int slotIndex) const {
    return manifold::behavior_query_support::getDynamicSampleVoicePositions(
        dspScriptHost.get(), slotIndex);
}

bool BehaviorCoreProcessor::getLatestSampleAnalysis(dsp_primitives::SampleAnalysis& outAnalysis) const {
    return manifold::behavior_query_support::getLatestSampleAnalysis(
        dspScriptHost.get(), outAnalysis);
}

bool BehaviorCoreProcessor::getLatestSamplePartials(dsp_primitives::PartialData& outPartials) const {
    return manifold::behavior_query_support::getLatestSamplePartials(
        dspScriptHost.get(), outPartials);
}

bool BehaviorCoreProcessor::getSampleDerivedAdditiveDebug(int voiceIndex,
                                                          SampleDerivedAdditiveDebugState& outState) const {
    return manifold::behavior_query_support::getSampleDerivedAdditiveDebug(
        dspScriptHost.get(), voiceIndex, outState);
}

bool BehaviorCoreProcessor::refreshSampleDerivedAdditiveDebug(SampleDerivedAdditiveDebugState& outState) {
    return manifold::behavior_query_support::refreshSampleDerivedAdditiveDebug(
        dspScriptHost.get(), outState);
}

bool BehaviorCoreProcessor::ensureDynamicModuleSlot(const std::string& specId, int slotIndex) {
    return manifold::behavior_query_support::ensureDynamicModuleSlot(
        dspScriptHost.get(), specId, slotIndex);
}

float BehaviorCoreProcessor::getTempo() const {
    return manifold::behavior_query_support::getTempo(controlServer);
}

float BehaviorCoreProcessor::getTargetBPM() const {
    return manifold::behavior_query_support::getTargetBPM(controlServer);
}

float BehaviorCoreProcessor::getSamplesPerBar() const {
    return manifold::behavior_query_support::getSamplesPerBar(
        controlServer, currentSampleRate.load(std::memory_order_relaxed));
}

double BehaviorCoreProcessor::getSampleRate() const {
    return currentSampleRate.load(std::memory_order_relaxed);
}

float BehaviorCoreProcessor::getMasterVolume() const {
    return manifold::behavior_query_support::getMasterVolume(controlServer);
}

float BehaviorCoreProcessor::getInputVolume() const {
    return manifold::behavior_query_support::getInputVolume(controlServer);
}

bool BehaviorCoreProcessor::isPassthroughEnabled() const {
    return manifold::behavior_query_support::isPassthroughEnabled(controlServer);
}

bool BehaviorCoreProcessor::isRecording() const {
    return manifold::behavior_query_support::isRecording(controlServer);
}

bool BehaviorCoreProcessor::isOverdubEnabled() const {
    return manifold::behavior_query_support::isOverdubEnabled(controlServer);
}

int BehaviorCoreProcessor::getActiveLayerIndex() const {
    return manifold::behavior_query_support::getActiveLayerIndex(controlServer);
}

bool BehaviorCoreProcessor::isForwardCommitArmed() const {
    return manifold::behavior_query_support::isForwardCommitArmed(controlServer);
}

float BehaviorCoreProcessor::getForwardCommitBars() const {
    return manifold::behavior_query_support::getForwardCommitBars(controlServer);
}

int BehaviorCoreProcessor::getRecordModeIndex() const {
    return manifold::behavior_query_support::getRecordModeIndex(controlServer);
}

int BehaviorCoreProcessor::getCommitCount() const {
    return manifold::behavior_query_support::getCommitCount(controlServer);
}

std::array<float, 32> BehaviorCoreProcessor::getSpectrumData() const {
    return manifold::behavior_query_support::getSpectrumData(dspScriptHost.get(),
                                                             dspSlots);
}

std::string BehaviorCoreProcessor::getAndClearPendingUISwitch() {
    auto& req = controlServer.getUISwitchRequest();
    return manifold::behavior_housekeeping_support::takePendingString(
        req, [](auto& request) -> std::string& { return request.path; }, true);
}

std::string BehaviorCoreProcessor::getAndClearPendingUIRendererMode() {
    auto& req = controlServer.getUIRendererRequest();
    return manifold::behavior_housekeeping_support::takePendingString(
        req, [](auto& request) -> std::string& { return request.mode; }, true);
}

std::string BehaviorCoreProcessor::getAndClearPendingScreenshot() {
    auto& req = controlServer.getScreenshotRequest();
    return manifold::behavior_housekeeping_support::takePendingString(
        req,
        [](auto& request) -> std::string& { return request.outputPath; },
        false);
}

void BehaviorCoreProcessor::applyControlCommand(const ControlCommand& cmd) {
    manifold::control_command_support::applyControlCommand(*this, cmd);
}

void BehaviorCoreProcessor::processControlCommands() {
    manifold::control_command_support::processControlCommands(*this,
                                                              controlServer);
}

void BehaviorCoreProcessor::checkGraphRuntimeSwap() {
    manifold::graph_runtime_support::checkGraphRuntimeSwap(
        pendingRetireRuntime, retireQueue, pendingRuntime, activeRuntime);
}

void BehaviorCoreProcessor::scheduleForwardCommitIfNeeded() {
    manifold::behavior_housekeeping_support::scheduleForwardCommitIfNeeded(
        controlServer,
        playTimeSamples,
        forwardScheduled,
        forwardFireAtSample,
        forwardScheduledBars);
}

void BehaviorCoreProcessor::initialiseAtomicState(double sampleRate) {
    manifold::behavior_housekeeping_support::initialiseAtomicState(
        controlServer,
        sampleRate,
        captureBuffer,
        graphProcessingEnabled.load(std::memory_order_relaxed),
        kDefaultTempo,
        kDefaultTargetBpm,
        kDefaultMasterVolume,
        kDefaultInputVolume);
}

// ============================================================================
// Ableton Link Integration
// ============================================================================

bool BehaviorCoreProcessor::isLinkEnabled() const {
    return manifold::link_support::isLinkEnabled(linkSync);
}

void BehaviorCoreProcessor::setLinkEnabled(bool enabled) {
    manifold::link_support::setLinkEnabled(linkSync, enabled);
}

bool BehaviorCoreProcessor::isLinkTempoSyncEnabled() const {
    return manifold::link_support::isLinkTempoSyncEnabled(linkSync);
}

void BehaviorCoreProcessor::setLinkTempoSyncEnabled(bool enabled) {
    manifold::link_support::setLinkTempoSyncEnabled(linkSync, enabled);
}

bool BehaviorCoreProcessor::isLinkStartStopSyncEnabled() const {
    return manifold::link_support::isLinkStartStopSyncEnabled(linkSync);
}

void BehaviorCoreProcessor::setLinkStartStopSyncEnabled(bool enabled) {
    manifold::link_support::setLinkStartStopSyncEnabled(linkSync, enabled);
}

int BehaviorCoreProcessor::getLinkNumPeers() const {
    return manifold::link_support::getLinkNumPeers(linkSync);
}

bool BehaviorCoreProcessor::isLinkPlaying() const {
    return manifold::link_support::isLinkPlaying(linkSync);
}

double BehaviorCoreProcessor::getLinkBeat() const {
    return manifold::link_support::getLinkBeat(linkSync);
}

double BehaviorCoreProcessor::getLinkPhase() const {
    return manifold::link_support::getLinkPhase(linkSync);
}

void BehaviorCoreProcessor::requestLinkTempo(double bpm) {
    manifold::link_support::requestLinkTempo(linkSync, bpm);
}

void BehaviorCoreProcessor::requestLinkStart() {
    manifold::link_support::requestLinkStart(linkSync);
}

void BehaviorCoreProcessor::requestLinkStop() {
    manifold::link_support::requestLinkStop(linkSync);
}

void BehaviorCoreProcessor::processLinkPendingRequests() {
    manifold::link_support::processLinkPendingRequests(linkSync);
}

// ============================================================================
// IStateSerializer Implementation (Looper-specific state schema)
// ============================================================================

void BehaviorCoreProcessor::serializeStateToLua(sol::state& lua) const {
    manifold::state_serialization::serializeStateToLua(lua, *this);
}

void BehaviorCoreProcessor::serializeStateToLuaIncremental(
    sol::state& lua,
    const std::vector<std::string>& changedPaths) const {
    manifold::state_serialization::serializeStateToLuaIncremental(lua, *this, changedPaths);
}

std::string BehaviorCoreProcessor::serializeStateToJson() const {
    // TODO: Implement JSON serialization matching Lua structure
    // For now, return minimal JSON (implement when needed for OSCQuery)
    return "{}";
}

std::vector<IStateSerializer::StateField> BehaviorCoreProcessor::getStateSchema() const {
    // TODO: Implement schema describing all manifold state paths
    // For now, return empty (implement when needed for OSCQuery)
    return {};
}

std::string BehaviorCoreProcessor::getValueAtPath(const std::string& path) const {
    return manifold::state_serialization::getValueAtPath(path, *this);
}

bool BehaviorCoreProcessor::hasPathChanged(const std::string& path) const {
    return manifold::state_serialization::hasPathChanged(path, *this,
                                                         stateChangeCacheMutex_,
                                                         lastSerializedStateValues_);
}

std::vector<std::string> BehaviorCoreProcessor::getChangedPathsAndUpdateCache() {
    return manifold::state_serialization::getChangedPathsAndUpdateCache(*this,
                                                                        stateChangeCacheMutex_,
                                                                        lastSerializedStateValues_);
}

void BehaviorCoreProcessor::updateChangeCache() {
    manifold::state_serialization::updateChangeCache(*this,
                                                     stateChangeCacheMutex_,
                                                     lastSerializedStateValues_);
}

void BehaviorCoreProcessor::subscribeToPath(const std::string& path, StateChangeCallback callback) {
    // TODO: Implement subscription management
    (void)path;
    (void)callback;
}

void BehaviorCoreProcessor::unsubscribeFromPath(const std::string& path) {
    // TODO: Implement unsubscription
    (void)path;
}

void BehaviorCoreProcessor::clearSubscriptions() {
    // TODO: Implement subscription clearing
}

void BehaviorCoreProcessor::processPendingChanges() {
    // TODO: Implement pending change processing
}

void BehaviorCoreProcessor::getStateInformation(juce::MemoryBlock& destData) {
    juce::DynamicObject::Ptr root = new juce::DynamicObject();

    if (exportPluginConfig_.enabled) {
        juce::DynamicObject::Ptr pluginUi = new juce::DynamicObject();
        pluginUi->setProperty("viewMode", exportViewMode_.load(std::memory_order_relaxed));
        pluginUi->setProperty("editorWidth", exportEditorWidth_.load(std::memory_order_relaxed));
        pluginUi->setProperty("editorHeight", exportEditorHeight_.load(std::memory_order_relaxed));
        pluginUi->setProperty("devVisible", exportDevVisible_.load(std::memory_order_relaxed));
        pluginUi->setProperty("xyXParam", exportXyXParam_.load(std::memory_order_relaxed));
        pluginUi->setProperty("xyYParam", exportXyYParam_.load(std::memory_order_relaxed));
        root->setProperty("pluginUi", juce::var(pluginUi.get()));
    }

    if (hostParams_) {
        auto state = hostParams_->copyState();
        if (auto xml = std::unique_ptr<juce::XmlElement>(state.createXml())) {
            root->setProperty("hostParamsXml", xml->toString());
        }
    }

    destData.reset();
    juce::MemoryOutputStream out(destData, false);
    out.writeString(juce::JSON::toString(juce::var(root.get())));
}

void BehaviorCoreProcessor::setStateInformation(const void* data, int sizeInBytes) {
    if (data == nullptr || sizeInBytes <= 0) {
        return;
    }

    const juce::String jsonText = juce::String::fromUTF8(static_cast<const char*>(data), sizeInBytes);
    const auto json = juce::JSON::parse(jsonText);
    if (!json.isObject()) {
        return;
    }

    auto* obj = json.getDynamicObject();
    if (obj == nullptr) {
        return;
    }

    if (obj->hasProperty("pluginUi") && exportPluginConfig_.enabled) {
        auto pluginUiVar = obj->getProperty("pluginUi");
        auto* pluginUi = pluginUiVar.getDynamicObject();
        if (pluginUi != nullptr) {
            exportViewMode_.store(manifold::export_plugin::readIntProperty(pluginUi, "viewMode", exportPluginConfig_.defaultViewMode) == 0 ? 0 : 1,
                                  std::memory_order_relaxed);
            exportEditorWidth_.store(std::max(1, manifold::export_plugin::readIntProperty(pluginUi, "editorWidth", exportEditorWidth_.load(std::memory_order_relaxed))),
                                     std::memory_order_relaxed);
            exportEditorHeight_.store(std::max(1, manifold::export_plugin::readIntProperty(pluginUi, "editorHeight", exportEditorHeight_.load(std::memory_order_relaxed))),
                                      std::memory_order_relaxed);
            exportSettingsVisible_.store(false, std::memory_order_relaxed);
            exportDevVisible_.store(manifold::export_plugin::readBoolProperty(pluginUi, "devVisible", exportDevVisible_.load(std::memory_order_relaxed)),
                                    std::memory_order_relaxed);
            exportOscEnabled_.store(exportPluginConfig_.oscDefaultEnabled, std::memory_order_relaxed);
            exportOscQueryEnabled_.store(exportPluginConfig_.oscQueryDefaultEnabled, std::memory_order_relaxed);
            exportOscInputPort_.store(exportPluginConfig_.oscBasePort, std::memory_order_relaxed);
            exportOscQueryPort_.store(exportPluginConfig_.oscBasePort + 1, std::memory_order_relaxed);
            exportXyXParam_.store(juce::jlimit(1, 5,
                                              manifold::export_plugin::readIntProperty(pluginUi, "xyXParam", exportXyXParam_.load(std::memory_order_relaxed))),
                                 std::memory_order_relaxed);
            exportXyYParam_.store(juce::jlimit(1, 5,
                                              manifold::export_plugin::readIntProperty(pluginUi, "xyYParam", exportXyYParam_.load(std::memory_order_relaxed))),
                                 std::memory_order_relaxed);
            applyExportOscSettings();
        }
    }

    if (obj->hasProperty("hostParamsXml") && hostParams_) {
        const auto xmlText = obj->getProperty("hostParamsXml").toString();
        if (xmlText.isNotEmpty()) {
            if (auto xml = juce::parseXML(xmlText)) {
                if (xml->hasTagName(hostParams_->state.getType())) {
                    suppressHostParameterCallbacks_.store(true, std::memory_order_relaxed);
                    hostParams_->replaceState(juce::ValueTree::fromXml(*xml));
                    suppressHostParameterCallbacks_.store(false, std::memory_order_relaxed);
                    applyHostParameterSnapshotToProcessor();
                }
            }
        }
    }
}

// ============================================================================
// MIDI Implementation
// ============================================================================

std::vector<std::string> BehaviorCoreProcessor::getMidiInputDevices() {
    return manifold::midi_support::getMidiInputDevices();
}

std::vector<std::string> BehaviorCoreProcessor::getMidiOutputDevices() {
    return manifold::midi_support::getMidiOutputDevices();
}

bool BehaviorCoreProcessor::openMidiInput(int deviceIndex) {
    return manifold::midi_support::openMidiInputDevice(midiInputDevice, deviceIndex, this);
}

bool BehaviorCoreProcessor::openMidiOutput(int deviceIndex) {
    return manifold::midi_support::openMidiOutputDevice(midiOutputDevice, deviceIndex);
}

void BehaviorCoreProcessor::closeMidiInput() {
    manifold::midi_support::closeMidiInputDevice(midiInputDevice);
}

void BehaviorCoreProcessor::closeMidiOutput() {
    manifold::midi_support::closeMidiOutputDevice(midiOutputDevice);
}

void BehaviorCoreProcessor::handleIncomingMidiMessage(juce::MidiInput* /*source*/, 
                                                      const juce::MidiMessage& msg) {
    manifold::midi_support::enqueueIncomingHardwareMidi(midiInputRing, msg);
}

void BehaviorCoreProcessor::sendMidiMessage(uint8_t status, uint8_t data1, uint8_t data2) {
    manifold::midi_support::sendMidiMessageNow(midiOutputDevice.get(), status, data1, data2);
}

void BehaviorCoreProcessor::sendMidiNoteOn(int channel, int note, int velocity) {
    manifold::midi_support::sendMidiNoteOn(midiManager_.get(), midiOutputDevice.get(), channel, note, velocity);
}

void BehaviorCoreProcessor::sendMidiNoteOff(int channel, int note) {
    manifold::midi_support::sendMidiNoteOff(midiManager_.get(), midiOutputDevice.get(), channel, note);
}

void BehaviorCoreProcessor::sendMidiCC(int channel, int cc, int value) {
    manifold::midi_support::sendMidiCC(midiManager_.get(), midiOutputDevice.get(), channel, cc, value);
}

void BehaviorCoreProcessor::sendMidiPitchBend(int channel, int value) {
    manifold::midi_support::sendMidiPitchBend(midiManager_.get(), midiOutputDevice.get(), channel, value);
}

void BehaviorCoreProcessor::sendMidiProgramChange(int channel, int program) {
    manifold::midi_support::sendMidiProgramChange(midiManager_.get(), midiOutputDevice.get(), channel, program);
}

void BehaviorCoreProcessor::processMidiInput(const juce::MidiBuffer& midiMessages,
                                             bool writeLegacyRing) {
    manifold::midi_support::processMidiInput(
        midiManager_.get(),
        midiMessages,
        currentSampleRate.load(std::memory_order_relaxed));

    if (!writeLegacyRing) {
        return;
    }

    // Legacy ring mirroring is intentionally disabled here. Host MIDI is already
    // available to Lua through MidiManager::inputRing_, and mirroring it into
    // midiInputRing causes the same host events to be re-consumed as if they were
    // hardware MIDI on the same block.
    juce::ignoreUnused(midiMessages);
}

void BehaviorCoreProcessor::drainMidiOutput(juce::MidiBuffer& outMidi) {
    manifold::midi_support::drainMidiOutput(midiManager_.get(), midiOutputRing, outMidi);
}

std::string BehaviorCoreProcessor::exportStateContract() const {
    juce::DynamicObject::Ptr root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // Stable snapshot of the ControlServer state projection. Remove uptimeSeconds
    // because it's wall-clock dependent and not relevant to refactor regressions.
    auto controlState = juce::JSON::parse(const_cast<ControlServer&>(controlServer).getStateJson());
    if (auto* stateObj = controlState.getDynamicObject()) {
        stateObj->removeProperty("uptimeSeconds");
    }
    root->setProperty("controlState", controlState);

    // DSP slots
    root->setProperty("dspSlots",
        manifold::state_serialization::buildDspSlotsContract(dspScriptHost.get(), dspSlots));

    // Primary DSP info
    juce::DynamicObject::Ptr primaryDsp = new juce::DynamicObject();
    primaryDsp->setProperty("scriptFile",
        manifold::state_serialization::canonicalContractPath(getPrimaryDspScriptFile()));
    primaryDsp->setProperty("scriptSizeBytes", static_cast<double>(getPrimaryDspScriptSizeBytes()));
    primaryDsp->setProperty("lastError", juce::String(getDspScriptLastError()));
    primaryDsp->setProperty("managedHostCount", getManagedDspHostCount());
    root->setProperty("primaryDsp", juce::var(primaryDsp.get()));

    // Export plugin config
    root->setProperty("exportPlugin", manifold::export_plugin::makeExportPluginContract(
        exportPluginConfig_,
        exportViewMode_.load(std::memory_order_relaxed),
        exportEditorWidth_.load(std::memory_order_relaxed),
        exportEditorHeight_.load(std::memory_order_relaxed),
        exportSettingsVisible_.load(std::memory_order_relaxed),
        exportDevVisible_.load(std::memory_order_relaxed),
        exportOscEnabled_.load(std::memory_order_relaxed),
        exportOscQueryEnabled_.load(std::memory_order_relaxed),
        exportOscInputPort_.load(std::memory_order_relaxed),
        exportOscQueryPort_.load(std::memory_order_relaxed),
        exportXyXParam_.load(std::memory_order_relaxed),
        exportXyYParam_.load(std::memory_order_relaxed)));

    // MIDI
    root->setProperty("midi", manifold::midi_support::makeMidiContract(
        midiInputDevice != nullptr,
        midiOutputDevice != nullptr,
        midiThruEnabled,
        midiManager_));

    // Link
    root->setProperty("link", manifold::state_serialization::buildLinkContract(*this));

    // Runtime
    root->setProperty("runtime", manifold::state_serialization::buildRuntimeContract(
        currentSampleRate.load(std::memory_order_relaxed),
        currentBlockSize.load(std::memory_order_relaxed),
        playTimeSamples.load(std::memory_order_relaxed),
        graphProcessingEnabled.load(std::memory_order_relaxed)));

    // Host params
    root->setProperty("hostParams",
        manifold::state_serialization::buildHostParamsContract(hostParams_.get()));

    // Save-state contract catches serialization regressions.
    juce::MemoryBlock savedStateBlock;
    const_cast<BehaviorCoreProcessor*>(this)->getStateInformation(savedStateBlock);
    const juce::String savedStateText = juce::String::fromUTF8(
        static_cast<const char*>(savedStateBlock.getData()),
        static_cast<int>(savedStateBlock.getSize()));
    const juce::var savedState = juce::JSON::parse(savedStateText);
    if (!savedState.isVoid()) {
        root->setProperty("savedState", savedState);
    } else {
        root->setProperty("savedStateRaw", savedStateText);
    }

    return juce::JSON::toString(juce::var(root.get())).toStdString();
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
    return new BehaviorCoreProcessor();
}
