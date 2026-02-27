#include "dsp/core/nodes/RecordStateNode.h"

namespace dsp_primitives {

void RecordStateNode::process(const std::vector<AudioBufferView>& inputs,
                              std::vector<WritableAudioBufferView>& outputs,
                              int numSamples) {
    (void)inputs;
    (void)outputs;
    (void)numSamples;
}

void RecordStateNode::prepare(double sampleRate, int maxBlockSize) {
    (void)sampleRate;
    (void)maxBlockSize;
}

void RecordStateNode::startRecording() {
    recording_.store(true, std::memory_order_release);
}

void RecordStateNode::stopRecording() {
    recording_.store(false, std::memory_order_release);
}

bool RecordStateNode::isRecording() const {
    return recording_.load(std::memory_order_acquire);
}

void RecordStateNode::setOverdub(bool enabled) {
    overdub_.store(enabled, std::memory_order_release);
}

bool RecordStateNode::isOverdub() const {
    return overdub_.load(std::memory_order_acquire);
}

} // namespace dsp_primitives
