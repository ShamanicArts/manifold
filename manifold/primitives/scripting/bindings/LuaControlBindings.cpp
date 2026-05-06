#include "LuaControlBindings.h"

#include "LuaCommandBindings.h"
#include "LuaDspBindings.h"
#include "LuaEventBindings.h"
#include "LuaGraphBindings.h"
#include "LuaLinkBindings.h"
#include "LuaMidiBindings.h"
#include "LuaOSCBindings.h"
#include "LuaUtilityBindings.h"
#include "LuaWaveformBindings.h"

#include "../ScriptableProcessor.h"

void LuaControlBindings::registerBindings(LuaCoreEngine& engine,
                                          ILuaControlState& state) {
    auto& lua = engine.getLuaState();

    lua_bindings::registerCommandBindings(lua, state);
    lua_bindings::registerWaveformBindings(lua, state);
    lua_bindings::registerDspBindings(lua, state);
    if (auto* processor = state.getProcessor()) {
        if (!processor->isExportPlugin()) {
            lua_bindings::registerGraphBindings(lua, state);
        }
    }
    lua_bindings::registerOSCBindings(lua, state);
    lua_bindings::registerEventBindings(lua, state);
    lua_bindings::registerLinkBindings(lua, state);
    lua_bindings::registerUtilityBindings(lua, state);
    lua_bindings::registerMidiBindings(lua, state);
}
