#pragma once

#include <juce_core/juce_core.h>

#include <array>
#include <string>

namespace manifold::sources::generated_source_support {

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
                                          std::array<float, 4> fallback = { 0.0f, 0.0f, 0.0f, 1.0f }) {
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

struct ParsedSourceDescriptor {
    std::string vertexSource;
    std::string fragmentSource;
    juce::var uniforms;
    std::array<float, 4> clearColor { 0.0f, 0.0f, 0.0f, 1.0f };
    std::string signature;
};

inline std::string buildSourceSignature(const std::string& vertexSource,
                                        const std::string& fragmentSource) {
    std::string signature;
    signature.reserve(vertexSource.size() + fragmentSource.size() + 16);
    signature += vertexSource;
    signature += "\n--frag--\n";
    signature += fragmentSource;
    return signature;
}

inline bool parseSourceDescriptor(const std::string& surfaceType,
                                  const juce::var& payload,
                                  ParsedSourceDescriptor& descriptor,
                                  std::string& errorOut) {
    auto* payloadObj = payload.getDynamicObject();
    if (payloadObj == nullptr) {
        errorOut = "source payload must be an object";
        return false;
    }

    juce::var sourceVar;
    if (surfaceType == "generated_source") {
        sourceVar = payload;
    } else if (surfaceType == "gpu_shader") {
        const auto sourceType = payloadObj->getProperty("sourceType").toString().toStdString();
        if (sourceType != "generated_source") {
            errorOut = "gpu_shader payload is not a generated source";
            return false;
        }
        sourceVar = payloadObj->getProperty("sourceShader");
    } else {
        errorOut = "unsupported surface type";
        return false;
    }

    auto* sourceObj = sourceVar.getDynamicObject();
    if (sourceObj == nullptr) {
        errorOut = "generated source payload must be an object";
        return false;
    }

    descriptor.vertexSource = sourceObj->getProperty("vertexShader").toString().toStdString();
    descriptor.fragmentSource = sourceObj->getProperty("fragmentShader").toString().toStdString();
    descriptor.uniforms = sourceObj->getProperty("uniforms").clone();
    descriptor.clearColor = readColorVec4(sourceObj->getProperty("clearColor"), { 0.0f, 0.0f, 0.0f, 1.0f });

    if (descriptor.vertexSource.empty() || descriptor.fragmentSource.empty()) {
        errorOut = "generated source missing shader source";
        return false;
    }

    descriptor.signature = buildSourceSignature(descriptor.vertexSource, descriptor.fragmentSource);
    return true;
}

} // namespace manifold::sources::generated_source_support
