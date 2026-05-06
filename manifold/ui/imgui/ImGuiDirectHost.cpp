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

#if JUCE_LINUX
struct ImGuiDirectHost::EglOffscreenContext {
    ~EglOffscreenContext() { shutdown(); }

    bool initialise(int newWidth, int newHeight) {
        if (newWidth <= 0 || newHeight <= 0) {
            return false;
        }

        if (display != EGL_NO_DISPLAY && width == newWidth && height == newHeight) {
            return true;
        }

        shutdown();

        display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
        if (display == EGL_NO_DISPLAY) {
            return false;
        }

        EGLint major = 0;
        EGLint minor = 0;
        if (!eglInitialize(display, &major, &minor)) {
            shutdown();
            return false;
        }

        if (!eglBindAPI(EGL_OPENGL_API)) {
            shutdown();
            return false;
        }

        const EGLint configAttribs[] = {
            EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
            EGL_RENDERABLE_TYPE, EGL_OPENGL_BIT,
            EGL_RED_SIZE, 8,
            EGL_GREEN_SIZE, 8,
            EGL_BLUE_SIZE, 8,
            EGL_ALPHA_SIZE, 8,
            EGL_DEPTH_SIZE, 16,
            EGL_NONE
        };

        EGLint numConfigs = 0;
        if (!eglChooseConfig(display, configAttribs, &config, 1, &numConfigs) || numConfigs < 1) {
            shutdown();
            return false;
        }

        const EGLint pbufferAttribs[] = {
            EGL_WIDTH, newWidth,
            EGL_HEIGHT, newHeight,
            EGL_NONE
        };

        surface = eglCreatePbufferSurface(display, config, pbufferAttribs);
        if (surface == EGL_NO_SURFACE) {
            shutdown();
            return false;
        }

        context = eglCreateContext(display, config, EGL_NO_CONTEXT, nullptr);
        if (context == EGL_NO_CONTEXT) {
            shutdown();
            return false;
        }

        width = newWidth;
        height = newHeight;
        return true;
    }

    void shutdown() {
        if (display != EGL_NO_DISPLAY) {
            eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
        }
        if (display != EGL_NO_DISPLAY && context != EGL_NO_CONTEXT) {
            eglDestroyContext(display, context);
        }
        if (display != EGL_NO_DISPLAY && surface != EGL_NO_SURFACE) {
            eglDestroySurface(display, surface);
        }
        if (display != EGL_NO_DISPLAY) {
            eglTerminate(display);
        }
        display = EGL_NO_DISPLAY;
        context = EGL_NO_CONTEXT;
        surface = EGL_NO_SURFACE;
        config = nullptr;
        width = 0;
        height = 0;
    }

    bool makeCurrent() {
        return display != EGL_NO_DISPLAY
            && surface != EGL_NO_SURFACE
            && context != EGL_NO_CONTEXT
            && eglMakeCurrent(display, surface, surface, context);
    }

    void doneCurrent() {
        if (display != EGL_NO_DISPLAY) {
            eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
        }
    }

    bool isValid() const {
        return display != EGL_NO_DISPLAY
            && surface != EGL_NO_SURFACE
            && context != EGL_NO_CONTEXT;
    }

    EGLDisplay display = EGL_NO_DISPLAY;
    EGLConfig config = nullptr;
    EGLContext context = EGL_NO_CONTEXT;
    EGLSurface surface = EGL_NO_SURFACE;
    int width = 0;
    int height = 0;
};
#endif

thread_local ImGuiDirectHost* ImGuiDirectHost::activeInstance_ = nullptr;

namespace {
constexpr double kDeferredSurfaceBudgetMicros = 2000.0;
} // namespace

#include "DirectHostGlLifecycleSupport.h"

ImGuiDirectHost::ImGuiDirectHost()
    : surfaceHostImpl_(std::make_unique<ImGuiDirectSurfaceHost>()),
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

    openGLContext_.setRenderer(this);
    openGLContext_.setComponentPaintingEnabled(false);
#ifndef __ANDROID__
    // openGLContext_.setPersistentAttachment(true); // Requires patched JUCE
#endif
    openGLContext_.setContinuousRepainting(false);
    // renderNow() runs on the message thread in direct mode. Blocking that
    // thread on vsync makes menu/popup interaction feel like dogshit.
    openGLContext_.setSwapInterval(0);
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



