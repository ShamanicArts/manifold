#pragma once

#include "Theme.h"

#include "external/imgui/imgui.h"

#include <algorithm>

namespace manifold::ui::imgui {

struct RowOptions {
    const char* label = "";
    const char* detail = nullptr;
    bool selected = false;
    bool muted = false;
    float indent = 0.0f;
};

struct WidgetRowResolvedStyle {
    float rowHeight = 0.0f;
    ImU32 background = 0;
    ImU32 separator = 0;
    ImU32 labelColor = 0;
    ImU32 detailColor = 0;
};

struct WidgetRowLayout {
    float left = 0.0f;
    float right = 0.0f;
    float textY = 0.0f;
    float detailX = 0.0f;
    float clipMaxX = 0.0f;
};

struct SectionHeaderLayout {
    float width = 0.0f;
    float height = 0.0f;
    float textX = 0.0f;
    float textY = 0.0f;
    float lineY = 0.0f;
    float lineStart = 0.0f;
};

inline float resolveWidgetRowHeight(const ThemeTokens& theme, float textLineHeight) {
    return std::max(theme.rowHeight, textLineHeight + theme.rowPaddingY * 2.0f);
}

inline WidgetRowResolvedStyle resolveWidgetRowStyle(const ThemeTokens& theme,
                                                    const RowOptions& options,
                                                    bool hovered,
                                                    bool active,
                                                    float textLineHeight) {
    WidgetRowResolvedStyle resolved;
    resolved.rowHeight = resolveWidgetRowHeight(theme, textLineHeight);
    resolved.separator = toU32(theme.panelBorder);

    if (options.selected) {
        resolved.background = toU32(theme.selectionBg);
    } else if (active) {
        resolved.background = toU32(theme.rowActiveBg);
    } else if (hovered) {
        resolved.background = toU32(theme.hoverBg);
    }

    resolved.labelColor = options.selected
        ? toU32(theme.selectionText)
        : toU32(options.muted ? theme.textMuted : theme.text);
    resolved.detailColor = options.selected
        ? toU32(theme.selectionText)
        : toU32(theme.textMuted);
    return resolved;
}

inline WidgetRowLayout computeWidgetRowLayout(const ThemeTokens& theme,
                                              const RowOptions& options,
                                              const ImVec2& min,
                                              const ImVec2& max,
                                              float textLineHeight,
                                              float detailWidth) {
    WidgetRowLayout layout;
    const float rectHeight = max.y - min.y;
    layout.left = min.x + theme.rowPaddingX + options.indent;
    layout.right = max.x - theme.rowPaddingX;
    layout.textY = min.y + (rectHeight - textLineHeight) * 0.5f;

    if (options.detail != nullptr && options.detail[0] != '\0') {
        layout.detailX = std::max(layout.left, layout.right - detailWidth);
        layout.right = layout.detailX - theme.itemGap;
    } else {
        layout.detailX = layout.right;
    }

    layout.clipMaxX = std::max(layout.left, layout.right);
    return layout;
}

inline float resolveWidgetRowWidth(float contentRegionAvailX) {
    return std::max(1.0f, contentRegionAvailX);
}

inline SectionHeaderLayout computeSectionHeaderLayout(const ThemeTokens& theme,
                                                      const ImVec2& position,
                                                      float contentRegionAvailX,
                                                      float textLineHeight,
                                                      float labelWidth) {
    SectionHeaderLayout layout;
    layout.width = std::max(1.0f, contentRegionAvailX);
    layout.height = textLineHeight + theme.sectionPaddingY * 2.0f;
    layout.textX = position.x + theme.rowPaddingX;
    layout.textY = position.y + theme.sectionPaddingY;
    layout.lineY = position.y + layout.height - 1.0f;
    layout.lineStart = std::min(position.x + layout.width - theme.rowPaddingX,
                                layout.textX + labelWidth + theme.itemGap);
    return layout;
}

} // namespace manifold::ui::imgui
