#pragma once

#include "WidgetGeometrySupport.h"

namespace manifold {
namespace ui {
namespace imgui {


void drawSectionHeader(const char* label);
bool beginPanel(const char* id, const ImVec2& size = ImVec2(0.0f, 0.0f), ImGuiWindowFlags flags = 0);
void endPanel();
void drawEmptyState(const char* title, const char* detail = nullptr);
void drawTextRow(const RowOptions& options);
bool drawSelectableRow(const RowOptions& options);

} // namespace imgui
} // namespace ui
} // namespace manifold
