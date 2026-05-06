#include "LuaUIBindingHelpers.h"

#include <algorithm>
#include <utility>

namespace lua_ui_helpers {

thread_local juce::Graphics* currentGraphics = nullptr;
thread_local RuntimeDrawRecorder* currentRuntimeDrawRecorder = nullptr;
thread_local RuntimeNode* currentRuntimeDrawNode = nullptr;
thread_local bool currentRuntimeDrawMutatedDisplayList = false;

namespace {
std::function<void(const std::string&)> displayListCallback;

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
    setPrimitiveProperty("startAngle");
    setPrimitiveProperty("endAngle");

    const juce::var points = luaObjectToVar(table["points"]);
    if (!points.isVoid() && !points.isUndefined()) {
        obj->setProperty("points", points);
    }

    out = juce::var(obj.release());
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
} // namespace

void setDisplayListCallback(std::function<void(const std::string&)> callback) {
    displayListCallback = std::move(callback);
}

void broadcastDisplayList(const std::string& json) {
    if (displayListCallback) {
        displayListCallback(json);
    }
}

std::unique_ptr<juce::DynamicObject> makeDisplayListCommand(const juce::String& cmdName) {
    auto cmd = std::make_unique<juce::DynamicObject>();
    cmd->setProperty("cmd", cmdName);
    return cmd;
}

void pushRecordedCommand(std::unique_ptr<juce::DynamicObject> cmd) {
    if (currentRuntimeDrawRecorder == nullptr || cmd == nullptr) {
        return;
    }
    currentRuntimeDrawRecorder->commands.add(juce::var(cmd.release()));
}

void applyRecordedDrawState(juce::DynamicObject& cmd) {
    if (currentRuntimeDrawRecorder == nullptr) {
        return;
    }
    cmd.setProperty("color", juce::var(static_cast<juce::int64>(currentRuntimeDrawRecorder->state.color)));
    cmd.setProperty("fontSize", currentRuntimeDrawRecorder->state.fontSize);
}

std::pair<std::string, std::string> justificationToAlign(int justification) {
    juce::Justification just(justification);

    std::string align = "left";
    if (just.testFlags(juce::Justification::horizontallyCentred)) {
        align = "center";
    } else if (just.testFlags(juce::Justification::right)) {
        align = "right";
    }

    std::string valign = "top";
    if (just.testFlags(juce::Justification::verticallyCentred)) {
        valign = "middle";
    } else if (just.testFlags(juce::Justification::bottom)) {
        valign = "bottom";
    }

    return {align, valign};
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

} // namespace lua_ui_helpers
