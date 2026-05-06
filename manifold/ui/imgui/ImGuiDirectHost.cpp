#include "ImGuiDirectHost.h"

#include "Theme.h"
#include "DirectHostRenderSupport.h"
#include "DirectHostEmbeddedPanelSupport.h"
#include "DirectHostStatsSupport.h"
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

ImGuiDirectHost::ImGuiDirectHost()
    : surfaceProviders_(),
      videoSurfaceProvider_(std::make_shared<manifold::video::VideoSurfaceProvider>()),
      generatedSourceProvider_(std::make_shared<manifold::sources::GeneratedSourceProvider>()),
      shaderSurfaceProvider_(std::make_shared<manifold::shaders::ShaderSurfaceProvider>()),
      compositeSurfaceProvider_(std::make_shared<manifold::composite::CompositeSurfaceProvider>())
#if MANIFOLD_HAS_ML
      , mlMaskSurfaceProvider_(std::make_shared<manifold::ml::MLMaskSurfaceProvider>())
#endif
{
    registerSurfaceProvider(videoSurfaceProvider_);
    registerSurfaceProvider(generatedSourceProvider_);
    registerSurfaceProvider(shaderSurfaceProvider_);
    registerSurfaceProvider(compositeSurfaceProvider_);
#if MANIFOLD_HAS_ML
    registerSurfaceProvider(mlMaskSurfaceProvider_);
#endif

    shaderSurfaceProvider_->setInputResolver([this](const std::string& sourceType,
                                                    const std::string& sourceId,
                                                    const RuntimeNode& node,
                                                    int width,
                                                    int height,
                                                    double timeSeconds) {
        manifold::shaders::ShaderSurfaceProvider::ResolvedInputTexture resolved;
        if (sourceType == "video_input" && videoSurfaceProvider_) {
            resolved.textureHandle = videoSurfaceProvider_->prepareTexture(node, width, height, timeSeconds);
            if (resolved.textureHandle != 0) {
                videoSurfaceProvider_->getSurfaceInfo(node.getStableId(),
                                                      resolved.width,
                                                      resolved.height,
                                                      resolved.sequence);
            }
            return resolved;
        }
        if (sourceType == "generated_source" && generatedSourceProvider_) {
            resolved.textureHandle = generatedSourceProvider_->prepareTexture(node, width, height, timeSeconds);
            if (resolved.textureHandle != 0) {
                generatedSourceProvider_->getSurfaceInfo(node.getStableId(),
                                                         resolved.width,
                                                         resolved.height,
                                                         resolved.sequence);
            }
            return resolved;
        }
        if (sourceType == "node_surface") {
            if (sourceId.empty() || liveRoot_ == nullptr) {
                return resolved;
            }
            auto* targetNode = liveRoot_->findById(sourceId);
            if (targetNode == nullptr || targetNode->getStableId() == 0) {
                return resolved;
            }
            if (targetNode->getStableId() == node.getStableId()) {
                return resolved;
            }
            resolved.textureHandle = prepareCustomSurfaceTextureImmediate(*targetNode, width, height, timeSeconds);
            if (resolved.textureHandle != 0) {
                embeddedPanelTouchedSurfaceIds_.insert(targetNode->getStableId());
                cachedSurfaceTextures_[targetNode->getStableId()].textureHandle = resolved.textureHandle;
                if (!getVideoSurfaceInfo(targetNode->getStableId(), resolved.width, resolved.height, resolved.sequence)) {
                    resolved.width = width;
                    resolved.height = height;
                    resolved.sequence = 0;
                }
            }
            return resolved;
        }
        return resolved;
    });

    compositeSurfaceProvider_->setNodeTextureResolver([this](const std::string& targetNodeId,
                                                             const RuntimeNode& requestingNode,
                                                             int width,
                                                             int height,
                                                             double timeSeconds) {
        manifold::composite::CompositeSurfaceProvider::ResolvedNodeTexture resolved;
        if (targetNodeId.empty() || liveRoot_ == nullptr) {
            return resolved;
        }

        auto* targetNode = liveRoot_->findById(targetNodeId);
        if (targetNode == nullptr || targetNode->getStableId() == 0) {
            static int missingBudget = 24;
            if (missingBudget > 0) {
                --missingBudget;
                std::fprintf(stderr,
                             "[ImGuiDirectHost] composite resolver missing target node id=%s\n",
                             targetNodeId.c_str());
                std::fflush(stderr);
            }
            return resolved;
        }
        if (targetNode->getStableId() == requestingNode.getStableId()) {
            static int selfBudget = 12;
            if (selfBudget > 0) {
                --selfBudget;
                std::fprintf(stderr,
                             "[ImGuiDirectHost] composite resolver self-reference target=%s requester=%s\n",
                             targetNodeId.c_str(),
                             requestingNode.getNodeId().c_str());
                std::fflush(stderr);
            }
            return resolved;
        }
        resolved.textureHandle = prepareCustomSurfaceTextureImmediate(*targetNode, width, height, timeSeconds);
        if (resolved.textureHandle != 0) {
            embeddedPanelTouchedSurfaceIds_.insert(targetNode->getStableId());
            cachedSurfaceTextures_[targetNode->getStableId()].textureHandle = resolved.textureHandle;
            if (!getVideoSurfaceInfo(targetNode->getStableId(), resolved.width, resolved.height, resolved.sequence)) {
                resolved.width = width;
                resolved.height = height;
                resolved.sequence = 0;
            }
        } else {
            static int zeroBudget = 48;
            if (zeroBudget > 0) {
                --zeroBudget;
                std::fprintf(stderr,
                             "[ImGuiDirectHost] composite resolver zero texture target=%s type=%s requester=%s wh=%dx%d\n",
                             targetNodeId.c_str(),
                             targetNode->getCustomSurfaceType().c_str(),
                             requestingNode.getNodeId().c_str(),
                             width,
                             height);
                std::fflush(stderr);
            }
        }
        return resolved;
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

void ImGuiDirectHost::recalculateOwnedGpuBytes() {
    int64_t videoColorBytes = 0;
    int64_t videoDepthBytes = 0;
    int64_t generatedColorBytes = 0;
    int64_t generatedDepthBytes = 0;
    int64_t shaderColorBytes = 0;
    int64_t shaderDepthBytes = 0;
    int64_t compositeColorBytes = 0;
    int64_t compositeDepthBytes = 0;
#if MANIFOLD_HAS_ML
    int64_t mlColorBytes = 0;
    int64_t mlDepthBytes = 0;
#endif

    if (videoSurfaceProvider_) {
        videoSurfaceProvider_->getOwnedGpuBytes(videoColorBytes, videoDepthBytes);
    }
    if (generatedSourceProvider_) {
        generatedSourceProvider_->getOwnedGpuBytes(generatedColorBytes, generatedDepthBytes);
    }
    if (shaderSurfaceProvider_) {
        shaderSurfaceProvider_->getOwnedGpuBytes(shaderColorBytes, shaderDepthBytes);
    }
    if (compositeSurfaceProvider_) {
        compositeSurfaceProvider_->getOwnedGpuBytes(compositeColorBytes, compositeDepthBytes);
    }
#if MANIFOLD_HAS_ML
    if (mlMaskSurfaceProvider_) {
        mlMaskSurfaceProvider_->getOwnedGpuBytes(mlColorBytes, mlDepthBytes);
    }
#endif

    surfaceColorBytes_.store(videoColorBytes + generatedColorBytes + shaderColorBytes + compositeColorBytes
#if MANIFOLD_HAS_ML
                             + mlColorBytes
#endif
                             , std::memory_order_relaxed);
    surfaceDepthBytes_.store(videoDepthBytes + generatedDepthBytes + shaderDepthBytes + compositeDepthBytes
#if MANIFOLD_HAS_ML
                             + mlDepthBytes
#endif
                             , std::memory_order_relaxed);
}

std::uintptr_t ImGuiDirectHost::prepareCustomSurfaceTextureImmediate(const RuntimeNode& node,
                                                                     int width,
                                                                     int height,
                                                                     double timeSeconds) {
    if (node.getStableId() == 0 || width <= 0 || height <= 0) {
        return 0;
    }

    const auto surfaceType = node.getCustomSurfaceType();
    for (auto& provider : surfaceProviders_) {
        if (provider && provider->handlesType(surfaceType)) {
            const auto texture = provider->prepareTexture(node, width, height, timeSeconds);
            recalculateOwnedGpuBytes();
            return texture;
        }
    }

    return 0;
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
    for (auto& provider : surfaceProviders_) {
        if (provider && provider->getSurfaceInfo(stableId, width, height, sequence)) {
            return true;
        }
    }
    return false;
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

bool ImGuiDirectHost::ensureEglOffscreenContext(int width, int height) {
#if JUCE_LINUX
    if (!eglOffscreenContext_) {
        eglOffscreenContext_ = std::make_unique<EglOffscreenContext>();
    }
    if (eglOffscreenContext_->initialise(width, height)) {
        return true;
    }
    eglOffscreenContext_.reset();
#endif
    juce::ignoreUnused(width, height);
    return false;
}

void ImGuiDirectHost::releaseEglOffscreenContext() {
    if (eglOffscreenContext_) {
        eglOffscreenContext_->shutdown();
        eglOffscreenContext_.reset();
    }
}

void ImGuiDirectHost::initialiseImGuiBackendIfNeeded() {
    if (contextReady_) {
        return;
    }

    IMGUI_CHECKVERSION();
    auto* context = ImGui::CreateContext();
    imguiContext_ = context;
    ImGui::SetCurrentContext(context);

    auto& io = ImGui::GetIO();
    io.BackendPlatformName = "manifold_juce_imgui_direct";
    io.ConfigFlags |= ImGuiConfigFlags_DockingEnable;
    manifold::ui::imgui::configureToolFonts(io);
    fontAtlasBytes_.store(0, std::memory_order_relaxed);
    manifold::ui::imgui::applyToolTheme();
#if JUCE_LINUX
    if (!openGLContext_.isAttached() && eglOffscreenContext_ && eglOffscreenContext_->isValid()) {
        juce::gl::loadFunctions();
    }
#endif
    ImGui_ImplOpenGL3_Init("#version 150");
    contextReady_ = true;
}

void ImGuiDirectHost::shutdownImGuiBackend() {
    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext_);
    if (context != nullptr) {
        ImGui::SetCurrentContext(context);
        ImGui_ImplOpenGL3_Shutdown();
        ImGui::DestroyContext(context);
        imguiContext_ = nullptr;
    }
    fontAtlasBytes_.store(0, std::memory_order_relaxed);
    surfaceColorBytes_.store(0, std::memory_order_relaxed);
    surfaceDepthBytes_.store(0, std::memory_order_relaxed);
    contextReady_ = false;
}

bool ImGuiDirectHost::renderFrameWithCurrentContext(float scale, bool allowSwap) {
    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext_);
    if (context == nullptr) {
        return false;
    }

    ImGui::SetCurrentContext(context);

    const auto width = std::max(1, getWidth());
    const auto height = std::max(1, getHeight());
    const auto framebufferWidth = std::max(1, juce::roundToInt(scale * static_cast<float>(width)));
    const auto framebufferHeight = std::max(1, juce::roundToInt(scale * static_cast<float>(height)));

    auto& io = ImGui::GetIO();
    io.DisplaySize = ImVec2(static_cast<float>(width), static_cast<float>(height));
    io.DisplayFramebufferScale = ImVec2(scale, scale);

    {
        std::lock_guard<std::mutex> lock(inputMutex_);
        for (const auto& event : pendingEvents_) {
            switch (event.type) {
                case EventType::MousePos:
                    io.AddMousePosEvent(event.x, event.y);
                    break;
                case EventType::MouseButton:
                    io.AddMouseButtonEvent(event.button, event.down);
                    break;
                case EventType::MouseWheel:
                    io.AddMouseWheelEvent(event.x, event.y);
                    break;
                case EventType::Focus:
                    io.AddFocusEvent(event.focused);
                    break;
            }
        }
        pendingEvents_.clear();
    }

    using Clock = std::chrono::steady_clock;
    const auto t0 = Clock::now();

    const auto renderOptions = direct_host_render_support::makeDirectRenderOptions(debugOutlinesEnabled_);
    if (liveRoot_ != nullptr) {
        previewTransform_ = renderer_.buildPreviewTransform(*liveRoot_, width, height, renderOptions);
    } else {
        previewTransform_ = {};
    }

    const auto& theme = manifold::ui::imgui::toolTheme();
    glViewport(0, 0, framebufferWidth, framebufferHeight);
    glDisable(GL_SCISSOR_TEST);
    glClearColor(theme.panelBg.x, theme.panelBg.y, theme.panelBg.z, theme.panelBg.w);
    glClear(GL_COLOR_BUFFER_BIT);

    processDeferredSurfaceRequests(juce::Time::getMillisecondCounterHiRes() * 0.001);

    ImGui_ImplOpenGL3_NewFrame();
    ImGui::NewFrame();

    std::unordered_set<uint64_t> touchedSurfaceIds;
    ImDrawList* overlayDrawList = nullptr;

    ImGui::SetNextWindowPos(ImVec2(0.0f, 0.0f), ImGuiCond_Always);
    ImGui::SetNextWindowSize(ImVec2(static_cast<float>(width), static_cast<float>(height)), ImGuiCond_Always);
    constexpr ImGuiWindowFlags runtimeOverlayFlags = ImGuiWindowFlags_NoDecoration
                                                   | ImGuiWindowFlags_NoMove
                                                   | ImGuiWindowFlags_NoResize
                                                   | ImGuiWindowFlags_NoSavedSettings
                                                   | ImGuiWindowFlags_NoBringToFrontOnFocus
                                                   | ImGuiWindowFlags_NoNav
                                                   | ImGuiWindowFlags_NoInputs
                                                   | ImGuiWindowFlags_NoBackground;

    if (ImGui::Begin("##RuntimeNodeOverlay", nullptr, runtimeOverlayFlags)) {
        overlayDrawList = ImGui::GetWindowDrawList();
        if (liveRoot_ != nullptr) {
            direct_host_render_support::renderLiveTree(*this,
                           *liveRoot_,
                           overlayDrawList,
                           renderOptions,
                           previewTransform_,
                           touchedSurfaceIds,
                           juce::Time::getMillisecondCounterHiRes() * 0.001,
                           hoveredNodeStableId_,
                           pressedNodeStableId_);
        }
    }
    ImGui::End();

    // Merge embedded panel surface IDs before pruning, otherwise nodes
    // rendered via imguiRetainedPanel (which uses a different traversal)
    // lose their surface state every frame, destroying temporal feedback.
    for (const auto& id : embeddedPanelTouchedSurfaceIds_) {
        touchedSurfaceIds.insert(id);
    }
    embeddedPanelTouchedSurfaceIds_.clear();

    for (auto& provider : surfaceProviders_) {
        if (provider) {
            provider->prune(touchedSurfaceIds);
        }
    }
    for (auto it = cachedSurfaceTextures_.begin(); it != cachedSurfaceTextures_.end();) {
        if (touchedSurfaceIds.find(it->first) == touchedSurfaceIds.end()) {
            it = cachedSurfaceTextures_.erase(it);
        } else {
            ++it;
        }
    }
    recalculateOwnedGpuBytes();

    if (copyIdModeEnabled_) {
        const float margin = 8.0f;
        const char* label = "COPYID MODE - Click to copy ID";
        auto* font = ImGui::GetFont();
        const float fontSize = 14.0f;
        const ImVec2 textSize = font ? font->CalcTextSizeA(fontSize, FLT_MAX, 0.0f, label) : ImVec2(200, 14);
        const float padX = 12.0f;
        const float padY = 6.0f;
        const ImVec2 rectMin(margin, margin);
        const ImVec2 rectMax(margin + textSize.x + padX * 2, margin + textSize.y + padY * 2);
        const ImVec2 textPos(margin + padX, margin + padY);

        if (overlayDrawList != nullptr) {
            overlayDrawList->AddRectFilled(rectMin, rectMax, IM_COL32(56, 189, 248, 200), 6.0f);
            overlayDrawList->AddRect(rectMin, rectMax, IM_COL32(255, 255, 255, 255), 6.0f, 0, 2.0f);
            if (font) {
                overlayDrawList->AddText(font, fontSize, textPos, IM_COL32(255, 255, 255, 255), label);
            }
        }
    }

    activeInstance_ = this;
    if (liveRoot_ != nullptr) {
        direct_host_render_support::invokeOnImGuiFrameRecursive(*liveRoot_, *liveRoot_);
    }
    activeInstance_ = nullptr;

    ImGui::Render();
    int64_t vertexCount = 0;
    int64_t indexCount = 0;
    if (auto* drawData = ImGui::GetDrawData()) {
        vertexCount = static_cast<int64_t>(drawData->TotalVtxCount);
        indexCount = static_cast<int64_t>(drawData->TotalIdxCount);
        ImGui_ImplOpenGL3_RenderDrawData(drawData);
    }

    if (allowSwap && !skipNextSwap_ && openGLContext_.isAttached()) {
        openGLContext_.swapBuffers();
    }
    skipNextSwap_ = false;

    const auto tEnd = Clock::now();
    wantCaptureMouse_.store(io.WantCaptureMouse, std::memory_order_relaxed);
    wantCaptureKeyboard_.store(io.WantCaptureKeyboard, std::memory_order_relaxed);
    frameCount_.fetch_add(1, std::memory_order_relaxed);
    lastRenderUs_.store(std::chrono::duration_cast<std::chrono::microseconds>(tEnd - t0).count(),
                        std::memory_order_relaxed);
    lastVertexCount_.store(vertexCount, std::memory_order_relaxed);
    lastIndexCount_.store(indexCount, std::memory_order_relaxed);
    return true;
}

void ImGuiDirectHost::setGlobalKeyHandler(GlobalKeyHandler handler) {
    globalKeyHandler_ = std::move(handler);
}

void ImGuiDirectHost::setRootNode(RuntimeNode* root) {
    if (liveRoot_ == root) {
        return;
    }

    liveRoot_ = root;
    pressedNodeStableId_ = 0;
    hoveredNodeStableId_ = 0;
    focusedNodeStableId_ = 0;
    pendingDragEvent_ = {};
    lastContinuousInputDispatchMs_ = 0.0;
    previewTransform_ = {};

    {
        std::lock_guard<std::mutex> lock(snapshotMutex_);
        pendingSnapshot_ = {};
        activeSnapshot_ = {};
    }
    snapshotReady_.store(true, std::memory_order_release);
}

void ImGuiDirectHost::buildRenderSnapshot() {
    const auto renderOptions = direct_host_render_support::makeDirectRenderOptions();
    if (liveRoot_ != nullptr && getWidth() > 0 && getHeight() > 0) {
        previewTransform_ = renderer_.buildPreviewTransform(*liveRoot_, getWidth(), getHeight(), renderOptions);
    } else {
        previewTransform_ = {};
    }
}

void ImGuiDirectHost::flushPendingDrag() {
    if (!pendingDragEvent_.valid || pendingDragEvent_.stableId == 0) {
        return;
    }

    auto* node = findLiveNodeByStableId(pendingDragEvent_.stableId);
    if (node != nullptr) {
        invokeLiveMouseDrag(*node,
                            pendingDragEvent_.localPosition,
                            pendingDragEvent_.dragDelta,
                            pendingDragEvent_.mods);
    }

    pendingDragEvent_ = {};
    lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
}

void ImGuiDirectHost::renderNow() {
    if (renderInProgress_) {
        return;
    }
    juce::ScopedValueSetter<bool> renderGuard(renderInProgress_, true);

    attachContextIfNeeded();

    if (getWidth() <= 0 || getHeight() <= 0 || (!isShowing() && !forceNextRender_)) {
        wantCaptureMouse_.store(false, std::memory_order_relaxed);
        wantCaptureKeyboard_.store(false, std::memory_order_relaxed);
        lastVertexCount_.store(0, std::memory_order_relaxed);
        lastIndexCount_.store(0, std::memory_order_relaxed);
        return;
    }

    if (!openGLContext_.isAttached() || !contextReady_) {
        wantCaptureMouse_.store(false, std::memory_order_relaxed);
        wantCaptureKeyboard_.store(false, std::memory_order_relaxed);
        lastVertexCount_.store(0, std::memory_order_relaxed);
        lastIndexCount_.store(0, std::memory_order_relaxed);
        return;
    }

    flushPendingDrag();

    if (!openGLContext_.makeActive()) {
        return;
    }

    const auto scale = static_cast<float>(openGLContext_.getRenderingScale());
    (void) renderFrameWithCurrentContext(scale, true);
    juce::OpenGLContext::deactivateCurrentContext();
}

juce::Image ImGuiDirectHost::captureScreenshot() {
    const int w = getWidth();
    const int h = getHeight();
    if (w <= 0 || h <= 0) {
        return {};
    }

    const bool useJuceContext = openGLContext_.isAttached() && contextReady_;
    const bool useEglContext = !useJuceContext && ensureEglOffscreenContext(w, h);
    if (!useJuceContext && !useEglContext) {
        return {};
    }

    forceNextRender_ = true;
    skipNextSwap_ = false;

    bool active = false;
    float scale = 1.0f;
    if (useJuceContext) {
        active = openGLContext_.makeActive();
        if (active) {
            scale = static_cast<float>(openGLContext_.getRenderingScale());
        }
    } else if (eglOffscreenContext_ && eglOffscreenContext_->isValid()) {
        active = eglOffscreenContext_->makeCurrent();
        if (active) {
            initialiseImGuiBackendIfNeeded();
            scale = 1.0f;
        }
    }

    if (!active) {
        forceNextRender_ = false;
        return {};
    }

    flushPendingDrag();
    if (!renderFrameWithCurrentContext(scale, false)) {
        forceNextRender_ = false;
        if (useJuceContext) {
            juce::OpenGLContext::deactivateCurrentContext();
        } else if (eglOffscreenContext_) {
            eglOffscreenContext_->doneCurrent();
        }
        return {};
    }

    std::vector<std::uint8_t> pixels(static_cast<std::size_t>(w * h * 4));
    glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());

    if (useJuceContext) {
        openGLContext_.swapBuffers();
    }

    juce::Image result(juce::Image::ARGB, w, h, false);
    {
        juce::Image::BitmapData dest(result, juce::Image::BitmapData::writeOnly);
        for (int y = 0; y < h; ++y) {
            const int srcY = (h - 1) - y;
            const std::uint8_t* src = pixels.data() + static_cast<std::size_t>(srcY * w * 4);
            auto* dst = dest.getLinePointer(y);
            for (int x = 0; x < w; ++x) {
                dst[x * 4 + 0] = src[x * 4 + 2];
                dst[x * 4 + 1] = src[x * 4 + 1];
                dst[x * 4 + 2] = src[x * 4 + 0];
                dst[x * 4 + 3] = src[x * 4 + 3];
            }
        }
    }

    forceNextRender_ = false;
    if (useJuceContext) {
        juce::OpenGLContext::deactivateCurrentContext();
    } else if (eglOffscreenContext_) {
        eglOffscreenContext_->doneCurrent();
    }
    return result;
}

std::optional<juce::Rectangle<int>> ImGuiDirectHost::getRenderedNodeBounds(const std::string& nodeId,
                                                                            uint64_t stableId) {
    RuntimeNode* node = nullptr;
    if (liveRoot_ != nullptr && stableId != 0) {
        node = liveRoot_->findByStableId(stableId);
    }
    if (node == nullptr && liveRoot_ != nullptr && !nodeId.empty()) {
        node = liveRoot_->findById(nodeId);
    }
    if (node == nullptr) {
        return std::nullopt;
    }

    if ((!previewTransform_.valid || previewTransform_.scale <= 0.0f) && liveRoot_ != nullptr && getWidth() > 0 && getHeight() > 0) {
        previewTransform_ = renderer_.buildPreviewTransform(*liveRoot_, getWidth(), getHeight(), direct_host_render_support::makeDirectRenderOptions());
    }
    if (!previewTransform_.valid || previewTransform_.scale <= 0.0f) {
        return std::nullopt;
    }

    const auto sceneBounds = direct_host_render_support::sceneBoundsForNodeWithinRoot(nullptr, node);
    auto rendered = direct_host_render_support::previewRect(sceneBounds, previewTransform_).getSmallestIntegerContainer();
    rendered = rendered.getIntersection(juce::Rectangle<int>(0, 0, getWidth(), getHeight()));
    if (rendered.isEmpty()) {
        return std::nullopt;
    }
    return rendered;
}

juce::Image ImGuiDirectHost::readbackFramebuffer() {
    const int w = getWidth();
    const int h = getHeight();
    if (w <= 0 || h <= 0) {
        return {};
    }

    const bool useJuceContext = openGLContext_.isAttached() && contextReady_;
    const bool useEglContext = !useJuceContext && ensureEglOffscreenContext(w, h);
    if (!useJuceContext && !useEglContext) {
        return {};
    }

    bool active = false;
    if (useJuceContext) {
        active = openGLContext_.makeActive();
    } else if (eglOffscreenContext_ && eglOffscreenContext_->isValid()) {
        active = eglOffscreenContext_->makeCurrent();
    }

    if (!active) {
        return {};
    }

    std::vector<std::uint8_t> pixels(static_cast<std::size_t>(w * h * 4));
    glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());

    juce::Image result(juce::Image::ARGB, w, h, false);
    {
        juce::Image::BitmapData dest(result, juce::Image::BitmapData::writeOnly);
        for (int y = 0; y < h; ++y) {
            const int srcY = (h - 1) - y;
            const std::uint8_t* src = pixels.data() + static_cast<std::size_t>(srcY * w * 4);
            auto* dst = dest.getLinePointer(y);
            for (int x = 0; x < w; ++x) {
                dst[x * 4 + 0] = src[x * 4 + 2];
                dst[x * 4 + 1] = src[x * 4 + 1];
                dst[x * 4 + 2] = src[x * 4 + 0];
                dst[x * 4 + 3] = src[x * 4 + 3];
            }
        }
    }

    if (useJuceContext) {
        juce::OpenGLContext::deactivateCurrentContext();
    } else if (eglOffscreenContext_) {
        eglOffscreenContext_->doneCurrent();
    }
    return result;
}

void ImGuiDirectHost::registerSurfaceProvider(std::shared_ptr<CustomSurfaceProvider> provider) {
    surfaceProviders_.push_back(provider);
}

void ImGuiDirectHost::unregisterSurfaceProvider(const std::string& typeHint) {
    surfaceProviders_.erase(std::remove_if(surfaceProviders_.begin(), surfaceProviders_.end(),
        [&typeHint](const std::shared_ptr<CustomSurfaceProvider>& provider) {
            return provider && provider->handlesType(typeHint);
        }),
        surfaceProviders_.end());
}

void ImGuiDirectHost::shutdown() {
    liveRoot_ = nullptr;
    pressedNodeStableId_ = 0;
    hoveredNodeStableId_ = 0;
    focusedNodeStableId_ = 0;
    pendingDragEvent_ = {};
    lastContinuousInputDispatchMs_ = 0.0;
    previewTransform_ = {};
    wantCaptureMouse_.store(false, std::memory_order_relaxed);
    wantCaptureKeyboard_.store(false, std::memory_order_relaxed);
    lastVertexCount_.store(0, std::memory_order_relaxed);
    lastIndexCount_.store(0, std::memory_order_relaxed);
    deferredSurfaceRequests_.clear();
    deferredSurfaceOrder_.clear();
    cachedSurfaceTextures_.clear();

    if (openGLContext_.isAttached()) {
        openGLContext_.detach();
    } else if (contextReady_ && eglOffscreenContext_ && eglOffscreenContext_->makeCurrent()) {
        for (auto& provider : surfaceProviders_) {
            if (provider) {
                provider->releaseAll();
            }
        }
        recalculateOwnedGpuBytes();
        shutdownImGuiBackend();
        eglOffscreenContext_->doneCurrent();
    }

    releaseEglOffscreenContext();
    if (!openGLContext_.isAttached()) {
        shutdownImGuiBackend();
    }
}

void ImGuiDirectHost::resized() {
    attachContextIfNeeded();
    previewTransform_ = {};
    if (eglOffscreenContext_ && (eglOffscreenContext_->width != getWidth() || eglOffscreenContext_->height != getHeight())) {
        releaseEglOffscreenContext();
        if (!openGLContext_.isAttached()) {
            shutdownImGuiBackend();
        }
    }
}

void ImGuiDirectHost::visibilityChanged() {
    attachContextIfNeeded();
}

void ImGuiDirectHost::setVisible(bool shouldBeVisible) {
    Component::setVisible(shouldBeVisible);
    if (shouldBeVisible) {
        attachContextIfNeeded();
    }
}

void ImGuiDirectHost::parentHierarchyChanged() {
    attachContextIfNeeded();
}

void ImGuiDirectHost::mouseDown(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    if (e.mods.isLeftButtonDown()) {
        leftMouseDown_ = true;
        queueMouseButton(0, true);
    }
    if (e.mods.isRightButtonDown()) {
        rightMouseDown_ = true;
        queueMouseButton(1, true);
    }
    if (e.mods.isMiddleButtonDown()) {
        middleMouseDown_ = true;
        queueMouseButton(2, true);
    }

    if (wantCaptureMouse_.load(std::memory_order_relaxed)) {
        grabKeyboardFocus();
        renderNow();
        lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
        return;
    }

    updateHover(e.position, &e.mods);
    auto hit = hitTestLiveTree(e.position, manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Pointer);
    if (hit.node != nullptr) {
        pressedNodeStableId_ = hit.stableId;
        grabKeyboardFocus();
        setLiveFocus(hit.stableId);

        // If copyid mode is enabled, copy the node ID to clipboard instead of triggering
        if (copyIdModeEnabled_) {
            const std::string nodeId = hit.node->getNodeId();
            const std::string widgetType = hit.node->getWidgetType();
            const uint64_t stableId = hit.node->getStableId();
            
            // Build comprehensive debug identifier like the old deriveActiveDebugIdentifier
            std::vector<std::string> parts;
            
            // Widget type and name
            std::string displayName = nodeId;
            parts.push_back("widget:" + displayName);
            parts.push_back("type:" + (widgetType.empty() ? std::string("RuntimeNode") : widgetType));
            parts.push_back("stableId:" + std::to_string(stableId));
            
            // Build tree path by walking up the hierarchy
            std::string treePath;
            const RuntimeNode* current = hit.node;
            std::vector<std::string> pathParts;
            while (current != nullptr) {
                const RuntimeNode* parent = current->getParent();
                if (parent) {
                    // Find index among siblings
                    int index = -1;
                    for (int i = 0; i < parent->getNumChildren(); ++i) {
                        if (parent->getChild(i) == current) {
                            index = i;
                            break;
                        }
                    }
                    if (index >= 0) {
                        pathParts.push_back(std::to_string(index) + ":" + current->getNodeId());
                    }
                } else {
                    pathParts.push_back("0:" + current->getNodeId());
                }
                current = parent;
            }
            // Reverse to get root-to-leaf order
            std::reverse(pathParts.begin(), pathParts.end());
            for (size_t i = 0; i < pathParts.size(); ++i) {
                if (i > 0) treePath += "/";
                treePath += pathParts[i];
            }
            if (!treePath.empty()) {
                parts.push_back("tree:" + treePath);
            }
            
            // Collect callback names
            const auto& callbacks = hit.node->getCallbacks();
            std::vector<std::string> cbNames;
            if (callbacks.onMouseDown.valid()) cbNames.push_back("onMouseDown");
            if (callbacks.onMouseDrag.valid()) cbNames.push_back("onMouseDrag");
            if (callbacks.onMouseUp.valid()) cbNames.push_back("onMouseUp");
            if (callbacks.onMouseMove.valid()) cbNames.push_back("onMouseMove");
            if (callbacks.onMouseWheel.valid()) cbNames.push_back("onMouseWheel");
            if (callbacks.onKeyPress.valid()) cbNames.push_back("onKeyPress");
            if (callbacks.onClick.valid()) cbNames.push_back("onClick");
            if (callbacks.onDoubleClick.valid()) cbNames.push_back("onDoubleClick");
            if (callbacks.onMouseEnter.valid()) cbNames.push_back("onMouseEnter");
            if (callbacks.onMouseExit.valid()) cbNames.push_back("onMouseExit");
            if (callbacks.onValueChanged.valid()) cbNames.push_back("onValueChanged");
            if (callbacks.onToggled.valid()) cbNames.push_back("onToggled");
            
            if (!cbNames.empty()) {
                std::string cbStr = "callbacks:";
                for (size_t i = 0; i < cbNames.size(); ++i) {
                    if (i > 0) cbStr += ",";
                    cbStr += cbNames[i];
                }
                parts.push_back(cbStr);
            }
            
            // Join all parts with " | "
            std::string fullId;
            for (size_t i = 0; i < parts.size(); ++i) {
                if (i > 0) fullId += " | ";
                fullId += parts[i];
            }
            
            // Copy to clipboard using JUCE
            juce::SystemClipboard::copyTextToClipboard(juce::String(fullId));
            
            // Also call the callback so Lua can show console feedback
            if (copyIdCallback_) {
                copyIdCallback_(fullId);
            }
            
            renderNow();
            return;
        }

        const auto localPosition = juce::Point<float>(hit.scenePosition.x - static_cast<float>(hit.sceneBounds.getX()),
                                                      hit.scenePosition.y - static_cast<float>(hit.sceneBounds.getY()));
        if (auto* node = findLiveNodeByStableId(hit.stableId)) {
            invokeLiveMouseDown(*node, localPosition, e.mods);
        }
        renderNow();
    } else {
        pressedNodeStableId_ = 0;
        setLiveFocus(0);
        renderNow();
    }
}

void ImGuiDirectHost::mouseDrag(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    if (wantCaptureMouse_.load(std::memory_order_relaxed)) {
        const double nowMs = juce::Time::getMillisecondCounterHiRes();
        if (nowMs - lastContinuousInputDispatchMs_ >= (1000.0 / 60.0)) {
            renderNow();
            lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
        }
        return;
    }

    // Don't update hover during drag — we know what's pressed, and the hit test
    // + Lua callbacks at 60Hz+ floods the message thread, starving the timer.

    if (pressedNodeStableId_ == 0 || liveRoot_ == nullptr) {
        return;
    }

    auto* pressedNode = findLiveNodeByStableId(pressedNodeStableId_);
    if (pressedNode == nullptr) {
        pressedNodeStableId_ = 0;
        return;
    }

    auto scenePosition = scenePositionFromLocal(e.position);
    auto localPosition = direct_host_render_support::localPositionForNode(pressedNode, scenePosition);
    juce::Point<float> dragDelta(e.getDistanceFromDragStartX() / std::max(1.0f, previewTransform_.scale),
                                 e.getDistanceFromDragStartY() / std::max(1.0f, previewTransform_.scale));

    pendingDragEvent_.valid = true;
    pendingDragEvent_.stableId = pressedNodeStableId_;
    pendingDragEvent_.localPosition = localPosition;
    pendingDragEvent_.dragDelta = dragDelta;
    pendingDragEvent_.mods = e.mods;

    const double nowMs = juce::Time::getMillisecondCounterHiRes();
    if (nowMs - lastContinuousInputDispatchMs_ >= (1000.0 / 60.0)) {
        flushPendingDrag();
    }
}

void ImGuiDirectHost::mouseUp(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    if (leftMouseDown_) {
        leftMouseDown_ = false;
        queueMouseButton(0, false);
    }
    if (rightMouseDown_) {
        rightMouseDown_ = false;
        queueMouseButton(1, false);
    }
    if (middleMouseDown_) {
        middleMouseDown_ = false;
        queueMouseButton(2, false);
    }

    if (wantCaptureMouse_.load(std::memory_order_relaxed)) {
        flushPendingDrag();
        renderNow();
        lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
        return;
    }

    flushPendingDrag();
    auto hit = hitTestLiveTree(e.position, manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Pointer);
    const uint64_t pressedStableId = pressedNodeStableId_;
    pressedNodeStableId_ = 0;

    if (pressedStableId == 0 || liveRoot_ == nullptr) {
        return;
    }

    auto* pressedNode = findLiveNodeByStableId(pressedStableId);
    if (pressedNode == nullptr) {
        return;
    }

    auto scenePosition = scenePositionFromLocal(e.position);
    auto localPosition = direct_host_render_support::localPositionForNode(pressedNode, scenePosition);
    const bool triggerDoubleClick = hit.node != nullptr && hit.stableId == pressedStableId && e.getNumberOfClicks() >= 2;
    const bool triggerClick = hit.node != nullptr && hit.stableId == pressedStableId && !triggerDoubleClick && !e.mouseWasDraggedSinceMouseDown();
    invokeLiveMouseUp(*pressedNode, localPosition, triggerClick, triggerDoubleClick, e.mods);
    renderNow();
}

void ImGuiDirectHost::mouseMove(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    if (wantCaptureMouse_.load(std::memory_order_relaxed)) {
        const double nowMs = juce::Time::getMillisecondCounterHiRes();
        if (nowMs - lastContinuousInputDispatchMs_ >= (1000.0 / 60.0)) {
            renderNow();
            lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
        }
        return;
    }
    updateHover(e.position, &e.mods);
}

void ImGuiDirectHost::mouseExit(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);
    queueMousePosition(juce::Point<float>(-1.0f, -1.0f));
    const uint64_t previousHoveredStableId = hoveredNodeStableId_;
    hoveredNodeStableId_ = 0;
    if (previousHoveredStableId != 0) {
        invokeLiveMouseExit(previousHoveredStableId);
        renderNow();
    }
}

void ImGuiDirectHost::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) {
    queueMousePosition(e.position);
    queueMouseWheel(wheel.deltaX, wheel.deltaY);
    if (wantCaptureMouse_.load(std::memory_order_relaxed)) {
        renderNow();
        lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
        return;
    }

    updateHover(e.position, &e.mods);
    auto hit = hitTestLiveTree(e.position, manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Wheel);
    if (hit.node == nullptr || hit.stableId == 0) {
        return;
    }

    if (auto* node = findLiveNodeByStableId(hit.stableId)) {
        invokeLiveMouseWheel(*node, hit.scenePosition, wheel.deltaY, e.mods);
        renderNow();
    }
}

bool ImGuiDirectHost::keyPressed(const juce::KeyPress& key) {
    if (globalKeyHandler_ && globalKeyHandler_(key)) {
        renderNow();
        return true;
    }

    auto* node = findLiveNodeByStableId(focusedNodeStableId_);
    if (node == nullptr) {
        return juce::Component::keyPressed(key);
    }

    node->setFocused(true);
    auto& callbacks = node->getCallbacks();
    if (!callbacks.onKeyPress.valid()) {
        return juce::Component::keyPressed(key);
    }

    sol::protected_function fn = callbacks.onKeyPress;
    auto mods = key.getModifiers();
    auto result = fn(key.getKeyCode(),
                     static_cast<int>(key.getTextCharacter()),
                     mods.isShiftDown(),
                     direct_host_render_support::isCtrlLikeDown(mods),
                     mods.isAltDown());
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "[ImGuiDirectHost] onKeyPress error for %s: %s\n",
                     node->getNodeId().c_str(),
                     err.what());
        return false;
    }

    renderNow();
    if (result.get_type() == sol::type::boolean) {
        return result.get<bool>();
    }
    return true;
}

void ImGuiDirectHost::newOpenGLContextCreated() {
    initialiseImGuiBackendIfNeeded();
}

void ImGuiDirectHost::renderOpenGL() {
}

void ImGuiDirectHost::openGLContextClosing() {
    wantCaptureMouse_.store(false, std::memory_order_relaxed);
    wantCaptureKeyboard_.store(false, std::memory_order_relaxed);
    lastVertexCount_.store(0, std::memory_order_relaxed);
    lastIndexCount_.store(0, std::memory_order_relaxed);
    deferredSurfaceRequests_.clear();
    deferredSurfaceOrder_.clear();
    cachedSurfaceTextures_.clear();

    for (auto& provider : surfaceProviders_) {
        if (provider) {
            provider->releaseAll();
        }
    }
    recalculateOwnedGpuBytes();
    shutdownImGuiBackend();
}

void ImGuiDirectHost::attachContextIfNeeded() {
    if (!isShowing()) {
        return;
    }

    if (!openGLContext_.isAttached()) {
        openGLContext_.attachTo(*this);
    }
}

void ImGuiDirectHost::updateHover(juce::Point<float> position, const juce::ModifierKeys* mods) {
    auto hit = hitTestLiveTree(position, manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Pointer);
    const uint64_t nextHoveredStableId = hit.node != nullptr ? hit.stableId : 0;
    const uint64_t previousHoveredStableId = hoveredNodeStableId_;
    hoveredNodeStableId_ = nextHoveredStableId;

    if (previousHoveredStableId != nextHoveredStableId) {
        if (previousHoveredStableId != 0) {
            invokeLiveMouseExit(previousHoveredStableId);
        }
        if (nextHoveredStableId != 0) {
            invokeLiveMouseEnter(nextHoveredStableId);
        }
    }

    if (mods != nullptr && hit.node != nullptr && nextHoveredStableId != 0) {
        const auto localPosition = juce::Point<float>(hit.scenePosition.x - static_cast<float>(hit.sceneBounds.getX()),
                                                      hit.scenePosition.y - static_cast<float>(hit.sceneBounds.getY()));
        if (auto* node = findLiveNodeByStableId(nextHoveredStableId)) {
            invokeLiveMouseMove(*node, localPosition, *mods);
        }
    }
}

manifold::ui::imgui::RuntimeNodeRenderer::HitTestResult ImGuiDirectHost::hitTestLiveTree(
    juce::Point<float> position,
    manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode mode) {
    if (liveRoot_ == nullptr) {
        return {};
    }

    if ((!previewTransform_.valid || previewTransform_.scale <= 0.0f) && getWidth() > 0 && getHeight() > 0) {
        previewTransform_ = renderer_.buildPreviewTransform(*liveRoot_, getWidth(), getHeight(), direct_host_render_support::makeDirectRenderOptions());
    }

    return direct_host_render_support::hitTestLiveTreeDetailed(renderer_, liveRoot_, position, previewTransform_, mode);
}

RuntimeNode* ImGuiDirectHost::findLiveNodeByStableId(uint64_t stableId) const {
    if (liveRoot_ == nullptr || stableId == 0) {
        return nullptr;
    }
    return liveRoot_->findByStableId(stableId);
}

RuntimeNode* ImGuiDirectHost::findLiveWheelTarget(RuntimeNode* node) const {
    while (node != nullptr) {
        if (node->getCallbacks().onMouseWheel.valid()) {
            return node;
        }
        node = node->getParent();
    }
    return nullptr;
}

void ImGuiDirectHost::setLiveFocus(uint64_t stableId) {
    if (liveRoot_ == nullptr) {
        focusedNodeStableId_ = 0;
        return;
    }

    direct_host_render_support::clearFocusRecursive(*liveRoot_);
    focusedNodeStableId_ = stableId;
    if (auto* node = liveRoot_->findByStableId(stableId)) {
        node->setFocused(true);
    }
}

void ImGuiDirectHost::invokeLiveMouseDown(RuntimeNode& node,
                                          juce::Point<float> localPosition,
                                          const juce::ModifierKeys& mods) {
    node.setPressed(true);
    auto& callbacks = node.getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseDown,
                      "onMouseDown",
                      node.getNodeId(),
                      localPosition.x,
                      localPosition.y,
                      mods.isShiftDown(),
                      direct_host_render_support::isCtrlLikeDown(mods),
                      mods.isAltDown(),
                      mods.isRightButtonDown());
}

void ImGuiDirectHost::invokeLiveMouseDrag(RuntimeNode& node,
                                          juce::Point<float> localPosition,
                                          juce::Point<float> dragDelta,
                                          const juce::ModifierKeys& mods) {
    auto& callbacks = node.getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseDrag,
                      "onMouseDrag",
                      node.getNodeId(),
                      localPosition.x,
                      localPosition.y,
                      dragDelta.x,
                      dragDelta.y,
                      mods.isShiftDown(),
                      direct_host_render_support::isCtrlLikeDown(mods),
                      mods.isAltDown(),
                      mods.isRightButtonDown());
}

void ImGuiDirectHost::invokeLiveMouseUp(RuntimeNode& node,
                                        juce::Point<float> localPosition,
                                        bool triggerClick,
                                        bool triggerDoubleClick,
                                        const juce::ModifierKeys& mods) {
    node.setPressed(false);
    auto& callbacks = node.getCallbacks();
    if (triggerDoubleClick) {
        direct_host_render_support::invokeLuaCallback(callbacks.onDoubleClick, "onDoubleClick", node.getNodeId());
    } else if (triggerClick) {
        direct_host_render_support::invokeLuaCallback(callbacks.onClick, "onClick", node.getNodeId());
    }
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseUp,
                      "onMouseUp",
                      node.getNodeId(),
                      localPosition.x,
                      localPosition.y,
                      mods.isShiftDown(),
                      direct_host_render_support::isCtrlLikeDown(mods),
                      mods.isAltDown(),
                      mods.isRightButtonDown());
}

void ImGuiDirectHost::invokeLiveMouseMove(RuntimeNode& node,
                                          juce::Point<float> localPosition,
                                          const juce::ModifierKeys& mods) {
    auto& callbacks = node.getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseMove,
                      "onMouseMove",
                      node.getNodeId(),
                      localPosition.x,
                      localPosition.y,
                      mods.isShiftDown(),
                      direct_host_render_support::isCtrlLikeDown(mods),
                      mods.isAltDown());
}

void ImGuiDirectHost::invokeLiveMouseEnter(uint64_t stableId) {
    auto* node = findLiveNodeByStableId(stableId);
    if (node == nullptr) {
        return;
    }

    node->setHovered(true);
    auto& callbacks = node->getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseEnter, "onMouseEnter", node->getNodeId());
}

void ImGuiDirectHost::invokeLiveMouseExit(uint64_t stableId) {
    auto* node = findLiveNodeByStableId(stableId);
    if (node == nullptr) {
        return;
    }

    node->setHovered(false);
    node->setPressed(false);
    auto& callbacks = node->getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseExit, "onMouseExit", node->getNodeId());
}

void ImGuiDirectHost::invokeLiveMouseWheel(RuntimeNode& hitNode,
                                           juce::Point<float> scenePosition,
                                           float deltaY,
                                           const juce::ModifierKeys& mods,
                                           RuntimeNode* coordinateRoot) {
    auto* node = findLiveWheelTarget(&hitNode);
    if (node == nullptr) {
        return;
    }

    auto localPosition = direct_host_render_support::localPositionForNodeWithinRoot(coordinateRoot, node, scenePosition);
    auto& callbacks = node->getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseWheel,
                      "onMouseWheel",
                      node->getNodeId(),
                      localPosition.x,
                      localPosition.y,
                      deltaY,
                      mods.isShiftDown(),
                      direct_host_render_support::isCtrlLikeDown(mods),
                      mods.isAltDown());
}

juce::Point<float> ImGuiDirectHost::scenePositionFromLocal(juce::Point<float> local) {
    if ((!previewTransform_.valid || previewTransform_.scale <= 0.0f) && liveRoot_ != nullptr && getWidth() > 0 && getHeight() > 0) {
        previewTransform_ = renderer_.buildPreviewTransform(*liveRoot_, getWidth(), getHeight(), direct_host_render_support::makeDirectRenderOptions());
    }

    if (!previewTransform_.valid || previewTransform_.scale <= 0.0f) {
        return local;
    }

    return juce::Point<float>((local.x - previewTransform_.offsetX) / previewTransform_.scale,
                              (local.y - previewTransform_.offsetY) / previewTransform_.scale);
}

void ImGuiDirectHost::queueMousePosition(juce::Point<float> position) {
    PendingEvent event;
    event.type = EventType::MousePos;
    event.x = position.x;
    event.y = position.y;
    std::lock_guard<std::mutex> lock(inputMutex_);
    pendingEvents_.push_back(std::move(event));
}

void ImGuiDirectHost::queueMouseButton(int button, bool down) {
    PendingEvent event;
    event.type = EventType::MouseButton;
    event.button = button;
    event.down = down;
    std::lock_guard<std::mutex> lock(inputMutex_);
    pendingEvents_.push_back(std::move(event));
}

void ImGuiDirectHost::queueMouseWheel(float deltaX, float deltaY) {
    PendingEvent event;
    event.type = EventType::MouseWheel;
    event.x = deltaX;
    event.y = deltaY;
    std::lock_guard<std::mutex> lock(inputMutex_);
    pendingEvents_.push_back(std::move(event));
}

void ImGuiDirectHost::queueFocus(bool focused) {
    PendingEvent event;
    event.type = EventType::Focus;
    event.focused = focused;
    std::lock_guard<std::mutex> lock(inputMutex_);
    pendingEvents_.push_back(std::move(event));
}
