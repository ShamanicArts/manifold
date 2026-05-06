#pragma once

#include <memory>

namespace dsp_primitives {
class LoopBufferWrapper;
class PlayheadWrapper;
class CaptureBufferWrapper;
class QuantizerWrapper;
}

namespace lua_primitive_helpers {
std::shared_ptr<dsp_primitives::LoopBufferWrapper> createLoopBuffer(int sizeSamples, int channels);
std::shared_ptr<dsp_primitives::PlayheadWrapper> createPlayhead(int length);
std::shared_ptr<dsp_primitives::CaptureBufferWrapper> createCaptureBuffer(int sizeSamples, int channels);
std::shared_ptr<dsp_primitives::QuantizerWrapper> createQuantizer(double sampleRate);
}
