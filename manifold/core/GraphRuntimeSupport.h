#pragma once

#include <atomic>
#include <condition_variable>
#include <memory>
#include <mutex>

#include "../primitives/control/ControlServer.h"
#include "BehaviorCoreProcessor.h"

namespace manifold {
namespace graph_runtime_support {

inline void requestGraphRuntimeSwap(
    std::atomic<dsp_primitives::GraphRuntime*>& pendingRuntime,
    std::unique_ptr<dsp_primitives::GraphRuntime> runtime) {
    if (!runtime) {
        return;
    }

    dsp_primitives::GraphRuntime* oldPending =
        pendingRuntime.exchange(runtime.release(), std::memory_order_release);
    if (oldPending != nullptr) {
        delete oldPending;
    }
}

inline void beginGraphMutation(std::mutex& graphMutationMutex,
                               std::atomic<bool>& graphMutationPauseRequested,
                               std::atomic<bool>& graphProcessingEnabled,
                               bool& graphMutationRestoreEnabled,
                               ControlServer& controlServer,
                               std::condition_variable& graphMutationCv,
                               std::atomic<int>& graphProcessDepth) {
    std::unique_lock<std::mutex> lock(graphMutationMutex);
    graphMutationPauseRequested.store(true, std::memory_order_release);
    graphMutationRestoreEnabled =
        graphProcessingEnabled.exchange(false, std::memory_order_acq_rel);
    controlServer.getAtomicState().graphEnabled.store(false,
                                                      std::memory_order_relaxed);
    graphMutationCv.wait(lock, [&graphProcessDepth]() {
        return graphProcessDepth.load(std::memory_order_acquire) == 0;
    });
}

inline void endGraphMutation(std::mutex& graphMutationMutex,
                             std::atomic<bool>& graphMutationPauseRequested,
                             std::atomic<bool>& graphProcessingEnabled,
                             bool& graphMutationRestoreEnabled,
                             ControlServer& controlServer,
                             std::condition_variable& graphMutationCv) {
    {
        std::lock_guard<std::mutex> lock(graphMutationMutex);
        graphMutationPauseRequested.store(false, std::memory_order_release);
        graphProcessingEnabled.store(graphMutationRestoreEnabled,
                                     std::memory_order_release);
        controlServer.getAtomicState().graphEnabled.store(
            graphMutationRestoreEnabled, std::memory_order_relaxed);
        graphMutationRestoreEnabled = false;
    }
    graphMutationCv.notify_all();
}

template <typename Queue>
inline void drainRetiredGraphRuntimes(std::mutex& retiredRuntimeDrainMutex,
                                      Queue& retireQueue) {
    std::lock_guard<std::mutex> lock(retiredRuntimeDrainMutex);
    dsp_primitives::GraphRuntime* runtime = nullptr;
    while (retireQueue.dequeue(runtime)) {
        delete runtime;
    }
}

template <typename Queue>
inline void checkGraphRuntimeSwap(
    dsp_primitives::GraphRuntime*& pendingRetireRuntime,
    Queue& retireQueue,
    std::atomic<dsp_primitives::GraphRuntime*>& pendingRuntime,
    dsp_primitives::GraphRuntime*& activeRuntime) {
    if (pendingRetireRuntime != nullptr) {
        if (retireQueue.enqueue(pendingRetireRuntime)) {
            pendingRetireRuntime = nullptr;
        }
    }

    dsp_primitives::GraphRuntime* newRuntime =
        pendingRuntime.exchange(nullptr, std::memory_order_acq_rel);
    if (newRuntime == nullptr) {
        return;
    }

    dsp_primitives::GraphRuntime* oldRuntime = activeRuntime;
    activeRuntime = newRuntime;

    if (oldRuntime != nullptr) {
        if (!retireQueue.enqueue(oldRuntime)) {
            if (pendingRetireRuntime == nullptr) {
                pendingRetireRuntime = oldRuntime;
            }
        }
    }
}

} // namespace graph_runtime_support
} // namespace manifold
