#pragma once

#define SOL_ALL_SAFETIES_ON 1
#include <sol/sol.hpp>

#include "../../ui/Canvas.h"

#include <functional>
#include <memory>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

namespace lua_ui_helpers {

struct RecordedDrawState {
    uint32_t color = 0xffffffffu;
    float fontSize = 13.0f;
};

struct RuntimeDrawRecorder {
    juce::Array<juce::var> commands;
    RecordedDrawState state;
    std::vector<RecordedDrawState> stateStack;
    RuntimeNode* node = nullptr;
};

extern thread_local juce::Graphics* currentGraphics;
extern thread_local RuntimeDrawRecorder* currentRuntimeDrawRecorder;
extern thread_local RuntimeNode* currentRuntimeDrawNode;
extern thread_local bool currentRuntimeDrawMutatedDisplayList;

void setDisplayListCallback(std::function<void(const std::string&)> callback);
void broadcastDisplayList(const std::string& json);

std::unique_ptr<juce::DynamicObject> makeDisplayListCommand(const juce::String& cmdName);
void pushRecordedCommand(std::unique_ptr<juce::DynamicObject> cmd);
void applyRecordedDrawState(juce::DynamicObject& cmd);
std::pair<std::string, std::string> justificationToAlign(int justification);

bool tryLuaDisplayListToVar(const sol::object& object, juce::var& out);
juce::var luaObjectToVar(const sol::object& object);
sol::object varToLuaObject(sol::state& lua, const juce::var& value);

template <typename Fn>
void clearRuntimeCallbackSlot(Canvas& c, Fn&& clearFn) {
    if (auto* node = c.getRuntimeNode()) {
        clearFn(node->getCallbacks());
        node->markPropsDirty();
    }
}

template <typename Fn>
void setRuntimeCallbackSlot(Canvas& c, Fn&& setFn) {
    if (auto* node = c.getRuntimeNode()) {
        setFn(node->getCallbacks());
        node->markPropsDirty();
    }
}

template <typename Fn>
void callAsyncIfCanvasAlive(Canvas& c, Fn&& fn) {
    juce::Component::SafePointer<Canvas> safeCanvas(&c);
    juce::MessageManager::callAsync(
        [safeCanvas, fn = std::forward<Fn>(fn)]() mutable {
            if (safeCanvas != nullptr) {
                fn(*safeCanvas);
            }
        });
}

} // namespace lua_ui_helpers
