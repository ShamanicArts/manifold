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
        auto controlState = controlStateView(cs);
        auto runtimeTelemetry = runtimeTelemetryView(cs);
        controlState.setForwardArmed(true);
        controlState.setForwardBars(4.0f);
        runtimeTelemetry.setSamplesPerBar(22050.0f);

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
    // Domain 7: initialiseBehaviorState – defaults
    // =====================================================================
    {
        ControlServer cs;
        CaptureBuffer buf(65536);
        std::atomic<bool> graphEnabled{true};

        initialiseBehaviorState(cs, 48000.0, buf, graphEnabled, 130.0f, 130.0f, 0.85f, 0.9f);

        const auto controlState = captureControlState(cs);
        const auto runtimeTelemetry = captureRuntimeTelemetry(cs);
        auto* obj = new juce::DynamicObject();
        obj->setProperty("sampleRate", runtimeTelemetry.sampleRate);
        obj->setProperty("tempo", runtimeTelemetry.effectiveTempo);
        obj->setProperty("targetBPM", controlState.targetBPM);
        obj->setProperty("samplesPerBar",
            runtimeTelemetry.samplesPerBar);
        obj->setProperty("captureSize",
            runtimeTelemetry.captureSize);
        obj->setProperty("isRecording",
            controlState.isRecording);
        obj->setProperty("overdubEnabled",
            controlState.overdubEnabled);
        obj->setProperty("forwardArmed",
            controlState.forwardArmed);
        obj->setProperty("graphEnabled",
            runtimeTelemetry.effectiveGraphEnabled);
        obj->setProperty("recordMode",
            controlState.recordMode);
        obj->setProperty("activeLayer",
            controlState.activeLayer);
        obj->setProperty("masterVolume",
            controlState.masterVolume);
        obj->setProperty("inputVolume",
            controlState.inputVolume);
        obj->setProperty("passthroughEnabled",
            controlState.passthroughEnabled);
        obj->setProperty("commitCount",
            runtimeTelemetry.commitCount);
        obj->setProperty("layer0_speed",
            controlState.layers[0].speed);
        obj->setProperty("layer0_state",
            runtimeTelemetry.layers[0].state);
        obj->setProperty("layer7_speed",
            controlState.layers[7].speed);
        obj->setProperty("layer7_state",
            runtimeTelemetry.layers[7].state);

        root->setProperty("initialiseBehaviorState", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "BehaviorHousekeepingSupport contract", contract);
}
