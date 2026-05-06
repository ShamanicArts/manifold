#pragma once

#include <juce_graphics/juce_graphics.h>

namespace editor_lifecycle {

enum class HostRole {
    Other,
    MainScriptEditor,
    ScriptList,
    Hierarchy,
    Inspector,
    ScriptInspector,
    PerfOverlay,
    RuntimeNodeDebug,
    DirectHost,
};

inline juce::Rectangle<int> targetBoundsForVisibility(bool visible,
                                                      const juce::Rectangle<int>& bounds) {
    return visible ? bounds : juce::Rectangle<int>(0, 0, 0, 0);
}

inline bool keepHostVisibleWhenHidden(HostRole role) {
    switch (role) {
        case HostRole::MainScriptEditor:
        case HostRole::ScriptList:
        case HostRole::Hierarchy:
        case HostRole::Inspector:
        case HostRole::ScriptInspector:
        case HostRole::PerfOverlay:
            return true;
        case HostRole::Other:
        case HostRole::RuntimeNodeDebug:
        case HostRole::DirectHost:
            return false;
    }
    return false;
}

inline bool shouldQueueVisibilityChange(bool currentVisible,
                                        const juce::Rectangle<int>& currentBounds,
                                        bool visible,
                                        const juce::Rectangle<int>& bounds) {
    const auto targetBounds = targetBoundsForVisibility(visible, bounds);
    return currentVisible != visible || currentBounds != targetBounds;
}

struct VisibilityApplyPlan {
    juce::Rectangle<int> targetBounds;
    bool targetVisible = false;
    bool bringToFront = false;
    bool grabFocus = false;
};

inline VisibilityApplyPlan buildVisibilityApplyPlan(HostRole role,
                                                    bool visible,
                                                    const juce::Rectangle<int>& targetBounds) {
    if (visible) {
        return {targetBounds, true, true, role == HostRole::PerfOverlay};
    }

    if (keepHostVisibleWhenHidden(role)) {
        return {targetBounds, true, false, false};
    }

    return {targetBounds, false, false, false};
}

struct RecordingTransitionPlan {
    bool clearAccumulator = false;
    bool flushAccumulator = false;
};

inline RecordingTransitionPlan planRecordingTransition(bool wasRecording,
                                                       bool isRecording) {
    return {
        isRecording && !wasRecording,
        !isRecording && wasRecording,
    };
}

inline int nextTimerHz(bool exportPluginUi, bool isRecording) {
    if (isRecording) {
        return 30;
    }
    return exportPluginUi ? 20 : 30;
}

struct UiIdleSnapshotPlan {
    int nextCountdown = 0;
    bool captureNow = false;
    bool markCaptured = false;
};

inline UiIdleSnapshotPlan advanceUiIdleSnapshot(bool alreadyCaptured,
                                                bool exportPluginUi,
                                                int countdown) {
    if (alreadyCaptured || !exportPluginUi || countdown <= 0) {
        return {countdown, false, alreadyCaptured};
    }

    const int nextCountdown = countdown - 1;
    const bool captureNow = nextCountdown == 0;
    return {nextCountdown, captureNow, alreadyCaptured || captureNow};
}

} // namespace editor_lifecycle
