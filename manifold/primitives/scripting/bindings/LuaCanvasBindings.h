#pragma once

class LuaCoreEngine;
class Canvas;

namespace lua_bindings {
void registerCanvasBindings(LuaCoreEngine& engine, Canvas* rootCanvas);
}
