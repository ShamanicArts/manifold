#include "LuaDspBindings.h"

#include "../ILuaControlState.h"
#include "../ScriptableProcessor.h"
#include <juce_core/juce_core.h>

namespace lua_bindings {

void registerDspBindings(sol::state& lua,
                         ILuaControlState& state) {
    lua["reloadDspScript"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->reloadDspScript();
    };

    lua["loadDspScript"] = [&state](const std::string& path) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->loadDspScript(juce::File(path));
    };

    lua["loadDspScriptInSlot"] = [&state](const std::string& path,
                                          const std::string& slot) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        const std::string slotName = slot.empty() ? "default" : slot;
        const bool ok = processor->loadDspScript(juce::File(path), slotName);
        if (ok && slotName != "default") {
            state.getManagedDspSlots().insert(slotName);
        }
        return ok;
    };

    lua["loadDspScriptFromString"] = [&state](const std::string& code,
                                               const std::string& sourceName) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->loadDspScriptFromString(code, sourceName);
    };

    lua["loadDspScriptFromStringInSlot"] = [&state](const std::string& code,
                                                     const std::string& sourceName,
                                                     const std::string& slot) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        const std::string slotName = slot.empty() ? "default" : slot;
        const bool ok = processor->loadDspScriptFromString(code, sourceName, slotName);
        if (ok && slotName != "default") {
            state.getManagedDspSlots().insert(slotName);
        }
        return ok;
    };

    lua["setDspSlotPersistOnUiSwitch"] = [&state](const std::string& slot,
                                                   bool persist) -> bool {
        const std::string slotName = slot.empty() ? "default" : slot;
        if (slotName == "default") return false;

        state.getManagedDspSlots().insert(slotName);
        if (persist) {
            state.getPersistentDspSlots().insert(slotName);
        } else {
            state.getPersistentDspSlots().erase(slotName);
        }
        return true;
    };

    lua["isDspSlotPersistOnUiSwitch"] = [&state](const std::string& slot) -> bool {
        const std::string slotName = slot.empty() ? "default" : slot;
        return state.getPersistentDspSlots().find(slotName) !=
               state.getPersistentDspSlots().end();
    };

    lua["unloadDspSlot"] = [&state](const std::string& slot) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        const std::string slotName = slot.empty() ? "default" : slot;
        const bool ok = processor->unloadDspSlot(slotName);
        if (slotName != "default") {
            state.getManagedDspSlots().erase(slotName);
            state.getPersistentDspSlots().erase(slotName);
        }
        return ok;
    };

    lua["isDspScriptLoaded"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isDspScriptLoaded();
    };

    lua["isDspSlotLoaded"] = [&state](const std::string& slot) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isDspSlotLoaded(slot);
    };

    lua["getDspScriptLastError"] = [&state]() -> std::string {
        auto* processor = state.getProcessor();
        if (!processor) return "";
        return processor->getDspScriptLastError();
    };
}

} // namespace lua_bindings
