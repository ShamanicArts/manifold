#include "LuaLinkBindings.h"

#include "../ILuaControlState.h"
#include "../ScriptableProcessor.h"

namespace lua_bindings {

void registerLinkBindings(sol::state& lua,
                          ILuaControlState& state) {
    auto linkTable = lua.create_table();

    linkTable["isEnabled"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isLinkEnabled();
    };

    linkTable["setEnabled"] = [&state](bool enabled) {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->setLinkEnabled(enabled);
    };

    linkTable["isTempoSyncEnabled"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isLinkTempoSyncEnabled();
    };

    linkTable["setTempoSyncEnabled"] = [&state](bool enabled) {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->setLinkTempoSyncEnabled(enabled);
    };

    linkTable["isStartStopSyncEnabled"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isLinkStartStopSyncEnabled();
    };

    linkTable["setStartStopSyncEnabled"] = [&state](bool enabled) {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->setLinkStartStopSyncEnabled(enabled);
    };

    linkTable["getNumPeers"] = [&state]() -> int {
        auto* processor = state.getProcessor();
        if (!processor) return 0;
        return processor->getLinkNumPeers();
    };

    linkTable["isPlaying"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isLinkPlaying();
    };

    linkTable["getBeat"] = [&state]() -> double {
        auto* processor = state.getProcessor();
        if (!processor) return 0.0;
        return processor->getLinkBeat();
    };

    linkTable["getPhase"] = [&state]() -> double {
        auto* processor = state.getProcessor();
        if (!processor) return 0.0;
        return processor->getLinkPhase();
    };

    linkTable["requestTempo"] = [&state](double bpm) {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->requestLinkTempo(bpm);
    };

    linkTable["requestStart"] = [&state]() {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->requestLinkStart();
    };

    linkTable["requestStop"] = [&state]() {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->requestLinkStop();
    };

    lua["link"] = linkTable;
}

} // namespace lua_bindings
