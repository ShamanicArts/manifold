#pragma once

#include "ImGuiDirectHost.h"
#include "imgui.h"
#include "imgui_internal.h"

#include <cstring>

namespace direct_host_stats_support {

inline int64_t estimateRenderSnapshotBytes(const ImGuiDirectHost::RenderSnapshot& snapshot,
                                           int64_t& nodeCountOut) {
    int64_t total = sizeof(ImGuiDirectHost::RenderSnapshot);
    total += static_cast<int64_t>(snapshot.nodes.capacity()) * static_cast<int64_t>(sizeof(ImGuiDirectHost::RenderNodeData));
    nodeCountOut = static_cast<int64_t>(snapshot.nodes.size());
    for (const auto& node : snapshot.nodes) {
        total += static_cast<int64_t>(node.customSurfaceType.capacity());
        total += static_cast<int64_t>(node.childIndices.capacity()) * static_cast<int64_t>(sizeof(int));
    }
    return total;
}

inline void estimateImGuiInternalStats(ImGuiContext* context,
                                       ImGuiDirectHost::StatsSnapshot& snapshot) {
    if (context == nullptr) {
        return;
    }
    ImGui::SetCurrentContext(context);
    ImGuiContext& g = *context;
    snapshot.imguiWindowCount = g.Windows.Size;
    snapshot.imguiTableCount = g.Tables.GetMapSize();
    snapshot.imguiTabBarCount = g.TabBars.GetMapSize();
    snapshot.imguiViewportCount = g.Viewports.Size;
    snapshot.imguiFontCount = g.IO.Fonts ? g.IO.Fonts->Fonts.Size : 0;

    int64_t windowStateBytes = 0;
    int64_t drawBufferBytes = 0;
    windowStateBytes += static_cast<int64_t>(g.Windows.Capacity) * static_cast<int64_t>(sizeof(ImGuiWindow*));
    windowStateBytes += static_cast<int64_t>(g.WindowsFocusOrder.Capacity) * static_cast<int64_t>(sizeof(ImGuiWindow*));
    windowStateBytes += static_cast<int64_t>(g.WindowsTempSortBuffer.Capacity) * static_cast<int64_t>(sizeof(ImGuiWindow*));
    windowStateBytes += static_cast<int64_t>(g.CurrentWindowStack.Capacity) * static_cast<int64_t>(sizeof(ImGuiWindowStackData));
    windowStateBytes += static_cast<int64_t>(g.Tables.GetMapSize()) * static_cast<int64_t>(sizeof(ImGuiTable));
    windowStateBytes += static_cast<int64_t>(g.TabBars.GetMapSize()) * static_cast<int64_t>(sizeof(ImGuiTabBar));
    windowStateBytes += static_cast<int64_t>(g.Viewports.Capacity) * static_cast<int64_t>(sizeof(ImGuiViewportP*));
    windowStateBytes += static_cast<int64_t>(g.FontAtlases.Capacity) * static_cast<int64_t>(sizeof(ImFontAtlas*));
    windowStateBytes += static_cast<int64_t>(g.DrawChannelsTempMergeBuffer.Capacity) * static_cast<int64_t>(sizeof(ImDrawChannel));
    windowStateBytes += static_cast<int64_t>(g.ClipboardHandlerData.Capacity) * static_cast<int64_t>(sizeof(char));
    windowStateBytes += static_cast<int64_t>(g.TempBuffer.Capacity) * static_cast<int64_t>(sizeof(char));
    windowStateBytes += static_cast<int64_t>(g.SettingsIniData.Buf.Capacity) * static_cast<int64_t>(sizeof(char));
    windowStateBytes += static_cast<int64_t>(g.SettingsHandlers.Capacity) * static_cast<int64_t>(sizeof(ImGuiSettingsHandler));
    windowStateBytes += static_cast<int64_t>(g.LogBuffer.Buf.Capacity) * static_cast<int64_t>(sizeof(char));
    windowStateBytes += static_cast<int64_t>(g.InputEventsQueue.Capacity) * static_cast<int64_t>(sizeof(ImGuiInputEvent));
    windowStateBytes += static_cast<int64_t>(g.InputEventsTrail.Capacity) * static_cast<int64_t>(sizeof(ImGuiInputEvent));

    for (int i = 0; i < g.Windows.Size; ++i) {
        ImGuiWindow* w = g.Windows[i];
        if (w == nullptr) {
            continue;
        }
        windowStateBytes += static_cast<int64_t>(sizeof(ImGuiWindow));
        if (w->Name) {
            windowStateBytes += static_cast<int64_t>(std::strlen(w->Name));
        }
        windowStateBytes += static_cast<int64_t>(w->IDStack.Capacity) * static_cast<int64_t>(sizeof(ImGuiID));
        windowStateBytes += static_cast<int64_t>(w->DC.ChildWindows.Capacity) * static_cast<int64_t>(sizeof(ImGuiWindow*));
        windowStateBytes += static_cast<int64_t>(w->DC.ItemWidthStack.Capacity) * static_cast<int64_t>(sizeof(float));
        windowStateBytes += static_cast<int64_t>(w->DC.TextWrapPosStack.Capacity) * static_cast<int64_t>(sizeof(float));
        if (w->DrawList) {
            drawBufferBytes += static_cast<int64_t>(w->DrawList->VtxBuffer.Capacity) * static_cast<int64_t>(sizeof(ImDrawVert));
            drawBufferBytes += static_cast<int64_t>(w->DrawList->IdxBuffer.Capacity) * static_cast<int64_t>(sizeof(ImDrawIdx));
            drawBufferBytes += static_cast<int64_t>(w->DrawList->CmdBuffer.Capacity) * static_cast<int64_t>(sizeof(ImDrawCmd));
        }
    }

    if (g.IO.Fonts) {
        windowStateBytes += static_cast<int64_t>(sizeof(ImFontAtlas));
        windowStateBytes += static_cast<int64_t>(g.IO.Fonts->Fonts.Capacity) * static_cast<int64_t>(sizeof(ImFont*));
        windowStateBytes += static_cast<int64_t>(g.IO.Fonts->Sources.Capacity) * static_cast<int64_t>(sizeof(ImFontConfig));
        for (int i = 0; i < g.IO.Fonts->Fonts.Size; ++i) {
            ImFont* font = g.IO.Fonts->Fonts[i];
            if (!font) continue;
            windowStateBytes += static_cast<int64_t>(sizeof(ImFont));
        }
    }

    snapshot.imguiWindowStateBytes = windowStateBytes;
    snapshot.imguiDrawBufferBytes = drawBufferBytes;
    snapshot.imguiInternalStateBytes = windowStateBytes + drawBufferBytes;
}

} // namespace direct_host_stats_support
