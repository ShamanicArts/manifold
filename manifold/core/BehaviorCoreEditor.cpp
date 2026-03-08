#include "BehaviorCoreEditor.h"
#include "BehaviorCoreProcessor.h"
#include "../primitives/core/Settings.h"
#include "../primitives/ui/Canvas.h"

#include <chrono>
#include <cstdio>
#include <tuple>

BehaviorCoreEditor::BehaviorCoreEditor(BehaviorCoreProcessor& ownerProcessor)
    : juce::AudioProcessorEditor(&ownerProcessor), processorRef(ownerProcessor) {
    setSize(1000, 640);

    addAndMakeVisible(rootCanvas);
    addAndMakeVisible(mainScriptEditorHost);
    addAndMakeVisible(inlineScriptEditorHost);
    mainScriptEditorHost.setVisible(false);
    inlineScriptEditorHost.setVisible(false);
    mainScriptEditorHost.toFront(false);
    inlineScriptEditorHost.toFront(false);

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

void BehaviorCoreEditor::timerCallback() {
    using Clock = std::chrono::steady_clock;
    static auto lastCall = Clock::now();
    const auto now = Clock::now();
    const auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(now - lastCall).count();
    lastCall = now;

    static int logCount = 0;
    const auto timerStart = Clock::now();

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

        if (++logCount % 60 == 0) {
            std::fprintf(stderr, "[TIMER] interval=%.1fms work=%.1fms (%.1f%% occupancy)\n",
                         elapsed / 1000.0, totalUs / 1000.0, 100.0 * totalUs / elapsed);
        }
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
    struct HostConfig {
        bool visible = false;
        juce::Rectangle<int> bounds;
        juce::File file;
        std::string text;
        int64_t syncToken = 0;
        bool readOnly = false;
    };

    const auto mainStatsBefore = mainScriptEditorHost.getStatsSnapshot();
    const auto inlineStatsBefore = inlineScriptEditorHost.getStatsSnapshot();
    const auto mainIdentityBefore = mainScriptEditorHost.getDocumentIdentity();
    const auto inlineIdentityBefore = inlineScriptEditorHost.getDocumentIdentity();
    const auto mainTextBefore = mainScriptEditorHost.getCurrentText();
    const auto inlineTextBefore = inlineScriptEditorHost.getCurrentText();
    const auto mainActions = mainScriptEditorHost.consumeActionRequests();
    const auto inlineActions = inlineScriptEditorHost.consumeActionRequests();

    HostConfig mainConfig;
    HostConfig inlineConfig;

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

        lua["__manifoldImguiMainEditorActive"] = false;
        lua["__manifoldImguiInlineEditorActive"] = false;

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
                    int y = parentBounds.getY() + 32;
                    int w = parentBounds.getWidth();
                    int h = std::max(0, parentBounds.getHeight() - 32 - 20);
                    if (bodyRectObj.valid() && bodyRectObj.is<sol::table>()) {
                        sol::table bodyRect = bodyRectObj.as<sol::table>();
                        x = parentBounds.getX() + bodyRect["x"].get_or(0);
                        y = parentBounds.getY() + bodyRect["y"].get_or(32);
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
        if (shellMode == "edit" && leftPanelMode == "scripts") {
            sol::object scriptInspectorObj = shell["scriptInspector"];
            sol::object inspectorCanvasObj = shell["inspectorCanvas"];
            sol::object inspectorPanelObj = shell["inspectorPanel"];
            if (scriptInspectorObj.valid() && scriptInspectorObj.is<sol::table>()
                && inspectorCanvasObj.valid() && inspectorCanvasObj.is<Canvas*>()) {
                sol::table scriptInspector = scriptInspectorObj.as<sol::table>();
                auto* inspectorCanvas = inspectorCanvasObj.as<Canvas*>();
                if (inspectorCanvas != nullptr && scriptInspector["editorCollapsed"].get_or(false) != true) {
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

                    sol::object bodyRectObj = scriptInspector["editorBodyRect"];
                    const std::string path = scriptInspector["path"].get_or(std::string{});
                    if (bodyRectObj.valid() && bodyRectObj.is<sol::table>() && !path.empty()) {
                        const auto canvasBounds = inspectorCanvas->getBounds();
                        sol::table bodyRect = bodyRectObj.as<sol::table>();
                        const int x = panelX + canvasBounds.getX() + bodyRect["x"].get_or(0);
                        const int y = panelY + canvasBounds.getY() + bodyRect["y"].get_or(0);
                        const int w = bodyRect["w"].get_or(0);
                        const int h = bodyRect["h"].get_or(0);
                        if (w > 0 && h > 0) {
                            inlineConfig.visible = true;
                            inlineConfig.bounds = juce::Rectangle<int>(x, y, w, h);
                            inlineConfig.file = juce::File(path);
                            inlineConfig.text = scriptInspector["text"].get_or(std::string{});
                            inlineConfig.syncToken = scriptInspector["syncToken"].get_or(int64_t{0});
                            inlineConfig.readOnly = true;
                            lua["__manifoldImguiInlineEditorActive"] = true;
                        }
                    }
                }
            }
        }
    });

    if (mainConfig.visible) {
        mainScriptEditorHost.configureDocument(mainConfig.file, mainConfig.text,
                                               mainConfig.syncToken, mainConfig.readOnly);
        if (!mainScriptEditorHost.isVisible()) {
            mainScriptEditorHost.setVisible(true);
        }
        mainScriptEditorHost.setBounds(mainConfig.bounds);
        mainScriptEditorHost.toFront(false);
    } else {
        mainScriptEditorHost.setVisible(false);
        mainScriptEditorHost.setBounds(0, 0, 0, 0);
    }

    if (inlineConfig.visible) {
        inlineScriptEditorHost.configureDocument(inlineConfig.file, inlineConfig.text,
                                                 inlineConfig.syncToken, inlineConfig.readOnly);
        if (!inlineScriptEditorHost.isVisible()) {
            inlineScriptEditorHost.setVisible(true);
        }
        inlineScriptEditorHost.setBounds(inlineConfig.bounds);
        inlineScriptEditorHost.toFront(false);
    } else {
        inlineScriptEditorHost.setVisible(false);
        inlineScriptEditorHost.setBounds(0, 0, 0, 0);
    }
}

void BehaviorCoreEditor::resized() {
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
    }
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
