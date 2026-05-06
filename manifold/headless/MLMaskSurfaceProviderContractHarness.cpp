#include "../primitives/ml/MLInferenceBackend.h"
#include "../primitives/ml/MLMaskSurfaceProvider.h"
#include "../primitives/ml/MLPipeline.h"
#include "../primitives/ui/RuntimeNode.h"
#include "../ui/imgui/ImGuiDirectHost.h"
#include "../ui/imgui/DirectHostRuntimeSupport.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_opengl/juce_opengl.h>

#include <cstdint>
#include <memory>
#include <mutex>
#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace manifold::ml;
using manifold::video::FrameData;

class FakeInferenceBackend final : public IMLInferenceBackend {
public:
    bool load(const std::string&) override {
        loaded = true;
        return true;
    }

    bool isLoaded() const override { return loaded; }
    int inputWidth() const override { return 2; }
    int inputHeight() const override { return 2; }
    int inputChannels() const override { return 3; }
    int outputElements() const override { return 4; }
    MLInputLayout inputLayout() const override { return MLInputLayout::NHWC; }
    MLInputElementType inputElementType() const override { return MLInputElementType::Float32; }

    bool run(const float*, std::size_t, std::vector<float>& output) override {
        ++floatRunCount;
        output = {-2.0f, 2.0f, -2.0f, 2.0f};
        return true;
    }

    bool run(const std::int32_t*, std::size_t, std::vector<float>& output) override {
        output.clear();
        return false;
    }

    const std::string& lastError() const override { return error; }

    bool loaded = false;
    int floatRunCount = 0;
    std::string error;
};

juce::var makeObject() {
    return juce::var(new juce::DynamicObject());
}

juce::DynamicObject* asObject(const juce::var& value) {
    return value.getDynamicObject();
}

FrameData makeFrame() {
    FrameData frame;
    frame.width = 2;
    frame.height = 2;
    frame.sequence = 1;
    frame.rgba = {
        255, 0,   0,   255,
        0,   255, 0,   255,
        0,   0,   255, 255,
        255, 255, 255, 255,
    };
    return frame;
}

void configureSurfaceNode(RuntimeNode& node,
                          const std::string& nodeId,
                          const juce::Rectangle<int>& bounds,
                          const std::string& surfaceType,
                          const juce::var& payload) {
    node.setNodeId(nodeId);
    node.setBounds(bounds.getX(), bounds.getY(), bounds.getWidth(), bounds.getHeight());
    RuntimeNode::StyleState style;
    style.background = 0x00000000u;
    style.border = 0xffffffffu;
    style.borderWidth = 1.0f;
    node.setStyle(style);
    node.setCustomSurfaceType(surfaceType);
    node.setCustomRenderPayload(payload);
}

juce::var makeMaskPayload() {
    auto payload = makeObject();
    asObject(payload)->setProperty("modelPath", juce::String("fake_model.onnx"));
    asObject(payload)->setProperty("gain", 1.0f);
    asObject(payload)->setProperty("useSigmoid", true);
    asObject(payload)->setProperty("threshold", 0.5f);
    asObject(payload)->setProperty("feather", 0.0f);
    asObject(payload)->setProperty("invert", false);
    asObject(payload)->setProperty("background", 0.0f);
    return payload;
}

juce::var makeCompositePayload() {
    auto payload = makeObject();
    asObject(payload)->setProperty("modelPath", juce::String("fake_model.onnx"));
    asObject(payload)->setProperty("gain", 1.0f);
    asObject(payload)->setProperty("useSigmoid", true);
    asObject(payload)->setProperty("threshold", 0.5f);
    asObject(payload)->setProperty("feather", 0.0f);
    asObject(payload)->setProperty("invert", false);
    asObject(payload)->setProperty("background", 0.25f);
    return payload;
}

juce::var surfaceInfoToVar(ImGuiDirectHost& host, uint64_t stableId) {
    auto obj = makeObject();
    int width = 0;
    int height = 0;
    uint64_t sequence = 0;
    const bool ok = host.getVideoSurfaceInfo(stableId, width, height, sequence);
    asObject(obj)->setProperty("ok", ok);
    asObject(obj)->setProperty("width", width);
    asObject(obj)->setProperty("height", height);
    asObject(obj)->setProperty("sequence", juce::var(static_cast<juce::int64>(sequence)));
    return obj;
}

std::string buildContract() {
    RuntimeNode root("ml_surface_root");
    root.setNodeId("ml_surface_root");
    root.setBounds(0, 0, 220, 120);

    auto* maskNode = root.createChild("MaskNode");
    configureSurfaceNode(*maskNode, "ml_mask_node", {16, 20, 80, 80}, "ml_mask", makeMaskPayload());

    auto* compositeNode = root.createChild("CompositeNode");
    configureSurfaceNode(*compositeNode, "ml_composite_node", {120, 20, 80, 80}, "ml_composite", makeCompositePayload());

    auto provider = std::make_shared<MLMaskSurfaceProvider>(
        []() {
            auto backend = std::make_unique<FakeInferenceBackend>();
            return std::make_unique<MLPipeline>(std::move(backend));
        },
        []() { return makeFrame(); });

    auto host = std::make_unique<ImGuiDirectHost>();
    host->registerSurfaceProvider(provider);
    host->setBounds(0, 0, 220, 120);
    host->setVisible(true);
    host->setRootNode(&root);
    host->buildRenderSnapshot();

    auto* contract = new juce::DynamicObject();
    contract->setProperty("eglReady", host->ensureEglOffscreenContext(220, 120));
    auto screenshot = host->captureScreenshot();
    contract->setProperty("screenshotValid", screenshot.isValid());
    contract->setProperty("maskHandle", juce::var(static_cast<juce::int64>(host->prepareCustomSurfaceTextureImmediate(*maskNode, 80, 80, 0.0))));
    contract->setProperty("compositeHandle", juce::var(static_cast<juce::int64>(host->prepareCustomSurfaceTextureImmediate(*compositeNode, 80, 80, 0.0))));

    auto infoObj = makeObject();
    asObject(infoObj)->setProperty("maskBeforePrune", surfaceInfoToVar(*host, maskNode->getStableId()));
    asObject(infoObj)->setProperty("compositeBeforePrune", surfaceInfoToVar(*host, compositeNode->getStableId()));

    int64_t gpuColorBefore = 0;
    int64_t gpuDepthBefore = 0;
    provider->getOwnedGpuBytes(gpuColorBefore, gpuDepthBefore);
    contract->setProperty("estimateStateBytesBeforePrune", juce::var(static_cast<juce::int64>(provider->estimateStateBytes())));
    contract->setProperty("gpuColorBytesBeforePrune", juce::var(static_cast<juce::int64>(gpuColorBefore)));
    contract->setProperty("gpuDepthBytesBeforePrune", juce::var(static_cast<juce::int64>(gpuDepthBefore)));

    provider->prune({maskNode->getStableId()});
    asObject(infoObj)->setProperty("maskAfterPrune", surfaceInfoToVar(*host, maskNode->getStableId()));
    asObject(infoObj)->setProperty("compositeAfterPrune", surfaceInfoToVar(*host, compositeNode->getStableId()));

    provider->releaseAll();
    int64_t gpuColorAfter = 0;
    int64_t gpuDepthAfter = 0;
    provider->getOwnedGpuBytes(gpuColorAfter, gpuDepthAfter);
    contract->setProperty("estimateStateBytesAfterRelease", juce::var(static_cast<juce::int64>(provider->estimateStateBytes())));
    contract->setProperty("gpuColorBytesAfterRelease", juce::var(static_cast<juce::int64>(gpuColorAfter)));
    contract->setProperty("gpuDepthBytesAfterRelease", juce::var(static_cast<juce::int64>(gpuDepthAfter)));
    asObject(infoObj)->setProperty("maskAfterRelease", surfaceInfoToVar(*host, maskNode->getStableId()));
    contract->setProperty("surfaceInfo", infoObj);

    host->shutdown();

    return juce::JSON::toString(juce::var(contract), true).toStdString();
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions options;
    if (!parseOptions(argc, argv, options)) {
        return 1;
    }

    const auto contract = buildContract();
    return finishJsonContract(options, "ml mask surface provider contract", contract);
}
