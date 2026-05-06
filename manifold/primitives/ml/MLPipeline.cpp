#include "MLPipeline.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

#include <onnxruntime_cxx_api.h>

namespace manifold::ml {
namespace {

class OrtInferenceBackend final : public IMLInferenceBackend {
public:
    OrtInferenceBackend() {
        opts_.SetIntraOpNumThreads(4);
    }

    bool load(const std::string& modelPath) override {
        error_.clear();
        loaded_ = false;

        try {
            session_ = std::make_unique<Ort::Session>(env_, modelPath.c_str(), opts_);
        } catch (const Ort::Exception& e) {
            error_ = "Failed to create session: ";
            error_ += e.what();
            return false;
        }

        auto inputTypeInfo = session_->GetInputTypeInfo(0);
        auto inputTensorInfo = inputTypeInfo.GetTensorTypeAndShapeInfo();
        inputDims_ = inputTensorInfo.GetShape();
        for (auto& d : inputDims_) {
            if (d < 0) {
                d = 1;
            }
        }

        if (inputDims_.size() != 4) {
            error_ = "Expected 4D input (NHWC or NCHW), got " +
                     std::to_string(inputDims_.size()) + "D";
            return false;
        }

        const int d1 = static_cast<int>(inputDims_[1]);
        const int d2 = static_cast<int>(inputDims_[2]);
        const int d3 = static_cast<int>(inputDims_[3]);

        if (d3 == 1 || d3 == 3 || d3 == 4) {
            inputLayout_ = MLInputLayout::NHWC;
            inputH_ = d1;
            inputW_ = d2;
            inputC_ = d3;
        } else if (d1 == 1 || d1 == 3 || d1 == 4) {
            inputLayout_ = MLInputLayout::NCHW;
            inputC_ = d1;
            inputH_ = d2;
            inputW_ = d3;
        } else {
            error_ = "Unable to infer model input layout from dims [" +
                     std::to_string(d1) + ", " +
                     std::to_string(d2) + ", " +
                     std::to_string(d3) + "]";
            return false;
        }

        auto outputTypeInfo = session_->GetOutputTypeInfo(0);
        auto outputTensorInfo = outputTypeInfo.GetTensorTypeAndShapeInfo();
        outputDims_ = outputTensorInfo.GetShape();
        for (auto& d : outputDims_) {
            if (d < 0) {
                d = 1;
            }
        }

        outputElems_ = 1;
        for (const auto d : outputDims_) {
            outputElems_ *= static_cast<int>(d);
        }

        inputElementType_ = inputTensorInfo.GetElementType() == ONNX_TENSOR_ELEMENT_DATA_TYPE_INT32
            ? MLInputElementType::Int32
            : MLInputElementType::Float32;

        auto inputNameAlloc = session_->GetInputNameAllocated(0, Ort::AllocatorWithDefaultOptions());
        inputName_ = inputNameAlloc.get();
        auto outputNameAlloc = session_->GetOutputNameAllocated(0, Ort::AllocatorWithDefaultOptions());
        outputName_ = outputNameAlloc.get();

        loaded_ = true;
        return true;
    }

    bool isLoaded() const override { return loaded_; }
    int inputWidth() const override { return inputW_; }
    int inputHeight() const override { return inputH_; }
    int inputChannels() const override { return inputC_; }
    int outputElements() const override { return outputElems_; }
    MLInputLayout inputLayout() const override { return inputLayout_; }
    MLInputElementType inputElementType() const override { return inputElementType_; }

    bool run(const float* input, std::size_t elementCount, std::vector<float>& output) override {
        if (!loaded_ || !session_) {
            error_ = "No model loaded";
            return false;
        }

        try {
            auto memoryInfo = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
            const char* inputNames[] = {inputName_.c_str()};
            const char* outputNames[] = {outputName_.c_str()};

            std::vector<Ort::Value> inputTensors;
            inputTensors.push_back(Ort::Value::CreateTensor<float>(
                memoryInfo,
                const_cast<float*>(input),
                elementCount,
                inputDims_.data(),
                inputDims_.size()));

            auto outputTensors = session_->Run(
                Ort::RunOptions{},
                inputNames, inputTensors.data(), 1,
                outputNames, 1);

            float* outputData = outputTensors[0].GetTensorMutableData<float>();
            output.assign(outputData, outputData + outputElems_);
            return true;
        } catch (const Ort::Exception& e) {
            error_ = "Inference failed: ";
            error_ += e.what();
            return false;
        }
    }

    bool run(const std::int32_t* input,
             std::size_t elementCount,
             std::vector<float>& output) override {
        if (!loaded_ || !session_) {
            error_ = "No model loaded";
            return false;
        }

        try {
            auto memoryInfo = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
            const char* inputNames[] = {inputName_.c_str()};
            const char* outputNames[] = {outputName_.c_str()};

            std::vector<Ort::Value> inputTensors;
            inputTensors.push_back(Ort::Value::CreateTensor<std::int32_t>(
                memoryInfo,
                const_cast<std::int32_t*>(input),
                elementCount,
                inputDims_.data(),
                inputDims_.size()));

            auto outputTensors = session_->Run(
                Ort::RunOptions{},
                inputNames, inputTensors.data(), 1,
                outputNames, 1);

            float* outputData = outputTensors[0].GetTensorMutableData<float>();
            output.assign(outputData, outputData + outputElems_);
            return true;
        } catch (const Ort::Exception& e) {
            error_ = "Inference failed: ";
            error_ += e.what();
            return false;
        }
    }

    const std::string& lastError() const override { return error_; }

private:
    Ort::Env env_{ORT_LOGGING_LEVEL_WARNING, "ManifoldML"};
    Ort::SessionOptions opts_;
    std::unique_ptr<Ort::Session> session_;

    std::vector<int64_t> inputDims_;
    std::vector<int64_t> outputDims_;
    int inputW_ = 0;
    int inputH_ = 0;
    int inputC_ = 0;
    int outputElems_ = 0;
    bool loaded_ = false;
    std::string error_;
    std::string inputName_;
    std::string outputName_;
    MLInputLayout inputLayout_ = MLInputLayout::NHWC;
    MLInputElementType inputElementType_ = MLInputElementType::Float32;
};

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

            for (int c = 3; c < dstC; ++c) {
                dp[c] = 0.0f;
            }
        }
    }
}

static float segClamp01(float v) {
    return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v);
}

static float segSmoothstep(float edge0, float edge1, float x) {
    const float t = segClamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3.0f - 2.0f * t);
}

static float segPostprocessValue(float rawValue, float gain, bool useSigmoid,
                                 float threshold, float feather,
                                 bool invert, bool applySigmoid) {
    float value = rawValue;
    if (applySigmoid && useSigmoid) {
        value = 1.0f / (1.0f + std::exp(-value));
    }
    if (invert) {
        value = 1.0f - value;
    }
    value = segClamp01(value * std::max(0.01f, gain));
    if (feather > 0.0f) {
        value = segSmoothstep(threshold - feather * 0.5f, threshold + feather * 0.5f, value);
    } else {
        value = (value >= threshold) ? 1.0f : 0.0f;
    }
    return segClamp01(value);
}

static float segSampleNearest(const std::vector<float>& mask,
                              int maskW, int maskH,
                              int x, int y, int outW, int outH) {
    const int mx = std::clamp((x * maskW) / outW, 0, maskW - 1);
    const int my = std::clamp((y * maskH) / outH, 0, maskH - 1);
    return mask[static_cast<std::size_t>(my) * static_cast<std::size_t>(maskW) + static_cast<std::size_t>(mx)];
}

static bool processSegmentationMask(const std::vector<float>& rawOutput,
                                    const FrameJob& job,
                                    std::vector<std::uint8_t>& outRGBA) {
    const std::size_t rawSize = rawOutput.size();
    int maskW = static_cast<int>(std::sqrt(static_cast<float>(rawSize)));
    int maskH = maskW;
    while (static_cast<std::size_t>(maskW) * static_cast<std::size_t>(maskH) < rawSize) {
        ++maskW;
        if (static_cast<std::size_t>(maskW) * static_cast<std::size_t>(maskH) >= rawSize) {
            break;
        }
        ++maskH;
    }
    if (maskW <= 0 || maskH <= 0) {
        return false;
    }
    const std::size_t maskSize = static_cast<std::size_t>(maskW) * static_cast<std::size_t>(maskH);

    float minVal = rawOutput[0];
    float maxVal = rawOutput[0];
    for (std::size_t i = 1; i < maskSize; ++i) {
        minVal = std::min(minVal, rawOutput[i]);
        maxVal = std::max(maxVal, rawOutput[i]);
    }
    const bool applySigmoid = job.segUseSigmoid && (minVal < 0.0f || maxVal > 1.0f);

    std::vector<float> processedMask(maskSize);
    for (std::size_t i = 0; i < maskSize; ++i) {
        processedMask[i] = segPostprocessValue(rawOutput[i],
                                               job.segGain,
                                               job.segUseSigmoid,
                                               job.segThreshold,
                                               job.segFeather,
                                               job.segInvert,
                                               applySigmoid);
    }

    const int fw = job.width;
    const int fh = job.height;
    outRGBA.resize(static_cast<std::size_t>(fw) * static_cast<std::size_t>(fh) * 4u);
    const std::uint8_t* src = job.rgba.data();
    for (int y = 0; y < fh; ++y) {
        for (int x = 0; x < fw; ++x) {
            const float alpha = segSampleNearest(processedMask, maskW, maskH, x, y, fw, fh);
            const std::size_t pi = static_cast<std::size_t>(y) * static_cast<std::size_t>(fw) + static_cast<std::size_t>(x);
            const std::size_t base = pi * 4u;
            if (job.segBackground <= 0.0f) {
                outRGBA[base + 0] = src[base + 0];
                outRGBA[base + 1] = src[base + 1];
                outRGBA[base + 2] = src[base + 2];
                outRGBA[base + 3] = static_cast<std::uint8_t>(std::lround(alpha * 255.0f));
            } else {
                const float mix = job.segBackground + alpha * (1.0f - job.segBackground);
                outRGBA[base + 0] = static_cast<std::uint8_t>(std::lround(static_cast<float>(src[base + 0]) * mix));
                outRGBA[base + 1] = static_cast<std::uint8_t>(std::lround(static_cast<float>(src[base + 1]) * mix));
                outRGBA[base + 2] = static_cast<std::uint8_t>(std::lround(static_cast<float>(src[base + 2]) * mix));
                outRGBA[base + 3] = 255;
            }
        }
    }
    return true;
}

} // namespace

std::unique_ptr<IMLInferenceBackend> makeOrtInferenceBackend() {
    return std::make_unique<OrtInferenceBackend>();
}

struct MLPipeline::Impl {
    std::unique_ptr<IMLInferenceBackend> backend;
    int inputW = 0;
    int inputH = 0;
    int inputC = 0;
    int outputElems = 0;
    bool loaded = false;
    std::string error;
    MLInputLayout inputLayout = MLInputLayout::NHWC;
    MLInputElementType inputElementType = MLInputElementType::Float32;

    std::vector<float> resizeBuf;
    std::vector<float> inputBuf;
    std::vector<std::int32_t> inputBufInt32;

    float normScale = 2.0f;
    float normBias = -1.0f;

    std::thread bgThread;
    std::atomic<bool> bgRunning{false};
    std::mutex queueMutex;
    std::condition_variable cv;
    std::queue<FrameJob> frameQueue;
    std::mutex resultMutex;
    std::vector<float> latestOutput;
    bool latestValid = false;

    std::mutex segResultMutex;
    std::vector<std::uint8_t> segResultRGBA;
    int segResultW = 0;
    int segResultH = 0;
    uint64_t segResultSeq = 0;
    bool segResultValid = false;
};

MLPipeline::MLPipeline()
    : MLPipeline(makeOrtInferenceBackend()) {
}

MLPipeline::MLPipeline(std::unique_ptr<IMLInferenceBackend> backend)
    : pImpl_(std::make_unique<Impl>()) {
    pImpl_->backend = backend ? std::move(backend) : makeOrtInferenceBackend();
}

MLPipeline::~MLPipeline() {
    if (pImpl_->bgRunning) {
        pImpl_->bgRunning = false;
        pImpl_->cv.notify_one();
        if (pImpl_->bgThread.joinable()) {
            pImpl_->bgThread.join();
        }
    }
}

bool MLPipeline::load(const std::string& modelPath) {
    pImpl_->error.clear();
    pImpl_->loaded = false;

    if (!pImpl_->backend) {
        pImpl_->error = "No inference backend configured";
        return false;
    }

    if (!pImpl_->backend->load(modelPath)) {
        pImpl_->error = pImpl_->backend->lastError();
        return false;
    }

    pImpl_->inputW = pImpl_->backend->inputWidth();
    pImpl_->inputH = pImpl_->backend->inputHeight();
    pImpl_->inputC = pImpl_->backend->inputChannels();
    pImpl_->outputElems = pImpl_->backend->outputElements();
    pImpl_->inputLayout = pImpl_->backend->inputLayout();
    pImpl_->inputElementType = pImpl_->backend->inputElementType();

    const std::size_t numInput = static_cast<std::size_t>(pImpl_->inputW)
                               * static_cast<std::size_t>(pImpl_->inputH)
                               * static_cast<std::size_t>(pImpl_->inputC);
    pImpl_->resizeBuf.resize(numInput);
    pImpl_->inputBuf.clear();
    pImpl_->inputBufInt32.clear();
    if (pImpl_->inputElementType == MLInputElementType::Int32) {
        pImpl_->inputBufInt32.resize(numInput);
    } else {
        pImpl_->inputBuf.resize(numInput);
    }

    pImpl_->loaded = true;
    return true;
}

bool MLPipeline::isLoaded() const {
    return pImpl_->loaded && pImpl_->backend && pImpl_->backend->isLoaded();
}

void MLPipeline::setNormalization(float scale, float bias) {
    pImpl_->normScale = scale;
    pImpl_->normBias = bias;
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

bool MLPipeline::infer(const unsigned char* rgbaData,
                       int srcWidth,
                       int srcHeight,
                       std::vector<float>& output) {
    if (!isLoaded()) {
        pImpl_->error = "No model loaded";
        return false;
    }

    bilinearResizeRGBA(rgbaData,
                       srcWidth,
                       srcHeight,
                       pImpl_->resizeBuf.data(),
                       pImpl_->inputW,
                       pImpl_->inputH,
                       pImpl_->inputC);

    const std::size_t numInput = static_cast<std::size_t>(pImpl_->inputW)
                               * static_cast<std::size_t>(pImpl_->inputH)
                               * static_cast<std::size_t>(pImpl_->inputC);

    const float scale = pImpl_->normScale;
    const float bias = pImpl_->normBias;
    const bool isInt32 = pImpl_->inputElementType == MLInputElementType::Int32;
    const float int32Mul = isInt32 ? 255.0f : 1.0f;
    const float int32Bias = isInt32 ? 0.0f : bias;
    const float effectiveScale = isInt32 ? 1.0f : scale;

    if (pImpl_->inputLayout == MLInputLayout::NHWC) {
        for (std::size_t i = 0; i < numInput; ++i) {
            const float v = pImpl_->resizeBuf[i] * effectiveScale * int32Mul + int32Bias;
            if (isInt32) {
                pImpl_->inputBufInt32[i] = static_cast<std::int32_t>(std::clamp(std::lround(v), 0L, 255L));
            } else {
                pImpl_->inputBuf[i] = v;
            }
        }
    } else {
        const std::size_t planeSize = static_cast<std::size_t>(pImpl_->inputW)
                                    * static_cast<std::size_t>(pImpl_->inputH);
        for (int y = 0; y < pImpl_->inputH; ++y) {
            for (int x = 0; x < pImpl_->inputW; ++x) {
                const std::size_t hwcBase = (static_cast<std::size_t>(y) * static_cast<std::size_t>(pImpl_->inputW)
                                           + static_cast<std::size_t>(x)) * static_cast<std::size_t>(pImpl_->inputC);
                const std::size_t pixelIndex = static_cast<std::size_t>(y) * static_cast<std::size_t>(pImpl_->inputW)
                                             + static_cast<std::size_t>(x);
                for (int c = 0; c < pImpl_->inputC; ++c) {
                    const std::size_t chwIndex = static_cast<std::size_t>(c) * planeSize + pixelIndex;
                    const float v = pImpl_->resizeBuf[hwcBase + static_cast<std::size_t>(c)] * effectiveScale * int32Mul + int32Bias;
                    if (isInt32) {
                        pImpl_->inputBufInt32[chwIndex] = static_cast<std::int32_t>(std::clamp(std::lround(v), 0L, 255L));
                    } else {
                        pImpl_->inputBuf[chwIndex] = v;
                    }
                }
            }
        }
    }

    const bool ok = isInt32
        ? pImpl_->backend->run(pImpl_->inputBufInt32.data(), numInput, output)
        : pImpl_->backend->run(pImpl_->inputBuf.data(), numInput, output);
    if (!ok) {
        pImpl_->error = pImpl_->backend->lastError();
    }
    return ok;
}

bool MLPipeline::getOutputAsMask(std::vector<float>& mask) {
    mask.resize(static_cast<std::size_t>(pImpl_->inputW)
              * static_cast<std::size_t>(pImpl_->inputH));
    return true;
}

const std::string& MLPipeline::lastError() const {
    if (!pImpl_->error.empty()) {
        return pImpl_->error;
    }
    if (pImpl_->backend) {
        return pImpl_->backend->lastError();
    }
    return pImpl_->error;
}

void MLPipeline::startBackgroundWorker() {
    if (pImpl_->bgRunning) {
        return;
    }
    pImpl_->bgRunning = true;
    pImpl_->bgThread = std::thread([this]() {
        while (pImpl_->bgRunning) {
            FrameJob job;
            {
                std::unique_lock<std::mutex> lock(pImpl_->queueMutex);
                if (pImpl_->frameQueue.empty()) {
                    pImpl_->cv.wait_for(lock, std::chrono::milliseconds(16));
                    if (pImpl_->frameQueue.empty()) {
                        continue;
                    }
                }
                job = std::move(pImpl_->frameQueue.front());
                pImpl_->frameQueue.pop();
            }

            if (!job.valid()) {
                continue;
            }

            if (job.isSegmentation) {
                const int srcW = job.width;
                const int srcH = job.height;
                std::vector<float> result;
                if (infer(job.rgba.data(), job.width, job.height, result)) {
                    std::vector<std::uint8_t> segRGBA;
                    if (processSegmentationMask(result, job, segRGBA)) {
                        std::lock_guard<std::mutex> lock(pImpl_->segResultMutex);
                        pImpl_->segResultRGBA = std::move(segRGBA);
                        pImpl_->segResultW = srcW;
                        pImpl_->segResultH = srcH;
                        pImpl_->segResultSeq = 0;
                        pImpl_->segResultValid = true;
                    }
                }
            } else {
                std::vector<float> result;
                if (infer(job.rgba.data(), job.width, job.height, result)) {
                    std::lock_guard<std::mutex> lock(pImpl_->resultMutex);
                    pImpl_->latestOutput = std::move(result);
                    pImpl_->latestValid = true;
                }
            }
        }
    });
}

void MLPipeline::submitFrame(int width, int height, std::vector<std::uint8_t> rgba) {
    if (!pImpl_->bgRunning) {
        return;
    }
    FrameJob job;
    job.width = width;
    job.height = height;
    job.rgba = std::move(rgba);
    {
        std::lock_guard<std::mutex> lock(pImpl_->queueMutex);
        while (!pImpl_->frameQueue.empty()) {
            pImpl_->frameQueue.pop();
        }
        pImpl_->frameQueue.push(std::move(job));
    }
    pImpl_->cv.notify_one();
}

void MLPipeline::submitSegmentation(int width, int height, std::vector<std::uint8_t> rgba,
                                    const SegmentationOpts& opts) {
    if (!pImpl_->bgRunning) {
        return;
    }
    FrameJob job;
    job.width = width;
    job.height = height;
    job.rgba = std::move(rgba);
    job.isSegmentation = true;
    job.segGain = opts.gain;
    job.segUseSigmoid = opts.useSigmoid;
    job.segThreshold = opts.threshold;
    job.segFeather = opts.feather;
    job.segInvert = opts.invert;
    job.segBackground = opts.background;
    job.sequence = 0;
    {
        std::lock_guard<std::mutex> lock(pImpl_->queueMutex);
        while (!pImpl_->frameQueue.empty()) {
            pImpl_->frameQueue.pop();
        }
        pImpl_->frameQueue.push(std::move(job));
    }
    pImpl_->cv.notify_one();
}

std::vector<std::uint8_t> MLPipeline::pollSegmentationResult(int& outW, int& outH, uint64_t& sequence) {
    std::lock_guard<std::mutex> lock(pImpl_->segResultMutex);
    if (!pImpl_->segResultValid) {
        return {};
    }
    outW = pImpl_->segResultW;
    outH = pImpl_->segResultH;
    sequence = 0;
    pImpl_->segResultValid = false;
    return std::move(pImpl_->segResultRGBA);
}

bool MLPipeline::pollResult(std::vector<float>& output) {
    std::lock_guard<std::mutex> lock(pImpl_->resultMutex);
    if (!pImpl_->latestValid) {
        return false;
    }
    output = pImpl_->latestOutput;
    pImpl_->latestValid = false;
    return true;
}

} // namespace manifold::ml
