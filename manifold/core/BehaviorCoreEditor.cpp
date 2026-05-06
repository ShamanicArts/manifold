#include "BehaviorCoreEditor.h"
#include "../ui/imgui/DirectHostRuntimeSupport.h"
#include "BehaviorCoreProcessor.h"
#include "EditorShellSupport.h"
#include "../primitives/core/Settings.h"
#include "../primitives/scripting/bindings/LuaRuntimeNodeBindings.h"
#include "../primitives/ui/Canvas.h"

#include <sol/sol.hpp>

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <limits>
#include <sstream>
#if defined(__GLIBC__)
#include <malloc.h>
#endif

namespace {
using PerfClock = std::chrono::steady_clock;
using HostLayoutTraceState = editor_perf::HostLayoutTraceState;

using editor_shell::HostConfig;
using editor_shell::ScriptListHostConfig;
using editor_shell::HierarchyHostConfig;
using editor_shell::InspectorHostConfig;
using editor_shell::PerfOverlayHostConfig;

juce::String canonicalContractPath(const juce::File& file) {
    if (!file.exists()) {
        return {};
    }
#ifdef MANIFOLD_SOURCE_DIR
    const juce::File sourceRoot(juce::String(MANIFOLD_SOURCE_DIR));
    if (sourceRoot.isDirectory()) {
        return file.getRelativePathFrom(sourceRoot);
    }
#endif
    return file.getFullPathName();
}

[[maybe_unused]] double perfElapsedMs(PerfClock::time_point start) {
    return std::chrono::duration<double, std::milli>(PerfClock::now() - start).count();
}

bool parseProfileWindowSizeEnv(int& widthOut, int& heightOut) {
    const char* envValue = std::getenv("MANIFOLD_PROFILE_WINDOW_SIZE");
    if (envValue == nullptr || *envValue == '\0') {
        return false;
    }

    int width = 0;
    int height = 0;
    if (std::sscanf(envValue, "%dx%d", &width, &height) != 2
        && std::sscanf(envValue, "%dX%d", &width, &height) != 2) {
        return false;
    }

    if (width <= 0 || height <= 0) {
        return false;
    }

    widthOut = width;
    heightOut = height;
    return true;
}



























void applyMainEditorHostConfig(HostLayoutTraceState& trace,
                               ImGuiHost& host,
                               const HostConfig& config) {
    editor_perf::logEditorHostLayout("mainScriptEditorHost", trace, config.visible,
                        config.visible ? config.bounds : juce::Rectangle<int>());
    if (config.visible) {
        host.configureDocument(config.file, config.text, config.syncToken, config.readOnly);
    }
}

void applyHierarchyHostConfig(HostLayoutTraceState& trace,
                              ImGuiHierarchyHost& host,
                              const HierarchyHostConfig& config) {
    editor_perf::logEditorHostLayout("hierarchyHost", trace, config.visible,
                        config.visible ? config.bounds : juce::Rectangle<int>());
    if (config.visible) {
        host.configureRows(config.rows);
    }
}

void applyScriptListHostConfig(HostLayoutTraceState& trace,
                               ImGuiScriptListHost& host,
                               const ScriptListHostConfig& config) {
    editor_perf::logEditorHostLayout("scriptListHost", trace, config.visible,
                        config.visible ? config.bounds : juce::Rectangle<int>());
    if (config.visible) {
        host.configureRows(config.rows);
    }
}

void applyInspectorHostConfig(HostLayoutTraceState& trace,
                              ImGuiInspectorHost& host,
                              const InspectorHostConfig& config) {
    editor_perf::logEditorHostLayout("inspectorHost", trace, config.visible,
                        config.visible ? config.bounds : juce::Rectangle<int>());
    if (config.visible) {
        host.configureData(config.selectionBounds, config.rows, config.activeProperty);
    }
}

void applyScriptInspectorHostConfig(HostLayoutTraceState& trace,
                                    ImGuiInspectorHost& host,
                                    const InspectorHostConfig& config) {
    editor_perf::logEditorHostLayout("scriptInspectorHost", trace, config.visible,
                        config.visible ? config.bounds : juce::Rectangle<int>());
    if (config.visible) {
        host.configureScriptData(config.scriptData);
    }
}

void applyPerfOverlayHostConfig(ImGuiPerfOverlayHost& host,
                                const PerfOverlayHostConfig& config) {
    if (config.visible) {
        host.configureSnapshot(config.snapshot);
    }
}

}

RuntimeNode* BehaviorCoreEditor::getActiveRootRuntimeNode() {
    if (rootMode_ == RootMode::RuntimeNode) {
        return rootRuntime_.get();
    }
    return rootCanvas.getRuntimeNode();
}

void BehaviorCoreEditor::setRuntimeRendererMode(RuntimeRendererMode mode, bool logChange) {
    if (rootMode_ == RootMode::RuntimeNode
        && (mode == RuntimeRendererMode::Canvas || mode == RuntimeRendererMode::ImGuiOverlay)) {
        mode = RuntimeRendererMode::ImGuiDirect;
    }

    if (runtimeRendererMode_ == mode) {
        updateRuntimeRendererPresentation();
        processorRef.getControlServer().setCurrentUIRendererMode(static_cast<int>(runtimeRendererMode_));
        return;
    }

    runtimeRendererMode_ = mode;
    directHostNeedsInitialFocus_ = (runtimeRendererMode_ == RuntimeRendererMode::ImGuiDirect);
    LuaRuntimeNodeBindings::setAllowAutomaticLegacyRetainedReplay(runtimeRendererMode_ != RuntimeRendererMode::ImGuiDirect);
    processorRef.getControlServer().setCurrentUIRendererMode(static_cast<int>(runtimeRendererMode_));

    if (runtimeRendererMode_ != RuntimeRendererMode::Canvas) {
        luaEngine.withLuaState([](sol::state& L) {
            sol::object shellObj = L["_G"]["shell"];
            if (!shellObj.valid() || !shellObj.is<sol::table>()) {
                return;
            }
            auto shellTable = shellObj.as<sol::table>();
            editor_shell::invokeShellMethod(shellTable, "flushDeferredRefreshes");
        });
    }

    runtimeNodeDebugHost.setRootNode(getActiveRootRuntimeNode());
    updateRuntimeRendererPresentation();

    if (logChange) {
        std::fprintf(stderr,
                     "BehaviorCoreEditor: UI renderer mode -> %s\n",
                     editor_renderer::runtimeRendererModeToString(runtimeRendererMode_));
    }
}

void BehaviorCoreEditor::updateRuntimeRendererPresentation() {
    // ImGuiDirect uses the new direct host; other modes use the old debug host
    const bool useDirect = (runtimeRendererMode_ == RuntimeRendererMode::ImGuiDirect);

    if (!useDirect) {
        // Hide direct host by zeroing bounds only; keep GL context alive.
        directHost_.setBounds(0, 0, 0, 0);
        directHost_.setRootNode(nullptr);

        // Configure old debug host
        runtimeNodeDebugHost.setRootNode(getActiveRootRuntimeNode());
        runtimeNodeDebugHost.setUseLiveTree(false);
        runtimeNodeDebugHost.setPresentationMode(
            runtimeRendererMode_ == RuntimeRendererMode::ImGuiReplace
                ? ImGuiRuntimeNodeHost::PresentationMode::Replace
                : ImGuiRuntimeNodeHost::PresentationMode::DebugPreview);
    } else {
        // Hide old debug host by zeroing bounds only; keep GL context alive.
        runtimeNodeDebugHost.setRootNode(nullptr);
        runtimeNodeDebugHost.setBounds(0, 0, 0, 0);
    }

    switch (runtimeRendererMode_) {
        case RuntimeRendererMode::Canvas: {
            runtimeNodeDebugHost.setBounds(0, 0, 0, 0);
            directHost_.setBounds(0, 0, 0, 0);
            return;
        }
        case RuntimeRendererMode::ImGuiOverlay: {
            const int debugW = std::min(420, std::max(240, getWidth() / 2));
            const int debugH = std::min(280, std::max(180, getHeight() / 2));
            runtimeNodeDebugHost.setBounds(getWidth() - debugW - 12, 12, debugW, debugH);
            runtimeNodeDebugHost.setVisible(true);
            runtimeNodeDebugHost.toFront(false);
            return;
        }
        case RuntimeRendererMode::ImGuiReplace: {
            runtimeNodeDebugHost.setBounds(getLocalBounds());
            runtimeNodeDebugHost.setVisible(true);
            runtimeNodeDebugHost.toFront(false);
            return;
        }
        case RuntimeRendererMode::ImGuiDirect: {
            directHost_.setRootNode(rootRuntime_.get());
            directHost_.setBounds(getLocalBounds());
            directHost_.setVisible(true);
            directHost_.toBack();
            if (perfOverlayHost.isVisible()) {
                perfOverlayHost.toFront(false);
            } else if (directHostNeedsInitialFocus_) {
                directHost_.grabKeyboardFocus();
                directHostNeedsInitialFocus_ = false;
            }
            return;
        }
    }
}

BehaviorCoreEditor::BehaviorCoreEditor(BehaviorCoreProcessor& ownerProcessor,
                                       RootMode rootMode)
    : juce::AudioProcessorEditor(&ownerProcessor),
      processorRef(ownerProcessor),
      rootMode_(rootMode) {
    if (const char* envRenderer = std::getenv("MANIFOLD_RENDERER")) {
        const auto envMode = editor_renderer::runtimeRendererModeFromString(envRenderer, RuntimeRendererMode::ImGuiDirect);
        if (envMode == RuntimeRendererMode::Canvas || envMode == RuntimeRendererMode::ImGuiOverlay || envMode == RuntimeRendererMode::ImGuiReplace) {
            rootMode_ = RootMode::Canvas;
        } else {
            rootMode_ = RootMode::RuntimeNode;
        }
    } else {
        switch (processorRef.getControlServer().getCurrentUIRendererMode()) {
            case 0:
            case 1:
            case 2:
                rootMode_ = RootMode::Canvas;
                break;
            case 3:
            default:
                rootMode_ = RootMode::RuntimeNode;
                break;
        }
    }

    exportPluginUi_ = processorRef.hasExportPluginConfig();

    int initialWidth = exportPluginUi_ ? processorRef.getExportEditorWidth() : 1000;
    int initialHeight = exportPluginUi_ ? processorRef.getExportEditorHeight() : 640;
    if (parseProfileWindowSizeEnv(initialWidth, initialHeight)) {
        std::fprintf(stderr,
                     "BehaviorCoreEditor: using MANIFOLD_PROFILE_WINDOW_SIZE=%dx%d\n",
                     initialWidth,
                     initialHeight);
    }

    setWantsKeyboardFocus(true);
    setSize(initialWidth, initialHeight);

    if (rootMode_ == RootMode::RuntimeNode) {
        rootRuntime_ = std::make_unique<RuntimeNode>("root");
        rootRuntime_->setBounds(0, 0, getWidth(), getHeight());
        addChildComponent(rootCanvas);
        rootCanvas.setVisible(false);
        runtimeRendererMode_ = RuntimeRendererMode::ImGuiDirect;
    } else {
        addAndMakeVisible(rootCanvas);
    }
    if (!exportPluginUi_) {
        addAndMakeVisible(mainScriptEditorHost);
        addAndMakeVisible(scriptListHost);
        addAndMakeVisible(hierarchyHost);
        addAndMakeVisible(inspectorHost);
        addAndMakeVisible(scriptInspectorHost);
        addAndMakeVisible(perfOverlayHost);
        addAndMakeVisible(runtimeNodeDebugHost);
    }
    addChildComponent(directHost_);
    runtimeNodeDebugHost.setOnExitRequested([this]() {
        setRuntimeRendererMode(RuntimeRendererMode::Canvas);
    });

    perfOverlayHost.onTabChanged = [this](const std::string& tabId) {
        luaEngine.withLuaState([tabId](sol::state& L) {
            auto shell = L["_G"]["shell"];
            if (!shell.valid()) {
                return;
            }
            sol::protected_function fn = shell["setPerfOverlayActiveTab"];
            if (fn.valid()) {
                fn(shell, tabId);
            }
        });
    };
    perfOverlayHost.onClosed = [this]() {
        luaEngine.withLuaState([](sol::state& L) {
            auto shell = L["_G"]["shell"];
            if (!shell.valid()) {
                return;
            }
            sol::protected_function fn = shell["setPerfOverlayVisible"];
            if (fn.valid()) {
                fn(shell, false);
            }
        });
    };
    directHost_.setCopyIdCallback([this](const std::string& nodeId) {
        // Copy to clipboard via JUCE
        juce::SystemClipboard::copyTextToClipboard(juce::String(nodeId));
        std::fprintf(stderr, "[CopyID DEBUG] Callback fired for: %s\n", nodeId.c_str());
        
        // Also print to Lua console
        luaEngine.withLuaState([&](sol::state& L) {
            sol::object shellObj = L["_G"]["shell"];
            if (!shellObj.valid() || !shellObj.is<sol::table>()) {
                std::fprintf(stderr, "[CopyID DEBUG] shell not found in Lua\n");
                return;
            }
            sol::table shell = shellObj.as<sol::table>();
            sol::protected_function fn = shell["appendConsoleLine"];
            if (fn.valid()) {
                std::fprintf(stderr, "[CopyID DEBUG] Calling appendConsoleLine\n");
                auto result = fn(shell, "[CopyID] copied: " + nodeId, 0xff86efac);
                if (!result.valid()) {
                    sol::error err = result;
                    std::fprintf(stderr, "[CopyID DEBUG] Lua error: %s\n", err.what());
                }
            } else {
                std::fprintf(stderr, "[CopyID DEBUG] appendConsoleLine not found\n");
            }
        });
    });

    directHost_.setGlobalKeyHandler([this](const juce::KeyPress& key) {
        bool handled = false;
        luaEngine.withLuaState([&](sol::state& L) {
            sol::object shellObj = L["_G"]["shell"];
            if (!shellObj.valid() || !shellObj.is<sol::table>()) {
                return;
            }

            sol::table shell = shellObj.as<sol::table>();
            sol::protected_function fn = shell["handleGlobalDevHotkeys"];
            if (!fn.valid()) {
                return;
            }

            const auto mods = key.getModifiers();
            auto result = fn(shell,
                             key.getKeyCode(),
                             static_cast<int>(key.getTextCharacter()),
                             mods.isShiftDown(),
                             mods.isCtrlDown() || mods.isCommandDown(),
                             mods.isAltDown());
            if (!result.valid()) {
                sol::error err = result;
                std::fprintf(stderr,
                             "BehaviorCoreEditor: shell.handleGlobalDevHotkeys failed: %s\n",
                             err.what());
                return;
            }

            if (result.get_type() == sol::type::boolean) {
                handled = result.get<bool>();
            } else {
                handled = true;
            }
        });

        if (!handled && exportPluginUi_) {
            const auto ch = static_cast<int>(key.getTextCharacter());
            if (ch == '`' || ch == '~') {
                const float current = processorRef.getParamByPath("/plugin/ui/devVisible");
                processorRef.setParamByPath("/plugin/ui/devVisible", current > 0.5f ? 0.0f : 1.0f);
                handled = true;
            }
        }

        return handled;
    });
    perfOverlayHost.onBoundsChanged = [this](const juce::Rectangle<int>& bounds) {
        luaEngine.withLuaState([bounds](sol::state& L) {
            auto shell = L["_G"]["shell"];
            if (!shell.valid()) {
                return;
            }
            sol::protected_function fn = shell["setPerfOverlayBounds"];
            if (fn.valid()) {
                fn(shell, bounds.getX(), bounds.getY(), bounds.getWidth(), bounds.getHeight());
            }
        });
    };
    if (!exportPluginUi_) {
        mainScriptEditorHost.setVisible(false);
        scriptListHost.setVisible(false);
        hierarchyHost.setVisible(false);
        inspectorHost.setVisible(false);
        scriptInspectorHost.setVisible(false);
        perfOverlayHost.setVisible(false);
        runtimeNodeDebugHost.setVisible(false);
        mainScriptEditorHost.toFront(false);
        scriptListHost.toFront(false);
        hierarchyHost.toFront(false);
        inspectorHost.toFront(false);
        scriptInspectorHost.toFront(false);
        perfOverlayHost.toFront(false);
        runtimeNodeDebugHost.toFront(false);
    }
    directHostNeedsInitialFocus_ = (runtimeRendererMode_ == RuntimeRendererMode::ImGuiDirect);

    LuaRuntimeNodeBindings::setAllowAutomaticLegacyRetainedReplay(rootMode_ != RootMode::RuntimeNode);
    if (rootMode_ == RootMode::RuntimeNode) {
        luaEngine.initialise(&processorRef, rootRuntime_.get());
    } else {
        luaEngine.initialise(&processorRef, &rootCanvas);
    }
    runtimeNodeDebugHost.setRootNode(getActiveRootRuntimeNode());
    processorRef.getControlServer().setFrameTimings(&luaEngine.frameTimings);
    processorRef.getControlServer().setLuaEngine(&luaEngine);

    if (const char* envRenderer = std::getenv("MANIFOLD_RENDERER")) {
        runtimeRendererMode_ = editor_renderer::runtimeRendererModeFromString(envRenderer,
                                                             rootMode_ == RootMode::RuntimeNode
                                                                 ? RuntimeRendererMode::ImGuiDirect
                                                                 : RuntimeRendererMode::Canvas);
        if (runtimeRendererMode_ != RuntimeRendererMode::Canvas) {
            std::fprintf(stderr,
                         "BehaviorCoreEditor: renderer enabled via MANIFOLD_RENDERER=%s (%s)\n",
                         envRenderer,
                         editor_renderer::runtimeRendererModeToString(runtimeRendererMode_));
        }
    } else if (const char* envMode = std::getenv("MANIFOLD_RUNTIME_NODE_DEBUG")) {
        runtimeRendererMode_ = editor_renderer::runtimeRendererModeFromString(envMode, RuntimeRendererMode::ImGuiOverlay);
        if (runtimeRendererMode_ != RuntimeRendererMode::Canvas) {
            std::fprintf(stderr,
                         "BehaviorCoreEditor: RuntimeNode renderer enabled via MANIFOLD_RUNTIME_NODE_DEBUG=%s (%s)\n",
                         envMode,
                         editor_renderer::runtimeRendererModeToString(runtimeRendererMode_));
        }
    }
    if (rootMode_ == RootMode::RuntimeNode
        && (runtimeRendererMode_ == RuntimeRendererMode::Canvas
            || runtimeRendererMode_ == RuntimeRendererMode::ImGuiOverlay)) {
        runtimeRendererMode_ = RuntimeRendererMode::ImGuiDirect;
    }
    processorRef.getControlServer().setCurrentUIRendererMode(static_cast<int>(runtimeRendererMode_));

    auto& settings = Settings::getInstance();
    const auto settingsScript = settings.getDefaultUiScript();

    // Try to load the configured UI script
    if (settingsScript.isNotEmpty()) {
        const juce::File scriptFile(settingsScript);
        if (scriptFile.existsAsFile()) {
            usingLuaUi = luaEngine.loadScript(scriptFile);
            if (usingLuaUi) {
                std::fprintf(stderr, "BehaviorCoreEditor: Using Lua UI from %s\n",
                             scriptFile.getFullPathName().toRawUTF8());
            } else {
                std::fprintf(stderr, "BehaviorCoreEditor: Lua script failed: %s\n",
                             luaEngine.getLastError().c_str());
                showError("Lua UI failed to load:\n" + luaEngine.getLastError());
            }
        } else {
            // Fallback to empty launcher if configured script doesn't exist
            const auto devScriptsDir = settings.getDevScriptsDir();
            juce::File fallbackScript;

            if (devScriptsDir.isNotEmpty()) {
                fallbackScript = juce::File(devScriptsDir).getChildFile("empty_launcher.lua");
            }

            if (fallbackScript.existsAsFile()) {
                usingLuaUi = luaEngine.loadScript(fallbackScript);
                if (usingLuaUi) {
                    std::fprintf(stderr,
                                 "BehaviorCoreEditor: Configured UI script not found, using fallback shell: %s\n",
                                 fallbackScript.getFullPathName().toRawUTF8());
                } else {
                    std::fprintf(stderr, "BehaviorCoreEditor: Fallback shell failed to load: %s\n",
                                 luaEngine.getLastError().c_str());
                    showError("Fallback shell failed to load:\n" + luaEngine.getLastError());
                }
            } else {
                std::fprintf(stderr,
                             "BehaviorCoreEditor: UI script not found and no fallback available:\n"
                             "  Configured: %s\n"
                             "  devScriptsDir: %s\n"
                             "  -> Configure defaultUiScript or devScriptsDir in .manifold.settings.json\n",
                             settingsScript.toRawUTF8(), devScriptsDir.toRawUTF8());
                showError("UI script not found:\n"
                          "  Configure defaultUiScript or devScriptsDir in .manifold.settings.json\n");
            }
        }
    } else {
        // Fallback to empty launcher if settings.defaultUiScript is empty
        const auto devScriptsDir = settings.getDevScriptsDir();
        juce::File fallbackScript;

        if (devScriptsDir.isNotEmpty()) {
            fallbackScript = juce::File(devScriptsDir).getChildFile("empty_launcher.lua");
        }

        if (fallbackScript.existsAsFile()) {
            usingLuaUi = luaEngine.loadScript(fallbackScript);
            if (usingLuaUi) {
                std::fprintf(stderr,
                             "BehaviorCoreEditor: Settings.defaultUiScript is empty, using fallback shell: %s\n",
                             fallbackScript.getFullPathName().toRawUTF8());
            } else {
                std::fprintf(stderr, "BehaviorCoreEditor: Fallback shell failed to load: %s\n",
                             luaEngine.getLastError().c_str());
                showError("Fallback shell failed to load:\n" + luaEngine.getLastError());
            }
        } else {
            std::fprintf(stderr,
                         "BehaviorCoreEditor: No UI script configured and no fallback available.\n"
                         "  -> Configure defaultUiScript or devScriptsDir in .manifold.settings.json\n");
            showError("No UI script configured:\n"
                      "Configure defaultUiScript or devScriptsDir in .manifold.settings.json\n");
        }
    }

    processorRef.captureEditorOpenSnapshot();
    startTimerHz(exportPluginUi_ ? 20 : 30);
    resized();
}

BehaviorCoreEditor::~BehaviorCoreEditor() {
    stopTimer();
    recordingAccumulator_.clear();
    // Shut down the direct host first (detaches GL context, clears live tree pointer)
    directHost_.shutdown();
    // Then the old debug host
    runtimeNodeDebugHost.setRootNode(nullptr);
    runtimeNodeDebugHost.setVisible(false);

    // Fresh Bitwig coredumps point at sol::reference teardown inside
    // RuntimeNode::CallbackSlots / user data destruction on editor close/reopen.
    // Clear all Lua-owned callback/user-data refs while the Lua state is still alive,
    // before the RuntimeNode tree is destroyed as editor members unwind.
    luaEngine.clearAttachedUiLuaState();

    removeChildComponent(&runtimeNodeDebugHost);
    removeChildComponent(&directHost_);
    processorRef.getControlServer().setLuaEngine(nullptr);
    processorRef.getControlServer().setFrameTimings(nullptr);
}

void BehaviorCoreEditor::applyDeferredVisibilityChanges() {
    if (deferredVisibilityChanges.empty()) return;

    const auto applyStart = PerfClock::now();
    for (const auto& change : deferredVisibilityChanges) {
        if (change.host == nullptr) {
            continue;
        }

        if (change.visible) {
            if (change.host->getBounds() != change.bounds) {
                change.host->setBounds(change.bounds);
            }
            if (!change.host->isVisible()) {
                change.host->setVisible(true);
            }
            change.host->toFront(false);
            if (change.host == &perfOverlayHost) {
                perfOverlayHost.grabKeyboardFocus();
            }
        } else {
            const bool keepGlHostVisible = change.host == &perfOverlayHost
                || change.host == &mainScriptEditorHost
                || change.host == &scriptListHost
                || change.host == &hierarchyHost
                || change.host == &inspectorHost
                || change.host == &scriptInspectorHost;

            if (keepGlHostVisible) {
                if (!change.host->isVisible()) {
                    change.host->setVisible(true);
                }
                if (change.host->getBounds() != change.bounds) {
                    change.host->setBounds(change.bounds);
                }
            } else {
                if (change.host->isVisible()) {
                    change.host->setVisible(false);
                }
                if (change.host->getBounds() != change.bounds) {
                    change.host->setBounds(change.bounds);
                }
            }
        }
    }
    if (directHost_.isVisible()) {
        directHost_.toBack();
    }
    if (mainScriptEditorHost.isVisible()) {
        mainScriptEditorHost.toFront(false);
    }
    if (scriptListHost.isVisible()) {
        scriptListHost.toFront(false);
    }
    if (hierarchyHost.isVisible()) {
        hierarchyHost.toFront(false);
    }
    if (inspectorHost.isVisible()) {
        inspectorHost.toFront(false);
    }
    if (scriptInspectorHost.isVisible()) {
        scriptInspectorHost.toFront(false);
    }
    if (runtimeNodeDebugHost.isVisible()) {
        runtimeNodeDebugHost.toFront(false);
    }
    if (perfOverlayHost.isVisible()) {
        perfOverlayHost.toFront(false);
        perfOverlayHost.grabKeyboardFocus();
    }

    auto count = deferredVisibilityChanges.size();
    deferredVisibilityChanges.clear();
    std::string extra = std::to_string(count) + " hosts";
    editor_perf::logEditorPerf("applyDeferredVisibilityChanges", applyStart, extra.c_str());
}

void BehaviorCoreEditor::queueHostVisibilityChange(juce::Component& host, bool visible,
                                                 const juce::Rectangle<int>& bounds) {
    const auto targetBounds = visible ? bounds : juce::Rectangle<int>(0, 0, 0, 0);
    if (host.isVisible() != visible || host.getBounds() != targetBounds) {
        deferredVisibilityChanges.push_back({&host, visible, targetBounds});
    }
}

void BehaviorCoreEditor::timerCallback() {
    // Prevent back-to-back timer fires when callback overruns the period.
    // Without this, mouse events starve because the message thread never idles.
    stopTimer();

    using Clock = std::chrono::steady_clock;
    static auto lastCall = Clock::now();
    const auto now = Clock::now();
    const auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(now - lastCall).count();
    lastCall = now;

    static int logCount = 0;
    const auto timerStart = Clock::now();
    
    // Apply any deferred visibility changes first (outside of GUI event handling)
    applyDeferredVisibilityChanges();
    Canvas::finishPaintProfilingFrame();

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

    auto pendingRendererMode = processorRef.getAndClearPendingUIRendererMode();
    if (!pendingRendererMode.empty()) {
        setRuntimeRendererMode(editor_renderer::runtimeRendererModeFromString(pendingRendererMode, runtimeRendererMode_), true);
    }

    // Handle screenshot request
    auto pendingScreenshot = processorRef.getAndClearPendingScreenshot();
    if (!pendingScreenshot.empty()) {
        auto& req = processorRef.getControlServer().getScreenshotRequest();
        bool captured = false;
        juce::Image image;

        // Prefer OpenGL framebuffer capture when ImGuiDirectHost is active
        if (directHost_.isVisible()) {
            image = directHost_.captureScreenshot();
        }

        // Fallback: JUCE component snapshot (e.g. Canvas mode)
        if (!image.isValid()) {
            const int w = getWidth();
            const int h = getHeight();
            if (w > 0 && h > 0) {
                image = createComponentSnapshot(juce::Rectangle<int>(0, 0, w, h), true, 1.0f);
            }
        }

        if (image.isValid()) {
            juce::File outputFile(pendingScreenshot);
            std::unique_ptr<juce::FileOutputStream> stream(outputFile.createOutputStream());
            if (stream) {
                juce::PNGImageFormat pngFormat;
                if (pngFormat.writeImageToStream(image, *stream)) {
                    captured = true;
                    std::fprintf(stderr, "BehaviorCoreEditor: captured screenshot to %s\n", pendingScreenshot.c_str());
                }
                stream->flush();
            }
        }

        req.success.store(captured, std::memory_order_release);
        req.completed.store(true, std::memory_order_release);
    }

    // Handle recording frame capture (target 30 FPS)
    const bool isRecording = processorRef.getControlServer().isRecording();
    if (isRecording && !wasRecording_) {
        recordingAccumulator_.clear();
    } else if (!isRecording && wasRecording_) {
        auto& rec = processorRef.getControlServer().getRecordingState();
        std::string outputDir;
        {
            std::lock_guard<std::mutex> lock(rec.mutex);
            outputDir = rec.outputDir;
        }
        if (!outputDir.empty()) {
            editor_recording::flushRamFramesToDisk(
                recordingAccumulator_.takeAll(), outputDir, rec);
        }
    }
    wasRecording_ = isRecording;

    processorRef.processLinkPendingRequests();
    processorRef.drainPendingSlotDestroy();

    if (usingLuaUi) {
        luaEngine.notifyUpdate();
        int64_t animUs = 0;
        int64_t renderDispatchUs = 0;
        if (runtimeRendererMode_ != RuntimeRendererMode::Canvas) {
            const auto tAnimStart = Clock::now();
            const double deltaSeconds = static_cast<double>(elapsed) / 1000000.0;
            luaEngine.withLuaState([deltaSeconds](sol::state& L) {
                sol::object shellObj = L["_G"]["shell"];
                if (!shellObj.valid() || !shellObj.is<sol::table>()) {
                    return;
                }
                auto shellTable = shellObj.as<sol::table>();
                editor_shell::invokeShellMethodWithNumber(shellTable, "tickRetainedAnimations", deltaSeconds);
                editor_shell::invokeShellMethod(shellTable, "flushDeferredRefreshes");
            });
            const auto tAnimEnd = Clock::now();
            if (runtimeRendererMode_ == RuntimeRendererMode::ImGuiDirect) {
                // Sync debug outline and copyid mode state from Lua to DirectHost
                directHost_.setDebugOutlinesEnabled(luaEngine.areDebugOutlinesEnabled());
                directHost_.setCopyIdModeEnabled(luaEngine.isCopyIdModeEnabled());
                if (processorRef.getControlServer().isRecording()) {
                    // captureScreenshot() renders to EGL (headless) or renders,
                    // reads back, and presents the visible GL buffer (standalone).
                    // This is the only path that produces framebuffer content in both modes.
                    juce::Image frame = directHost_.captureScreenshot();
                    if (frame.isValid()) {
                        auto& rec = processorRef.getControlServer().getRecordingState();
                        RecordingOptions options;
                        std::string outputDir;
                        {
                            std::lock_guard<std::mutex> lock(rec.mutex);
                            options = rec.options;
                            outputDir = rec.outputDir;
                        }

                        if (options.cropEnabled) {
                            juce::Rectangle<int> crop(options.cropX, options.cropY, options.cropW, options.cropH);
                            if (!options.cropNodeId.empty() || options.cropStableId != 0) {
                                if (auto resolved = directHost_.getRenderedNodeBounds(options.cropNodeId, options.cropStableId)) {
                                    crop = *resolved;
                                }
                            }

                            const juce::Rectangle<int> bounds(0, 0, frame.getWidth(), frame.getHeight());
                            const auto clipped = crop.getIntersection(bounds);
                            if (!clipped.isEmpty()) {
                                frame = frame.getClippedImage(clipped);
                            }
                        }

                        if (options.streamFramesToDisk && !outputDir.empty()) {
                            const int frameNum = rec.frameCounter.fetch_add(1, std::memory_order_relaxed) + 1;
                            char framePath[512];
                            std::snprintf(framePath, sizeof(framePath), "%s/frame_%04d.tga",
                                          outputDir.c_str(), frameNum);
                            if (editor_recording::writeTga(frame, framePath)) {
                                std::lock_guard<std::mutex> lock(rec.mutex);
                                rec.framePaths.push_back(framePath);
                            }
                        } else {
                            if (recordingAccumulator_.tryAddFrame(frame)) {
                                rec.frameCounter.fetch_add(1, std::memory_order_relaxed);
                            }
                        }
                    }
                } else {
                    directHost_.renderNow();
                }
            } else {
                runtimeNodeDebugHost.refreshSnapshotNow();
                runtimeNodeDebugHost.repaint();
            }
            const auto tRenderEnd = Clock::now();
            animUs = std::chrono::duration_cast<std::chrono::microseconds>(tAnimEnd - tAnimStart).count();
            renderDispatchUs = std::chrono::duration_cast<std::chrono::microseconds>(tRenderEnd - tAnimEnd).count();
            static int timerLogCount = 0;
            if (++timerLogCount % 60 == 0) {
                std::fprintf(stderr, "[TimerBreak] anim=%lldus render=%lldus\n",
                             (long long)animUs,
                             (long long)renderDispatchUs);
            }
        }
        const auto tSyncStart = Clock::now();
        if (!exportPluginUi_) {
            syncImGuiHostsFromLuaShell();
        }
        const auto tSyncEnd = Clock::now();
        if (rootMode_ == RootMode::Canvas) {
            rootCanvas.requestTrackedRepaint();
        }
        updateRuntimeRendererPresentation();
        const auto tPresentEnd = Clock::now();
        {
            static int timerLogCount2 = 0;
            if (++timerLogCount2 % 60 == 0) {
                auto us = [](auto a, auto b) { return std::chrono::duration_cast<std::chrono::microseconds>(b - a).count(); };
                std::fprintf(stderr, "[TimerBreak2] sync=%lldus present=%lldus\n",
                             (long long)us(tSyncStart, tSyncEnd),
                             (long long)us(tSyncEnd, tPresentEnd));
            }
        }

        const int64_t totalUs = std::chrono::duration_cast<std::chrono::microseconds>(
            Clock::now() - timerStart).count();
        const int64_t pushStateUs =
            luaEngine.frameTimings.pushState.currentUs.load(std::memory_order_relaxed);
        const int64_t eventListenersUs =
            luaEngine.frameTimings.eventListeners.currentUs.load(std::memory_order_relaxed);
        const int64_t uiUpdateUs =
            luaEngine.frameTimings.uiUpdate.currentUs.load(std::memory_order_relaxed);
        const int64_t paintUs = Canvas::getLastFrameAccumulatedPaintUs();
        const int64_t syncHostsUs = std::chrono::duration_cast<std::chrono::microseconds>(tSyncEnd - tSyncStart).count();
        const int64_t presentUs = std::chrono::duration_cast<std::chrono::microseconds>(tPresentEnd - tSyncEnd).count();
        const int64_t overBudgetUs = std::max<int64_t>(0, totalUs - 33333);
        const int64_t canvasRepaintLeadUs = (rootMode_ == RootMode::Canvas)
            ? rootCanvas.getLastTrackedRepaintLeadUs()
            : 0;

        const auto imguiStats = [&]() {
            if (runtimeRendererMode_ == RuntimeRendererMode::ImGuiDirect || exportPluginUi_) {
                return directHost_.getStatsSnapshot();
            }
            const auto mainImguiStats = mainScriptEditorHost.getStatsSnapshot();
            return ImGuiDirectHost::StatsSnapshot{
                mainImguiStats.contextReady,
                mainImguiStats.testWindowVisible,
                mainImguiStats.wantCaptureMouse,
                mainImguiStats.wantCaptureKeyboard,
                mainImguiStats.documentLoaded,
                mainImguiStats.documentDirty,
                mainImguiStats.frameCount,
                mainImguiStats.lastRenderUs,
                mainImguiStats.lastVertexCount,
                mainImguiStats.lastIndexCount,
                mainImguiStats.buttonClicks,
                mainImguiStats.documentLineCount,
                0,
                0,
                0,
                0,
            };
        }();

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
        luaEngine.frameTimings.gpuFontAtlasBytes.store(imguiStats.fontAtlasBytes,
                                                       std::memory_order_relaxed);
        luaEngine.frameTimings.gpuSurfaceColorBytes.store(imguiStats.surfaceColorBytes,
                                                          std::memory_order_relaxed);
        luaEngine.frameTimings.gpuSurfaceDepthBytes.store(imguiStats.surfaceDepthBytes,
                                                          std::memory_order_relaxed);
        luaEngine.frameTimings.gpuTotalBytes.store(imguiStats.totalGpuBytes,
                                                   std::memory_order_relaxed);
        luaEngine.frameTimings.renderSnapshotBytes.store(imguiStats.renderSnapshotBytes,
                                                         std::memory_order_relaxed);
        luaEngine.frameTimings.renderSnapshotNodeCount.store(imguiStats.renderSnapshotNodeCount,
                                                             std::memory_order_relaxed);
        luaEngine.frameTimings.customSurfaceStateBytes.store(imguiStats.customSurfaceStateBytes,
                                                             std::memory_order_relaxed);
        luaEngine.frameTimings.imguiWindowCount.store(imguiStats.imguiWindowCount,
                                                      std::memory_order_relaxed);
        luaEngine.frameTimings.imguiTableCount.store(imguiStats.imguiTableCount,
                                                     std::memory_order_relaxed);
        luaEngine.frameTimings.imguiTabBarCount.store(imguiStats.imguiTabBarCount,
                                                      std::memory_order_relaxed);
        luaEngine.frameTimings.imguiViewportCount.store(imguiStats.imguiViewportCount,
                                                        std::memory_order_relaxed);
        luaEngine.frameTimings.imguiFontCount.store(imguiStats.imguiFontCount,
                                                    std::memory_order_relaxed);
        luaEngine.frameTimings.imguiWindowStateBytes.store(imguiStats.imguiWindowStateBytes,
                                                           std::memory_order_relaxed);
        luaEngine.frameTimings.imguiDrawBufferBytes.store(imguiStats.imguiDrawBufferBytes,
                                                          std::memory_order_relaxed);
        luaEngine.frameTimings.imguiInternalStateBytes.store(imguiStats.imguiInternalStateBytes,
                                                             std::memory_order_relaxed);
        luaEngine.frameTimings.imguiDocumentLoaded.store(imguiStats.documentLoaded,
                                                         std::memory_order_relaxed);
        luaEngine.frameTimings.imguiDocumentDirty.store(imguiStats.documentDirty,
                                                        std::memory_order_relaxed);
        luaEngine.frameTimings.imguiDocumentLineCount.store(imguiStats.documentLineCount,
                                                            std::memory_order_relaxed);
        luaEngine.frameTimings.totalPaintAccumulatedUs.store(paintUs,
                                                             std::memory_order_relaxed);

        // CPU and memory tracking
        {
            const auto cpuNow = Clock::now();
            if (lastCpuCheck_.time_since_epoch().count() == 0) {
                lastCpuCheck_ = cpuNow;
                lastCpuTime_ = std::chrono::microseconds(totalUs);
            } else {
                const auto wallTime = std::chrono::duration_cast<std::chrono::microseconds>(cpuNow - lastCpuCheck_).count();
                const auto cpuTime = totalUs;
                if (wallTime > 0) {
                    float cpuPercent = static_cast<float>(cpuTime) / static_cast<float>(wallTime) * 100.0f;
                    cpuPercent = std::min(100.0f, std::max(0.0f, cpuPercent));
                    luaEngine.frameTimings.cpuPercent.store(cpuPercent, std::memory_order_relaxed);
                }
                lastCpuCheck_ = cpuNow;
            }

            if (perfOverlayHost.isVisible() || runtimeNodeDebugHost.isVisible()) {
                const auto mem = editor_perf::readProcessMemorySnapshot();
                luaEngine.frameTimings.processPssBytes.store(mem.pssBytes, std::memory_order_relaxed);
                luaEngine.frameTimings.privateDirtyBytes.store(mem.privateDirtyBytes, std::memory_order_relaxed);

            if (auto* root = getActiveRootRuntimeNode()) {
                const auto runtimeStats = root->estimateMemoryUsage();
                luaEngine.frameTimings.runtimeNodeCount.store(static_cast<int64_t>(runtimeStats.nodeCount), std::memory_order_relaxed);
                luaEngine.frameTimings.runtimeNodeBytes.store(runtimeStats.nodeBytes + runtimeStats.stringBytes + runtimeStats.vectorBytes,
                                                              std::memory_order_relaxed);
                luaEngine.frameTimings.runtimeCallbackCount.store(static_cast<int64_t>(runtimeStats.callbackCount), std::memory_order_relaxed);
                luaEngine.frameTimings.runtimeUserDataEntries.store(static_cast<int64_t>(runtimeStats.userDataEntries), std::memory_order_relaxed);
                luaEngine.frameTimings.runtimeUserDataBytes.store(runtimeStats.userDataBytes, std::memory_order_relaxed);
                luaEngine.frameTimings.runtimeCustomPayloadBytes.store(runtimeStats.customPayloadBytes, std::memory_order_relaxed);
                luaEngine.frameTimings.displayListCount.store(static_cast<int64_t>(runtimeStats.compiledDisplayListCount), std::memory_order_relaxed);
                luaEngine.frameTimings.displayListCommandCount.store(static_cast<int64_t>(runtimeStats.compiledDisplayListCommands), std::memory_order_relaxed);
                luaEngine.frameTimings.displayListBytes.store(runtimeStats.compiledDisplayListBytes, std::memory_order_relaxed);
            } else {
                luaEngine.frameTimings.runtimeNodeCount.store(0, std::memory_order_relaxed);
                luaEngine.frameTimings.runtimeNodeBytes.store(0, std::memory_order_relaxed);
                luaEngine.frameTimings.runtimeCallbackCount.store(0, std::memory_order_relaxed);
                luaEngine.frameTimings.runtimeUserDataEntries.store(0, std::memory_order_relaxed);
                luaEngine.frameTimings.runtimeUserDataBytes.store(0, std::memory_order_relaxed);
                luaEngine.frameTimings.runtimeCustomPayloadBytes.store(0, std::memory_order_relaxed);
                luaEngine.frameTimings.displayListCount.store(0, std::memory_order_relaxed);
                luaEngine.frameTimings.displayListCommandCount.store(0, std::memory_order_relaxed);
                luaEngine.frameTimings.displayListBytes.store(0, std::memory_order_relaxed);
            }

            const auto currentScriptFile = luaEngine.getCurrentScriptFile();
            luaEngine.frameTimings.scriptSourceBytes.store(currentScriptFile.existsAsFile()
                                                               ? static_cast<int64_t>(currentScriptFile.getSize())
                                                               : 0,
                                                           std::memory_order_relaxed);

            const auto luaStats = luaEngine.getMemoryStats();
            luaEngine.frameTimings.luaGlobalCount.store(luaStats.globalCount, std::memory_order_relaxed);
            luaEngine.frameTimings.luaRegistryEntryCount.store(luaStats.registryEntryCount, std::memory_order_relaxed);
            luaEngine.frameTimings.luaPackageLoadedCount.store(luaStats.packageLoadedCount, std::memory_order_relaxed);
            luaEngine.frameTimings.luaOscPathCount.store(luaStats.oscPathCount, std::memory_order_relaxed);
            luaEngine.frameTimings.luaOscCallbackCount.store(luaStats.oscCallbackCount, std::memory_order_relaxed);
            luaEngine.frameTimings.luaOscQueryHandlerCount.store(luaStats.oscQueryHandlerCount, std::memory_order_relaxed);
            luaEngine.frameTimings.luaEventListenerCount.store(luaStats.eventListenerCount, std::memory_order_relaxed);
            luaEngine.frameTimings.luaManagedDspSlotCount.store(luaStats.managedDspSlotCount, std::memory_order_relaxed);
            luaEngine.frameTimings.luaOverlayCacheCount.store(luaStats.overlayCacheCount, std::memory_order_relaxed);

            const auto endpointStats = processorRef.getEndpointRegistry().getStats();
            luaEngine.frameTimings.endpointTotalCount.store(endpointStats.totalCount, std::memory_order_relaxed);
            luaEngine.frameTimings.endpointCustomCount.store(endpointStats.customCount, std::memory_order_relaxed);
            luaEngine.frameTimings.endpointPathBytes.store(endpointStats.pathBytes, std::memory_order_relaxed);
            luaEngine.frameTimings.endpointDescriptionBytes.store(endpointStats.descriptionBytes, std::memory_order_relaxed);
            luaEngine.frameTimings.dspHostCount.store(1 + static_cast<int64_t>(processorRef.getManagedDspHostCount()), std::memory_order_relaxed);
            luaEngine.frameTimings.dspScriptSourceBytes.store(static_cast<int64_t>(processorRef.getPrimaryDspScriptSizeBytes()), std::memory_order_relaxed);

            const auto alloc = editor_perf::readGlibcAllocatorSnapshot();
            luaEngine.frameTimings.glibcHeapUsedBytes.store(alloc.heapUsedBytes, std::memory_order_relaxed);
            luaEngine.frameTimings.glibcArenaBytes.store(alloc.arenaBytes, std::memory_order_relaxed);
            luaEngine.frameTimings.glibcMmapBytes.store(alloc.mmapBytes, std::memory_order_relaxed);
            luaEngine.frameTimings.glibcFreeHeldBytes.store(alloc.freeHeldBytes, std::memory_order_relaxed);
            luaEngine.frameTimings.glibcReleasableBytes.store(alloc.releasableBytes, std::memory_order_relaxed);
            luaEngine.frameTimings.glibcArenaCount.store(alloc.arenaCount, std::memory_order_relaxed);

            int64_t luaHeapBytes = 0;
            luaEngine.withLuaState([&luaHeapBytes](sol::state& lua) {
                sol::protected_function collectgarbage = lua["collectgarbage"];
                if (!collectgarbage.valid()) {
                    return;
                }
                auto result = collectgarbage("count");
                if (result.valid() && result.get_type() == sol::type::number) {
                    const double kb = result.get<double>();
                    luaHeapBytes = static_cast<int64_t>(kb * 1024.0);
                }
            });
            luaEngine.frameTimings.luaHeapBytes.store(luaHeapBytes, std::memory_order_relaxed);

            const auto pluginBaselinePss = processorRef.getPluginBaselinePssBytes();
            const auto pluginBaselinePriv = processorRef.getPluginBaselinePrivateDirtyBytes();
            const auto pluginBaselineHeap = processorRef.getPluginBaselineHeapBytes();
            const auto pluginBaselineArena = processorRef.getPluginBaselineArenaBytes();
            luaEngine.frameTimings.pluginDeltaPssBytes.store(mem.pssBytes - pluginBaselinePss, std::memory_order_relaxed);
            luaEngine.frameTimings.pluginDeltaPrivateDirtyBytes.store(mem.privateDirtyBytes - pluginBaselinePriv, std::memory_order_relaxed);
            luaEngine.frameTimings.pluginDeltaHeapBytes.store(alloc.heapUsedBytes - pluginBaselineHeap, std::memory_order_relaxed);
            luaEngine.frameTimings.pluginDeltaArenaBytes.store(alloc.arenaBytes - pluginBaselineArena, std::memory_order_relaxed);

            const auto editorOpenPss = processorRef.getEditorOpenPssBytes();
            const auto editorOpenPriv = processorRef.getEditorOpenPrivateDirtyBytes();
            const auto editorOpenHeap = processorRef.getEditorOpenHeapBytes();
            luaEngine.frameTimings.uiDeltaPssBytes.store(editorOpenPss > 0 ? (mem.pssBytes - editorOpenPss) : 0,
                                                         std::memory_order_relaxed);
            luaEngine.frameTimings.uiDeltaPrivateDirtyBytes.store(editorOpenPriv > 0 ? (mem.privateDirtyBytes - editorOpenPriv) : 0,
                                                                  std::memory_order_relaxed);
            luaEngine.frameTimings.uiDeltaHeapBytes.store(editorOpenHeap > 0 ? (alloc.heapUsedBytes - editorOpenHeap) : 0,
                                                          std::memory_order_relaxed);
            luaEngine.frameTimings.afterLuaInitDeltaPssBytes.store(processorRef.getAfterLuaInitDeltaPssBytes(),
                                                                   std::memory_order_relaxed);
            luaEngine.frameTimings.afterLuaInitDeltaPrivateDirtyBytes.store(processorRef.getAfterLuaInitDeltaPrivateDirtyBytes(),
                                                                            std::memory_order_relaxed);
            luaEngine.frameTimings.afterBindingsDeltaPssBytes.store(processorRef.getAfterBindingsDeltaPssBytes(),
                                                                    std::memory_order_relaxed);
            luaEngine.frameTimings.afterBindingsDeltaPrivateDirtyBytes.store(processorRef.getAfterBindingsDeltaPrivateDirtyBytes(),
                                                                             std::memory_order_relaxed);
            luaEngine.frameTimings.afterScriptLoadDeltaPssBytes.store(processorRef.getAfterScriptLoadDeltaPssBytes(),
                                                                      std::memory_order_relaxed);
            luaEngine.frameTimings.afterScriptLoadDeltaPrivateDirtyBytes.store(processorRef.getAfterScriptLoadDeltaPrivateDirtyBytes(),
                                                                               std::memory_order_relaxed);
            luaEngine.frameTimings.afterDspDeltaPssBytes.store(processorRef.getAfterDspDeltaPssBytes(),
                                                               std::memory_order_relaxed);
            luaEngine.frameTimings.afterDspDeltaPrivateDirtyBytes.store(processorRef.getAfterDspDeltaPrivateDirtyBytes(),
                                                                       std::memory_order_relaxed);
            luaEngine.frameTimings.afterUiOpenDeltaPssBytes.store(processorRef.getAfterUiOpenDeltaPssBytes(),
                                                                  std::memory_order_relaxed);
            luaEngine.frameTimings.afterUiOpenDeltaPrivateDirtyBytes.store(processorRef.getAfterUiOpenDeltaPrivateDirtyBytes(),
                                                                          std::memory_order_relaxed);
                luaEngine.frameTimings.afterUiIdleDeltaPssBytes.store(processorRef.getAfterUiIdleDeltaPssBytes(),
                                                                      std::memory_order_relaxed);
                luaEngine.frameTimings.afterUiIdleDeltaPrivateDirtyBytes.store(processorRef.getAfterUiIdleDeltaPrivateDirtyBytes(),
                                                                              std::memory_order_relaxed);
            }

            if (!uiIdleSnapshotCaptured_ && exportPluginUi_ && uiIdleSnapshotCountdown_ > 0) {
                --uiIdleSnapshotCountdown_;
                if (uiIdleSnapshotCountdown_ == 0) {
                    processorRef.captureUiIdleSnapshot();
                    uiIdleSnapshotCaptured_ = true;
                }
            }
        }

        luaEngine.frameTimings.update(totalUs, pushStateUs, eventListenersUs,
                                      uiUpdateUs, paintUs,
                                      animUs, renderDispatchUs,
                                      syncHostsUs, presentUs,
                                      overBudgetUs, canvasRepaintLeadUs);

        juce::ignoreUnused(logCount, elapsed);
    } else if (errorNode == nullptr) {
        updateRuntimeRendererPresentation();
    } else {
        runtimeNodeDebugHost.setVisible(false);
    }

    // Reschedule from now so mouse events get processed between callbacks.
    // Do not pin the message thread at 60 Hz while ImGui is capturing input:
    // direct-mode renders already cost ~a frame on some drivers, so the old
    // capture-timer boost starved the event queue and made docking feel like ass.
    // Captured input now requests redraws directly from ImGuiDirectHost.
    int nextTimerHz = exportPluginUi_ ? 20 : 30;
    // Ensure 30 FPS frame capture during recording
    if (processorRef.getControlServer().isRecording()) {
        nextTimerHz = 30;
    }
    startTimerHz(nextTimerHz);
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
    static editor_perf::HostLayoutTraceState mainScriptHostTrace;
    static editor_perf::HostLayoutTraceState scriptListHostTrace;
    static editor_perf::HostLayoutTraceState hierarchyHostTrace;
    static editor_perf::HostLayoutTraceState inspectorHostTrace;
    static editor_perf::HostLayoutTraceState scriptInspectorHostTrace;

    const auto mainStatsBefore = mainScriptEditorHost.getStatsSnapshot();
    const std::string rendererModeLabel = editor_renderer::runtimeRendererModeToString(runtimeRendererMode_);
    const auto mainIdentityBefore = mainScriptEditorHost.getDocumentIdentity();
    const auto mainTextBefore = mainScriptEditorHost.getCurrentText();
    const auto mainActions = mainScriptEditorHost.consumeActionRequests();
    const auto scriptListActions = scriptListHost.consumeActionRequests();
    const auto hierarchyActions = hierarchyHost.consumeActionRequests();
    const auto inspectorActions = inspectorHost.consumeActionRequests();
    const auto scriptInspectorActions = scriptInspectorHost.consumeActionRequests();

    HostConfig mainConfig;
    ScriptListHostConfig scriptListConfig;
    HierarchyHostConfig hierarchyConfig;
    InspectorHostConfig inspectorConfig;
    InspectorHostConfig scriptInspectorConfig;
    PerfOverlayHostConfig perfOverlayConfig;

    const auto luaStateStart = PerfClock::now();
    luaEngine.withLuaState([&](sol::state& lua) {
        lua["__manifoldImguiScriptListActive"] = false;
        lua["__manifoldImguiHierarchyActive"] = false;
        lua["__manifoldImguiInspectorActive"] = false;

        sol::object shellObj = lua["shell"];
        if (!shellObj.valid() || !shellObj.is<sol::table>()) {
            return;
        }

        sol::table shell = shellObj.as<sol::table>();

        editor_shell::syncMainEditorBackToShell(shell, mainStatsBefore, mainIdentityBefore, mainTextBefore);
        editor_shell::applyMainEditorActions(shell, mainActions);

        editor_shell::applyScriptListActions(shell, scriptListActions);
        editor_shell::applyHierarchyActions(shell, hierarchyActions);

        editor_shell::applyInspectorActions(shell, inspectorActions);
        editor_shell::applyScriptInspectorActions(shell, scriptInspectorActions);

        const std::string shellMode = shell["mode"].get_or(std::string{});
        sol::object surfacesObj = shell["surfaces"];
        editor_shell::buildMainEditorConfig(shell, surfacesObj, mainConfig);

        const std::string leftPanelMode = shell["leftPanelMode"].get_or(std::string{});

        editor_shell::buildHierarchyAndInspectorConfig(lua, shell, surfacesObj, hierarchyConfig, inspectorConfig);
        editor_shell::buildScriptListConfig(lua, shell, surfacesObj, scriptListConfig);
        editor_shell::buildScriptInspectorConfig(lua, shell, surfacesObj, shellMode, leftPanelMode,
                                   scriptInspectorConfig);
        editor_shell::buildPerfOverlayConfig(luaEngine, lua, shell,
                               mainConfig, scriptListConfig, hierarchyConfig, inspectorConfig,
                               rendererModeLabel,
                               perfOverlayConfig);
    });
    editor_perf::logEditorPerf("syncImGuiHostsFromLuaShell.luaState", luaStateStart);

    const auto hostApplyStart = PerfClock::now();
    applyMainEditorHostConfig(mainScriptHostTrace, mainScriptEditorHost, mainConfig);
    queueHostVisibilityChange(mainScriptEditorHost, mainConfig.visible, mainConfig.bounds);

    applyHierarchyHostConfig(hierarchyHostTrace, hierarchyHost, hierarchyConfig);
    queueHostVisibilityChange(hierarchyHost, hierarchyConfig.visible, hierarchyConfig.bounds);

    applyScriptListHostConfig(scriptListHostTrace, scriptListHost, scriptListConfig);
    queueHostVisibilityChange(scriptListHost, scriptListConfig.visible, scriptListConfig.bounds);

    applyInspectorHostConfig(inspectorHostTrace, inspectorHost, inspectorConfig);
    queueHostVisibilityChange(inspectorHost, inspectorConfig.visible, inspectorConfig.bounds);

    applyScriptInspectorHostConfig(scriptInspectorHostTrace, scriptInspectorHost, scriptInspectorConfig);
    queueHostVisibilityChange(scriptInspectorHost, scriptInspectorConfig.visible, scriptInspectorConfig.bounds);

    applyPerfOverlayHostConfig(perfOverlayHost, perfOverlayConfig);
    queueHostVisibilityChange(perfOverlayHost, perfOverlayConfig.visible, perfOverlayConfig.bounds);

    luaEngine.frameTimings.shellMainEditorTextBytes.store(static_cast<int64_t>(mainConfig.text.size()), std::memory_order_relaxed);
    luaEngine.frameTimings.shellScriptListRowCount.store(static_cast<int64_t>(scriptListConfig.rows.size()), std::memory_order_relaxed);
    luaEngine.frameTimings.shellScriptListBytes.store(editor_perf::estimateScriptListRowsBytes(scriptListConfig.rows), std::memory_order_relaxed);
    luaEngine.frameTimings.shellHierarchyRowCount.store(static_cast<int64_t>(hierarchyConfig.rows.size()), std::memory_order_relaxed);
    luaEngine.frameTimings.shellHierarchyBytes.store(editor_perf::estimateHierarchyRowsBytes(hierarchyConfig.rows), std::memory_order_relaxed);
    luaEngine.frameTimings.shellInspectorRowCount.store(static_cast<int64_t>(inspectorConfig.rows.size()), std::memory_order_relaxed);
    luaEngine.frameTimings.shellInspectorBytes.store(editor_perf::estimateInspectorRowsBytes(inspectorConfig.rows, inspectorConfig.activeProperty), std::memory_order_relaxed);
    luaEngine.frameTimings.shellScriptInspectorBytes.store(editor_perf::estimateScriptInspectorBytes(scriptInspectorConfig.scriptData), std::memory_order_relaxed);

    editor_perf::logEditorPerf("syncImGuiHostsFromLuaShell.applyHosts", hostApplyStart);
    editor_perf::logEditorPerf("syncImGuiHostsFromLuaShell.total", totalStart);
}

void BehaviorCoreEditor::resized() {
    luaEngine.frameTimings.editorWidth.store(getWidth(), std::memory_order_relaxed);
    luaEngine.frameTimings.editorHeight.store(getHeight(), std::memory_order_relaxed);
    if (exportPluginUi_) {
        processorRef.setExportEditorSize(getWidth(), getHeight());
    }
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
    if (rootRuntime_ != nullptr) {
        rootRuntime_->setBounds(0, 0, getWidth(), getHeight());
    }
    updateRuntimeRendererPresentation();

    if (usingLuaUi) {
        luaEngine.notifyResized(getWidth(), getHeight());
        if (runtimeRendererMode_ != RuntimeRendererMode::Canvas) {
            luaEngine.withLuaState([](sol::state& L) {
                sol::object shellObj = L["_G"]["shell"];
                if (!shellObj.valid() || !shellObj.is<sol::table>()) {
                    return;
                }
                auto shellTable = shellObj.as<sol::table>();
                editor_shell::invokeShellMethod(shellTable, "flushDeferredRefreshes");
            });
            runtimeNodeDebugHost.setRootNode(getActiveRootRuntimeNode());
        }
        if (!exportPluginUi_) {
            syncImGuiHostsFromLuaShell();
        }
    } else if (errorNode != nullptr) {
        errorNode->setBounds(rootCanvas.getLocalBounds());
        mainScriptEditorHost.setBounds(0, 0, 0, 0);
        scriptListHost.setBounds(0, 0, 0, 0);
        hierarchyHost.setBounds(0, 0, 0, 0);
        inspectorHost.setBounds(0, 0, 0, 0);
        scriptInspectorHost.setBounds(0, 0, 0, 0);
        runtimeNodeDebugHost.setBounds(0, 0, 0, 0);
    }
}

bool BehaviorCoreEditor::keyPressed(const juce::KeyPress& key) {
    if (exportPluginUi_) {
        const auto ch = static_cast<int>(key.getTextCharacter());
        if (ch == '`' || ch == '~') {
            const float current = processorRef.getParamByPath("/plugin/ui/devVisible");
            processorRef.setParamByPath("/plugin/ui/devVisible", current > 0.5f ? 0.0f : 1.0f);
            return true;
        }
    }
    return juce::AudioProcessorEditor::keyPressed(key);
}

void BehaviorCoreEditor::showError(const std::string& message) {
    errorMessage = message;
    if (rootRuntime_ != nullptr) {
        rootRuntime_->clearChildren();
    }
    rootCanvas.clearChildren();
    rootCanvas.setBounds(getLocalBounds());
    rootCanvas.setVisible(true);
    rootCanvas.toFront(false);

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

std::string BehaviorCoreEditor::exportStateContract() const {
    juce::DynamicObject::Ptr root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);
    root->setProperty("rootMode", rootMode_ == RootMode::RuntimeNode ? "RuntimeNode" : "Canvas");
    root->setProperty("rendererMode", editor_renderer::runtimeRendererModeToString(runtimeRendererMode_));
    root->setProperty("usingLuaUi", usingLuaUi);
    root->setProperty("exportPluginUi", exportPluginUi_);
    root->setProperty("directHostNeedsInitialFocus", directHostNeedsInitialFocus_);
    root->setProperty("hasErrorNode", errorNode != nullptr);
    root->setProperty("errorMessage", juce::String(errorMessage));
    root->setProperty("uiIdleSnapshotCaptured", uiIdleSnapshotCaptured_);
    root->setProperty("uiIdleSnapshotCountdown", uiIdleSnapshotCountdown_);
    root->setProperty("ramFramesBytes", static_cast<double>(recordingAccumulator_.ramFramesBytes));

    const auto scriptFile = luaEngine.getCurrentScriptFile();
    root->setProperty("luaScriptLoaded", canonicalContractPath(scriptFile));
    root->setProperty("luaScriptError", juce::String(luaEngine.getLastError()));

    juce::DynamicObject::Ptr shellObj = new juce::DynamicObject();
    shellObj->setProperty("exists", false);
    shellObj->setProperty("mode", juce::String());
    shellObj->setProperty("leftPanelMode", juce::String());
    shellObj->setProperty("title", juce::String());
    shellObj->setProperty("surfaceCount", 0);
    luaEngine.withLuaState([&](const sol::state& L) {
        sol::object shellValue = L["_G"]["shell"];
        if (!shellValue.valid() || !shellValue.is<sol::table>()) {
            return;
        }
        shellObj->setProperty("exists", true);
        const auto shell = shellValue.as<sol::table>();
        shellObj->setProperty("mode", juce::String(shell["mode"].get_or(std::string{})));
        shellObj->setProperty("leftPanelMode", juce::String(shell["leftPanelMode"].get_or(std::string{})));
        shellObj->setProperty("title", juce::String(shell["title"].get_or(std::string{})));
        int surfaceCount = 0;
        sol::object surfacesValue = shell["surfaces"];
        if (surfacesValue.valid() && surfacesValue.is<sol::table>()) {
            const auto surfaces = surfacesValue.as<sol::table>();
            for (const auto& _ : surfaces) {
                juce::ignoreUnused(_);
                ++surfaceCount;
            }
        }
        shellObj->setProperty("surfaceCount", surfaceCount);
    });
    root->setProperty("shell", juce::var(shellObj.get()));

    auto hostStateFor = [](const juce::Component& host) {
        juce::DynamicObject::Ptr obj = new juce::DynamicObject();
        obj->setProperty("visible", host.isVisible());
        obj->setProperty("x", host.getX());
        obj->setProperty("y", host.getY());
        obj->setProperty("w", host.getWidth());
        obj->setProperty("h", host.getHeight());
        return juce::var(obj.get());
    };

    juce::DynamicObject::Ptr hosts = new juce::DynamicObject();
    hosts->setProperty("mainScriptEditor", hostStateFor(mainScriptEditorHost));
    hosts->setProperty("scriptList", hostStateFor(scriptListHost));
    hosts->setProperty("hierarchy", hostStateFor(hierarchyHost));
    hosts->setProperty("inspector", hostStateFor(inspectorHost));
    hosts->setProperty("scriptInspector", hostStateFor(scriptInspectorHost));
    hosts->setProperty("perfOverlay", hostStateFor(perfOverlayHost));
    hosts->setProperty("runtimeNodeDebug", hostStateFor(runtimeNodeDebugHost));
    hosts->setProperty("directHost", hostStateFor(directHost_));
    root->setProperty("hosts", juce::var(hosts.get()));

    juce::DynamicObject::Ptr frameTimings = new juce::DynamicObject();
    const auto& ft = luaEngine.frameTimings;
    frameTimings->setProperty("frameCount", static_cast<double>(ft.frameCount.load(std::memory_order_relaxed)));
    frameTimings->setProperty("totalUs", static_cast<double>(ft.total.currentUs.load(std::memory_order_relaxed)));
    frameTimings->setProperty("pushStateUs", static_cast<double>(ft.pushState.currentUs.load(std::memory_order_relaxed)));
    frameTimings->setProperty("eventListenersUs", static_cast<double>(ft.eventListeners.currentUs.load(std::memory_order_relaxed)));
    frameTimings->setProperty("uiUpdateUs", static_cast<double>(ft.uiUpdate.currentUs.load(std::memory_order_relaxed)));
    frameTimings->setProperty("paintUs", static_cast<double>(ft.paint.currentUs.load(std::memory_order_relaxed)));
    frameTimings->setProperty("luaHeapBytes", static_cast<double>(ft.luaHeapBytes.load(std::memory_order_relaxed)));
    frameTimings->setProperty("cpuPercent", static_cast<double>(ft.cpuPercent.load(std::memory_order_relaxed)));
    root->setProperty("frameTimings", juce::var(frameTimings.get()));

    return juce::JSON::toString(juce::var(root.get())).toStdString();
}
