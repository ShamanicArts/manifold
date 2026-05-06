#include "LuaUIBindings.h"

#include "LuaCanvasBindings.h"
#include "LuaGraphicsBindings.h"
#include "LuaOpenGLBindings.h"
#include "LuaUIBindingHelpers.h"
#include "LuaUIConstantsBindings.h"

#include <cstdio>
#include <mutex>

using namespace lua_ui_helpers;

void LuaUIBindings::setDisplayListCallback(std::function<void(const std::string&)> callback) {
    lua_ui_helpers::setDisplayListCallback(std::move(callback));
}

bool LuaUIBindings::invokeRuntimeNodeDrawForRetained(LuaCoreEngine& engine, RuntimeNode& node) {
    auto& fn = node.getCallbacks().onDraw;
    if (!fn.valid()) {
        return false;
    }

    if (currentRuntimeDrawNode == &node) {
        return false;
    }

    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());

    RuntimeDrawRecorder recorder;
    recorder.node = &node;

    auto* previousRecorder = currentRuntimeDrawRecorder;
    auto* previousNode = currentRuntimeDrawNode;
    const bool previousMutationFlag = currentRuntimeDrawMutatedDisplayList;
    auto* previousGraphics = currentGraphics;

    currentRuntimeDrawRecorder = &recorder;
    currentRuntimeDrawNode = &node;
    currentRuntimeDrawMutatedDisplayList = false;
    currentGraphics = nullptr;

    auto result = fn(std::ref(node));

    currentGraphics = previousGraphics;
    const bool mutatedDisplayList = currentRuntimeDrawMutatedDisplayList;
    currentRuntimeDrawMutatedDisplayList = previousMutationFlag;
    currentRuntimeDrawNode = previousNode;
    currentRuntimeDrawRecorder = previousRecorder;

    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "LuaUI: RuntimeNode invokeDrawForRetained error: %s\n", err.what());
        return false;
    }

    if (recorder.commands.size() > 0) {
        node.setDisplayList(juce::var(recorder.commands));
    } else if (!mutatedDisplayList) {
        node.clearDisplayList();
    }

    return recorder.commands.size() > 0 || mutatedDisplayList;
}

void LuaUIBindings::noteRuntimeNodeDisplayListMutation(RuntimeNode& node) {
    if (currentRuntimeDrawNode == &node) {
        currentRuntimeDrawMutatedDisplayList = true;
    }
}

void LuaUIBindings::registerBindings(LuaCoreEngine& engine, Canvas* rootCanvas) {
    auto& lua = engine.getLuaState();

    lua_bindings::registerCanvasBindings(engine, rootCanvas);
    lua_bindings::registerGraphicsBindings(lua);
    lua_bindings::registerOpenGLBindings(engine);
    lua_bindings::registerConstants(lua);

    lua["sendDisplayList"] = [](const std::string& json) {
        lua_ui_helpers::broadcastDisplayList(json);
    };
}
