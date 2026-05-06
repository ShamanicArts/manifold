#include "ContractHarnessUtils.h"

#include "../core/BehaviorHousekeepingSupport.h"
#include "../primitives/dsp/CaptureBuffer.h"

#include <juce_core/juce_core.h>

namespace {

using namespace contract_harness_utils;
using namespace manifold::behavior_housekeeping_support;

// Simple stand-in that matches the interface expected by takePendingString
struct TestRequest {
    std::atomic<bool> pending{false};
    std::mutex mutex;
    std::string path;
};

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // =====================================================================
    // Domain 1: takePendingString – not pending
    // =====================================================================
    {
        TestRequest req;
        auto* obj = new juce::DynamicObject();
        obj->setProperty("notPending",
            juce::var(takePendingString(req, [](TestRequest& r) -> std::string& { return r.path; }, true).c_str()));
        root->setProperty("takePendingNotPending", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: takePendingString – pending, clear true
    // =====================================================================
    {
        TestRequest req;
        req.pending.store(true, std::memory_order_release);
        {
            std::lock_guard<std::mutex> lock(req.mutex);
            req.path = "/test/path/123";
        }
        auto* obj = new juce::DynamicObject();
        obj->setProperty("taken",
            juce::var(takePendingString(req, [](TestRequest& r) -> std::string& { return r.path; }, true).c_str()));
        // after take, pending should be false and path cleared
        bool stillPending = req.pending.load(std::memory_order_acquire);
        std::string clearedPath;
        {
            std::lock_guard<std::mutex> lock(req.mutex);
            clearedPath = req.path;
        }
        obj->setProperty("stillPending", stillPending);
        obj->setProperty("clearedPath", juce::var(clearedPath.c_str()));
        root->setProperty("takePendingClearTrue", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: takePendingString – pending, clear false
    // =====================================================================
    {
        TestRequest req;
        req.pending.store(true, std::memory_order_release);
        {
            std::lock_guard<std::mutex> lock(req.mutex);
            req.path = "/keep/this/path";
        }
        auto* obj = new juce::DynamicObject();
        obj->setProperty("taken",
            juce::var(takePendingString(req, [](TestRequest& r) -> std::string& { return r.path; }, false).c_str()));
        // path should NOT be cleared
        bool stillPending = req.pending.load(std::memory_order_acquire);
        std::string keptPath;
        {
            std::lock_guard<std::mutex> lock(req.mutex);
            keptPath = req.path;
        }
        obj->setProperty("stillPending", stillPending);
        obj->setProperty("keptPath", juce::var(keptPath.c_str()));
        root->setProperty("takePendingClearFalse", juce::var(obj));
    }

    // =====================================================================
    // Domain 4: clearForwardSchedule
    // =====================================================================
    {
        bool scheduled = true;
        double fireAt = 9999.0;
        float bars = 4.0f;
        clearForwardSchedule(scheduled, fireAt, bars);
        auto* obj = new juce::DynamicObject();
        obj->setProperty("scheduled", scheduled);
        obj->setProperty("fireAtSamples", fireAt);
        obj->setProperty("scheduledBars", bars);
        root->setProperty("clearForwardSchedule", juce::var(obj));
    }

    // =====================================================================
    // Domain 5: scheduleForwardCommitIfNeeded – not armed
    // =====================================================================
    {
        ControlServer cs;
        std::atomic<double> playTime{0.0};
        bool forwardScheduled = false;
        double forwardFireAt = 0.0;
        float forwardBars = 0.0f;

        auto* obj = new juce::DynamicObject();
        scheduleForwardCommitIfNeeded(cs, playTime, forwardScheduled,
                                      forwardFireAt, forwardBars);
        obj->setProperty("result_scheduled", forwardScheduled);
        obj->setProperty("result_fireAt", forwardFireAt);
        obj->setProperty("result_bars", forwardBars);
        root->setProperty("scheduleNotArmed", juce::var(obj));
    }

    // =====================================================================
    // Domain 6: scheduleForwardCommitIfNeeded – armed with valid state
    // =====================================================================
    {
        ControlServer cs;
        auto& state = cs.getAtomicState();
        state.forwardArmed.store(true, std::memory_order_release);
        state.forwardBars.store(4.0f, std::memory_order_release);
        state.samplesPerBar.store(22050.0f, std::memory_order_release);

        std::atomic<double> playTime{10000.0};
        bool forwardScheduled = false;
        double forwardFireAt = 0.0;
        float forwardBars = 0.0f;

        auto* obj = new juce::DynamicObject();
        scheduleForwardCommitIfNeeded(cs, playTime, forwardScheduled,
                                      forwardFireAt, forwardBars);
        obj->setProperty("result_scheduled", forwardScheduled);
        obj->setProperty("result_fireAtSamples", forwardFireAt);
        obj->setProperty("result_bars", forwardBars);
        obj->setProperty("expectedFireAt", 10000.0 + 4.0 * 22050.0);

        // Calling again should NOT re-schedule (already scheduled)
        double oldFireAt = forwardFireAt;
        scheduleForwardCommitIfNeeded(cs, playTime, forwardScheduled,
                                      forwardFireAt, forwardBars);
        obj->setProperty("secondCallSameFireAt", forwardFireAt == oldFireAt);

        root->setProperty("scheduleArmed", juce::var(obj));
    }

    // =====================================================================
    // Domain 7: initialiseAtomicState – defaults
    // =====================================================================
    {
        ControlServer cs;
        CaptureBuffer buf(65536);
        std::atomic<bool> graphEnabled{true};

        initialiseAtomicState(cs, 48000.0, buf, graphEnabled, 130.0f, 130.0f, 0.85f, 0.9f);

        auto& st = cs.getAtomicState();
        auto* obj = new juce::DynamicObject();
        obj->setProperty("sampleRate", st.sampleRate.load(std::memory_order_relaxed));
        obj->setProperty("tempo", st.tempo.load(std::memory_order_relaxed));
        obj->setProperty("targetBPM", st.targetBPM.load(std::memory_order_relaxed));
        obj->setProperty("samplesPerBar",
            st.samplesPerBar.load(std::memory_order_relaxed));
        obj->setProperty("captureSize",
            st.captureSize.load(std::memory_order_relaxed));
        obj->setProperty("isRecording",
            st.isRecording.load(std::memory_order_relaxed));
        obj->setProperty("overdubEnabled",
            st.overdubEnabled.load(std::memory_order_relaxed));
        obj->setProperty("forwardArmed",
            st.forwardArmed.load(std::memory_order_relaxed));
        obj->setProperty("graphEnabled",
            st.graphEnabled.load(std::memory_order_relaxed));
        obj->setProperty("recordMode",
            st.recordMode.load(std::memory_order_relaxed));
        obj->setProperty("activeLayer",
            st.activeLayer.load(std::memory_order_relaxed));
        obj->setProperty("masterVolume",
            st.masterVolume.load(std::memory_order_relaxed));
        obj->setProperty("inputVolume",
            st.inputVolume.load(std::memory_order_relaxed));
        obj->setProperty("passthroughEnabled",
            st.passthroughEnabled.load(std::memory_order_relaxed));
        obj->setProperty("commitCount",
            st.commitCount.load(std::memory_order_relaxed));
        obj->setProperty("layer0_speed",
            st.layers[0].speed.load(std::memory_order_relaxed));
        obj->setProperty("layer0_state",
            st.layers[0].state.load(std::memory_order_relaxed));
        obj->setProperty("layer7_speed",
            st.layers[7].speed.load(std::memory_order_relaxed));
        obj->setProperty("layer7_state",
            st.layers[7].state.load(std::memory_order_relaxed));

        root->setProperty("initialiseAtomicState", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "BehaviorHousekeepingSupport contract", contract);
}
