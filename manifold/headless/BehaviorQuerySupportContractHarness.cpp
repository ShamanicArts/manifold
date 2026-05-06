#include "ContractHarnessUtils.h"

#include "../core/BehaviorQuerySupport.h"
#include "../primitives/control/ControlServer.h"
#include "../primitives/dsp/CaptureBuffer.h"
#include "../primitives/scripting/DSPPluginScriptHost.h"

#include <juce_core/juce_core.h>

namespace {

using namespace contract_harness_utils;
using namespace manifold::behavior_query_support;

juce::var toLayerStateContracts() {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("state_0", static_cast<int>(toLayerStateEnum(0)));
    obj->setProperty("state_1", static_cast<int>(toLayerStateEnum(1)));
    obj->setProperty("state_2", static_cast<int>(toLayerStateEnum(2)));
    obj->setProperty("state_3", static_cast<int>(toLayerStateEnum(3)));
    obj->setProperty("state_4", static_cast<int>(toLayerStateEnum(4)));
    obj->setProperty("state_5", static_cast<int>(toLayerStateEnum(5)));
    obj->setProperty("state_6", static_cast<int>(toLayerStateEnum(6)));
    obj->setProperty("state_neg1", static_cast<int>(toLayerStateEnum(-1)));
    obj->setProperty("state_99", static_cast<int>(toLayerStateEnum(99)));
    return juce::var(obj);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // =====================================================================
    // Domain 1: toLayerStateEnum – all 7 raw values + out-of-range
    // =====================================================================
    root->setProperty("toLayerStateEnum", toLayerStateContracts());

    // =====================================================================
    // Domain 2: getLayerSnapshot – invalid index rejection
    // =====================================================================
    {
        ControlServer cs;
        auto* obj = new juce::DynamicObject();
        ScriptableLayerSnapshot snap;

        obj->setProperty("negativeIndex", getLayerSnapshot(-1, 8, cs, nullptr, snap));
        obj->setProperty("overMaxIndex", getLayerSnapshot(8, 8, cs, nullptr, snap));
        obj->setProperty("validIndex", getLayerSnapshot(0, 8, cs, nullptr, snap));
        if (getLayerSnapshot(0, 8, cs, nullptr, snap)) {
            auto* s = new juce::DynamicObject();
            s->setProperty("index", snap.index);
            s->setProperty("state", static_cast<int>(snap.state));
            obj->setProperty("snapshot", juce::var(s));
        }
        root->setProperty("getLayerSnapshot", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: getCaptureSize – empty buffer
    // =====================================================================
    {
        CaptureBuffer emptyBuf;
        auto* obj = new juce::DynamicObject();
        obj->setProperty("size", getCaptureSize(emptyBuf));
        root->setProperty("getCaptureSize", juce::var(obj));
    }

    // =====================================================================
    // Domain 4: computeLayerPeaks – null host rejection
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::vector<float> peaks;
        obj->setProperty("nullHost", computeLayerPeaks(0, 64, 8, nullptr, peaks));
        obj->setProperty("outOfRangeLayer", computeLayerPeaks(10, 64, 8, nullptr, peaks));
        obj->setProperty("zeroBuckets", computeLayerPeaks(0, 0, 8, nullptr, peaks));
        obj->setProperty("peaksEmptyAfterFail", static_cast<int>(peaks.size()));
        root->setProperty("computeLayerPeaks", juce::var(obj));
    }

    // =====================================================================
    // Domain 5: computeLayerPeaksForPath – null host, invalid args
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::vector<float> peaks;
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> emptySlots;

        // null host, empty path
        obj->setProperty("nullHostEmptyBase",
            computeLayerPeaksForPath("", 0, 64, 8, nullptr, emptySlots, peaks));

        // null host, /core/behavior path
        obj->setProperty("nullHostBehaviorBase",
            computeLayerPeaksForPath("/core/behavior", 0, 64, 8, nullptr, emptySlots, peaks));

        // null host, /core/slots/ path with empty slot name
        obj->setProperty("nullHostSlotsEmptyRest",
            computeLayerPeaksForPath("/core/slots/", 0, 64, 8, nullptr, emptySlots, peaks));

        // null host, /core/slots/foo path (slot doesn't exist in empty map)
        obj->setProperty("nullHostSlotsMissing",
            computeLayerPeaksForPath("/core/slots/foo", 0, 64, 8, nullptr, emptySlots, peaks));

        root->setProperty("computeLayerPeaksForPath", juce::var(obj));
    }

    // =====================================================================
    // Domain 6: computeCapturePeaks – empty buffer, edge cases
    // =====================================================================
    {
        CaptureBuffer emptyBuf(0);
        auto* obj = new juce::DynamicObject();
        std::vector<float> peaks;

        // empty buffer
        obj->setProperty("emptyBuffer", computeCapturePeaks(emptyBuf, 100, 0, 64, peaks));

        // negative numBuckets
        obj->setProperty("negativeBuckets", computeCapturePeaks(emptyBuf, 100, 0, -1, peaks));

        // end <= start
        obj->setProperty("endEqualsStart", computeCapturePeaks(emptyBuf, 100, 100, 64, peaks));

        emptyBuf.setSize(48000);
        // normal call on non-empty buffer (should succeed even with zeros)
        obj->setProperty("nonEmptyBuffer", computeCapturePeaks(emptyBuf, 48000, 0, 64, peaks));
        obj->setProperty("peaksSize", static_cast<int>(peaks.size()));

        root->setProperty("computeCapturePeaks", juce::var(obj));
    }

    // =====================================================================
    // Domain 7: null-host query wrappers
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::vector<float> peaks;

        obj->setProperty("computeSynthSamplePeaks", computeSynthSamplePeaks(nullptr, 64, peaks));
        obj->setProperty("computeDynamicSamplePeaks", computeDynamicSamplePeaks(nullptr, 0, 64, peaks));
        obj->setProperty("voiceSamplePositions", static_cast<double>(getVoiceSamplePositions(nullptr).size()));
        obj->setProperty("dynamicSampleVoicePositions", static_cast<double>(getDynamicSampleVoicePositions(nullptr, 0).size()));

        dsp_primitives::SampleAnalysis analysis{};
        obj->setProperty("latestSampleAnalysis", getLatestSampleAnalysis(nullptr, analysis));

        dsp_primitives::PartialData partials{};
        obj->setProperty("latestSamplePartials", getLatestSamplePartials(nullptr, partials));

        SampleDerivedAdditiveDebugState debugState{};
        obj->setProperty("sampleDerivedAdditiveDebug", getSampleDerivedAdditiveDebug(nullptr, 0, debugState));
        obj->setProperty("refreshSampleDerivedAdditiveDebug", refreshSampleDerivedAdditiveDebug(nullptr, debugState));
        obj->setProperty("ensureDynamicModuleSlot", ensureDynamicModuleSlot(nullptr, "", 0));

        root->setProperty("nullHostQueries", juce::var(obj));
    }

    // =====================================================================
    // Domain 8: ControlServer atomic state readers
    // =====================================================================
    {
        ControlServer cs;
        auto* obj = new juce::DynamicObject();

        obj->setProperty("tempo", getTempo(cs));
        obj->setProperty("targetBPM", getTargetBPM(cs));
        obj->setProperty("masterVolume", getMasterVolume(cs));
        obj->setProperty("inputVolume", getInputVolume(cs));
        obj->setProperty("passthroughEnabled", isPassthroughEnabled(cs));
        obj->setProperty("isRecording", isRecording(cs));
        obj->setProperty("overdubEnabled", isOverdubEnabled(cs));
        obj->setProperty("activeLayer", getActiveLayerIndex(cs));
        obj->setProperty("forwardArmed", isForwardCommitArmed(cs));
        obj->setProperty("forwardBars", getForwardCommitBars(cs));
        obj->setProperty("recordMode", getRecordModeIndex(cs));
        obj->setProperty("commitCount", getCommitCount(cs));

        root->setProperty("controlServerState", juce::var(obj));
    }

    // =====================================================================
    // Domain 9: getSamplesPerBar – cache miss and cache hit
    // =====================================================================
    {
        ControlServer cs;
        auto* obj = new juce::DynamicObject();

        // samplesPerBar is 0.0 initially -> should compute
        obj->setProperty("cacheMiss", getSamplesPerBar(cs, 48000.0));

        // Set cached value
        runtimeTelemetryView(cs).setSamplesPerBar(1234.0f);
        obj->setProperty("cacheHit", getSamplesPerBar(cs, 48000.0));

        // zero sample rate
        {
            ControlServer cs2;
            obj->setProperty("zeroSampleRate", getSamplesPerBar(cs2, 0.0));

            // zero tempo
            runtimeTelemetryView(cs2).setTempo(0.0f);
            obj->setProperty("zeroTempo", getSamplesPerBar(cs2, 48000.0));
        }

        root->setProperty("samplesPerBar", juce::var(obj));
    }

    // =====================================================================
    // Domain 10: getSpectrumData – null host + empty slots
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> emptySlots;
        const auto spec = getSpectrumData(nullptr, emptySlots);
        bool allZero = true;
        for (const auto& v : spec) {
            if (v != 0.0f) { allZero = false; break; }
        }
        obj->setProperty("nullHostEmptySlots", allZero);
        obj->setProperty("arraySize", static_cast<int>(spec.size()));

        root->setProperty("getSpectrumData", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "BehaviorQuerySupport contract", contract);
}
