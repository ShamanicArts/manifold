#include "dsp/core/nodes/PlayheadNode.h"

namespace dsp_primitives {

PlayheadNode::PlayheadNode() = default;

void PlayheadNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    sampleRate_ = sampleRate;
}

void PlayheadNode::process(const std::vector<AudioBufferView>& inputs,
                           std::vector<WritableAudioBufferView>& outputs,
                           int numSamples) {
    (void)inputs;

    if (outputs.empty()) return;

    const int loopLen = loopLength_.load(std::memory_order_acquire);
    const bool isPlaying = playing_.load(std::memory_order_acquire);
    const float speedVal = speed_.load(std::memory_order_acquire);
    const bool isReversed = reversed_.load(std::memory_order_acquire);

    if (!isPlaying || loopLen <= 0) {
        outputs[0].clear();
        return;
    }

    float increment = speedVal;
    if (isReversed) {
        increment = -increment;
    }

    for (int i = 0; i < numSamples; ++i) {
        int pos = position_.fetch_add(static_cast<int>(increment >= 0 ? 1 : -1), std::memory_order_relaxed);

        if (increment >= 0) {
            while (pos >= loopLen) {
                pos -= loopLen;
            }
        } else {
            while (pos < 0) {
                pos += loopLen;
            }
        }

        position_.store(pos, std::memory_order_release);
    }

    outputs[0].clear();
}

void PlayheadNode::setLoopLength(int length) {
    loopLength_.store(length, std::memory_order_release);
    position_.store(0, std::memory_order_release);
}

void PlayheadNode::setSpeed(float speed) {
    speed_.store(speed, std::memory_order_release);
}

void PlayheadNode::setReversed(bool reversed) {
    reversed_.store(reversed, std::memory_order_release);
}

void PlayheadNode::play() {
    playing_.store(true, std::memory_order_release);
}

void PlayheadNode::pause() {
    playing_.store(false, std::memory_order_release);
}

void PlayheadNode::stop() {
    playing_.store(false, std::memory_order_release);
    position_.store(0, std::memory_order_release);
}

int PlayheadNode::getLoopLength() const {
    return loopLength_.load(std::memory_order_acquire);
}

float PlayheadNode::getSpeed() const {
    return speed_.load(std::memory_order_acquire);
}

bool PlayheadNode::isReversed() const {
    return reversed_.load(std::memory_order_acquire);
}

bool PlayheadNode::isPlaying() const {
    return playing_.load(std::memory_order_acquire);
}

float PlayheadNode::getNormalizedPosition() const {
    const int loopLen = loopLength_.load(std::memory_order_acquire);
    if (loopLen <= 0) return 0.0f;
    const int pos = position_.load(std::memory_order_acquire);
    return static_cast<float>(pos) / loopLen;
}

} // namespace dsp_primitives
