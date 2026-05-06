#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "../../primitives/ui/CustomSurfaceProvider.h"
#include "../../primitives/video/VideoSurfaceProvider.h"
#include "../../primitives/sources/GeneratedSourceProvider.h"
#include "../../primitives/shaders/ShaderSurfaceProvider.h"
#include "../../primitives/composite/CompositeSurfaceProvider.h"
#if MANIFOLD_HAS_ML
#include "../../primitives/ml/MLMaskSurfaceProvider.h"
#endif

struct ImGuiDirectCachedSurfaceTexture {
    std::uintptr_t textureHandle = 0;
};

class ImGuiDirectSurfaceHost {
public:
    using FindNodeByIdFn = std::function<RuntimeNode*(const std::string& nodeId)>;
    using PrepareNodeSurfaceTextureFn = std::function<std::uintptr_t(const RuntimeNode& node,
                                                                     int width,
                                                                     int height,
                                                                     double timeSeconds)>;
    using RecordTouchedSurfaceFn = std::function<void(uint64_t stableId,
                                                      std::uintptr_t textureHandle)>;

    ImGuiDirectSurfaceHost();
    ~ImGuiDirectSurfaceHost() = default;

    void configureResolvers(FindNodeByIdFn findNodeById,
                            PrepareNodeSurfaceTextureFn prepareNodeSurfaceTexture,
                            RecordTouchedSurfaceFn recordTouchedSurface);

    void registerSurfaceProvider(std::shared_ptr<CustomSurfaceProvider> provider);
    void unregisterSurfaceProvider(const std::string& typeHint);

    std::uintptr_t prepareCustomSurfaceTexture(const RuntimeNode& node,
                                               int width,
                                               int height,
                                               double timeSeconds);
    bool getSurfaceInfo(uint64_t stableId, int& width, int& height, uint64_t& sequence) const;
    void mergeTouchedSurfaceIds(std::unordered_set<uint64_t>& touchedSurfaceIds);
    void pruneUntouched(const std::unordered_set<uint64_t>& touchedSurfaceIds);
    void releaseAll();
    void recalculateOwnedGpuBytes(std::atomic<int64_t>& surfaceColorBytes,
                                  std::atomic<int64_t>& surfaceDepthBytes) const;
    int64_t estimateCustomSurfaceStateBytes() const;

    std::vector<std::shared_ptr<CustomSurfaceProvider>>& surfaceProviders() noexcept {
        return surfaceProviders_;
    }
    const std::vector<std::shared_ptr<CustomSurfaceProvider>>& surfaceProviders() const noexcept {
        return surfaceProviders_;
    }

    std::unordered_set<uint64_t>& embeddedPanelTouchedSurfaceIds() noexcept {
        return embeddedPanelTouchedSurfaceIds_;
    }
    std::unordered_map<uint64_t, ImGuiDirectCachedSurfaceTexture>& cachedSurfaceTextures() noexcept {
        return cachedSurfaceTextures_;
    }

    std::shared_ptr<manifold::video::VideoSurfaceProvider>& videoSurfaceProvider() noexcept {
        return videoSurfaceProvider_;
    }
    std::shared_ptr<manifold::sources::GeneratedSourceProvider>& generatedSourceProvider() noexcept {
        return generatedSourceProvider_;
    }
    std::shared_ptr<manifold::shaders::ShaderSurfaceProvider>& shaderSurfaceProvider() noexcept {
        return shaderSurfaceProvider_;
    }
    std::shared_ptr<manifold::composite::CompositeSurfaceProvider>& compositeSurfaceProvider() noexcept {
        return compositeSurfaceProvider_;
    }
#if MANIFOLD_HAS_ML
    std::shared_ptr<manifold::ml::MLMaskSurfaceProvider>& mlMaskSurfaceProvider() noexcept {
        return mlMaskSurfaceProvider_;
    }
#endif

private:
    std::vector<std::shared_ptr<CustomSurfaceProvider>> surfaceProviders_;
    std::unordered_set<uint64_t> embeddedPanelTouchedSurfaceIds_;
    std::unordered_map<uint64_t, ImGuiDirectCachedSurfaceTexture> cachedSurfaceTextures_;

    std::shared_ptr<manifold::video::VideoSurfaceProvider> videoSurfaceProvider_;
    std::shared_ptr<manifold::sources::GeneratedSourceProvider> generatedSourceProvider_;
    std::shared_ptr<manifold::shaders::ShaderSurfaceProvider> shaderSurfaceProvider_;
    std::shared_ptr<manifold::composite::CompositeSurfaceProvider> compositeSurfaceProvider_;
#if MANIFOLD_HAS_ML
    std::shared_ptr<manifold::ml::MLMaskSurfaceProvider> mlMaskSurfaceProvider_;
#endif

    FindNodeByIdFn findNodeById_;
    PrepareNodeSurfaceTextureFn prepareNodeSurfaceTexture_;
    RecordTouchedSurfaceFn recordTouchedSurface_;
};
