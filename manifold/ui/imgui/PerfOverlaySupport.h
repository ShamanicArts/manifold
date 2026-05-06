#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <string>
#include <vector>

namespace manifold::ui::imgui {

inline constexpr int kPerfOverlayTitleBarHeight = 30;
inline constexpr int kPerfOverlayTabBarHeight = 28;
inline constexpr int kPerfOverlayCloseButtonSize = 16;
inline constexpr int kPerfOverlayOuterPadding = 10;
inline constexpr int kPerfOverlayInnerPadding = 8;
inline constexpr int kPerfOverlayRowHeight = 20;
inline constexpr int kPerfOverlayTabWidth = 92;
inline constexpr int kPerfOverlayTabGap = 6;
inline constexpr int kPerfOverlayTabLabelInset = 10;
inline constexpr int kPerfOverlayContentTopGap = 8;
inline constexpr float kPerfOverlayCornerRadius = 8.0f;

struct PerfOverlayMetricRow {
    std::string label;
    std::string value;
};

struct PerfOverlayTabData {
    std::string id;
    std::string label;
    std::vector<PerfOverlayMetricRow> rows;
};

struct PerfOverlaySnapshotData {
    std::string activeTab;
    std::string title;
    std::vector<PerfOverlayTabData> tabs;
};

inline juce::Rectangle<int> perfOverlayTitleBarBounds(const juce::Rectangle<int>& localBounds) {
    return localBounds.withHeight(kPerfOverlayTitleBarHeight);
}

inline juce::Rectangle<int> perfOverlayCloseButtonBounds(const juce::Rectangle<int>& localBounds) {
    const auto title = perfOverlayTitleBarBounds(localBounds);
    return juce::Rectangle<int>(
        title.getRight() - kPerfOverlayOuterPadding - kPerfOverlayCloseButtonSize,
        title.getY() + (title.getHeight() - kPerfOverlayCloseButtonSize) / 2,
        kPerfOverlayCloseButtonSize,
        kPerfOverlayCloseButtonSize);
}

inline juce::Rectangle<int> perfOverlayTabBoundsForIndex(const juce::Rectangle<int>& localBounds, int index) {
    const auto title = perfOverlayTitleBarBounds(localBounds);
    const int tabX = kPerfOverlayOuterPadding + index * (kPerfOverlayTabWidth + kPerfOverlayTabGap);
    const int tabY = title.getBottom() + kPerfOverlayContentTopGap;
    return juce::Rectangle<int>(tabX, tabY, kPerfOverlayTabWidth, kPerfOverlayTabBarHeight - 4);
}

inline juce::Rectangle<int> perfOverlayContentBounds(const juce::Rectangle<int>& localBounds) {
    return localBounds.reduced(kPerfOverlayOuterPadding)
        .withTrimmedTop(kPerfOverlayTitleBarHeight + kPerfOverlayContentTopGap + kPerfOverlayTabBarHeight + kPerfOverlayInnerPadding);
}

inline const PerfOverlayTabData* resolvePerfOverlayActiveTab(const PerfOverlaySnapshotData& snapshot) {
    for (const auto& tab : snapshot.tabs) {
        if (tab.id == snapshot.activeTab) {
            return &tab;
        }
    }
    if (!snapshot.tabs.empty()) {
        return &snapshot.tabs.front();
    }
    return nullptr;
}

inline int clampPerfOverlayScrollRows(const PerfOverlayTabData* activeTab,
                                      const juce::Rectangle<int>& contentBounds,
                                      int scrollRows) {
    if (activeTab == nullptr) {
        return 0;
    }
    const int visibleRows = std::max(1, contentBounds.getHeight() / kPerfOverlayRowHeight);
    const int maxScrollRows = std::max(0, static_cast<int>(activeTab->rows.size()) - visibleRows);
    return juce::jlimit(0, maxScrollRows, scrollRows);
}

inline int nextPerfOverlayScrollRows(const PerfOverlaySnapshotData& snapshot,
                                     const juce::Rectangle<int>& contentBounds,
                                     int currentScrollRows,
                                     float wheelDeltaY) {
    if (std::abs(wheelDeltaY) < 0.0001f) {
        return clampPerfOverlayScrollRows(resolvePerfOverlayActiveTab(snapshot), contentBounds, currentScrollRows);
    }

    int next = currentScrollRows;
    next -= wheelDeltaY > 0.0f ? 1 : -1;
    return clampPerfOverlayScrollRows(resolvePerfOverlayActiveTab(snapshot), contentBounds, next);
}

inline int currentPerfOverlayTabIndex(const PerfOverlaySnapshotData& snapshot) {
    for (int i = 0; i < static_cast<int>(snapshot.tabs.size()); ++i) {
        if (snapshot.tabs[static_cast<std::size_t>(i)].id == snapshot.activeTab) {
            return i;
        }
    }
    return snapshot.tabs.empty() ? -1 : 0;
}

inline int nextPerfOverlayTabIndex(const PerfOverlaySnapshotData& snapshot, int delta) {
    if (snapshot.tabs.empty()) {
        return -1;
    }
    const int currentIndex = std::max(0, currentPerfOverlayTabIndex(snapshot));
    return juce::jlimit(0, static_cast<int>(snapshot.tabs.size()) - 1, currentIndex + delta);
}

inline juce::Rectangle<int> clampPerfOverlayDraggedBounds(const juce::Rectangle<int>& dragStartBounds,
                                                          const juce::Rectangle<int>& parentBounds,
                                                          juce::Point<int> dragDelta) {
    auto next = dragStartBounds.translated(dragDelta.x, dragDelta.y);
    next.setX(juce::jlimit(parentBounds.getX(), parentBounds.getRight() - next.getWidth(), next.getX()));
    next.setY(juce::jlimit(parentBounds.getY(), parentBounds.getBottom() - next.getHeight(), next.getY()));
    return next;
}

inline int perfOverlayVisibleRows(const juce::Rectangle<int>& contentBounds) {
    return std::max(1, contentBounds.getHeight() / kPerfOverlayRowHeight);
}

inline int perfOverlayValuePositionX(const juce::Rectangle<int>& rowRect,
                                     int valueX,
                                     float valueWidth) {
    return std::max(valueX, rowRect.getRight() - 4 - static_cast<int>(std::ceil(valueWidth)));
}

} // namespace manifold::ui::imgui
