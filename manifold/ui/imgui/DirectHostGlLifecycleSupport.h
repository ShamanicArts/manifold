#pragma once

namespace direct_host_gl_lifecycle_support {

inline juce::Image rgbaPixelsToImage(const std::vector<std::uint8_t>& pixels, int w, int h) {
    juce::Image result(juce::Image::ARGB, w, h, false);
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
    return result;
}

} // namespace direct_host_gl_lifecycle_support

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

    juce::Image result = direct_host_gl_lifecycle_support::rgbaPixelsToImage(pixels, w, h);

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

    juce::Image result = direct_host_gl_lifecycle_support::rgbaPixelsToImage(pixels, w, h);

    if (useJuceContext) {
        juce::OpenGLContext::deactivateCurrentContext();
    } else if (eglOffscreenContext_) {
        eglOffscreenContext_->doneCurrent();
    }
    return result;
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
