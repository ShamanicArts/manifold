#include "BehaviorCoreEditor.h"
#include "BehaviorCoreProcessor.h"
#include "../primitives/core/Settings.h"
#include "../primitives/ui/Canvas.h"

#include <chrono>
#include <cstdio>

BehaviorCoreEditor::BehaviorCoreEditor(BehaviorCoreProcessor& ownerProcessor)
    : juce::AudioProcessorEditor(&ownerProcessor), processorRef(ownerProcessor) {
    setSize(1000, 640);

    addAndMakeVisible(rootCanvas);
    luaEngine.initialise(&processorRef, &rootCanvas);
    processorRef.getControlServer().setFrameTimings(&luaEngine.frameTimings);
    processorRef.getControlServer().setLuaEngine(&luaEngine);

    // Load settings
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

    // JUCE Timer at 30Hz - message thread based, reliable timing for UI
    // (60Hz target is capped to ~30Hz by message queue on Linux anyway)
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
    
    // Always log the actual interval and work time
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

    // Process pending Link tempo requests from main thread
    processorRef.processLinkPendingRequests();

    // Drain any deferred DSP-slot host destruction after UI switch/update.
    processorRef.drainPendingSlotDestroy();

    if (usingLuaUi) {
        luaEngine.notifyUpdate();
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

        luaEngine.frameTimings.update(totalUs, pushStateUs, eventListenersUs,
                                      uiUpdateUs, paintUs);
        
        // Log interval vs work time
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

void BehaviorCoreEditor::resized() {
    rootCanvas.setBounds(getLocalBounds());
    if (usingLuaUi) {
        luaEngine.notifyResized(rootCanvas.getWidth(), rootCanvas.getHeight());
    } else if (errorNode != nullptr) {
        errorNode->setBounds(rootCanvas.getLocalBounds());
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
