#include "MLMaskSurfaceProvider.h"

#include "MLPipeline.h"
#include "../video/VideoCaptureManager.h"

#include <juce_opengl/juce_opengl.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <memory>
#include <string>
#include <unordered_map>

namespace manifold::ml {
namespace {

struct Request {
    std::string modelPath;
    float gain = 1.0f;
    bool useSigmoid = true;
    float threshold = 0.5f;
    float feather = 0.15f;
    bool invert = false;
    float background = 0.10f;
};

float clamp01(float v) {
    return std::clamp(v, 0.0f, 1.0f);
}

float sigmoid(float x) {
    if (x >= 0.0f) {
        const float z = std::exp(-x);
        return 1.0f / (1.0f + z);
    }
    const float z = std::exp(x);
    return z / (1.0f + z);
}

float smoothstep(float edge0, float edge1, float x) {
    if (edge1 <= edge0) {
        return x >= edge1 ? 1.0f : 0.0f;
    }
    const float t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3.0f - 2.0f * t);
}

Request parseRequest(const RuntimeNode& node) {
    Request request;
    const auto payload = node.getCustomRenderPayload();
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
    request.threshold = clamp01(request.threshold);
    request.feather = clamp01(request.feather);
    request.background = clamp01(request.background);
    return request;
}

bool requestMatches(const Request& a, const Request& b) {
    return a.modelPath == b.modelPath
        && std::abs(a.gain - b.gain) < 1.0e-6f
        && a.useSigmoid == b.useSigmoid
        && std::abs(a.threshold - b.threshold) < 1.0e-6f
        && std::abs(a.feather - b.feather) < 1.0e-6f
        && a.invert == b.invert
        && std::abs(a.background - b.background) < 1.0e-6f;
}

float postprocessMaskValue(float rawValue,
                           const Request& request,
                           bool applySigmoid) {
    float value = rawValue;
    if (applySigmoid) {
        value = sigmoid(value);
    }
    value = clamp01(value * request.gain);

    const float feather = std::max(0.0f, request.feather);
    if (feather > 0.0f) {
        const float half = feather * 0.5f;
        value = smoothstep(request.threshold - half, request.threshold + half, value);
    } else {
        value = value >= request.threshold ? 1.0f : 0.0f;
    }

    if (request.invert) {
        value = 1.0f - value;
    }

    return clamp01(value);
}

float sampleMaskNearest(const std::vector<float>& mask,
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

} // namespace

struct MLMaskSurfaceProvider::Impl {
    struct InferenceState {
        std::string modelPath;
        std::unique_ptr<MLPipeline> pipeline;
        uint64_t inputFrameSequence = 0;
        uint64_t inferenceSequence = 0;
        std::vector<float> rawOutput;
        int maskWidth = 0;
        int maskHeight = 0;
        bool applySigmoid = true;
        std::string lastError;
    };

    struct TextureState {
        unsigned int texture = 0;
        int width = 0;
        int height = 0;
        uint64_t stableId = 0;
        uint64_t sourceSequence = 0;
        uint64_t outputSequence = 0;
        std::string surfaceType;
        std::string modelPath;
        Request lastRequest;
        std::vector<unsigned char> rgba;
        std::vector<float> processedMask;
        std::string lastError;
    };

    std::unordered_map<std::string, InferenceState> inferences;
    std::unordered_map<uint64_t, TextureState> textures;

    static bool ensureTexture(TextureState& state) {
        if (state.texture != 0) {
            return true;
        }

        juce::gl::glGenTextures(1, &state.texture);
        if (state.texture == 0) {
            return false;
        }

        juce::gl::glBindTexture(juce::gl::GL_TEXTURE_2D, state.texture);
        juce::gl::glTexParameteri(juce::gl::GL_TEXTURE_2D, juce::gl::GL_TEXTURE_MIN_FILTER, juce::gl::GL_LINEAR);
        juce::gl::glTexParameteri(juce::gl::GL_TEXTURE_2D, juce::gl::GL_TEXTURE_MAG_FILTER, juce::gl::GL_LINEAR);
        juce::gl::glTexParameteri(juce::gl::GL_TEXTURE_2D, juce::gl::GL_TEXTURE_WRAP_S, juce::gl::GL_CLAMP_TO_EDGE);
        juce::gl::glTexParameteri(juce::gl::GL_TEXTURE_2D, juce::gl::GL_TEXTURE_WRAP_T, juce::gl::GL_CLAMP_TO_EDGE);
        juce::gl::glBindTexture(juce::gl::GL_TEXTURE_2D, 0);
        return true;
    }

    static void releaseTexture(TextureState& state) {
        if (state.texture != 0) {
            juce::gl::glDeleteTextures(1, &state.texture);
        }
        state.texture = 0;
        state.width = 0;
        state.height = 0;
        state.sourceSequence = 0;
        state.outputSequence = 0;
        state.rgba.clear();
        state.processedMask.clear();
    }
};

MLMaskSurfaceProvider::MLMaskSurfaceProvider()
    : pImpl_(std::make_unique<Impl>()) {
}

MLMaskSurfaceProvider::~MLMaskSurfaceProvider() {
    releaseAll();
}

bool MLMaskSurfaceProvider::handlesType(const std::string& surfaceType) const {
    return surfaceType == "ml_mask" || surfaceType == "ml_composite";
}

std::uintptr_t MLMaskSurfaceProvider::prepareTexture(const RuntimeNode& node,
                                                     int width,
                                                     int height,
                                                     double) {
    juce::ignoreUnused(width, height);

    const auto surfaceType = node.getCustomSurfaceType();
    if (node.getStableId() == 0 || !handlesType(surfaceType)) {
        return 0;
    }

    const auto request = parseRequest(node);
    if (request.modelPath.empty()) {
        return 0;
    }

    const auto frame = manifold::video::VideoCaptureManager::instance().getLatestFrameCopy();
    if (!frame.valid()) {
        return 0;
    }

    auto& inference = pImpl_->inferences[request.modelPath];
    if (inference.modelPath != request.modelPath || !inference.pipeline) {
        inference = Impl::InferenceState{};
        inference.modelPath = request.modelPath;
        inference.pipeline = std::make_unique<MLPipeline>();
        if (!inference.pipeline->load(request.modelPath)) {
            inference.lastError = inference.pipeline->lastError();
            std::fprintf(stderr, "[MLMaskSurfaceProvider] failed to load '%s': %s\n",
                         request.modelPath.c_str(), inference.lastError.c_str());
            std::fflush(stderr);
            inference.pipeline.reset();
            return 0;
        }
        inference.maskWidth = inference.pipeline->inputWidth();
        inference.maskHeight = inference.pipeline->inputHeight();
    }

    if (!inference.pipeline || !inference.pipeline->isLoaded()) {
        return 0;
    }

    if (inference.inputFrameSequence != frame.sequence) {
        if (!inference.pipeline->infer(frame.rgba.data(), frame.width, frame.height, inference.rawOutput)) {
            inference.lastError = inference.pipeline->lastError();
            std::fprintf(stderr, "[MLMaskSurfaceProvider] inference failed: %s\n", inference.lastError.c_str());
            std::fflush(stderr);
            return 0;
        }

        const std::size_t maskSize = static_cast<std::size_t>(inference.maskWidth) * static_cast<std::size_t>(inference.maskHeight);
        if (inference.rawOutput.size() < maskSize) {
            inference.lastError = "Model output smaller than expected mask size";
            std::fprintf(stderr, "[MLMaskSurfaceProvider] %s (%zu < %zu)\n",
                         inference.lastError.c_str(), inference.rawOutput.size(), maskSize);
            std::fflush(stderr);
            return 0;
        }

        float minValue = inference.rawOutput[0];
        float maxValue = inference.rawOutput[0];
        for (std::size_t i = 1; i < maskSize; ++i) {
            minValue = std::min(minValue, inference.rawOutput[i]);
            maxValue = std::max(maxValue, inference.rawOutput[i]);
        }
        inference.applySigmoid = request.useSigmoid && (minValue < 0.0f || maxValue > 1.0f);
        inference.inputFrameSequence = frame.sequence;
        ++inference.inferenceSequence;
    }

    auto& texture = pImpl_->textures[node.getStableId()];
    texture.stableId = node.getStableId();

    const bool needsRebuild = texture.surfaceType != surfaceType
        || texture.modelPath != request.modelPath
        || texture.sourceSequence != inference.inferenceSequence
        || !requestMatches(texture.lastRequest, request)
        || (surfaceType == "ml_mask" && (texture.width != inference.maskWidth || texture.height != inference.maskHeight))
        || (surfaceType == "ml_composite" && (texture.width != frame.width || texture.height != frame.height));

    if (!needsRebuild) {
        return static_cast<std::uintptr_t>(texture.texture);
    }

    const std::size_t maskSize = static_cast<std::size_t>(inference.maskWidth) * static_cast<std::size_t>(inference.maskHeight);
    texture.processedMask.resize(maskSize);
    for (std::size_t i = 0; i < maskSize; ++i) {
        texture.processedMask[i] = postprocessMaskValue(inference.rawOutput[i], request, inference.applySigmoid);
    }

    int outW = 0;
    int outH = 0;
    if (surfaceType == "ml_mask") {
        outW = inference.maskWidth;
        outH = inference.maskHeight;
        texture.rgba.resize(maskSize * 4);
        for (std::size_t i = 0; i < maskSize; ++i) {
            const auto byteValue = static_cast<unsigned char>(std::lround(texture.processedMask[i] * 255.0f));
            const std::size_t pixelBase = i * 4;
            texture.rgba[pixelBase + 0] = byteValue;
            texture.rgba[pixelBase + 1] = byteValue;
            texture.rgba[pixelBase + 2] = byteValue;
            texture.rgba[pixelBase + 3] = 255;
        }
    } else {
        outW = frame.width;
        outH = frame.height;
        const std::size_t pixelCount = static_cast<std::size_t>(outW) * static_cast<std::size_t>(outH);
        texture.rgba.resize(pixelCount * 4);
        for (int y = 0; y < outH; ++y) {
            for (int x = 0; x < outW; ++x) {
                const float alpha = sampleMaskNearest(texture.processedMask,
                                                      inference.maskWidth,
                                                      inference.maskHeight,
                                                      x,
                                                      y,
                                                      outW,
                                                      outH);
                const std::size_t pixelIndex = static_cast<std::size_t>(y) * static_cast<std::size_t>(outW) + static_cast<std::size_t>(x);
                const std::size_t frameBase = pixelIndex * 4;
                const std::size_t outBase = pixelIndex * 4;
                if (request.background <= 0.0f) {
                    // Transparent background: output RGB = original frame, A = mask alpha
                    texture.rgba[outBase + 0] = frame.rgba[frameBase + 0];
                    texture.rgba[outBase + 1] = frame.rgba[frameBase + 1];
                    texture.rgba[outBase + 2] = frame.rgba[frameBase + 2];
                    texture.rgba[outBase + 3] = static_cast<unsigned char>(std::lround(alpha * 255.0f));
                } else {
                    const float mixFactor = request.background + alpha * (1.0f - request.background);
                    texture.rgba[outBase + 0] = static_cast<unsigned char>(std::lround(static_cast<float>(frame.rgba[frameBase + 0]) * mixFactor));
                    texture.rgba[outBase + 1] = static_cast<unsigned char>(std::lround(static_cast<float>(frame.rgba[frameBase + 1]) * mixFactor));
                    texture.rgba[outBase + 2] = static_cast<unsigned char>(std::lround(static_cast<float>(frame.rgba[frameBase + 2]) * mixFactor));
                    texture.rgba[outBase + 3] = 255;
                }
            }
        }
    }

    if (!Impl::ensureTexture(texture)) {
        return 0;
    }

    juce::gl::glBindTexture(juce::gl::GL_TEXTURE_2D, texture.texture);
    if (texture.width != outW || texture.height != outH) {
        juce::gl::glTexImage2D(juce::gl::GL_TEXTURE_2D,
                               0,
                               juce::gl::GL_RGBA8,
                               outW,
                               outH,
                               0,
                               juce::gl::GL_RGBA,
                               juce::gl::GL_UNSIGNED_BYTE,
                               texture.rgba.data());
    } else {
        juce::gl::glTexSubImage2D(juce::gl::GL_TEXTURE_2D,
                                  0,
                                  0,
                                  0,
                                  outW,
                                  outH,
                                  juce::gl::GL_RGBA,
                                  juce::gl::GL_UNSIGNED_BYTE,
                                  texture.rgba.data());
    }
    juce::gl::glBindTexture(juce::gl::GL_TEXTURE_2D, 0);

    texture.width = outW;
    texture.height = outH;
    texture.surfaceType = surfaceType;
    texture.modelPath = request.modelPath;
    texture.lastRequest = request;
    texture.sourceSequence = inference.inferenceSequence;
    ++texture.outputSequence;

    return static_cast<std::uintptr_t>(texture.texture);
}

bool MLMaskSurfaceProvider::getSurfaceInfo(uint64_t stableId,
                                           int& w,
                                           int& h,
                                           uint64_t& seq) const {
    const auto it = pImpl_->textures.find(stableId);
    if (it == pImpl_->textures.end()) {
        return false;
    }

    const auto& state = it->second;
    w = state.width;
    h = state.height;
    seq = state.outputSequence;
    return state.texture != 0 && w > 0 && h > 0;
}

void MLMaskSurfaceProvider::prune(const std::unordered_set<uint64_t>& touchedStableIds) {
    for (auto it = pImpl_->textures.begin(); it != pImpl_->textures.end();) {
        if (touchedStableIds.find(it->first) == touchedStableIds.end()) {
            Impl::releaseTexture(it->second);
            it = pImpl_->textures.erase(it);
        } else {
            ++it;
        }
    }
}

void MLMaskSurfaceProvider::releaseAll() {
    for (auto& [_, state] : pImpl_->textures) {
        Impl::releaseTexture(state);
    }
    pImpl_->textures.clear();
    pImpl_->inferences.clear();
}

int64_t MLMaskSurfaceProvider::estimateStateBytes() const {
    int64_t total = static_cast<int64_t>(sizeof(Impl));
    for (const auto& [_, inference] : pImpl_->inferences) {
        total += static_cast<int64_t>(sizeof(Impl::InferenceState));
        total += static_cast<int64_t>(inference.modelPath.capacity());
        total += static_cast<int64_t>(inference.lastError.capacity());
        total += static_cast<int64_t>(inference.rawOutput.capacity() * sizeof(float));
    }
    for (const auto& [_, state] : pImpl_->textures) {
        total += static_cast<int64_t>(sizeof(Impl::TextureState));
        total += static_cast<int64_t>(state.surfaceType.capacity());
        total += static_cast<int64_t>(state.modelPath.capacity());
        total += static_cast<int64_t>(state.lastError.capacity());
        total += static_cast<int64_t>(state.rgba.capacity());
        total += static_cast<int64_t>(state.processedMask.capacity() * sizeof(float));
    }
    return total;
}

void MLMaskSurfaceProvider::getOwnedGpuBytes(int64_t& colorBytes, int64_t& depthBytes) const {
    colorBytes = 0;
    for (const auto& [_, state] : pImpl_->textures) {
        if (state.texture != 0 && state.width > 0 && state.height > 0) {
            colorBytes += static_cast<int64_t>(state.width) * static_cast<int64_t>(state.height) * 4;
        }
    }
    depthBytes = 0;
}

} // namespace manifold::ml
