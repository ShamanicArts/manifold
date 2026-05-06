#pragma once

#define SOL_ALL_SAFETIES_ON 1
#include <sol/sol.hpp>

class ILuaControlState;

namespace lua_bindings {
void registerUtilityBindings(sol::state& lua, ILuaControlState& state);
}
