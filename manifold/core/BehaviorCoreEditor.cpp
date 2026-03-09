#include "BehaviorCoreEditor.h"
#include "BehaviorCoreProcessor.h"
#include "../primitives/core/Settings.h"
#include "../primitives/ui/Canvas.h"

#include <sol/sol.hpp>

#include <chrono>
#include <cstdio>
#include <tuple>

namespace {
using PerfClock = std::chrono::steady_clock;

struct HostLayoutTraceState {
    bool initialised = false;
    bool visible = false;
    juce::Rectangle<int> bounds;
};

double perfElapsedMs(PerfClock::time_point start) {
    return std::chrono::duration<double, std::milli>(PerfClock::now() - start).count();
}

void logEditorPerf(const char* label, PerfClock::time_point start, const char* extra = nullptr) {
    juce::ignoreUnused(label, start, extra);
}

void logEditorHostLayout(const char* name, HostLayoutTraceState& state, bool visible,
                         const juce::Rectangle<int>& bounds) {
    juce::ignoreUnused(name, visible, bounds);
    state.initialised = true;
    state.visible = visible;
    state.bounds = bounds;
}
}

BehaviorCoreEditor::BehaviorCoreEditor(BehaviorCoreProcessor& ownerProcessor)
    : juce::AudioProcessorEditor(&ownerProcessor), processorRef(ownerProcessor) {
    setSize(1000, 640);

    addAndMakeVisible(rootCanvas);
    addAndMakeVisible(mainScriptEditorHost);
    addAndMakeVisible(inlineScriptEditorHost);
    addAndMakeVisible(scriptListHost);
    addAndMakeVisible(hierarchyHost);
    addAndMakeVisible(inspectorHost);
    addAndMakeVisible(scriptInspectorHost);
    addAndMakeVisible(perfOverlayHost);
    perfOverlayHost.onTabChanged = [this](const std::string& tabId) {
        luaEngine.withLuaState([tabId](sol::state& L) {
            auto shell = L["_G"]["shell"];
            if (!shell.valid()) {
                return;
            }
            auto perfOverlay = shell["perfOverlay"];
            if (perfOverlay.valid()) {
                perfOverlay["activeTab"] = tabId;
            }
        });
    };
    perfOverlayHost.onClosed = [this]() {
        luaEngine.withLuaState([](sol::state& L) {
            auto shell = L["_G"]["shell"];
            if (!shell.valid()) {
                return;
            }
            auto perfOverlay = shell["perfOverlay"];
            if (perfOverlay.valid()) {
                perfOverlay["visible"] = false;
            }
        });
    };
    mainScriptEditorHost.setVisible(false);
    inlineScriptEditorHost.setVisible(false);
    scriptListHost.setVisible(false);
    hierarchyHost.setVisible(false);
    inspectorHost.setVisible(false);
    scriptInspectorHost.setVisible(false);
    perfOverlayHost.setVisible(false);
    mainScriptEditorHost.toFront(false);
    inlineScriptEditorHost.toFront(false);
    scriptListHost.toFront(false);
    hierarchyHost.toFront(false);
    inspectorHost.toFront(false);
    scriptInspectorHost.toFront(false);
    perfOverlayHost.toFront(false);

    luaEngine.initialise(&processorRef, &rootCanvas);
    processorRef.getControlServer().setFrameTimings(&luaEngine.frameTimings);
    processorRef.getControlServer().setLuaEngine(&luaEngine);

    auto& settings = Settings::getInstance();
    const auto settingsScript = settings.getDefaultUiScript();
    if (settingsScript.isEmpty()) {
        std::fprintf(stderr,
                     "BehaviorCoreEditor: settings.defaultUiScript is empty; refusing to fall back\n");
        showError("Settings error:\ndefaultUiScript is empty.\n"
                  "Configure it in: " + settings.getConfigPath().toStdString());
    } else {
        const juce::File scriptFile(settingsScript);
        if (!scriptFile.existsAsFile()) {
            std::fprintf(stderr,
                         "BehaviorCoreEditor: configured UI script does not exist: %s\n"
                         "  -> Configure defaultUiScript in .manifold.settings.json in the repo root.\n",
                         settingsScript.toRawUTF8());
            showError("Settings error:\nconfigured defaultUiScript does not exist:\n" +
                      settingsScript.toStdString() +
                      "\n\nConfigure in .manifold.settings.json in the repo root.");
        } else {
            usingLuaUi = luaEngine.loadScript(scriptFile);
            if (usingLuaUi) {
                std::fprintf(stderr, "BehaviorCoreEditor: Using Lua UI from %s\n",
                             scriptFile.getFullPathName().toRawUTF8());
            } else {
                std::fprintf(stderr, "BehaviorCoreEditor: Lua script failed: %s\n",
                             luaEngine.getLastError().c_str());
                showError("Lua UI failed to load:\n" + luaEngine.getLastError());
            }
        }
    }

    startTimerHz(30);
    resized();
}

BehaviorCoreEditor::~BehaviorCoreEditor() {
    stopTimer();
    processorRef.getControlServer().setLuaEngine(nullptr);
    processorRef.getControlServer().setFrameTimings(nullptr);
}

void BehaviorCoreEditor::applyDeferredVisibilityChanges() {
    if (deferredVisibilityChanges.empty()) return;
    
    const auto applyStart = PerfClock::now();
    for (const auto& change : deferredVisibilityChanges) {
        if (change.host) {
            change.host->setVisible(change.visible);
            change.host->setBounds(change.bounds);
            if (change.visible) {
                change.host->toFront(false);
            }
        }
    }
    auto count = deferredVisibilityChanges.size();
    deferredVisibilityChanges.clear();
    std::string extra = std::to_string(count) + " hosts";
    logEditorPerf("applyDeferredVisibilityChanges", applyStart, extra.c_str());
}

void BehaviorCoreEditor::timerCallback() {
    using Clock = std::chrono::steady_clock;
    static auto lastCall = Clock::now();
    const auto now = Clock::now();
    const auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(now - lastCall).count();
    lastCall = now;

    static int logCount = 0;
    const auto timerStart = Clock::now();
    
    // Apply any deferred visibility changes first (outside of GUI event handling)
    applyDeferredVisibilityChanges();

    auto pendingPath = processorRef.getAndClearPendingUISwitch();
    if (!pendingPath.empty()) {
        juce::File newScript(pendingPath);
        if (newScript.existsAsFile()) {
            std::fprintf(stderr, "BehaviorCoreEditor: Switching UI to %s\n",
                         pendingPath.c_str());
            luaEngine.switchScript(newScript);
        } else {
            std::fprintf(stderr,
                         "BehaviorCoreEditor: UI switch failed - file not found: %s\n",
                         pendingPath.c_str());
        }
    }

    processorRef.processLinkPendingRequests();
    processorRef.drainPendingSlotDestroy();

    if (usingLuaUi) {
        luaEngine.notifyUpdate();
        syncImGuiHostsFromLuaShell();
        rootCanvas.repaint();

        const int64_t totalUs = std::chrono::duration_cast<std::chrono::microseconds>(
            Clock::now() - timerStart).count();
        const int64_t pushStateUs =
            luaEngine.frameTimings.pushState.currentUs.load(std::memory_order_relaxed);
        const int64_t eventListenersUs =
            luaEngine.frameTimings.eventListeners.currentUs.load(std::memory_order_relaxed);
        const int64_t uiUpdateUs =
            luaEngine.frameTimings.uiUpdate.currentUs.load(std::memory_order_relaxed);
        const int64_t paintUs =
            rootCanvas.lastPaintDurationUs.load(std::memory_order_relaxed);

        auto imguiStats = mainScriptEditorHost.getStatsSnapshot();
        if (!imguiStats.testWindowVisible) {
            imguiStats = inlineScriptEditorHost.getStatsSnapshot();
        }

        luaEngine.frameTimings.imguiContextReady.store(imguiStats.contextReady,
                                                       std::memory_order_relaxed);
        luaEngine.frameTimings.imguiTestWindowVisible.store(imguiStats.testWindowVisible,
                                                            std::memory_order_relaxed);
        luaEngine.frameTimings.imguiWantCaptureMouse.store(imguiStats.wantCaptureMouse,
                                                           std::memory_order_relaxed);
        luaEngine.frameTimings.imguiWantCaptureKeyboard.store(imguiStats.wantCaptureKeyboard,
                                                              std::memory_order_relaxed);
        luaEngine.frameTimings.imguiFrameCount.store(imguiStats.frameCount,
                                                     std::memory_order_relaxed);
        luaEngine.frameTimings.imguiRenderUs.store(imguiStats.lastRenderUs,
                                                   std::memory_order_relaxed);
        luaEngine.frameTimings.imguiVertexCount.store(imguiStats.lastVertexCount,
                                                      std::memory_order_relaxed);
        luaEngine.frameTimings.imguiIndexCount.store(imguiStats.lastIndexCount,
                                                     std::memory_order_relaxed);
        luaEngine.frameTimings.imguiButtonClicks.store(imguiStats.buttonClicks,
                                                       std::memory_order_relaxed);
        luaEngine.frameTimings.imguiDocumentLoaded.store(imguiStats.documentLoaded,
                                                         std::memory_order_relaxed);
        luaEngine.frameTimings.imguiDocumentDirty.store(imguiStats.documentDirty,
                                                        std::memory_order_relaxed);
        luaEngine.frameTimings.imguiDocumentLineCount.store(imguiStats.documentLineCount,
                                                            std::memory_order_relaxed);

        luaEngine.frameTimings.update(totalUs, pushStateUs, eventListenersUs,
                                      uiUpdateUs, paintUs);

        juce::ignoreUnused(logCount, elapsed);
    }
}

void BehaviorCoreEditor::paint(juce::Graphics& g) {
    juce::ignoreUnused(processorRef);

    juce::ColourGradient bg(juce::Colour(0xff161b26), 0.0f, 0.0f,
                            juce::Colour(0xff0c1019), 0.0f, (float)getHeight(), false);
    bg.addColour(0.35, juce::Colour(0xff1e2533));
    g.setGradientFill(bg);
    g.fillAll();
}

void BehaviorCoreEditor::syncImGuiHostsFromLuaShell() {
    const auto totalStart = PerfClock::now();
    static HostLayoutTraceState mainScriptHostTrace;
    static HostLayoutTraceState inlineScriptHostTrace;
    static HostLayoutTraceState scriptListHostTrace;
    static HostLayoutTraceState hierarchyHostTrace;
    static HostLayoutTraceState inspectorHostTrace;
    static HostLayoutTraceState scriptInspectorHostTrace;

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

    const auto mainStatsBefore = mainScriptEditorHost.getStatsSnapshot();
    const auto inlineStatsBefore = inlineScriptEditorHost.getStatsSnapshot();
    const auto mainIdentityBefore = mainScriptEditorHost.getDocumentIdentity();
    const auto inlineIdentityBefore = inlineScriptEditorHost.getDocumentIdentity();
    const auto scriptInspectorLayoutBefore = scriptInspectorHost.getLayoutSnapshot();
    const auto mainTextBefore = mainScriptEditorHost.getCurrentText();
    const auto inlineTextBefore = inlineScriptEditorHost.getCurrentText();
    const auto mainActions = mainScriptEditorHost.consumeActionRequests();
    const auto inlineActions = inlineScriptEditorHost.consumeActionRequests();
    const auto scriptListActions = scriptListHost.consumeActionRequests();
    const auto hierarchyActions = hierarchyHost.consumeActionRequests();
    const auto inspectorActions = inspectorHost.consumeActionRequests();
    const auto scriptInspectorActions = scriptInspectorHost.consumeActionRequests();

    HostConfig mainConfig;
    HostConfig inlineConfig;
    ScriptListHostConfig scriptListConfig;
    HierarchyHostConfig hierarchyConfig;
    InspectorHostConfig inspectorConfig;
    InspectorHostConfig scriptInspectorConfig;
    PerfOverlayHostConfig perfOverlayConfig;

    const auto luaStateStart = PerfClock::now();
    luaEngine.withLuaState([&](sol::state& lua) {
        auto invokeShellMethod = [&](sol::table& shell, const char* name) {
            sol::protected_function fn = shell[name];
            if (!fn.valid()) {
                return;
            }
            sol::protected_function_result result = fn(shell);
            if (!result.valid()) {
                sol::error err = result;
                std::fprintf(stderr, "BehaviorCoreEditor: shell.%s failed: %s\n", name, err.what());
            }
        };
        auto invokeShellMethodWithBool = [&](sol::table& shell, const char* name, bool value) {
            sol::protected_function fn = shell[name];
            if (!fn.valid()) {
                return;
            }
            sol::protected_function_result result = fn(shell, value);
            if (!result.valid()) {
                sol::error err = result;
                std::fprintf(stderr, "BehaviorCoreEditor: shell.%s failed: %s\n", name, err.what());
            }
        };
        auto invokeShellMethodWithInts = [&](sol::table& shell, const char* name, int a, int b) {
            sol::protected_function fn = shell[name];
            if (!fn.valid()) {
                return;
            }
            sol::protected_function_result result = fn(shell, a, b);
            if (!result.valid()) {
                sol::error err = result;
                std::fprintf(stderr, "BehaviorCoreEditor: shell.%s failed: %s\n", name, err.what());
            }
        };
        auto invokeShellMethodWithStringAndNumber = [&](sol::table& shell, const char* name,
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
        };

        lua["__manifoldImguiMainEditorActive"] = false;
        lua["__manifoldImguiInlineEditorActive"] = false;
        lua["__manifoldImguiScriptListActive"] = false;
        lua["__manifoldImguiHierarchyActive"] = false;
        lua["__manifoldImguiInspectorActive"] = false;

        sol::object shellObj = lua["shell"];
        if (!shellObj.valid() || !shellObj.is<sol::table>()) {
            return;
        }

        sol::table shell = shellObj.as<sol::table>();

        if (mainStatsBefore.testWindowVisible) {
            sol::object scriptEditorObj = shell["scriptEditor"];
            if (scriptEditorObj.valid() && scriptEditorObj.is<sol::table>()) {
                sol::table scriptEditor = scriptEditorObj.as<sol::table>();
                const std::string shellPath = scriptEditor["path"].get_or(std::string{});
                const int64_t shellSyncToken = scriptEditor["syncToken"].get_or(int64_t{-1});
                if (mainIdentityBefore.loaded
                    && mainIdentityBefore.path == shellPath
                    && mainIdentityBefore.syncToken == shellSyncToken) {
                    scriptEditor["text"] = mainTextBefore;
                    scriptEditor["dirty"] = mainStatsBefore.documentDirty;
                }
            }
        }

        if (inlineStatsBefore.testWindowVisible) {
            sol::object scriptInspectorObj = shell["scriptInspector"];
            if (scriptInspectorObj.valid() && scriptInspectorObj.is<sol::table>()) {
                sol::table scriptInspector = scriptInspectorObj.as<sol::table>();
                const std::string shellPath = scriptInspector["path"].get_or(std::string{});
                const int64_t shellSyncToken = scriptInspector["syncToken"].get_or(int64_t{-1});
                if (inlineIdentityBefore.loaded
                    && inlineIdentityBefore.path == shellPath
                    && inlineIdentityBefore.syncToken == shellSyncToken) {
                    scriptInspector["text"] = inlineTextBefore;
                    scriptInspector["dirty"] = inlineStatsBefore.documentDirty;
                }
            }
        }

        if (mainActions.save) {
            invokeShellMethod(shell, "saveScriptEditor");
        }
        if (mainActions.reload) {
            invokeShellMethod(shell, "reloadScriptEditor");
        }
        if (mainActions.close) {
            invokeShellMethod(shell, "closeScriptEditor");
        }

        if (inlineActions.reload) {
            sol::protected_function fn = shell["refreshScriptInspectorData"];
            if (fn.valid()) {
                sol::object rowObj = shell["selectedScriptRow"];
                sol::protected_function_result result = fn(shell, rowObj);
                if (!result.valid()) {
                    sol::error err = result;
                    std::fprintf(stderr, "BehaviorCoreEditor: shell.refreshScriptInspectorData failed: %s\n",
                                 err.what());
                }
            }
        }

        if (scriptListActions.selectIndex > 0 || scriptListActions.openIndex > 0) {
            sol::object rowsObj = shell["scriptRows"];
            if (rowsObj.valid() && rowsObj.is<sol::table>()) {
                sol::table scriptRows = rowsObj.as<sol::table>();
                const int targetIndex = scriptListActions.openIndex > 0
                    ? scriptListActions.openIndex
                    : scriptListActions.selectIndex;
                sol::object rowObj = scriptRows[targetIndex];
                if (rowObj.valid() && rowObj.is<sol::table>()) {
                    sol::table row = rowObj.as<sol::table>();

                    sol::protected_function handleSelection = shell["handleLeftListSelection"];
                    if (handleSelection.valid()) {
                        sol::protected_function_result result = handleSelection(shell, "script", row, sol::lua_nil);
                        if (!result.valid()) {
                            sol::error err = result;
                            std::fprintf(stderr, "BehaviorCoreEditor: shell.handleLeftListSelection failed: %s\n",
                                         err.what());
                        }
                    }

                    if (scriptListActions.openIndex > 0) {
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
            }
        }

        if (hierarchyActions.selectIndex > 0) {
            sol::object rowsObj = shell["treeRows"];
            if (rowsObj.valid() && rowsObj.is<sol::table>()) {
                sol::table treeRows = rowsObj.as<sol::table>();
                sol::object rowObj = treeRows[hierarchyActions.selectIndex];
                if (rowObj.valid() && rowObj.is<sol::table>()) {
                    sol::table row = rowObj.as<sol::table>();
                    sol::object canvasObj = row["canvas"];
                    sol::object selectedCanvasObj = shell["selectedWidget"];
                    if (canvasObj.valid() && canvasObj != selectedCanvasObj) {
                        sol::protected_function selectWidget = shell["selectWidget"];
                        if (selectWidget.valid()) {
                            sol::protected_function_result result = selectWidget(shell, canvasObj, true);
                            if (!result.valid()) {
                                sol::error err = result;
                                std::fprintf(stderr, "BehaviorCoreEditor: shell.selectWidget failed: %s\n",
                                             err.what());
                            }
                        }
                    }
                }
            }
        }

        if (inspectorActions.selectRowIndex > 0) {
            sol::object rowsObj = shell["inspectorRows"];
            if (rowsObj.valid() && rowsObj.is<sol::table>()) {
                sol::table inspectorRows = rowsObj.as<sol::table>();
                sol::object rowObj = inspectorRows[inspectorActions.selectRowIndex];
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

        auto applyBoundsAxis = [&](const char* axis, int value) {
            sol::protected_function fn = shell["applyBoundsEditor"];
            if (!fn.valid()) {
                return;
            }
            sol::protected_function_result result = fn(shell, axis, value);
            if (!result.valid()) {
                sol::error err = result;
                std::fprintf(stderr, "BehaviorCoreEditor: shell.applyBoundsEditor(%s) failed: %s\n",
                             axis, err.what());
            }
        };
        if (inspectorActions.setBoundsX) applyBoundsAxis("x", inspectorActions.boundsX);
        if (inspectorActions.setBoundsY) applyBoundsAxis("y", inspectorActions.boundsY);
        if (inspectorActions.setBoundsW) applyBoundsAxis("w", inspectorActions.boundsW);
        if (inspectorActions.setBoundsH) applyBoundsAxis("h", inspectorActions.boundsH);

        if (inspectorActions.applyNumber) {
            sol::protected_function fn = shell["applyActiveConfigValue"];
            if (fn.valid()) {
                sol::protected_function_result result = fn(shell, inspectorActions.numberValue);
                if (!result.valid()) {
                    sol::error err = result;
                    std::fprintf(stderr, "BehaviorCoreEditor: shell.applyActiveConfigValue(number) failed: %s\n",
                                 err.what());
                }
            }
        }
        if (inspectorActions.applyBool) {
            sol::protected_function fn = shell["applyActiveConfigValue"];
            if (fn.valid()) {
                sol::protected_function_result result = fn(shell, inspectorActions.boolValue);
                if (!result.valid()) {
                    sol::error err = result;
                    std::fprintf(stderr, "BehaviorCoreEditor: shell.applyActiveConfigValue(bool) failed: %s\n",
                                 err.what());
                }
            }
        }
        if (inspectorActions.applyText) {
            sol::protected_function fn = shell["applyActiveConfigValue"];
            if (fn.valid()) {
                sol::protected_function_result result = fn(shell, inspectorActions.textValue);
                if (!result.valid()) {
                    sol::error err = result;
                    std::fprintf(stderr, "BehaviorCoreEditor: shell.applyActiveConfigValue(text) failed: %s\n",
                                 err.what());
                }
            }
        }
        if (inspectorActions.applyColor) {
            sol::protected_function fn = shell["applyActiveConfigValue"];
            if (fn.valid()) {
                sol::protected_function_result result = fn(shell, static_cast<double>(inspectorActions.colorValue));
                if (!result.valid()) {
                    sol::error err = result;
                    std::fprintf(stderr, "BehaviorCoreEditor: shell.applyActiveConfigValue(color) failed: %s\n",
                                 err.what());
                }
            }
        }
        if (inspectorActions.applyEnumIndex > 0) {
            sol::protected_function fn = shell["applyActiveConfigEnumChoice"];
            if (fn.valid()) {
                sol::protected_function_result result = fn(shell, inspectorActions.applyEnumIndex);
                if (!result.valid()) {
                    sol::error err = result;
                    std::fprintf(stderr, "BehaviorCoreEditor: shell.applyActiveConfigEnumChoice failed: %s\n",
                                 err.what());
                }
            }
        }
        if (scriptInspectorActions.runPreview) {
            invokeShellMethod(shell, "runSelectedDspScriptForInspector");
        }
        if (scriptInspectorActions.stopPreview) {
            invokeShellMethod(shell, "stopSelectedDspScriptForInspector");
        }
        if (scriptInspectorActions.setEditorCollapsed) {
            invokeShellMethodWithBool(shell, "setScriptInspectorEditorCollapsed", scriptInspectorActions.editorCollapsed);
        }
        if (scriptInspectorActions.setGraphCollapsed) {
            invokeShellMethodWithBool(shell, "setScriptInspectorGraphCollapsed", scriptInspectorActions.graphCollapsed);
        }
        if (scriptInspectorActions.setGraphPan) {
            invokeShellMethodWithInts(shell, "setScriptInspectorGraphPan",
                                      scriptInspectorActions.graphPanX,
                                      scriptInspectorActions.graphPanY);
        }
        if (scriptInspectorActions.applyRuntimeParam && !scriptInspectorActions.runtimeParamEndpointPath.empty()) {
            invokeShellMethodWithStringAndNumber(shell, "applyScriptInspectorRuntimeParam",
                                                 scriptInspectorActions.runtimeParamEndpointPath,
                                                 scriptInspectorActions.runtimeParamValue);
        }

        const std::string shellMode = shell["mode"].get_or(std::string{});
        const std::string editContentMode = shell["editContentMode"].get_or(std::string{});
        if (shellMode == "edit" && editContentMode == "script") {
            sol::object scriptEditorObj = shell["scriptEditor"];
            sol::object mainTabContentObj = shell["mainTabContent"];
            if (scriptEditorObj.valid() && scriptEditorObj.is<sol::table>()
                && mainTabContentObj.valid() && mainTabContentObj.is<Canvas*>()) {
                sol::table scriptEditor = scriptEditorObj.as<sol::table>();
                auto* mainTabContent = mainTabContentObj.as<Canvas*>();
                if (mainTabContent != nullptr) {
                    const auto parentBounds = mainTabContent->getBounds();
                    sol::object bodyRectObj = scriptEditor["bodyRect"];
                    int x = parentBounds.getX();
                    int y = parentBounds.getY();
                    int w = parentBounds.getWidth();
                    int h = parentBounds.getHeight();

                    if (bodyRectObj.valid() && bodyRectObj.is<sol::table>()) {
                        sol::table bodyRect = bodyRectObj.as<sol::table>();
                        x = parentBounds.getX() + bodyRect["x"].get_or(0);
                        y = parentBounds.getY() + bodyRect["y"].get_or(0);
                        w = bodyRect["w"].get_or(w);
                        h = bodyRect["h"].get_or(h);
                    }

                    const std::string path = scriptEditor["path"].get_or(std::string{});
                    if (!path.empty() && w > 0 && h > 0) {
                        mainConfig.visible = true;
                        mainConfig.bounds = juce::Rectangle<int>(x, y, w, h);
                        mainConfig.file = juce::File(path);
                        mainConfig.text = scriptEditor["text"].get_or(std::string{});
                        mainConfig.syncToken = scriptEditor["syncToken"].get_or(int64_t{0});
                        mainConfig.readOnly = false;
                        lua["__manifoldImguiMainEditorActive"] = true;
                    }
                }
            }
        }

        const std::string leftPanelMode = shell["leftPanelMode"].get_or(std::string{});
        sol::object treePanelObj = shell["treePanel"];
        int treePanelX = 0;
        int treePanelY = 0;
        if (treePanelObj.valid() && treePanelObj.is<sol::table>()) {
            sol::table treePanel = treePanelObj.as<sol::table>();
            sol::object treePanelNodeObj = treePanel["node"];
            if (treePanelNodeObj.valid() && treePanelNodeObj.is<Canvas*>()) {
                auto* treePanelNode = treePanelNodeObj.as<Canvas*>();
                if (treePanelNode != nullptr) {
                    const auto panelBounds = treePanelNode->getBounds();
                    treePanelX = panelBounds.getX();
                    treePanelY = panelBounds.getY();
                }
            }
        }

        if (shellMode == "edit" && leftPanelMode == "hierarchy") {
            sol::object treeCanvasObj = shell["treeCanvas"];
            if (treeCanvasObj.valid() && treeCanvasObj.is<Canvas*>()) {
                auto* treeCanvas = treeCanvasObj.as<Canvas*>();
                if (treeCanvas != nullptr) {
                    const auto treeCanvasBounds = treeCanvas->getBounds();
                    if (treeCanvasBounds.getWidth() > 0 && treeCanvasBounds.getHeight() > 0) {
                        hierarchyConfig.visible = true;
                        hierarchyConfig.bounds = juce::Rectangle<int>(
                            treePanelX + treeCanvasBounds.getX(),
                            treePanelY + treeCanvasBounds.getY(),
                            treeCanvasBounds.getWidth(),
                            treeCanvasBounds.getHeight());

                        sol::object rowsObj = shell["treeRows"];
                        if (rowsObj.valid() && rowsObj.is<sol::table>()) {
                            sol::table treeRows = rowsObj.as<sol::table>();
                            sol::object selectedCanvasObj = shell["selectedWidget"];
                            const auto rowCount = treeRows.size();
                            hierarchyConfig.rows.reserve(rowCount);
                            for (std::size_t i = 1; i <= rowCount; ++i) {
                                sol::object rowObj = treeRows[i];
                                if (!rowObj.valid() || !rowObj.is<sol::table>()) {
                                    continue;
                                }
                                sol::table row = rowObj.as<sol::table>();
                                ImGuiHierarchyHost::TreeRow hostRow;
                                hostRow.depth = row["depth"].get_or(0);
                                hostRow.type = row["type"].get_or(std::string{});
                                hostRow.name = row["name"].get_or(std::string{});
                                hostRow.path = row["path"].get_or(std::string{});
                                sol::object rowCanvasObj = row["canvas"];
                                hostRow.selected = selectedCanvasObj.valid() && rowCanvasObj.valid()
                                    && selectedCanvasObj == rowCanvasObj;
                                hierarchyConfig.rows.push_back(std::move(hostRow));
                            }
                        }

                        sol::object inspectorPanelObj = shell["inspectorPanel"];
                        if (inspectorPanelObj.valid() && inspectorPanelObj.is<sol::table>()) {
                            sol::table inspectorPanel = inspectorPanelObj.as<sol::table>();
                            sol::object inspectorPanelNodeObj = inspectorPanel["node"];
                            if (inspectorPanelNodeObj.valid() && inspectorPanelNodeObj.is<Canvas*>()) {
                                auto* inspectorPanelNode = inspectorPanelNodeObj.as<Canvas*>();
                                if (inspectorPanelNode != nullptr) {
                                    const auto panelBounds = inspectorPanelNode->getBounds();
                                    if (panelBounds.getWidth() > 0 && panelBounds.getHeight() > 0) {
                                        inspectorConfig.visible = true;
                                        inspectorConfig.bounds = juce::Rectangle<int>(
                                            panelBounds.getX() + 6,
                                            panelBounds.getY() + 30,
                                            std::max(0, panelBounds.getWidth() - 12),
                                            std::max(0, panelBounds.getHeight() - 36));

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
                                                            matches = rawValue.as<double>() == optionValue.as<double>();
                                                        } else if (rawValue.is<std::string>()) {
                                                            matches = rawValue.as<std::string>() == optionValue.as<std::string>();
                                                        }
                                                    }
                                                    if (matches) {
                                                        inspectorConfig.activeProperty.enumSelectedIndex = static_cast<int>(optionIndex);
                                                    }
                                                }
                                            }
                                        }

                                        if (inspectorRowsObj.valid() && inspectorRowsObj.is<sol::table>()) {
                                            sol::table inspectorRows = inspectorRowsObj.as<sol::table>();
                                            const auto inspectorRowCount = inspectorRows.size();
                                            inspectorConfig.rows.reserve(inspectorRowCount);
                                            for (std::size_t i = 1; i <= inspectorRowCount; ++i) {
                                                sol::object rowObj = inspectorRows[i];
                                                if (!rowObj.valid() || !rowObj.is<sol::table>()) {
                                                    continue;
                                                }
                                                sol::table row = rowObj.as<sol::table>();
                                                ImGuiInspectorHost::InspectorRow hostRow;
                                                hostRow.rowIndex = static_cast<int>(i);
                                                hostRow.section = !row["isConfig"].get_or(false) && row["value"].get_or(std::string{}).empty();
                                                hostRow.interactive = row["isConfig"].get_or(false);
                                                hostRow.key = row["key"].get_or(std::string{});
                                                hostRow.value = row["value"].get_or(std::string{});
                                                hostRow.selected = hostRow.interactive && !activePath.empty()
                                                    && row["path"].get_or(std::string{}) == activePath;
                                                inspectorConfig.rows.push_back(std::move(hostRow));
                                            }
                                        }

                                        lua["__manifoldImguiInspectorActive"] = true;
                                    }
                                }
                            }
                        }

                        lua["__manifoldImguiHierarchyActive"] = true;
                    }
                }
            }
        }

        sol::object perfOverlayObj = shell["perfOverlay"];
        if (perfOverlayObj.valid() && perfOverlayObj.is<sol::table>()) {
            sol::table perfOverlay = perfOverlayObj.as<sol::table>();
            perfOverlayConfig.visible = perfOverlay["visible"].get_or(false);
            perfOverlayConfig.snapshot.title = "Performance Overlay";
            perfOverlayConfig.snapshot.activeTab = perfOverlay["activeTab"].get_or(std::string{"frame"});

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
            addRow(uiTab, "Mode", shell["mode"].get_or(std::string{}));
            addRow(uiTab, "Left panel", shell["leftPanelMode"].get_or(std::string{}));
            addRow(uiTab, "Edit content", shell["editContentMode"].get_or(std::string{}));
            addRow(uiTab, "Total paint accumulated", usText(luaEngine.frameTimings.totalPaintAccumulatedUs.load(std::memory_order_relaxed)));
            addRow(uiTab, "Main editor visible", boolText(mainConfig.visible));
            addRow(uiTab, "Inline editor visible", boolText(inlineConfig.visible));
            addRow(uiTab, "Script list visible", boolText(scriptListConfig.visible));
            addRow(uiTab, "Hierarchy visible", boolText(hierarchyConfig.visible));
            addRow(uiTab, "Inspector visible", boolText(inspectorConfig.visible));
        }

        if (shellMode == "edit" && leftPanelMode == "scripts") {
            sol::object scriptCanvasObj = shell["scriptCanvas"];
            if (scriptCanvasObj.valid() && scriptCanvasObj.is<Canvas*>()) {
                auto* scriptCanvas = scriptCanvasObj.as<Canvas*>();
                if (scriptCanvas != nullptr) {
                    const auto scriptCanvasBounds = scriptCanvas->getBounds();
                    if (scriptCanvasBounds.getWidth() > 0 && scriptCanvasBounds.getHeight() > 0) {
                        scriptListConfig.visible = true;
                        scriptListConfig.bounds = juce::Rectangle<int>(
                            treePanelX + scriptCanvasBounds.getX(),
                            treePanelY + scriptCanvasBounds.getY(),
                            scriptCanvasBounds.getWidth(),
                            scriptCanvasBounds.getHeight());

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
                }
            }

            sol::object scriptInspectorObj = shell["scriptInspector"];
            sol::object inspectorCanvasObj = shell["inspectorCanvas"];
            sol::object inspectorPanelObj = shell["inspectorPanel"];
            if (scriptInspectorObj.valid() && scriptInspectorObj.is<sol::table>()
                && inspectorCanvasObj.valid() && inspectorCanvasObj.is<Canvas*>()) {
                sol::table scriptInspector = scriptInspectorObj.as<sol::table>();
                auto* inspectorCanvas = inspectorCanvasObj.as<Canvas*>();
                if (inspectorCanvas != nullptr) {
                    int panelX = 0;
                    int panelY = 0;
                    if (inspectorPanelObj.valid() && inspectorPanelObj.is<sol::table>()) {
                        sol::table inspectorPanel = inspectorPanelObj.as<sol::table>();
                        sol::object inspectorPanelNodeObj = inspectorPanel["node"];
                        if (inspectorPanelNodeObj.valid() && inspectorPanelNodeObj.is<Canvas*>()) {
                            auto* inspectorPanelNode = inspectorPanelNodeObj.as<Canvas*>();
                            if (inspectorPanelNode != nullptr) {
                                const auto panelBounds = inspectorPanelNode->getBounds();
                                panelX = panelBounds.getX();
                                panelY = panelBounds.getY();
                            }
                        }
                    }

                    const auto canvasBounds = inspectorCanvas->getBounds();
                    if (canvasBounds.getWidth() > 0 && canvasBounds.getHeight() > 0) {
                        scriptInspectorConfig.visible = true;
                        scriptInspectorConfig.scriptMode = true;
                        scriptInspectorConfig.bounds = juce::Rectangle<int>(
                            panelX + canvasBounds.getX(),
                            panelY + canvasBounds.getY(),
                            canvasBounds.getWidth(),
                            canvasBounds.getHeight());

                        const std::string path = scriptInspector["path"].get_or(std::string{});
                        scriptInspectorConfig.scriptData.hasSelection = !path.empty();
                        scriptInspectorConfig.scriptData.name = scriptInspector["name"].get_or(std::string{});
                        scriptInspectorConfig.scriptData.kind = scriptInspector["kind"].get_or(std::string{});
                        scriptInspectorConfig.scriptData.ownership = scriptInspector["ownership"].get_or(std::string{});
                        scriptInspectorConfig.scriptData.path = path;
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

                        const bool editorCollapsed = scriptInspector["editorCollapsed"].get_or(false);
                        const int64_t syncToken = scriptInspector["syncToken"].get_or(int64_t{0});
                        if (!editorCollapsed && !path.empty()) {
                            juce::Rectangle<int> inlineRect;
                            if (scriptInspectorLayoutBefore.hasInlineEditorRect) {
                                inlineRect = scriptInspectorLayoutBefore.inlineEditorRect
                                    .withPosition(scriptInspectorConfig.bounds.getX() + scriptInspectorLayoutBefore.inlineEditorRect.getX(),
                                                  scriptInspectorConfig.bounds.getY() + scriptInspectorLayoutBefore.inlineEditorRect.getY());
                            } else {
                                sol::object bodyRectObj = scriptInspector["editorBodyRect"];
                                if (bodyRectObj.valid() && bodyRectObj.is<sol::table>()) {
                                    sol::table bodyRect = bodyRectObj.as<sol::table>();
                                    inlineRect = juce::Rectangle<int>(
                                        scriptInspectorConfig.bounds.getX() + bodyRect["x"].get_or(0),
                                        scriptInspectorConfig.bounds.getY() + bodyRect["y"].get_or(0),
                                        bodyRect["w"].get_or(0),
                                        bodyRect["h"].get_or(0));
                                }
                            }

                            if (inlineRect.getWidth() > 0 && inlineRect.getHeight() > 0) {
                                inlineConfig.visible = true;
                                inlineConfig.bounds = inlineRect;
                                inlineConfig.file = juce::File(path);
                                inlineConfig.text = scriptInspector["text"].get_or(std::string{});
                                inlineConfig.syncToken = syncToken;
                                inlineConfig.readOnly = true;
                                lua["__manifoldImguiInlineEditorActive"] = true;
                            }
                        }
                    }
                }
            }
        }
    });
    logEditorPerf("syncImGuiHostsFromLuaShell.luaState", luaStateStart);

    const auto hostApplyStart = PerfClock::now();
    logEditorHostLayout("mainScriptEditorHost", mainScriptHostTrace, mainConfig.visible, mainConfig.visible ? mainConfig.bounds : juce::Rectangle<int>());
    if (mainConfig.visible) {
        mainScriptEditorHost.configureDocument(mainConfig.file, mainConfig.text,
                                               mainConfig.syncToken, mainConfig.readOnly);
        // Queue visibility change to avoid blocking GUI thread during OpenGL context creation
        if (mainScriptEditorHost.isVisible() != true || mainScriptEditorHost.getBounds() != mainConfig.bounds) {
            deferredVisibilityChanges.push_back({&mainScriptEditorHost, true, mainConfig.bounds});
        }
    } else {
        if (mainScriptEditorHost.isVisible() != false || mainScriptEditorHost.getBounds() != juce::Rectangle<int>(0, 0, 0, 0)) {
            deferredVisibilityChanges.push_back({&mainScriptEditorHost, false, juce::Rectangle<int>(0, 0, 0, 0)});
        }
    }

    logEditorHostLayout("hierarchyHost", hierarchyHostTrace, hierarchyConfig.visible, hierarchyConfig.visible ? hierarchyConfig.bounds : juce::Rectangle<int>());
    if (hierarchyConfig.visible) {
        hierarchyHost.configureRows(hierarchyConfig.rows);
        if (hierarchyHost.isVisible() != true || hierarchyHost.getBounds() != hierarchyConfig.bounds) {
            deferredVisibilityChanges.push_back({&hierarchyHost, true, hierarchyConfig.bounds});
        }
    } else {
        if (hierarchyHost.isVisible() != false || hierarchyHost.getBounds() != juce::Rectangle<int>(0, 0, 0, 0)) {
            deferredVisibilityChanges.push_back({&hierarchyHost, false, juce::Rectangle<int>(0, 0, 0, 0)});
        }
    }

    logEditorHostLayout("scriptListHost", scriptListHostTrace, scriptListConfig.visible, scriptListConfig.visible ? scriptListConfig.bounds : juce::Rectangle<int>());
    if (scriptListConfig.visible) {
        scriptListHost.configureRows(scriptListConfig.rows);
        if (scriptListHost.isVisible() != true || scriptListHost.getBounds() != scriptListConfig.bounds) {
            deferredVisibilityChanges.push_back({&scriptListHost, true, scriptListConfig.bounds});
        }
    } else {
        if (scriptListHost.isVisible() != false || scriptListHost.getBounds() != juce::Rectangle<int>(0, 0, 0, 0)) {
            deferredVisibilityChanges.push_back({&scriptListHost, false, juce::Rectangle<int>(0, 0, 0, 0)});
        }
    }

    logEditorHostLayout("inspectorHost", inspectorHostTrace, inspectorConfig.visible, inspectorConfig.visible ? inspectorConfig.bounds : juce::Rectangle<int>());
    if (inspectorConfig.visible) {
        inspectorHost.configureData(inspectorConfig.selectionBounds,
                                    inspectorConfig.rows,
                                    inspectorConfig.activeProperty);
        if (inspectorHost.isVisible() != true || inspectorHost.getBounds() != inspectorConfig.bounds) {
            deferredVisibilityChanges.push_back({&inspectorHost, true, inspectorConfig.bounds});
        }
    } else {
        if (inspectorHost.isVisible() != false || inspectorHost.getBounds() != juce::Rectangle<int>(0, 0, 0, 0)) {
            deferredVisibilityChanges.push_back({&inspectorHost, false, juce::Rectangle<int>(0, 0, 0, 0)});
        }
    }

    logEditorHostLayout("scriptInspectorHost", scriptInspectorHostTrace, scriptInspectorConfig.visible, scriptInspectorConfig.visible ? scriptInspectorConfig.bounds : juce::Rectangle<int>());
    if (scriptInspectorConfig.visible) {
        scriptInspectorHost.configureScriptData(scriptInspectorConfig.scriptData);
        if (scriptInspectorHost.isVisible() != true || scriptInspectorHost.getBounds() != scriptInspectorConfig.bounds) {
            deferredVisibilityChanges.push_back({&scriptInspectorHost, true, scriptInspectorConfig.bounds});
        }
    } else {
        if (scriptInspectorHost.isVisible() != false || scriptInspectorHost.getBounds() != juce::Rectangle<int>(0, 0, 0, 0)) {
            deferredVisibilityChanges.push_back({&scriptInspectorHost, false, juce::Rectangle<int>(0, 0, 0, 0)});
        }
    }

    logEditorHostLayout("inlineScriptEditorHost", inlineScriptHostTrace, inlineConfig.visible, inlineConfig.visible ? inlineConfig.bounds : juce::Rectangle<int>());
    if (inlineConfig.visible) {
        inlineScriptEditorHost.configureDocument(inlineConfig.file, inlineConfig.text,
                                                 inlineConfig.syncToken, inlineConfig.readOnly);
        if (inlineScriptEditorHost.isVisible() != true || inlineScriptEditorHost.getBounds() != inlineConfig.bounds) {
            deferredVisibilityChanges.push_back({&inlineScriptEditorHost, true, inlineConfig.bounds});
        }
    } else {
        if (inlineScriptEditorHost.isVisible() != false || inlineScriptEditorHost.getBounds() != juce::Rectangle<int>(0, 0, 0, 0)) {
            deferredVisibilityChanges.push_back({&inlineScriptEditorHost, false, juce::Rectangle<int>(0, 0, 0, 0)});
        }
    }

    if (perfOverlayConfig.visible) {
        const auto editorBounds = getLocalBounds();
        const int panelW = std::min(520, std::max(320, static_cast<int>(editorBounds.getWidth() * 0.42f)));
        const int panelH = std::min(420, std::max(220, static_cast<int>(editorBounds.getHeight() * 0.55f)));
        const auto defaultBounds = juce::Rectangle<int>(
            std::max(0, editorBounds.getWidth() - panelW - 16),
            16,
            panelW,
            panelH);
        const auto currentBounds = perfOverlayHost.getBounds();
        perfOverlayConfig.bounds = perfOverlayHost.isVisible() && currentBounds.getWidth() > 0 && currentBounds.getHeight() > 0
            ? currentBounds
            : defaultBounds;
        perfOverlayHost.configureSnapshot(perfOverlayConfig.snapshot);
        if (perfOverlayHost.isVisible() != true || perfOverlayHost.getBounds() != perfOverlayConfig.bounds) {
            deferredVisibilityChanges.push_back({&perfOverlayHost, true, perfOverlayConfig.bounds});
        }
    } else {
        if (perfOverlayHost.isVisible() != false || perfOverlayHost.getBounds() != juce::Rectangle<int>(0, 0, 0, 0)) {
            deferredVisibilityChanges.push_back({&perfOverlayHost, false, juce::Rectangle<int>(0, 0, 0, 0)});
        }
    }

    logEditorPerf("syncImGuiHostsFromLuaShell.applyHosts", hostApplyStart);
    logEditorPerf("syncImGuiHostsFromLuaShell.total", totalStart);
}

void BehaviorCoreEditor::resized() {
    const auto localBounds = getBounds();
    const auto screenBounds = getScreenBounds();
    const auto scale = juce::Component::getApproximateScaleFactorForComponent(this);
    const auto* display = juce::Desktop::getInstance().getDisplays().getDisplayForRect(screenBounds);
    if (display != nullptr) {
        std::fprintf(stderr,
                     "[BehaviorCoreEditor] resized editorBounds=%d,%d %dx%d screenBounds=%d,%d %dx%d scale=%.3f displayScale=%.3f displayTotal=%d,%d %dx%d displayUser=%d,%d %dx%d\n",
                     localBounds.getX(), localBounds.getY(), localBounds.getWidth(), localBounds.getHeight(),
                     screenBounds.getX(), screenBounds.getY(), screenBounds.getWidth(), screenBounds.getHeight(),
                     static_cast<double>(scale),
                     static_cast<double>(display->scale),
                     display->totalArea.getX(), display->totalArea.getY(), display->totalArea.getWidth(), display->totalArea.getHeight(),
                     display->userArea.getX(), display->userArea.getY(), display->userArea.getWidth(), display->userArea.getHeight());
    } else {
        std::fprintf(stderr,
                     "[BehaviorCoreEditor] resized editorBounds=%d,%d %dx%d screenBounds=%d,%d %dx%d scale=%.3f displayScale=none\n",
                     localBounds.getX(), localBounds.getY(), localBounds.getWidth(), localBounds.getHeight(),
                     screenBounds.getX(), screenBounds.getY(), screenBounds.getWidth(), screenBounds.getHeight(),
                     static_cast<double>(scale));
    }
    rootCanvas.setBounds(getLocalBounds());

    if (usingLuaUi) {
        luaEngine.notifyResized(rootCanvas.getWidth(), rootCanvas.getHeight());
        syncImGuiHostsFromLuaShell();
    } else if (errorNode != nullptr) {
        errorNode->setBounds(rootCanvas.getLocalBounds());
        mainScriptEditorHost.setVisible(false);
        mainScriptEditorHost.setBounds(0, 0, 0, 0);
        inlineScriptEditorHost.setVisible(false);
        inlineScriptEditorHost.setBounds(0, 0, 0, 0);
        scriptListHost.setVisible(false);
        scriptListHost.setBounds(0, 0, 0, 0);
        hierarchyHost.setVisible(false);
        hierarchyHost.setBounds(0, 0, 0, 0);
        inspectorHost.setVisible(false);
        inspectorHost.setBounds(0, 0, 0, 0);
        scriptInspectorHost.setVisible(false);
        scriptInspectorHost.setBounds(0, 0, 0, 0);
    }
}

void BehaviorCoreEditor::mouseMove(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);
}

void BehaviorCoreEditor::mouseDown(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);
}

void BehaviorCoreEditor::mouseUp(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);
}

void BehaviorCoreEditor::mouseEnter(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);
}

void BehaviorCoreEditor::mouseExit(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);
}

void BehaviorCoreEditor::showError(const std::string& message) {
    errorMessage = message;
    rootCanvas.clearChildren();

    errorNode = rootCanvas.addChild("error");
    errorNode->onDraw = [this](Canvas& c, juce::Graphics& g) {
        auto b = c.getLocalBounds().reduced(40);

        g.setColour(juce::Colour(0xff1a0000));
        g.fillRoundedRectangle(b.toFloat(), 12.0f);
        g.setColour(juce::Colour(0xff6b2020));
        g.drawRoundedRectangle(b.toFloat(), 12.0f, 1.5f);

        auto inner = b.reduced(24);

        g.setColour(juce::Colour(0xffef4444));
        g.setFont(20.0f);
        g.drawText("Lua UI Error", inner.removeFromTop(32), juce::Justification::centredLeft);

        inner.removeFromTop(12);
        g.setColour(juce::Colour(0xffcbd5e1));
        g.setFont(13.0f);
        g.drawMultiLineText(juce::String(errorMessage), inner.getX(), inner.getY() + 14,
                            inner.getWidth());
    };
}
