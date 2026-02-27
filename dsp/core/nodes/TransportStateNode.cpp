#include "dsp/core/nodes/TransportStateNode.h"

namespace dsp_primitives {

void TransportStateNode::process(const std::vector<AudioBufferView>& inputs,
                                 std::vector<WritableAudioBufferView>& outputs,
                                 int numSamples) {
    (void)inputs;
    (void)outputs;
    (void)numSamples;
}

void TransportStateNode::prepare(double sampleRate, int maxBlockSize) {
    (void)sampleRate;
    (void)maxBlockSize;
}

void TransportStateNode::play() {
    state_.store(static_cast<int>(State::Playing), std::memory_order_release);
}

void TransportStateNode::pause() {
    state_.store(static_cast<int>(State::Paused), std::memory_order_release);
}

void TransportStateNode::stop() {
    state_.store(static_cast<int>(State::Stopped), std::memory_order_release);
}

void TransportStateNode::setState(int stateIndex) {
    if (stateIndex < static_cast<int>(State::Stopped)) {
        stateIndex = static_cast<int>(State::Stopped);
    }
    if (stateIndex > static_cast<int>(State::Paused)) {
        stateIndex = static_cast<int>(State::Paused);
    }
    state_.store(stateIndex, std::memory_order_release);
}

int TransportStateNode::getState() const {
    return state_.load(std::memory_order_acquire);
}

bool TransportStateNode::isPlaying() const {
    return getState() == static_cast<int>(State::Playing);
}

} // namespace dsp_primitives
