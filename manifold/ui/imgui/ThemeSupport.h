#pragma once

#include "Theme.h"

#include <array>

namespace manifold::ui::imgui {

struct ToolThemeStyleSnapshot {
    float windowRounding = 0.0f;
    float childRounding = 0.0f;
    float frameRounding = 0.0f;
    float popupRounding = 0.0f;
    float grabRounding = 0.0f;
    float tabRounding = 0.0f;
    float windowBorderSize = 0.0f;
    float childBorderSize = 0.0f;
    float frameBorderSize = 0.0f;
    ImVec2 windowPadding { 0.0f, 0.0f };
    ImVec2 framePadding { 0.0f, 0.0f };
    ImVec2 itemSpacing { 0.0f, 0.0f };
    ImVec2 itemInnerSpacing { 0.0f, 0.0f };
    ImVec2 cellPadding { 0.0f, 0.0f };
    float indentSpacing = 0.0f;
    float scrollbarSize = 0.0f;
    std::array<ImVec4, ImGuiCol_COUNT> colors {};
};

inline ToolThemeStyleSnapshot makeToolThemeStyleSnapshot(const ThemeTokens& theme) {
    ToolThemeStyleSnapshot snapshot;
    snapshot.windowRounding = 0.0f;
    snapshot.childRounding = theme.childRounding;
    snapshot.frameRounding = theme.frameRounding;
    snapshot.popupRounding = theme.frameRounding;
    snapshot.grabRounding = theme.frameRounding;
    snapshot.tabRounding = theme.frameRounding;
    snapshot.windowBorderSize = 0.0f;
    snapshot.childBorderSize = 1.0f;
    snapshot.frameBorderSize = 0.0f;
    snapshot.windowPadding = ImVec2(theme.windowPaddingX, theme.windowPaddingY);
    snapshot.framePadding = ImVec2(theme.rowPaddingX - 2.0f, theme.rowPaddingY);
    snapshot.itemSpacing = ImVec2(theme.itemGap, 6.0f);
    snapshot.itemInnerSpacing = ImVec2(6.0f, 4.0f);
    snapshot.cellPadding = ImVec2(8.0f, 4.0f);
    snapshot.indentSpacing = theme.indentWidth;
    snapshot.scrollbarSize = 12.0f;

    snapshot.colors[ImGuiCol_WindowBg] = theme.panelBg;
    snapshot.colors[ImGuiCol_ChildBg] = theme.panelBgAlt;
    snapshot.colors[ImGuiCol_Border] = theme.panelBorder;
    snapshot.colors[ImGuiCol_Separator] = theme.panelBorder;
    snapshot.colors[ImGuiCol_SeparatorHovered] = theme.accent;
    snapshot.colors[ImGuiCol_SeparatorActive] = theme.accent;
    snapshot.colors[ImGuiCol_Text] = theme.text;
    snapshot.colors[ImGuiCol_TextDisabled] = theme.textMuted;
    snapshot.colors[ImGuiCol_Header] = theme.selectionBg;
    snapshot.colors[ImGuiCol_HeaderHovered] = theme.accent;
    snapshot.colors[ImGuiCol_HeaderActive] = theme.accent;
    snapshot.colors[ImGuiCol_Button] = theme.buttonBg;
    snapshot.colors[ImGuiCol_ButtonHovered] = theme.buttonHoveredBg;
    snapshot.colors[ImGuiCol_ButtonActive] = theme.buttonActiveBg;
    snapshot.colors[ImGuiCol_FrameBg] = theme.frameBg;
    snapshot.colors[ImGuiCol_FrameBgHovered] = theme.frameHoveredBg;
    snapshot.colors[ImGuiCol_FrameBgActive] = theme.frameActiveBg;
    snapshot.colors[ImGuiCol_TitleBg] = theme.panelBg;
    snapshot.colors[ImGuiCol_TitleBgActive] = theme.panelBg;
    snapshot.colors[ImGuiCol_ScrollbarBg] = theme.panelBgAlt;
    snapshot.colors[ImGuiCol_ScrollbarGrab] = theme.hoverBg;
    snapshot.colors[ImGuiCol_ScrollbarGrabHovered] = theme.rowActiveBg;
    snapshot.colors[ImGuiCol_ScrollbarGrabActive] = theme.accent;
    snapshot.colors[ImGuiCol_CheckMark] = theme.selectionText;
    snapshot.colors[ImGuiCol_SliderGrab] = theme.accent;
    snapshot.colors[ImGuiCol_SliderGrabActive] = theme.selectionText;
    snapshot.colors[ImGuiCol_ResizeGrip] = theme.hoverBg;
    snapshot.colors[ImGuiCol_ResizeGripHovered] = theme.accent;
    snapshot.colors[ImGuiCol_ResizeGripActive] = theme.selectionText;
    snapshot.colors[ImGuiCol_Tab] = theme.buttonBg;
    snapshot.colors[ImGuiCol_TabHovered] = theme.buttonHoveredBg;
    snapshot.colors[ImGuiCol_TabActive] = theme.buttonActiveBg;
    snapshot.colors[ImGuiCol_NavHighlight] = theme.accent;
    return snapshot;
}

} // namespace manifold::ui::imgui
