#include "ImGuiDirectFrameContext.h"

#include "Theme.h"
#include "backends/imgui_impl_opengl3.h"
#include "imgui.h"

using namespace juce::gl;

ImGuiDirectEglOffscreenContext::~ImGuiDirectEglOffscreenContext() {
    shutdown();
}

bool ImGuiDirectEglOffscreenContext::initialise(int newWidth, int newHeight) {
#if JUCE_LINUX
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
#else
    juce::ignoreUnused(newWidth, newHeight);
    return false;
#endif
}

void ImGuiDirectEglOffscreenContext::shutdown() {
#if JUCE_LINUX
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
#endif
    width = 0;
    height = 0;
}

bool ImGuiDirectEglOffscreenContext::makeCurrent() {
#if JUCE_LINUX
    return display != EGL_NO_DISPLAY
        && surface != EGL_NO_SURFACE
        && context != EGL_NO_CONTEXT
        && eglMakeCurrent(display, surface, surface, context);
#else
    return false;
#endif
}

void ImGuiDirectEglOffscreenContext::doneCurrent() {
#if JUCE_LINUX
    if (display != EGL_NO_DISPLAY) {
        eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    }
#endif
}

bool ImGuiDirectEglOffscreenContext::isValid() const {
#if JUCE_LINUX
    return display != EGL_NO_DISPLAY
        && surface != EGL_NO_SURFACE
        && context != EGL_NO_CONTEXT;
#else
    return false;
#endif
}

ImGuiDirectFrameContext::ImGuiDirectFrameContext() = default;

void ImGuiDirectFrameContext::configure(juce::OpenGLRenderer* renderer) {
    openGLContext_.setRenderer(renderer);
    openGLContext_.setComponentPaintingEnabled(false);
#ifndef __ANDROID__
    // openGLContext_.setPersistentAttachment(true); // Requires patched JUCE
#endif
    openGLContext_.setContinuousRepainting(false);
    openGLContext_.setSwapInterval(0);
}

bool ImGuiDirectFrameContext::ensureEglOffscreenContext(int width, int height) {
#if JUCE_LINUX
    if (!eglOffscreenContext_) {
        eglOffscreenContext_ = std::make_unique<ImGuiDirectEglOffscreenContext>();
    }
    if (eglOffscreenContext_->initialise(width, height)) {
        return true;
    }
    eglOffscreenContext_.reset();
#endif
    juce::ignoreUnused(width, height);
    return false;
}

void ImGuiDirectFrameContext::releaseEglOffscreenContext() {
    if (eglOffscreenContext_) {
        eglOffscreenContext_->shutdown();
        eglOffscreenContext_.reset();
    }
}

bool ImGuiDirectFrameContext::makeEglContextCurrent() {
#if JUCE_LINUX
    if (eglOffscreenContext_ && eglOffscreenContext_->isValid()) {
        return eglOffscreenContext_->makeCurrent();
    }
#endif
    return false;
}

void ImGuiDirectFrameContext::initialiseImGuiBackendIfNeeded(std::atomic<int64_t>& fontAtlasBytes) {
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
    fontAtlasBytes.store(0, std::memory_order_relaxed);
    manifold::ui::imgui::applyToolTheme();
#if JUCE_LINUX
    if (!openGLContext_.isAttached() && eglOffscreenContext_ && eglOffscreenContext_->isValid()) {
        juce::gl::loadFunctions();
    }
#endif
    ImGui_ImplOpenGL3_Init("#version 150");
    contextReady_ = true;
}

void ImGuiDirectFrameContext::shutdownImGuiBackend(std::atomic<int64_t>& fontAtlasBytes,
                                                   std::atomic<int64_t>& surfaceColorBytes,
                                                   std::atomic<int64_t>& surfaceDepthBytes) {
    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext_);
    if (context != nullptr) {
        ImGui::SetCurrentContext(context);
        ImGui_ImplOpenGL3_Shutdown();
        ImGui::DestroyContext(context);
        imguiContext_ = nullptr;
    }
    fontAtlasBytes.store(0, std::memory_order_relaxed);
    surfaceColorBytes.store(0, std::memory_order_relaxed);
    surfaceDepthBytes.store(0, std::memory_order_relaxed);
    contextReady_ = false;
}

void ImGuiDirectFrameContext::attachContextIfNeeded(juce::Component& component) {
    if (!component.isShowing()) {
        return;
    }

    if (!openGLContext_.isAttached()) {
        openGLContext_.attachTo(component);
    }
}
