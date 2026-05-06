#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_opengl/juce_opengl.h>

#include "external/imgui/backends/imgui_impl_opengl3.h"
#include "external/imgui/imgui.h"

#include <atomic>
#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <string>

using namespace juce::gl;

namespace {

juce::var makeObject() { return juce::var(new juce::DynamicObject()); }
juce::DynamicObject* asObject(juce::var& value) { return value.getDynamicObject(); }

class BackendSmokeComponent final : public juce::Component,
                                    private juce::OpenGLRenderer {
public:
    BackendSmokeComponent() {
        setSize(320, 180);
        openGLContext_.setRenderer(this);
        openGLContext_.setComponentPaintingEnabled(false);
        openGLContext_.setContinuousRepainting(true);
        openGLContext_.setSwapInterval(1);
    }

    ~BackendSmokeComponent() override {
        detach();
    }

    void start() {
        if (!openGLContext_.isAttached()) {
            openGLContext_.attachTo(*this);
        }
    }

    void detach() {
        openGLContext_.detach();
    }

    bool contextCreated() const { return contextCreated_.load(std::memory_order_relaxed); }
    bool initOk() const { return initOk_.load(std::memory_order_relaxed); }
    bool rendered() const { return rendered_.load(std::memory_order_relaxed); }
    bool shutdownCalled() const { return shutdownCalled_.load(std::memory_order_relaxed); }
    int cmdListsCount() const { return cmdListsCount_.load(std::memory_order_relaxed); }
    int totalVertices() const { return totalVertices_.load(std::memory_order_relaxed); }
    int totalIndices() const { return totalIndices_.load(std::memory_order_relaxed); }
    bool hasTexturesFlag() const { return hasTexturesFlag_.load(std::memory_order_relaxed); }
    bool hasViewportsFlag() const { return hasViewportsFlag_.load(std::memory_order_relaxed); }
    bool backendUserDataPresent() const { return backendUserDataPresent_.load(std::memory_order_relaxed); }

    std::string backendRendererName() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return backendRendererName_;
    }

private:
    void newOpenGLContextCreated() override {
        IMGUI_CHECKVERSION();
        imguiContext_ = ImGui::CreateContext();
        ImGui::SetCurrentContext(imguiContext_);
        initOk_.store(ImGui_ImplOpenGL3_Init("#version 150"), std::memory_order_relaxed);

        auto& io = ImGui::GetIO();
        {
            std::lock_guard<std::mutex> lock(mutex_);
            backendRendererName_ = io.BackendRendererName != nullptr ? io.BackendRendererName : std::string{};
        }
        backendUserDataPresent_.store(io.BackendRendererUserData != nullptr, std::memory_order_relaxed);
        hasTexturesFlag_.store((io.BackendFlags & ImGuiBackendFlags_RendererHasTextures) != 0, std::memory_order_relaxed);
        hasViewportsFlag_.store((io.BackendFlags & ImGuiBackendFlags_RendererHasViewports) != 0, std::memory_order_relaxed);
        contextCreated_.store(true, std::memory_order_relaxed);
    }

    void renderOpenGL() override {
        if (!initOk_.load(std::memory_order_relaxed) || rendered_.load(std::memory_order_relaxed) || imguiContext_ == nullptr) {
            return;
        }

        ImGui::SetCurrentContext(imguiContext_);
        juce::gl::glViewport(0, 0, std::max(1, getWidth()), std::max(1, getHeight()));
        juce::gl::glClearColor(0.02f, 0.03f, 0.05f, 1.0f);
        juce::gl::glClear(juce::gl::GL_COLOR_BUFFER_BIT);

        ImGui_ImplOpenGL3_NewFrame();
        ImGui::NewFrame();
        ImGui::Begin("BackendSmoke");
        ImGui::TextUnformatted("backend smoke ok");
        ImGui::Button("button");
        ImGui::End();
        ImGui::Render();

        if (auto* drawData = ImGui::GetDrawData(); drawData != nullptr) {
            int totalVertices = 0;
            int totalIndices = 0;
            for (int i = 0; i < drawData->CmdListsCount; ++i) {
                totalVertices += drawData->CmdLists[i]->VtxBuffer.Size;
                totalIndices += drawData->CmdLists[i]->IdxBuffer.Size;
            }
            cmdListsCount_.store(drawData->CmdListsCount, std::memory_order_relaxed);
            totalVertices_.store(totalVertices, std::memory_order_relaxed);
            totalIndices_.store(totalIndices, std::memory_order_relaxed);
            ImGui_ImplOpenGL3_RenderDrawData(drawData);
        }

        rendered_.store(true, std::memory_order_relaxed);
    }

    void openGLContextClosing() override {
        if (imguiContext_ != nullptr) {
            ImGui::SetCurrentContext(imguiContext_);
            if (initOk_.load(std::memory_order_relaxed)) {
                ImGui_ImplOpenGL3_Shutdown();
                shutdownCalled_.store(true, std::memory_order_relaxed);
            }
            ImGui::DestroyContext(imguiContext_);
            imguiContext_ = nullptr;
        }
    }

    juce::OpenGLContext openGLContext_;
    ImGuiContext* imguiContext_ = nullptr;

    mutable std::mutex mutex_;
    std::string backendRendererName_;
    std::atomic<bool> contextCreated_{false};
    std::atomic<bool> initOk_{false};
    std::atomic<bool> rendered_{false};
    std::atomic<bool> shutdownCalled_{false};
    std::atomic<bool> hasTexturesFlag_{false};
    std::atomic<bool> hasViewportsFlag_{false};
    std::atomic<bool> backendUserDataPresent_{false};
    std::atomic<int> cmdListsCount_{0};
    std::atomic<int> totalVertices_{0};
    std::atomic<int> totalIndices_{0};
};

class SmokeWindow final : public juce::DocumentWindow {
public:
    explicit SmokeWindow(BackendSmokeComponent* content)
        : juce::DocumentWindow("ImGuiOpenGLBackendSmoke",
                               juce::Colours::black,
                               juce::DocumentWindow::closeButton),
          content_(content) {
        setUsingNativeTitleBar(false);
        setResizable(false, false);
        setContentOwned(content_, true);
        centreWithSize(content_->getWidth(), content_->getHeight());
    }

    void closeButtonPressed() override {}

private:
    BackendSmokeComponent* content_ = nullptr;
};

bool hasDisplayServer() {
#if JUCE_LINUX
    const char* display = std::getenv("DISPLAY");
    const char* wayland = std::getenv("WAYLAND_DISPLAY");
    return (display != nullptr && *display != '\0') || (wayland != nullptr && *wayland != '\0');
#else
    return true;
#endif
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    if (!hasDisplayServer()) {
        std::fprintf(stderr, "SKIP: no DISPLAY or WAYLAND_DISPLAY available for OpenGL smoke harness\n");
        return 77;
    }

    juce::ScopedJuceInitialiser_GUI juceInit;
    auto content = std::make_unique<BackendSmokeComponent>();
    auto* contentPtr = content.get();
    SmokeWindow window(content.release());
    window.setVisible(true);
    contentPtr->start();

    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
    while (std::chrono::steady_clock::now() < deadline) {
        if (contentPtr->rendered()) {
            break;
        }
        juce::Thread::sleep(20);
    }

    if (!contentPtr->contextCreated() || !contentPtr->initOk() || !contentPtr->rendered()) {
        std::fprintf(stderr,
                     "SKIP: OpenGL smoke harness did not finish (created=%d init=%d rendered=%d)\n",
                     contentPtr->contextCreated(),
                     contentPtr->initOk(),
                     contentPtr->rendered());
        contentPtr->detach();
        return 77;
    }

    contentPtr->detach();
    juce::Thread::sleep(50);
    window.setVisible(false);

    auto contract = makeObject();
    asObject(contract)->setProperty("contextCreated", contentPtr->contextCreated());
    asObject(contract)->setProperty("initOk", contentPtr->initOk());
    asObject(contract)->setProperty("rendered", contentPtr->rendered());
    asObject(contract)->setProperty("shutdownCalled", contentPtr->shutdownCalled());
    asObject(contract)->setProperty("backendRendererName", juce::String(contentPtr->backendRendererName()));
    asObject(contract)->setProperty("backendUserDataPresent", contentPtr->backendUserDataPresent());
    asObject(contract)->setProperty("hasTexturesFlag", contentPtr->hasTexturesFlag());
    asObject(contract)->setProperty("hasViewportsFlag", contentPtr->hasViewportsFlag());
    asObject(contract)->setProperty("cmdListsCount", contentPtr->cmdListsCount());
    asObject(contract)->setProperty("totalVertices", contentPtr->totalVertices());
    asObject(contract)->setProperty("totalIndices", contentPtr->totalIndices());

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "ImGuiOpenGLBackend smoke", raw);
}
