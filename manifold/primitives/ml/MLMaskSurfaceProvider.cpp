#include "MLMaskSurfaceProvider.h"

#include "MLMaskSurfaceSupport.h"
#include "MLPipeline.h"
#include "../video/VideoCaptureManager.h"

#include <juce_opengl/juce_opengl.h>

#include <algorithm>
#include <cstdio>
#include <memory>
#include <string>
#include <unordered_map>
#include <unordered_set>

namespace manifold::ml {

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
        uint64_t sourceSequence = 0;
        uint64_t outputSequence = 0;
        std::string surfaceType;
        std::string modelPath;
        MLMaskRequest lastRequest;
        std::vector<unsigned char> rgba;
        std::vector<float> processedMask;
        std::string lastError;
    };

    PipelineFactory pipelineFactory;
    FrameSupplier frameSupplier;
    std::unordered_map<std::string, InferenceState> inferences;
    std::unordered_map<uint64_t, TextureState> textures;
    std::unordered_map<uint64_t, uint64_t> textureKeyByStableId;

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
    : MLMaskSurfaceProvider({}, {}) {
}

MLMaskSurfaceProvider::MLMaskSurfaceProvider(PipelineFactory pipelineFactory,
                                             FrameSupplier frameSupplier)
    : pImpl_(std::make_unique<Impl>()) {
    pImpl_->pipelineFactory = pipelineFactory
        ? std::move(pipelineFactory)
        : []() { return std::make_unique<MLPipeline>(); };
    pImpl_->frameSupplier = frameSupplier
        ? std::move(frameSupplier)
        : []() { return manifold::video::VideoCaptureManager::instance().getLatestFrameCopy(); };
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

    const auto request = parseMLMaskRequest(node.getCustomRenderPayload());
    if (request.modelPath.empty()) {
        return 0;
    }

    const auto frame = pImpl_->frameSupplier ? pImpl_->frameSupplier()
                                             : manifold::video::FrameData{};
    if (!frame.valid()) {
        return 0;
    }

    auto& inference = pImpl_->inferences[request.modelPath];
    if (inference.modelPath != request.modelPath || !inference.pipeline) {
        inference = Impl::InferenceState{};
        inference.modelPath = request.modelPath;
        inference.pipeline = pImpl_->pipelineFactory ? pImpl_->pipelineFactory()
                                                     : std::make_unique<MLPipeline>();
        if (!inference.pipeline || !inference.pipeline->load(request.modelPath)) {
            inference.lastError = inference.pipeline ? inference.pipeline->lastError()
                                                     : std::string("Pipeline factory returned null");
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
            std::fprintf(stderr, "[MLMaskSurfaceProvider] inference failed: %s\n",
                         inference.lastError.c_str());
            std::fflush(stderr);
            return 0;
        }

        const std::size_t maskSize = static_cast<std::size_t>(inference.maskWidth)
                                   * static_cast<std::size_t>(inference.maskHeight);
        if (inference.rawOutput.size() < maskSize) {
            inference.lastError = "Model output smaller than expected mask size";
            std::fprintf(stderr, "[MLMaskSurfaceProvider] %s (%zu < %zu)\n",
                         inference.lastError.c_str(), inference.rawOutput.size(), maskSize);
            std::fflush(stderr);
            return 0;
        }

        inference.applySigmoid = shouldApplyMLMaskSigmoid(inference.rawOutput,
                                                          maskSize,
                                                          request.useSigmoid);
        inference.inputFrameSequence = frame.sequence;
        ++inference.inferenceSequence;
    }

    const uint64_t textureKey = makeMLMaskTextureKey(surfaceType, request);
    auto& texture = pImpl_->textures[textureKey];
    pImpl_->textureKeyByStableId[node.getStableId()] = textureKey;

    const bool needsRebuild = texture.surfaceType != surfaceType
        || texture.modelPath != request.modelPath
        || texture.sourceSequence != inference.inferenceSequence
        || !mlMaskRequestsMatch(texture.lastRequest, request)
        || (surfaceType == "ml_mask" && (texture.width != inference.maskWidth || texture.height != inference.maskHeight))
        || (surfaceType == "ml_composite" && (texture.width != frame.width || texture.height != frame.height));

    if (!needsRebuild) {
        return static_cast<std::uintptr_t>(texture.texture);
    }

    const std::size_t maskSize = static_cast<std::size_t>(inference.maskWidth)
                               * static_cast<std::size_t>(inference.maskHeight);
    texture.processedMask = buildProcessedMLMask(inference.rawOutput,
                                                 maskSize,
                                                 request,
                                                 inference.applySigmoid);

    int outW = 0;
    int outH = 0;
    if (surfaceType == "ml_mask") {
        outW = inference.maskWidth;
        outH = inference.maskHeight;
        texture.rgba = buildMLMaskRgba(texture.processedMask);
    } else {
        outW = frame.width;
        outH = frame.height;
        texture.rgba = buildMLCompositeRgba(frame.rgba,
                                            frame.width,
                                            frame.height,
                                            texture.processedMask,
                                            inference.maskWidth,
                                            inference.maskHeight,
                                            request);
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
    const auto keyIt = pImpl_->textureKeyByStableId.find(stableId);
    if (keyIt == pImpl_->textureKeyByStableId.end()) {
        return false;
    }

    const auto it = pImpl_->textures.find(keyIt->second);
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
    std::unordered_set<uint64_t> activeTextureKeys;
    activeTextureKeys.reserve(touchedStableIds.size());

    for (const auto stableId : touchedStableIds) {
        const auto it = pImpl_->textureKeyByStableId.find(stableId);
        if (it != pImpl_->textureKeyByStableId.end()) {
            activeTextureKeys.insert(it->second);
        }
    }

    for (auto it = pImpl_->textures.begin(); it != pImpl_->textures.end();) {
        if (activeTextureKeys.find(it->first) == activeTextureKeys.end()) {
            Impl::releaseTexture(it->second);
            it = pImpl_->textures.erase(it);
        } else {
            ++it;
        }
    }

    for (auto it = pImpl_->textureKeyByStableId.begin(); it != pImpl_->textureKeyByStableId.end();) {
        if (touchedStableIds.find(it->first) == touchedStableIds.end()
                || pImpl_->textures.find(it->second) == pImpl_->textures.end()) {
            it = pImpl_->textureKeyByStableId.erase(it);
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
    pImpl_->textureKeyByStableId.clear();
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
