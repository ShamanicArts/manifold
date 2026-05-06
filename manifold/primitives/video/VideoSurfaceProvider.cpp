#include "VideoSurfaceProvider.h"

#include <juce_opengl/juce_opengl.h>
#include "../ui/RuntimeNode.h"

#include "VideoCaptureManager.h"
#include "VideoSampler.h"

#include <algorithm>
#include <cmath>
#include <functional>
#include <unordered_map>
#include <unordered_set>
#include <utility>

namespace manifold::video {

namespace {

struct SourceRequest {
    std::string source = "live";
    std::string samplerId;
    float position = 0.0f;
    bool hasExplicitPosition = false;
};

float varToFloat(const juce::var& value, float fallback) {
    if (value.isVoid() || value.isUndefined()) {
        return fallback;
    }
    return static_cast<float>(value);
}

SourceRequest parseSourceRequest(const RuntimeNode& node) {
    SourceRequest request;
    const auto payload = node.getCustomRenderPayload();
    auto* payloadObj = payload.getDynamicObject();
    if (payloadObj == nullptr) {
        return request;
    }

    const auto sourceValue = payloadObj->getProperty("source");
    if (!sourceValue.isVoid() && !sourceValue.isUndefined()) {
        request.source = sourceValue.toString().toStdString();
    }

    const auto samplerIdValue = payloadObj->getProperty("samplerId");
    if (!samplerIdValue.isVoid() && !samplerIdValue.isUndefined()) {
        request.samplerId = samplerIdValue.toString().toStdString();
    }

    const auto positionValue = payloadObj->getProperty("position");
    if (!positionValue.isVoid() && !positionValue.isUndefined()) {
        request.position = std::clamp(varToFloat(positionValue, 0.0f), 0.0f, 1.0f);
        request.hasExplicitPosition = true;
    }

    // Compatibility with early payload sketches that only supplied samplerId.
    if (!request.samplerId.empty() && request.source == "live") {
        request.source = "sampler";
    }

    return request;
}

std::uint64_t hashStringToU64(const std::string& value) {
    return static_cast<std::uint64_t>(std::hash<std::string>{}(value));
}

} // namespace

struct VideoSurfaceProvider::Impl {
    struct TextureState {
        unsigned int texture = 0;
        int width = 0;
        int height = 0;
        uint64_t sequence = 0;
        int64_t lastPrepareStampUs = -1;
        std::string sourceSignature;
    };

    std::unordered_map<uint64_t, TextureState> states;
    std::unordered_map<uint64_t, uint64_t> latestStateKeyByStableId;

    static bool shouldShareTextureAcrossNodes(const SourceRequest& request) {
        return request.source == "live";
    }

    static std::string makeSourceSignature(const SourceRequest& request) {
        std::string signature = request.source;
        if (request.source == "sampler") {
            signature += ":" + request.samplerId;
        }
        return signature;
    }

    static uint64_t makeStateKey(uint64_t stableId, const SourceRequest& request) {
        std::string signature = makeSourceSignature(request);
        if (!shouldShareTextureAcrossNodes(request)) {
            signature += "|node:" + std::to_string(stableId);
        }
        return hashStringToU64(signature);
    }

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
        state.sequence = 0;
    }

    static bool uploadFrame(TextureState& state, const FrameData& frame) {
        if (!frame.valid() || !ensureTexture(state)) {
            return false;
        }

        const bool dimensionsChanged = state.width != frame.width || state.height != frame.height;
        const bool sequenceChanged = state.sequence != frame.sequence;
        if (!dimensionsChanged && !sequenceChanged) {
            return true;
        }

        juce::gl::glBindTexture(juce::gl::GL_TEXTURE_2D, state.texture);
        if (dimensionsChanged) {
            juce::gl::glTexImage2D(juce::gl::GL_TEXTURE_2D,
                                   0,
                                   juce::gl::GL_RGBA8,
                                   frame.width,
                                   frame.height,
                                   0,
                                   juce::gl::GL_RGBA,
                                   juce::gl::GL_UNSIGNED_BYTE,
                                   frame.rgba.data());
        } else {
            juce::gl::glTexSubImage2D(juce::gl::GL_TEXTURE_2D,
                                      0,
                                      0,
                                      0,
                                      frame.width,
                                      frame.height,
                                      juce::gl::GL_RGBA,
                                      juce::gl::GL_UNSIGNED_BYTE,
                                      frame.rgba.data());
        }
        juce::gl::glBindTexture(juce::gl::GL_TEXTURE_2D, 0);

        state.width = frame.width;
        state.height = frame.height;
        state.sequence = frame.sequence;
        return true;
    }
};

VideoSurfaceProvider::VideoSurfaceProvider()
    : pImpl_(std::make_unique<Impl>()) {
}

VideoSurfaceProvider::~VideoSurfaceProvider() {
    releaseAll();
}

bool VideoSurfaceProvider::handlesType(const std::string& surfaceType) const {
    return surfaceType == "video_input";
}

std::uintptr_t VideoSurfaceProvider::prepareTexture(const RuntimeNode& node,
                                                     int width,
                                                     int height,
                                                     double timeSeconds) {
    if (node.getStableId() == 0 || width <= 0 || height <= 0) {
        return 0;
    }

    const auto request = parseSourceRequest(node);
    auto& impl = *pImpl_;
    const uint64_t stateKey = Impl::makeStateKey(node.getStableId(), request);
    auto& state = impl.states[stateKey];
    state.sourceSignature = Impl::makeSourceSignature(request);
    impl.latestStateKeyByStableId[node.getStableId()] = stateKey;

    const auto renderStampUs = static_cast<int64_t>(std::llround(timeSeconds * 1000000.0));
    if (Impl::shouldShareTextureAcrossNodes(request)
        && state.texture != 0
        && state.lastPrepareStampUs == renderStampUs) {
        return static_cast<std::uintptr_t>(state.texture);
    }

    FrameData frame;
    if (request.source == "sampler") {
        if (request.samplerId.empty()) {
            return 0;
        }
        const auto sampler = VideoSamplerRegistry::instance().getSampler(request.samplerId);
        if (!sampler) {
            return 0;
        }
        const float position = request.hasExplicitPosition
            ? request.position
            : sampler->getNormalizedPosition();
        frame = sampler->getFrameAtNormalizedPosition(position);
    } else {
        frame = VideoCaptureManager::instance().getLatestFrameCopy();
    }

    if (!frame.valid()) {
        return 0;
    }

    if (!Impl::uploadFrame(state, frame)) {
        return 0;
    }

    state.lastPrepareStampUs = renderStampUs;
    return static_cast<std::uintptr_t>(state.texture);
}

bool VideoSurfaceProvider::getSurfaceInfo(uint64_t stableId,
                                          int& w,
                                          int& h,
                                          uint64_t& seq) const {
    const auto& impl = *pImpl_;
    const auto latestIt = impl.latestStateKeyByStableId.find(stableId);
    if (latestIt == impl.latestStateKeyByStableId.end()) {
        return false;
    }

    const auto stateIt = impl.states.find(latestIt->second);
    if (stateIt == impl.states.end()) {
        return false;
    }

    const auto& state = stateIt->second;
    w = state.width;
    h = state.height;
    seq = state.sequence;
    return state.width > 0 && state.height > 0;
}

void VideoSurfaceProvider::prune(const std::unordered_set<uint64_t>& touchedStableIds) {
    auto& impl = *pImpl_;
    std::unordered_set<uint64_t> activeStateKeys;
    activeStateKeys.reserve(touchedStableIds.size());

    for (const auto stableId : touchedStableIds) {
        const auto it = impl.latestStateKeyByStableId.find(stableId);
        if (it != impl.latestStateKeyByStableId.end()) {
            activeStateKeys.insert(it->second);
        }
    }

    for (auto it = impl.states.begin(); it != impl.states.end();) {
        if (activeStateKeys.find(it->first) == activeStateKeys.end()) {
            Impl::releaseTexture(it->second);
            it = impl.states.erase(it);
        } else {
            ++it;
        }
    }

    for (auto it = impl.latestStateKeyByStableId.begin(); it != impl.latestStateKeyByStableId.end();) {
        if (touchedStableIds.find(it->first) == touchedStableIds.end() || impl.states.find(it->second) == impl.states.end()) {
            it = impl.latestStateKeyByStableId.erase(it);
        } else {
            ++it;
        }
    }
}

void VideoSurfaceProvider::releaseAll() {
    auto& impl = *pImpl_;

    for (auto& entry : impl.states) {
        Impl::releaseTexture(entry.second);
    }
    impl.states.clear();
    impl.latestStateKeyByStableId.clear();
}

int64_t VideoSurfaceProvider::estimateStateBytes() const {
    const auto& impl = *pImpl_;
    int64_t total = static_cast<int64_t>(sizeof(Impl));
    for (const auto& entry : impl.states) {
        const auto& state = entry.second;
        total += static_cast<int64_t>(sizeof(Impl::TextureState));
        total += static_cast<int64_t>(state.sourceSignature.capacity());
    }
    return total;
}

void VideoSurfaceProvider::getOwnedGpuBytes(int64_t& colorBytes, int64_t& depthBytes) const {
    const auto& impl = *pImpl_;
    colorBytes = 0;
    for (const auto& entry : impl.states) {
        const auto& state = entry.second;
        if (state.texture != 0 && state.width > 0 && state.height > 0) {
            colorBytes += static_cast<int64_t>(state.width) * static_cast<int64_t>(state.height) * 4;
        }
    }
    depthBytes = 0;
}

} // namespace manifold::video
