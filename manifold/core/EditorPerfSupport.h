#pragma once

#include "../ui/imgui/ImGuiScriptListHost.h"
#include "../ui/imgui/ImGuiHierarchyHost.h"
#include "../ui/imgui/ImGuiInspectorHost.h"
#include "../ui/imgui/ImGuiPerfOverlayHost.h"

#include <juce_gui_basics/juce_gui_basics.h>
#include <sol/sol.hpp>
#include <cstdint>
#include <cstdio>
#include <chrono>
#include <fstream>
#include <sstream>
#include <string>
#if defined(__GLIBC__)
#include <malloc.h>
#endif

namespace editor_perf {

using PerfClock = std::chrono::steady_clock;

inline void logEditorPerf(const char* label, PerfClock::time_point start, const char* extra = nullptr) {
    juce::ignoreUnused(label, start, extra);
}

struct HostLayoutTraceState {
    bool initialised = false;
    bool visible = false;
    juce::Rectangle<int> bounds;
};

inline void logEditorHostLayout(const char* name, HostLayoutTraceState& state, bool visible,
                                const juce::Rectangle<int>& bounds) {
    juce::ignoreUnused(name, visible, bounds);
    state.initialised = true;
    state.visible = visible;
    state.bounds = bounds;
}

struct ProcessMemorySnapshot {
    int64_t pssBytes = 0;
    int64_t privateDirtyBytes = 0;
};

inline ProcessMemorySnapshot readProcessMemorySnapshot() {
    ProcessMemorySnapshot snapshot;
    std::ifstream smaps("/proc/self/smaps_rollup");
    std::string line;
    while (std::getline(smaps, line)) {
        if (line.rfind("Pss:", 0) == 0) {
            std::istringstream iss(line);
            std::string label, unit;
            int64_t kb = 0;
            iss >> label >> kb >> unit;
            snapshot.pssBytes = kb * 1024;
        } else if (line.rfind("Private_Dirty:", 0) == 0) {
            std::istringstream iss(line);
            std::string label, unit;
            int64_t kb = 0;
            iss >> label >> kb >> unit;
            snapshot.privateDirtyBytes = kb * 1024;
        }
    }
    return snapshot;
}

struct GlibcAllocatorSnapshot {
    int64_t heapUsedBytes = 0;
    int64_t arenaBytes = 0;
    int64_t mmapBytes = 0;
    int64_t freeHeldBytes = 0;
    int64_t releasableBytes = 0;
    int64_t arenaCount = 0;
};

inline GlibcAllocatorSnapshot readGlibcAllocatorSnapshot() {
    GlibcAllocatorSnapshot snapshot;
#if defined(__GLIBC__)
    struct mallinfo2 mi;
    memset(&mi, 0, sizeof(mi));
    mi = mallinfo2();
    snapshot.heapUsedBytes = static_cast<int64_t>(mi.uordblks);
    snapshot.arenaBytes = static_cast<int64_t>(mi.arena);
    snapshot.mmapBytes = 0;
    snapshot.freeHeldBytes = static_cast<int64_t>(mi.fordblks);
    snapshot.releasableBytes = static_cast<int64_t>(mi.keepcost);
    snapshot.arenaCount = static_cast<int64_t>(mi.ordblks);
#endif
    return snapshot;
}

inline int64_t estimateScriptListRowsBytes(const std::vector<ImGuiScriptListHost::ScriptRow>& rows) {
    int64_t total = static_cast<int64_t>(rows.capacity()) * static_cast<int64_t>(sizeof(ImGuiScriptListHost::ScriptRow));
    for (const auto& row : rows) {
        total += static_cast<int64_t>(row.kind.capacity() + row.ownership.capacity() + row.name.capacity() + row.label.capacity() + row.path.capacity());
    }
    return total;
}

inline int64_t estimateHierarchyRowsBytes(const std::vector<ImGuiHierarchyHost::TreeRow>& rows) {
    int64_t total = static_cast<int64_t>(rows.capacity()) * static_cast<int64_t>(sizeof(ImGuiHierarchyHost::TreeRow));
    for (const auto& row : rows) {
        total += static_cast<int64_t>(row.type.capacity() + row.name.capacity() + row.path.capacity());
    }
    return total;
}

inline int64_t estimateInspectorRowsBytes(const std::vector<ImGuiInspectorHost::InspectorRow>& rows,
                                          const ImGuiInspectorHost::ActiveProperty& activeProperty) {
    int64_t total = static_cast<int64_t>(rows.capacity()) * static_cast<int64_t>(sizeof(ImGuiInspectorHost::InspectorRow));
    for (const auto& row : rows) {
        total += static_cast<int64_t>(row.key.capacity() + row.value.capacity());
    }
    total += static_cast<int64_t>(activeProperty.key.capacity() + activeProperty.path.capacity() + activeProperty.editorType.capacity()
                                + activeProperty.displayValue.capacity() + activeProperty.textValue.capacity());
    total += static_cast<int64_t>(activeProperty.enumLabels.capacity()) * static_cast<int64_t>(sizeof(std::string));
    for (const auto& label : activeProperty.enumLabels) {
        total += static_cast<int64_t>(label.capacity());
    }
    return total;
}

inline int64_t estimateScriptInspectorBytes(const ImGuiInspectorHost::ScriptInspectorData& data) {
    int64_t total = sizeof(ImGuiInspectorHost::ScriptInspectorData);
    total += static_cast<int64_t>(data.name.capacity() + data.kind.capacity() + data.ownership.capacity() + data.path.capacity() +
                                  data.text.capacity() + data.runtimeStatus.capacity() + data.projectLastError.capacity());
    total += static_cast<int64_t>(data.declaredParams.capacity()) * static_cast<int64_t>(sizeof(ImGuiInspectorHost::DeclaredParam));
    for (const auto& p : data.declaredParams) {
        total += static_cast<int64_t>(p.path.capacity() + p.defaultValue.capacity());
    }
    total += static_cast<int64_t>(data.runtimeParams.capacity()) * static_cast<int64_t>(sizeof(ImGuiInspectorHost::RuntimeParam));
    for (const auto& p : data.runtimeParams) {
        total += static_cast<int64_t>(p.endpointPath.capacity() + p.path.capacity() + p.displayValue.capacity());
    }
    total += static_cast<int64_t>(data.graphNodes.capacity()) * static_cast<int64_t>(sizeof(ImGuiInspectorHost::GraphNode));
    for (const auto& n : data.graphNodes) {
        total += static_cast<int64_t>(n.var.capacity() + n.prim.capacity());
    }
    total += static_cast<int64_t>(data.graphEdges.capacity()) * static_cast<int64_t>(sizeof(ImGuiInspectorHost::GraphEdge));
    return total;
}

inline void readSurfaceDescriptor(sol::object surfacesObj, const char* surfaceId,
                                  bool& visibleOut, juce::Rectangle<int>& boundsOut,
                                  std::string* titleOut = nullptr) {
    visibleOut = false;
    boundsOut = juce::Rectangle<int>();
    if (titleOut != nullptr) {
        titleOut->clear();
    }
    if (!surfacesObj.valid() || !surfacesObj.is<sol::table>()) {
        return;
    }
    sol::table surfaces = surfacesObj.as<sol::table>();
    sol::object surfaceObj = surfaces[surfaceId];
    if (!surfaceObj.valid() || !surfaceObj.is<sol::table>()) {
        return;
    }
    sol::table surface = surfaceObj.as<sol::table>();
    visibleOut = surface["visible"].get_or(false);
    if (titleOut != nullptr) {
        *titleOut = surface["title"].get_or(std::string{});
    }
    sol::object boundsObj = surface["bounds"];
    if (!boundsObj.valid() || !boundsObj.is<sol::table>()) {
        return;
    }
    sol::table bounds = boundsObj.as<sol::table>();
    boundsOut = juce::Rectangle<int>(
        bounds["x"].get_or(0),
        bounds["y"].get_or(0),
        std::max(0, bounds["w"].get_or(0)),
        std::max(0, bounds["h"].get_or(0)));
}

} // namespace editor_perf
