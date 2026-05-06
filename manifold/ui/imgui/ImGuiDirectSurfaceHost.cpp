#include "ImGuiDirectSurfaceHost.h"

#include <algorithm>
#include <cstdio>

ImGuiDirectSurfaceHost::ImGuiDirectSurfaceHost()
    : videoSurfaceProvider_(std::make_shared<manifold::video::VideoSurfaceProvider>()),
      generatedSourceProvider_(std::make_shared<manifold::sources::GeneratedSourceProvider>()),
      shaderSurfaceProvider_(std::make_shared<manifold::shaders::ShaderSurfaceProvider>()),
      compositeSurfaceProvider_(std::make_shared<manifold::composite::CompositeSurfaceProvider>())
#if MANIFOLD_HAS_ML
      , mlMaskSurfaceProvider_(std::make_shared<manifold::ml::MLMaskSurfaceProvider>())
#endif
{
    registerSurfaceProvider(videoSurfaceProvider_);
    registerSurfaceProvider(generatedSourceProvider_);
    registerSurfaceProvider(shaderSurfaceProvider_);
    registerSurfaceProvider(compositeSurfaceProvider_);
#if MANIFOLD_HAS_ML
    registerSurfaceProvider(mlMaskSurfaceProvider_);
#endif
}

void ImGuiDirectSurfaceHost::configureResolvers(FindNodeByIdFn findNodeById,
                                                PrepareNodeSurfaceTextureFn prepareNodeSurfaceTexture,
                                                RecordTouchedSurfaceFn recordTouchedSurface) {
    findNodeById_ = std::move(findNodeById);
    prepareNodeSurfaceTexture_ = std::move(prepareNodeSurfaceTexture);
    recordTouchedSurface_ = std::move(recordTouchedSurface);

    if (shaderSurfaceProvider_) {
        shaderSurfaceProvider_->setInputResolver(
            [this](const std::string& sourceType,
                   const std::string& sourceId,
                   const RuntimeNode& node,
                   int width,
                   int height,
                   double timeSeconds) {
                manifold::shaders::ShaderSurfaceProvider::ResolvedInputTexture resolved;
                if (sourceType == "video_input" && videoSurfaceProvider_) {
                    resolved.textureHandle = videoSurfaceProvider_->prepareTexture(node, width, height, timeSeconds);
                    if (resolved.textureHandle != 0) {
                        videoSurfaceProvider_->getSurfaceInfo(node.getStableId(),
                                                              resolved.width,
                                                              resolved.height,
                                                              resolved.sequence);
                    }
                    return resolved;
                }
                if (sourceType == "generated_source" && generatedSourceProvider_) {
                    resolved.textureHandle = generatedSourceProvider_->prepareTexture(node, width, height, timeSeconds);
                    if (resolved.textureHandle != 0) {
                        generatedSourceProvider_->getSurfaceInfo(node.getStableId(),
                                                                 resolved.width,
                                                                 resolved.height,
                                                                 resolved.sequence);
                    }
                    return resolved;
                }
                if (sourceType == "node_surface") {
                    if (sourceId.empty() || !findNodeById_ || !prepareNodeSurfaceTexture_) {
                        return resolved;
                    }
                    auto* targetNode = findNodeById_(sourceId);
                    if (targetNode == nullptr || targetNode->getStableId() == 0) {
                        return resolved;
                    }
                    if (targetNode->getStableId() == node.getStableId()) {
                        return resolved;
                    }
                    resolved.textureHandle = prepareNodeSurfaceTexture_(*targetNode, width, height, timeSeconds);
                    if (resolved.textureHandle != 0) {
                        if (recordTouchedSurface_) {
                            recordTouchedSurface_(targetNode->getStableId(), resolved.textureHandle);
                        }
                        if (!getSurfaceInfo(targetNode->getStableId(),
                                            resolved.width,
                                            resolved.height,
                                            resolved.sequence)) {
                            resolved.width = width;
                            resolved.height = height;
                            resolved.sequence = 0;
                        }
                    }
                    return resolved;
                }
                return resolved;
            });
    }

    if (compositeSurfaceProvider_) {
        compositeSurfaceProvider_->setNodeTextureResolver(
            [this](const std::string& targetNodeId,
                   const RuntimeNode& requestingNode,
                   int width,
                   int height,
                   double timeSeconds) {
                manifold::composite::CompositeSurfaceProvider::ResolvedNodeTexture resolved;
                if (targetNodeId.empty() || !findNodeById_ || !prepareNodeSurfaceTexture_) {
                    return resolved;
                }

                auto* targetNode = findNodeById_(targetNodeId);
                if (targetNode == nullptr || targetNode->getStableId() == 0) {
                    static int missingBudget = 24;
                    if (missingBudget > 0) {
                        --missingBudget;
                        std::fprintf(stderr,
                                     "[ImGuiDirectHost] composite resolver missing target node id=%s\n",
                                     targetNodeId.c_str());
                        std::fflush(stderr);
                    }
                    return resolved;
                }
                if (targetNode->getStableId() == requestingNode.getStableId()) {
                    static int selfBudget = 12;
                    if (selfBudget > 0) {
                        --selfBudget;
                        std::fprintf(stderr,
                                     "[ImGuiDirectHost] composite resolver self-reference target=%s requester=%s\n",
                                     targetNodeId.c_str(),
                                     requestingNode.getNodeId().c_str());
                        std::fflush(stderr);
                    }
                    return resolved;
                }
                resolved.textureHandle = prepareNodeSurfaceTexture_(*targetNode, width, height, timeSeconds);
                if (resolved.textureHandle != 0) {
                    if (recordTouchedSurface_) {
                        recordTouchedSurface_(targetNode->getStableId(), resolved.textureHandle);
                    }
                    if (!getSurfaceInfo(targetNode->getStableId(),
                                        resolved.width,
                                        resolved.height,
                                        resolved.sequence)) {
                        resolved.width = width;
                        resolved.height = height;
                        resolved.sequence = 0;
                    }
                } else {
                    static int zeroBudget = 48;
                    if (zeroBudget > 0) {
                        --zeroBudget;
                        std::fprintf(stderr,
                                     "[ImGuiDirectHost] composite resolver zero texture target=%s type=%s requester=%s wh=%dx%d\n",
                                     targetNodeId.c_str(),
                                     targetNode->getCustomSurfaceType().c_str(),
                                     requestingNode.getNodeId().c_str(),
                                     width,
                                     height);
                        std::fflush(stderr);
                    }
                }
                return resolved;
            });
    }
}

void ImGuiDirectSurfaceHost::registerSurfaceProvider(std::shared_ptr<CustomSurfaceProvider> provider) {
    surfaceProviders_.push_back(std::move(provider));
}

void ImGuiDirectSurfaceHost::unregisterSurfaceProvider(const std::string& typeHint) {
    surfaceProviders_.erase(std::remove_if(surfaceProviders_.begin(),
                                           surfaceProviders_.end(),
                                           [&typeHint](const std::shared_ptr<CustomSurfaceProvider>& provider) {
                                               return provider && provider->handlesType(typeHint);
                                           }),
                            surfaceProviders_.end());
}

std::uintptr_t ImGuiDirectSurfaceHost::prepareCustomSurfaceTexture(const RuntimeNode& node,
                                                                   int width,
                                                                   int height,
                                                                   double timeSeconds) {
    if (node.getStableId() == 0 || width <= 0 || height <= 0) {
        return 0;
    }

    const auto surfaceType = node.getCustomSurfaceType();
    for (auto& provider : surfaceProviders_) {
        if (provider && provider->handlesType(surfaceType)) {
            return provider->prepareTexture(node, width, height, timeSeconds);
        }
    }

    return 0;
}

bool ImGuiDirectSurfaceHost::getSurfaceInfo(uint64_t stableId,
                                            int& width,
                                            int& height,
                                            uint64_t& sequence) const {
    for (auto& provider : surfaceProviders_) {
        if (provider && provider->getSurfaceInfo(stableId, width, height, sequence)) {
            return true;
        }
    }
    return false;
}

void ImGuiDirectSurfaceHost::mergeTouchedSurfaceIds(std::unordered_set<uint64_t>& touchedSurfaceIds) {
    for (const auto& id : embeddedPanelTouchedSurfaceIds_) {
        touchedSurfaceIds.insert(id);
    }
    embeddedPanelTouchedSurfaceIds_.clear();
}

void ImGuiDirectSurfaceHost::pruneUntouched(const std::unordered_set<uint64_t>& touchedSurfaceIds) {
    for (auto& provider : surfaceProviders_) {
        if (provider) {
            provider->prune(touchedSurfaceIds);
        }
    }

    for (auto it = cachedSurfaceTextures_.begin(); it != cachedSurfaceTextures_.end();) {
        if (touchedSurfaceIds.find(it->first) == touchedSurfaceIds.end()) {
            it = cachedSurfaceTextures_.erase(it);
        } else {
            ++it;
        }
    }
}

void ImGuiDirectSurfaceHost::releaseAll() {
    for (auto& provider : surfaceProviders_) {
        if (provider) {
            provider->releaseAll();
        }
    }
}

void ImGuiDirectSurfaceHost::recalculateOwnedGpuBytes(
    std::atomic<int64_t>& surfaceColorBytes,
    std::atomic<int64_t>& surfaceDepthBytes) const {
    int64_t videoColorBytes = 0;
    int64_t videoDepthBytes = 0;
    int64_t generatedColorBytes = 0;
    int64_t generatedDepthBytes = 0;
    int64_t shaderColorBytes = 0;
    int64_t shaderDepthBytes = 0;
    int64_t compositeColorBytes = 0;
    int64_t compositeDepthBytes = 0;
#if MANIFOLD_HAS_ML
    int64_t mlColorBytes = 0;
    int64_t mlDepthBytes = 0;
#endif

    if (videoSurfaceProvider_) {
        videoSurfaceProvider_->getOwnedGpuBytes(videoColorBytes, videoDepthBytes);
    }
    if (generatedSourceProvider_) {
        generatedSourceProvider_->getOwnedGpuBytes(generatedColorBytes, generatedDepthBytes);
    }
    if (shaderSurfaceProvider_) {
        shaderSurfaceProvider_->getOwnedGpuBytes(shaderColorBytes, shaderDepthBytes);
    }
    if (compositeSurfaceProvider_) {
        compositeSurfaceProvider_->getOwnedGpuBytes(compositeColorBytes, compositeDepthBytes);
    }
#if MANIFOLD_HAS_ML
    if (mlMaskSurfaceProvider_) {
        mlMaskSurfaceProvider_->getOwnedGpuBytes(mlColorBytes, mlDepthBytes);
    }
#endif

    surfaceColorBytes.store(videoColorBytes + generatedColorBytes + shaderColorBytes + compositeColorBytes
#if MANIFOLD_HAS_ML
                                + mlColorBytes
#endif
                                ,
                            std::memory_order_relaxed);
    surfaceDepthBytes.store(videoDepthBytes + generatedDepthBytes + shaderDepthBytes + compositeDepthBytes
#if MANIFOLD_HAS_ML
                                + mlDepthBytes
#endif
                                ,
                            std::memory_order_relaxed);
}

int64_t ImGuiDirectSurfaceHost::estimateCustomSurfaceStateBytes() const {
    int64_t total = 0;
    if (videoSurfaceProvider_) {
        total += videoSurfaceProvider_->estimateStateBytes();
    }
    if (generatedSourceProvider_) {
        total += generatedSourceProvider_->estimateStateBytes();
    }
    if (shaderSurfaceProvider_) {
        total += shaderSurfaceProvider_->estimateStateBytes();
    }
    // Preserve the historical ImGuiDirectHost contract shape here.
    // The prior host-level stats intentionally counted video/generated/shader/ML
    // provider state but not composite provider state.
#if MANIFOLD_HAS_ML
    if (mlMaskSurfaceProvider_) {
        total += mlMaskSurfaceProvider_->estimateStateBytes();
    }
#endif
    return total;
}
