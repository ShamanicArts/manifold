#pragma once

#include "ImGuiInspectorHost.h"
#include "TextInputHostSupport.h"

#include <juce_core/juce_core.h>

#include <cstdint>
#include <string>

namespace manifold::ui::imgui {

struct InspectorTextEditState {
    std::string path;
    std::string lastSourceValue;
    std::string buffer;
};

inline InspectorTextEditState syncInspectorTextEditState(const ImGuiInspectorHost::ActiveProperty& activeProperty,
                                                         const InspectorTextEditState& currentState) {
    InspectorTextEditState nextState = currentState;

    if (!activeProperty.valid) {
        nextState.path.clear();
        nextState.lastSourceValue.clear();
        nextState.buffer.clear();
        return nextState;
    }

    if (activeProperty.editorType != "text") {
        return nextState;
    }

    if (nextState.path != activeProperty.path || nextState.lastSourceValue != activeProperty.textValue) {
        nextState.path = activeProperty.path;
        nextState.lastSourceValue = activeProperty.textValue;
        nextState.buffer = activeProperty.textValue;
    }

    return nextState;
}

struct InspectorInlineDocumentUpdate {
    bool clearState = false;
    bool setReadOnly = false;
    bool reloadDocument = false;
    std::string nextPath;
    int64_t nextSyncToken = -1;
    TextInputHostLanguageDefinition language = TextInputHostLanguageDefinition::None;
};

inline InspectorInlineDocumentUpdate resolveInspectorInlineDocumentUpdate(const ImGuiInspectorHost::ScriptInspectorData& scriptData,
                                                                         const std::string& currentDocumentPath,
                                                                         int64_t appliedSyncToken) {
    InspectorInlineDocumentUpdate update;

    if (scriptData.path.empty()) {
        update.clearState = true;
        return update;
    }

    update.setReadOnly = true;
    update.nextPath = scriptData.path;
    update.nextSyncToken = scriptData.syncToken;
    update.language = resolveLanguageDefinitionForFile(juce::File(scriptData.path));
    update.reloadDocument = (appliedSyncToken != scriptData.syncToken || currentDocumentPath != scriptData.path);
    return update;
}

} // namespace manifold::ui::imgui
