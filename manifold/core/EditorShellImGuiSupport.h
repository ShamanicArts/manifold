#pragma once

#include "../ui/imgui/ImGuiHierarchyHost.h"
#include "../ui/imgui/ImGuiInspectorHost.h"

#include <cstddef>
#include <string>
#include <vector>

namespace editor_shell {

struct HierarchyTreeRowData {
    int depth = 0;
    bool selected = false;
    std::string type;
    std::string name;
    std::string path;
};

inline ImGuiHierarchyHost::TreeRow buildHierarchyHostRow(const HierarchyTreeRowData& row) {
    ImGuiHierarchyHost::TreeRow hostRow;
    hostRow.depth = row.depth;
    hostRow.selected = row.selected;
    hostRow.type = row.type;
    hostRow.name = row.name;
    hostRow.path = row.path;
    return hostRow;
}

inline std::vector<ImGuiHierarchyHost::TreeRow> buildHierarchyHostRows(const std::vector<HierarchyTreeRowData>& rows) {
    std::vector<ImGuiHierarchyHost::TreeRow> hostRows;
    hostRows.reserve(rows.size());
    for (const auto& row : rows) {
        hostRows.push_back(buildHierarchyHostRow(row));
    }
    return hostRows;
}

struct InspectorRowData {
    bool isConfig = false;
    std::string key;
    std::string value;
    std::string path;
};

inline ImGuiInspectorHost::InspectorRow buildInspectorHostRow(std::size_t oneBasedRowIndex,
                                                              const InspectorRowData& row,
                                                              const std::string& activePath) {
    ImGuiInspectorHost::InspectorRow hostRow;
    hostRow.rowIndex = static_cast<int>(oneBasedRowIndex);
    hostRow.section = !row.isConfig && row.value.empty();
    hostRow.interactive = row.isConfig;
    hostRow.key = row.key;
    hostRow.value = row.value;
    hostRow.selected = hostRow.interactive && !activePath.empty() && row.path == activePath;
    return hostRow;
}

inline std::vector<ImGuiInspectorHost::InspectorRow> buildInspectorHostRows(const std::vector<InspectorRowData>& rows,
                                                                            const std::string& activePath) {
    std::vector<ImGuiInspectorHost::InspectorRow> hostRows;
    hostRows.reserve(rows.size());
    for (std::size_t i = 0; i < rows.size(); ++i) {
        hostRows.push_back(buildInspectorHostRow(i + 1, rows[i], activePath));
    }
    return hostRows;
}

inline int resolveInspectorEnumSelectedIndex(const std::vector<bool>& optionMatches,
                                             int fallbackIndex = 1) {
    for (std::size_t i = 0; i < optionMatches.size(); ++i) {
        if (optionMatches[i]) {
            return static_cast<int>(i + 1);
        }
    }
    return fallbackIndex;
}

} // namespace editor_shell
