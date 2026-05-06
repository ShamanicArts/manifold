#include "ContractHarnessUtils.h"

#include "../core/GraphRuntimeSupport.h"

#include <condition_variable>
#include <deque>
#include <thread>

#include <juce_core/juce_core.h>

namespace {

using namespace contract_harness_utils;
using namespace manifold::graph_runtime_support;

class PointerQueue {
public:
    explicit PointerQueue(std::size_t capacity) : capacity_(capacity) {}

    bool enqueue(dsp_primitives::GraphRuntime* runtime) {
        if (items_.size() >= capacity_) {
            return false;
        }
        items_.push_back(runtime);
        return true;
    }

    bool dequeue(dsp_primitives::GraphRuntime*& runtime) {
        if (items_.empty()) {
            return false;
        }
        runtime = items_.front();
        items_.pop_front();
        return true;
    }

    std::size_t size() const { return items_.size(); }

private:
    std::size_t capacity_;
    std::deque<dsp_primitives::GraphRuntime*> items_;
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
    // Domain 1: pending runtime swap replacement
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::atomic<dsp_primitives::GraphRuntime*> pendingRuntime{nullptr};

        auto first = std::make_unique<dsp_primitives::GraphRuntime>();
        auto* firstPtr = first.get();
        requestGraphRuntimeSwap(pendingRuntime, std::move(first));
        obj->setProperty("pendingAfterFirstMatches", pendingRuntime.load(std::memory_order_relaxed) == firstPtr);

        auto second = std::make_unique<dsp_primitives::GraphRuntime>();
        auto* secondPtr = second.get();
        requestGraphRuntimeSwap(pendingRuntime, std::move(second));
        obj->setProperty("pendingAfterSecondMatches", pendingRuntime.load(std::memory_order_relaxed) == secondPtr);
        obj->setProperty("replacedPointerChanged", firstPtr != secondPtr);

        auto* cleanup = pendingRuntime.exchange(nullptr, std::memory_order_acq_rel);
        delete cleanup;
        root->setProperty("requestSwap", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: begin/end mutation pause semantics
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::mutex graphMutationMutex;
        std::condition_variable graphMutationCv;
        std::atomic<bool> graphMutationPauseRequested{false};
        std::atomic<bool> graphProcessingEnabled{true};
        std::atomic<int> graphProcessDepth{1};
        bool graphMutationRestoreEnabled = false;
        ControlServer controlServer;
        auto controlState = contract_harness_utils::controlStateView(controlServer);
        auto runtimeTelemetry = contract_harness_utils::runtimeTelemetryView(controlServer);
        controlState.setGraphEnabled(true);
        runtimeTelemetry.setGraphEnabled(true);

        std::thread releaser([&]() {
            std::this_thread::sleep_for(std::chrono::milliseconds(25));
            graphProcessDepth.store(0, std::memory_order_release);
            graphMutationCv.notify_all();
        });

        beginGraphMutation(graphMutationMutex,
                           graphMutationPauseRequested,
                           graphProcessingEnabled,
                           graphMutationRestoreEnabled,
                           controlServer,
                           graphMutationCv,
                           graphProcessDepth);
        obj->setProperty("pauseRequestedAfterBegin", graphMutationPauseRequested.load(std::memory_order_relaxed));
        obj->setProperty("processingEnabledAfterBegin", graphProcessingEnabled.load(std::memory_order_relaxed));
        obj->setProperty("restoreEnabledAfterBegin", graphMutationRestoreEnabled);
        obj->setProperty("atomicGraphEnabledAfterBegin", contract_harness_utils::captureRuntimeTelemetry(controlServer).effectiveGraphEnabled);

        endGraphMutation(graphMutationMutex,
                         graphMutationPauseRequested,
                         graphProcessingEnabled,
                         graphMutationRestoreEnabled,
                         controlServer,
                         graphMutationCv);
        releaser.join();

        obj->setProperty("pauseRequestedAfterEnd", graphMutationPauseRequested.load(std::memory_order_relaxed));
        obj->setProperty("processingEnabledAfterEnd", graphProcessingEnabled.load(std::memory_order_relaxed));
        obj->setProperty("restoreEnabledAfterEnd", graphMutationRestoreEnabled);
        obj->setProperty("atomicGraphEnabledAfterEnd", contract_harness_utils::captureRuntimeTelemetry(controlServer).effectiveGraphEnabled);
        root->setProperty("mutationPause", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: swap retirement and deferred retire fallback
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();

        {
            PointerQueue retireQueue(4);
            std::mutex retireDrainMutex;
            dsp_primitives::GraphRuntime* pendingRetireRuntime = nullptr;
            std::atomic<dsp_primitives::GraphRuntime*> pendingRuntime{nullptr};
            dsp_primitives::GraphRuntime* activeRuntime = new dsp_primitives::GraphRuntime();

            auto incoming = std::make_unique<dsp_primitives::GraphRuntime>();
            auto* incomingPtr = incoming.get();
            pendingRuntime.store(incoming.release(), std::memory_order_release);
            checkGraphRuntimeSwap(pendingRetireRuntime, retireQueue, pendingRuntime, activeRuntime);

            obj->setProperty("activeReplaced", activeRuntime == incomingPtr);
            obj->setProperty("retireQueueSizeAfterSwap", static_cast<int>(retireQueue.size()));
            obj->setProperty("pendingRetireAfterSwapIsNull", pendingRetireRuntime == nullptr);

            drainRetiredGraphRuntimes(retireDrainMutex, retireQueue);
            delete activeRuntime;
        }

        {
            PointerQueue retireQueue(0);
            dsp_primitives::GraphRuntime* pendingRetireRuntime = nullptr;
            std::atomic<dsp_primitives::GraphRuntime*> pendingRuntime{nullptr};
            dsp_primitives::GraphRuntime* activeRuntime = new dsp_primitives::GraphRuntime();
            auto incoming = std::make_unique<dsp_primitives::GraphRuntime>();
            auto* incomingPtr = incoming.get();
            pendingRuntime.store(incoming.release(), std::memory_order_release);
            checkGraphRuntimeSwap(pendingRetireRuntime, retireQueue, pendingRuntime, activeRuntime);

            obj->setProperty("fallbackActiveReplaced", activeRuntime == incomingPtr);
            obj->setProperty("fallbackPendingRetireSet", pendingRetireRuntime != nullptr);

            delete pendingRetireRuntime;
            delete activeRuntime;
        }

        root->setProperty("swapRetirement", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "GraphRuntimeSupport contract", contract);
}
