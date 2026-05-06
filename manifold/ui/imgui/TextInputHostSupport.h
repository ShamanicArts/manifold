#pragma once

#include "external/imgui/imgui.h"

#include <juce_gui_basics/juce_gui_basics.h>

#include <string>
#include <unordered_set>
#include <vector>

namespace manifold::ui::imgui {

enum class TextInputHostEventType {
    MousePos,
    MouseButton,
    MouseWheel,
    Key,
    Char,
    Focus,
};

struct TextInputHostEvent {
    TextInputHostEventType type = TextInputHostEventType::MousePos;
    float x = 0.0f;
    float y = 0.0f;
    int button = 0;
    bool down = false;
    int key = 0;
    unsigned int codepoint = 0;
    bool focused = false;
};

struct TextInputHostButtons {
    bool left = false;
    bool right = false;
    bool middle = false;
};

struct TextInputHostModifiers {
    bool ctrl = false;
    bool shift = false;
    bool alt = false;
    bool super = false;
};

enum class TextInputHostLanguageDefinition {
    None,
    Cpp,
    C,
    Cs,
    Python,
    Lua,
    Json,
    Sql,
    Glsl,
    Hlsl,
};

inline int translateTextInputKeyCodeToImGuiKey(int keyCode) {
    if (keyCode == juce::KeyPress::tabKey) return ImGuiKey_Tab;
    if (keyCode == juce::KeyPress::leftKey) return ImGuiKey_LeftArrow;
    if (keyCode == juce::KeyPress::rightKey) return ImGuiKey_RightArrow;
    if (keyCode == juce::KeyPress::upKey) return ImGuiKey_UpArrow;
    if (keyCode == juce::KeyPress::downKey) return ImGuiKey_DownArrow;
    if (keyCode == juce::KeyPress::pageUpKey) return ImGuiKey_PageUp;
    if (keyCode == juce::KeyPress::pageDownKey) return ImGuiKey_PageDown;
    if (keyCode == juce::KeyPress::homeKey) return ImGuiKey_Home;
    if (keyCode == juce::KeyPress::endKey) return ImGuiKey_End;
    if (keyCode == juce::KeyPress::insertKey) return ImGuiKey_Insert;
    if (keyCode == juce::KeyPress::deleteKey) return ImGuiKey_Delete;
    if (keyCode == juce::KeyPress::backspaceKey) return ImGuiKey_Backspace;
    if (keyCode == juce::KeyPress::returnKey) return ImGuiKey_Enter;
    if (keyCode == juce::KeyPress::escapeKey) return ImGuiKey_Escape;
    if (keyCode == juce::KeyPress::spaceKey) return ImGuiKey_Space;
    if (keyCode >= '0' && keyCode <= '9') return ImGuiKey_0 + (keyCode - '0');
    if (keyCode >= 'a' && keyCode <= 'z') return ImGuiKey_A + (keyCode - 'a');
    if (keyCode >= 'A' && keyCode <= 'Z') return ImGuiKey_A + (keyCode - 'A');
    if (keyCode == ';') return ImGuiKey_Semicolon;
    if (keyCode == '\'') return ImGuiKey_Apostrophe;
    if (keyCode == ',') return ImGuiKey_Comma;
    if (keyCode == '-') return ImGuiKey_Minus;
    if (keyCode == '.') return ImGuiKey_Period;
    if (keyCode == '/') return ImGuiKey_Slash;
    if (keyCode == '=') return ImGuiKey_Equal;
    if (keyCode == '[') return ImGuiKey_LeftBracket;
    if (keyCode == '\\') return ImGuiKey_Backslash;
    if (keyCode == ']') return ImGuiKey_RightBracket;
    if (keyCode == '`') return ImGuiKey_GraveAccent;
    return 0;
}

inline TextInputHostLanguageDefinition resolveLanguageDefinitionForFile(const juce::File& file) {
    const auto extension = file.getFileExtension().toLowerCase();
    if (extension == ".lua") return TextInputHostLanguageDefinition::Lua;
    if (extension == ".json" || extension == ".json5") return TextInputHostLanguageDefinition::Json;
    if (extension == ".sql") return TextInputHostLanguageDefinition::Sql;
    if (extension == ".glsl") return TextInputHostLanguageDefinition::Glsl;
    if (extension == ".hlsl") return TextInputHostLanguageDefinition::Hlsl;
    if (extension == ".py") return TextInputHostLanguageDefinition::Python;
    if (extension == ".cs") return TextInputHostLanguageDefinition::Cs;
    if (extension == ".c") return TextInputHostLanguageDefinition::C;
    if (extension == ".cpp" || extension == ".cxx" || extension == ".cc"
        || extension == ".h" || extension == ".hpp" || extension == ".hh") {
        return TextInputHostLanguageDefinition::Cpp;
    }
    return TextInputHostLanguageDefinition::None;
}

inline void queueTextInputMousePosition(std::vector<TextInputHostEvent>& events,
                                        juce::Point<float> position) {
    TextInputHostEvent event;
    event.type = TextInputHostEventType::MousePos;
    event.x = position.x;
    event.y = position.y;
    events.push_back(std::move(event));
}

inline void queueTextInputMouseExitIfIdle(std::vector<TextInputHostEvent>& events,
                                          const TextInputHostButtons& buttons) {
    if (buttons.left || buttons.right || buttons.middle) {
        return;
    }
    TextInputHostEvent event;
    event.type = TextInputHostEventType::MousePos;
    event.x = -1.0f;
    event.y = -1.0f;
    events.push_back(std::move(event));
}

inline void queueTextInputMouseWheel(std::vector<TextInputHostEvent>& events,
                                     const juce::MouseWheelDetails& wheel) {
    TextInputHostEvent event;
    event.type = TextInputHostEventType::MouseWheel;
    event.x = wheel.deltaX;
    event.y = wheel.deltaY;
    events.push_back(std::move(event));
}

inline void queueTextInputFocus(std::vector<TextInputHostEvent>& events,
                                bool focused) {
    TextInputHostEvent event;
    event.type = TextInputHostEventType::Focus;
    event.focused = focused;
    events.push_back(std::move(event));
}

inline void syncTextInputMouseButtons(std::vector<TextInputHostEvent>& events,
                                      TextInputHostButtons& buttons,
                                      const juce::ModifierKeys& mods) {
    const bool nextLeft = mods.isLeftButtonDown();
    const bool nextRight = mods.isRightButtonDown();
    const bool nextMiddle = mods.isMiddleButtonDown();

    const auto pushMouseButton = [&](bool& current, int button, bool nextState) {
        if (current == nextState) {
            return;
        }
        current = nextState;
        TextInputHostEvent event;
        event.type = TextInputHostEventType::MouseButton;
        event.button = button;
        event.down = nextState;
        events.push_back(std::move(event));
    };

    pushMouseButton(buttons.left, 0, nextLeft);
    pushMouseButton(buttons.right, 1, nextRight);
    pushMouseButton(buttons.middle, 2, nextMiddle);
}

inline void releaseAllTextInputMouseButtons(std::vector<TextInputHostEvent>& events,
                                            TextInputHostButtons& buttons) {
    const auto releaseButton = [&](bool& current, int button) {
        if (!current) {
            return;
        }
        current = false;
        TextInputHostEvent event;
        event.type = TextInputHostEventType::MouseButton;
        event.button = button;
        event.down = false;
        events.push_back(std::move(event));
    };

    releaseButton(buttons.left, 0);
    releaseButton(buttons.right, 1);
    releaseButton(buttons.middle, 2);
}

inline void syncTextInputModifierKeys(std::vector<TextInputHostEvent>& events,
                                      TextInputHostModifiers& modifiers,
                                      const juce::ModifierKeys& mods) {
    const bool nextCtrl = mods.isCtrlDown();
    const bool nextShift = mods.isShiftDown();
    const bool nextAlt = mods.isAltDown();
    const bool nextSuper = mods.isCommandDown();

    const auto syncMod = [&](bool& state, int key, bool nextState) {
        if (state == nextState) {
            return;
        }
        state = nextState;
        TextInputHostEvent event;
        event.type = TextInputHostEventType::Key;
        event.key = key;
        event.down = nextState;
        events.push_back(std::move(event));
    };

    syncMod(modifiers.ctrl, ImGuiMod_Ctrl, nextCtrl);
    syncMod(modifiers.shift, ImGuiMod_Shift, nextShift);
    syncMod(modifiers.alt, ImGuiMod_Alt, nextAlt);
    syncMod(modifiers.super, ImGuiMod_Super, nextSuper);
}

inline void queueTextInputKeyPress(std::vector<TextInputHostEvent>& events,
                                   std::unordered_set<int>& activeKeyCodes,
                                   const juce::KeyPress& key) {
    if (const int imguiKey = translateTextInputKeyCodeToImGuiKey(key.getKeyCode()); imguiKey != 0) {
        if (activeKeyCodes.insert(key.getKeyCode()).second) {
            TextInputHostEvent event;
            event.type = TextInputHostEventType::Key;
            event.key = imguiKey;
            event.down = true;
            events.push_back(std::move(event));
        }
    }

    const auto textCharacter = key.getTextCharacter();
    if (textCharacter >= 32 && !key.getModifiers().isCtrlDown() && !key.getModifiers().isCommandDown()) {
        TextInputHostEvent event;
        event.type = TextInputHostEventType::Char;
        event.codepoint = static_cast<unsigned int>(textCharacter);
        events.push_back(std::move(event));
    }
}

template <typename IsKeyDownFn>
inline void releaseInactiveTextInputKeysWithPredicate(std::vector<TextInputHostEvent>& events,
                                                      std::unordered_set<int>& activeKeyCodes,
                                                      IsKeyDownFn&& isKeyDown) {
    if (activeKeyCodes.empty()) {
        return;
    }

    for (auto it = activeKeyCodes.begin(); it != activeKeyCodes.end();) {
        if (isKeyDown(*it)) {
            ++it;
            continue;
        }
        const int imguiKey = translateTextInputKeyCodeToImGuiKey(*it);
        if (imguiKey != 0) {
            TextInputHostEvent event;
            event.type = TextInputHostEventType::Key;
            event.key = imguiKey;
            event.down = false;
            events.push_back(std::move(event));
        }
        it = activeKeyCodes.erase(it);
    }
}

inline void releaseInactiveTextInputKeys(std::vector<TextInputHostEvent>& events,
                                         std::unordered_set<int>& activeKeyCodes) {
    releaseInactiveTextInputKeysWithPredicate(events,
                                              activeKeyCodes,
                                              [](int keyCode) { return juce::KeyPress::isKeyCurrentlyDown(keyCode); });
}

inline void releaseAllTextInputKeys(std::vector<TextInputHostEvent>& events,
                                    std::unordered_set<int>& activeKeyCodes) {
    if (activeKeyCodes.empty()) {
        return;
    }

    for (const int keyCode : activeKeyCodes) {
        const int imguiKey = translateTextInputKeyCodeToImGuiKey(keyCode);
        if (imguiKey == 0) {
            continue;
        }
        TextInputHostEvent event;
        event.type = TextInputHostEventType::Key;
        event.key = imguiKey;
        event.down = false;
        events.push_back(std::move(event));
    }
    activeKeyCodes.clear();
}

} // namespace manifold::ui::imgui
