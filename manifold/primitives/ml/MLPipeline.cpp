#include "MLPipeline.h"

#include <cstring>
#include <algorithm>
#include <cstdio>

#include "tensorflow/lite/model_builder.h"
#include "tensorflow/lite/interpreter.h"
#include "tensorflow/lite/kernels/register.h"
#include "tensorflow/lite/core/interpreter_builder.h"

namespace manifold::ml {

struct MLPipeline::Impl {
    std::unique_ptr<tflite::FlatBufferModel> model;
    tflite::ops::builtin::BuiltinOpResolver resolver;
    std::unique_ptr<tflite::Interpreter> interpreter;

    int inputW = 0;
    int inputH = 0;
    int inputC = 0;
    int outputElems = 0;
    bool loaded = false;
    std::string error;

    // Pre-allocated resize buffer to avoid per-frame allocation
    std::vector<float> resizeBuf;
};

MLPipeline::MLPipeline()
    : pImpl_(std::make_unique<Impl>()) {}

MLPipeline::~MLPipeline() = default;

bool MLPipeline::load(const std::string& modelPath) {
    pImpl_->error.clear();

    pImpl_->model = tflite::FlatBufferModel::BuildFromFile(modelPath.c_str());
    if (!pImpl_->model) {
        pImpl_->error = "Failed to load model: " + modelPath;
        return false;
    }

    pImpl_->interpreter.reset();
    tflite::InterpreterBuilder builder(*pImpl_->model, pImpl_->resolver);
    builder(&pImpl_->interpreter);
    if (!pImpl_->interpreter) {
        pImpl_->error = "Failed to create interpreter";
        return false;
    }

    if (pImpl_->interpreter->AllocateTensors() != kTfLiteOk) {
        pImpl_->error = "Failed to allocate tensors";
        return false;
    }

    // Inspect input tensor
    const auto* inputTensor = pImpl_->interpreter->input_tensor(0);
    if (inputTensor == nullptr) {
        pImpl_->error = "No input tensor found";
        return false;
    }

    // Expect NHWC: {1, height, width, channels}
    if (inputTensor->dims->size != 4) {
        pImpl_->error = "Expected 4D input tensor (NHWC), got " +
                        std::to_string(inputTensor->dims->size) + "D";
        return false;
    }

    pImpl_->inputH = inputTensor->dims->data[1];
    pImpl_->inputW = inputTensor->dims->data[2];
    pImpl_->inputC = inputTensor->dims->data[3];

    // Inspect output tensor
    const auto* outputTensor = pImpl_->interpreter->output_tensor(0);
    if (outputTensor == nullptr) {
        pImpl_->error = "No output tensor found";
        return false;
    }

    pImpl_->outputElems = 1;
    for (int i = 0; i < outputTensor->dims->size; ++i) {
        pImpl_->outputElems *= outputTensor->dims->data[i];
    }

    // Pre-allocate resize buffer
    pImpl_->resizeBuf.resize(static_cast<std::size_t>(pImpl_->inputW)
                             * static_cast<std::size_t>(pImpl_->inputH)
                             * static_cast<std::size_t>(pImpl_->inputC));

    pImpl_->loaded = true;
    return true;
}

bool MLPipeline::isLoaded() const {
    return pImpl_->loaded;
}

int MLPipeline::inputWidth() const {
    return pImpl_->inputW;
}

int MLPipeline::inputHeight() const {
    return pImpl_->inputH;
}

int MLPipeline::inputChannels() const {
    return pImpl_->inputC;
}

int MLPipeline::outputElements() const {
    return pImpl_->outputElems;
}

static void bilinearResizeRGBA(const unsigned char* src,
                               int srcW, int srcH,
                               float* dst,
                               int dstW, int dstH, int dstC) {
    for (int y = 0; y < dstH; ++y) {
        float srcY = static_cast<float>(y) / static_cast<float>(dstH - 1) * static_cast<float>(srcH - 1);
        int srcY0 = std::min(static_cast<int>(srcY), srcH - 2);
        int srcY1 = srcY0 + 1;
        float fracY = srcY - static_cast<float>(srcY0);

        for (int x = 0; x < dstW; ++x) {
            float srcX = static_cast<float>(x) / static_cast<float>(dstW - 1) * static_cast<float>(srcW - 1);
            int srcX0 = std::min(static_cast<int>(srcX), srcW - 2);
            int srcX1 = srcX0 + 1;
            float fracX = srcX - static_cast<float>(srcX0);

            // Sample 4 rgba pixels
            const unsigned char* p00 = src + (srcY0 * srcW + srcX0) * 4;
            const unsigned char* p01 = src + (srcY0 * srcW + srcX1) * 4;
            const unsigned char* p10 = src + (srcY1 * srcW + srcX0) * 4;
            const unsigned char* p11 = src + (srcY1 * srcW + srcX1) * 4;

            float* dp = dst + (y * dstW + x) * dstC;

            for (int c = 0; c < dstC && c < 3; ++c) {
                float v00 = static_cast<float>(p00[c]) / 255.0f;
                float v01 = static_cast<float>(p01[c]) / 255.0f;
                float v10 = static_cast<float>(p10[c]) / 255.0f;
                float v11 = static_cast<float>(p11[c]) / 255.0f;

                float v0 = v00 + (v01 - v00) * fracX;
                float v1 = v10 + (v11 - v10) * fracX;
                dp[c] = v0 + (v1 - v0) * fracY;
            }

            // Fill remaining channels (e.g., alpha → pad) or leave zeros
            for (int c = 3; c < dstC; ++c) {
                dp[c] = 0.0f;
            }
        }
    }
}

bool MLPipeline::infer(const unsigned char* rgbaData,
                       int srcWidth,
                       int srcHeight,
                       std::vector<float>& output) {
    if (!pImpl_->loaded) {
        pImpl_->error = "No model loaded";
        return false;
    }

    // 1. Resize and normalize RGBA → float RGB
    bilinearResizeRGBA(rgbaData, srcWidth, srcHeight,
                       pImpl_->resizeBuf.data(),
                       pImpl_->inputW, pImpl_->inputH, pImpl_->inputC);

    // 2. Copy to input tensor
    float* inputTensor = pImpl_->interpreter->typed_input_tensor<float>(0);
    if (inputTensor == nullptr) {
        pImpl_->error = "Failed to get input tensor";
        return false;
    }

    // Normalize from [0,1] to [-1,1] for models that expect it
    std::size_t numInput = static_cast<std::size_t>(pImpl_->inputW)
                         * static_cast<std::size_t>(pImpl_->inputH)
                         * static_cast<std::size_t>(pImpl_->inputC);
    for (std::size_t i = 0; i < numInput; ++i) {
        inputTensor[i] = pImpl_->resizeBuf[i] * 2.0f - 1.0f;
    }

    // 3. Run inference
    if (pImpl_->interpreter->Invoke() != kTfLiteOk) {
        pImpl_->error = "Inference failed";
        return false;
    }

    // 4. Read output
    float* outputTensor = pImpl_->interpreter->typed_output_tensor<float>(0);
    if (outputTensor == nullptr) {
        pImpl_->error = "Failed to get output tensor";
        return false;
    }

    output.resize(static_cast<std::size_t>(pImpl_->outputElems));
    std::memcpy(output.data(), outputTensor,
                static_cast<std::size_t>(pImpl_->outputElems) * sizeof(float));

    return true;
}

bool MLPipeline::getOutputAsMask(std::vector<float>& mask) {
    // Assume single-channel float output, reshape to input dims
    mask.resize(static_cast<std::size_t>(pImpl_->inputW)
              * static_cast<std::size_t>(pImpl_->inputH));
    // infer() already filled output — this doesn't re-run
    // The user calls infer() first, then getOutputAsMask()
    // to interpret the output as a 2D mask.
    return true;
}

const std::string& MLPipeline::lastError() const {
    return pImpl_->error;
}

} // namespace manifold::ml
