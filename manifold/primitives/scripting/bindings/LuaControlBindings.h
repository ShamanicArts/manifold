#pragma once

#include "../core/LuaCoreEngine.h"
#include "../ILuaControlState.h"

/**
 * LuaControlBindings: Registers commands, OSC, events, and parameter access.
 *
 * Separated from LuaCoreEngine so that headless/control-only plugins
 * can use it without UI dependencies.
 */
class LuaControlBindings {
public:
    /**
     * Register all control-related bindings to the Lua engine.
     * Must be called after LuaCoreEngine::initialize() and before loadScript().
     *
     * @param engine The Lua engine to register bindings to
     * @param state The ILuaControlState for command posting and state access
     */
    static void registerBindings(LuaCoreEngine& engine, ILuaControlState& state);
};
