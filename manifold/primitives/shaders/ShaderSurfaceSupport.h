#pragma once

#include "UniformContract.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <array>
#include <string>
#include <vector>

namespace manifold::shaders::surface_support {

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

inline std::array<float, 4> readColorVec4(const juce::var& value,
                                          std::array<float, 4> fallback = { 0.0f, 0.0f, 0.0f, 0.0f }) {
    if (auto* arr = value.getArray(); arr != nullptr) {
        if (!arr->isEmpty()) fallback[0] = static_cast<float>(varToDoubleValue(arr->getReference(0), fallback[0]));
        if (arr->size() > 1) fallback[1] = static_cast<float>(varToDoubleValue(arr->getReference(1), fallback[1]));
        if (arr->size() > 2) fallback[2] = static_cast<float>(varToDoubleValue(arr->getReference(2), fallback[2]));
        if (arr->size() > 3) fallback[3] = static_cast<float>(varToDoubleValue(arr->getReference(3), fallback[3]));
        return fallback;
    }
    if (auto* obj = value.getDynamicObject(); obj != nullptr) {
        fallback[0] = static_cast<float>(varToDoubleValue(obj->getProperty("r"), fallback[0]));
        fallback[1] = static_cast<float>(varToDoubleValue(obj->getProperty("g"), fallback[1]));
        fallback[2] = static_cast<float>(varToDoubleValue(obj->getProperty("b"), fallback[2]));
        fallback[3] = static_cast<float>(varToDoubleValue(obj->getProperty("a"), fallback[3]));
    }
    return fallback;
}

struct ParsedPassConfig {
    std::string vertexSource;
    std::string fragmentSource;
    std::string inputTextureUniform = UniformContract::kInputTex;
    std::string prevTextureUniform = UniformContract::kPrevTex;
    juce::var uniforms;
    std::array<float, 4> clearColor { 0.0f, 0.0f, 0.0f, 0.0f };
    bool enableDepth = false;
    int blendMode = 0;
    float opacity = 1.0f;
    bool chain = false;
    bool composite = false;
    std::string blendOpId;
    juce::var blendParams;
};

struct ParsedSourceConfig {
    std::string vertexSource;
    std::string fragmentSource;
    juce::var uniforms;
    std::array<float, 4> clearColor { 0.0f, 0.0f, 0.0f, 1.0f };
};

inline int readBlendModeValue(const juce::var& blendVar) {
    if (blendVar.isInt() || blendVar.isInt64() || blendVar.isDouble()) {
        return static_cast<int>(blendVar);
    }
    if (!blendVar.isString()) {
        return 0;
    }

    const auto name = blendVar.toString().toStdString();
    if (name == "add") return 1;
    if (name == "multiply") return 2;
    if (name == "screen") return 3;
    if (name == "difference") return 4;
    return 0;
}

inline bool parsePassConfig(const juce::var& passVar, ParsedPassConfig& pass, std::string& errorOut) {
    auto* passObj = passVar.getDynamicObject();
    if (passObj == nullptr) {
        errorOut = "shader pass payload must be an object";
        return false;
    }

    pass.vertexSource = passObj->getProperty("vertexShader").toString().toStdString();
    pass.fragmentSource = passObj->getProperty("fragmentShader").toString().toStdString();
    pass.inputTextureUniform = passObj->getProperty("inputTextureUniform").toString().toStdString();
    if (pass.inputTextureUniform.empty()) {
        pass.inputTextureUniform = UniformContract::kInputTex;
    }
    pass.prevTextureUniform = passObj->getProperty("prevTextureUniform").toString().toStdString();
    if (pass.prevTextureUniform.empty()) {
        pass.prevTextureUniform = UniformContract::kPrevTex;
    }

    pass.uniforms = passObj->getProperty("uniforms").clone();
    pass.clearColor = readColorVec4(passObj->getProperty("clearColor"), { 0.0f, 0.0f, 0.0f, 0.0f });
    pass.enableDepth = static_cast<bool>(passObj->getProperty("depth"));
    pass.blendMode = readBlendModeValue(passObj->getProperty("blendMode"));

    const auto opacityVar = passObj->getProperty("opacity");
    if (opacityVar.isDouble() || opacityVar.isInt() || opacityVar.isInt64()) {
        pass.opacity = std::clamp(static_cast<float>(opacityVar), 0.0f, 1.0f);
    }

    pass.chain = static_cast<bool>(passObj->getProperty("chain"));
    pass.composite = static_cast<bool>(passObj->getProperty("composite"));
    pass.blendOpId = passObj->getProperty("blendOpId").toString().toStdString();
    pass.blendParams = passObj->getProperty("blendParams").clone();

    if (pass.vertexSource.empty() || pass.fragmentSource.empty()) {
        errorOut = "shader pass missing source";
        return false;
    }

    return true;
}

inline bool parseSourceConfig(const juce::var& sourceVar, ParsedSourceConfig& source, std::string& errorOut) {
    auto* sourceObj = sourceVar.getDynamicObject();
    if (sourceObj == nullptr) {
        errorOut = "generator source payload must be an object";
        return false;
    }

    source.vertexSource = sourceObj->getProperty("vertexShader").toString().toStdString();
    source.fragmentSource = sourceObj->getProperty("fragmentShader").toString().toStdString();
    source.uniforms = sourceObj->getProperty("uniforms").clone();
    source.clearColor = readColorVec4(sourceObj->getProperty("clearColor"), { 0.0f, 0.0f, 0.0f, 1.0f });

    if (source.vertexSource.empty() || source.fragmentSource.empty()) {
        errorOut = "generator source missing shader source";
        return false;
    }
    return true;
}

inline std::string buildDescriptorSignature(const std::string& surfaceType,
                                            const std::string& sourceType,
                                            const std::vector<ParsedPassConfig>& passes,
                                            const ParsedSourceConfig* sourceConfig) {
    std::string signature;
    signature.reserve(256);
    signature += "surfaceType=" + surfaceType + "\n";
    signature += "sourceType=" + sourceType + "\n";
    if (sourceConfig != nullptr) {
        signature += "sourceVertex:\n" + sourceConfig->vertexSource + "\n";
        signature += "sourceFragment:\n" + sourceConfig->fragmentSource + "\n";
    }
    signature += "passCount=" + std::to_string(passes.size()) + "\n";

    for (std::size_t i = 0; i < passes.size(); ++i) {
        const auto& pass = passes[i];
        signature += "--pass=" + std::to_string(i) + "\n";
        signature += "vertex:\n" + pass.vertexSource + "\n";
        signature += "fragment:\n" + pass.fragmentSource + "\n";
        signature += "inputTextureUniform=" + pass.inputTextureUniform + "\n";
        signature += "prevTextureUniform=" + pass.prevTextureUniform + "\n";
        signature += std::string("enableDepth=") + (pass.enableDepth ? "1\n" : "0\n");
        signature += std::string("chain=") + (pass.chain ? "1\n" : "0\n");
        signature += std::string("composite=") + (pass.composite ? "1\n" : "0\n");
        signature += "blendOpId=" + pass.blendOpId + "\n";
    }

    return signature;
}

} // namespace manifold::shaders::surface_support
