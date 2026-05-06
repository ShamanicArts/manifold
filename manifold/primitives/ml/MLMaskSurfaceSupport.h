#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <string>
#include <unordered_set>
#include <vector>

#include <juce_core/juce_core.h>

namespace manifold::ml {

struct MLMaskRequest {
    std::string modelPath;
    float gain = 1.0f;
    bool useSigmoid = true;
    float threshold = 0.5f;
    float feather = 0.15f;
    bool invert = false;
    float background = 0.10f;
};

inline float clampMLMask01(float v) {
    return std::clamp(v, 0.0f, 1.0f);
}

inline float sigmoidMLMask(float x) {
    if (x >= 0.0f) {
        const float z = std::exp(-x);
        return 1.0f / (1.0f + z);
    }
    const float z = std::exp(x);
    return z / (1.0f + z);
}

inline float smoothstepMLMask(float edge0, float edge1, float x) {
    if (edge1 <= edge0) {
        return x >= edge1 ? 1.0f : 0.0f;
    }
    const float t = clampMLMask01((x - edge0) / (edge1 - edge0));
    return t * t * (3.0f - 2.0f * t);
}

inline MLMaskRequest parseMLMaskRequest(const juce::var& payload) {
    MLMaskRequest request;
    if (auto* obj = payload.getDynamicObject(); obj != nullptr) {
        const auto modelPath = obj->getProperty("modelPath");
        if (!modelPath.isVoid() && !modelPath.isUndefined()) {
            request.modelPath = modelPath.toString().toStdString();
        }

        const auto gain = obj->getProperty("gain");
        if (!gain.isVoid() && !gain.isUndefined()) {
            request.gain = static_cast<float>(gain);
        }

        const auto useSigmoid = obj->getProperty("useSigmoid");
        if (!useSigmoid.isVoid() && !useSigmoid.isUndefined()) {
            request.useSigmoid = static_cast<bool>(useSigmoid);
        }

        const auto threshold = obj->getProperty("threshold");
        if (!threshold.isVoid() && !threshold.isUndefined()) {
            request.threshold = static_cast<float>(threshold);
        }

        const auto feather = obj->getProperty("feather");
        if (!feather.isVoid() && !feather.isUndefined()) {
            request.feather = static_cast<float>(feather);
        }

        const auto invert = obj->getProperty("invert");
        if (!invert.isVoid() && !invert.isUndefined()) {
            request.invert = static_cast<bool>(invert);
        }

        const auto background = obj->getProperty("background");
        if (!background.isVoid() && !background.isUndefined()) {
            request.background = static_cast<float>(background);
        }
    }

    request.gain = std::max(0.01f, request.gain);
    request.threshold = clampMLMask01(request.threshold);
    request.feather = clampMLMask01(request.feather);
    request.background = clampMLMask01(request.background);
    return request;
}

inline bool mlMaskRequestsMatch(const MLMaskRequest& a, const MLMaskRequest& b) {
    return a.modelPath == b.modelPath
        && std::abs(a.gain - b.gain) < 1.0e-6f
        && a.useSigmoid == b.useSigmoid
        && std::abs(a.threshold - b.threshold) < 1.0e-6f
        && std::abs(a.feather - b.feather) < 1.0e-6f
        && a.invert == b.invert
        && std::abs(a.background - b.background) < 1.0e-6f;
}

inline bool shouldApplyMLMaskSigmoid(const std::vector<float>& rawOutput,
                                     std::size_t maskSize,
                                     bool useSigmoid) {
    if (!useSigmoid || rawOutput.empty() || maskSize == 0) {
        return false;
    }
    const std::size_t safeMaskSize = std::min(maskSize, rawOutput.size());
    float minValue = rawOutput[0];
    float maxValue = rawOutput[0];
    for (std::size_t i = 1; i < safeMaskSize; ++i) {
        minValue = std::min(minValue, rawOutput[i]);
        maxValue = std::max(maxValue, rawOutput[i]);
    }
    return minValue < 0.0f || maxValue > 1.0f;
}

inline float postprocessMLMaskValue(float rawValue,
                                    const MLMaskRequest& request,
                                    bool applySigmoid) {
    float value = rawValue;
    if (applySigmoid) {
        value = sigmoidMLMask(value);
    }
    value = clampMLMask01(value * request.gain);

    const float feather = std::max(0.0f, request.feather);
    if (feather > 0.0f) {
        const float half = feather * 0.5f;
        value = smoothstepMLMask(request.threshold - half, request.threshold + half, value);
    } else {
        value = value >= request.threshold ? 1.0f : 0.0f;
    }

    if (request.invert) {
        value = 1.0f - value;
    }

    return clampMLMask01(value);
}

inline float sampleMLMaskNearest(const std::vector<float>& mask,
                                 int maskW,
                                 int maskH,
                                 int dstX,
                                 int dstY,
                                 int dstW,
                                 int dstH) {
    if (mask.empty() || maskW <= 0 || maskH <= 0 || dstW <= 0 || dstH <= 0) {
        return 0.0f;
    }

    const float u = (static_cast<float>(dstX) + 0.5f) / static_cast<float>(dstW);
    const float v = (static_cast<float>(dstY) + 0.5f) / static_cast<float>(dstH);
    const int sx = std::clamp(static_cast<int>(u * static_cast<float>(maskW)), 0, maskW - 1);
    const int sy = std::clamp(static_cast<int>(v * static_cast<float>(maskH)), 0, maskH - 1);
    return mask[static_cast<std::size_t>(sy) * static_cast<std::size_t>(maskW) + static_cast<std::size_t>(sx)];
}

inline std::uint64_t hashMLMaskStringToU64(const std::string& value) {
    return static_cast<std::uint64_t>(std::hash<std::string>{}(value));
}

inline void appendMLMaskQuantizedFloat(std::string& target, float value) {
    target += std::to_string(static_cast<long long>(std::llround(static_cast<double>(value) * 100000.0)));
}

inline std::uint64_t makeMLMaskTextureKey(const std::string& surfaceType,
                                          const MLMaskRequest& request) {
    std::string signature = surfaceType;
    signature += "|" + request.modelPath;
    signature += request.useSigmoid ? "|sig:1" : "|sig:0";
    signature += request.invert ? "|inv:1" : "|inv:0";
    signature += "|gain:";
    appendMLMaskQuantizedFloat(signature, request.gain);
    signature += "|threshold:";
    appendMLMaskQuantizedFloat(signature, request.threshold);
    signature += "|feather:";
    appendMLMaskQuantizedFloat(signature, request.feather);
    signature += "|background:";
    appendMLMaskQuantizedFloat(signature, request.background);
    return hashMLMaskStringToU64(signature);
}

inline std::vector<float> buildProcessedMLMask(const std::vector<float>& rawOutput,
                                               std::size_t maskSize,
                                               const MLMaskRequest& request,
                                               bool applySigmoid) {
    const std::size_t safeSize = std::min(maskSize, rawOutput.size());
    std::vector<float> processedMask(safeSize);
    for (std::size_t i = 0; i < safeSize; ++i) {
        processedMask[i] = postprocessMLMaskValue(rawOutput[i], request, applySigmoid);
    }
    return processedMask;
}

inline std::vector<unsigned char> buildMLMaskRgba(const std::vector<float>& processedMask) {
    std::vector<unsigned char> rgba(processedMask.size() * 4u, 0);
    for (std::size_t i = 0; i < processedMask.size(); ++i) {
        const auto byteValue = static_cast<unsigned char>(std::lround(processedMask[i] * 255.0f));
        const std::size_t base = i * 4u;
        rgba[base + 0] = byteValue;
        rgba[base + 1] = byteValue;
        rgba[base + 2] = byteValue;
        rgba[base + 3] = 255;
    }
    return rgba;
}

inline std::vector<unsigned char> buildMLCompositeRgba(const std::vector<unsigned char>& frameRgba,
                                                       int frameW,
                                                       int frameH,
                                                       const std::vector<float>& processedMask,
                                                       int maskW,
                                                       int maskH,
                                                       const MLMaskRequest& request) {
    const std::size_t pixelCount = static_cast<std::size_t>(frameW) * static_cast<std::size_t>(frameH);
    std::vector<unsigned char> rgba(pixelCount * 4u, 0);
    for (int y = 0; y < frameH; ++y) {
        for (int x = 0; x < frameW; ++x) {
            const float alpha = sampleMLMaskNearest(processedMask, maskW, maskH, x, y, frameW, frameH);
            const std::size_t pixelIndex = static_cast<std::size_t>(y) * static_cast<std::size_t>(frameW)
                                         + static_cast<std::size_t>(x);
            const std::size_t base = pixelIndex * 4u;
            if (request.background <= 0.0f) {
                rgba[base + 0] = frameRgba[base + 0];
                rgba[base + 1] = frameRgba[base + 1];
                rgba[base + 2] = frameRgba[base + 2];
                rgba[base + 3] = static_cast<unsigned char>(std::lround(alpha * 255.0f));
            } else {
                const float mixFactor = request.background + alpha * (1.0f - request.background);
                rgba[base + 0] = static_cast<unsigned char>(std::lround(static_cast<float>(frameRgba[base + 0]) * mixFactor));
                rgba[base + 1] = static_cast<unsigned char>(std::lround(static_cast<float>(frameRgba[base + 1]) * mixFactor));
                rgba[base + 2] = static_cast<unsigned char>(std::lround(static_cast<float>(frameRgba[base + 2]) * mixFactor));
                rgba[base + 3] = 255;
            }
        }
    }
    return rgba;
}

} // namespace manifold::ml
