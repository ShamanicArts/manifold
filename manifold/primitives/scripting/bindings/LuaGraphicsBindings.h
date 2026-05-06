#pragma once

#define SOL_ALL_SAFETIES_ON 1
#include <sol/sol.hpp>

namespace lua_bindings {
void registerGraphicsBindings(sol::state& lua);
}
