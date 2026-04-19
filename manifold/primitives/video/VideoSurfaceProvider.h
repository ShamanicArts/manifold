#pragma once

#include "../ui/CustomSurfaceProvider.h"
#include <cstdint>
#include <memory>
#include <string>

namespace manifold::video {

/**
 * @brief Provider that encapsulates video input texture upload.
 *
 * This provider implements CustomSurfaceProvider for surfaceType == "video_input".
 * It manages GL texture uploads from VideoCaptureManager and provides a stable
 * texture handle to the renderer.
 *
 * Responsibility: Move all GL texture upload logic from ImGuiDirectHost into this provider.
 */
class VideoSurfaceProvider : public CustomSurfaceProvider {
public:
    VideoSurfaceProvider();
    ~VideoSurfaceProvider() override;

    // CustomSurfaceProvider interface
    bool handlesType(const std::string& surfaceType) const override;
    std::uintptr_t prepareTexture(const RuntimeNode& node,
                                  int width,
                                  int height,
                                  double timeSeconds) override;
    bool getSurfaceInfo(uint64_t stableId, int& w, int& h, uint64_t& seq) const override;
    void prune(const std::unordered_set<uint64_t>& touchedStableIds) override;
    void releaseAll() override;

    int64_t estimateStateBytes() const;
    void getOwnedGpuBytes(int64_t& colorBytes, int64_t& depthBytes) const;

private:
    /**
     * @brief Private implementation (pImpl idiom).
     *
     * This encapsulates all GL state and keeps the public interface
     * dependency-free (only includes RuntimeNode.h).
     */
    struct Impl;
    std::unique_ptr<Impl> pImpl_;
};

} // namespace manifold::video