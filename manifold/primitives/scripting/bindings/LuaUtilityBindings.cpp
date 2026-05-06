#include "LuaUtilityBindings.h"

#include "LuaUtilityHelpers.h"
#include "../ILuaControlState.h"
#include "../ScriptableProcessor.h"
#include "../../ui/RuntimeNode.h"
#include "../../../ui/imgui/ImGuiDirectHost.h"
#include "../../control/ControlServer.h"
#include "../../control/OSCSettingsPersistence.h"
#include "../../core/Settings.h"
#include "../../core/SystemPaths.h"
#include "../../video/VideoCaptureManager.h"
#include "../../video/VideoRetrospectiveCapture.h"
#include "../../video/VideoSampler.h"
#include "../../ml/MLPipeline.h"
#include "../../shaders/ShaderEffectRegistry.h"
#include "../../shaders/UniformContract.h"
#include "../../sources/TextureSourceRegistry.h"

#include <juce_core/juce_core.h>
#include <juce_gui_basics/juce_gui_basics.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include "imgui.h"
#include "imgui_internal.h"

namespace lua_bindings {
using namespace lua_utility_helpers;

void registerUtilityBindings(sol::state& lua,
                                                 ILuaControlState& state) {
    std::fprintf(stderr, "[LuaControlBindings] registerUtilityBindings called\n");
    
    lua["getTime"] = []() -> double {
        static const auto startTime = juce::Time::getHighResolutionTicks();
        return juce::Time::highResolutionTicksToSeconds(
            juce::Time::getHighResolutionTicks() - startTime);
    };

    lua["getAudioClockInfo"] = [&state, &lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        result["sampleRate"] = processor ? processor->getSampleRate() : 44100.0;
        result["playTimeSamples"] = processor ? processor->getPlayTimeSamples() : 0.0;
        result["tempo"] = processor ? processor->getTempo() : 120.0f;
        result["samplesPerBar"] = processor ? processor->getSamplesPerBar() : 88200.0f;
        return result;
    };

    lua["listUiScripts"] = [&lua]() -> sol::table {
        const auto signature = currentUiScriptsSignature();
        auto& cache = scriptListingCacheState();
        std::vector<ScriptListEntry> entries;
        bool cacheHit = false;
        {
            std::lock_guard<std::mutex> lock(cache.mutex);
            if (cache.uiValid && cache.uiSignature == signature) {
                entries = cache.uiEntries;
                ++cache.uiHits;
                cacheHit = true;
            }
        }

        if (!cacheHit) {
            entries = scanUiScripts();
            std::lock_guard<std::mutex> lock(cache.mutex);
            cache.uiEntries = entries;
            cache.uiSignature = signature;
            cache.uiValid = true;
            ++cache.uiBuilds;
        }

        return scriptListToLua(lua, entries);
    };

    lua["invalidateScriptListingsCache"] = []() {
        invalidateScriptListingCaches();
    };

    lua["getScriptListingsCacheStats"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto& cache = scriptListingCacheState();
        std::lock_guard<std::mutex> lock(cache.mutex);

        auto ui = sol::table(lua, sol::create);
        ui["valid"] = cache.uiValid;
        ui["signature"] = cache.uiSignature;
        ui["entries"] = static_cast<int>(cache.uiEntries.size());
        ui["builds"] = cache.uiBuilds;
        ui["hits"] = cache.uiHits;
        result["ui"] = ui;

        auto dsp = sol::table(lua, sol::create);
        dsp["valid"] = cache.dspValid;
        dsp["signature"] = cache.dspSignature;
        dsp["entries"] = static_cast<int>(cache.dspEntries.size());
        dsp["builds"] = cache.dspBuilds;
        dsp["hits"] = cache.dspHits;
        result["dsp"] = dsp;

        return result;
    };

    lua["switchUiScript"] = [&state](const std::string& path) {
        state.setPendingSwitchPath(path);
    };

    lua["closeOverlay"] = [&state]() -> bool {
        return state.closeOverlay();
    };

    lua["isOverlayActive"] = [&state]() -> bool {
        return state.isOverlayActive();
    };

    lua["setUIRendererMode"] = [&state](const std::string& mode) -> bool {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return false;
        }

        const std::string normalized = normalizeUIRendererMode(mode);
        if (!isValidUIRendererMode(normalized)) {
            return false;
        }

        auto& request = processor->getControlServer().getUIRendererRequest();
        std::lock_guard<std::mutex> lock(request.mutex);
        request.mode = normalized;
        request.pending.store(true, std::memory_order_release);
        return true;
    };

    lua["getUIRendererMode"] = [&state]() -> std::string {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return "canvas";
        }
        return uiRendererModeToString(processor->getControlServer().getCurrentUIRendererMode());
    };

    lua["getCurrentScriptPath"] = [&state]() -> std::string {
        return state.getCurrentScriptFile().getFullPathName().toStdString();
    };

    lua["showFileChooser"] = [&state](const std::string& title,
                                        const std::string& initialPath,
                                        const std::string& filePatterns,
                                        sol::function callback) {
        state.showFileChooser(title, initialPath, filePatterns, callback);
    };

    lua["showDirectoryChooser"] = [&state](const std::string& title,
                                             const std::string& initialPath,
                                             sol::function callback) {
        state.showDirectoryChooser(title, initialPath, callback);
    };

    auto debugRecordingTable = lua.create_table();
    auto startNodeRecording = [&state](const std::string& outputDir,
                                        const std::string& nodeId,
                                        uint64_t stableId,
                                        sol::optional<bool> muxAfterStop) -> std::string {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return "ERROR no processor";
        }
        RecordingOptions options;
        options.cropEnabled = true;
        options.cropNodeId = nodeId;
        options.cropStableId = stableId;
        options.cropW = 1;
        options.cropH = 1;
        options.streamFramesToDisk = true;
        options.muxAfterStop = muxAfterStop.value_or(true);
        options.fps = 30;
        options.muxOutputPath = outputDir + "/video.mp4";
        return processor->getControlServer().startRecording("tga", 0, outputDir, options);
    };
    debugRecordingTable["startNode"] = [startNodeRecording](const std::string& outputDir,
                                                             const std::string& nodeId,
                                                             sol::optional<bool> muxAfterStop) -> std::string {
        return startNodeRecording(outputDir, nodeId, 0, muxAfterStop);
    };
    debugRecordingTable["startStableId"] = [startNodeRecording](const std::string& outputDir,
                                                                 double stableId,
                                                                 sol::optional<bool> muxAfterStop) -> std::string {
        return startNodeRecording(outputDir, std::string(), static_cast<uint64_t>(std::max(0.0, stableId)), muxAfterStop);
    };
    debugRecordingTable["startViewport"] = [&state](const std::string& outputDir,
                                                      int x,
                                                      int y,
                                                      int w,
                                                      int h,
                                                      sol::optional<bool> muxAfterStop) -> std::string {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return "ERROR no processor";
        }
        RecordingOptions options;
        options.cropEnabled = true;
        options.cropX = std::max(0, x);
        options.cropY = std::max(0, y);
        options.cropW = std::max(1, w);
        options.cropH = std::max(1, h);
        options.streamFramesToDisk = true;
        options.muxAfterStop = muxAfterStop.value_or(true);
        options.fps = 30;
        options.muxOutputPath = outputDir + "/video.mp4";
        return processor->getControlServer().startRecording("tga", 0, outputDir, options);
    };
    debugRecordingTable["stop"] = [&state]() -> std::string {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return "ERROR no processor";
        }
        return processor->getControlServer().stopRecording();
    };
    debugRecordingTable["status"] = [&state]() -> std::string {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return "ERROR no processor";
        }
        return processor->getControlServer().getRecordingStatus();
    };
    lua["debugRecording"] = debugRecordingTable;

    // ==========================================================================
    // videoSampler table - audio-timed video sampler/capture bindings
    // ==========================================================================
    lua.new_usertype<manifold::video::VideoSampler>("VideoSampler",
        sol::no_constructor,
        "getId", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> std::string {
            return self ? self->getId() : std::string();
        },
        "hasFrames", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> bool {
            return self ? self->hasFrames() : false;
        },
        "getFrameCount", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> int {
            return self ? self->getFrameCount() : 0;
        },
        "getDurationSamples", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> double {
            return self ? self->getDurationSamples() : 0.0;
        },
        "getDurationSeconds", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getDurationSeconds() : 0.0f;
        },
        "getEstimatedBytes", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> double {
            return self ? static_cast<double>(self->getEstimatedBytes()) : 0.0;
        },
        "clear", [](const std::shared_ptr<manifold::video::VideoSampler>& self) {
            if (self) self->clear();
        },
        "setPosition", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->seekNormalized(normalized);
        },
        "seek", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->seekNormalized(normalized);
        },
        "getPosition", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getNormalizedPosition() : 0.0f;
        },
        "getNormalizedPosition", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getNormalizedPosition() : 0.0f;
        },
        "play", [](const std::shared_ptr<manifold::video::VideoSampler>& self) {
            if (self) self->play();
        },
        "pause", [](const std::shared_ptr<manifold::video::VideoSampler>& self) {
            if (self) self->pause();
        },
        "stop", [](const std::shared_ptr<manifold::video::VideoSampler>& self) {
            if (self) self->stop();
        },
        "trigger", [](const std::shared_ptr<manifold::video::VideoSampler>& self) {
            if (self) self->trigger();
        },
        "isPlaying", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> bool {
            return self ? self->isPlaying() : false;
        },
        "advance", [](const std::shared_ptr<manifold::video::VideoSampler>& self, double deltaSeconds) {
            if (self) self->advance(deltaSeconds);
        },
        "setOneShot", [](const std::shared_ptr<manifold::video::VideoSampler>& self, bool enabled) {
            if (self) self->setOneShot(enabled);
        },
        "isOneShot", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> bool {
            return self ? self->isOneShot() : false;
        },
        "setPlayStart", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->setPlayStart(normalized);
        },
        "getPlayStart", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getPlayStart() : 0.0f;
        },
        "setLoopStart", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->setLoopStart(normalized);
        },
        "getLoopStart", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getLoopStart() : 0.0f;
        },
        "setLoopEnd", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->setLoopEnd(normalized);
        },
        "getLoopEnd", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getLoopEnd() : 1.0f;
        },
        "setCrossfade", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->setCrossfade(normalized);
        },
        "getCrossfade", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getCrossfade() : 0.0f;
        });

    lua.new_usertype<manifold::video::VideoRetrospectiveCapture>("VideoRetrospectiveCapture",
        sol::no_constructor,
        "setCaptureSeconds", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self, float seconds) {
            if (self) self->setCaptureSeconds(seconds);
        },
        "getCaptureSeconds", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> float {
            return self ? self->getCaptureSeconds() : 0.0f;
        },
        "ingestLatest", [&state](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> bool {
            auto* processor = state.getProcessor();
            if (!self || processor == nullptr) {
                return false;
            }
            return self->ingestLatestFrame(processor->getPlayTimeSamples(), highResNowSeconds());
        },
        "ingestSegmentedLatest", [&state, &lua](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self,
                                            const std::shared_ptr<manifold::ml::MLPipeline>& pipeline,
                                            sol::optional<sol::table> opts) -> bool {
            auto* processor = state.getProcessor();
            if (!self || !pipeline || !pipeline->isLoaded() || processor == nullptr) {
                return false;
            }

        // Start background worker on first call
        pipeline->startBackgroundWorker();

        // Copy latest frame and submit as segmentation job
        auto frame = manifold::video::VideoCaptureManager::instance().getLatestFrameCopy();
        if (!frame.valid()) return false;

        manifold::ml::MLPipeline::SegmentationOpts sopts;
        if (opts) {
            auto table = *opts;
            sopts.gain = static_cast<float>(table["gain"].get_or(1.0));
            sopts.useSigmoid = table["useSigmoid"].get_or(true);
            sopts.threshold = mlClamp01(static_cast<float>(table["threshold"].get_or(0.5)));
            sopts.feather = mlClamp01(static_cast<float>(table["feather"].get_or(0.15)));
            sopts.invert = table["invert"].get_or(false);
            sopts.background = mlClamp01(static_cast<float>(table["background"].get_or(0.0)));
        }

        pipeline->submitSegmentation(frame.width, frame.height, std::move(frame.rgba), sopts);

        // Poll for completed segmentation result (non-blocking)
        int outW = 0, outH = 0;
        uint64_t seqOut = 0;
        auto segResult = pipeline->pollSegmentationResult(outW, outH, seqOut);
        if (segResult.empty() || outW <= 0 || outH <= 0) {
            return false;
        }

        manifold::video::FrameData out;
        out.width = outW;
        out.height = outH;
        out.sequence = seqOut;
        out.rgba = std::move(segResult);
        return self->ingestFrame(std::move(out), processor->getPlayTimeSamples(), highResNowSeconds());
    },
        "copyRecentToSampler", [&state](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self,
                                          const std::shared_ptr<manifold::video::VideoSampler>& sampler,
                                          double samplesBack) -> bool {
            auto* processor = state.getProcessor();
            if (!self || !sampler || processor == nullptr) {
                return false;
            }
            return self->copyRecentToSampler(*sampler,
                                             processor->getPlayTimeSamples(),
                                             samplesBack,
                                             processor->getSampleRate());
        },
        "getFrameCount", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> int {
            return self ? self->getFrameCount() : 0;
        },
        "getLockedWidth", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> int {
            return self ? self->getLockedWidth() : 0;
        },
        "getLockedHeight", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> int {
            return self ? self->getLockedHeight() : 0;
        },
        "getEstimatedBytes", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> double {
            return self ? static_cast<double>(self->getEstimatedBytes()) : 0.0;
        },
        "getMaxRetainedBytes", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> double {
            return self ? static_cast<double>(self->getMaxRetainedBytes()) : 0.0;
        },
        "clear", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) {
            if (self) self->clear();
        });

    auto videoSamplerTable = lua.create_table();
    videoSamplerTable["new"] = [](sol::optional<sol::table> opts) -> std::shared_ptr<manifold::video::VideoSampler> {
        std::string id;
        if (opts) {
            sol::object idObj = (*opts)["id"];
            if (idObj.valid() && idObj.is<std::string>()) {
                id = idObj.as<std::string>();
            }
        }
        return manifold::video::VideoSamplerRegistry::instance().createSampler(id);
    };
    videoSamplerTable["capture"] = [](sol::optional<sol::table> opts) -> std::shared_ptr<manifold::video::VideoRetrospectiveCapture> {
        std::string id;
        float maxSeconds = 30.0f;
        if (opts) {
            sol::object idObj = (*opts)["id"];
            if (idObj.valid() && idObj.is<std::string>()) {
                id = idObj.as<std::string>();
            }
            sol::object maxSecondsObj = (*opts)["maxSeconds"];
            if (maxSecondsObj.valid() && maxSecondsObj.is<double>()) {
                maxSeconds = static_cast<float>(maxSecondsObj.as<double>());
            } else if (maxSecondsObj.valid() && maxSecondsObj.is<int>()) {
                maxSeconds = static_cast<float>(maxSecondsObj.as<int>());
            }
        }
        return manifold::video::VideoSamplerRegistry::instance().createCapture(id, maxSeconds);
    };
    videoSamplerTable["get"] = [](const std::string& id) -> std::shared_ptr<manifold::video::VideoSampler> {
        return manifold::video::VideoSamplerRegistry::instance().getSampler(id);
    };
    videoSamplerTable["remove"] = [](const std::string& id) {
        manifold::video::VideoSamplerRegistry::instance().unregisterSampler(id);
    };
    videoSamplerTable["removeCapture"] = [](const std::string& id) {
        manifold::video::VideoSamplerRegistry::instance().unregisterCapture(id);
    };
    videoSamplerTable["size"] = []() -> int {
        return static_cast<int>(manifold::video::VideoSamplerRegistry::instance().size());
    };
    videoSamplerTable["captureCount"] = []() -> int {
        return static_cast<int>(manifold::video::VideoSamplerRegistry::instance().captureCount());
    };
    videoSamplerTable["clearRegistry"] = []() {
        manifold::video::VideoSamplerRegistry::instance().clear();
    };
    lua["videoSampler"] = videoSamplerTable;

    // ==========================================================================
    // ml table - ML inference (TFLite) bindings
    // ==========================================================================
    auto mlTable = lua.create_table();

#if MANIFOLD_HAS_ML
    lua.new_usertype<manifold::ml::MLPipeline>("MLPipeline",
        sol::no_constructor,
        "isLoaded", &manifold::ml::MLPipeline::isLoaded,
        "inputWidth", &manifold::ml::MLPipeline::inputWidth,
        "inputHeight", &manifold::ml::MLPipeline::inputHeight,
        "inputChannels", &manifold::ml::MLPipeline::inputChannels,
        "outputElements", &manifold::ml::MLPipeline::outputElements,
        "setNormalization", &manifold::ml::MLPipeline::setNormalization,
        "lastError", &manifold::ml::MLPipeline::lastError,
        "startBackgroundWorker", &manifold::ml::MLPipeline::startBackgroundWorker,
        "submitFrame", &manifold::ml::MLPipeline::submitFrame,
        "pollResult", &manifold::ml::MLPipeline::pollResult);

    mlTable["load"] = [](const std::string& modelPath)
        -> std::shared_ptr<manifold::ml::MLPipeline> {
        auto pipeline = std::make_shared<manifold::ml::MLPipeline>();
        if (!pipeline->load(modelPath)) {
            return nullptr;
        }
        return pipeline;
    };

    // Async infer: submits frame to background worker, returns last completed result.
    // Non-blocking — frame copy is fast (<50us), inference runs on background thread.
    mlTable["infer"] = [&lua](
        const std::shared_ptr<manifold::ml::MLPipeline>& pipeline)
        -> sol::optional<sol::table> {
        if (!pipeline || !pipeline->isLoaded()) return sol::nullopt;

        // Start background worker on first call
        pipeline->startBackgroundWorker();

        // Copy latest frame (fast: mutex lock + vector copy)
        auto frame = manifold::video::VideoCaptureManager::instance().getLatestFrameCopy();
        if (frame.valid()) {
            pipeline->submitFrame(frame.width, frame.height, std::move(frame.rgba));
        }

        // Return last completed result (non-blocking)
        std::vector<float> output;
        if (!pipeline->pollResult(output)) {
            return sol::nullopt;
        }

        auto result = sol::table(lua, sol::create);
        result["width"] = pipeline->inputWidth();
        result["height"] = pipeline->inputHeight();
        result["size"] = static_cast<int>(output.size());
        sol::table dataTable = sol::table(lua, sol::create);
        for (int i = 0; i < static_cast<int>(output.size()); ++i)
            dataTable[i + 1] = output[static_cast<std::size_t>(i)];
        result["data"] = dataTable;
        return result;
    };

    // Synchronous infer (old behavior): blocks until inference completes.
    mlTable["inferSync"] = [&lua](
        const std::shared_ptr<manifold::ml::MLPipeline>& pipeline)
        -> sol::optional<sol::table> {
        if (!pipeline || !pipeline->isLoaded()) return sol::nullopt;

        auto frame = manifold::video::VideoCaptureManager::instance().getLatestFrameCopy();
        if (!frame.valid()) return sol::nullopt;

        std::vector<float> output;
        if (!pipeline->infer(frame.rgba.data(), frame.width, frame.height, output))
            return sol::nullopt;

        auto result = sol::table(lua, sol::create);
        result["width"] = pipeline->inputWidth();
        result["height"] = pipeline->inputHeight();
        result["size"] = static_cast<int>(output.size());
        sol::table dataTable = sol::table(lua, sol::create);
        for (int i = 0; i < static_cast<int>(output.size()); ++i)
            dataTable[i + 1] = output[static_cast<std::size_t>(i)];
        result["data"] = dataTable;
        return result;
    };

    // Generic: infer from explicit pixel data
    // frame Lua table: { width = int, height = int, rgba = {r0,g0,b0,a0, r1,g1,b1,a1, ...} }
    mlTable["inferFrame"] = [&lua](
        const std::shared_ptr<manifold::ml::MLPipeline>& pipeline,
        sol::table frame)
        -> sol::optional<sol::table> {
        if (!pipeline || !pipeline->isLoaded()) return sol::nullopt;

        int w = frame["width"];
        int h = frame["height"];
        sol::object rgbaObj = frame["rgba"];
        if (w <= 0 || h <= 0 || !rgbaObj.is<sol::table>()) return sol::nullopt;

        sol::table rgbaTable = rgbaObj.as<sol::table>();
        std::size_t numPixels = static_cast<std::size_t>(w) * static_cast<std::size_t>(h) * 4;
        std::vector<unsigned char> rgba(numPixels);
        for (std::size_t i = 0; i < numPixels; ++i)
            rgba[i] = static_cast<unsigned char>(rgbaTable[static_cast<int>(i) + 1].get_or(0));

        std::vector<float> output;
        if (!pipeline->infer(rgba.data(), w, h, output)) return sol::nullopt;

        auto result = sol::table(lua, sol::create);
        result["width"] = pipeline->inputWidth();
        result["height"] = pipeline->inputHeight();
        result["size"] = static_cast<int>(output.size());
        sol::table dataTable = sol::table(lua, sol::create);
        for (int i = 0; i < static_cast<int>(output.size()); ++i)
            dataTable[i + 1] = output[static_cast<std::size_t>(i)];
        result["data"] = dataTable;
        return result;
    };
#endif // MANIFOLD_HAS_ML

    lua["ml"] = mlTable;

    // ==========================================================================
    // capture table - video capture hardware bindings
    // ==========================================================================
    auto captureTable = lua.create_table();
    captureTable["listDevices"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        const auto devices = manifold::video::VideoCaptureManager::instance().listDevices();
        int luaIndex = 1;
        for (const auto& device : devices) {
            auto entry = sol::table(lua, sol::create);
            entry["index"] = device.index;
            entry["path"] = device.path;
            entry["name"] = device.name;
            entry["label"] = device.label;
            result[luaIndex++] = entry;
        }
        return result;
    };
    captureTable["listModes"] = [&lua](int deviceIndex) -> sol::table {
        auto result = sol::table(lua, sol::create);
        const auto modes = manifold::video::VideoCaptureManager::instance().listModes(deviceIndex);
        int luaIndex = 1;
        for (const auto& mode : modes) {
            auto entry = sol::table(lua, sol::create);
            entry["width"] = mode.width;
            entry["height"] = mode.height;
            entry["fps"] = mode.fps;
            entry["pixelFormat"] = mode.pixelFormat;
            entry["label"] = mode.label;
            result[luaIndex++] = entry;
        }
        return result;
    };
    captureTable["open"] = [](int deviceIndex,
                              sol::optional<int> width,
                              sol::optional<int> height,
                              sol::optional<int> fps) -> bool {
        return manifold::video::VideoCaptureManager::instance().openDevice(deviceIndex,
                                                                           width.value_or(640),
                                                                           height.value_or(480),
                                                                           fps.value_or(30));
    };
    captureTable["close"] = []() {
        manifold::video::VideoCaptureManager::instance().closeDevice();
    };
    captureTable["isOpen"] = []() -> bool {
        return manifold::video::VideoCaptureManager::instance().isOpen();
    };
    captureTable["getActiveDeviceIndex"] = []() -> int {
        return manifold::video::VideoCaptureManager::instance().getActiveDeviceIndex();
    };
    captureTable["getLastError"] = []() -> std::string {
        return manifold::video::VideoCaptureManager::instance().getLastError();
    };
    captureTable["getFrameInfo"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        const auto frame = manifold::video::VideoCaptureManager::instance().getLatestFrameCopy();
        result["valid"] = frame.valid();
        result["width"] = frame.width;
        result["height"] = frame.height;
        result["sequence"] = static_cast<double>(frame.sequence);
        result["open"] = manifold::video::VideoCaptureManager::instance().isOpen();
        result["activeDeviceIndex"] = manifold::video::VideoCaptureManager::instance().getActiveDeviceIndex();
        return result;
    };
    lua["capture"] = captureTable;

    // ==========================================================================
    // sources table - texture source registry bindings
    // ==========================================================================
    auto sourcesTable = lua.create_table();
    sourcesTable["list"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        int sourceIndex = 1;
        for (const auto& source : manifold::sources::TextureSourceRegistry::instance().listSources()) {
            auto sourceTable = sol::table(lua, sol::create);
            sourceTable["id"] = source.id;
            sourceTable["name"] = source.name;
            sourceTable["category"] = source.category;
            sourceTable["description"] = source.description;

            auto paramsTable = sol::table(lua, sol::create);
            int paramIndex = 1;
            for (const auto& param : source.params) {
                auto paramTable = sol::table(lua, sol::create);
                paramTable["id"] = param.id;
                paramTable["name"] = param.name;
                paramTable["unit"] = param.unit;
                paramTable["min"] = param.min;
                paramTable["max"] = param.max;
                paramTable["default"] = param.defaultValue;
                paramTable["step"] = param.step;
                paramsTable[paramIndex++] = paramTable;
            }
            sourceTable["params"] = paramsTable;
            result[sourceIndex++] = sourceTable;
        }
        return result;
    };
    lua["sources"] = sourcesTable;

    // ==========================================================================
    // shaders table - shader effect registry bindings
    // ==========================================================================
    auto shadersTable = lua.create_table();
    shadersTable["listEffects"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        int effectIndex = 1;
        for (const auto& effect : manifold::shaders::ShaderEffectRegistry::instance().listEffects()) {
            if (effect.effectCategory != manifold::shaders::EffectCategory::Effect) {
                continue;
            }
            auto effectTable = sol::table(lua, sol::create);
            effectTable["id"] = effect.id;
            effectTable["name"] = effect.name;
            effectTable["category"] = effect.category;
            effectTable["description"] = effect.description;

            auto paramsTable = sol::table(lua, sol::create);
            int paramIndex = 1;
            for (const auto& param : effect.params) {
                auto paramTable = sol::table(lua, sol::create);
                paramTable["id"] = param.id;
                paramTable["name"] = param.name;
                paramTable["unit"] = param.unit;
                paramTable["min"] = param.min;
                paramTable["max"] = param.max;
                paramTable["default"] = param.defaultValue;
                paramTable["step"] = param.step;
                paramsTable[paramIndex++] = paramTable;
            }
            effectTable["params"] = paramsTable;
            result[effectIndex++] = effectTable;
        }
        return result;
    };
    shadersTable["listBlendOps"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        int effectIndex = 1;
        for (const auto& effect : manifold::shaders::ShaderEffectRegistry::instance().listEffects()) {
            if (effect.effectCategory != manifold::shaders::EffectCategory::BlendOp) {
                continue;
            }
            auto effectTable = sol::table(lua, sol::create);
            effectTable["id"] = effect.id;
            effectTable["name"] = effect.name;
            effectTable["category"] = effect.category;
            effectTable["description"] = effect.description;

            auto paramsTable = sol::table(lua, sol::create);
            int paramIndex = 1;
            for (const auto& param : effect.params) {
                auto paramTable = sol::table(lua, sol::create);
                paramTable["id"] = param.id;
                paramTable["name"] = param.name;
                paramTable["unit"] = param.unit;
                paramTable["min"] = param.min;
                paramTable["max"] = param.max;
                paramTable["default"] = param.defaultValue;
                paramTable["step"] = param.step;
                paramsTable[paramIndex++] = paramTable;
            }
            effectTable["params"] = paramsTable;
            result[effectIndex++] = effectTable;
        }
        return result;
    };
    shadersTable["buildPipeline"] = [&lua](sol::object layersArg,
                                            sol::optional<std::string> fitModeOpt,
                                            sol::optional<sol::object> sourceArgOpt) -> sol::table {
        auto parseParams = [](sol::object paramsObj) {
            std::unordered_map<std::string, float> out;
            if (!paramsObj.is<sol::table>()) {
                return out;
            }
            for (const auto& pair : paramsObj.as<sol::table>()) {
                if (!pair.first.is<std::string>()) continue;
                float value = 0.0f;
                if (pair.second.is<double>()) {
                    value = static_cast<float>(pair.second.as<double>());
                } else if (pair.second.is<int>()) {
                    value = static_cast<float>(pair.second.as<int>());
                } else {
                    continue;
                }
                out[pair.first.as<std::string>()] = value;
            }
            return out;
        };

        struct LayerRequest {
            std::string effectId;
            std::unordered_map<std::string, float> params;
        };
        std::vector<LayerRequest> layers;

        if (layersArg.is<sol::table>()) {
            auto layersTable = layersArg.as<sol::table>();
            const std::size_t count = layersTable.size();
            for (std::size_t i = 1; i <= count; ++i) {
                sol::object entry = layersTable[i];
                if (!entry.is<sol::table>()) continue;
                auto layerTable = entry.as<sol::table>();

                sol::object enabledObj = layerTable["enabled"];
                if (enabledObj.is<bool>() && !enabledObj.as<bool>()) {
                    continue;
                }

                sol::object effectIdObj = layerTable["effectId"];
                if (!effectIdObj.is<std::string>()) continue;
                const auto effectId = effectIdObj.as<std::string>();
                if (manifold::shaders::ShaderEffectRegistry::instance().findEffect(effectId) == nullptr) continue;

                LayerRequest req;
                req.effectId = effectId;
                req.params = parseParams(layerTable["params"]);
                layers.push_back(std::move(req));
            }
        }

        if (layers.empty()) {
            LayerRequest fallback;
            fallback.effectId = "none";
            layers.push_back(std::move(fallback));
        }

        std::string sourceType = "video_input";
        std::string sourceId;
        std::unordered_map<std::string, float> sourceParams;
        if (sourceArgOpt && sourceArgOpt->is<sol::table>()) {
            auto sourceTable = sourceArgOpt->as<sol::table>();
            const auto kind = sourceTable["type"].get_or(std::string("webcam"));
            if (kind == "generator") {
                auto candidateId = sourceTable["sourceId"].get_or(std::string{});
                if (manifold::sources::TextureSourceRegistry::instance().findSource(candidateId) != nullptr) {
                    sourceType = "generated_source";
                    sourceId = candidateId;
                    sourceParams = parseParams(sourceTable["params"]);
                }
            } else if (kind == "node") {
                auto candidateId = sourceTable["sourceId"].get_or(std::string{});
                if (!candidateId.empty()) {
                    sourceType = "node_surface";
                    sourceId = candidateId;
                }
            }
        }

        auto result = sol::table(lua, sol::create);
        result["version"] = 2;
        result["kind"] = "shaderQuad";
        result["shaderLanguage"] = "glsl";
        result["sourceType"] = sourceType;
        result["fitMode"] = fitModeOpt.value_or("contain");

        if (sourceType == "generated_source") {
            auto sourceShader = sol::table(lua, sol::create);
            sourceShader["vertexShader"] = manifold::shaders::ShaderEffectRegistry::instance().vertexShader();
            sourceShader["fragmentShader"] = manifold::sources::TextureSourceRegistry::instance().fragmentShaderFor(sourceId);
            auto sourceUniforms = sol::table(lua, sol::create);
            const auto sanitizedSourceParams = manifold::sources::TextureSourceRegistry::instance().sanitizeParams(sourceId, sourceParams);
            for (const auto& entry : sanitizedSourceParams) {
                sourceUniforms[entry.first] = entry.second;
            }
            sourceShader["uniforms"] = sourceUniforms;
            result["sourceShader"] = sourceShader;
        }
        if (!sourceId.empty()) {
            result["sourceId"] = sourceId;
        }

        auto passes = sol::table(lua, sol::create);
        int passIndex = 1;
        for (const auto& layer : layers) {
            const auto sanitizedParams = manifold::shaders::ShaderEffectRegistry::instance().sanitizeParams(layer.effectId, layer.params);
            auto pass = sol::table(lua, sol::create);
            pass["vertexShader"] = manifold::shaders::ShaderEffectRegistry::instance().vertexShader();
            pass["fragmentShader"] = manifold::shaders::ShaderEffectRegistry::instance().fragmentShaderFor(layer.effectId, false);
            pass["inputTextureUniform"] = manifold::shaders::UniformContract::kInputTex;
            pass["prevTextureUniform"] = manifold::shaders::UniformContract::kPrevTex;
            pass["chain"] = true;
            auto uniforms = sol::table(lua, sol::create);
            for (const auto& entry : sanitizedParams) {
                uniforms[entry.first] = entry.second;
            }
            pass["uniforms"] = uniforms;
            passes[passIndex++] = pass;
        }
        result["passes"] = passes;
        return result;
    };
    shadersTable["reload"] = []() {
        manifold::shaders::ShaderEffectRegistry::instance().reloadRuntimeEffects();
    };
    lua["shaders"] = shadersTable;

    lua["getRuntimeDisplayListDebugStats"] = [&lua](sol::optional<bool> resetOpt) -> sol::table {
        auto result = sol::table(lua, sol::create);
        const auto stats = RuntimeNode::getDisplayListDebugStats(resetOpt.value_or(false));
        result["setCalls"] = stats.setCalls;
        result["skippedSetCalls"] = stats.skippedSetCalls;
        result["clearCalls"] = stats.clearCalls;
        result["compileCalls"] = stats.compileCalls;
        result["setCommands"] = stats.setCommands;
        result["compiledCommands"] = stats.compiledCommands;
        result["compileMicros"] = stats.compileMicros;
        result["topSetByKey"] = pushTopEntriesTable(lua, stats.topSetByKey);
        result["topSkippedSetByKey"] = pushTopEntriesTable(lua, stats.topSkippedSetByKey);
        result["topCompileByKey"] = pushTopEntriesTable(lua, stats.topCompileByKey);
        return result;
    };

    lua["setClipboardText"] = [](const std::string& text) -> bool {
        juce::SystemClipboard::copyTextToClipboard(juce::String(text));
        return true;
    };

    lua["getClipboardText"] = []() -> std::string {
        return juce::SystemClipboard::getTextFromClipboard().toStdString();
    };

    // Debug outline control for ImGuiDirectHost (performance mode)
    lua["setDebugOutlinesEnabled"] = [&state](bool enabled) {
        state.setDebugOutlinesEnabled(enabled);
    };

    lua["areDebugOutlinesEnabled"] = [&state]() -> bool {
        return state.areDebugOutlinesEnabled();
    };

    lua["getDebugHoveredNodeId"] = [&state]() -> std::string {
        return state.getDebugHoveredNodeId();
    };

    lua["getDebugSelectedNodeId"] = [&state]() -> std::string {
        return state.getDebugSelectedNodeId();
    };

    // CopyID mode bindings
    lua["setCopyIdModeEnabled"] = [&state](bool enabled) {
        state.setCopyIdModeEnabled(enabled);
    };

    lua["isCopyIdModeEnabled"] = [&state]() -> bool {
        return state.isCopyIdModeEnabled();
    };

    lua["writeTextFile"] = [](const std::string& path,
                               const std::string& text) -> bool {
        juce::File outFile(path);
        return outFile.replaceWithText(juce::String(text), false, false, "\n");
    };

    lua["readTextFile"] = [](const std::string& path) -> std::string {
        juce::File inFile(path);
        if (!inFile.existsAsFile()) {
            return "";
        }
        return inFile.loadFileAsString().toStdString();
    };

    lua["listFilesRecursive"] = [&lua](const std::string& rootPath) -> sol::table {
        auto result = sol::table(lua, sol::create);
        juce::File root(rootPath);
        if (!root.isDirectory()) {
            return result;
        }

        auto files = root.findChildFiles(juce::File::findFiles, true);
        files.sort();

        int index = 1;
        for (const auto& file : files) {
            const auto ext = file.getFileExtension();
            if (ext != ".lua" && ext != ".json5") {
                continue;
            }
            result[index++] = file.getFullPathName().toStdString();
        }
        return result;
    };

    lua["listDspScripts"] = [&lua]() -> sol::table {
        const auto signature = currentDspScriptsSignature();
        auto& cache = scriptListingCacheState();
        std::vector<ScriptListEntry> entries;
        bool cacheHit = false;
        {
            std::lock_guard<std::mutex> lock(cache.mutex);
            if (cache.dspValid && cache.dspSignature == signature) {
                entries = cache.dspEntries;
                ++cache.dspHits;
                cacheHit = true;
            }
        }

        if (!cacheHit) {
            entries = scanDspScripts();
            std::lock_guard<std::mutex> lock(cache.mutex);
            cache.dspEntries = entries;
            cache.dspSignature = signature;
            cache.dspValid = true;
            ++cache.dspBuilds;
        }

        return scriptListToLua(lua, entries);
    };

    // Settings table - persistent configuration
    auto settingsTable = lua.create_table();
    
    settingsTable["getUserScriptsDir"] = []() -> std::string {
        return Settings::getInstance().getUserScriptsDir().toStdString();
    };
    
    settingsTable["setUserScriptsDir"] = [](const std::string& path) {
        Settings::getInstance().setUserScriptsDir(juce::String(path));
        Settings::getInstance().save();
        invalidateScriptListingCaches();
    };
    
    settingsTable["getDevScriptsDir"] = []() -> std::string {
        return Settings::getInstance().getDevScriptsDir().toStdString();
    };
    
    settingsTable["setDevScriptsDir"] = [](const std::string& path) {
        Settings::getInstance().setDevScriptsDir(juce::String(path));
        Settings::getInstance().save();
        invalidateScriptListingCaches();
    };
    
    settingsTable["getOscPort"] = []() -> int {
        return Settings::getInstance().getOscPort();
    };
    
    settingsTable["setOscPort"] = [](int port) {
        Settings::getInstance().setOscPort(port);
        Settings::getInstance().save();
    };
    
    settingsTable["getOscQueryPort"] = []() -> int {
        return Settings::getInstance().getOscQueryPort();
    };
    
    settingsTable["setOscQueryPort"] = [](int port) {
        Settings::getInstance().setOscQueryPort(port);
        Settings::getInstance().save();
    };
    
    settingsTable["save"] = []() {
        Settings::getInstance().save();
    };
    
    settingsTable["getConfigPath"] = []() -> std::string {
        return Settings::getInstance().getConfigPath().toStdString();
    };
    
    // Async directory chooser - calls callback(path) when user selects
    settingsTable["browseForUserScriptsDir"] = [&state](sol::function callback) {
        std::fprintf(stderr, "[LuaSettings] browseForUserScriptsDir called\n");
        auto currentDir = Settings::getInstance().getUserScriptsDir();
        std::fprintf(stderr, "[LuaSettings] currentDir='%s'\n", currentDir.toRawUTF8());
        if (currentDir.isEmpty()) {
            currentDir = juce::File::getSpecialLocation(juce::File::userHomeDirectory).getFullPathName();
            std::fprintf(stderr, "[LuaSettings] using home dir: '%s'\n", currentDir.toRawUTF8());
        }
        std::fprintf(stderr, "[LuaSettings] calling showDirectoryChooser...\n");
        state.showDirectoryChooser("Select User Scripts Directory", 
                                    currentDir.toStdString(), 
                                    callback);
        std::fprintf(stderr, "[LuaSettings] showDirectoryChooser returned\n");
    };
    
    // DSP scripts directory
    settingsTable["getDspScriptsDir"] = []() -> std::string {
        return Settings::getInstance().getDspScriptsDir().toStdString();
    };
    
    settingsTable["setDspScriptsDir"] = [](const std::string& path) {
        Settings::getInstance().setDspScriptsDir(juce::String(path));
        Settings::getInstance().save();
        invalidateScriptListingCaches();
    };
    
    settingsTable["browseForDspScriptsDir"] = [&state](sol::function callback) {
        auto currentDir = Settings::getInstance().getDspScriptsDir();
        if (currentDir.isEmpty()) {
            currentDir = juce::File::getSpecialLocation(juce::File::userHomeDirectory).getFullPathName();
        }
        state.showDirectoryChooser("Select DSP Scripts Directory", 
                                    currentDir.toStdString(), 
                                    callback);
    };
    
    std::fprintf(stderr, "[LuaControlBindings] About to set lua['settings']...\n");
    lua["settings"] = settingsTable;
    
    // Debug: verify settings table was created properly
    std::fprintf(stderr, "[LuaSettings] Registered settings table with %zu entries\n", 
                 settingsTable.size());
    std::fprintf(stderr, "[LuaSettings] browseForUserScriptsDir valid: %d\n", 
                 settingsTable["browseForUserScriptsDir"].valid() ? 1 : 0);
    
    // Verify it was actually set
    auto verifyTable = lua["settings"];
    std::fprintf(stderr, "[LuaSettings] Verification - lua['settings'] type: %s\n", 
                 verifyTable.get_type() == sol::type::table ? "table" : "not table");
    
    // SystemPaths table - directory resolution
    auto pathsTable = lua.create_table();
    
    pathsTable["getSystemScriptsDir"] = []() -> std::string {
        return SystemPaths::getSystemScriptsDir().getFullPathName().toStdString();
    };
    
    pathsTable["getUserScriptsDir"] = []() -> std::string {
        return SystemPaths::getUserScriptsDir().getFullPathName().toStdString();
    };
    
    pathsTable["getSystemProjectsDir"] = []() -> std::string {
        return SystemPaths::getSystemProjectsDir().getFullPathName().toStdString();
    };
    
    pathsTable["getUserProjectsDir"] = []() -> std::string {
        return SystemPaths::getUserProjectsDir().getFullPathName().toStdString();
    };
    
    lua["systemPaths"] = pathsTable;
    
    // ==========================================================================
    // ImGui immediate-mode API bindings for onImGuiFrame callbacks.
    // These may ONLY be called inside an onImGuiFrame callback (between
    // ImGui::NewFrame() and ImGui::Render()). Calling outside that context
    // will trigger ImGui asserts / undefined behaviour.
    // ==========================================================================
    lua["imguiBegin"] = [](const char* title, sol::optional<int> flags) -> bool {
        return ImGui::Begin(title, nullptr, static_cast<ImGuiWindowFlags>(flags.value_or(0)));
    };
    lua["imguiEnd"] = []() { ImGui::End(); };
    lua["imguiBeginMainMenuBar"] = []() -> bool { return ImGui::BeginMainMenuBar(); };
    lua["imguiEndMainMenuBar"]   = []() { ImGui::EndMainMenuBar(); };
    lua["imguiBeginMenuBar"]     = []() -> bool { return ImGui::BeginMenuBar(); };
    lua["imguiEndMenuBar"]       = []() { ImGui::EndMenuBar(); };
    lua["imguiBeginMenu"]        = [](const char* label, sol::optional<bool> enabled) -> bool {
        return ImGui::BeginMenu(label, enabled.value_or(true));
    };
    lua["imguiEndMenu"]          = []() { ImGui::EndMenu(); };
    lua["imguiMenuItem"]         = [](const char* label, sol::optional<const char*> shortcut, sol::optional<bool> selected, sol::optional<bool> enabled) -> bool {
        return ImGui::MenuItem(label, shortcut.value_or(nullptr), selected.value_or(false), enabled.value_or(true));
    };
    lua["imguiSeparator"]        = []() { ImGui::Separator(); };
    lua["imguiOpenPopup"]        = [](const char* id) { ImGui::OpenPopup(id); };
    lua["imguiBeginPopup"]       = [](const char* id) -> bool { return ImGui::BeginPopup(id); };
    lua["imguiBeginPopupModal"]  = [](const char* id, sol::optional<int> flags) -> bool {
        return ImGui::BeginPopupModal(id, nullptr, static_cast<ImGuiWindowFlags>(flags.value_or(0)));
    };
    lua["imguiEndPopup"]         = []() { ImGui::EndPopup(); };
    lua["imguiCloseCurrentPopup"]= []() { ImGui::CloseCurrentPopup(); };
    lua["imguiSelectable"]       = [](const char* label, sol::optional<bool> selected, sol::optional<int> flags, sol::optional<float> w, sol::optional<float> h) -> bool {
        return ImGui::Selectable(label, selected.value_or(false), static_cast<ImGuiSelectableFlags>(flags.value_or(0)), ImVec2(w.value_or(0), h.value_or(0)));
    };
    lua["imguiBeginTable"]       = [](const char* id, int columns, sol::optional<int> flags) -> bool {
        return ImGui::BeginTable(id, columns, static_cast<ImGuiTableFlags>(flags.value_or(0)));
    };
    lua["imguiEndTable"]         = []() { ImGui::EndTable(); };
    lua["imguiTableNextRow"]     = [](sol::optional<int> flags, sol::optional<float> minHeight) {
        ImGui::TableNextRow(static_cast<ImGuiTableRowFlags>(flags.value_or(0)), minHeight.value_or(0.0f));
    };
    lua["imguiTableNextColumn"]  = []() -> bool { return ImGui::TableNextColumn(); };
    lua["imguiGetID"]            = [](const char* id) -> uint32_t { return ImGui::GetID(id); };
    lua["imguiDockSpace"] = [](uint32_t id, sol::optional<float> w, sol::optional<float> h, sol::optional<int> flags) -> uint32_t {
        return ImGui::DockSpace(static_cast<ImGuiID>(id), ImVec2(w.value_or(0.0f), h.value_or(0.0f)), static_cast<ImGuiDockNodeFlags>(flags.value_or(0)));
    };
    lua["imguiDockSpaceOverViewport"] = [](sol::optional<uint32_t> id, sol::optional<int> flags) -> uint32_t {
        return ImGui::DockSpaceOverViewport(static_cast<ImGuiID>(id.value_or(0)), nullptr, static_cast<ImGuiDockNodeFlags>(flags.value_or(0)));
    };
    lua["imguiDockBuilderRemoveNode"] = [](uint32_t id) { ImGui::DockBuilderRemoveNode(static_cast<ImGuiID>(id)); };
    lua["imguiDockBuilderAddNode"] = [](uint32_t id, sol::optional<int> flags) {
        ImGui::DockBuilderAddNode(static_cast<ImGuiID>(id), static_cast<ImGuiDockNodeFlags>(flags.value_or(0)));
    };
    lua["imguiGetMainViewport"] = [&lua]() -> sol::table {
        auto* viewport = ImGui::GetMainViewport();
        auto t = sol::table(lua, sol::create);
        t["x"] = viewport ? viewport->WorkPos.x : 0.0f;
        t["y"] = viewport ? viewport->WorkPos.y : 0.0f;
        t["w"] = viewport ? viewport->WorkSize.x : 1.0f;
        t["h"] = viewport ? viewport->WorkSize.y : 1.0f;
        return t;
    };
    lua["imguiDockBuilderSetNodePos"] = [](uint32_t id, float x, float y) {
        ImGui::DockBuilderSetNodePos(static_cast<ImGuiID>(id), ImVec2(x, y));
    };
    lua["imguiDockBuilderSetNodeSize"] = [](uint32_t id, float w, float h) {
        ImGui::DockBuilderSetNodeSize(static_cast<ImGuiID>(id), ImVec2(w, h));
    };
    lua["imguiDockBuilderSplitNode"] = [&lua](uint32_t id, int dir, float ratio) -> sol::table {
        ImGuiID atDir = 0;
        ImGuiID opposite = 0;
        ImGui::DockBuilderSplitNode(static_cast<ImGuiID>(id), static_cast<ImGuiDir>(dir), ratio, &atDir, &opposite);
        auto t = sol::table(lua, sol::create);
        t["atDir"] = static_cast<uint32_t>(atDir);
        t["opposite"] = static_cast<uint32_t>(opposite);
        return t;
    };
    lua["imguiDockBuilderDockWindow"] = [](const char* windowName, uint32_t nodeId) {
        ImGui::DockBuilderDockWindow(windowName, static_cast<ImGuiID>(nodeId));
    };
    lua["imguiDockBuilderFinish"] = [](uint32_t id) { ImGui::DockBuilderFinish(static_cast<ImGuiID>(id)); };
    lua["imguiDockBuilderSetNodeFlags"] = [](uint32_t nodeId, int flags) {
        auto* node = ImGui::DockBuilderGetNode(static_cast<ImGuiID>(nodeId));
        if (node) node->LocalFlags = static_cast<ImGuiDockNodeFlags>(flags);
    };
    lua["imguiPushID"]           = [](const char* id) { ImGui::PushID(id); };
    lua["imguiPopID"]            = []() { ImGui::PopID(); };
    lua["imguiButton"]           = [](const char* label, sol::optional<float> w, sol::optional<float> h) -> bool {
        return ImGui::Button(label, ImVec2(w.value_or(0), h.value_or(0)));
    };
    lua["imguiText"]             = [](const char* text) { ImGui::TextUnformatted(text); };
    lua["imguiSameLine"]         = [](sol::optional<float> offset, sol::optional<float> spacing) {
        ImGui::SameLine(offset.value_or(0.0f), spacing.value_or(-1.0f));
    };
    lua["imguiPushStyleColor"]   = [](int idx, sol::object r, sol::optional<double> g, sol::optional<double> b, sol::optional<double> a) -> bool {
        if (g.has_value() && b.has_value() && a.has_value()) {
            ImGui::PushStyleColor(static_cast<ImGuiCol>(idx), ImVec4(static_cast<float>(r.as<double>()), static_cast<float>(*g), static_cast<float>(*b), static_cast<float>(*a)));
        } else {
            // Single uint32 color
            uint32_t col = r.is<uint32_t>() ? r.as<uint32_t>() : static_cast<uint32_t>(r.as<double>());
            float fr = static_cast<float>((col >> 16) & 0xffu) / 255.0f;
            float fg = static_cast<float>((col >> 8) & 0xffu) / 255.0f;
            float fb = static_cast<float>(col & 0xffu) / 255.0f;
            float fa = static_cast<float>((col >> 24) & 0xffu) / 255.0f;
            ImGui::PushStyleColor(static_cast<ImGuiCol>(idx), ImVec4(fr, fg, fb, fa));
        }
        return true;
    };
    lua["imguiPopStyleColor"]     = [](sol::optional<int> count) { ImGui::PopStyleColor(count.value_or(1)); };
    lua["imguiGetContentRegionAvail"] = [&lua]() -> sol::table {
        ImVec2 avail = ImGui::GetContentRegionAvail();
        auto t = sol::table(lua, sol::create);
        t["x"] = avail.x;
        t["y"] = avail.y;
        return t;
    };
    lua["imguiSetNextWindowSize"] = [](float w, float h, sol::optional<int> cond) {
        ImGui::SetNextWindowSize(ImVec2(w, h), static_cast<ImGuiCond>(cond.value_or(static_cast<int>(ImGuiCond_Appearing))));
    };
    lua["imguiSetNextWindowPos"] = [](float x, float y, sol::optional<int> cond) {
        ImGui::SetNextWindowPos(ImVec2(x, y), static_cast<ImGuiCond>(cond.value_or(0)));
    };
    lua["imguiSetNextWindowDockID"] = [](uint32_t dockId, sol::optional<int> cond) {
        ImGui::SetNextWindowDockID(static_cast<ImGuiID>(dockId), static_cast<ImGuiCond>(cond.value_or(static_cast<int>(ImGuiCond_Appearing))));
    };
    lua["imguiImage"] = [](uint64_t textureId, float w, float h) {
        ImGui::Image(ImTextureID(static_cast<std::uintptr_t>(textureId)), ImVec2(w, h));
    };
    lua["imguiSliderFloat"] = [](const char* label, float v, float vMin, float vMax, sol::optional<const char*> fmt, sol::optional<int> flags) -> float {
        float val = v;
        ImGui::SliderFloat(label, &val, vMin, vMax, fmt.value_or("%.3f"), static_cast<ImGuiSliderFlags>(flags.value_or(0)));
        return val;
    };
    lua["imguiDragFloat"] = [](const char* label, float v, sol::optional<float> vSpeed, sol::optional<float> vMin, sol::optional<float> vMax, sol::optional<const char*> fmt) -> float {
        float val = v;
        ImGui::DragFloat(label, &val, vSpeed.value_or(0.01f), vMin.value_or(0.0f), vMax.value_or(1.0f), fmt.value_or("%.3f"));
        return val;
    };
    lua["imguiVSliderFloat"] = [](const char* label, float w, float h, float v, float vMin, float vMax, sol::optional<const char*> fmt) -> float {
        float val = v;
        ImGui::VSliderFloat(label, ImVec2(w, h), &val, vMin, vMax, fmt.value_or("%.3f"));
        return val;
    };
    lua["imguiCheckbox"] = [](const char* label, bool v) -> bool {
        bool val = v;
        ImGui::Checkbox(label, &val);
        return val;
    };
    lua["imguiCombo"] = [](const char* label, int currentItem, sol::table items, int itemsCount, sol::optional<int> popupMaxHeightInItems) -> int {
        std::vector<const char*> itemPtrs;
        itemPtrs.reserve(itemsCount);
        std::vector<std::string> storage;
        storage.reserve(itemsCount);
        for (int i = 1; i <= itemsCount; ++i) {
            sol::object obj = items[i];
            if (obj.is<std::string>()) {
                storage.push_back(obj.as<std::string>());
                itemPtrs.push_back(storage.back().c_str());
            } else if (obj.is<const char*>()) {
                itemPtrs.push_back(obj.as<const char*>());
            } else {
                storage.push_back("?");
                itemPtrs.push_back(storage.back().c_str());
            }
        }
        int sel = currentItem;
        if (ImGui::Combo(label, &sel, itemPtrs.data(), itemsCount, popupMaxHeightInItems.value_or(-1)))
            return sel;
        return currentItem;
    };
    lua["imguiBeginChild"] = [](const char* id, sol::optional<float> w, sol::optional<float> h, sol::optional<int> border, sol::optional<int> flags) -> bool {
        return ImGui::BeginChild(id, ImVec2(w.value_or(0.0f), h.value_or(0.0f)), border.value_or(false) ? ImGuiChildFlags_Borders : ImGuiChildFlags_None, static_cast<ImGuiWindowFlags>(flags.value_or(0)));
    };
    lua["imguiEndChild"] = []() { ImGui::EndChild(); };
    lua["imguiTextColored"] = [](uint32_t col, const char* text) {
        float a = static_cast<float>((col >> 24) & 0xffu) / 255.0f;
        float r = static_cast<float>((col >> 16) & 0xffu) / 255.0f;
        float g = static_cast<float>((col >> 8) & 0xffu) / 255.0f;
        float b = static_cast<float>(col & 0xffu) / 255.0f;
        ImGui::TextColored(ImVec4(r, g, b, a), "%s", text);
    };
    lua["imguiBulletText"] = [](const char* text) { ImGui::BulletText("%s", text); };
    lua["imguiSpacing"] = []() { ImGui::Spacing(); };
    lua["imguiDummy"] = [](float w, float h) { ImGui::Dummy(ImVec2(w, h)); };
    lua["imguiSeparatorText"] = [](const char* label) { ImGui::SeparatorText(label); };
    lua["imguiArrowButton"] = [](const char* id, int dir) -> bool {
        return ImGui::ArrowButton(id, static_cast<ImGuiDir>(dir));
    };
    lua["imguiSmallButton"] = [](const char* label) -> bool {
        return ImGui::SmallButton(label);
    };
    lua["imguiRadioButton"] = [](const char* label, bool active) -> bool {
        return ImGui::RadioButton(label, active);
    };
    lua["imguiProgressBar"] = [](float fraction, sol::optional<float> w, sol::optional<float> h, sol::optional<const char*> overlay) {
        ImGui::ProgressBar(fraction, ImVec2(w.value_or(-1.0f), h.value_or(0.0f)), overlay.value_or(nullptr));
    };
    lua["imguiBeginDisabled"] = [](bool disabled) { ImGui::BeginDisabled(disabled); };
    lua["imguiEndDisabled"] = []() { ImGui::EndDisabled(); };
    lua["imguiSetNextItemWidth"] = [](float width) { ImGui::SetNextItemWidth(width); };
    lua["imguiPushItemFlag"] = [](int flag, bool enabled) { ImGui::PushItemFlag(static_cast<ImGuiItemFlags>(flag), enabled); };
    lua["imguiPopItemFlag"] = []() { ImGui::PopItemFlag(); };
    lua["imguiIsItemHovered"] = []() -> bool { return ImGui::IsItemHovered(); };
    lua["imguiIsItemClicked"] = [](sol::optional<int> mouseButton) -> bool {
        return ImGui::IsItemClicked(static_cast<ImGuiMouseButton>(mouseButton.value_or(0)));
    };
    lua["imguiTooltip"] = [](const char* text) {
        if (ImGui::IsItemHovered(ImGuiHoveredFlags_DelayShort)) {
            ImGui::SetTooltip("%s", text);
        }
    };
    lua["imguiIndent"] = [](sol::optional<float> w) { ImGui::Indent(w.value_or(0.0f)); };
    lua["imguiUnindent"] = [](sol::optional<float> w) { ImGui::Unindent(w.value_or(0.0f)); };
    lua["imguiBeginGroup"] = []() { ImGui::BeginGroup(); };
    lua["imguiEndGroup"] = []() { ImGui::EndGroup(); };
    lua["imguiInputText"] = [](const char* label, const char* text, size_t maxLen, sol::optional<int> flags) -> std::string {
        std::string buf(text ? text : "");
        buf.resize(maxLen, '\0');
        if (ImGui::InputText(label, buf.data(), maxLen, static_cast<ImGuiInputTextFlags>(flags.value_or(0))))
            return buf.c_str();
        return text ? std::string(text) : "";
    };
    lua["imguiInputFloat"] = [](const char* label, float v, sol::optional<float> step, sol::optional<float> stepFast, sol::optional<const char*> fmt) -> float {
        float val = v;
        ImGui::InputFloat(label, &val, step.value_or(0.01f), stepFast.value_or(0.1f), fmt.value_or("%.3f"));
        return val;
    };
    lua["imguiInputInt"] = [](const char* label, int v, sol::optional<int> step, sol::optional<int> stepFast) -> int {
        int val = v;
        ImGui::InputInt(label, &val, step.value_or(1), stepFast.value_or(100));
        return val;
    };
    lua["imguiColorEdit3"] = [&lua](const char* label, float r, float g, float b, sol::optional<int> flags) -> sol::optional<sol::table> {
        float col[3] = { r, g, b };
        if (ImGui::ColorEdit3(label, col, static_cast<ImGuiColorEditFlags>(flags.value_or(0)))) {
            auto t = sol::table(lua, sol::create);
            t["r"] = col[0];
            t["g"] = col[1];
            t["b"] = col[2];
            return t;
        }
        return sol::nullopt;
    };
    lua["imguiColorEdit4"] = [&lua](const char* label, float r, float g, float b, float a, sol::optional<int> flags) -> sol::optional<sol::table> {
        float col[4] = { r, g, b, a };
        if (ImGui::ColorEdit4(label, col, static_cast<ImGuiColorEditFlags>(flags.value_or(0)))) {
            auto t = sol::table(lua, sol::create);
            t["r"] = col[0];
            t["g"] = col[1];
            t["b"] = col[2];
            t["a"] = col[3];
            return t;
        }
        return sol::nullopt;
    };
    lua["imguiCollapsingHeader"] = [](const char* label, sol::optional<int> flags) -> bool {
        return ImGui::CollapsingHeader(label, static_cast<ImGuiTreeNodeFlags>(flags.value_or(0)));
    };
    lua["imguiTreeNode"] = [](const char* label, sol::optional<int> flags) -> bool {
        return ImGui::TreeNodeEx(label, static_cast<ImGuiTreeNodeFlags>(flags.value_or(0)));
    };
    lua["imguiTreePop"] = []() { ImGui::TreePop(); };
    lua["imguiGetFrameHeight"] = []() -> float { return ImGui::GetFrameHeight(); };
    lua["imguiGetStyleFramePadding"] = [&lua]() -> sol::table {
        auto t = sol::table(lua, sol::create);
        t["x"] = ImGui::GetStyle().FramePadding.x;
        t["y"] = ImGui::GetStyle().FramePadding.y;
        return t;
    };
    lua["imguiCalcTextSize"] = [&lua](const char* text, sol::optional<float> wrapWidth) -> sol::table {
        ImVec2 sz = ImGui::CalcTextSize(text, nullptr, true, wrapWidth.value_or(0.0f));
        auto t = sol::table(lua, sol::create);
        t["x"] = sz.x;
        t["y"] = sz.y;
        return t;
    };
    lua["imguiPushStyleVar"] = [](int idx, float val) { ImGui::PushStyleVar(static_cast<ImGuiStyleVar>(idx), val); };
    lua["imguiPushStyleVar2"] = [](int idx, float x, float y) { ImGui::PushStyleVar(static_cast<ImGuiStyleVar>(idx), ImVec2(x, y)); };
    lua["imguiPopStyleVar"] = [](sol::optional<int> count) { ImGui::PopStyleVar(count.value_or(1)); };
    lua["imguiTextColored"] = [](uint32_t col, const char* text) {
        float a = static_cast<float>((col >> 24) & 0xffu) / 255.0f;
        float r = static_cast<float>((col >> 16) & 0xffu) / 255.0f;
        float g = static_cast<float>((col >> 8) & 0xffu) / 255.0f;
        float b = static_cast<float>(col & 0xffu) / 255.0f;
        ImGui::TextColored(ImVec4(r, g, b, a), "%s", text);
    };
    lua["resolveNodeSurfaceTexture"] = [](RuntimeNode& node, int width, int height) -> uint64_t {
        auto* host = ImGuiDirectHost::getActiveInstance();
        if (!host || width <= 0 || height <= 0) return 0;
        double time = ImGui::GetTime();
        return static_cast<uint64_t>(host->prepareCustomSurfaceTexture(node, width, height, time));
    };
    lua["imguiRetainedPanel"] = [](RuntimeNode& node, float width, float height, sol::optional<bool> fitToView) -> bool {
        auto* host = ImGuiDirectHost::getActiveInstance();
        if (!host || width <= 0.0f || height <= 0.0f) return false;
        ImGuiDirectHost::EmbeddedPanelOptions options;
        options.fitToView = fitToView.value_or(false);
        return host->renderEmbeddedRuntimePanel(node, width, height, options);
    };
    lua["imguiCond_None"] = static_cast<int>(ImGuiCond_None);
    lua["imguiCond_Always"] = static_cast<int>(ImGuiCond_Always);
    lua["imguiCond_Appearing"] = static_cast<int>(ImGuiCond_Appearing);
    lua["imguiWindowFlags_None"] = 0;
    lua["imguiWindowFlags_NoResize"] = static_cast<int>(ImGuiWindowFlags_NoResize);
    lua["imguiWindowFlags_NoMove"] = static_cast<int>(ImGuiWindowFlags_NoMove);
    lua["imguiWindowFlags_NoCollapse"] = static_cast<int>(ImGuiWindowFlags_NoCollapse);
    lua["imguiWindowFlags_NoScrollbar"] = static_cast<int>(ImGuiWindowFlags_NoScrollbar);
    lua["imguiWindowFlags_NoTitleBar"] = static_cast<int>(ImGuiWindowFlags_NoTitleBar);
    lua["imguiWindowFlags_NoSavedSettings"] = static_cast<int>(ImGuiWindowFlags_NoSavedSettings);
    lua["imguiTableFlags_None"] = static_cast<int>(ImGuiTableFlags_None);
    lua["imguiTableFlags_Borders"] = static_cast<int>(ImGuiTableFlags_Borders);
    lua["imguiTableFlags_RowBg"] = static_cast<int>(ImGuiTableFlags_RowBg);
    lua["imguiTableFlags_SizingFixedFit"] = static_cast<int>(ImGuiTableFlags_SizingFixedFit);
    lua["imguiDockNodeFlags_None"] = static_cast<int>(ImGuiDockNodeFlags_None);
    lua["imguiDockNodeFlags_DockSpace"] = static_cast<int>(ImGuiDockNodeFlags_DockSpace);
    lua["imguiDockNodeFlags_HiddenTabBar"] = static_cast<int>(ImGuiDockNodeFlags_HiddenTabBar);
    lua["imguiDockNodeFlags_NoTabBar"] = static_cast<int>(ImGuiDockNodeFlags_NoTabBar);
    lua["imguiDir_Left"] = static_cast<int>(ImGuiDir_Left);
    lua["imguiDir_Right"] = static_cast<int>(ImGuiDir_Right);
    lua["imguiDir_Up"] = static_cast<int>(ImGuiDir_Up);
    lua["imguiDir_Down"] = static_cast<int>(ImGuiDir_Down);
    lua["imguiColorFlags_None"] = static_cast<int>(ImGuiColorEditFlags_None);
    lua["imguiSliderFlags_None"] = static_cast<int>(ImGuiSliderFlags_None);
    lua["imguiSliderFlags_AlwaysClamp"] = static_cast<int>(ImGuiSliderFlags_AlwaysClamp);
    lua["imguiSliderFlags_Logarithmic"] = static_cast<int>(ImGuiSliderFlags_Logarithmic);
    lua["imguiTreeNodeFlags_None"] = static_cast<int>(ImGuiTreeNodeFlags_None);
    lua["imguiTreeNodeFlags_DefaultOpen"] = static_cast<int>(ImGuiTreeNodeFlags_DefaultOpen);
    lua["imguiTreeNodeFlags_SpanFullWidth"] = static_cast<int>(ImGuiTreeNodeFlags_SpanFullWidth);
    lua["imguiStyleVar_FramePadding"] = static_cast<int>(ImGuiStyleVar_FramePadding);
    lua["imguiStyleVar_ItemSpacing"] = static_cast<int>(ImGuiStyleVar_ItemSpacing);
    lua["imguiStyleVar_WindowPadding"] = static_cast<int>(ImGuiStyleVar_WindowPadding);
    lua["imguiStyleVar_FrameRounding"] = static_cast<int>(ImGuiStyleVar_FrameRounding);
    lua["imguiStyleVar_GrabRounding"] = static_cast<int>(ImGuiStyleVar_GrabRounding);
    lua["imguiStyleVar_ScrollbarSize"] = static_cast<int>(ImGuiStyleVar_ScrollbarSize);
    lua["imguiCol_Text"] = static_cast<int>(ImGuiCol_Text);
    lua["imguiCol_FrameBg"] = static_cast<int>(ImGuiCol_FrameBg);
    lua["imguiCol_FrameBgHovered"] = static_cast<int>(ImGuiCol_FrameBgHovered);
    lua["imguiCol_FrameBgActive"] = static_cast<int>(ImGuiCol_FrameBgActive);
    lua["imguiCol_Button"] = static_cast<int>(ImGuiCol_Button);
    lua["imguiCol_ButtonHovered"] = static_cast<int>(ImGuiCol_ButtonHovered);
    lua["imguiCol_ButtonActive"] = static_cast<int>(ImGuiCol_ButtonActive);
    lua["imguiCol_Header"] = static_cast<int>(ImGuiCol_Header);
    lua["imguiCol_Separator"] = static_cast<int>(ImGuiCol_Separator);
    lua["imguiCol_Tab"] = static_cast<int>(ImGuiCol_Tab);
    lua["imguiCol_TabActive"] = static_cast<int>(ImGuiCol_TabActive);
    lua["imguiCol_TabHovered"] = static_cast<int>(ImGuiCol_TabHovered);
    lua["imguiCol_TitleBg"] = static_cast<int>(ImGuiCol_TitleBg);
    lua["imguiCol_TitleBgActive"] = static_cast<int>(ImGuiCol_TitleBgActive);

    std::fprintf(stderr, "[LuaControlBindings] Registered systemPaths table + imgui bindings\n");
}

} // namespace lua_bindings
