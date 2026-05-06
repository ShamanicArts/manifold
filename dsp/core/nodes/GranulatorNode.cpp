#include "dsp/core/nodes/GranulatorNode.h"

#include <juce_audio_formats/juce_audio_formats.h>

#include <cmath>

namespace dsp_primitives {

GranulatorNode::GranulatorNode() = default;

void GranulatorNode::prepare(double sampleRate, int maxBlockSize) {
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const float bufferSeconds = targetBufferSeconds_.load(std::memory_order_acquire);
    bufferSize_ = static_cast<int>(sampleRate_ * juce::jlimit(1.0f, 30.0f, bufferSeconds)) + std::max(16, maxBlockSize);
    captureBuffer_.setSize(2, bufferSize_, false, true, true);
    captureBuffer_.clear();
    writeIndex_ = 0;

    const double smoothTime = 0.01;
    smooth_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothTime * sampleRate_)));
    smooth_ = juce::jlimit(0.0001f, 1.0f, smooth_);

    currentGrainSizeMs_ = targetGrainSizeMs_.load(std::memory_order_acquire);
    currentDensity_ = targetDensity_.load(std::memory_order_acquire);
    currentPosition_ = targetPosition_.load(std::memory_order_acquire);
    currentPitchSemitones_ = targetPitchSemitones_.load(std::memory_order_acquire);
    currentSpray_ = targetSpray_.load(std::memory_order_acquire);
    currentMix_ = targetMix_.load(std::memory_order_acquire);

    reset();
    prepared_ = true;
}

void GranulatorNode::clearGrains() {
    for (auto& g : grains_) {
        g = Grain{};
    }
    spawnCounter_ = 0;
}

void GranulatorNode::reset() {
    captureBuffer_.clear();
    writeIndex_ = 0;
    clearGrains();
}

void GranulatorNode::clearSourceBuffer() {
    std::lock_guard<std::mutex> lock(sourceMutex_);
    sourceBuffer_.setSize(0, 0);
    sourceLength_ = 0;
    sourceActive_ = false;
}

bool GranulatorNode::loadFile(const juce::File& file) {
    if (!file.existsAsFile()) {
        return false;
    }

    juce::AudioFormatManager fm;
    fm.registerBasicFormats();
    std::unique_ptr<juce::AudioFormatReader> reader(fm.createReaderFor(file));
    if (!reader || reader->lengthInSamples <= 0) {
        return false;
    }

    const int channels = 2;
    const int length = juce::jlimit(1, static_cast<int>(sampleRate_ * 30.0), static_cast<int>(reader->lengthInSamples));
    juce::AudioBuffer<float> next(channels, length);
    next.clear();
    reader->read(&next, 0, length, 0, true, true);
    if (reader->numChannels == 1 && channels > 1) {
        next.copyFrom(1, 0, next, 0, 0, length);
    }

    {
        std::lock_guard<std::mutex> lock(sourceMutex_);
        sourceBuffer_ = std::move(next);
        sourceLength_ = length;
        sourceActive_ = true;
    }
    reset();
    return true;
}

void GranulatorNode::copyFromCaptureBuffer(const juce::AudioBuffer<float>& captureBuffer,
                                           int captureSize,
                                           int captureStartOffset,
                                           int numSamples) {
    const int length = juce::jlimit(1, captureSize, numSamples);
    juce::AudioBuffer<float> next(2, length);
    next.clear();

    const int sourceChannels = captureBuffer.getNumChannels();
    for (int i = 0; i < length; ++i) {
        const int src = (captureStartOffset + i) % captureSize;
        const float l = sourceChannels > 0 ? captureBuffer.getSample(0, src) : 0.0f;
        const float r = sourceChannels > 1 ? captureBuffer.getSample(1, src) : l;
        next.setSample(0, i, l);
        next.setSample(1, i, r);
    }

    {
        std::lock_guard<std::mutex> lock(sourceMutex_);
        sourceBuffer_ = std::move(next);
        sourceLength_ = length;
        sourceActive_ = true;
    }
    reset();
}

float GranulatorNode::readRing(int channel, float pos) const {
    float wrapped = pos;
    while (wrapped < 0.0f) {
        wrapped += static_cast<float>(bufferSize_);
    }
    while (wrapped >= static_cast<float>(bufferSize_)) {
        wrapped -= static_cast<float>(bufferSize_);
    }

    const int i0 = static_cast<int>(wrapped);
    const int i1 = (i0 + 1) % bufferSize_;
    const float frac = wrapped - static_cast<float>(i0);
    const float a = captureBuffer_.getSample(channel, i0);
    const float b = captureBuffer_.getSample(channel, i1);
    return a + (b - a) * frac;
}

float GranulatorNode::readSource(int channel, float pos) const {
    if (!sourceActive_ || sourceLength_ <= 1 || sourceBuffer_.getNumSamples() <= 1) {
        return 0.0f;
    }
    float wrapped = pos;
    while (wrapped < 0.0f) wrapped += static_cast<float>(sourceLength_);
    while (wrapped >= static_cast<float>(sourceLength_)) wrapped -= static_cast<float>(sourceLength_);

    const int ch = juce::jlimit(0, sourceBuffer_.getNumChannels() - 1, channel);
    const int i0 = static_cast<int>(wrapped);
    const int i1 = (i0 + 1) % sourceLength_;
    const float frac = wrapped - static_cast<float>(i0);
    const float a = sourceBuffer_.getSample(ch, i0);
    const float b = sourceBuffer_.getSample(ch, i1);
    return a + (b - a) * frac;
}

std::vector<float> GranulatorNode::getActiveGrainPositions() const {
    std::vector<float> positions;
    const int denom = sourceActive_ ? sourceLength_ : bufferSize_;
    if (denom <= 1) {
        return positions;
    }

    positions.reserve(kMaxGrains);
    for (const auto& g : grains_) {
        if (!g.active) {
            continue;
        }
        float wrapped = g.readPos;
        while (wrapped < 0.0f) wrapped += static_cast<float>(denom);
        while (wrapped >= static_cast<float>(denom)) wrapped -= static_cast<float>(denom);
        positions.push_back(juce::jlimit(0.0f, 1.0f, wrapped / static_cast<float>(denom - 1)));
    }
    return positions;
}

float GranulatorNode::envelopeValue(const Grain& g) const {
    const float t = static_cast<float>(g.age) / static_cast<float>(std::max(1, g.length));
    const int envType = envelopeType_.load(std::memory_order_acquire);
    if (envType == 1) {
        // Triangle: sharper transient, good for stutters.
        return 1.0f - std::abs(2.0f * t - 1.0f);
    }
    if (envType == 2) {
        // Blackman: lower side-lobes than Hann for smoother clouds.
        constexpr float twoPi = juce::MathConstants<float>::twoPi;
        return 0.42f - 0.5f * std::cos(twoPi * t) + 0.08f * std::cos(2.0f * twoPi * t);
    }
    if (envType == 3) {
        // Tukey-ish: short fade in/out with a flatter middle.
        constexpr float edge = 0.25f;
        if (t < edge) {
            return 0.5f - 0.5f * std::cos(juce::MathConstants<float>::pi * t / edge);
        }
        if (t > 1.0f - edge) {
            const float u = (1.0f - t) / edge;
            return 0.5f - 0.5f * std::cos(juce::MathConstants<float>::pi * u);
        }
        return 1.0f;
    }
    if (envType == 4) {
        // Rectangular: intentionally clicky/old-school.
        return 1.0f;
    }
    // Hann: default musical grain window.
    return 0.5f - 0.5f * std::cos(juce::MathConstants<float>::twoPi * t);
}

void GranulatorNode::spawnGrain() {
    for (auto& g : grains_) {
        if (g.active) {
            continue;
        }

        const float grainSamples = currentGrainSizeMs_ * 0.001f * static_cast<float>(sampleRate_);
        g.length = std::max(4, static_cast<int>(grainSamples));
        g.age = 0;
        g.increment = std::pow(2.0f, currentPitchSemitones_ / 12.0f);

        const int sourceLen = sourceActive_ ? sourceLength_ : bufferSize_;
        float startOffset = 0.0f;
        if (sourceActive_) {
            const float regionStartNorm = sourceRegionStart_.load(std::memory_order_acquire);
            const float regionEndNorm = sourceRegionEnd_.load(std::memory_order_acquire);
            const int regionStart = juce::jlimit(0, sourceLen - 1, static_cast<int>(regionStartNorm * static_cast<float>(sourceLen - 1)));
            const int regionEnd = juce::jlimit(regionStart + 1, sourceLen, static_cast<int>(std::round(regionEndNorm * static_cast<float>(sourceLen))));
            const int regionLen = juce::jmax(1, regionEnd - regionStart);
            const float maxOffset = static_cast<float>(juce::jmax(1, regionLen - 1));
            const float baseOffset = currentPosition_ * maxOffset;
            const float sprayRange = currentSpray_ * 0.2f * maxOffset;
            const float spray = (random_.nextFloat() * 2.0f - 1.0f) * sprayRange;
            startOffset = static_cast<float>(regionStart) + juce::jlimit(0.0f, maxOffset, baseOffset + spray);
        } else {
            const float maxOffset = static_cast<float>(juce::jmax(1, sourceLen - g.length - 1));
            const float baseOffset = juce::jlimit(0.0f, maxOffset, currentPosition_ * maxOffset);
            const float sprayRange = currentSpray_ * 0.2f * maxOffset;
            const float spray = (random_.nextFloat() * 2.0f - 1.0f) * sprayRange;
            startOffset = juce::jlimit(0.0f, maxOffset, baseOffset + spray);
        }

        g.readPos = sourceActive_ ? startOffset : (static_cast<float>(writeIndex_) - startOffset);
        g.active = true;
        break;
    }
}

void GranulatorNode::process(const std::vector<AudioBufferView>& inputs,
                             std::vector<WritableAudioBufferView>& outputs,
                             int numSamples) {
    if (!prepared_ || inputs.empty() || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    const bool enabled = enabled_.load(std::memory_order_acquire);
    if (!enabled) {
        outputs[0].clear();
        clearGrains();
        return;
    }

    const bool freeze = freeze_.load(std::memory_order_acquire);
    const bool sourceActive = sourceActive_ && sourceLength_ > 1;

    const float tGrain = targetGrainSizeMs_.load(std::memory_order_acquire);
    const float tDensity = targetDensity_.load(std::memory_order_acquire);
    const float tPosition = targetPosition_.load(std::memory_order_acquire);
    const float tPitch = targetPitchSemitones_.load(std::memory_order_acquire);
    const float tSpray = targetSpray_.load(std::memory_order_acquire);
    const float tMix = targetMix_.load(std::memory_order_acquire);

    for (int i = 0; i < numSamples; ++i) {
        currentGrainSizeMs_ += (tGrain - currentGrainSizeMs_) * smooth_;
        currentDensity_ += (tDensity - currentDensity_) * smooth_;
        currentPosition_ += (tPosition - currentPosition_) * smooth_;
        currentPitchSemitones_ += (tPitch - currentPitchSemitones_) * smooth_;
        currentSpray_ += (tSpray - currentSpray_) * smooth_;
        currentMix_ += (tMix - currentMix_) * smooth_;

        const float inL = inputs[0].getSample(0, i);
        const float inR = inputs[0].numChannels > 1 ? inputs[0].getSample(1, i) : inL;

        if (!freeze && !sourceActive) {
            captureBuffer_.setSample(0, writeIndex_, inL);
            captureBuffer_.setSample(1, writeIndex_, inR);
            writeIndex_ = (writeIndex_ + 1) % bufferSize_;
        }

        const int spawnInterval = std::max(1, static_cast<int>(sampleRate_ / std::max(1.0f, currentDensity_)));
        ++spawnCounter_;
        if (spawnCounter_ >= spawnInterval) {
            spawnCounter_ = 0;
            spawnGrain();
        }

        float wetL = 0.0f;
        float wetR = 0.0f;

        for (auto& g : grains_) {
            if (!g.active) {
                continue;
            }

            const float env = envelopeValue(g);
            wetL += (sourceActive ? readSource(0, g.readPos) : readRing(0, g.readPos)) * env;
            wetR += (sourceActive ? readSource(1, g.readPos) : readRing(1, g.readPos)) * env;

            g.readPos += g.increment;
            ++g.age;
            if (g.age >= g.length) {
                g.active = false;
            }
        }

        const float dryMix = 1.0f - currentMix_;
        outputs[0].setSample(0, i, inL * dryMix + wetL * currentMix_);
        if (outputs[0].numChannels > 1) {
            outputs[0].setSample(1, i, inR * dryMix + wetR * currentMix_);
        }
    }
}

} // namespace dsp_primitives
