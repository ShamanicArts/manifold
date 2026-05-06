#pragma once

#include "../primitives/scripting/LuaEngine.h"
#include "../primitives/ui/Canvas.h"
#include "../ui/imgui/ImGuiHost.h"
#include "../ui/imgui/ImGuiScriptListHost.h"
#include "../ui/imgui/ImGuiHierarchyHost.h"
#include "../ui/imgui/ImGuiInspectorHost.h"
#include "../ui/imgui/ImGuiPerfOverlayHost.h"
#include "EditorPerfSupport.h"
#include "EditorShellImGuiSupport.h"

#include <juce_gui_basics/juce_gui_basics.h>
#include <sol/sol.hpp>
#include <cstdint>
#include <cstdio>
#include <cstdlib>

namespace editor_shell {

struct HostConfig {
    bool visible = false;
    juce::Rectangle<int> bounds;
    juce::File file;
    std::string text;
    int64_t syncToken = 0;
    bool readOnly = false;
};

struct ScriptListHostConfig {
    bool visible = false;
    juce::Rectangle<int> bounds;
    std::vector<ImGuiScriptListHost::ScriptRow> rows;
};

struct HierarchyHostConfig {
    bool visible = false;
    juce::Rectangle<int> bounds;
    std::vector<ImGuiHierarchyHost::TreeRow> rows;
};

struct InspectorHostConfig {
    bool visible = false;
    bool scriptMode = false;
    juce::Rectangle<int> bounds;
    ImGuiInspectorHost::BoundsInfo selectionBounds;
    std::vector<ImGuiInspectorHost::InspectorRow> rows;
    ImGuiInspectorHost::ActiveProperty activeProperty;
    ImGuiInspectorHost::ScriptInspectorData scriptData;
};

struct PerfOverlayHostConfig {
    bool visible = false;
    juce::Rectangle<int> bounds;
    ImGuiPerfOverlayHost::Snapshot snapshot;
};

inline void invokeShellMethod(sol::table& shell, const char* name) {
    sol::protected_function fn = shell[name];
    if (!fn.valid()) {
        return;
    }
    sol::protected_function_result result = fn(shell);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "BehaviorCoreEditor: shell.%s failed: %s\n", name, err.what());
    }
}

inline void invokeShellMethodWithBool(sol::table& shell, const char* name, bool value) {
    sol::protected_function fn = shell[name];
    if (!fn.valid()) {
        return;
    }
    sol::protected_function_result result = fn(shell, value);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "BehaviorCoreEditor: shell.%s failed: %s\n", name, err.what());
    }
}

inline void invokeShellMethodWithNumber(sol::table& shell, const char* name, double value) {
    sol::protected_function fn = shell[name];
    if (!fn.valid()) {
        return;
    }
    sol::protected_function_result result = fn(shell, value);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "BehaviorCoreEditor: shell.%s failed: %s\n", name, err.what());
    }
}

inline void invokeShellMethodWithInts(sol::table& shell, const char* name, int a, int b) {
    sol::protected_function fn = shell[name];
    if (!fn.valid()) {
        return;
    }
    sol::protected_function_result result = fn(shell, a, b);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "BehaviorCoreEditor: shell.%s failed: %s\n", name, err.what());
    }
}

inline void invokeShellMethodWithStringAndNumber(sol::table& shell, const char* name,
                                          const std::string& text, double value) {
    sol::protected_function fn = shell[name];
    if (!fn.valid()) {
        return;
    }
    sol::protected_function_result result = fn(shell, text, value);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "BehaviorCoreEditor: shell.%s failed: %s\n", name, err.what());
    }
}

inline void invokeShellMethodWithStringAndInt(sol::table& shell, const char* name,
                                       const char* text, int value) {
    sol::protected_function fn = shell[name];
    if (!fn.valid()) {
        return;
    }
    sol::protected_function_result result = fn(shell, text, value);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "BehaviorCoreEditor: shell.%s failed: %s\n", name, err.what());
    }
}

inline void applyActiveConfigValue(sol::table& shell, double value, const char* valueKind) {
    sol::protected_function fn = shell["applyActiveConfigValue"];
    if (!fn.valid()) {
        return;
    }
    sol::protected_function_result result = fn(shell, value);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "BehaviorCoreEditor: shell.applyActiveConfigValue(%s) failed: %s\n",
                     valueKind, err.what());
    }
}

inline void applyActiveConfigValue(sol::table& shell, bool value, const char* valueKind) {
    sol::protected_function fn = shell["applyActiveConfigValue"];
    if (!fn.valid()) {
        return;
    }
    sol::protected_function_result result = fn(shell, value);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "BehaviorCoreEditor: shell.applyActiveConfigValue(%s) failed: %s\n",
                     valueKind, err.what());
    }
}

inline void applyActiveConfigValue(sol::table& shell, const std::string& value, const char* valueKind) {
    sol::protected_function fn = shell["applyActiveConfigValue"];
    if (!fn.valid()) {
        return;
    }
    sol::protected_function_result result = fn(shell, value);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "BehaviorCoreEditor: shell.applyActiveConfigValue(%s) failed: %s\n",
                     valueKind, err.what());
    }
}

inline void syncEditorDocumentBackToShellTable(sol::table& shell,
                                        const char* tableKey,
                                        const ImGuiHost::StatsSnapshot& stats,
                                        const ImGuiHost::DocumentIdentity& identity,
                                        const std::string& text) {
    sol::object editorObj = shell[tableKey];
    if (!editorObj.valid() || !editorObj.is<sol::table>()) {
        return;
    }

    sol::table editorState = editorObj.as<sol::table>();
    const std::string shellPath = editorState["path"].get_or(std::string{});
    const int64_t shellSyncToken = editorState["syncToken"].get_or(int64_t{-1});
    if (identity.loaded
        && identity.path == shellPath
        && identity.syncToken == shellSyncToken) {
        editorState["text"] = text;
        editorState["dirty"] = stats.documentDirty;
    }
}

inline void syncMainEditorBackToShell(sol::table& shell,
                               const ImGuiHost::StatsSnapshot& stats,
                               const ImGuiHost::DocumentIdentity& identity,
                               const std::string& text) {
    if (!stats.testWindowVisible) {
        return;
    }

    syncEditorDocumentBackToShellTable(shell, "scriptEditor", stats, identity, text);
    syncEditorDocumentBackToShellTable(shell, "projectScriptEditor", stats, identity, text);
}

inline bool invokeMainEditorActionHandler(sol::table& shell, const char* actionName) {
    sol::object handlersObj = shell["mainScriptEditorActions"];
    if (!handlersObj.valid() || !handlersObj.is<sol::table>()) {
        return false;
    }

    sol::table handlers = handlersObj.as<sol::table>();
    sol::protected_function fn = handlers[actionName];
    if (!fn.valid()) {
        return false;
    }

    sol::protected_function_result result = fn(shell);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr,
                     "BehaviorCoreEditor: shell.mainScriptEditorActions.%s failed: %s\n",
                     actionName,
                     err.what());
    }
    return true;
}

inline void applyMainEditorActions(sol::table& shell, const ImGuiHost::ActionRequests& actions) {
    if (actions.save) {
        if (!invokeMainEditorActionHandler(shell, "save")) {
            invokeShellMethod(shell, "saveScriptEditor");
        }
    }
    if (actions.reload) {
        if (!invokeMainEditorActionHandler(shell, "reload")) {
            invokeShellMethod(shell, "reloadScriptEditor");
        }
    }
    if (actions.close) {
        if (!invokeMainEditorActionHandler(shell, "close")) {
            invokeShellMethod(shell, "closeScriptEditor");
        }
    }
}

inline void applyScriptInspectorActions(sol::table& shell,
                                 const ImGuiInspectorHost::ActionRequests& actions) {
    if (actions.runPreview) {
        invokeShellMethod(shell, "runSelectedDspScriptForInspector");
    }
    if (actions.stopPreview) {
        invokeShellMethod(shell, "stopSelectedDspScriptForInspector");
    }
    if (actions.setEditorCollapsed) {
        invokeShellMethodWithBool(shell, "setScriptInspectorEditorCollapsed", actions.editorCollapsed);
    }
    if (actions.setGraphCollapsed) {
        invokeShellMethodWithBool(shell, "setScriptInspectorGraphCollapsed", actions.graphCollapsed);
    }
    if (actions.setGraphPan) {
        invokeShellMethodWithInts(shell, "setScriptInspectorGraphPan",
                                  actions.graphPanX,
                                  actions.graphPanY);
    }
    if (actions.applyRuntimeParam && !actions.runtimeParamEndpointPath.empty()) {
        invokeShellMethodWithStringAndNumber(shell, "applyScriptInspectorRuntimeParam",
                                             actions.runtimeParamEndpointPath,
                                             actions.runtimeParamValue);
    }
}

inline void applyScriptListActions(sol::table& shell,
                            const ImGuiScriptListHost::ActionRequests& actions) {
    if (actions.selectIndex <= 0 && actions.openIndex <= 0) {
        return;
    }

    sol::object rowsObj = shell["scriptRows"];
    if (!rowsObj.valid() || !rowsObj.is<sol::table>()) {
        return;
    }

    sol::table scriptRows = rowsObj.as<sol::table>();
    const int targetIndex = actions.openIndex > 0 ? actions.openIndex : actions.selectIndex;
    sol::object rowObj = scriptRows[targetIndex];
    if (!rowObj.valid() || !rowObj.is<sol::table>()) {
        return;
    }

    sol::table row = rowObj.as<sol::table>();

    sol::object customActionsObj = shell["scriptListActions"];
    if (customActionsObj.valid() && customActionsObj.is<sol::table>()) {
        sol::table customActions = customActionsObj.as<sol::table>();
        const char* actionName = actions.openIndex > 0 ? "open" : "select";
        sol::protected_function customHandler = customActions[actionName];
        if (customHandler.valid()) {
            sol::protected_function_result result = customHandler(shell, row, targetIndex);
            if (!result.valid()) {
                sol::error err = result;
                std::fprintf(stderr,
                             "BehaviorCoreEditor: shell.scriptListActions.%s failed: %s\n",
                             actionName,
                             err.what());
            }
            return;
        }
    }

    sol::protected_function handleSelection = shell["handleLeftListSelection"];
    if (handleSelection.valid()) {
        sol::protected_function_result result = handleSelection(shell, "script", row, sol::lua_nil);
        if (!result.valid()) {
            sol::error err = result;
            std::fprintf(stderr, "BehaviorCoreEditor: shell.handleLeftListSelection failed: %s\n",
                         err.what());
        }
    }

    if (actions.openIndex > 0) {
        sol::protected_function openEditor = shell["openScriptEditor"];
        if (openEditor.valid()) {
            sol::protected_function_result result = openEditor(shell, row);
            if (!result.valid()) {
                sol::error err = result;
                std::fprintf(stderr, "BehaviorCoreEditor: shell.openScriptEditor failed: %s\n",
                             err.what());
            }
        }
    }
}

inline void applyHierarchyActions(sol::table& shell,
                           const ImGuiHierarchyHost::ActionRequests& actions) {
    if (actions.selectIndex <= 0) {
        return;
    }

    sol::object rowsObj = shell["treeRows"];
    if (!rowsObj.valid() || !rowsObj.is<sol::table>()) {
        return;
    }

    sol::table treeRows = rowsObj.as<sol::table>();
    sol::object rowObj = treeRows[actions.selectIndex];
    if (!rowObj.valid() || !rowObj.is<sol::table>()) {
        return;
    }

    sol::table row = rowObj.as<sol::table>();
    sol::object canvasObj = row["canvas"];
    sol::object selectedCanvasObj = shell["selectedWidget"];
    if (!canvasObj.valid() || canvasObj == selectedCanvasObj) {
        return;
    }

    sol::protected_function selectWidget = shell["selectWidget"];
    if (!selectWidget.valid()) {
        return;
    }

    sol::protected_function_result result = selectWidget(shell, canvasObj, true);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "BehaviorCoreEditor: shell.selectWidget failed: %s\n",
                     err.what());
    }
}

inline void applyInspectorActions(sol::table& shell,
                           const ImGuiInspectorHost::ActionRequests& actions) {
    if (actions.selectRowIndex > 0) {
        sol::object rowsObj = shell["inspectorRows"];
        if (rowsObj.valid() && rowsObj.is<sol::table>()) {
            sol::table inspectorRows = rowsObj.as<sol::table>();
            sol::object rowObj = inspectorRows[actions.selectRowIndex];
            if (rowObj.valid() && rowObj.is<sol::table>()) {
                sol::table row = rowObj.as<sol::table>();
                sol::protected_function showEditor = shell["_showActivePropertyEditor"];
                if (showEditor.valid()) {
                    sol::protected_function_result result = showEditor(shell, row);
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "BehaviorCoreEditor: shell._showActivePropertyEditor failed: %s\n",
                                     err.what());
                    }
                }
            }
        }
    }

    if (actions.setBoundsX) {
        invokeShellMethodWithStringAndInt(shell, "applyBoundsEditor", "x", actions.boundsX);
    }
    if (actions.setBoundsY) {
        invokeShellMethodWithStringAndInt(shell, "applyBoundsEditor", "y", actions.boundsY);
    }
    if (actions.setBoundsW) {
        invokeShellMethodWithStringAndInt(shell, "applyBoundsEditor", "w", actions.boundsW);
    }
    if (actions.setBoundsH) {
        invokeShellMethodWithStringAndInt(shell, "applyBoundsEditor", "h", actions.boundsH);
    }

    if (actions.applyNumber) {
        applyActiveConfigValue(shell, actions.numberValue, "number");
    }
    if (actions.applyBool) {
        applyActiveConfigValue(shell, actions.boolValue, "bool");
    }
    if (actions.applyText) {
        applyActiveConfigValue(shell, actions.textValue, "text");
    }
    if (actions.applyColor) {
        applyActiveConfigValue(shell, static_cast<double>(actions.colorValue), "color");
    }
    if (actions.applyEnumIndex > 0) {
        sol::protected_function fn = shell["applyActiveConfigEnumChoice"];
        if (fn.valid()) {
            sol::protected_function_result result = fn(shell, actions.applyEnumIndex);
            if (!result.valid()) {
                sol::error err = result;
                std::fprintf(stderr, "BehaviorCoreEditor: shell.applyActiveConfigEnumChoice failed: %s\n",
                             err.what());
            }
        }
    }
}

inline bool populateMainEditorConfigFromShellTable(sol::table& shell,
                                          sol::object surfacesObj,
                                          const char* surfaceId,
                                          const char* tableKey,
                                          HostConfig& mainConfig) {
    HostConfig candidate;
    editor_perf::readSurfaceDescriptor(surfacesObj, surfaceId, candidate.visible, candidate.bounds);
    if (!candidate.visible || candidate.bounds.getWidth() <= 0 || candidate.bounds.getHeight() <= 0) {
        return false;
    }

    sol::object editorObj = shell[tableKey];
    if (!editorObj.valid() || !editorObj.is<sol::table>()) {
        return false;
    }

    sol::table editorState = editorObj.as<sol::table>();
    const std::string path = editorState["path"].get_or(std::string{});
    if (path.empty()) {
        return false;
    }

    candidate.file = juce::File(path);
    candidate.text = editorState["text"].get_or(std::string{});
    candidate.syncToken = editorState["syncToken"].get_or(int64_t{0});
    candidate.readOnly = false;
    mainConfig = std::move(candidate);
    return true;
}

inline void buildMainEditorConfig(sol::table& shell,
                           sol::object surfacesObj,
                           HostConfig& mainConfig) {
    if (populateMainEditorConfigFromShellTable(shell, surfacesObj,
                                               "projectScriptEditor",
                                               "projectScriptEditor",
                                               mainConfig)) {
        return;
    }

    populateMainEditorConfigFromShellTable(shell, surfacesObj,
                                           "mainScriptEditor",
                                           "scriptEditor",
                                           mainConfig);
}

inline void buildHierarchyAndInspectorConfig(sol::state& lua,
                                      sol::table& shell,
                                      sol::object surfacesObj,
                                      HierarchyHostConfig& hierarchyConfig,
                                      InspectorHostConfig& inspectorConfig) {
    editor_perf::readSurfaceDescriptor(surfacesObj, "hierarchyTool", hierarchyConfig.visible, hierarchyConfig.bounds);
    if (!hierarchyConfig.visible || hierarchyConfig.bounds.getWidth() <= 0 || hierarchyConfig.bounds.getHeight() <= 0) {
        return;
    }

    sol::object rowsObj = shell["treeRows"];
    if (rowsObj.valid() && rowsObj.is<sol::table>()) {
        sol::table treeRows = rowsObj.as<sol::table>();
        sol::object selectedCanvasObj = shell["selectedWidget"];
        const auto rowCount = treeRows.size();
        std::vector<HierarchyTreeRowData> rowData;
        rowData.reserve(rowCount);
        for (std::size_t i = 1; i <= rowCount; ++i) {
            sol::object rowObj = treeRows[i];
            if (!rowObj.valid() || !rowObj.is<sol::table>()) {
                continue;
            }
            sol::table row = rowObj.as<sol::table>();
            sol::object rowCanvasObj = row["canvas"];

            HierarchyTreeRowData nextRow;
            nextRow.depth = row["depth"].get_or(0);
            nextRow.type = row["type"].get_or(std::string{});
            nextRow.name = row["name"].get_or(std::string{});
            nextRow.path = row["path"].get_or(std::string{});
            nextRow.selected = selectedCanvasObj.valid() && rowCanvasObj.valid()
                && selectedCanvasObj == rowCanvasObj;
            rowData.push_back(std::move(nextRow));
        }
        hierarchyConfig.rows = buildHierarchyHostRows(rowData);
    }

    editor_perf::readSurfaceDescriptor(surfacesObj, "inspectorTool", inspectorConfig.visible, inspectorConfig.bounds);
    if (inspectorConfig.visible && inspectorConfig.bounds.getWidth() > 0 && inspectorConfig.bounds.getHeight() > 0) {
        sol::protected_function getSelectionBounds = shell["getSelectionBounds"];
        if (getSelectionBounds.valid()) {
            sol::protected_function_result result = getSelectionBounds(shell);
            if (result.valid()) {
                sol::object boundsObj = result;
                if (boundsObj.valid() && boundsObj.is<sol::table>()) {
                    sol::table selectionBounds = boundsObj.as<sol::table>();
                    inspectorConfig.selectionBounds.enabled = true;
                    inspectorConfig.selectionBounds.x = selectionBounds["x"].get_or(0);
                    inspectorConfig.selectionBounds.y = selectionBounds["y"].get_or(0);
                    inspectorConfig.selectionBounds.w = selectionBounds["w"].get_or(1);
                    inspectorConfig.selectionBounds.h = selectionBounds["h"].get_or(1);
                }
            }
        }

        sol::object inspectorRowsObj = shell["inspectorRows"];
        sol::object activePropertyObj = shell["activeConfigProperty"];
        std::string activePath;
        if (activePropertyObj.valid() && activePropertyObj.is<sol::table>()) {
            sol::table activeProperty = activePropertyObj.as<sol::table>();
            inspectorConfig.activeProperty.valid = true;
            inspectorConfig.activeProperty.key = activeProperty["key"].get_or(std::string{});
            inspectorConfig.activeProperty.path = activeProperty["path"].get_or(std::string{});
            inspectorConfig.activeProperty.editorType = activeProperty["editorType"].get_or(std::string{});
            inspectorConfig.activeProperty.displayValue = activeProperty["value"].get_or(std::string{});
            inspectorConfig.activeProperty.mixed = activeProperty["mixed"].get_or(false);
            activePath = inspectorConfig.activeProperty.path;

            sol::object rawValueObj = activeProperty["rawValue"];
            if (rawValueObj.is<double>()) {
                inspectorConfig.activeProperty.numberValue = rawValueObj.as<double>();
                inspectorConfig.activeProperty.colorValue = static_cast<std::uint32_t>(rawValueObj.as<double>());
            } else if (rawValueObj.is<bool>()) {
                inspectorConfig.activeProperty.boolValue = rawValueObj.as<bool>();
            } else if (rawValueObj.is<std::string>()) {
                inspectorConfig.activeProperty.textValue = rawValueObj.as<std::string>();
            }
            if (inspectorConfig.activeProperty.editorType == "text") {
                inspectorConfig.activeProperty.textValue = rawValueObj.is<std::string>()
                    ? rawValueObj.as<std::string>()
                    : std::string{};
            }
            sol::object minObj = activeProperty["min"];
            sol::object maxObj = activeProperty["max"];
            sol::object stepObj = activeProperty["step"];
            inspectorConfig.activeProperty.hasMin = minObj.valid() && minObj.is<double>();
            inspectorConfig.activeProperty.hasMax = maxObj.valid() && maxObj.is<double>();
            if (inspectorConfig.activeProperty.hasMin) {
                inspectorConfig.activeProperty.minValue = minObj.as<double>();
            }
            if (inspectorConfig.activeProperty.hasMax) {
                inspectorConfig.activeProperty.maxValue = maxObj.as<double>();
            }
            inspectorConfig.activeProperty.stepValue = stepObj.valid() && stepObj.is<double>()
                ? stepObj.as<double>()
                : 0.0;

            sol::object enumOptionsObj = activeProperty["enumOptions"];
            if (enumOptionsObj.valid() && enumOptionsObj.is<sol::table>()) {
                sol::table enumOptions = enumOptionsObj.as<sol::table>();
                sol::object rawValue = activeProperty["rawValue"];
                const auto optionCount = enumOptions.size();
                std::vector<bool> enumMatches;
                enumMatches.reserve(optionCount);
                for (std::size_t optionIndex = 1; optionIndex <= optionCount; ++optionIndex) {
                    sol::object optionObj = enumOptions[optionIndex];
                    if (!optionObj.valid() || !optionObj.is<sol::table>()) {
                        continue;
                    }
                    sol::table option = optionObj.as<sol::table>();
                    inspectorConfig.activeProperty.enumLabels.push_back(option["label"].get_or(std::string{}));
                    sol::object optionValue = option["value"];
                    bool matches = false;
                    if (rawValue.get_type() == optionValue.get_type()) {
                        if (rawValue.is<bool>()) {
                            matches = rawValue.as<bool>() == optionValue.as<bool>();
                        } else if (rawValue.is<double>()) {
                            matches = std::abs(rawValue.as<double>() - optionValue.as<double>()) < 1.0e-9;
                        } else if (rawValue.is<std::string>()) {
                            matches = rawValue.as<std::string>() == optionValue.as<std::string>();
                        }
                    }
                    enumMatches.push_back(matches);
                }
                inspectorConfig.activeProperty.enumSelectedIndex = resolveInspectorEnumSelectedIndex(
                    enumMatches,
                    inspectorConfig.activeProperty.enumSelectedIndex);
            }
        }

        if (inspectorRowsObj.valid() && inspectorRowsObj.is<sol::table>()) {
            sol::table inspectorRows = inspectorRowsObj.as<sol::table>();
            const auto inspectorRowCount = inspectorRows.size();
            std::vector<InspectorRowData> rowData;
            rowData.reserve(inspectorRowCount);
            for (std::size_t i = 1; i <= inspectorRowCount; ++i) {
                sol::object rowObj = inspectorRows[i];
                if (!rowObj.valid() || !rowObj.is<sol::table>()) {
                    continue;
                }
                sol::table row = rowObj.as<sol::table>();
                InspectorRowData nextRow;
                nextRow.isConfig = row["isConfig"].get_or(false);
                nextRow.key = row["key"].get_or(std::string{});
                nextRow.value = row["value"].get_or(std::string{});
                nextRow.path = row["path"].get_or(std::string{});
                rowData.push_back(std::move(nextRow));
            }
            inspectorConfig.rows = buildInspectorHostRows(rowData, activePath);
        }

        lua["__manifoldImguiInspectorActive"] = true;
    }

    lua["__manifoldImguiHierarchyActive"] = true;
}

inline void buildScriptListConfig(sol::state& lua,
                           sol::table& shell,
                           sol::object surfacesObj,
                           ScriptListHostConfig& scriptListConfig) {
    editor_perf::readSurfaceDescriptor(surfacesObj, "scriptList", scriptListConfig.visible, scriptListConfig.bounds);
    if (!scriptListConfig.visible || scriptListConfig.bounds.getWidth() <= 0 || scriptListConfig.bounds.getHeight() <= 0) {
        return;
    }

    sol::object rowsObj = shell["scriptRows"];
    if (rowsObj.valid() && rowsObj.is<sol::table>()) {
        sol::table scriptRows = rowsObj.as<sol::table>();
        const std::string selectedPath = [&]() {
            sol::object selectedObj = shell["selectedScriptRow"];
            if (!selectedObj.valid() || !selectedObj.is<sol::table>()) {
                return std::string{};
            }
            sol::table selectedRow = selectedObj.as<sol::table>();
            return selectedRow["path"].get_or(std::string{});
        }();
        const std::string selectedKind = [&]() {
            sol::object selectedObj = shell["selectedScriptRow"];
            if (!selectedObj.valid() || !selectedObj.is<sol::table>()) {
                return std::string{};
            }
            sol::table selectedRow = selectedObj.as<sol::table>();
            return selectedRow["kind"].get_or(std::string{});
        }();

        const auto rowCount = scriptRows.size();
        scriptListConfig.rows.reserve(rowCount);
        for (std::size_t i = 1; i <= rowCount; ++i) {
            sol::object rowObj = scriptRows[i];
            if (!rowObj.valid() || !rowObj.is<sol::table>()) {
                continue;
            }
            sol::table row = rowObj.as<sol::table>();
            ImGuiScriptListHost::ScriptRow hostRow;
            hostRow.section = row["section"].get_or(false);
            hostRow.nonInteractive = row["nonInteractive"].get_or(false);
            hostRow.active = row["active"].get_or(false);
            hostRow.dirty = row["dirty"].get_or(false);
            hostRow.kind = row["kind"].get_or(std::string{});
            hostRow.ownership = row["ownership"].get_or(std::string{});
            hostRow.path = row["path"].get_or(std::string{});
            hostRow.name = row["name"].get_or(std::string{});
            hostRow.label = row["label"].get_or(std::string{});
            hostRow.selected = (!selectedPath.empty()
                && hostRow.path == selectedPath
                && hostRow.kind == selectedKind);
            scriptListConfig.rows.push_back(std::move(hostRow));
        }
    }

    lua["__manifoldImguiScriptListActive"] = true;
}

inline void buildScriptInspectorConfig(sol::state& lua,
                                sol::table& shell,
                                sol::object surfacesObj,
                                const std::string& shellMode,
                                const std::string& leftPanelMode,
                                InspectorHostConfig& scriptInspectorConfig) {
    if (shellMode != "edit" || leftPanelMode != "scripts") {
        return;
    }

    editor_perf::readSurfaceDescriptor(surfacesObj, "scriptInspectorTool", scriptInspectorConfig.visible, scriptInspectorConfig.bounds);
    sol::object scriptInspectorObj = shell["scriptInspector"];
    if (!scriptInspectorConfig.visible
        || scriptInspectorConfig.bounds.getWidth() <= 0
        || scriptInspectorConfig.bounds.getHeight() <= 0
        || !scriptInspectorObj.valid()
        || !scriptInspectorObj.is<sol::table>()) {
        return;
    }

    sol::table scriptInspector = scriptInspectorObj.as<sol::table>();
    scriptInspectorConfig.scriptMode = true;

    const std::string path = scriptInspector["path"].get_or(std::string{});
    scriptInspectorConfig.scriptData.hasSelection = !path.empty();
    scriptInspectorConfig.scriptData.name = scriptInspector["name"].get_or(std::string{});
    scriptInspectorConfig.scriptData.kind = scriptInspector["kind"].get_or(std::string{});
    scriptInspectorConfig.scriptData.ownership = scriptInspector["ownership"].get_or(std::string{});
    scriptInspectorConfig.scriptData.path = path;
    scriptInspectorConfig.scriptData.text = scriptInspector["text"].get_or(std::string{});
    scriptInspectorConfig.scriptData.syncToken = scriptInspector["syncToken"].get_or(int64_t{0});
    scriptInspectorConfig.scriptData.inlineReadOnly = true;
    scriptInspectorConfig.scriptData.runtimeStatus = scriptInspector["runtimeStatus"].get_or(std::string{});
    scriptInspectorConfig.scriptData.editorCollapsed = scriptInspector["editorCollapsed"].get_or(false);
    scriptInspectorConfig.scriptData.graphCollapsed = scriptInspector["graphCollapsed"].get_or(false);
    scriptInspectorConfig.scriptData.graphPanX = scriptInspector["graphPanX"].get_or(0);
    scriptInspectorConfig.scriptData.graphPanY = scriptInspector["graphPanY"].get_or(0);

    if (!path.empty()) {
        sol::protected_function getDocumentStatus = shell["getStructuredDocumentStatus"];
        if (getDocumentStatus.valid()) {
            sol::protected_function_result result = getDocumentStatus(shell, path);
            if (result.valid()) {
                sol::object statusObj = result;
                if (statusObj.valid() && statusObj.is<sol::table>()) {
                    sol::table status = statusObj.as<sol::table>();
                    scriptInspectorConfig.scriptData.hasStructuredStatus = true;
                    scriptInspectorConfig.scriptData.structuredDirty = status["dirty"].get_or(false);
                }
            }
        }
    }

    sol::protected_function getProjectStatus = shell["getStructuredProjectStatus"];
    if (getProjectStatus.valid()) {
        sol::protected_function_result result = getProjectStatus(shell);
        if (result.valid()) {
            sol::object statusObj = result;
            if (statusObj.valid() && statusObj.is<sol::table>()) {
                sol::table status = statusObj.as<sol::table>();
                scriptInspectorConfig.scriptData.projectLastError = status["lastError"].get_or(std::string{});
            }
        }
    }

    sol::object paramsObj = scriptInspector["params"];
    if (paramsObj.valid() && paramsObj.is<sol::table>()) {
        sol::table params = paramsObj.as<sol::table>();
        const auto count = params.size();
        scriptInspectorConfig.scriptData.declaredParams.reserve(count);
        for (std::size_t i = 1; i <= count; ++i) {
            sol::object paramObj = params[i];
            if (!paramObj.valid() || !paramObj.is<sol::table>()) {
                continue;
            }
            sol::table param = paramObj.as<sol::table>();
            ImGuiInspectorHost::DeclaredParam hostParam;
            hostParam.path = param["path"].get_or(std::string{});
            sol::object defaultObj = param["default"];
            if (defaultObj.valid()) {
                if (defaultObj.is<double>()) {
                    hostParam.defaultValue = juce::String(defaultObj.as<double>()).toStdString();
                } else if (defaultObj.is<bool>()) {
                    hostParam.defaultValue = defaultObj.as<bool>() ? "true" : "false";
                } else if (defaultObj.is<std::string>()) {
                    hostParam.defaultValue = defaultObj.as<std::string>();
                }
            }
            scriptInspectorConfig.scriptData.declaredParams.push_back(std::move(hostParam));
        }
    }

    sol::object runtimeParamsObj = scriptInspector["runtimeParams"];
    if (runtimeParamsObj.valid() && runtimeParamsObj.is<sol::table>()) {
        sol::table runtimeParams = runtimeParamsObj.as<sol::table>();
        const auto count = runtimeParams.size();
        scriptInspectorConfig.scriptData.runtimeParams.reserve(count);
        for (std::size_t i = 1; i <= count; ++i) {
            sol::object paramObj = runtimeParams[i];
            if (!paramObj.valid() || !paramObj.is<sol::table>()) {
                continue;
            }
            sol::table param = paramObj.as<sol::table>();
            ImGuiInspectorHost::RuntimeParam hostParam;
            hostParam.endpointPath = param["endpointPath"].get_or(param["path"].get_or(std::string{}));
            hostParam.path = param["path"].get_or(std::string{});
            hostParam.displayValue = param["value"].get_or(std::string{});
            hostParam.active = param["active"].get_or(false);
            sol::object numericValueObj = param["numericValue"];
            if (numericValueObj.valid() && numericValueObj.is<double>()) {
                hostParam.hasValue = true;
                hostParam.value = numericValueObj.as<double>();
            } else {
                sol::object textValueObj = param["value"];
                if (textValueObj.valid() && textValueObj.is<std::string>()) {
                    const auto parsed = juce::String(textValueObj.as<std::string>()).getDoubleValue();
                    hostParam.value = parsed;
                }
            }
            sol::object minObj = param["min"];
            sol::object maxObj = param["max"];
            sol::object stepObj = param["step"];
            hostParam.hasMin = minObj.valid() && minObj.is<double>();
            hostParam.hasMax = maxObj.valid() && maxObj.is<double>();
            if (hostParam.hasMin) {
                hostParam.minValue = minObj.as<double>();
            }
            if (hostParam.hasMax) {
                hostParam.maxValue = maxObj.as<double>();
            }
            if (stepObj.valid() && stepObj.is<double>()) {
                hostParam.stepValue = stepObj.as<double>();
            }
            scriptInspectorConfig.scriptData.runtimeParams.push_back(std::move(hostParam));
        }
    }

    sol::object graphObj = scriptInspector["graph"];
    if (graphObj.valid() && graphObj.is<sol::table>()) {
        sol::table graph = graphObj.as<sol::table>();
        sol::object nodesObj = graph["nodes"];
        sol::object edgesObj = graph["edges"];
        if (nodesObj.valid() && nodesObj.is<sol::table>()) {
            sol::table nodes = nodesObj.as<sol::table>();
            const auto count = nodes.size();
            scriptInspectorConfig.scriptData.graphNodes.reserve(count);
            for (std::size_t i = 1; i <= count; ++i) {
                sol::object nodeObj = nodes[i];
                if (!nodeObj.valid() || !nodeObj.is<sol::table>()) {
                    continue;
                }
                sol::table node = nodeObj.as<sol::table>();
                ImGuiInspectorHost::GraphNode hostNode;
                hostNode.var = node["var"].get_or(std::string{"n"});
                hostNode.prim = node["prim"].get_or(std::string{"node"});
                scriptInspectorConfig.scriptData.graphNodes.push_back(std::move(hostNode));
            }
        }
        if (edgesObj.valid() && edgesObj.is<sol::table>()) {
            sol::table edges = edgesObj.as<sol::table>();
            const auto count = edges.size();
            scriptInspectorConfig.scriptData.graphEdges.reserve(count);
            for (std::size_t i = 1; i <= count; ++i) {
                sol::object edgeObj = edges[i];
                if (!edgeObj.valid() || !edgeObj.is<sol::table>()) {
                    continue;
                }
                sol::table edge = edgeObj.as<sol::table>();
                ImGuiInspectorHost::GraphEdge hostEdge;
                hostEdge.fromIndex = edge["from"].get_or(0);
                hostEdge.toIndex = edge["to"].get_or(0);
                scriptInspectorConfig.scriptData.graphEdges.push_back(std::move(hostEdge));
            }
        }
    }

    lua["__manifoldImguiInspectorActive"] = true;
}

inline void buildPerfOverlayConfig(LuaEngine& luaEngine,
                            sol::state& lua,
                            sol::table& shell,
                            HostConfig const& mainConfig,
                            ScriptListHostConfig const& scriptListConfig,
                            HierarchyHostConfig const& hierarchyConfig,
                            InspectorHostConfig const& inspectorConfig,
                            const std::string& rendererModeLabel,
                            PerfOverlayHostConfig& perfOverlayConfig) {
    sol::object perfOverlayObj = shell["perfOverlay"];
    if (!perfOverlayObj.valid() || !perfOverlayObj.is<sol::table>()) {
        return;
    }

    sol::table perfOverlay = perfOverlayObj.as<sol::table>();
    perfOverlayConfig.snapshot.activeTab = perfOverlay["activeTab"].get_or(std::string{"frame"});

    sol::object perfSurfacesObj = shell["surfaces"];
    if (perfSurfacesObj.valid() && perfSurfacesObj.is<sol::table>()) {
        sol::table surfaces = perfSurfacesObj.as<sol::table>();
        sol::object perfSurfaceObj = surfaces["perfOverlay"];
        if (perfSurfaceObj.valid() && perfSurfaceObj.is<sol::table>()) {
            sol::table perfSurface = perfSurfaceObj.as<sol::table>();
            perfOverlayConfig.visible = perfSurface["visible"].get_or(false);
            perfOverlayConfig.snapshot.title = perfSurface["title"].get_or(std::string{"Performance"});

            sol::object boundsObj = perfSurface["bounds"];
            if (boundsObj.valid() && boundsObj.is<sol::table>()) {
                sol::table bounds = boundsObj.as<sol::table>();
                perfOverlayConfig.bounds = juce::Rectangle<int>(
                    bounds["x"].get_or(0),
                    bounds["y"].get_or(0),
                    std::max(0, bounds["w"].get_or(0)),
                    std::max(0, bounds["h"].get_or(0)));
            }
        }
    }

    auto addTab = [&](const std::string& id, const std::string& label) -> ImGuiPerfOverlayHost::TabData& {
        perfOverlayConfig.snapshot.tabs.push_back(ImGuiPerfOverlayHost::TabData{});
        auto& tab = perfOverlayConfig.snapshot.tabs.back();
        tab.id = id;
        tab.label = label;
        return tab;
    };
    auto addRow = [](ImGuiPerfOverlayHost::TabData& tab, const std::string& label, const std::string& value) {
        tab.rows.push_back(ImGuiPerfOverlayHost::MetricRow{label, value});
    };
    auto boolText = [](bool v) { return v ? std::string{"yes"} : std::string{"no"}; };
    auto usText = [](int64_t v) { return std::to_string(static_cast<long long>(v)) + " us"; };
    auto msText = [](double v) {
        char buf[64];
        std::snprintf(buf, sizeof(buf), "%.3f ms", v);
        return std::string(buf);
    };

    auto& frameTab = addTab("frame", "Frame");
    addRow(frameTab, "Frame count", std::to_string(static_cast<long long>(luaEngine.frameTimings.frameCount.load(std::memory_order_relaxed))));
    addRow(frameTab, "Total current", usText(luaEngine.frameTimings.total.currentUs.load(std::memory_order_relaxed)));
    addRow(frameTab, "Total avg", usText(luaEngine.frameTimings.total.getAvgUs()));
    addRow(frameTab, "Total peak", usText(luaEngine.frameTimings.total.peakUs.load(std::memory_order_relaxed)));
    addRow(frameTab, "Push state", usText(luaEngine.frameTimings.pushState.currentUs.load(std::memory_order_relaxed)));
    addRow(frameTab, "Event listeners", usText(luaEngine.frameTimings.eventListeners.currentUs.load(std::memory_order_relaxed)));
    addRow(frameTab, "UI update", usText(luaEngine.frameTimings.uiUpdate.currentUs.load(std::memory_order_relaxed)));
    addRow(frameTab, "Paint", usText(luaEngine.frameTimings.paint.currentUs.load(std::memory_order_relaxed)));

    auto& imguiTab = addTab("imgui", "ImGui");
    addRow(imguiTab, "Context ready", boolText(luaEngine.frameTimings.imguiContextReady.load(std::memory_order_relaxed)));
    addRow(imguiTab, "Capture mouse", boolText(luaEngine.frameTimings.imguiWantCaptureMouse.load(std::memory_order_relaxed)));
    addRow(imguiTab, "Capture keyboard", boolText(luaEngine.frameTimings.imguiWantCaptureKeyboard.load(std::memory_order_relaxed)));
    addRow(imguiTab, "Render", usText(luaEngine.frameTimings.imguiRenderUs.load(std::memory_order_relaxed)));
    addRow(imguiTab, "Vertices", std::to_string(static_cast<long long>(luaEngine.frameTimings.imguiVertexCount.load(std::memory_order_relaxed))));
    addRow(imguiTab, "Indices", std::to_string(static_cast<long long>(luaEngine.frameTimings.imguiIndexCount.load(std::memory_order_relaxed))));
    addRow(imguiTab, "Document loaded", boolText(luaEngine.frameTimings.imguiDocumentLoaded.load(std::memory_order_relaxed)));
    addRow(imguiTab, "Document dirty", boolText(luaEngine.frameTimings.imguiDocumentDirty.load(std::memory_order_relaxed)));
    addRow(imguiTab, "Document lines", std::to_string(static_cast<long long>(luaEngine.frameTimings.imguiDocumentLineCount.load(std::memory_order_relaxed))));

    auto& editorTab = addTab("editor", "Editor");
    sol::object editorPerfObj = lua["__manifoldEditorPerf"];
    if (editorPerfObj.valid() && editorPerfObj.is<sol::table>()) {
        sol::table editorPerf = editorPerfObj.as<sol::table>();
        addRow(editorTab, "Last event", editorPerf["lastEvent"].get_or(std::string{""}));
        addRow(editorTab, "Draw", msText(editorPerf["lastDrawMs"].get_or(0.0)));
        addRow(editorTab, "Draw peak", msText(editorPerf["peakDrawMs"].get_or(0.0)));
        addRow(editorTab, "Line build", msText(editorPerf["lastLineBuildMs"].get_or(0.0)));
        addRow(editorTab, "Cursor lookup", msText(editorPerf["lastCursorLookupMs"].get_or(0.0)));
        addRow(editorTab, "Post cursor", msText(editorPerf["lastPostCursorMs"].get_or(0.0)));
        addRow(editorTab, "Wheel", msText(editorPerf["lastWheelMs"].get_or(0.0)));
        addRow(editorTab, "Wheel peak", msText(editorPerf["peakWheelMs"].get_or(0.0)));
        addRow(editorTab, "Keypress", msText(editorPerf["lastKeypressMs"].get_or(0.0)));
        addRow(editorTab, "Keypress peak", msText(editorPerf["peakKeypressMs"].get_or(0.0)));
        addRow(editorTab, "Ensure visible", msText(editorPerf["lastEnsureVisibleMs"].get_or(0.0)));
        addRow(editorTab, "Ensure visible peak", msText(editorPerf["peakEnsureVisibleMs"].get_or(0.0)));
        addRow(editorTab, "Pos from point", msText(editorPerf["lastPosFromPointMs"].get_or(0.0)));
        addRow(editorTab, "Pos from point peak", msText(editorPerf["peakPosFromPointMs"].get_or(0.0)));
        addRow(editorTab, "Visible lines", std::to_string(editorPerf["lastVisibleLines"].get_or(0)));
        addRow(editorTab, "Syntax spans", std::to_string(editorPerf["lastSyntaxSpanCount"].get_or(0)));
        addRow(editorTab, "Syntax draw calls", std::to_string(editorPerf["lastSyntaxDrawCalls"].get_or(0)));
        addRow(editorTab, "Gutter draw calls", std::to_string(editorPerf["lastGutterDrawCalls"].get_or(0)));
        addRow(editorTab, "Text length", std::to_string(editorPerf["lastTextLen"].get_or(0)));
        addRow(editorTab, "Cursor", std::to_string(editorPerf["lastCursorLine"].get_or(0)) + ":" + std::to_string(editorPerf["lastCursorCol"].get_or(0)));
    } else {
        addRow(editorTab, "Status", "No editor metrics available");
    }

    auto& uiTab = addTab("ui", "UI");
    addRow(uiTab, "Renderer", rendererModeLabel);
    addRow(uiTab, "Mode", shell["mode"].get_or(std::string{}));
    addRow(uiTab, "Left panel", shell["leftPanelMode"].get_or(std::string{}));
    addRow(uiTab, "Edit content", shell["editContentMode"].get_or(std::string{}));
    addRow(uiTab, "Total paint accumulated", usText(luaEngine.frameTimings.totalPaintAccumulatedUs.load(std::memory_order_relaxed)));
    addRow(uiTab, "Main editor visible", boolText(mainConfig.visible));
    addRow(uiTab, "Script list visible", boolText(scriptListConfig.visible));
    addRow(uiTab, "Hierarchy visible", boolText(hierarchyConfig.visible));
    addRow(uiTab, "Inspector visible", boolText(inspectorConfig.visible));

    auto& paintTab = addTab("paint", "Paint");
    const auto paintProfile = Canvas::getLastFramePaintProfile(8);
    addRow(paintTab, "Accumulated canvas paint", usText(Canvas::getLastFrameAccumulatedPaintUs()));
    addRow(paintTab, "Tracked canvases", std::to_string(static_cast<long long>(paintProfile.size())));
    if (paintProfile.empty()) {
        addRow(paintTab, "Status", "No canvas paint samples yet");
    } else {
        for (std::size_t i = 0; i < paintProfile.size(); ++i) {
            const auto& sample = paintProfile[i];
            std::string label = "Hot canvas " + std::to_string(static_cast<long long>(i + 1));
            std::string value = sample.name;
            if (!sample.widgetType.empty()) {
                value += " [" + sample.widgetType + "]";
            }
            value += " | total=" + usText(sample.totalUs);
            value += " last=" + usText(sample.lastUs);
            value += " paints=" + std::to_string(sample.paintCount);
            value += " size=" + std::to_string(sample.width) + "x" + std::to_string(sample.height);
            value += sample.openGL ? " | gl" : " | cpu";
            addRow(paintTab, label, value);
        }
    }

    constexpr int kPerfOverlayMinWidth = 560;
    constexpr int kPerfOverlayMinHeight = 520;
    constexpr int kPerfTabWidth = 92;
    constexpr int kPerfTabGap = 6;
    constexpr int kPerfOuterPadding = 10;
    const int tabCount = static_cast<int>(perfOverlayConfig.snapshot.tabs.size());
    const int tabStripWidth = kPerfOuterPadding * 2
        + std::max(0, tabCount) * kPerfTabWidth
        + std::max(0, tabCount - 1) * kPerfTabGap;
    const int minWidth = std::max(kPerfOverlayMinWidth, tabStripWidth + 16);
    perfOverlayConfig.bounds.setWidth(std::max(perfOverlayConfig.bounds.getWidth(), minWidth));
    perfOverlayConfig.bounds.setHeight(std::max(perfOverlayConfig.bounds.getHeight(), kPerfOverlayMinHeight));
}

} // namespace editor_shell