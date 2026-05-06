#include "WidgetPrimitives.h"

#include <algorithm>

namespace manifold {
namespace ui {
namespace imgui {
namespace {

void drawRow(const RowOptions& options, bool hovered, bool active) {
    const auto& theme = toolTheme();
    auto* drawList = ImGui::GetWindowDrawList();
    const auto min = ImGui::GetItemRectMin();
    const auto max = ImGui::GetItemRectMax();
    const auto textLineHeight = ImGui::GetTextLineHeight();
    const auto detailSize = ImGui::CalcTextSize(options.detail != nullptr ? options.detail : "");

    const auto resolved = resolveWidgetRowStyle(theme, options, hovered, active, textLineHeight);
    const auto layout = computeWidgetRowLayout(theme, options, min, max, textLineHeight, detailSize.x);

    if (resolved.background != 0) {
        drawList->AddRectFilled(min, max, resolved.background, theme.rowRounding);
    }

    drawList->AddLine(ImVec2(min.x, max.y - 1.0f), ImVec2(max.x, max.y - 1.0f), resolved.separator);

    if (options.detail != nullptr && options.detail[0] != '\0') {
        drawList->AddText(ImVec2(layout.detailX, layout.textY), resolved.detailColor, options.detail);
    }

    drawList->PushClipRect(ImVec2(layout.left, min.y), ImVec2(layout.clipMaxX, max.y), true);
    drawList->AddText(ImVec2(layout.left, layout.textY), resolved.labelColor, options.label != nullptr ? options.label : "");
    drawList->PopClipRect();
}

void advanceRowCursor() {
    const auto& theme = toolTheme();
    const auto textLineHeight = ImGui::GetTextLineHeight();
    const auto height = resolveWidgetRowHeight(theme, textLineHeight);
    const auto width = resolveWidgetRowWidth(ImGui::GetContentRegionAvail().x);
    ImGui::Dummy(ImVec2(width, height));
}

} // namespace

void drawSectionHeader(const char* label) {
    const auto& theme = toolTheme();
    const auto pos = ImGui::GetCursorScreenPos();
    const auto textLineHeight = ImGui::GetTextLineHeight();
    const auto labelSize = ImGui::CalcTextSize(label != nullptr ? label : "");
    const auto layout = computeSectionHeaderLayout(theme,
                                                   pos,
                                                   ImGui::GetContentRegionAvail().x,
                                                   textLineHeight,
                                                   labelSize.x);

    ImGui::Dummy(ImVec2(layout.width, layout.height));

    auto* drawList = ImGui::GetWindowDrawList();
    drawList->AddText(ImVec2(layout.textX, layout.textY), toU32(theme.textMuted), label != nullptr ? label : "");
    if (layout.lineStart < pos.x + layout.width - theme.rowPaddingX) {
        drawList->AddLine(ImVec2(layout.lineStart, layout.lineY),
                          ImVec2(pos.x + layout.width - theme.rowPaddingX, layout.lineY),
                          toU32(theme.panelBorder));
    }
}

bool beginPanel(const char* id, const ImVec2& size, ImGuiWindowFlags flags) {
    return ImGui::BeginChild(id, size, true, flags);
}

void endPanel() {
    ImGui::EndChild();
}

void drawEmptyState(const char* title, const char* detail) {
    drawSectionHeader(title != nullptr ? title : "Empty");
    if (detail == nullptr || detail[0] == '\0') {
        return;
    }

    advanceRowCursor();
    drawRow(RowOptions { detail, nullptr, false, true, 0.0f }, false, false);
}

void drawTextRow(const RowOptions& options) {
    advanceRowCursor();
    drawRow(options, false, false);
}

bool drawSelectableRow(const RowOptions& options) {
    const auto& theme = toolTheme();
    const auto height = resolveWidgetRowHeight(theme, ImGui::GetTextLineHeight());
    const auto width = resolveWidgetRowWidth(ImGui::GetContentRegionAvail().x);

    const bool pressed = ImGui::InvisibleButton("##row", ImVec2(width, height));
    drawRow(options, ImGui::IsItemHovered(), ImGui::IsItemActive());
    return pressed;
}

} // namespace imgui
} // namespace ui
} // namespace manifold
