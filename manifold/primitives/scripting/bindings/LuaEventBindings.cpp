#include "LuaEventBindings.h"

#include "../ILuaControlState.h"

#include <mutex>

namespace lua_bindings {

void registerEventBindings(sol::state& lua,
                           ILuaControlState& state) {
    auto looperTable = lua.create_table();

    looperTable["onTempoChanged"] = [&state](sol::function callback,
                                             sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> lock(state.getEventListenersMutex());
        ILuaControlState::EventListener listener;
        listener.func = callback;
        listener.persistent = persistent.value_or(false);
        state.getTempoChangedListeners().push_back(std::move(listener));
        return true;
    };

    looperTable["onCommit"] = [&state](sol::function callback,
                                       sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> lock(state.getEventListenersMutex());
        ILuaControlState::EventListener listener;
        listener.func = callback;
        listener.persistent = persistent.value_or(false);
        state.getCommitListeners().push_back(std::move(listener));
        return true;
    };

    looperTable["onRecordingChanged"] = [&state](sol::function callback,
                                                 sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> lock(state.getEventListenersMutex());
        ILuaControlState::EventListener listener;
        listener.func = callback;
        listener.persistent = persistent.value_or(false);
        state.getRecordingChangedListeners().push_back(std::move(listener));
        return true;
    };

    looperTable["onLayerStateChanged"] = [&state](sol::function callback,
                                                  sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> lock(state.getEventListenersMutex());
        ILuaControlState::EventListener listener;
        listener.func = callback;
        listener.persistent = persistent.value_or(false);
        state.getLayerStateChangedListeners().push_back(std::move(listener));
        return true;
    };

    looperTable["onStateChanged"] = [&state](sol::function callback,
                                             sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> lock(state.getEventListenersMutex());
        ILuaControlState::EventListener listener;
        listener.func = callback;
        listener.persistent = persistent.value_or(false);
        state.getStateChangedListeners().push_back(std::move(listener));
        return true;
    };

    lua["looper"] = looperTable;
}

} // namespace lua_bindings
