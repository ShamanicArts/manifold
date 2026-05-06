#include "ContractHarnessUtils.h"

#include "../core/LinkSupport.h"

#include <juce_core/juce_core.h>

namespace {

using namespace contract_harness_utils;
using namespace manifold::link_support;

juce::var makeBoolState(const LinkSync& linkSync) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("enabled", isLinkEnabled(linkSync));
    obj->setProperty("tempoSyncEnabled", isLinkTempoSyncEnabled(linkSync));
    obj->setProperty("startStopSyncEnabled", isLinkStartStopSyncEnabled(linkSync));
    obj->setProperty("numPeers", getLinkNumPeers(linkSync));
    obj->setProperty("isPlaying", isLinkPlaying(linkSync));
    obj->setProperty("beat", getLinkBeat(linkSync));
    obj->setProperty("phase", getLinkPhase(linkSync));
    obj->setProperty("tempo", linkSync.getTempo());
    obj->setProperty("quantum", linkSync.getQuantum());
    return juce::var(obj);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    LinkSync linkSync;

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // =====================================================================
    // Domain 1: initialise and default helper reads
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("preInit", makeBoolState(linkSync));

        linkSync.initialise(48000.0);
        obj->setProperty("postInit", makeBoolState(linkSync));
        obj->setProperty("samplesToBeats96000", linkSync.samplesToBeats(96000.0));
        obj->setProperty("beatsToSamples4", linkSync.beatsToSamples(4.0));
        root->setProperty("initialise", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: helper write wrappers
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        setLinkEnabled(linkSync, false);
        setLinkTempoSyncEnabled(linkSync, false);
        setLinkStartStopSyncEnabled(linkSync, false);
        obj->setProperty("allDisabled", makeBoolState(linkSync));

        setLinkEnabled(linkSync, true);
        setLinkTempoSyncEnabled(linkSync, true);
        setLinkStartStopSyncEnabled(linkSync, true);
        obj->setProperty("allEnabled", makeBoolState(linkSync));
        root->setProperty("toggleHelpers", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: pending request helpers + observable state projection
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        requestLinkTempo(linkSync, 173.25);
        processLinkPendingRequests(linkSync);
        requestLinkStart(linkSync);
        requestLinkStop(linkSync);

        linkSync.getState().numPeers.store(7, std::memory_order_relaxed);
        linkSync.getState().isPlaying.store(true, std::memory_order_relaxed);
        linkSync.getState().beat.store(3.25, std::memory_order_relaxed);
        linkSync.getState().phase.store(0.25, std::memory_order_relaxed);
        obj->setProperty("afterRequests", makeBoolState(linkSync));
        obj->setProperty("samplesToNextBeat", linkSync.getSamplesToNextBeat());
        obj->setProperty("samplesToNextBar", linkSync.getSamplesToNextBar());
        root->setProperty("requestsAndDerived", juce::var(obj));
    }

    linkSync.shutdown();

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "LinkSupport contract", contract);
}
