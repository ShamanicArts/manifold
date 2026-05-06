#include "../DSPPrimitiveWrappers.h"

#include <cmath>

namespace dsp_primitives {

void LoopBufferWrapper::setSize(int sizeSamples, int channels) {
  length_ = sizeSamples;
  channels_ = channels;
}

int LoopBufferWrapper::getLength() const { return length_; }
int LoopBufferWrapper::getChannels() const { return channels_; }
void LoopBufferWrapper::setCrossfade(float ms) { crossfadeMs_ = ms; }
float LoopBufferWrapper::getCrossfade() const { return crossfadeMs_; }

void PlayheadWrapper::setLoopLength(int length) { loopLength_ = length; }
int PlayheadWrapper::getLoopLength() const { return loopLength_; }
void PlayheadWrapper::setPosition(float normalized) {
  position_ = static_cast<int>(normalized * loopLength_);
}
float PlayheadWrapper::getPosition() const {
  return loopLength_ > 0 ? static_cast<float>(position_) / loopLength_ : 0.0f;
}
void PlayheadWrapper::setSpeed(float speed) { speed_ = speed; }
float PlayheadWrapper::getSpeed() const { return speed_; }
void PlayheadWrapper::setReversed(bool reversed) { reversed_ = reversed; }
bool PlayheadWrapper::isReversed() const { return reversed_; }
void PlayheadWrapper::play() { playing_ = true; }
void PlayheadWrapper::pause() { playing_ = false; }
void PlayheadWrapper::stop() { playing_ = false; position_ = 0; }

void CaptureBufferWrapper::setSize(int sizeSamples, int channels) {
  size_ = sizeSamples;
  channels_ = channels;
}
int CaptureBufferWrapper::getSize() const { return size_; }
int CaptureBufferWrapper::getChannels() const { return channels_; }
void CaptureBufferWrapper::setRecordEnabled(bool enabled) { recordEnabled_ = enabled; }
bool CaptureBufferWrapper::isRecordEnabled() const { return recordEnabled_; }
void CaptureBufferWrapper::clear() { recordEnabled_ = false; }

void QuantizerWrapper::setSampleRate(double sampleRate) { sampleRate_ = sampleRate; }
void QuantizerWrapper::setTempo(float bpm) { tempo_ = bpm; }
float QuantizerWrapper::getTempo() const { return tempo_; }

int QuantizerWrapper::getQuantizedLength(int samples) const {
  if (tempo_ <= 0.0f || sampleRate_ <= 0.0) return samples;
  float samplesPerBeat = sampleRate_ * 60.0f / tempo_;
  int beats = static_cast<int>(std::round(static_cast<float>(samples) / samplesPerBeat));
  return static_cast<int>(beats * samplesPerBeat);
}

float QuantizerWrapper::getQuantizedBars(int samples) const {
  if (tempo_ <= 0.0f || sampleRate_ <= 0.0) return 0.0f;
  float samplesPerBeat = sampleRate_ * 60.0f / tempo_;
  float samplesPerBar = samplesPerBeat * 4.0f;
  return static_cast<float>(samples) / samplesPerBar;
}

} // namespace dsp_primitives
