#include "dsp/core/nodes/ForwardCommitSchedulerNode.h"

namespace dsp_primitives {

void ForwardCommitSchedulerNode::process(const std::vector<AudioBufferView>& inputs,
                                         std::vector<WritableAudioBufferView>& outputs,
                                         int numSamples) {
    (void)inputs;
    (void)outputs;
    (void)numSamples;
}

void ForwardCommitSchedulerNode::prepare(double sampleRate, int maxBlockSize) {
    (void)sampleRate;
    (void)maxBlockSize;
}

void ForwardCommitSchedulerNode::arm(float bars, int layerIndex, double currentSamples,
                                     float samplesPerBar) {
    if (bars <= 0.0f || samplesPerBar <= 0.0f) {
        return;
    }
    bars_.store(bars, std::memory_order_release);
    layerIndex_.store(layerIndex, std::memory_order_release);
    armedAtSamples_.store(currentSamples, std::memory_order_release);
    samplesPerBar_.store(samplesPerBar, std::memory_order_release);
    armed_.store(true, std::memory_order_release);
}

void ForwardCommitSchedulerNode::clear() {
    armed_.store(false, std::memory_order_release);
}

bool ForwardCommitSchedulerNode::isArmed() const {
    return armed_.load(std::memory_order_acquire);
}

float ForwardCommitSchedulerNode::getBars() const {
    return bars_.load(std::memory_order_acquire);
}

int ForwardCommitSchedulerNode::getLayerIndex() const {
    return layerIndex_.load(std::memory_order_acquire);
}

bool ForwardCommitSchedulerNode::shouldFire(double currentSamples) {
    if (!isArmed()) {
        return false;
    }

    const float bars = getBars();
    const float spb = samplesPerBar_.load(std::memory_order_acquire);
    const double armedAt = armedAtSamples_.load(std::memory_order_acquire);
    const double waitSamples = static_cast<double>(bars) * static_cast<double>(spb);
    if ((currentSamples - armedAt) < waitSamples) {
        return false;
    }

    clear();
    return true;
}

} // namespace dsp_primitives
