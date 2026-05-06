#pragma once

#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>

#include <cstdint>
#include <string>

namespace manifold::ui::imgui {

enum class RuntimeNodeHostPresentationModeData {
    DebugPreview,
    Replace,
};

struct RuntimeNodeHostHitData {
    bool hit = false;
    uint64_t stableId = 0;
    std::string nodeId;
    juce::Rectangle<int> sceneBounds;
    juce::Point<float> scenePosition;
};

struct RuntimeNodeHostHoverUpdate {
    uint64_t previousHoveredStableId = 0;
    uint64_t nextHoveredStableId = 0;
    std::string nextHoveredId;
    bool exitPrevious = false;
    bool enterNext = false;
    bool invokeMove = false;
    juce::Point<float> localPosition;
};

inline juce::Point<float> runtimeNodeHostScenePositionFromPreview(juce::Point<float> position,
                                                                  bool transformValid,
                                                                  float scale,
                                                                  float offsetX,
                                                                  float offsetY) {
    if (!transformValid || scale <= 0.0f) {
        return {};
    }

    return juce::Point<float>((position.x - offsetX) / scale,
                              (position.y - offsetY) / scale);
}

inline juce::Point<float> runtimeNodeHostLocalPositionFromHit(const RuntimeNodeHostHitData& hit) {
    return juce::Point<float>(hit.scenePosition.x - static_cast<float>(hit.sceneBounds.getX()),
                              hit.scenePosition.y - static_cast<float>(hit.sceneBounds.getY()));
}

inline RuntimeNodeHostHoverUpdate computeRuntimeNodeHostHoverUpdate(uint64_t previousHoveredStableId,
                                                                    const RuntimeNodeHostHitData& hit,
                                                                    bool hasModifierContext) {
    RuntimeNodeHostHoverUpdate update;
    update.previousHoveredStableId = previousHoveredStableId;
    update.nextHoveredStableId = hit.hit ? hit.stableId : 0;
    update.nextHoveredId = hit.hit ? hit.nodeId : std::string{};
    update.exitPrevious = previousHoveredStableId != 0 && previousHoveredStableId != update.nextHoveredStableId;
    update.enterNext = update.nextHoveredStableId != 0 && previousHoveredStableId != update.nextHoveredStableId;
    update.invokeMove = hasModifierContext && hit.hit && update.nextHoveredStableId != 0;
    if (update.invokeMove) {
        update.localPosition = runtimeNodeHostLocalPositionFromHit(hit);
    }
    return update;
}

inline bool runtimeNodeHostShouldRequestExit(RuntimeNodeHostPresentationModeData mode, int keyCode) {
    return mode == RuntimeNodeHostPresentationModeData::Replace
        && keyCode == juce::KeyPress::escapeKey;
}

inline bool runtimeNodeHostShouldTriggerClick(bool hitMatchesPressed,
                                              bool triggerDoubleClick,
                                              bool mouseDraggedSinceMouseDown) {
    return hitMatchesPressed && !triggerDoubleClick && !mouseDraggedSinceMouseDown;
}

} // namespace manifold::ui::imgui
