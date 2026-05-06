#include "../primitives/ml/MLInferenceBackend.h"
#include "../primitives/ml/MLPipeline.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace manifold::ml;

constexpr int kWidth = 2;
constexpr int kHeight = 2;

class FakeInferenceBackend final : public IMLInferenceBackend {
public:
    bool loadShouldSucceed = true;
    bool loaded = false;
    int width = 2;
    int height = 2;
    int channels = 3;
    int outputs = 0;
    MLInputLayout layout = MLInputLayout::NHWC;
    MLInputElementType elementType = MLInputElementType::Float32;
    std::vector<float> floatOutput;
    std::string error = "fake load failure";

    mutable std::mutex mutex;
    std::vector<float> lastFloatInput;
    std::vector<std::int32_t> lastIntInput;
    int floatRunCount = 0;
    int intRunCount = 0;

    bool load(const std::string&) override {
        loaded = loadShouldSucceed;
        return loaded;
    }

    bool isLoaded() const override { return loaded; }
    int inputWidth() const override { return width; }
    int inputHeight() const override { return height; }
    int inputChannels() const override { return channels; }
    int outputElements() const override { return outputs; }
    MLInputLayout inputLayout() const override { return layout; }
    MLInputElementType inputElementType() const override { return elementType; }

    bool run(const float* input,
             std::size_t elementCount,
             std::vector<float>& output) override {
        std::lock_guard<std::mutex> lock(mutex);
        lastFloatInput.assign(input, input + elementCount);
        lastIntInput.clear();
        ++floatRunCount;
        output = floatOutput;
        return true;
    }

    bool run(const std::int32_t* input,
             std::size_t elementCount,
             std::vector<float>& output) override {
        std::lock_guard<std::mutex> lock(mutex);
        lastIntInput.assign(input, input + elementCount);
        lastFloatInput.clear();
        ++intRunCount;
        output = floatOutput;
        return true;
    }

    const std::string& lastError() const override { return error; }
};

std::vector<std::uint8_t> makeReferenceFrame() {
    return {
        255, 0,   0,   255,
        0,   255, 0,   255,
        0,   0,   255, 255,
        255, 255, 255, 255,
    };
}

juce::var floatVectorToVar(const std::vector<float>& values) {
    juce::Array<juce::var> array;
    for (const auto value : values) {
        array.add(static_cast<double>(value));
    }
    return juce::var(array);
}

juce::var intVectorToVar(const std::vector<std::int32_t>& values) {
    juce::Array<juce::var> array;
    for (const auto value : values) {
        array.add(static_cast<int>(value));
    }
    return juce::var(array);
}

juce::var byteVectorToVar(const std::vector<std::uint8_t>& values) {
    juce::Array<juce::var> array;
    for (const auto value : values) {
        array.add(static_cast<int>(value));
    }
    return juce::var(array);
}

juce::var runFloatNhwcCase() {
    auto* obj = new juce::DynamicObject();
    auto backend = std::make_unique<FakeInferenceBackend>();
    auto* rawBackend = backend.get();
    backend->layout = MLInputLayout::NHWC;
    backend->elementType = MLInputElementType::Float32;
    backend->outputs = 2;
    backend->floatOutput = {0.25f, 0.75f};

    MLPipeline pipeline(std::move(backend));
    const bool loadOk = pipeline.load("fake_float.onnx");
    std::vector<float> output;
    const auto frame = makeReferenceFrame();
    const bool inferOk = pipeline.infer(frame.data(), kWidth, kHeight, output);

    obj->setProperty("loadOk", loadOk);
    obj->setProperty("inferOk", inferOk);
    obj->setProperty("inputWidth", pipeline.inputWidth());
    obj->setProperty("inputHeight", pipeline.inputHeight());
    obj->setProperty("inputChannels", pipeline.inputChannels());
    obj->setProperty("outputElements", pipeline.outputElements());
    obj->setProperty("output", floatVectorToVar(output));
    {
        std::lock_guard<std::mutex> lock(rawBackend->mutex);
        obj->setProperty("packedInput", floatVectorToVar(rawBackend->lastFloatInput));
        obj->setProperty("floatRunCount", rawBackend->floatRunCount);
    }
    return juce::var(obj);
}

juce::var runIntNchwCase() {
    auto* obj = new juce::DynamicObject();
    auto backend = std::make_unique<FakeInferenceBackend>();
    auto* rawBackend = backend.get();
    backend->layout = MLInputLayout::NCHW;
    backend->elementType = MLInputElementType::Int32;
    backend->outputs = 3;
    backend->floatOutput = {1.0f, 2.0f, 3.0f};

    MLPipeline pipeline(std::move(backend));
    const bool loadOk = pipeline.load("fake_int.onnx");
    std::vector<float> output;
    const auto frame = makeReferenceFrame();
    const bool inferOk = pipeline.infer(frame.data(), kWidth, kHeight, output);

    obj->setProperty("loadOk", loadOk);
    obj->setProperty("inferOk", inferOk);
    obj->setProperty("output", floatVectorToVar(output));
    {
        std::lock_guard<std::mutex> lock(rawBackend->mutex);
        obj->setProperty("packedInput", intVectorToVar(rawBackend->lastIntInput));
        obj->setProperty("intRunCount", rawBackend->intRunCount);
    }
    return juce::var(obj);
}

juce::var runLoadFailureCase() {
    auto* obj = new juce::DynamicObject();
    auto backend = std::make_unique<FakeInferenceBackend>();
    backend->loadShouldSucceed = false;
    backend->error = "intentional fake load failure";

    MLPipeline pipeline(std::move(backend));
    obj->setProperty("loadOk", pipeline.load("broken.onnx"));
    obj->setProperty("isLoaded", pipeline.isLoaded());
    obj->setProperty("lastError", juce::String(pipeline.lastError()));
    return juce::var(obj);
}

juce::var runAsyncInferenceCase() {
    auto* obj = new juce::DynamicObject();
    auto backend = std::make_unique<FakeInferenceBackend>();
    auto* rawBackend = backend.get();
    backend->layout = MLInputLayout::NHWC;
    backend->elementType = MLInputElementType::Float32;
    backend->outputs = 3;
    backend->floatOutput = {9.0f, 8.0f, 7.0f};

    MLPipeline pipeline(std::move(backend));
    obj->setProperty("loadOk", pipeline.load("async.onnx"));
    pipeline.startBackgroundWorker();
    pipeline.submitFrame(kWidth, kHeight, makeReferenceFrame());

    std::vector<float> output;
    bool polled = false;
    for (int attempt = 0; attempt < 50; ++attempt) {
        if (pipeline.pollResult(output)) {
            polled = true;
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    obj->setProperty("pollOk", polled);
    obj->setProperty("output", floatVectorToVar(output));
    {
        std::lock_guard<std::mutex> lock(rawBackend->mutex);
        obj->setProperty("floatRunCount", rawBackend->floatRunCount);
    }
    return juce::var(obj);
}

juce::var runSegmentationCase() {
    auto* obj = new juce::DynamicObject();
    auto backend = std::make_unique<FakeInferenceBackend>();
    backend->layout = MLInputLayout::NHWC;
    backend->elementType = MLInputElementType::Float32;
    backend->outputs = 4;
    backend->floatOutput = {-2.0f, 2.0f, -2.0f, 2.0f};

    MLPipeline pipeline(std::move(backend));
    obj->setProperty("loadOk", pipeline.load("seg.onnx"));
    pipeline.startBackgroundWorker();

    MLPipeline::SegmentationOpts opts;
    opts.gain = 1.0f;
    opts.useSigmoid = true;
    opts.threshold = 0.5f;
    opts.feather = 0.0f;
    opts.invert = false;
    opts.background = 0.0f;
    pipeline.submitSegmentation(kWidth, kHeight, makeReferenceFrame(), opts);

    int outW = 0;
    int outH = 0;
    uint64_t seq = 999;
    std::vector<std::uint8_t> rgba;
    for (int attempt = 0; attempt < 50; ++attempt) {
        rgba = pipeline.pollSegmentationResult(outW, outH, seq);
        if (!rgba.empty()) {
            break;
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    obj->setProperty("resultWidth", outW);
    obj->setProperty("resultHeight", outH);
    obj->setProperty("resultSequence", juce::var(static_cast<juce::int64>(seq)));
    obj->setProperty("rgba", byteVectorToVar(rgba));
    return juce::var(obj);
}

std::string buildContract() {
    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);
    root->setProperty("floatNhwc", runFloatNhwcCase());
    root->setProperty("intNchw", runIntNchwCase());
    root->setProperty("loadFailure", runLoadFailureCase());
    root->setProperty("asyncInference", runAsyncInferenceCase());
    root->setProperty("segmentation", runSegmentationCase());
    return juce::JSON::toString(juce::var(root), true).toStdString();
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions options;
    if (!parseOptions(argc, argv, options)) {
        return 1;
    }

    const auto contract = buildContract();
    return finishJsonContract(options, "ml pipeline contract", contract);
}
