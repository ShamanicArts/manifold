#include "ContractHarnessUtils.h"

#include "../core/DspSlotSupport.h"

#include <juce_core/juce_core.h>

namespace {

using namespace contract_harness_utils;
using namespace manifold::dsp_slot_support;

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // =====================================================================
    // Domain 1: getOrCreateSlot – "default" returns default host
    // =====================================================================
    {
        DSPPluginScriptHost defaultHost;
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> slots;
        auto* obj = new juce::DynamicObject();

        auto& ref = getOrCreateSlot(&defaultHost, slots, nullptr, "default");
        obj->setProperty("sameAsDefault", (&ref == &defaultHost));
        obj->setProperty("numSlotsAfterDefault", static_cast<int>(slots.size()));

        root->setProperty("getOrCreateDefault", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: loadDefaultDspScript – null host
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::string err;
        obj->setProperty("result", loadDefaultDspScript(nullptr, juce::File(), err));
        obj->setProperty("error", juce::var(err.c_str()));
        root->setProperty("loadDefaultNullHost", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: loadDefaultDspScriptFromString – null host, valid Lua
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::string err;
        obj->setProperty("result",
            loadDefaultDspScriptFromString(nullptr, "function buildPlugin(ctx) return {} end", "test", err));
        obj->setProperty("error", juce::var(err.c_str()));
        root->setProperty("loadDefaultFromStringNullHost", juce::var(obj));
    }

    // =====================================================================
    // Domain 4: reloadDefaultDspScript – null host
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::string err;
        obj->setProperty("result", reloadDefaultDspScript(nullptr, err));
        obj->setProperty("error", juce::var(err.c_str()));
        root->setProperty("reloadDefaultNullHost", juce::var(obj));
    }

    // =====================================================================
    // Domain 5: isDspScriptLoaded – null host
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("nullHost", isDspScriptLoaded(nullptr));

        DSPPluginScriptHost unloadedHost;
        obj->setProperty("unloadedHost", isDspScriptLoaded(&unloadedHost));

        root->setProperty("isLoaded", juce::var(obj));
    }

    // =====================================================================
    // Domain 6: loadNamedDspScript – null default, non-existent file
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::string err;
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> slots;

        // default slot with null host
        obj->setProperty("nullDefaultSlot",
            loadNamedDspScript(nullptr, slots, nullptr, juce::File("/nonexistent.lua"), "default", err));
        obj->setProperty("nullDefaultError", juce::var(err.c_str()));

        // named slot that doesn't exist yet – will create via getOrCreateSlot
        // but load will fail since file doesn't exist (ScriptableProcessor is null)
        err.clear();
        obj->setProperty("namedSlotMissing",
            loadNamedDspScript(nullptr, slots, nullptr, juce::File("/nonexistent.lua"), "slot-a", err));

        root->setProperty("loadNamed", juce::var(obj));
    }

    // =====================================================================
    // Domain 7: loadNamedDspScriptFromString – valid Lua, named slot
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::string err;
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> slots;

        // named slot with valid Lua but no processor (will create but load may fail)
        err.clear();
        obj->setProperty("namedSlotFromString",
            loadNamedDspScriptFromString(nullptr, slots, nullptr,
                "function buildPlugin(ctx) return {} end", "test", "slot-b", err));

        root->setProperty("loadNamedFromString", juce::var(obj));
    }

    // =====================================================================
    // Domain 8: reloadNamedDspScript – missing slot, default null
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::string err;
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> slots;

        // default slot with null host
        obj->setProperty("reloadNullDefault",
            reloadNamedDspScript(nullptr, slots, "default", err));

        // missing named slot
        err.clear();
        obj->setProperty("reloadMissingSlot",
            reloadNamedDspScript(nullptr, slots, "nonexistent", err));
        obj->setProperty("reloadMissingError", juce::var(err.c_str()));

        root->setProperty("reloadNamed", juce::var(obj));
    }

    // =====================================================================
    // Domain 9: unloadNamedDspSlot
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> slots;

        // can't unload "default"
        obj->setProperty("unloadDefault", unloadNamedDspSlot(slots, "default"));

        // missing slot
        obj->setProperty("unloadMissing", unloadNamedDspSlot(slots, "nonexistent"));

        // slot exists but unload requires loadScriptFromString which needs Lua
        // – just verify the existence check works
        {
            auto host = std::make_unique<DSPPluginScriptHost>();
            slots["slot-c"] = std::move(host);
        }
        obj->setProperty("unloadExists",
            unloadNamedDspSlot(slots, "slot-c"));

        root->setProperty("unloadNamed", juce::var(obj));
    }

    // =====================================================================
    // Domain 10: isDspSlotLoaded – null host, empty slots
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> emptySlots;

        obj->setProperty("defaultNullHost", isDspSlotLoaded(nullptr, emptySlots, "default"));
        obj->setProperty("namedNullHost", isDspSlotLoaded(nullptr, emptySlots, "slot-x"));
        obj->setProperty("namedInEmptySlots", isDspSlotLoaded(nullptr, emptySlots, "nonexistent"));

        root->setProperty("isSlotLoaded", juce::var(obj));
    }

    // =====================================================================
    // Domain 11: getDspScriptLastError – null host
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::string fallback = "fallback error";
        const auto& result = getDspScriptLastError(nullptr, fallback);
        obj->setProperty("nullHostReturnsFallback", (&result == &fallback));
        obj->setProperty("fallbackContent", juce::var(result.c_str()));
        root->setProperty("getLastError", juce::var(obj));
    }

    // =====================================================================
    // Domain 12: getGraphNodeByPath – null host, empty slots
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> emptySlots;

        auto node = getGraphNodeByPath(nullptr, emptySlots, "/any/path");
        obj->setProperty("nullHostEmptySlots", node == nullptr);

        root->setProperty("getGraphNodeByPath", juce::var(obj));
    }

    // =====================================================================
    // Domain 13: drainPendingSlotDestroy – just a no-op, verify it doesn't crash
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        drainPendingSlotDestroy();
        obj->setProperty("noop", true);
        root->setProperty("drainPending", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "DspSlotSupport contract", contract);
}
