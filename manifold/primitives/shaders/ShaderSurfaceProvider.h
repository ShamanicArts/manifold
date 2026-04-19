#pragma once

#include "ShaderPipelineDescriptor.h"
#include "../ui/CustomSurfaceProvider.h"

#include <cstdint>
#include <functional>
#include <memory>
#include <string>

namespace manifold::shaders {

class ShaderSurfaceProvider : public CustomSurfaceProvider {
public:
    struct ResolvedInputTexture {
        std::uintptr_t textureHandle = 0;
        int width = 0;
        int height = 0;
        uint64_t sequence = 0;
    };

    using InputResolver = std::function<ResolvedInputTexture(const std::string& sourceType,
                                                             const RuntimeNode& node,
                                                             int width,
                                                             int height,
                                                             double timeSeconds)>;

    ShaderSurfaceProvider();
    ~ShaderSurfaceProvider() override;

    bool handlesType(const std::string& surfaceType) const override;
    std::uintptr_t prepareTexture(const RuntimeNode& node,
                                  int width,
                                  int height,
                                  double timeSeconds) override;
    bool getSurfaceInfo(uint64_t stableId, int& w, int& h, uint64_t& seq) const override;
    void prune(const std::unordered_set<uint64_t>& touchedStableIds) override;
    void releaseAll() override;

    void setInputResolver(InputResolver resolver);
    int64_t estimateStateBytes() const;
    void getOwnedGpuBytes(int64_t& colorBytes, int64_t& depthBytes) const;

private:
    struct Impl;
    std::unique_ptr<Impl> pImpl_;
};

} // namespace manifold::shaders
