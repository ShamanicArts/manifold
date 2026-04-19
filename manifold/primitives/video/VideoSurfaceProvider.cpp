#include "VideoSurfaceProvider.h"

#include <juce_opengl/juce_opengl.h>
#include "../ui/RuntimeNode.h"

#include "VideoCaptureManager.h"

#include <algorithm>

namespace manifold::video {

struct VideoSurfaceProvider::Impl {
    // GL texture handle and metadata
    unsigned int texture = 0;
    int width = 0;
    int height = 0;
    uint64_t sequence = 0;

    // Video frame data
    FrameData latestFrame;
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
                                                     double) {
    if (node.getStableId() == 0 || width <= 0 || height <= 0) {
        return 0;
    }

    auto& impl = *pImpl_;

    // Get latest frame from capture manager
    impl.latestFrame = VideoCaptureManager::instance().getLatestFrameCopy();
    if (!impl.latestFrame.valid()) {
        return 0;
    }

    // Create texture if needed
    if (impl.texture == 0) {
        juce::gl::glGenTextures(1, &impl.texture);
        if (impl.texture == 0) {
            return 0;
        }
        juce::gl::glBindTexture(juce::gl::GL_TEXTURE_2D, impl.texture);
        juce::gl::glTexParameteri(juce::gl::GL_TEXTURE_2D, juce::gl::GL_TEXTURE_MIN_FILTER, juce::gl::GL_LINEAR);
        juce::gl::glTexParameteri(juce::gl::GL_TEXTURE_2D, juce::gl::GL_TEXTURE_MAG_FILTER, juce::gl::GL_LINEAR);
        juce::gl::glTexParameteri(juce::gl::GL_TEXTURE_2D, juce::gl::GL_TEXTURE_WRAP_S, juce::gl::GL_CLAMP_TO_EDGE);
        juce::gl::glTexParameteri(juce::gl::GL_TEXTURE_2D, juce::gl::GL_TEXTURE_WRAP_T, juce::gl::GL_CLAMP_TO_EDGE);
        juce::gl::glBindTexture(juce::gl::GL_TEXTURE_2D, 0);
    }

    // Update texture if frame changed
    if (impl.sequence != impl.latestFrame.sequence ||
        impl.width != impl.latestFrame.width ||
        impl.height != impl.latestFrame.height) {
        juce::gl::glBindTexture(juce::gl::GL_TEXTURE_2D, impl.texture);
        if (impl.width != impl.latestFrame.width || impl.height != impl.latestFrame.height) {
            juce::gl::glTexImage2D(juce::gl::GL_TEXTURE_2D,
                         0,
                         juce::gl::GL_RGBA8,
                         impl.latestFrame.width,
                         impl.latestFrame.height,
                         0,
                         juce::gl::GL_RGBA,
                         juce::gl::GL_UNSIGNED_BYTE,
                         impl.latestFrame.rgba.data());
        } else {
            juce::gl::glTexSubImage2D(juce::gl::GL_TEXTURE_2D,
                            0,
                            0,
                            0,
                            impl.latestFrame.width,
                            impl.latestFrame.height,
                            juce::gl::GL_RGBA,
                            juce::gl::GL_UNSIGNED_BYTE,
                            impl.latestFrame.rgba.data());
        }
        juce::gl::glBindTexture(juce::gl::GL_TEXTURE_2D, 0);

        impl.width = impl.latestFrame.width;
        impl.height = impl.latestFrame.height;
        impl.sequence = impl.latestFrame.sequence;
    }

    return static_cast<std::uintptr_t>(impl.texture);
}

bool VideoSurfaceProvider::getSurfaceInfo(uint64_t,
                                          int& w,
                                          int& h,
                                          uint64_t& seq) const {
    auto& impl = *pImpl_;
    w = impl.width;
    h = impl.height;
    seq = impl.sequence;
    return impl.width > 0 && impl.height > 0;
}

void VideoSurfaceProvider::prune(const std::unordered_set<uint64_t>&) {
    // VideoSurfaceProvider doesn't track stable IDs.
    // All textures are managed globally for the active video device.
    // This is a no-op for this implementation.
}

void VideoSurfaceProvider::releaseAll() {
    auto& impl = *pImpl_;

    if (impl.texture != 0) {
        juce::gl::glDeleteTextures(1, &impl.texture);
        impl.texture = 0;
        impl.width = 0;
        impl.height = 0;
        impl.sequence = 0;
    }
}

int64_t VideoSurfaceProvider::estimateStateBytes() const {
    return static_cast<int64_t>(sizeof(Impl));
}

void VideoSurfaceProvider::getOwnedGpuBytes(int64_t& colorBytes, int64_t& depthBytes) const {
    const auto& impl = *pImpl_;
    colorBytes = (impl.texture != 0 && impl.width > 0 && impl.height > 0)
        ? static_cast<int64_t>(impl.width) * static_cast<int64_t>(impl.height) * 4
        : 0;
    depthBytes = 0;
}

} // namespace manifold::video