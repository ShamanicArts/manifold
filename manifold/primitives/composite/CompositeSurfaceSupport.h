#pragma once

#include "../shaders/ShaderEffectRegistry.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <string>

namespace manifold::composite::surface_support {

inline bool varIsNumber(const juce::var& value) {
    return value.isInt() || value.isInt64() || value.isDouble() || value.isBool();
}

inline double varToDoubleValue(const juce::var& value, double fallback = 0.0) {
    if (value.isVoid() || value.isUndefined()) {
        return fallback;
    }
    if (value.isBool()) {
        return static_cast<bool>(value) ? 1.0 : 0.0;
    }
    return static_cast<double>(value);
}

struct ParsedCompositeDescriptor {
    std::string bottomNodeId;
    std::string topNodeId;
    std::string requestedBlendOpId;
    std::string effectiveBlendOpId = "normal";
    juce::var blendParams;
    float opacity = 1.0f;
    std::string vertexSource;
    std::string fragmentSource;
    std::string signature;
};

inline std::string buildSignature(const std::string& bottomNodeId,
                                  const std::string& topNodeId,
                                  const std::string& blendOpId,
                                  const std::string& vertexSource,
                                  const std::string& fragmentSource) {
    return "bottom=" + bottomNodeId + "\n"
        + "top=" + topNodeId + "\n"
        + "blendOp=" + blendOpId + "\n"
        + "vertex:\n" + vertexSource + "\n"
        + "fragment:\n" + fragmentSource + "\n";
}

inline bool parseCompositeDescriptor(const juce::var& payload,
                                     ParsedCompositeDescriptor& descriptor,
                                     std::string& errorOut) {
    auto* payloadObj = payload.getDynamicObject();
    if (payloadObj == nullptr) {
        errorOut = "composite payload must be an object";
        return false;
    }

    descriptor.bottomNodeId = payloadObj->getProperty("bottomNodeId").toString().toStdString();
    descriptor.topNodeId = payloadObj->getProperty("topNodeId").toString().toStdString();
    descriptor.requestedBlendOpId = payloadObj->getProperty("blendOpId").toString().toStdString();
    descriptor.effectiveBlendOpId = descriptor.requestedBlendOpId.empty() ? std::string("normal")
                                                                          : descriptor.requestedBlendOpId;
    descriptor.blendParams = payloadObj->getProperty("blendParams").clone();

    const auto opacityVar = payloadObj->getProperty("opacity");
    descriptor.opacity = varIsNumber(opacityVar)
        ? std::clamp(static_cast<float>(varToDoubleValue(opacityVar, 1.0)), 0.0f, 1.0f)
        : 1.0f;

    descriptor.vertexSource = manifold::shaders::ShaderEffectRegistry::instance().vertexShader();
    descriptor.fragmentSource = manifold::shaders::ShaderEffectRegistry::instance().fragmentShaderForBlendOp(descriptor.effectiveBlendOpId);
    if (descriptor.vertexSource.empty() || descriptor.fragmentSource.empty()) {
        errorOut = "composite blend shader missing source";
        return false;
    }

    descriptor.signature = buildSignature(descriptor.bottomNodeId,
                                          descriptor.topNodeId,
                                          descriptor.effectiveBlendOpId,
                                          descriptor.vertexSource,
                                          descriptor.fragmentSource);
    return true;
}

inline uint64_t resolveCompositeSequence(uint64_t bottomSequence, uint64_t topSequence) {
    return std::max(bottomSequence, topSequence);
}

} // namespace manifold::composite::surface_support
