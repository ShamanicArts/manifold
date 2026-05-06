#pragma once

#include <string>

namespace manifold::ui::imgui {

struct ScriptListSupportRow {
    bool section = false;
    bool nonInteractive = false;
    bool selected = false;
    bool active = false;
    bool dirty = false;
    std::string kind;
    std::string ownership;
    std::string name;
    std::string label;
    std::string path;
};

struct ScriptListInteractionResult {
    bool requestSelect = false;
    bool requestOpen = false;
};

inline std::string buildScriptListDisplayLabel(const ScriptListSupportRow& row) {
    if (row.section) {
        return row.label;
    }
    if (row.nonInteractive) {
        return row.name;
    }

    std::string label = row.name;
    if (row.ownership == "editor-owned") {
        label += " [editor]";
    }
    if (row.active) {
        label += "  • active";
    }
    if (row.dirty) {
        label = "* " + label;
    }
    return label;
}

inline ScriptListInteractionResult resolveScriptListInteraction(bool activated, bool doubleClicked) {
    ScriptListInteractionResult result;
    result.requestSelect = activated || doubleClicked;
    result.requestOpen = doubleClicked;
    return result;
}

} // namespace manifold::ui::imgui
