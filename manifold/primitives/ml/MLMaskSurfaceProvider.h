#pragma once

#include "../ui/CustomSurfaceProvider.h"
#include "../video/VideoCaptureManager.h"

#include <cstdint>
#include <functional>
#include <memory>
#include <string>


namespace manifold::ml {

class MLPipeline;

class MLMaskSurfaceProvider : public CustomSurfaceProvider {
public:
    using PipelineFactory = std::function<std::unique_ptr<MLPipeline>()>;
    using FrameSupplier = std::function<manifold::video::FrameData()>;

    MLMaskSurfaceProvider();
    explicit MLMaskSurfaceProvider(PipelineFactory pipelineFactory,
                                   FrameSupplier frameSupplier = {});
    ~MLMaskSurfaceProvider() override;

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
    struct Impl;
    std::unique_ptr<Impl> pImpl_;
};

} // namespace manifold::ml
