#pragma once

#include "../core/LuaCoreEngine.h"
#include "../../ui/RuntimeNode.h"

class LuaRuntimeNodeBindings {
public:
    static void registerBindings(LuaCoreEngine& engine, RuntimeNode* rootRuntime);
    static void setAllowAutomaticLegacyRetainedReplay(bool allow);
};
