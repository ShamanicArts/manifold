#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace manifold::ml {

enum class MLInputLayout {
    NHWC,
    NCHW,
};

enum class MLInputElementType {
    Float32,
    Int32,
};

class IMLInferenceBackend {
public:
    virtual ~IMLInferenceBackend() = default;

    virtual bool load(const std::string& modelPath) = 0;
    virtual bool isLoaded() const = 0;

    virtual int inputWidth() const = 0;
    virtual int inputHeight() const = 0;
    virtual int inputChannels() const = 0;
    virtual int outputElements() const = 0;
    virtual MLInputLayout inputLayout() const = 0;
    virtual MLInputElementType inputElementType() const = 0;

    virtual bool run(const float* input,
                     std::size_t elementCount,
                     std::vector<float>& output) = 0;
    virtual bool run(const std::int32_t* input,
                     std::size_t elementCount,
                     std::vector<float>& output) = 0;

    virtual const std::string& lastError() const = 0;
};

std::unique_ptr<IMLInferenceBackend> makeOrtInferenceBackend();

} // namespace manifold::ml
