#include "ImGuiScriptListHost.h"

#include "ScriptListSupport.h"
#include "Theme.h"
#include "WidgetPrimitives.h"
#include "backends/imgui_impl_opengl3.h"
#include "imgui.h"

#include <algorithm>
#include <functional>
#include <thread>

using namespace juce::gl;

namespace {
[[maybe_unused]] size_t traceThreadId() {
    return std::hash<std::thread::id>{}(std::this_thread::get_id());
}

void logScriptListHostEvent(const char* event, ImGuiScriptListHost* host, juce::OpenGLContext* context = nullptr) {
    juce::ignoreUnused(event, host, context);
}

void logScriptListHostMouse(const char* event, ImGuiScriptListHost* host, const juce::MouseEvent& e) {
    juce::ignoreUnused(event, host, e);
}

std::string buildDisplayLabel(const ImGuiScriptListHost::ScriptRow& row) {
    return manifold::ui::imgui::buildScriptListDisplayLabel({
        row.section,
        row.nonInteractive,
        row.selected,
        row.active,
        row.dirty,
        row.kind,
        row.ownership,
        row.name,
        row.label,
        row.path,
    });
}
}

ImGuiScriptListHost::ImGuiScriptListHost() {
    setOpaque(true);
    setWantsKeyboardFocus(true);
    setMouseClickGrabsKeyboardFocus(true);

    openGLContext.setRenderer(this);
    openGLContext.setComponentPaintingEnabled(false);
#ifndef __ANDROID__
    // openGLContext.setPersistentAttachment(true); // Requires patched JUCE
#endif
    openGLContext.setContinuousRepainting(true);
    openGLContext.setSwapInterval(1);
}

ImGuiScriptListHost::~ImGuiScriptListHost() {
    openGLContext.detach();
}

void ImGuiScriptListHost::configureRows(const std::vector<ScriptRow>& rows) {
    std::lock_guard<std::mutex> lock(rowsMutex_);
    rows_ = rows;
}

ImGuiScriptListHost::ActionRequests ImGuiScriptListHost::consumeActionRequests() {
    ActionRequests requests;
    requests.selectIndex = requestSelectIndex_.exchange(-1, std::memory_order_relaxed);
    requests.openIndex = requestOpenIndex_.exchange(-1, std::memory_order_relaxed);
    return requests;
}

void ImGuiScriptListHost::paint(juce::Graphics& g) {
    juce::ignoreUnused(g);
}

void ImGuiScriptListHost::resized() {
    logScriptListHostEvent("resized", this, &openGLContext);
    releaseAllMouseButtons();
    queueCurrentMousePosition();
    attachContextIfNeeded();
}

void ImGuiScriptListHost::visibilityChanged() {
    logScriptListHostEvent("visibilityChanged", this, &openGLContext);
    if (!isVisible()) {
        releaseAllMouseButtons();
        queueFocus(false);
    }
    attachContextIfNeeded();
}

void ImGuiScriptListHost::setVisible(bool shouldBeVisible) {
    Component::setVisible(shouldBeVisible);
    if (shouldBeVisible) {
        attachContextIfNeeded();
    }
}

void ImGuiScriptListHost::mouseMove(const juce::MouseEvent& e) {
    logScriptListHostMouse("mouseMove", this, e);
    queueMousePosition(e.position);
}

void ImGuiScriptListHost::mouseDrag(const juce::MouseEvent& e) {
    logScriptListHostMouse("mouseDrag", this, e);
    queueMousePosition(e.position);
}

void ImGuiScriptListHost::mouseDown(const juce::MouseEvent& e) {
    logScriptListHostMouse("mouseDown", this, e);
    grabKeyboardFocus();
    queueMousePosition(e.position);
}

void ImGuiScriptListHost::mouseUp(const juce::MouseEvent& e) {
    logScriptListHostMouse("mouseUp", this, e);
    queueMousePosition(e.position);
}

void ImGuiScriptListHost::mouseExit(const juce::MouseEvent& e) {
    logScriptListHostMouse("mouseExit", this, e);

    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueHierarchyHostMouseExitIfIdle(pendingEvents, mouseButtons_);
}

void ImGuiScriptListHost::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) {
    queueMousePosition(e.position);

    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueHierarchyHostMouseWheel(pendingEvents, wheel);
}

void ImGuiScriptListHost::focusGained(FocusChangeType cause) {
    juce::ignoreUnused(cause);
    queueFocus(true);
}

void ImGuiScriptListHost::focusLost(FocusChangeType cause) {
    juce::ignoreUnused(cause);
    queueFocus(false);
    releaseAllMouseButtons();
}

void ImGuiScriptListHost::newOpenGLContextCreated() {
    logScriptListHostEvent("newOpenGLContextCreated", this, &openGLContext);
    IMGUI_CHECKVERSION();
    auto* context = ImGui::CreateContext();
    imguiContext = context;
    ImGui::SetCurrentContext(context);

    auto& io = ImGui::GetIO();
    io.BackendPlatformName = "manifold_juce_scripts";

    manifold::ui::imgui::applyToolTheme();

    ImGui_ImplOpenGL3_Init("#version 150");
    queueFocus(hasKeyboardFocus(true));
}

void ImGuiScriptListHost::renderOpenGL() {
    if (getWidth() <= 0 || getHeight() <= 0 || !isShowing()) {
        return;
    }

    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext);
    if (context == nullptr) {
        return;
    }

    ImGui::SetCurrentContext(context);

    auto& io = ImGui::GetIO();
    const auto rawScale = static_cast<float>(openGLContext.getRenderingScale());
    const auto width = std::max(1, getWidth());
    const auto height = std::max(1, getHeight());
    
    // Cap framebuffer resolution to prevent GPU overload on high-DPI displays
    constexpr int maxFramebufferDim = 1920;
    const auto rawFramebufferWidth = juce::roundToInt(rawScale * static_cast<float>(width));
    const auto rawFramebufferHeight = juce::roundToInt(rawScale * static_cast<float>(height));
    const auto maxDim = std::max(rawFramebufferWidth, rawFramebufferHeight);
    const auto effectiveScale = (maxDim > maxFramebufferDim)
        ? rawScale * static_cast<float>(maxFramebufferDim) / static_cast<float>(maxDim)
        : rawScale;
    
    const auto framebufferWidth = std::max(1, juce::roundToInt(effectiveScale * static_cast<float>(width)));
    const auto framebufferHeight = std::max(1, juce::roundToInt(effectiveScale * static_cast<float>(height)));

    io.DisplaySize = ImVec2(static_cast<float>(width), static_cast<float>(height));
    io.DisplayFramebufferScale = ImVec2(effectiveScale, effectiveScale);

    {
        std::lock_guard<std::mutex> lock(inputMutex);
        for (const auto& event : pendingEvents) {
            switch (event.type) {
                case manifold::ui::imgui::HierarchyHostInputEventType::MousePos:
                    io.AddMousePosEvent(event.x, event.y);
                    break;
                case manifold::ui::imgui::HierarchyHostInputEventType::MouseButton:
                    io.AddMouseButtonEvent(event.button, event.down);
                    break;
                case manifold::ui::imgui::HierarchyHostInputEventType::MouseWheel:
                    io.AddMouseWheelEvent(event.x, event.y);
                    break;
                case manifold::ui::imgui::HierarchyHostInputEventType::Focus:
                    io.AddFocusEvent(event.focused);
                    break;
            }
        }
        pendingEvents.clear();
    }

    syncMouseButtons(juce::ModifierKeys::getCurrentModifiersRealtime());

    {
        std::lock_guard<std::mutex> lock(inputMutex);
        for (const auto& event : pendingEvents) {
            if (event.type == manifold::ui::imgui::HierarchyHostInputEventType::MouseButton) {
                io.AddMouseButtonEvent(event.button, event.down);
            }
        }
        pendingEvents.clear();
    }

    const auto& theme = manifold::ui::imgui::toolTheme();

    glViewport(0, 0, framebufferWidth, framebufferHeight);
    glDisable(GL_SCISSOR_TEST);
    glClearColor(theme.panelBg.x, theme.panelBg.y, theme.panelBg.z, theme.panelBg.w);
    glClear(GL_COLOR_BUFFER_BIT);

    ImGui_ImplOpenGL3_NewFrame();
    ImGui::NewFrame();

    manifold::ui::imgui::beginFullWindow("##ManifoldScriptListHost", width, height);

    std::vector<ScriptRow> rows;
    {
        std::lock_guard<std::mutex> lock(rowsMutex_);
        rows = rows_;
    }

    if (rows.empty()) {
        manifold::ui::imgui::drawEmptyState("Scripts", "No scripts");
    } else {
        ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(0.0f, 0.0f));

        ImGuiListClipper clipper;
        clipper.Begin(static_cast<int>(rows.size()));
        while (clipper.Step()) {
            for (int i = clipper.DisplayStart; i < clipper.DisplayEnd; ++i) {
                const auto& row = rows[static_cast<size_t>(i)];
                const auto label = buildDisplayLabel(row);
                ImGui::PushID(i);

                if (row.section) {
                    manifold::ui::imgui::drawSectionHeader(label.c_str());
                    ImGui::PopID();
                    continue;
                }

                if (row.nonInteractive) {
                    manifold::ui::imgui::drawTextRow({ label.c_str(), nullptr, false, true, 0.0f });
                    ImGui::PopID();
                    continue;
                }

                const bool activated = manifold::ui::imgui::drawSelectableRow(
                    { label.c_str(), row.kind.empty() ? nullptr : row.kind.c_str(), row.selected, false, 0.0f });
                const bool hovered = ImGui::IsItemHovered();
                const bool doubleClicked = hovered && ImGui::IsMouseDoubleClicked(ImGuiMouseButton_Left);

                const auto interaction = manifold::ui::imgui::resolveScriptListInteraction(activated, doubleClicked);
                if (interaction.requestSelect) {
                    requestSelectIndex_.store(i + 1, std::memory_order_relaxed);
                }
                if (interaction.requestOpen) {
                    requestOpenIndex_.store(i + 1, std::memory_order_relaxed);
                }

                ImGui::PopID();
            }
        }

        ImGui::PopStyleVar();
    }

    ImGui::End();

    ImGui::Render();
    ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());
}

void ImGuiScriptListHost::openGLContextClosing() {
    logScriptListHostEvent("openGLContextClosing", this, &openGLContext);
    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext);
    if (context != nullptr) {
        ImGui::SetCurrentContext(context);
        ImGui_ImplOpenGL3_Shutdown();
        ImGui::DestroyContext(context);
        imguiContext = nullptr;
    }
}

void ImGuiScriptListHost::attachContextIfNeeded() {
    if (!isShowing()) {
        return;
    }

    if (!openGLContext.isAttached()) {
        logScriptListHostEvent("attachContext", this, &openGLContext);
        openGLContext.attachTo(*this);
    }
}

void ImGuiScriptListHost::queueMousePosition(juce::Point<float> position) {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueHierarchyHostMousePosition(pendingEvents, position);
}

void ImGuiScriptListHost::queueCurrentMousePosition() {
    if (!isShowing()) {
        return;
    }

    const auto screenPos = juce::Desktop::getInstance().getMainMouseSource().getScreenPosition();
    const juce::Point<int> screenPosInt(juce::roundToInt(screenPos.x), juce::roundToInt(screenPos.y));
    const auto localPos = getLocalPoint(nullptr, screenPosInt).toFloat();
    queueMousePosition(localPos);
}

void ImGuiScriptListHost::syncMouseButtons(const juce::ModifierKeys& mods) {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::syncHierarchyHostMouseButtons(pendingEvents, mouseButtons_, mods);
}

void ImGuiScriptListHost::releaseAllMouseButtons() {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::releaseHierarchyHostMouseButtons(pendingEvents, mouseButtons_);
}

void ImGuiScriptListHost::queueFocus(bool focused) {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueHierarchyHostFocus(pendingEvents, focused);
}
