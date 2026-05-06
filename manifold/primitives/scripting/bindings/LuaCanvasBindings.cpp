#include "LuaCanvasBindings.h"

#include "LuaUIBindingHelpers.h"
#include "../core/LuaCoreEngine.h"

#include <cstdio>
#include <mutex>
#include <tuple>
#include <utility>

namespace lua_bindings {
using namespace lua_ui_helpers;

void registerCanvasBindings(LuaCoreEngine& engine, Canvas* rootCanvas) {
    auto& lua = engine.getLuaState();
    
    // ---- CanvasStyle ----
    lua.new_usertype<CanvasStyle>(
        "CanvasStyle",
        sol::constructors<CanvasStyle()>(),
        "background",
        sol::property(
            [](const CanvasStyle& s) { return (uint32_t)s.background.getARGB(); },
            [](CanvasStyle& s, uint32_t c) { s.background = juce::Colour(c); }),
        "border",
        sol::property(
            [](const CanvasStyle& s) { return (uint32_t)s.border.getARGB(); },
            [](CanvasStyle& s, uint32_t c) { s.border = juce::Colour(c); }),
        "borderWidth", &CanvasStyle::borderWidth,
        "cornerRadius", &CanvasStyle::cornerRadius,
        "opacity", &CanvasStyle::opacity,
        "padding", &CanvasStyle::padding
    );

    // ---- Canvas ----
    lua.new_usertype<Canvas>(
        "Canvas",
        sol::no_constructor,

        "addChild",
        [](Canvas& parent, const std::string& name) -> Canvas* {
            return parent.addChild(juce::String(name));
        },

        "clearChildren", &Canvas::clearChildren,
        "getNumChildren", &Canvas::getNumChildren,
        "getChild", &Canvas::getChild,
        "adoptChild", &Canvas::adoptChild,

        "setBounds",
        [](Canvas& c, int x, int y, int w, int h) { c.setBounds(x, y, w, h); },

        "getBounds",
        [](Canvas& c) {
            auto b = c.getBounds();
            return std::make_tuple(b.getX(), b.getY(), b.getWidth(), b.getHeight());
        },

        "getName", [](Canvas& c) { return c.getName().toStdString(); },
        "setNodeId", [](Canvas& c, const std::string& id) { c.setNodeId(id); },
        "getNodeId", [](Canvas& c) { return c.getNodeId(); },
        "setWidgetType", [](Canvas& c, const std::string& type) { c.setWidgetType(type); },
        "getWidgetType", [](Canvas& c) { return c.getWidgetType(); },
        "getRuntimeNode", [](Canvas& c) { return c.getRuntimeNode(); },
        "getInputCapabilities",
        [&lua](Canvas& c) {
            const auto caps = c.getInputCapabilities();
            sol::table out(lua, sol::create);
            out["pointer"] = caps.pointer;
            out["wheel"] = caps.wheel;
            out["keyboard"] = caps.keyboard;
            out["focusable"] = caps.focusable;
            out["interceptsChildren"] = caps.interceptsChildren;
            return out;
        },

        "getScreenBounds",
        [](Canvas& c) {
            auto b = c.getScreenBounds();
            return std::make_tuple(b.getX(), b.getY(), b.getWidth(), b.getHeight());
        },

        "getWidth", [](Canvas& c) { return c.getWidth(); },
        "getHeight", [](Canvas& c) { return c.getHeight(); },

        "toFront", [](Canvas& c, bool shouldGrabFocus) { c.toFront(shouldGrabFocus); },
        "toBack", [](Canvas& c) { c.toBack(); },

        // Transform for zoom/pan in editor
        "setTransform", [](Canvas& c, float scaleX, float scaleY, float translateX, float translateY) {
            c.setTransform(juce::AffineTransform::scale(scaleX, scaleY)
                          .translated(translateX, translateY));
        },
        "clearTransform", [](Canvas& c) {
            c.setTransform(juce::AffineTransform());
        },



        // User data storage for editor metadata and widget properties
        "setUserData",
        [](Canvas& c, const std::string& key, sol::object value) {
            c.setUserData(key, value);
        },

        "getUserData",
        [](Canvas& c, const std::string& key) -> sol::object {
            return c.getUserData(key);
        },

        "hasUserData", &Canvas::hasUserData,

        "getUserDataKeys", &Canvas::getUserDataKeys,

        "clearUserData", &Canvas::clearUserData,

        "clearAllUserData", &Canvas::clearAllUserData,

        "setDisplayList",
        [](Canvas& c, sol::object value) {
            juce::var displayList;
            if (!tryLuaDisplayListToVar(value, displayList)) {
                displayList = luaObjectToVar(value);
            }
            c.setDisplayList(displayList);
        },

        "getDisplayList",
        [&lua](Canvas& c) -> sol::object {
            return varToLuaObject(lua, c.getDisplayList());
        },

        "clearDisplayList", &Canvas::clearDisplayList,

        "setCustomRenderPayload",
        [](Canvas& c, sol::object value) {
            c.setCustomRenderPayload(luaObjectToVar(value));
        },

        "getCustomRenderPayload",
        [&lua](Canvas& c) -> sol::object {
            return varToLuaObject(lua, c.getCustomRenderPayload());
        },

        "clearCustomRenderPayload", &Canvas::clearCustomRenderPayload,
        "getStructureVersion", &Canvas::getStructureVersion,
        "getPropsVersion", &Canvas::getPropsVersion,
        "getRenderVersion", &Canvas::getRenderVersion,

        "setStyle",
        [](Canvas& c, sol::table t) {
            CanvasStyle s = c.style;
            if (t["bg"].valid())
                s.background = juce::Colour((uint32_t)t["bg"]);
            if (t["border"].valid())
                s.border = juce::Colour((uint32_t)t["border"]);
            if (t["borderWidth"].valid())
                s.borderWidth = t["borderWidth"];
            if (t["radius"].valid())
                s.cornerRadius = t["radius"];
            if (t["opacity"].valid())
                s.opacity = t["opacity"];
            if (t["padding"].valid())
                s.padding = t["padding"];
            c.setStyle(s);
        },

        "getStyle", [](Canvas& c) -> CanvasStyle& { return c.style; },

        "setInterceptsMouse",
        [](Canvas& c, bool clicks, bool children) {
            c.setInterceptsMouseClicks(clicks, children);
            c.syncInputCapabilities();
        },

        "getInterceptsMouse",
        [](Canvas& c) {
            bool clicks = false;
            bool children = false;
            c.getInterceptsMouseClicks(clicks, children);
            return std::make_tuple(clicks, children);
        },

        "setVisible",
        [](Canvas& c, bool visible) {
            c.setVisible(visible);
            c.markPropsDirty();
        },

        "isVisible",
        [](Canvas& c) {
            return c.isVisible();
        },

        "isMouseOver", [](Canvas& c) { return c.isMouseOverOrDragging(); },

        "repaint", [](Canvas& c) { c.repaint(); },

        "setOnClick",
        [&engine](Canvas& c, sol::function fn) {
            if (fn.valid()) {
                setRuntimeCallbackSlot(c, [fn](RuntimeNode::CallbackSlots& slots) mutable {
                    slots.onClick = fn;
                });
                c.onClick = [fn, &engine]() mutable {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    auto result = fn();
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: onClick error: %s\n", err.what());
                    }
                };
                c.syncInputCapabilities();
            } else {
                // Defer clearing to avoid destroying the callback while it's running
                callAsyncIfCanvasAlive(c, [](Canvas& canvas) {
                    clearRuntimeCallbackSlot(canvas, [](RuntimeNode::CallbackSlots& slots) {
                        slots.onClick = sol::lua_nil;
                    });
                    canvas.onClick = nullptr;
                    canvas.syncInputCapabilities();
                });
            }
        },

        "setOnMouseDown",
        [&engine](Canvas& c, sol::function fn) {
            if (fn.valid()) {
                setRuntimeCallbackSlot(c, [fn](RuntimeNode::CallbackSlots& slots) mutable {
                    slots.onMouseDown = fn;
                });
                c.onMouseDown = [fn, &engine](const juce::MouseEvent& e) mutable {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    const auto mods = e.mods;
                    auto result = fn(e.x, e.y,
                                     mods.isShiftDown(),
                                     mods.isCtrlDown() || mods.isCommandDown(),
                                     mods.isAltDown(),
                                     mods.isRightButtonDown());
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: onMouseDown error: %s\n", err.what());
                    }
                };
                c.syncInputCapabilities();
            } else {
                // Defer clearing to avoid destroying the callback while it's running
                callAsyncIfCanvasAlive(c, [](Canvas& canvas) {
                    clearRuntimeCallbackSlot(canvas, [](RuntimeNode::CallbackSlots& slots) {
                        slots.onMouseDown = sol::lua_nil;
                    });
                    canvas.onMouseDown = nullptr;
                    canvas.syncInputCapabilities();
                });
            }
        },

        "setOnMouseDrag",
        [&engine](Canvas& c, sol::function fn) {
            if (fn.valid()) {
                setRuntimeCallbackSlot(c, [fn](RuntimeNode::CallbackSlots& slots) mutable {
                    slots.onMouseDrag = fn;
                });
                c.onMouseDrag = [fn, &engine](const juce::MouseEvent& e) mutable {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    const auto mods = e.mods;
                    auto result = fn(e.x, e.y,
                                     e.getDistanceFromDragStartX(),
                                     e.getDistanceFromDragStartY(),
                                     mods.isShiftDown(),
                                     mods.isCtrlDown() || mods.isCommandDown(),
                                     mods.isAltDown(),
                                     mods.isRightButtonDown());
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: onMouseDrag error: %s\n", err.what());
                    }
                };
                c.syncInputCapabilities();
            } else {
                // Defer clearing to avoid destroying the callback while it's running
                callAsyncIfCanvasAlive(c, [](Canvas& canvas) {
                    clearRuntimeCallbackSlot(canvas, [](RuntimeNode::CallbackSlots& slots) {
                        slots.onMouseDrag = sol::lua_nil;
                    });
                    canvas.onMouseDrag = nullptr;
                    canvas.syncInputCapabilities();
                });
            }
        },

        "setOnMouseUp",
        [&engine](Canvas& c, sol::function fn) {
            if (fn.valid()) {
                setRuntimeCallbackSlot(c, [fn](RuntimeNode::CallbackSlots& slots) mutable {
                    slots.onMouseUp = fn;
                });
                c.onMouseUp = [fn, &engine](const juce::MouseEvent& e) mutable {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    const auto mods = e.mods;
                    auto result = fn(e.x, e.y,
                                     mods.isShiftDown(),
                                     mods.isCtrlDown() || mods.isCommandDown(),
                                     mods.isAltDown(),
                                     mods.isRightButtonDown());
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: onMouseUp error: %s\n", err.what());
                    }
                };
                c.syncInputCapabilities();
            } else {
                // Defer clearing to avoid destroying the callback while it's running
                callAsyncIfCanvasAlive(c, [](Canvas& canvas) {
                    clearRuntimeCallbackSlot(canvas, [](RuntimeNode::CallbackSlots& slots) {
                        slots.onMouseUp = sol::lua_nil;
                    });
                    canvas.onMouseUp = nullptr;
                    canvas.syncInputCapabilities();
                });
            }
        },

        "setOnDoubleClick",
        [&engine](Canvas& c, sol::function fn) {
            if (fn.valid()) {
                setRuntimeCallbackSlot(c, [fn](RuntimeNode::CallbackSlots& slots) mutable {
                    slots.onDoubleClick = fn;
                });
                c.onDoubleClick = [fn, &engine]() mutable {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    auto result = fn();
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: onDoubleClick error: %s\n", err.what());
                    }
                };
                c.syncInputCapabilities();
            } else {
                // Defer clearing to avoid destroying the callback while it's running
                callAsyncIfCanvasAlive(c, [](Canvas& canvas) {
                    clearRuntimeCallbackSlot(canvas, [](RuntimeNode::CallbackSlots& slots) {
                        slots.onDoubleClick = sol::lua_nil;
                    });
                    canvas.onDoubleClick = nullptr;
                    canvas.syncInputCapabilities();
                });
            }
        },

        "setOnMouseWheel",
        [&engine](Canvas& c, sol::function fn) {
            if (fn.valid()) {
                setRuntimeCallbackSlot(c, [fn](RuntimeNode::CallbackSlots& slots) mutable {
                    slots.onMouseWheel = fn;
                });
                c.onMouseWheel = [fn, &engine](const juce::MouseEvent& e,
                                      const juce::MouseWheelDetails& wheel) mutable {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    const auto mods = e.mods;
                    auto result = fn(e.x, e.y, wheel.deltaY,
                                     mods.isShiftDown(),
                                     mods.isCtrlDown() || mods.isCommandDown(),
                                     mods.isAltDown());
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: onMouseWheel error: %s\n", err.what());
                    }
                };
                c.syncInputCapabilities();
            } else {
                // Defer clearing to avoid destroying the callback while it's running
                callAsyncIfCanvasAlive(c, [](Canvas& canvas) {
                    clearRuntimeCallbackSlot(canvas, [](RuntimeNode::CallbackSlots& slots) {
                        slots.onMouseWheel = sol::lua_nil;
                    });
                    canvas.onMouseWheel = nullptr;
                    canvas.syncInputCapabilities();
                });
            }
        },

        "setWantsKeyboardFocus",
        [](Canvas& c, bool wantsFocus) {
            c.setWantsKeyboardFocus(wantsFocus);
            c.syncInputCapabilities();
        },

        "grabKeyboardFocus",
        [](Canvas& c) {
            c.grabKeyboardFocus();
            if (auto* node = c.getRuntimeNode()) {
                node->setFocused(true);
            }
        },

        "hasKeyboardFocus",
        [](Canvas& c) { return c.hasKeyboardFocus(true); },

        "setOnKeyPress",
        [&engine](Canvas& c, sol::function fn) {
            if (fn.valid()) {
                setRuntimeCallbackSlot(c, [fn](RuntimeNode::CallbackSlots& slots) mutable {
                    slots.onKeyPress = fn;
                });
                c.onKeyPress = [fn, &engine](const juce::KeyPress& key) mutable -> bool {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    const auto mods = key.getModifiers();
                    auto result = fn(
                        key.getKeyCode(),
                        static_cast<int>(key.getTextCharacter()),
                        mods.isShiftDown(),
                        mods.isCtrlDown() || mods.isCommandDown(),
                        mods.isAltDown());
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: onKeyPress error: %s\n", err.what());
                        return false;
                    }
                    if (result.get_type() == sol::type::boolean) {
                        return result.get<bool>();
                    }
                    return true;
                };
                c.setWantsKeyboardFocus(true);
                c.syncInputCapabilities();
            } else {
                // Defer clearing to avoid destroying the callback while it's running
                callAsyncIfCanvasAlive(c, [](Canvas& canvas) {
                    clearRuntimeCallbackSlot(canvas, [](RuntimeNode::CallbackSlots& slots) {
                        slots.onKeyPress = sol::lua_nil;
                    });
                    canvas.onKeyPress = nullptr;
                    canvas.syncInputCapabilities();
                });
            }
        },

        "setOnDraw",
        [&engine](Canvas& c, sol::function fn) {
            if (fn.valid()) {
                c.onDraw = [fn, &engine](Canvas& self, juce::Graphics& g) mutable {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    currentGraphics = &g;
                    auto result = fn(std::ref(self));
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: onDraw error: %s\n", err.what());
                    }
                    currentGraphics = nullptr;
                };
                // Store a wrapper that invokes the Lua draw function without a Graphics context.
                // gfx.* calls become no-ops (currentGraphics is nullptr), but
                // node:setDisplayList() still works for retained display list refresh.
                c.invokeDrawForRetainedFn = [fn, &engine](Canvas& self) mutable {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    // currentGraphics is already nullptr — gfx.* calls will be no-ops
                    auto result = fn(std::ref(self));
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: invokeDrawForRetained error: %s\n", err.what());
                    }
                };
            } else {
                // Defer clearing to avoid destroying the callback while it's running
                callAsyncIfCanvasAlive(c, [](Canvas& canvas) {
                    canvas.onDraw = nullptr;
                    canvas.invokeDrawForRetainedFn = nullptr;
                });
            }
        },

        // Invoke the onDraw callback without a Graphics context (for retained display list refresh).
        // gfx.* calls become no-ops, but node:setDisplayList() still works.
        "invokeDrawForRetained",
        [](Canvas& c) {
            if (c.invokeDrawForRetainedFn) {
                c.invokeDrawForRetainedFn(c);
            }
        },

        "setOpenGLEnabled",
        [](Canvas& c, bool enabled) { c.setOpenGLEnabled(enabled); },

        "isOpenGLEnabled",
        [](Canvas& c) { return c.isOpenGLEnabled(); },

        "setOnGLRender",
        [&engine](Canvas& c, sol::function fn) {
            if (fn.valid()) {
                c.onGLRender = [fn, &engine](Canvas& self) mutable {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    auto result = fn(std::ref(self));
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: onGLRender error: %s\n", err.what());
                    }
                };
            } else {
                // Defer clearing to avoid destroying the callback while it's running
                callAsyncIfCanvasAlive(c, [](Canvas& canvas) {
                    canvas.onGLRender = nullptr;
                });
            }
        },

        "setOnGLContextCreated",
        [&engine](Canvas& c, sol::function fn) {
            if (fn.valid()) {
                c.onGLContextCreated = [fn, &engine](Canvas& self) mutable {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    auto result = fn(std::ref(self));
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: onGLContextCreated error: %s\n", err.what());
                    }
                };
            } else {
                // Defer clearing to avoid destroying the callback while it's running
                callAsyncIfCanvasAlive(c, [](Canvas& canvas) {
                    canvas.onGLContextCreated = nullptr;
                });
            }
        },

        "setOnGLContextClosing",
        [&engine](Canvas& c, sol::function fn) {
            if (fn.valid()) {
                c.onGLContextClosing = [fn, &engine](Canvas& self) mutable {
                    const std::lock_guard<std::recursive_mutex> lock(engine.getMutex());
                    auto result = fn(std::ref(self));
                    if (!result.valid()) {
                        sol::error err = result;
                        std::fprintf(stderr, "LuaUI: onGLContextClosing error: %s\n", err.what());
                    }
                };
            } else {
                // Defer clearing to avoid destroying the callback while it's running
                callAsyncIfCanvasAlive(c, [](Canvas& canvas) {
                    canvas.onGLContextClosing = nullptr;
                });
            }
        }
    );

    // Root canvas accessor
    lua["root"] = rootCanvas;
}

} // namespace lua_bindings
