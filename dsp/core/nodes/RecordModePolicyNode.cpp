#include "dsp/core/nodes/RecordModePolicyNode.h"

namespace dsp_primitives {

void RecordModePolicyNode::process(const std::vector<AudioBufferView>& inputs,
                                   std::vector<WritableAudioBufferView>& outputs,
                                   int numSamples) {
    (void)inputs;
    (void)outputs;
    (void)numSamples;
}

void RecordModePolicyNode::prepare(double sampleRate, int maxBlockSize) {
    (void)sampleRate;
    (void)maxBlockSize;
}

void RecordModePolicyNode::setMode(int modeIndex) {
    if (modeIndex < static_cast<int>(Mode::FirstLoop)) {
        modeIndex = static_cast<int>(Mode::FirstLoop);
    }
    if (modeIndex > static_cast<int>(Mode::Retrospective)) {
        modeIndex = static_cast<int>(Mode::Retrospective);
    }
    mode_.store(modeIndex, std::memory_order_release);
}

int RecordModePolicyNode::getMode() const {
    return mode_.load(std::memory_order_acquire);
}

bool RecordModePolicyNode::usesRetrospectiveCommit() const {
    const int current = getMode();
    return current == static_cast<int>(Mode::Traditional) ||
           current == static_cast<int>(Mode::Retrospective);
}

bool RecordModePolicyNode::schedulesForwardCommitWhenIdle() const {
    return getMode() == static_cast<int>(Mode::Traditional);
}

} // namespace dsp_primitives
