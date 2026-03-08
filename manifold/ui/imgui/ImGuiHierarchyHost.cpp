#include "ImGuiHierarchyHost.h"

#include "backends/imgui_impl_opengl3.h"
#include "imgui.h"

#include <algorithm>

using namespace juce::gl;

namespace {
std::string buildDisplayLabel(const ImGuiHierarchyHost::TreeRow& row) {
    return row.type + "  " + row.name;
}
}

ImGuiHierarchyHost::ImGuiHierarchyHost() {
    setOpaque(true);
    setWantsKeyboardFocus(true);
    setMouseClickGrabsKeyboardFocus(true);

    openGLContext.setRenderer(this);
    openGLContext.setComponentPaintingEnabled(false);
    openGLContext.setContinuousRepainting(true);
    openGLContext.setSwapInterval(1);
}

ImGuiHierarchyHost::~ImGuiHierarchyHost() {
    openGLContext.detach();
}

void ImGuiHierarchyHost::configureRows(const std::vector<TreeRow>& rows) {
    std::lock_guard<std::mutex> lock(rowsMutex_);
    rows_ = rows;
}

ImGuiHierarchyHost::ActionRequests ImGuiHierarchyHost::consumeActionRequests() {
    ActionRequests requests;
    requests.selectIndex = requestSelectIndex_.exchange(-1, std::memory_order_relaxed);
    return requests;
}

void ImGuiHierarchyHost::paint(juce::Graphics& g) {
    juce::ignoreUnused(g);
}

void ImGuiHierarchyHost::resized() {
    attachContextIfNeeded();
}

void ImGuiHierarchyHost::visibilityChanged() {
    if (!isVisible()) {
        releaseAllMouseButtons();
        queueFocus(false);
    }
    attachContextIfNeeded();
}

void ImGuiHierarchyHost::mouseMove(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
}

void ImGuiHierarchyHost::mouseDrag(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    syncMouseButtons(e.mods);
}

void ImGuiHierarchyHost::mouseDown(const juce::MouseEvent& e) {
    grabKeyboardFocus();
    queueMousePosition(e.position);
    syncMouseButtons(e.mods);
}

void ImGuiHierarchyHost::mouseUp(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    syncMouseButtons(e.mods);
    if (!e.mods.isAnyMouseButtonDown()) {
        releaseAllMouseButtons();
    }
}

void ImGuiHierarchyHost::mouseExit(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);

    if (leftMouseDown_ || rightMouseDown_ || middleMouseDown_) {
        return;
    }

    PendingEvent event;
    event.type = EventType::MousePos;
    event.x = -1.0f;
    event.y = -1.0f;

    std::lock_guard<std::mutex> lock(inputMutex);
    pendingEvents.push_back(std::move(event));
}

void ImGuiHierarchyHost::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) {
    queueMousePosition(e.position);

    PendingEvent event;
    event.type = EventType::MouseWheel;
    event.x = wheel.deltaX;
    event.y = wheel.deltaY;

    std::lock_guard<std::mutex> lock(inputMutex);
    pendingEvents.push_back(std::move(event));
}

void ImGuiHierarchyHost::focusGained(FocusChangeType cause) {
    juce::ignoreUnused(cause);
    queueFocus(true);
}

void ImGuiHierarchyHost::focusLost(FocusChangeType cause) {
    juce::ignoreUnused(cause);
    queueFocus(false);
    releaseAllMouseButtons();
}

void ImGuiHierarchyHost::newOpenGLContextCreated() {
    IMGUI_CHECKVERSION();
    auto* context = ImGui::CreateContext();
    imguiContext = context;
    ImGui::SetCurrentContext(context);

    auto& io = ImGui::GetIO();
    io.BackendPlatformName = "manifold_juce_hierarchy";

    ImGui::StyleColorsDark();
    auto& style = ImGui::GetStyle();
    style.WindowRounding = 0.0f;
    style.WindowBorderSize = 0.0f;
    style.WindowPadding = ImVec2(0.0f, 0.0f);
    style.FrameBorderSize = 0.0f;
    style.ItemSpacing = ImVec2(0.0f, 1.0f);
    style.ItemInnerSpacing = ImVec2(4.0f, 4.0f);
    style.IndentSpacing = 14.0f;

    ImGui_ImplOpenGL3_Init("#version 150");
    queueFocus(hasKeyboardFocus(true));
}

void ImGuiHierarchyHost::renderOpenGL() {
    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext);
    if (context == nullptr) {
        return;
    }

    ImGui::SetCurrentContext(context);

    auto& io = ImGui::GetIO();
    const auto scale = static_cast<float>(openGLContext.getRenderingScale());
    const auto width = std::max(1, getWidth());
    const auto height = std::max(1, getHeight());
    const auto framebufferWidth = std::max(1, juce::roundToInt(scale * static_cast<float>(width)));
    const auto framebufferHeight = std::max(1, juce::roundToInt(scale * static_cast<float>(height)));

    io.DisplaySize = ImVec2(static_cast<float>(width), static_cast<float>(height));
    io.DisplayFramebufferScale = ImVec2(scale, scale);

    syncMouseButtons(juce::ModifierKeys::getCurrentModifiersRealtime());

    {
        std::lock_guard<std::mutex> lock(inputMutex);
        for (const auto& event : pendingEvents) {
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
        pendingEvents.clear();
    }

    glViewport(0, 0, framebufferWidth, framebufferHeight);
    glDisable(GL_SCISSOR_TEST);
    glClearColor(0.06f, 0.09f, 0.13f, 0.98f);
    glClear(GL_COLOR_BUFFER_BIT);

    ImGui_ImplOpenGL3_NewFrame();
    ImGui::NewFrame();

    ImGui::SetNextWindowPos(ImVec2(0.0f, 0.0f), ImGuiCond_Always);
    ImGui::SetNextWindowSize(ImVec2(static_cast<float>(width), static_cast<float>(height)), ImGuiCond_Always);

    constexpr ImGuiWindowFlags windowFlags = ImGuiWindowFlags_NoDecoration
                                           | ImGuiWindowFlags_NoMove
                                           | ImGuiWindowFlags_NoResize
                                           | ImGuiWindowFlags_NoSavedSettings
                                           | ImGuiWindowFlags_NoBringToFrontOnFocus;

    ImGui::Begin("##ManifoldHierarchyHost", nullptr, windowFlags);

    std::vector<TreeRow> rows;
    {
        std::lock_guard<std::mutex> lock(rowsMutex_);
        rows = rows_;
    }

    if (rows.empty()) {
        ImGui::Dummy(ImVec2(8.0f, 8.0f));
        ImGui::SetCursorPos(ImVec2(8.0f, 8.0f));
        ImGui::TextDisabled("No widgets");
    } else {
        ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(8.0f, 4.0f));

        ImGuiListClipper clipper;
        clipper.Begin(static_cast<int>(rows.size()));
        while (clipper.Step()) {
            for (int i = clipper.DisplayStart; i < clipper.DisplayEnd; ++i) {
                const auto& row = rows[static_cast<size_t>(i)];
                ImGui::PushID(i);
                ImGui::Indent(static_cast<float>(std::max(0, row.depth)) * 12.0f);

                if (ImGui::Selectable(buildDisplayLabel(row).c_str(), row.selected, ImGuiSelectableFlags_SpanAllColumns)) {
                    requestSelectIndex_.store(i + 1, std::memory_order_relaxed);
                }

                ImGui::Unindent(static_cast<float>(std::max(0, row.depth)) * 12.0f);
                ImGui::PopID();
            }
        }

        ImGui::PopStyleVar();
    }

    ImGui::End();

    ImGui::Render();
    ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());
}

void ImGuiHierarchyHost::openGLContextClosing() {
    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext);
    if (context != nullptr) {
        ImGui::SetCurrentContext(context);
        ImGui_ImplOpenGL3_Shutdown();
        ImGui::DestroyContext(context);
        imguiContext = nullptr;
    }
}

void ImGuiHierarchyHost::attachContextIfNeeded() {
    if (!isShowing() || getWidth() <= 0 || getHeight() <= 0) {
        return;
    }

    if (!openGLContext.isAttached()) {
        openGLContext.attachTo(*this);
    }
}

void ImGuiHierarchyHost::queueMousePosition(juce::Point<float> position) {
    PendingEvent event;
    event.type = EventType::MousePos;
    event.x = position.x;
    event.y = position.y;

    std::lock_guard<std::mutex> lock(inputMutex);
    pendingEvents.push_back(std::move(event));
}

void ImGuiHierarchyHost::syncMouseButtons(const juce::ModifierKeys& mods) {
    const bool nextLeft = mods.isLeftButtonDown();
    const bool nextRight = mods.isRightButtonDown();
    const bool nextMiddle = mods.isMiddleButtonDown();

    std::lock_guard<std::mutex> lock(inputMutex);

    const auto pushMouseButton = [&](bool& current, int button, bool nextState) {
        if (current == nextState) {
            return;
        }

        current = nextState;
        PendingEvent event;
        event.type = EventType::MouseButton;
        event.button = button;
        event.down = nextState;
        pendingEvents.push_back(std::move(event));
    };

    pushMouseButton(leftMouseDown_, 0, nextLeft);
    pushMouseButton(rightMouseDown_, 1, nextRight);
    pushMouseButton(middleMouseDown_, 2, nextMiddle);
}

void ImGuiHierarchyHost::releaseAllMouseButtons() {
    std::lock_guard<std::mutex> lock(inputMutex);

    const auto releaseButton = [&](bool& current, int button) {
        if (!current) {
            return;
        }

        current = false;
        PendingEvent event;
        event.type = EventType::MouseButton;
        event.button = button;
        event.down = false;
        pendingEvents.push_back(std::move(event));
    };

    releaseButton(leftMouseDown_, 0);
    releaseButton(rightMouseDown_, 1);
    releaseButton(middleMouseDown_, 2);
}

void ImGuiHierarchyHost::queueFocus(bool focused) {
    PendingEvent event;
    event.type = EventType::Focus;
    event.focused = focused;

    std::lock_guard<std::mutex> lock(inputMutex);
    pendingEvents.push_back(std::move(event));
}
