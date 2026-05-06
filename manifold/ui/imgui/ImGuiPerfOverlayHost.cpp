#include "ImGuiPerfOverlayHost.h"

#include "PerfOverlaySupport.h"
#include "Theme.h"
#include "backends/imgui_impl_opengl3.h"
#include "imgui.h"

#include <algorithm>
#include <cmath>

using namespace juce::gl;

namespace {

ImVec2 toImVec2(juce::Point<int> p) {
    return ImVec2(static_cast<float>(p.x), static_cast<float>(p.y));
}

[[maybe_unused]] ImVec2 toImVec2(const juce::Rectangle<int>& r) {
    return ImVec2(static_cast<float>(r.getX()), static_cast<float>(r.getY()));
}

ImVec2 toImVec2BottomRight(const juce::Rectangle<int>& r) {
    return ImVec2(static_cast<float>(r.getRight()), static_cast<float>(r.getBottom()));
}
}

ImGuiPerfOverlayHost::ImGuiPerfOverlayHost() {
    setOpaque(false);
    setWantsKeyboardFocus(true);
    setMouseClickGrabsKeyboardFocus(true);
    setInterceptsMouseClicks(true, true);

    openGLContext.setRenderer(this);
    openGLContext.setComponentPaintingEnabled(false);
#ifndef __ANDROID__
    // openGLContext.setPersistentAttachment(true); // Requires patched JUCE
#endif
    openGLContext.setContinuousRepainting(true);
    openGLContext.setSwapInterval(1);
}

ImGuiPerfOverlayHost::~ImGuiPerfOverlayHost() {
    openGLContext.detach();
}

void ImGuiPerfOverlayHost::configureSnapshot(const Snapshot& snapshot) {
    {
        std::lock_guard<std::mutex> lock(dataMutex_);
        snapshot_ = snapshot;
        if (snapshot_.activeTab.empty() && !snapshot_.tabs.empty()) {
            snapshot_.activeTab = snapshot_.tabs.front().id;
        }
    }
    repaint();
}

ImGuiPerfOverlayHost::Snapshot ImGuiPerfOverlayHost::currentSnapshot() const {
    std::lock_guard<std::mutex> lock(dataMutex_);
    return snapshot_;
}

void ImGuiPerfOverlayHost::setActiveTabLocally(const std::string& tabId) {
    {
        std::lock_guard<std::mutex> lock(dataMutex_);
        snapshot_.activeTab = tabId;
    }
    scrollRows_.store(0, std::memory_order_relaxed);
    repaint();
}

void ImGuiPerfOverlayHost::requestClose() {
    if (onClosed) {
        onClosed();
    }
}

void ImGuiPerfOverlayHost::notifyBoundsChanged() {
    if (onBoundsChanged) {
        onBoundsChanged(getBounds());
    }
}

juce::Rectangle<int> ImGuiPerfOverlayHost::titleBarBounds() const {
    return manifold::ui::imgui::perfOverlayTitleBarBounds(getLocalBounds());
}

juce::Rectangle<int> ImGuiPerfOverlayHost::closeButtonBounds() const {
    return manifold::ui::imgui::perfOverlayCloseButtonBounds(getLocalBounds());
}

juce::Rectangle<int> ImGuiPerfOverlayHost::tabBoundsForIndex(int index) const {
    return manifold::ui::imgui::perfOverlayTabBoundsForIndex(getLocalBounds(), index);
}

juce::Rectangle<int> ImGuiPerfOverlayHost::contentBounds() const {
    return manifold::ui::imgui::perfOverlayContentBounds(getLocalBounds());
}

void ImGuiPerfOverlayHost::paint(juce::Graphics& g) {
    juce::ignoreUnused(g);
}

void ImGuiPerfOverlayHost::resized() {
    attachContextIfNeeded();
    repaint();
}

void ImGuiPerfOverlayHost::visibilityChanged() {
    draggingTitle_ = false;
    attachContextIfNeeded();
    repaint();
}

void ImGuiPerfOverlayHost::setVisible(bool shouldBeVisible) {
    Component::setVisible(shouldBeVisible);
    if (shouldBeVisible) {
        attachContextIfNeeded();
    }
}

void ImGuiPerfOverlayHost::mouseMove(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);
}

void ImGuiPerfOverlayHost::mouseDrag(const juce::MouseEvent& e) {
    if (!draggingTitle_) {
        return;
    }

    auto* parent = getParentComponent();
    if (parent == nullptr) {
        return;
    }

    const auto delta = e.getScreenPosition() - dragStartScreen_;
    const auto parentBounds = parent->getLocalBounds();
    auto next = manifold::ui::imgui::clampPerfOverlayDraggedBounds(dragStartBounds_, parentBounds, delta);
    setBounds(next);
    notifyBoundsChanged();
}

void ImGuiPerfOverlayHost::mouseDown(const juce::MouseEvent& e) {
    grabKeyboardFocus();

    if (closeButtonBounds().contains(e.getPosition())) {
        requestClose();
        return;
    }

    const auto snapshot = currentSnapshot();
    for (int i = 0; i < static_cast<int>(snapshot.tabs.size()); ++i) {
        const auto& tab = snapshot.tabs[static_cast<std::size_t>(i)];
        if (tabBoundsForIndex(i).contains(e.getPosition())) {
            setActiveTabLocally(tab.id);
            if (onTabChanged) {
                onTabChanged(tab.id);
            }
            return;
        }
    }

    if (titleBarBounds().contains(e.getPosition())) {
        draggingTitle_ = true;
        dragStartScreen_ = e.getScreenPosition();
        dragStartBounds_ = getBounds();
    }
}

void ImGuiPerfOverlayHost::mouseUp(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);
    const bool wasDragging = draggingTitle_;
    draggingTitle_ = false;
    if (wasDragging) {
        notifyBoundsChanged();
    }
}

void ImGuiPerfOverlayHost::mouseExit(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);
}

void ImGuiPerfOverlayHost::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) {
    juce::ignoreUnused(e);
    if (std::abs(wheel.deltaY) < 0.0001f) {
        return;
    }

    const auto snapshot = currentSnapshot();
    manifold::ui::imgui::PerfOverlaySnapshotData supportSnapshot;
    supportSnapshot.activeTab = snapshot.activeTab;
    supportSnapshot.title = snapshot.title;
    supportSnapshot.tabs.reserve(snapshot.tabs.size());
    for (const auto& tab : snapshot.tabs) {
        manifold::ui::imgui::PerfOverlayTabData copy;
        copy.id = tab.id;
        copy.label = tab.label;
        copy.rows.reserve(tab.rows.size());
        for (const auto& row : tab.rows) {
            copy.rows.push_back({ row.label, row.value });
        }
        supportSnapshot.tabs.push_back(std::move(copy));
    }

    scrollRows_.store(manifold::ui::imgui::nextPerfOverlayScrollRows(
                          supportSnapshot,
                          contentBounds(),
                          scrollRows_.load(std::memory_order_relaxed),
                          wheel.deltaY),
                      std::memory_order_relaxed);
    repaint();
}

bool ImGuiPerfOverlayHost::keyPressed(const juce::KeyPress& key) {
    const auto snapshot = currentSnapshot();
    if (snapshot.tabs.empty()) {
        return false;
    }

    if (key.getKeyCode() == juce::KeyPress::escapeKey) {
        requestClose();
        return true;
    }

    manifold::ui::imgui::PerfOverlaySnapshotData supportSnapshot;
    supportSnapshot.activeTab = snapshot.activeTab;
    supportSnapshot.title = snapshot.title;
    supportSnapshot.tabs.reserve(snapshot.tabs.size());
    for (const auto& tab : snapshot.tabs) {
        manifold::ui::imgui::PerfOverlayTabData copy;
        copy.id = tab.id;
        copy.label = tab.label;
        supportSnapshot.tabs.push_back(std::move(copy));
    }

    if (key.getKeyCode() == juce::KeyPress::leftKey || key.getKeyCode() == juce::KeyPress::rightKey) {
        const int delta = key.getKeyCode() == juce::KeyPress::leftKey ? -1 : 1;
        const int nextIndex = manifold::ui::imgui::nextPerfOverlayTabIndex(supportSnapshot, delta);
        const auto& tab = snapshot.tabs[static_cast<std::size_t>(nextIndex)];
        setActiveTabLocally(tab.id);
        if (onTabChanged) {
            onTabChanged(tab.id);
        }
        return true;
    }

    return false;
}

bool ImGuiPerfOverlayHost::keyStateChanged(bool isKeyDown) {
    juce::ignoreUnused(isKeyDown);
    return false;
}

void ImGuiPerfOverlayHost::focusGained(FocusChangeType cause) {
    juce::ignoreUnused(cause);
}

void ImGuiPerfOverlayHost::focusLost(FocusChangeType cause) {
    juce::ignoreUnused(cause);
    draggingTitle_ = false;
}

void ImGuiPerfOverlayHost::newOpenGLContextCreated() {
    IMGUI_CHECKVERSION();
    auto* context = ImGui::CreateContext();
    imguiContext = context;
    ImGui::SetCurrentContext(context);

    auto& io = ImGui::GetIO();
    io.BackendPlatformName = "manifold_juce_perf_overlay";

    manifold::ui::imgui::configureToolFonts(io);
    manifold::ui::imgui::applyToolTheme();
    ImGui_ImplOpenGL3_Init("#version 150");
}

void ImGuiPerfOverlayHost::renderOpenGL() {
    if (getWidth() <= 0 || getHeight() <= 0 || !isShowing()) {
        return;
    }

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

    glViewport(0, 0, framebufferWidth, framebufferHeight);
    glDisable(GL_SCISSOR_TEST);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
    glClear(GL_COLOR_BUFFER_BIT);

    ImGui_ImplOpenGL3_NewFrame();
    ImGui::NewFrame();

    ImGui::SetNextWindowPos(ImVec2(0.0f, 0.0f), ImGuiCond_Always);
    ImGui::SetNextWindowSize(ImVec2(static_cast<float>(width), static_cast<float>(height)), ImGuiCond_Always);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(0.0f, 0.0f));
    ImGui::Begin("##ManifoldPerfOverlayHost",
                 nullptr,
                 ImGuiWindowFlags_NoDecoration
                    | ImGuiWindowFlags_NoMove
                    | ImGuiWindowFlags_NoResize
                    | ImGuiWindowFlags_NoSavedSettings
                    | ImGuiWindowFlags_NoBringToFrontOnFocus
                    | ImGuiWindowFlags_NoBackground
                    | ImGuiWindowFlags_NoInputs);

    const auto snapshot = currentSnapshot();
    const auto bounds = getLocalBounds();
    const auto title = titleBarBounds();
    const auto closeBounds = closeButtonBounds();
    const auto rowsBounds = contentBounds();
    const auto& theme = manifold::ui::imgui::toolTheme();
    auto* draw = ImGui::GetWindowDrawList();

    draw->AddRectFilled(ImVec2(0.0f, 0.0f), ImVec2(static_cast<float>(bounds.getWidth()), static_cast<float>(bounds.getHeight())), 0x00000000);
    draw->AddRectFilled(toImVec2(bounds.getTopLeft()), toImVec2BottomRight(bounds), manifold::ui::imgui::toU32(ImVec4(theme.panelBg.x, theme.panelBg.y, theme.panelBg.z, 0.88f)), manifold::ui::imgui::kPerfOverlayCornerRadius);
    draw->AddRect(toImVec2(bounds.getTopLeft()), toImVec2BottomRight(bounds), manifold::ui::imgui::toU32(ImVec4(theme.panelBorder.x, theme.panelBorder.y, theme.panelBorder.z, 0.95f)), manifold::ui::imgui::kPerfOverlayCornerRadius, 0, 1.0f);

    draw->AddRectFilled(toImVec2(title.getTopLeft()), toImVec2BottomRight(title), manifold::ui::imgui::toU32(ImVec4(theme.panelBgAlt.x, theme.panelBgAlt.y, theme.panelBgAlt.z, 0.94f)), manifold::ui::imgui::kPerfOverlayCornerRadius, ImDrawFlags_RoundCornersTop);
    draw->AddRectFilled(ImVec2(static_cast<float>(title.getX()), static_cast<float>(title.getBottom() - 8)), ImVec2(static_cast<float>(title.getRight()), static_cast<float>(title.getBottom())), manifold::ui::imgui::toU32(ImVec4(theme.panelBgAlt.x, theme.panelBgAlt.y, theme.panelBgAlt.z, 0.94f)));

    draw->AddText(ImVec2(static_cast<float>(manifold::ui::imgui::kPerfOverlayOuterPadding), static_cast<float>(title.getY() + 7)), manifold::ui::imgui::toU32(theme.text), snapshot.title.empty() ? "Performance" : snapshot.title.c_str());

    draw->AddRectFilled(toImVec2(closeBounds.getTopLeft()), toImVec2BottomRight(closeBounds), manifold::ui::imgui::toU32(ImVec4(theme.buttonBg.x, theme.buttonBg.y, theme.buttonBg.z, 0.95f)), 4.0f);
    draw->AddText(ImVec2(static_cast<float>(closeBounds.getX() + 4), static_cast<float>(closeBounds.getY() - 1)), manifold::ui::imgui::toU32(theme.text), "x");

    for (int i = 0; i < static_cast<int>(snapshot.tabs.size()); ++i) {
        const auto& tab = snapshot.tabs[static_cast<std::size_t>(i)];
        const auto tabRect = tabBoundsForIndex(i);
        const bool active = tab.id == snapshot.activeTab;
        const ImVec4 bg = active ? theme.accent : theme.buttonBg;
        const ImVec4 fg = active ? theme.selectionText : theme.textMuted;
        draw->AddRectFilled(toImVec2(tabRect.getTopLeft()), toImVec2BottomRight(tabRect), manifold::ui::imgui::toU32(bg), 6.0f);
        draw->AddText(ImVec2(static_cast<float>(tabRect.getX() + manifold::ui::imgui::kPerfOverlayTabLabelInset), static_cast<float>(tabRect.getY() + 6)), manifold::ui::imgui::toU32(fg), tab.label.c_str());
    }

    manifold::ui::imgui::PerfOverlaySnapshotData supportSnapshot;
    supportSnapshot.activeTab = snapshot.activeTab;
    supportSnapshot.title = snapshot.title;
    supportSnapshot.tabs.reserve(snapshot.tabs.size());
    for (const auto& tab : snapshot.tabs) {
        manifold::ui::imgui::PerfOverlayTabData copy;
        copy.id = tab.id;
        copy.label = tab.label;
        copy.rows.reserve(tab.rows.size());
        for (const auto& row : tab.rows) {
            copy.rows.push_back({ row.label, row.value });
        }
        supportSnapshot.tabs.push_back(std::move(copy));
    }
    const auto* activeTab = manifold::ui::imgui::resolvePerfOverlayActiveTab(supportSnapshot);

    if (activeTab != nullptr && rowsBounds.getWidth() > 0 && rowsBounds.getHeight() > 0) {
        draw->AddRectFilled(toImVec2(rowsBounds.getTopLeft()), toImVec2BottomRight(rowsBounds), manifold::ui::imgui::toU32(ImVec4(theme.panelBgAlt.x, theme.panelBgAlt.y, theme.panelBgAlt.z, 0.55f)), 6.0f);

        const int scrollRows = manifold::ui::imgui::clampPerfOverlayScrollRows(activeTab, rowsBounds, scrollRows_.load(std::memory_order_relaxed));
        scrollRows_.store(scrollRows, std::memory_order_relaxed);

        const int labelWidth = std::max(120, static_cast<int>(rowsBounds.getWidth() * 0.56f));
        const int valueX = rowsBounds.getX() + labelWidth;
        int rowY = rowsBounds.getY() + manifold::ui::imgui::kPerfOverlayInnerPadding;

        draw->PushClipRect(
            ImVec2(static_cast<float>(rowsBounds.getX()), static_cast<float>(rowsBounds.getY())),
            ImVec2(static_cast<float>(rowsBounds.getRight()), static_cast<float>(rowsBounds.getBottom())),
            true);

        for (int rowIndex = scrollRows; rowIndex < static_cast<int>(activeTab->rows.size()) && rowY + manifold::ui::imgui::kPerfOverlayRowHeight <= rowsBounds.getBottom() - manifold::ui::imgui::kPerfOverlayInnerPadding; ++rowIndex) {
            const auto& row = activeTab->rows[static_cast<std::size_t>(rowIndex)];
            const auto rowRect = juce::Rectangle<int>(rowsBounds.getX() + manifold::ui::imgui::kPerfOverlayInnerPadding,
                                                      rowY,
                                                      rowsBounds.getWidth() - manifold::ui::imgui::kPerfOverlayInnerPadding * 2,
                                                      manifold::ui::imgui::kPerfOverlayRowHeight);
            if (((rowIndex - scrollRows) & 1) == 0) {
                draw->AddRectFilled(toImVec2(rowRect.getTopLeft()), toImVec2BottomRight(rowRect), manifold::ui::imgui::toU32(ImVec4(theme.panelBg.x, theme.panelBg.y, theme.panelBg.z, 0.24f)), 4.0f);
            }

            draw->AddText(ImVec2(static_cast<float>(rowRect.getX() + 8), static_cast<float>(rowRect.getY() + 4)), manifold::ui::imgui::toU32(theme.textMuted), row.label.c_str());

            const ImVec2 valueSize = ImGui::CalcTextSize(row.value.c_str());
            const float valuePosX = static_cast<float>(manifold::ui::imgui::perfOverlayValuePositionX(rowRect, valueX, valueSize.x));
            draw->AddText(ImVec2(valuePosX, static_cast<float>(rowRect.getY() + 4)), manifold::ui::imgui::toU32(theme.text), row.value.c_str());
            rowY += manifold::ui::imgui::kPerfOverlayRowHeight;
        }

        draw->PopClipRect();
    }

    ImGui::End();
    ImGui::PopStyleVar();

    ImGui::Render();
    ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());
}

void ImGuiPerfOverlayHost::openGLContextClosing() {
    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext);
    if (context != nullptr) {
        ImGui::SetCurrentContext(context);
        ImGui_ImplOpenGL3_Shutdown();
        ImGui::DestroyContext(context);
        imguiContext = nullptr;
    }
}

void ImGuiPerfOverlayHost::attachContextIfNeeded() {
    if (!isShowing()) {
        return;
    }

    if (!openGLContext.isAttached()) {
        openGLContext.attachTo(*this);
    }
}
