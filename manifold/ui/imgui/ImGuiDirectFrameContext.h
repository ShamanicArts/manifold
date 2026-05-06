#pragma once

#include <atomic>
#include <cstdint>
#include <memory>

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_opengl/juce_opengl.h>

#if JUCE_LINUX
#include <EGL/egl.h>
#endif

struct ImGuiDirectEglOffscreenContext {
    ~ImGuiDirectEglOffscreenContext();

    bool initialise(int newWidth, int newHeight);
    void shutdown();
    bool makeCurrent();
    void doneCurrent();
    bool isValid() const;

#if JUCE_LINUX
    EGLDisplay display = EGL_NO_DISPLAY;
    EGLConfig config = nullptr;
    EGLContext context = EGL_NO_CONTEXT;
    EGLSurface surface = EGL_NO_SURFACE;
#else
    void* display = nullptr;
    void* config = nullptr;
    void* context = nullptr;
    void* surface = nullptr;
#endif
    int width = 0;
    int height = 0;
};

class ImGuiDirectFrameContext {
public:
    ImGuiDirectFrameContext();
    ~ImGuiDirectFrameContext() = default;

    void configure(juce::OpenGLRenderer* renderer);

    juce::OpenGLContext& openGLContext() noexcept { return openGLContext_; }
    std::unique_ptr<ImGuiDirectEglOffscreenContext>& eglOffscreenContext() noexcept { return eglOffscreenContext_; }
    void*& imguiContext() noexcept { return imguiContext_; }
    bool& contextReady() noexcept { return contextReady_; }

    bool ensureEglOffscreenContext(int width, int height);
    void releaseEglOffscreenContext();
    bool makeEglContextCurrent();
    void initialiseImGuiBackendIfNeeded(std::atomic<int64_t>& fontAtlasBytes);
    void shutdownImGuiBackend(std::atomic<int64_t>& fontAtlasBytes,
                              std::atomic<int64_t>& surfaceColorBytes,
                              std::atomic<int64_t>& surfaceDepthBytes);
    void attachContextIfNeeded(juce::Component& component);

private:
    juce::OpenGLContext openGLContext_;
    std::unique_ptr<ImGuiDirectEglOffscreenContext> eglOffscreenContext_;
    void* imguiContext_ = nullptr;
    bool contextReady_ = false;
};
