#include "LuaRuntimeNodeBindings.h"
#include "LuaUIBindings.h"

extern "C" {
#include <lauxlib.h>
#include <lua.h>
#include <lualib.h>
}

#define SOL_ALL_SAFETIES_ON 1
#include <sol/sol.hpp>

#include "../../ui/RuntimeNode.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <tuple>

namespace {

std::atomic<bool>& automaticLegacyReplayEnabled() {
    static std::atomic<bool> enabled{true};
    return enabled;
}

bool allowAutomaticLegacyRetainedReplay() {
    return automaticLegacyReplayEnabled().load(std::memory_order_relaxed);
}

void warnLegacyRetainedReplay(RuntimeNode& node, const char* trigger) {
    static int warningCount = 0;
    if (warningCount >= 24) {
        return;
    }
    ++warningCount;
    std::fprintf(stderr,
                 "LuaRuntimeNodeBindings: legacy retained draw replay for node '%s' via %s (warning %d/24)\n",
                 node.getNodeId().c_str(),
                 trigger != nullptr ? trigger : "unknown",
                 warningCount);
}

juce::var luaObjectToVar(const sol::object& object);

juce::var luaPrimitiveToVar(const sol::object& object) {
    if (!object.valid() || object == sol::lua_nil) {
        return {};
    }

    if (object.is<bool>()) {
        return juce::var(object.as<bool>());
    }
    if (object.is<int>()) {
        return juce::var(object.as<int>());
    }
    if (object.is<float>()) {
        return juce::var(static_cast<double>(object.as<float>()));
    }
    if (object.is<double>()) {
        return juce::var(object.as<double>());
    }
    if (object.is<std::string>()) {
        return juce::var(juce::String(object.as<std::string>()));
    }
    return {};
}

bool tryLuaDisplayListCommandToVar(const sol::table& table, juce::var& out) {
    const sol::object cmdObject = table["cmd"];
    if (!cmdObject.valid() || cmdObject == sol::lua_nil || !cmdObject.is<std::string>()) {
        return false;
    }

    auto obj = std::make_unique<juce::DynamicObject>();
    obj->setProperty("cmd", juce::String(cmdObject.as<std::string>()));

    const auto setPrimitiveProperty = [&table, &obj](const char* key) {
        const juce::var value = luaPrimitiveToVar(table[key]);
        if (!value.isVoid() && !value.isUndefined()) {
            obj->setProperty(key, value);
        }
    };

    setPrimitiveProperty("color");
    setPrimitiveProperty("fontSize");
    setPrimitiveProperty("x");
    setPrimitiveProperty("y");
    setPrimitiveProperty("w");
    setPrimitiveProperty("h");
    setPrimitiveProperty("radius");
    setPrimitiveProperty("thickness");
    setPrimitiveProperty("x1");
    setPrimitiveProperty("y1");
    setPrimitiveProperty("x2");
    setPrimitiveProperty("y2");
    setPrimitiveProperty("cx1");
    setPrimitiveProperty("cy1");
    setPrimitiveProperty("cx2");
    setPrimitiveProperty("cy2");
    setPrimitiveProperty("segments");
    setPrimitiveProperty("text");
    setPrimitiveProperty("align");
    setPrimitiveProperty("valign");
    setPrimitiveProperty("textureId");
    setPrimitiveProperty("texture");
    setPrimitiveProperty("u0");
    setPrimitiveProperty("v0");
    setPrimitiveProperty("u1");
    setPrimitiveProperty("v1");

    out = juce::var(obj.release());
    return true;
}

bool tryLuaDisplayListToVar(const sol::object& object, juce::var& out) {
    if (!object.valid() || object == sol::lua_nil || !object.is<sol::table>()) {
        return false;
    }

    const sol::table table = object.as<sol::table>();
    int maxIndex = 0;
    for (const auto& pair : table) {
        const sol::object& key = pair.first;
        if (!key.is<int>()) {
            return false;
        }
        const int index = key.as<int>();
        if (index < 1) {
            return false;
        }
        maxIndex = std::max(maxIndex, index);
    }

    juce::Array<juce::var> arr;
    arr.ensureStorageAllocated(maxIndex);
    for (int i = 1; i <= maxIndex; ++i) {
        const sol::object value = table[i];
        if (!value.valid() || value == sol::lua_nil || !value.is<sol::table>()) {
            return false;
        }
        juce::var command;
        if (!tryLuaDisplayListCommandToVar(value.as<sol::table>(), command)) {
            return false;
        }
        arr.add(std::move(command));
    }

    out = juce::var(arr);
    return true;
}

juce::var luaTableToVar(const sol::table& table) {
    bool arrayLike = true;
    int maxIndex = 0;
    for (const auto& pair : table) {
        const sol::object& key = pair.first;
        if (!key.is<int>()) {
            arrayLike = false;
            break;
        }
        const int index = key.as<int>();
        if (index < 1) {
            arrayLike = false;
            break;
        }
        maxIndex = std::max(maxIndex, index);
    }

    if (arrayLike) {
        juce::Array<juce::var> arr;
        for (int i = 1; i <= maxIndex; ++i) {
            sol::object value = table[i];
            if (!value.valid() || value == sol::lua_nil) {
                arrayLike = false;
                break;
            }
            arr.add(luaObjectToVar(value));
        }
        if (arrayLike) {
            return juce::var(arr);
        }
    }

    auto obj = std::make_unique<juce::DynamicObject>();
    for (const auto& pair : table) {
        const sol::object& key = pair.first;
        const sol::object& value = pair.second;
        juce::String propName;
        if (key.is<std::string>()) {
            propName = key.as<std::string>();
        } else if (key.is<int>()) {
            propName = juce::String(key.as<int>());
        } else {
            continue;
        }
        obj->setProperty(propName, luaObjectToVar(value));
    }
    return juce::var(obj.release());
}

juce::var luaObjectToVar(const sol::object& object) {
    if (const juce::var primitive = luaPrimitiveToVar(object); !primitive.isVoid() && !primitive.isUndefined()) {
        return primitive;
    }
    if (object.valid() && object != sol::lua_nil && object.is<sol::table>()) {
        return luaTableToVar(object.as<sol::table>());
    }
    return {};
}

sol::object varToLuaObject(sol::state& lua, const juce::var& value) {
    if (value.isVoid() || value.isUndefined()) {
        return sol::make_object(lua, sol::nil);
    }
    if (value.isBool()) {
        return sol::make_object(lua, static_cast<bool>(value));
    }
    if (value.isInt()) {
        return sol::make_object(lua, static_cast<int>(value));
    }
    if (value.isInt64()) {
        return sol::make_object(lua, value.toString().getDoubleValue());
    }
    if (value.isDouble()) {
        return sol::make_object(lua, static_cast<double>(value));
    }
    if (value.isString()) {
        return sol::make_object(lua, value.toString().toStdString());
    }
    if (auto* arr = value.getArray()) {
        sol::table out(lua, sol::create);
        for (int i = 0; i < arr->size(); ++i) {
            out[i + 1] = varToLuaObject(lua, arr->getReference(i));
        }
        return sol::make_object(lua, out);
    }
    if (auto* obj = value.getDynamicObject()) {
        sol::table out(lua, sol::create);
        for (const auto& property : obj->getProperties()) {
            out[property.name.toString().toStdString()] = varToLuaObject(lua, property.value);
        }
        return sol::make_object(lua, out);
    }
    return sol::make_object(lua, sol::nil);
}

sol::table styleToTable(sol::state& lua, const RuntimeNode::StyleState& style) {
    sol::table out(lua, sol::create);
    out["background"] = style.background;
    out["bg"] = style.background;
    out["border"] = style.border;
    out["borderWidth"] = style.borderWidth;
    out["cornerRadius"] = style.cornerRadius;
    out["radius"] = style.cornerRadius;
    out["opacity"] = style.opacity;
    out["padding"] = style.padding;
    return out;
}

uint32_t parseColorObject(const sol::object& value, uint32_t fallback) {
    if (!value.valid() || value == sol::lua_nil) {
        return fallback;
    }
    if (value.is<uint32_t>()) {
        return value.as<uint32_t>();
    }
    if (value.is<int>()) {
        return static_cast<uint32_t>(value.as<int>());
    }
    if (value.is<double>()) {
        return static_cast<uint32_t>(value.as<double>());
    }
    if (!value.is<sol::table>()) {
        return fallback;
    }

    const sol::table table = value.as<sol::table>();
    auto readChannel = [&table](const char* key, int index, int defaultValue) {
        sol::object channel = table[key];
        if (!channel.valid() || channel == sol::lua_nil) {
            channel = table[index];
        }
        if (!channel.valid() || channel == sol::lua_nil) {
            return defaultValue;
        }

        double raw = 0.0;
        if (channel.is<int>()) {
            raw = static_cast<double>(channel.as<int>());
        } else if (channel.is<double>()) {
            raw = channel.as<double>();
        } else {
            return defaultValue;
        }

        if (raw >= 0.0 && raw <= 1.0) {
            raw *= 255.0;
        }
        return std::clamp(static_cast<int>(std::lround(raw)), 0, 255);
    };

    const uint32_t r = static_cast<uint32_t>(readChannel("r", 1, 0));
    const uint32_t g = static_cast<uint32_t>(readChannel("g", 2, 0));
    const uint32_t b = static_cast<uint32_t>(readChannel("b", 3, 0));
    const uint32_t a = static_cast<uint32_t>(readChannel("a", 4, 255));
    return (a << 24u) | (r << 16u) | (g << 8u) | b;
}

RuntimeNode::StyleState styleFromTable(RuntimeNode::StyleState style, const sol::table& t) {
    if (t["background"].valid()) {
        style.background = parseColorObject(t["background"], style.background);
    }
    if (t["bg"].valid()) {
        style.background = parseColorObject(t["bg"], style.background);
    }
    if (t["border"].valid()) {
        style.border = parseColorObject(t["border"], style.border);
    }
    if (t["borderWidth"].valid()) {
        style.borderWidth = t["borderWidth"].get<float>();
    }
    if (t["cornerRadius"].valid()) {
        style.cornerRadius = t["cornerRadius"].get<float>();
    }
    if (t["radius"].valid()) {
        style.cornerRadius = t["radius"].get<float>();
    }
    if (t["opacity"].valid()) {
        style.opacity = t["opacity"].get<float>();
    }
    if (t["padding"].valid()) {
        style.padding = t["padding"].get<int>();
    }
    return style;
}

sol::table inputCapsToTable(sol::state& lua, const RuntimeNode::InputCapabilities& caps) {
    sol::table out(lua, sol::create);
    out["pointer"] = caps.pointer;
    out["wheel"] = caps.wheel;
    out["keyboard"] = caps.keyboard;
    out["focusable"] = caps.focusable;
    out["interceptsChildren"] = caps.interceptsChildren;
    return out;
}

RuntimeNode::InputCapabilities inputCapsFromTable(RuntimeNode::InputCapabilities caps,
                                                  const sol::table& t) {
    if (t["pointer"].valid()) {
        caps.pointer = t["pointer"].get<bool>();
    }
    if (t["wheel"].valid()) {
        caps.wheel = t["wheel"].get<bool>();
    }
    if (t["keyboard"].valid()) {
        caps.keyboard = t["keyboard"].get<bool>();
    }
    if (t["focusable"].valid()) {
        caps.focusable = t["focusable"].get<bool>();
    }
    if (t["interceptsChildren"].valid()) {
        caps.interceptsChildren = t["interceptsChildren"].get<bool>();
    }
    return caps;
}

void setCallbackSlot(RuntimeNode& node,
                     sol::function fn,
                     const std::function<void(RuntimeNode::CallbackSlots&, sol::function)>& setFn,
                     const std::function<void(RuntimeNode::CallbackSlots&)>& clearFn) {
    if (fn.valid()) {
        setFn(node.getCallbacks(), fn);
    } else {
        clearFn(node.getCallbacks());
    }
    node.markPropsDirty();
}

void syncPointerCapsFromCallbacks(RuntimeNode& node) {
    auto& callbacks = node.getCallbacks();
    auto caps = node.getInputCapabilities();
    caps.pointer = callbacks.onMouseDown.valid()
        || callbacks.onMouseDrag.valid()
        || callbacks.onMouseUp.valid()
        || callbacks.onMouseMove.valid()
        || callbacks.onClick.valid()
        || callbacks.onDoubleClick.valid()
        || callbacks.onMouseEnter.valid()
        || callbacks.onMouseExit.valid()
        || caps.pointer;
    node.setInputCapabilities(caps);
}

sol::table userDataKeysToTable(sol::state& lua, const std::vector<std::string>& keys) {
    sol::table out(lua, sol::create);
    for (std::size_t i = 0; i < keys.size(); ++i) {
        out[static_cast<int>(i + 1)] = keys[i];
    }
    return out;
}

} // namespace

void LuaRuntimeNodeBindings::setAllowAutomaticLegacyRetainedReplay(bool allow) {
    automaticLegacyReplayEnabled().store(allow, std::memory_order_relaxed);
}

void LuaRuntimeNodeBindings::registerBindings(LuaCoreEngine& engine, RuntimeNode* rootRuntime) {
    auto& lua = engine.getLuaState();

    lua.new_usertype<RuntimeNode>(
        "RuntimeNode",
        sol::no_constructor,

        "addChild",
        [](RuntimeNode& node, const std::string& name) -> RuntimeNode* {
            return node.createChild(name);
        },
        "createChild",
        [](RuntimeNode& node, const std::string& name) -> RuntimeNode* {
            return node.createChild(name);
        },
        "removeChild", &RuntimeNode::removeChild,
        "clearChildren", &RuntimeNode::clearChildren,
        "getNumChildren", &RuntimeNode::getNumChildren,
        "getChild", &RuntimeNode::getChild,
        "getParent", &RuntimeNode::getParent,

        "setBounds",
        [&engine](RuntimeNode& node, int x, int y, int w, int h) {
            node.setBounds(x, y, w, h);
            if (allowAutomaticLegacyRetainedReplay()
                && node.getCallbacks().onDraw.valid() && w > 0 && h > 0) {
                warnLegacyRetainedReplay(node, "setBounds");
                LuaUIBindings::invokeRuntimeNodeDrawForRetained(engine, node);
            }
        },
        "getBounds",
        [](RuntimeNode& node) {
            const auto& bounds = node.getBounds();
            return std::make_tuple(bounds.x, bounds.y, bounds.w, bounds.h);
        },
        "getWidth",
        [](RuntimeNode& node) {
            return node.getBounds().w;
        },
        "getHeight",
        [](RuntimeNode& node) {
            return node.getBounds().h;
        },
        "setClipRect",
        [](RuntimeNode& node, int x, int y, int w, int h) {
            node.setClipRect(x, y, w, h);
        },
        "getClipRect",
        [](RuntimeNode& node) {
            const auto& clip = node.getClipRect();
            return std::make_tuple(clip.x, clip.y, clip.w, clip.h);
        },
        "hasClipRect", &RuntimeNode::hasClipRect,
        "clearClipRect", &RuntimeNode::clearClipRect,

        "setNodeId", &RuntimeNode::setNodeId,
        "getNodeId", [](RuntimeNode& node) { return node.getNodeId(); },
        "setWidgetType", &RuntimeNode::setWidgetType,
        "getWidgetType", [](RuntimeNode& node) { return node.getWidgetType(); },
        "setVisible", &RuntimeNode::setVisible,
        "isVisible", &RuntimeNode::isVisible,
        "setOpenGLEnabled", &RuntimeNode::setOpenGLEnabled,
        "isOpenGLEnabled", &RuntimeNode::isOpenGLEnabled,
        "setZOrder", &RuntimeNode::setZOrder,
        "getZOrder", &RuntimeNode::getZOrder,

        "setTransform", &RuntimeNode::setTransform,
        "getTransform",
        [&lua](RuntimeNode& node) {
            const auto& transform = node.getTransform();
            sol::table out(lua, sol::create);
            out["scaleX"] = transform.scaleX;
            out["scaleY"] = transform.scaleY;
            out["translateX"] = transform.translateX;
            out["translateY"] = transform.translateY;
            return out;
        },
        "clearTransform", &RuntimeNode::clearTransform,
        "hasTransform", &RuntimeNode::hasTransform,

        "setStyle",
        [](RuntimeNode& node, sol::table t) {
            node.setStyle(styleFromTable(node.getStyle(), t));
        },
        "getStyle",
        [&lua](RuntimeNode& node) {
            return styleToTable(lua, node.getStyle());
        },

        "setInputCapabilities",
        [](RuntimeNode& node, sol::table t) {
            node.setInputCapabilities(inputCapsFromTable(node.getInputCapabilities(), t));
        },
        "getInputCapabilities",
        [&lua](RuntimeNode& node) {
            return inputCapsToTable(lua, node.getInputCapabilities());
        },
        "setInterceptsMouse",
        [](RuntimeNode& node, bool clicks, bool children) {
            auto caps = node.getInputCapabilities();
            caps.pointer = clicks;
            caps.interceptsChildren = children;
            node.setInputCapabilities(caps);
        },
        "getInterceptsMouse",
        [](RuntimeNode& node) {
            const auto caps = node.getInputCapabilities();
            return std::make_tuple(caps.pointer, caps.interceptsChildren);
        },
        "setWantsKeyboardFocus",
        [](RuntimeNode& node, bool wantsFocus) {
            auto caps = node.getInputCapabilities();
            caps.focusable = wantsFocus;
            caps.keyboard = wantsFocus || caps.keyboard;
            node.setInputCapabilities(caps);
        },
        "grabKeyboardFocus",
        [](RuntimeNode& node) {
            auto caps = node.getInputCapabilities();
            caps.focusable = true;
            caps.keyboard = true;
            node.setInputCapabilities(caps);
            node.setFocused(true);
        },
        "hasKeyboardFocus", &RuntimeNode::isFocused,
        "isMouseOver", &RuntimeNode::isHovered,
        "repaint",
        [&engine](RuntimeNode& node) {
            node.markRenderDirty();
            const auto& bounds = node.getBounds();
            if (allowAutomaticLegacyRetainedReplay()
                && node.getCallbacks().onDraw.valid() && bounds.w > 0 && bounds.h > 0) {
                warnLegacyRetainedReplay(node, "repaint");
                LuaUIBindings::invokeRuntimeNodeDrawForRetained(engine, node);
            }
        },

        "setUserData", &RuntimeNode::setUserData,
        "getUserData", &RuntimeNode::getUserData,
        "hasUserData", &RuntimeNode::hasUserData,
        "getUserDataKeys",
        [&lua](RuntimeNode& node) {
            return userDataKeysToTable(lua, node.getUserDataKeys());
        },
        "clearUserData", &RuntimeNode::clearUserData,
        "clearAllUserData", &RuntimeNode::clearAllUserData,

        "setDisplayList",
        [](RuntimeNode& node, sol::object value) {
            juce::var displayList;
            if (!tryLuaDisplayListToVar(value, displayList)) {
                displayList = luaObjectToVar(value);
            }
            node.setDisplayList(displayList);
            LuaUIBindings::noteRuntimeNodeDisplayListMutation(node);
        },
        "getDisplayList",
        [&lua](RuntimeNode& node) -> sol::object {
            return varToLuaObject(lua, node.getDisplayList());
        },
        "clearDisplayList",
        [](RuntimeNode& node) {
            node.clearDisplayList();
            LuaUIBindings::noteRuntimeNodeDisplayListMutation(node);
        },

        "setCustomSurface",
        [](RuntimeNode& node, const std::string& type, sol::object payload) {
            node.setCustomSurfaceType(type);
            node.setCustomRenderPayload(luaObjectToVar(payload));
        },
        "setCustomSurfaceType", &RuntimeNode::setCustomSurfaceType,
        "getCustomSurfaceType", [](RuntimeNode& node) { return node.getCustomSurfaceType(); },
        "setCustomRenderPayload",
        [](RuntimeNode& node, sol::object value) {
            node.setCustomRenderPayload(luaObjectToVar(value));
        },
        "getCustomRenderPayload",
        [&lua](RuntimeNode& node) -> sol::object {
            return varToLuaObject(lua, node.getCustomRenderPayload());
        },
        "clearCustomRenderPayload", &RuntimeNode::clearCustomRenderPayload,

        "getStructureVersion", &RuntimeNode::getStructureVersion,
        "getPropsVersion", &RuntimeNode::getPropsVersion,
        "getRenderVersion", &RuntimeNode::getRenderVersion,
        "markStructureDirty", &RuntimeNode::markStructureDirty,
        "markPropsDirty", &RuntimeNode::markPropsDirty,
        "markRenderDirty", &RuntimeNode::markRenderDirty,

        "isHovered", &RuntimeNode::isHovered,
        "isPressed", &RuntimeNode::isPressed,
        "isFocused", &RuntimeNode::isFocused,
        "setHovered", &RuntimeNode::setHovered,
        "setPressed", &RuntimeNode::setPressed,
        "setFocused", &RuntimeNode::setFocused,

        "clearCallbacks",
        [](RuntimeNode& node) {
            node.clearCallbacks();
            node.clearDisplayList();
        },
        "setOnMouseDown",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onMouseDown = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onMouseDown = sol::lua_nil; });
            syncPointerCapsFromCallbacks(node);
        },
        "setOnMouseDrag",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onMouseDrag = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onMouseDrag = sol::lua_nil; });
            syncPointerCapsFromCallbacks(node);
        },
        "setOnMouseUp",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onMouseUp = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onMouseUp = sol::lua_nil; });
            syncPointerCapsFromCallbacks(node);
        },
        "setOnMouseMove",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onMouseMove = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onMouseMove = sol::lua_nil; });
            syncPointerCapsFromCallbacks(node);
        },
        "setOnMouseWheel",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onMouseWheel = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onMouseWheel = sol::lua_nil; });
            auto caps = node.getInputCapabilities();
            caps.wheel = fn.valid();
            node.setInputCapabilities(caps);
        },
        "setOnKeyPress",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onKeyPress = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onKeyPress = sol::lua_nil; });
            auto caps = node.getInputCapabilities();
            caps.keyboard = fn.valid() || caps.focusable;
            node.setInputCapabilities(caps);
        },
        "setOnClick",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onClick = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onClick = sol::lua_nil; });
            syncPointerCapsFromCallbacks(node);
        },
        "setOnDoubleClick",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onDoubleClick = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onDoubleClick = sol::lua_nil; });
            syncPointerCapsFromCallbacks(node);
        },
        "setOnMouseEnter",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onMouseEnter = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onMouseEnter = sol::lua_nil; });
            syncPointerCapsFromCallbacks(node);
        },
        "setOnMouseExit",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onMouseExit = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onMouseExit = sol::lua_nil; });
            syncPointerCapsFromCallbacks(node);
        },
        "setOnDraw",
        [&engine](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onDraw = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onDraw = sol::lua_nil; });
            const auto& bounds = node.getBounds();
            if (fn.valid() && bounds.w > 0 && bounds.h > 0) {
                if (allowAutomaticLegacyRetainedReplay()) {
                    warnLegacyRetainedReplay(node, "setOnDraw");
                    LuaUIBindings::invokeRuntimeNodeDrawForRetained(engine, node);
                }
            } else if (!fn.valid()) {
                node.clearDisplayList();
            }
        },
        "invokeDrawForRetained",
        [&engine](RuntimeNode& node) {
            return LuaUIBindings::invokeRuntimeNodeDrawForRetained(engine, node);
        },
        "setOnGLRender",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onGLRender = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onGLRender = sol::lua_nil; });
            if (node.isOpenGLEnabled()) {
                node.setCustomSurfaceType("opengl");
            }
        },
        "setOnGLContextCreated",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onGLContextCreated = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onGLContextCreated = sol::lua_nil; });
        },
        "setOnGLContextClosing",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onGLContextClosing = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onGLContextClosing = sol::lua_nil; });
        },
        "setOnValueChanged",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onValueChanged = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onValueChanged = sol::lua_nil; });
        },
        "setOnToggled",
        [](RuntimeNode& node, sol::function fn) {
            setCallbackSlot(node, fn,
                            [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onToggled = value; },
                            [](RuntimeNode::CallbackSlots& slots) { slots.onToggled = sol::lua_nil; });
        }
    );

    if (rootRuntime != nullptr) {
        lua["rootRuntime"] = rootRuntime;
    }
}
