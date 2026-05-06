#include "../primitives/ml/MLMaskSurfaceSupport.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>

#include <cstdint>
#include <string>
#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace manifold::ml;

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

juce::var byteVectorToVar(const std::vector<unsigned char>& values) {
    juce::Array<juce::var> array;
    for (const auto value : values) {
        array.add(static_cast<int>(value));
    }
    return juce::var(array);
}

juce::var runParseCase() {
    auto* obj = new juce::DynamicObject();
    auto payload = juce::JSON::parse(R"({
        "modelPath": "models/seg.onnx",
        "gain": -5.0,
        "useSigmoid": false,
        "threshold": 1.5,
        "feather": -1.0,
        "invert": true,
        "background": 2.0
    })");
    const auto request = parseMLMaskRequest(payload);
    obj->setProperty("modelPath", juce::String(request.modelPath));
    obj->setProperty("gain", request.gain);
    obj->setProperty("useSigmoid", request.useSigmoid);
    obj->setProperty("threshold", request.threshold);
    obj->setProperty("feather", request.feather);
    obj->setProperty("invert", request.invert);
    obj->setProperty("background", request.background);
    return juce::var(obj);
}

juce::var runSignatureCase() {
    auto* obj = new juce::DynamicObject();
    MLMaskRequest a;
    a.modelPath = "a.onnx";
    a.gain = 1.0f;
    a.useSigmoid = true;
    a.threshold = 0.5f;
    a.feather = 0.15f;
    a.invert = false;
    a.background = 0.1f;

    MLMaskRequest b = a;
    MLMaskRequest c = a;
    c.background = 0.2f;

    obj->setProperty("matchAB", mlMaskRequestsMatch(a, b));
    obj->setProperty("matchAC", mlMaskRequestsMatch(a, c));
    obj->setProperty("keyABSame", makeMLMaskTextureKey("ml_mask", a) == makeMLMaskTextureKey("ml_mask", b));
    obj->setProperty("keyACSame", makeMLMaskTextureKey("ml_mask", a) == makeMLMaskTextureKey("ml_mask", c));
    return juce::var(obj);
}

juce::var runMaskBuildCase() {
    auto* obj = new juce::DynamicObject();
    MLMaskRequest request;
    request.useSigmoid = false;
    request.threshold = 0.5f;
    request.feather = 0.0f;
    request.background = 0.0f;

    const std::vector<float> rawOutput{0.0f, 1.0f, 0.25f, 0.75f};
    const auto processed = buildProcessedMLMask(rawOutput, 4, request, false);
    const auto rgba = buildMLMaskRgba(processed);

    obj->setProperty("processed", floatVectorToVar(processed));
    obj->setProperty("rgba", byteVectorToVar(rgba));
    return juce::var(obj);
}

juce::var runCompositeCase() {
    auto* obj = new juce::DynamicObject();
    MLMaskRequest request;
    request.background = 0.25f;
    const std::vector<float> processed{0.0f, 1.0f, 0.0f, 1.0f};
    const auto rgba = buildMLCompositeRgba(makeReferenceFrame(), 2, 2, processed, 2, 2, request);
    obj->setProperty("rgba", byteVectorToVar(rgba));
    return juce::var(obj);
}

juce::var runSigmoidDecisionCase() {
    auto* obj = new juce::DynamicObject();
    const std::vector<float> logits{-2.0f, 0.0f, 2.0f, -1.0f};
    const std::vector<float> probabilities{0.1f, 0.5f, 0.9f, 0.2f};
    obj->setProperty("logitsNeedSigmoid", shouldApplyMLMaskSigmoid(logits, logits.size(), true));
    obj->setProperty("probabilitiesNeedSigmoid", shouldApplyMLMaskSigmoid(probabilities, probabilities.size(), true));
    obj->setProperty("disabledNeedSigmoid", shouldApplyMLMaskSigmoid(logits, logits.size(), false));
    return juce::var(obj);
}

std::string buildContract() {
    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);
    root->setProperty("parse", runParseCase());
    root->setProperty("signature", runSignatureCase());
    root->setProperty("maskBuild", runMaskBuildCase());
    root->setProperty("compositeBuild", runCompositeCase());
    root->setProperty("sigmoidDecision", runSigmoidDecisionCase());
    return juce::JSON::toString(juce::var(root), true).toStdString();
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions options;
    if (!parseOptions(argc, argv, options)) {
        return 1;
    }

    const auto contract = buildContract();
    return finishJsonContract(options, "ml mask surface support contract", contract);
}
