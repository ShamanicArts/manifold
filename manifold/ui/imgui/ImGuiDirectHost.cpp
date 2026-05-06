#include "ImGuiDirectHost.h"

#include "Theme.h"
#include "DirectHostRenderSupport.h"
#include "DirectHostRuntimeSupport.h"
#include "DirectHostInputSupport.h"
#include "DirectHostEmbeddedPanelSupport.h"
#include "DirectHostStatsSupport.h"
#include "DirectHostSurfaceSupport.h"
#include "../../primitives/shaders/ShaderSurfaceProvider.h"
#include "../../primitives/sources/GeneratedSourceProvider.h"
#include "../../primitives/composite/CompositeSurfaceProvider.h"
#include "../../primitives/video/VideoSurfaceProvider.h"
#include "../../primitives/ui/CustomSurfaceProvider.h"
#if MANIFOLD_HAS_ML
#include "../../primitives/ml/MLMaskSurfaceProvider.h"
#endif
#include "backends/imgui_impl_opengl3.h"
#include "imgui.h"
#include "imgui_internal.h"

#include <algorithm>
#include <array>
#include <cfloat>
#include <cmath>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <unordered_set>

#if JUCE_LINUX
#include <EGL/egl.h>
#endif

using namespace juce::gl;

thread_local ImGuiDirectHost* ImGuiDirectHost::activeInstance_ = nullptr;

namespace {
constexpr double kDeferredSurfaceBudgetMicros = 2000.0;
} // namespace

#include "DirectHostGlLifecycleSupport.h"

ImGuiDirectHost::ImGuiDirectHost()
    : frameContextImpl_(std::make_unique<ImGuiDirectFrameContext>()),
      openGLContext_(frameContextImpl_->openGLContext()),
      eglOffscreenContext_(frameContextImpl_->eglOffscreenContext()),
      imguiContext_(frameContextImpl_->imguiContext()),
      contextReady_(frameContextImpl_->contextReady()),
      surfaceHostImpl_(std::make_unique<ImGuiDirectSurfaceHost>()),
      embeddedPanelTouchedSurfaceIds_(surfaceHostImpl_->embeddedPanelTouchedSurfaceIds()),
      cachedSurfaceTextures_(surfaceHostImpl_->cachedSurfaceTextures()),
      surfaceProviders_(surfaceHostImpl_->surfaceProviders()),
      videoSurfaceProvider_(surfaceHostImpl_->videoSurfaceProvider()),
      generatedSourceProvider_(surfaceHostImpl_->generatedSourceProvider()),
      shaderSurfaceProvider_(surfaceHostImpl_->shaderSurfaceProvider()),
      compositeSurfaceProvider_(surfaceHostImpl_->compositeSurfaceProvider())
#if MANIFOLD_HAS_ML
      , mlMaskSurfaceProvider_(surfaceHostImpl_->mlMaskSurfaceProvider())
#endif
{
    surfaceHostImpl_->configureResolvers(
        [this](const std::string& nodeId) -> RuntimeNode* {
            if (liveRoot_ == nullptr || nodeId.empty()) {
                return nullptr;
            }
            return liveRoot_->findById(nodeId);
        },
        [this](const RuntimeNode& node, int width, int height, double timeSeconds) {
            return prepareCustomSurfaceTextureImmediate(node, width, height, timeSeconds);
        },
        [this](uint64_t stableId, std::uintptr_t textureHandle) {
            embeddedPanelTouchedSurfaceIds_.insert(stableId);
            cachedSurfaceTextures_[stableId].textureHandle = textureHandle;
        });

    setOpaque(true);
    setWantsKeyboardFocus(true);
    setMouseClickGrabsKeyboardFocus(true);
    setInterceptsMouseClicks(true, true);

    frameContextImpl_->configure(this);
}

ImGuiDirectHost::~ImGuiDirectHost() {
    shutdown();
}

void ImGuiDirectHost::registerSurfaceProvider(std::shared_ptr<CustomSurfaceProvider> provider) {
    surfaceHostImpl_->registerSurfaceProvider(std::move(provider));
}

void ImGuiDirectHost::unregisterSurfaceProvider(const std::string& typeHint) {
    surfaceHostImpl_->unregisterSurfaceProvider(typeHint);
}

ImGuiDirectHost::StatsSnapshot ImGuiDirectHost::getStatsSnapshot() const {
    StatsSnapshot snapshot;
    snapshot.contextReady = contextReady_;
    snapshot.testWindowVisible = isVisible();
    snapshot.wantCaptureMouse = wantCaptureMouse_.load(std::memory_order_relaxed);
    snapshot.wantCaptureKeyboard = wantCaptureKeyboard_.load(std::memory_order_relaxed);
    snapshot.frameCount = frameCount_.load(std::memory_order_relaxed);
    snapshot.lastRenderUs = lastRenderUs_.load(std::memory_order_relaxed);
    snapshot.lastVertexCount = lastVertexCount_.load(std::memory_order_relaxed);
    snapshot.lastIndexCount = lastIndexCount_.load(std::memory_order_relaxed);
    snapshot.fontAtlasBytes = fontAtlasBytes_.load(std::memory_order_relaxed);
    snapshot.surfaceColorBytes = surfaceColorBytes_.load(std::memory_order_relaxed);
    snapshot.surfaceDepthBytes = surfaceDepthBytes_.load(std::memory_order_relaxed);
    snapshot.totalGpuBytes = snapshot.fontAtlasBytes + snapshot.surfaceColorBytes + snapshot.surfaceDepthBytes;
    {
        std::lock_guard<std::mutex> lock(snapshotMutex_);
        int64_t pendingCount = 0;
        int64_t activeCount = 0;
        int64_t glCount = 0;
        snapshot.renderSnapshotBytes = direct_host_stats_support::estimateRenderSnapshotBytes(pendingSnapshot_, pendingCount)
                                     + direct_host_stats_support::estimateRenderSnapshotBytes(activeSnapshot_, activeCount)
                                     + direct_host_stats_support::estimateRenderSnapshotBytes(glSnapshot_, glCount);
        snapshot.renderSnapshotNodeCount = pendingCount + activeCount + glCount;
    }
    snapshot.customSurfaceStateBytes = (videoSurfaceProvider_ ? videoSurfaceProvider_->estimateStateBytes() : 0)
                                     + (generatedSourceProvider_ ? generatedSourceProvider_->estimateStateBytes() : 0)
                                     + (shaderSurfaceProvider_ ? shaderSurfaceProvider_->estimateStateBytes() : 0)
#if MANIFOLD_HAS_ML
                                     + (mlMaskSurfaceProvider_ ? mlMaskSurfaceProvider_->estimateStateBytes() : 0)
#endif
                                     ;
    direct_host_stats_support::estimateImGuiInternalStats(reinterpret_cast<ImGuiContext*>(imguiContext_), snapshot);
    return snapshot;
}

std::string ImGuiDirectHost::getHoveredNodeId() const {
    auto* node = findLiveNodeByStableId(hoveredNodeStableId_);
    return node ? node->getNodeId() : std::string{};
}

std::string ImGuiDirectHost::getSelectedNodeId() const {
    auto* node = findLiveNodeByStableId(pressedNodeStableId_);
    return node ? node->getNodeId() : std::string{};
}

std::uintptr_t ImGuiDirectHost::prepareCustomSurfaceTextureImmediate(const RuntimeNode& node,
                                                                     int width,
                                                                     int height,
                                                                     double timeSeconds) {
    if (node.getStableId() == 0 || width <= 0 || height <= 0) {
        return 0;
    }

    const auto texture = surfaceHostImpl_->prepareCustomSurfaceTexture(node, width, height, timeSeconds);
    recalculateOwnedGpuBytes();
    return texture;
}

std::uintptr_t ImGuiDirectHost::prepareCustomSurfaceTexture(const RuntimeNode& node,
                                                            int width,
                                                            int height,
                                                            double timeSeconds) {
    return prepareCustomSurfaceTextureImmediate(node, width, height, timeSeconds);
}

void ImGuiDirectHost::processDeferredSurfaceRequests(double timeSeconds) {
    juce::ignoreUnused(timeSeconds);
}

bool ImGuiDirectHost::getVideoSurfaceInfo(uint64_t stableId, int& width, int& height, uint64_t& sequence) const {
    return surfaceHostImpl_->getSurfaceInfo(stableId, width, height, sequence);
}

bool ImGuiDirectHost::renderEmbeddedRuntimePanel(RuntimeNode& root,
                                                 float width,
                                                 float height,
                                                 const EmbeddedPanelOptions& options) {
    return direct_host_embedded_panel_support::renderEmbeddedRuntimePanel(*this,
                                                                          renderer_,
                                                                          embeddedPanelStates_,
                                                                          embeddedPanelTouchedSurfaceIds_,
                                                                          root,
                                                                          width,
                                                                          height,
                                                                          options);
}



