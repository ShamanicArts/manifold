#include "MLPipeline.h"

#include <cstring>
#include <algorithm>
#include <cmath>
#include <cstdio>

#include <onnxruntime_cxx_api.h>

namespace manifold::ml {

struct MLPipeline::Impl {
    enum class InputLayout {
        NHWC,
        NCHW,
    };

    Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "ManifoldML"};
    Ort::SessionOptions opts;
    std::unique_ptr<Ort::Session> session;

    std::vector<int64_t> inputDims;
    std::vector<int64_t> outputDims;
    int inputW = 0;
    int inputH = 0;
    int inputC = 0;
    int outputElems = 0;
    bool loaded = false;
    std::string error;

    // Input/output names — queried from model
    std::string inputName;
    std::string outputName;
    InputLayout inputLayout = InputLayout::NHWC;

    // Pre-allocated resize/input buffers to avoid per-frame allocation
    std::vector<float> resizeBuf;
    std::vector<float> inputBuf;
    std::vector<int32_t> inputBufInt32;

    float normScale = 2.0f;
    float normBias = -1.0f;
    ONNXTensorElementDataType inputElementType = ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT;

    // --- Async background inference ---
    std::thread bgThread;
    std::atomic<bool> bgRunning{false};
    std::mutex queueMutex;
    std::condition_variable cv;
    std::queue<FrameJob> frameQueue;
    std::mutex resultMutex;
    std::vector<float> latestOutput;
    bool latestValid = false;

    // Segmentation result (full RGBA frame, processed on background thread)
    std::mutex segResultMutex;
    std::vector<std::uint8_t> segResultRGBA;
    int segResultW = 0;
    int segResultH = 0;
    uint64_t segResultSeq = 0;
    bool segResultValid = false;
};

MLPipeline::MLPipeline()
    : pImpl_(std::make_unique<Impl>()) {
    pImpl_->opts.SetIntraOpNumThreads(4);
}

MLPipeline::~MLPipeline() {
    if (pImpl_->bgRunning) {
        pImpl_->bgRunning = false;
        pImpl_->cv.notify_one();
        if (pImpl_->bgThread.joinable()) pImpl_->bgThread.join();
    }
}

bool MLPipeline::load(const std::string& modelPath) {
    pImpl_->error.clear();
    pImpl_->loaded = false;

    try {
        pImpl_->session = std::make_unique<Ort::Session>(
            pImpl_->env, modelPath.c_str(), pImpl_->opts);
    } catch (const Ort::Exception& e) {
        pImpl_->error = "Failed to create session: ";
        pImpl_->error += e.what();
        return false;
    }

    // Query input info
    auto inputTypeInfo = pImpl_->session->GetInputTypeInfo(0);
    auto inputTensorInfo = inputTypeInfo.GetTensorTypeAndShapeInfo();
    pImpl_->inputDims = inputTensorInfo.GetShape();

    // Handle dynamic batch dimension (-1)
    for (auto& d : pImpl_->inputDims) {
        if (d < 0) d = 1;
    }

    if (pImpl_->inputDims.size() != 4) {
        pImpl_->error = "Expected 4D input (NHWC or NCHW), got " +
                        std::to_string(pImpl_->inputDims.size()) + "D";
        return false;
    }

    // Detect layout from tensor shape.
    const int d1 = static_cast<int>(pImpl_->inputDims[1]);
    const int d2 = static_cast<int>(pImpl_->inputDims[2]);
    const int d3 = static_cast<int>(pImpl_->inputDims[3]);

    if (d3 == 1 || d3 == 3 || d3 == 4) {
        // NHWC: {batch, height, width, channels}
        pImpl_->inputLayout = Impl::InputLayout::NHWC;
        pImpl_->inputH = d1;
        pImpl_->inputW = d2;
        pImpl_->inputC = d3;
    } else if (d1 == 1 || d1 == 3 || d1 == 4) {
        // NCHW: {batch, channels, height, width}
        pImpl_->inputLayout = Impl::InputLayout::NCHW;
        pImpl_->inputC = d1;
        pImpl_->inputH = d2;
        pImpl_->inputW = d3;
    } else {
        pImpl_->error = "Unable to infer model input layout from dims [" +
                        std::to_string(d1) + ", " +
                        std::to_string(d2) + ", " +
                        std::to_string(d3) + "]";
        return false;
    }

    // Query output info
    auto outputTypeInfo = pImpl_->session->GetOutputTypeInfo(0);
    auto outputTensorInfo = outputTypeInfo.GetTensorTypeAndShapeInfo();
    pImpl_->outputDims = outputTensorInfo.GetShape();
    for (auto& d : pImpl_->outputDims) {
        if (d < 0) d = 1;
    }

    pImpl_->outputElems = 1;
    for (auto d : pImpl_->outputDims) {
        pImpl_->outputElems *= static_cast<int>(d);
    }

    // Query input element type (float, int32, etc.)
    pImpl_->inputElementType = inputTensorInfo.GetElementType();

    // Get input/output names
    auto inputNameAlloc = pImpl_->session->GetInputNameAllocated(0, Ort::AllocatorWithDefaultOptions());
    pImpl_->inputName = inputNameAlloc.get();
    auto outputNameAlloc = pImpl_->session->GetOutputNameAllocated(0, Ort::AllocatorWithDefaultOptions());
    pImpl_->outputName = outputNameAlloc.get();

    // Pre-allocate resize buffer
    const std::size_t numInput = static_cast<std::size_t>(pImpl_->inputW)
                               * static_cast<std::size_t>(pImpl_->inputH)
                               * static_cast<std::size_t>(pImpl_->inputC);
    pImpl_->resizeBuf.resize(numInput);
    if (pImpl_->inputElementType == ONNX_TENSOR_ELEMENT_DATA_TYPE_INT32) {
        pImpl_->inputBufInt32.resize(numInput);
    } else {
        pImpl_->inputBuf.resize(numInput);
    }

    pImpl_->loaded = true;
    return true;
}

bool MLPipeline::isLoaded() const {
    return pImpl_->loaded;
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

bool MLPipeline::infer(const unsigned char* rgbaData,
                       int srcWidth,
                       int srcHeight,
                       std::vector<float>& output) {
    if (!pImpl_->loaded) {
        pImpl_->error = "No model loaded";
        return false;
    }

    try {
        // 1. Resize and normalize RGBA → float RGB
        bilinearResizeRGBA(rgbaData, srcWidth, srcHeight,
                           pImpl_->resizeBuf.data(),
                           pImpl_->inputW, pImpl_->inputH, pImpl_->inputC);

        // 2. Normalize and pack into model layout
        auto memoryInfo = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
        const std::size_t numInput = static_cast<std::size_t>(pImpl_->inputW)
                                   * static_cast<std::size_t>(pImpl_->inputH)
                                   * static_cast<std::size_t>(pImpl_->inputC);

        const float scale = pImpl_->normScale;
        const float bias = pImpl_->normBias;
        const bool isInt32 = pImpl_->inputElementType == ONNX_TENSOR_ELEMENT_DATA_TYPE_INT32;

        // Int32 models (e.g. MoveNet) typically expect raw pixel range [0,255], not normalized.
        // Float models (e.g. selfie segmentation) expect normalized range with custom scale/bias.
        const float int32Mul = isInt32 ? 255.0f : 1.0f;
        const float int32Bias = isInt32 ? 0.0f : bias;
        const float effectiveScale = isInt32 ? 1.0f : scale;

        if (pImpl_->inputLayout == Impl::InputLayout::NHWC) {
            for (std::size_t i = 0; i < numInput; ++i) {
                float v = pImpl_->resizeBuf[i] * effectiveScale * int32Mul + int32Bias;
                if (isInt32) {
                    pImpl_->inputBufInt32[i] = static_cast<int32_t>(std::clamp(std::lround(v), 0L, 255L));
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
                        float v = pImpl_->resizeBuf[hwcBase + static_cast<std::size_t>(c)] * effectiveScale * int32Mul + int32Bias;
                        if (isInt32) {
                            pImpl_->inputBufInt32[chwIndex] = static_cast<int32_t>(std::clamp(std::lround(v), 0L, 255L));
                        } else {
                            pImpl_->inputBuf[chwIndex] = v;
                        }
                    }
                }
            }
        }

        // 3. Run inference
        const char* inputNames[] = {pImpl_->inputName.c_str()};
        const char* outputNames[] = {pImpl_->outputName.c_str()};

        std::vector<Ort::Value> inputTensors;
        if (isInt32) {
            inputTensors.push_back(Ort::Value::CreateTensor<int32_t>(
                memoryInfo,
                pImpl_->inputBufInt32.data(),
                numInput,
                pImpl_->inputDims.data(),
                pImpl_->inputDims.size()));
        } else {
            inputTensors.push_back(Ort::Value::CreateTensor<float>(
                memoryInfo,
                pImpl_->inputBuf.data(),
                numInput,
                pImpl_->inputDims.data(),
                pImpl_->inputDims.size()));
        }

        auto outputTensors = pImpl_->session->Run(
            Ort::RunOptions{},
            inputNames, inputTensors.data(), 1,
            outputNames, 1);

        // 4. Read output
        float* outputData = outputTensors[0].GetTensorMutableData<float>();
        output.assign(outputData, outputData + pImpl_->outputElems);

    } catch (const Ort::Exception& e) {
        pImpl_->error = "Inference failed: ";
        pImpl_->error += e.what();
        return false;
    }

    return true;
}

bool MLPipeline::getOutputAsMask(std::vector<float>& mask) {
    mask.resize(static_cast<std::size_t>(pImpl_->inputW)
              * static_cast<std::size_t>(pImpl_->inputH));
    return true;
}

// ============================================================================
// Segmentation mask processing helpers (runs on background thread)
// ============================================================================

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
    if (applySigmoid && useSigmoid)
        value = 1.0f / (1.0f + std::exp(-value));
    if (invert) value = 1.0f - value;
    value = segClamp01(value * std::max(0.01f, gain));
    if (feather > 0.0f)
        value = segSmoothstep(threshold - feather * 0.5f, threshold + feather * 0.5f, value);
    else
        value = (value >= threshold) ? 1.0f : 0.0f;
    return segClamp01(value);
}

static float segSampleNearest(const std::vector<float>& mask,
                               int maskW, int maskH,
                               int x, int y, int outW, int outH) {
    const int mx = std::clamp((x * maskW) / outW, 0, maskW - 1);
    const int my = std::clamp((y * maskH) / outH, 0, maskH - 1);
    return mask[static_cast<std::size_t>(my) * static_cast<std::size_t>(maskW) + static_cast<std::size_t>(mx)];
}

static bool processSegmentationMask(
    const std::vector<float>& rawOutput,
    const FrameJob& job,
    std::vector<std::uint8_t>& outRGBA)
{
    // rawOutput size determines mask dimensions (square root approximation)
    const std::size_t rawSize = rawOutput.size();
    int maskW = static_cast<int>(std::sqrt(static_cast<float>(rawSize)));
    int maskH = maskW;
    while (static_cast<std::size_t>(maskW) * static_cast<std::size_t>(maskH) < rawSize) {
        ++maskW;
        if (static_cast<std::size_t>(maskW) * static_cast<std::size_t>(maskH) >= rawSize) break;
        ++maskH;
    }
    if (maskW <= 0 || maskH <= 0) return false;
    const std::size_t maskSize = static_cast<std::size_t>(maskW) * static_cast<std::size_t>(maskH);

    float minVal = rawOutput[0], maxVal = rawOutput[0];
    for (std::size_t i = 1; i < maskSize; ++i) {
        minVal = std::min(minVal, rawOutput[i]);
        maxVal = std::max(maxVal, rawOutput[i]);
    }
    const bool applySigmoid = job.segUseSigmoid && (minVal < 0.0f || maxVal > 1.0f);

    std::vector<float> processedMask(maskSize);
    for (std::size_t i = 0; i < maskSize; ++i) {
        processedMask[i] = segPostprocessValue(rawOutput[i], job.segGain, job.segUseSigmoid,
                                               job.segThreshold, job.segFeather,
                                               job.segInvert, applySigmoid);
    }

    // Build RGBA output by resampling mask to original frame size
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

const std::string& MLPipeline::lastError() const {
    return pImpl_->error;
}

// ============================================================================
// Async background inference
// ============================================================================

void MLPipeline::startBackgroundWorker() {
    if (pImpl_->bgRunning) return;
    pImpl_->bgRunning = true;
    pImpl_->bgThread = std::thread([this]() {
        while (pImpl_->bgRunning) {
            FrameJob job;
            {
                std::unique_lock<std::mutex> lock(pImpl_->queueMutex);
                if (pImpl_->frameQueue.empty()) {
                    pImpl_->cv.wait_for(lock, std::chrono::milliseconds(16));
                    if (pImpl_->frameQueue.empty()) continue;
                }
                job = std::move(pImpl_->frameQueue.front());
                pImpl_->frameQueue.pop();
            }

            if (!job.valid()) continue;

            if (job.isSegmentation) {
                // Segmentation pipeline: infer + mask process + RGBA build
                // Store source frame dims for processing
                const int srcW = job.width;
                const int srcH = job.height;

                std::vector<float> output;
                if (infer(job.rgba.data(), job.width, job.height, output)) {
                    std::vector<std::uint8_t> segRGBA;
                    if (processSegmentationMask(output, job, segRGBA)) {
                        std::lock_guard<std::mutex> lock(pImpl_->segResultMutex);
                        pImpl_->segResultRGBA = std::move(segRGBA);
                        pImpl_->segResultW = srcW;
                        pImpl_->segResultH = srcH;
                        pImpl_->segResultValid = true;
                    }
                }
            } else {
                // Regular inference: just run infer, store raw output
                std::vector<float> output;
                if (infer(job.rgba.data(), job.width, job.height, output)) {
                    std::lock_guard<std::mutex> lock(pImpl_->resultMutex);
                    pImpl_->latestOutput = std::move(output);
                    pImpl_->latestValid = true;
                }
            }
        }
    });
}

void MLPipeline::submitFrame(int width, int height, std::vector<std::uint8_t> rgba) {
    if (!pImpl_->bgRunning) return;
    FrameJob job;
    job.width = width;
    job.height = height;
    job.rgba = std::move(rgba);
    {
        std::lock_guard<std::mutex> lock(pImpl_->queueMutex);
        if (!pImpl_->frameQueue.empty()) {
            while (!pImpl_->frameQueue.empty()) pImpl_->frameQueue.pop();
        }
        pImpl_->frameQueue.push(std::move(job));
    }
    pImpl_->cv.notify_one();
}

void MLPipeline::submitSegmentation(int width, int height, std::vector<std::uint8_t> rgba,
                                     const SegmentationOpts& opts) {
    if (!pImpl_->bgRunning) return;
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
    {
        std::lock_guard<std::mutex> lock(pImpl_->queueMutex);
        if (!pImpl_->frameQueue.empty()) {
            while (!pImpl_->frameQueue.empty()) pImpl_->frameQueue.pop();
        }
        pImpl_->frameQueue.push(std::move(job));
    }
    pImpl_->cv.notify_one();
}

std::vector<std::uint8_t> MLPipeline::pollSegmentationResult(int& outW, int& outH, uint64_t& sequence) {
    std::lock_guard<std::mutex> lock(pImpl_->segResultMutex);
    if (!pImpl_->segResultValid) return {};
    outW = pImpl_->segResultW;
    outH = pImpl_->segResultH;
    sequence = 0;  // sequence not tracked at this level
    pImpl_->segResultValid = false;
    return std::move(pImpl_->segResultRGBA);
}

bool MLPipeline::pollResult(std::vector<float>& output) {
    std::lock_guard<std::mutex> lock(pImpl_->resultMutex);
    if (!pImpl_->latestValid) return false;
    output = pImpl_->latestOutput;
    return true;
}

} // namespace manifold::ml
