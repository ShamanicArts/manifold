#include "LuaPrimitiveWrapperHelpers.h"

#include "../DSPPrimitiveWrappers.h"

namespace lua_primitive_helpers {

std::shared_ptr<dsp_primitives::LoopBufferWrapper> createLoopBuffer(int sizeSamples, int channels) {
    auto buf = std::make_shared<dsp_primitives::LoopBufferWrapper>();
    buf->setSize(sizeSamples, channels);
    return buf;
}

std::shared_ptr<dsp_primitives::PlayheadWrapper> createPlayhead(int length) {
    auto ph = std::make_shared<dsp_primitives::PlayheadWrapper>();
    ph->setLoopLength(length);
    return ph;
}

std::shared_ptr<dsp_primitives::CaptureBufferWrapper> createCaptureBuffer(int sizeSamples, int channels) {
    auto cap = std::make_shared<dsp_primitives::CaptureBufferWrapper>();
    cap->setSize(sizeSamples, channels);
    return cap;
}

std::shared_ptr<dsp_primitives::QuantizerWrapper> createQuantizer(double sampleRate) {
    auto q = std::make_shared<dsp_primitives::QuantizerWrapper>();
    q->setSampleRate(sampleRate);
    return q;
}

} // namespace lua_primitive_helpers
