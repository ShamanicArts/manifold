#pragma once

#include <memory>
#include <string>
#include <unordered_map>

#include "../primitives/scripting/DSPPluginScriptHost.h"
#include "BehaviorCoreProcessor.h"

namespace manifold {
namespace dsp_slot_support {

inline DSPPluginScriptHost& getOrCreateSlot(
    DSPPluginScriptHost* defaultHost,
    std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>>& dspSlots,
    ScriptableProcessor* processor,
    const std::string& slot) {
    if (slot == "default") {
        return *defaultHost;
    }

    auto it = dspSlots.find(slot);
    if (it != dspSlots.end()) {
        return *it->second;
    }

    auto host = std::make_unique<DSPPluginScriptHost>();
    host->initialise(processor, "/core/slots/" + slot);
    auto& ref = *host;
    dspSlots[slot] = std::move(host);
    return ref;
}

inline bool loadDefaultDspScript(DSPPluginScriptHost* dspScriptHost,
                                 const juce::File& scriptFile,
                                 std::string& dspScriptLastError) {
    if (dspScriptHost == nullptr) {
        dspScriptLastError = "DSP script host unavailable";
        return false;
    }

    const bool ok = dspScriptHost->loadScript(scriptFile);
    if (!ok) {
        dspScriptLastError = dspScriptHost->getLastError();
    } else {
        dspScriptLastError.clear();
    }
    return ok;
}

inline bool loadDefaultDspScriptFromString(DSPPluginScriptHost* dspScriptHost,
                                           const std::string& luaCode,
                                           const std::string& sourceName,
                                           std::string& dspScriptLastError) {
    if (dspScriptHost == nullptr) {
        dspScriptLastError = "DSP script host unavailable";
        return false;
    }

    const bool ok = dspScriptHost->loadScriptFromString(luaCode, sourceName);
    if (!ok) {
        dspScriptLastError = dspScriptHost->getLastError();
    } else {
        dspScriptLastError.clear();
    }
    return ok;
}

inline bool reloadDefaultDspScript(DSPPluginScriptHost* dspScriptHost,
                                   std::string& dspScriptLastError) {
    if (dspScriptHost == nullptr) {
        dspScriptLastError = "DSP script host unavailable";
        return false;
    }

    const bool ok = dspScriptHost->reloadCurrentScript();
    if (!ok) {
        dspScriptLastError = dspScriptHost->getLastError();
    } else {
        dspScriptLastError.clear();
    }
    return ok;
}

inline bool isDspScriptLoaded(const DSPPluginScriptHost* dspScriptHost) {
    return dspScriptHost != nullptr && dspScriptHost->isLoaded();
}

inline bool loadNamedDspScript(
    DSPPluginScriptHost* defaultHost,
    std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>>& dspSlots,
    ScriptableProcessor* processor,
    const juce::File& scriptFile,
    const std::string& slot,
    std::string& dspScriptLastError) {
    if (slot == "default") {
        return loadDefaultDspScript(defaultHost, scriptFile, dspScriptLastError);
    }

    auto& host = getOrCreateSlot(defaultHost, dspSlots, processor, slot);
    const bool ok = host.loadScript(scriptFile);
    if (!ok) {
        dspScriptLastError = host.getLastError();
    } else {
        dspScriptLastError.clear();
    }
    return ok;
}

inline bool loadNamedDspScriptFromString(
    DSPPluginScriptHost* defaultHost,
    std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>>& dspSlots,
    ScriptableProcessor* processor,
    const std::string& luaCode,
    const std::string& sourceName,
    const std::string& slot,
    std::string& dspScriptLastError) {
    if (slot == "default") {
        return loadDefaultDspScriptFromString(defaultHost, luaCode, sourceName,
                                              dspScriptLastError);
    }

    auto& host = getOrCreateSlot(defaultHost, dspSlots, processor, slot);
    const bool ok = host.loadScriptFromString(luaCode, sourceName);
    if (!ok) {
        dspScriptLastError = host.getLastError();
    } else {
        dspScriptLastError.clear();
    }
    return ok;
}

inline bool reloadNamedDspScript(
    DSPPluginScriptHost* defaultHost,
    std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>>& dspSlots,
    const std::string& slot,
    std::string& dspScriptLastError) {
    if (slot == "default") {
        return reloadDefaultDspScript(defaultHost, dspScriptLastError);
    }

    auto it = dspSlots.find(slot);
    if (it == dspSlots.end()) {
        dspScriptLastError = "no script loaded in slot: " + slot;
        return false;
    }

    const bool ok = it->second->reloadCurrentScript();
    if (!ok) {
        dspScriptLastError = it->second->getLastError();
    } else {
        dspScriptLastError.clear();
    }
    return ok;
}

inline bool unloadNamedDspSlot(
    std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>>& dspSlots,
    const std::string& slot) {
    if (slot == "default") {
        return false;
    }

    auto it = dspSlots.find(slot);
    if (it == dspSlots.end()) {
        return false;
    }

    const bool ok = it->second->loadScriptFromString(
        "function buildPlugin(ctx) return {} end", "unload:" + slot);
    if (ok) {
        it->second->markUnloaded();
    }
    return ok;
}

inline void drainPendingSlotDestroy() {
    // Intentionally no-op for now; slot hosts are kept alive for stability.
}

inline bool isDspSlotLoaded(
    const DSPPluginScriptHost* defaultHost,
    const std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>>& dspSlots,
    const std::string& slot) {
    if (slot == "default") {
        return isDspScriptLoaded(defaultHost);
    }

    auto it = dspSlots.find(slot);
    return it != dspSlots.end() && it->second->isLoaded();
}

inline const std::string& getDspScriptLastError(const DSPPluginScriptHost* dspScriptHost,
                                                const std::string& fallback) {
    if (!fallback.empty()) {
        return fallback;
    }
    if (dspScriptHost != nullptr) {
        return dspScriptHost->getLastError();
    }
    return fallback;
}

inline std::shared_ptr<dsp_primitives::IPrimitiveNode> getGraphNodeByPath(
    DSPPluginScriptHost* defaultHost,
    std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>>& dspSlots,
    const std::string& path) {
    if (defaultHost != nullptr) {
        auto node = defaultHost->getGraphNodeByPath(path);
        if (node) {
            return node;
        }
    }

    for (auto& entry : dspSlots) {
        auto* host = entry.second.get();
        if (host == nullptr) {
            continue;
        }
        auto node = host->getGraphNodeByPath(path);
        if (node) {
            return node;
        }
    }

    return {};
}

} // namespace dsp_slot_support
} // namespace manifold
