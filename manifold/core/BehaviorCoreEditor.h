#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "../primitives/scripting/LuaEngine.h"
#include "../primitives/ui/Canvas.h"
#include "../primitives/ui/RuntimeNode.h"
#include "../ui/imgui/ImGuiHost.h"
#include "../ui/imgui/ImGuiScriptListHost.h"
#include "../ui/imgui/ImGuiHierarchyHost.h"
#include "../ui/imgui/ImGuiInspectorHost.h"
#include "../ui/imgui/ImGuiPerfOverlayHost.h"
#include "../ui/imgui/ImGuiRuntimeNodeHost.h"
#include "../ui/imgui/ImGuiDirectHost.h"
#include "EditorRecordingSupport.h"
#include "EditorRendererSupport.h"
#include "EditorPerfSupport.h"
#include "EditorLifecycleSupport.h"

#include <cstddef>
#include <memory>
#include <mutex>
#include <thread>
#include <queue>
#include <atomic>
#include <condition_variable>

class BehaviorCoreProcessor;

class BehaviorCoreEditor : public juce::AudioProcessorEditor,
                           private juce::Timer {
public:
    enum class RootMode {
        Canvas = 0,
        RuntimeNode = 1,
    };

    explicit BehaviorCoreEditor(BehaviorCoreProcessor& ownerProcessor,
                                RootMode rootMode = RootMode::RuntimeNode);
    ~BehaviorCoreEditor() override;

    void paint(juce::Graphics& g) override;
    void resized() override;
    bool keyPressed(const juce::KeyPress& key) override;

    // Export comprehensive editor state contract as JSON for contract-testing
    // harness. Captures root mode, renderer mode, Lua UI state, host visibility,
    // and frame timings.
    std::string exportStateContract() const;

private:
    using RuntimeRendererMode = editor_renderer::RuntimeRendererMode;

    void timerCallback() override;
    void syncImGuiHostsFromLuaShell();
    void showError(const std::string& message);
    RuntimeNode* getActiveRootRuntimeNode();
    void setRuntimeRendererMode(RuntimeRendererMode mode, bool logChange = true);
    void updateRuntimeRendererPresentation();
    editor_lifecycle::HostRole deferredHostRole(const juce::Component& host) const;
    
    // Deferred visibility changes to avoid blocking GUI thread during OpenGL context creation
    struct DeferredVisibility {
        juce::Component* host;
        bool visible;
        juce::Rectangle<int> bounds;
    };
    std::vector<DeferredVisibility> deferredVisibilityChanges;
    void applyDeferredVisibilityChanges();
    void queueHostVisibilityChange(juce::Component& host, bool visible, const juce::Rectangle<int>& bounds);

    BehaviorCoreProcessor& processorRef;
    LuaEngine luaEngine;
    bool usingLuaUi = false;
    RootMode rootMode_ = RootMode::RuntimeNode;

    Canvas rootCanvas{"root"};
    std::unique_ptr<RuntimeNode> rootRuntime_;
    ImGuiHost mainScriptEditorHost;
    ImGuiScriptListHost scriptListHost;
    ImGuiHierarchyHost hierarchyHost;
    ImGuiInspectorHost inspectorHost;
    ImGuiInspectorHost scriptInspectorHost;
    ImGuiPerfOverlayHost perfOverlayHost;
    ImGuiRuntimeNodeHost runtimeNodeDebugHost;
    ImGuiDirectHost directHost_;
    bool directHostNeedsInitialFocus_ = false;
    RuntimeRendererMode runtimeRendererMode_ = RuntimeRendererMode::ImGuiDirect;
    bool exportPluginUi_ = false;
    Canvas* errorNode = nullptr;
    std::string errorMessage;

    // CPU tracking
    std::chrono::steady_clock::time_point lastCpuCheck_{};
    std::chrono::microseconds lastCpuTime_{0};
    bool uiIdleSnapshotCaptured_ = false;
    int uiIdleSnapshotCountdown_ = 40;

    // Recording frame capture
    bool wasRecording_ = false;
    editor_recording::RamFrameAccumulator recordingAccumulator_;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(BehaviorCoreEditor)
};
