#include "ImGuiPerfOverlayHost.h"

#include <algorithm>

namespace {
constexpr int kTitleBarHeight = 30;
constexpr int kTabBarHeight = 28;
constexpr int kCloseButtonSize = 16;
constexpr int kOuterPadding = 10;
constexpr int kInnerPadding = 8;
constexpr int kRowHeight = 20;
constexpr int kTabWidth = 92;
constexpr int kTabGap = 6;
constexpr int kTabLabelInset = 10;
constexpr int kContentTopGap = 8;
constexpr int kCornerRadius = 8;
}

ImGuiPerfOverlayHost::ImGuiPerfOverlayHost() {
    setOpaque(false);
    setWantsKeyboardFocus(true);
    setMouseClickGrabsKeyboardFocus(true);
}

ImGuiPerfOverlayHost::~ImGuiPerfOverlayHost() = default;

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
    repaint();
}

void ImGuiPerfOverlayHost::requestClose() {
    if (onClosed) {
        onClosed();
    }
}

juce::Rectangle<int> ImGuiPerfOverlayHost::titleBarBounds() const {
    return getLocalBounds().withHeight(kTitleBarHeight);
}

juce::Rectangle<int> ImGuiPerfOverlayHost::closeButtonBounds() const {
    const auto title = titleBarBounds();
    return juce::Rectangle<int>(
        title.getRight() - kOuterPadding - kCloseButtonSize,
        title.getY() + (title.getHeight() - kCloseButtonSize) / 2,
        kCloseButtonSize,
        kCloseButtonSize);
}

void ImGuiPerfOverlayHost::paint(juce::Graphics& g) {
    const auto snapshot = currentSnapshot();
    const auto bounds = getLocalBounds();
    if (bounds.isEmpty()) {
        return;
    }

    tabHitRegions_.clear();

    g.setColour(juce::Colour(0xff0f172a).withAlpha(0.88f));
    g.fillRoundedRectangle(bounds.toFloat(), static_cast<float>(kCornerRadius));

    g.setColour(juce::Colour(0xff334155).withAlpha(0.95f));
    g.drawRoundedRectangle(bounds.toFloat().reduced(0.5f), static_cast<float>(kCornerRadius), 1.0f);

    const auto title = titleBarBounds();
    g.setColour(juce::Colour(0xff111827).withAlpha(0.92f));
    g.fillRoundedRectangle(title.toFloat(), static_cast<float>(kCornerRadius));
    g.fillRect(title.withTop(title.getBottom() - 8));

    g.setColour(juce::Colour(0xffe2e8f0));
    g.setFont(juce::FontOptions(15.0f).withStyle("Bold"));
    g.drawText(snapshot.title.empty() ? "Performance" : snapshot.title,
               title.withTrimmedLeft(kOuterPadding).withTrimmedRight(kOuterPadding + kCloseButtonSize + 8),
               juce::Justification::centredLeft,
               true);

    const auto closeBounds = closeButtonBounds();
    g.setColour(juce::Colour(0xff1f2937).withAlpha(0.95f));
    g.fillRoundedRectangle(closeBounds.toFloat(), 4.0f);
    g.setColour(juce::Colour(0xfff8fafc));
    g.drawFittedText("×", closeBounds, juce::Justification::centred, 1);

    auto tabBar = bounds.withTrimmedTop(title.getBottom() + kContentTopGap)
                        .withHeight(kTabBarHeight);
    int tabX = tabBar.getX() + kOuterPadding;
    for (const auto& tab : snapshot.tabs) {
        const auto tabRect = juce::Rectangle<int>(tabX, tabBar.getY(), kTabWidth, kTabBarHeight - 4);
        tabHitRegions_.push_back({tab.id, tabRect});
        const bool active = tab.id == snapshot.activeTab;
        g.setColour(active ? juce::Colour(0xff2563eb) : juce::Colour(0xff1e293b));
        g.fillRoundedRectangle(tabRect.toFloat(), 6.0f);
        g.setColour(active ? juce::Colours::white : juce::Colour(0xffcbd5e1));
        g.setFont(juce::FontOptions(13.0f).withStyle(active ? "Bold" : "Regular"));
        g.drawFittedText(tab.label,
                         tabRect.reduced(kTabLabelInset, 0),
                         juce::Justification::centredLeft,
                         1,
                         0.85f);
        tabX += kTabWidth + kTabGap;
    }

    const auto contentBounds = bounds.reduced(kOuterPadding)
        .withTrimmedTop(kTitleBarHeight + kContentTopGap + kTabBarHeight + kInnerPadding);

    const TabData* activeTab = nullptr;
    for (const auto& tab : snapshot.tabs) {
        if (tab.id == snapshot.activeTab) {
            activeTab = &tab;
            break;
        }
    }
    if (activeTab == nullptr && !snapshot.tabs.empty()) {
        activeTab = &snapshot.tabs.front();
    }
    if (activeTab == nullptr) {
        return;
    }

    g.setColour(juce::Colour(0xff1e293b).withAlpha(0.55f));
    g.fillRoundedRectangle(contentBounds.toFloat(), 6.0f);

    const int visibleRows = std::max(1, contentBounds.getHeight() / kRowHeight);
    const int maxScrollRows = std::max(0, static_cast<int>(activeTab->rows.size()) - visibleRows);
    scrollRows_ = juce::jlimit(0, maxScrollRows, scrollRows_);

    const int labelWidth = std::max(120, static_cast<int>(contentBounds.getWidth() * 0.56f));
    const int valueX = contentBounds.getX() + labelWidth;
    int rowY = contentBounds.getY() + kInnerPadding;

    g.setFont(juce::FontOptions(12.5f));
    for (int rowIndex = scrollRows_; rowIndex < static_cast<int>(activeTab->rows.size()) && rowY + kRowHeight <= contentBounds.getBottom() - kInnerPadding; ++rowIndex) {
        const auto& row = activeTab->rows[static_cast<std::size_t>(rowIndex)];
        const auto rowRect = juce::Rectangle<int>(contentBounds.getX() + kInnerPadding,
                                                  rowY,
                                                  contentBounds.getWidth() - kInnerPadding * 2,
                                                  kRowHeight);
        if (((rowIndex - scrollRows_) & 1) == 0) {
            g.setColour(juce::Colour(0xff0f172a).withAlpha(0.24f));
            g.fillRoundedRectangle(rowRect.toFloat(), 4.0f);
        }

        g.setColour(juce::Colour(0xff94a3b8));
        g.drawText(row.label,
                   juce::Rectangle<int>(rowRect.getX() + 8, rowRect.getY(), labelWidth - 8, rowRect.getHeight()),
                   juce::Justification::centredLeft,
                   true);

        g.setColour(juce::Colour(0xfff8fafc));
        g.drawText(row.value,
                   juce::Rectangle<int>(valueX, rowRect.getY(), rowRect.getRight() - valueX - 4, rowRect.getHeight()),
                   juce::Justification::centredRight,
                   true);
        rowY += kRowHeight;
    }
}

void ImGuiPerfOverlayHost::resized() {
    repaint();
}

void ImGuiPerfOverlayHost::visibilityChanged() {
    draggingTitle_ = false;
    repaint();
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
    auto next = dragStartBounds_.translated(delta.x, delta.y);
    const auto parentBounds = parent->getLocalBounds();

    next.setX(juce::jlimit(parentBounds.getX(), parentBounds.getRight() - next.getWidth(), next.getX()));
    next.setY(juce::jlimit(parentBounds.getY(), parentBounds.getBottom() - next.getHeight(), next.getY()));
    setBounds(next);
}

void ImGuiPerfOverlayHost::mouseDown(const juce::MouseEvent& e) {
    grabKeyboardFocus();

    if (closeButtonBounds().contains(e.getPosition())) {
        requestClose();
        return;
    }

    for (const auto& [tabId, tabBounds] : tabHitRegions_) {
        if (tabBounds.contains(e.getPosition())) {
            setActiveTabLocally(tabId);
            if (onTabChanged) {
                onTabChanged(tabId);
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
    draggingTitle_ = false;
}

void ImGuiPerfOverlayHost::mouseExit(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);
}

void ImGuiPerfOverlayHost::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) {
    juce::ignoreUnused(e);
    if (std::abs(wheel.deltaY) < 0.0001f) {
        return;
    }
    scrollRows_ -= wheel.deltaY > 0.0f ? 1 : -1;
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

    const int currentIndex = [&]() {
        for (int i = 0; i < static_cast<int>(snapshot.tabs.size()); ++i) {
            if (snapshot.tabs[static_cast<std::size_t>(i)].id == snapshot.activeTab) {
                return i;
            }
        }
        return 0;
    }();

    if (key.getKeyCode() == juce::KeyPress::leftKey || key.getKeyCode() == juce::KeyPress::rightKey) {
        const int delta = key.getKeyCode() == juce::KeyPress::leftKey ? -1 : 1;
        const int nextIndex = juce::jlimit(0, static_cast<int>(snapshot.tabs.size()) - 1, currentIndex + delta);
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
}

void ImGuiPerfOverlayHost::renderOpenGL() {
}

void ImGuiPerfOverlayHost::openGLContextClosing() {
}
