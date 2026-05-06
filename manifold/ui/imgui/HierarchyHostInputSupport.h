#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

#include <vector>

namespace manifold::ui::imgui {

enum class HierarchyHostInputEventType {
    MousePos,
    MouseButton,
    MouseWheel,
    Focus,
};

struct HierarchyHostInputEvent {
    HierarchyHostInputEventType type = HierarchyHostInputEventType::MousePos;
    float x = 0.0f;
    float y = 0.0f;
    int button = 0;
    bool down = false;
    bool focused = false;
};

struct HierarchyHostMouseButtons {
    bool left = false;
    bool right = false;
    bool middle = false;
};

inline void queueHierarchyHostMousePosition(std::vector<HierarchyHostInputEvent>& pendingEvents,
                                            juce::Point<float> position) {
    HierarchyHostInputEvent event;
    event.type = HierarchyHostInputEventType::MousePos;
    event.x = position.x;
    event.y = position.y;
    pendingEvents.push_back(std::move(event));
}

inline void queueHierarchyHostMouseExitIfIdle(std::vector<HierarchyHostInputEvent>& pendingEvents,
                                              const HierarchyHostMouseButtons& buttons) {
    if (buttons.left || buttons.right || buttons.middle) {
        return;
    }

    HierarchyHostInputEvent event;
    event.type = HierarchyHostInputEventType::MousePos;
    event.x = -1.0f;
    event.y = -1.0f;
    pendingEvents.push_back(std::move(event));
}

inline void queueHierarchyHostMouseWheel(std::vector<HierarchyHostInputEvent>& pendingEvents,
                                         const juce::MouseWheelDetails& wheel) {
    HierarchyHostInputEvent event;
    event.type = HierarchyHostInputEventType::MouseWheel;
    event.x = wheel.deltaX;
    event.y = wheel.deltaY;
    pendingEvents.push_back(std::move(event));
}

inline void queueHierarchyHostFocus(std::vector<HierarchyHostInputEvent>& pendingEvents,
                                    bool focused) {
    HierarchyHostInputEvent event;
    event.type = HierarchyHostInputEventType::Focus;
    event.focused = focused;
    pendingEvents.push_back(std::move(event));
}

inline void syncHierarchyHostMouseButtons(std::vector<HierarchyHostInputEvent>& pendingEvents,
                                          HierarchyHostMouseButtons& buttons,
                                          const juce::ModifierKeys& mods) {
    const bool nextLeft = mods.isLeftButtonDown();
    const bool nextRight = mods.isRightButtonDown();
    const bool nextMiddle = mods.isMiddleButtonDown();

    const auto pushMouseButton = [&](bool& current, int button, bool nextState) {
        if (current == nextState) {
            return;
        }

        current = nextState;
        HierarchyHostInputEvent event;
        event.type = HierarchyHostInputEventType::MouseButton;
        event.button = button;
        event.down = nextState;
        pendingEvents.push_back(std::move(event));
    };

    pushMouseButton(buttons.left, 0, nextLeft);
    pushMouseButton(buttons.right, 1, nextRight);
    pushMouseButton(buttons.middle, 2, nextMiddle);
}

inline void releaseHierarchyHostMouseButtons(std::vector<HierarchyHostInputEvent>& pendingEvents,
                                             HierarchyHostMouseButtons& buttons) {
    const auto releaseButton = [&](bool& current, int button) {
        if (!current) {
            return;
        }

        current = false;
        HierarchyHostInputEvent event;
        event.type = HierarchyHostInputEventType::MouseButton;
        event.button = button;
        event.down = false;
        pendingEvents.push_back(std::move(event));
    };

    releaseButton(buttons.left, 0);
    releaseButton(buttons.right, 1);
    releaseButton(buttons.middle, 2);
}

} // namespace manifold::ui::imgui
