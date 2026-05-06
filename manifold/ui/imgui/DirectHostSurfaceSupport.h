#pragma once

#include "ImGuiDirectHost.h"

#include "../../primitives/shaders/ShaderSurfaceProvider.h"
#include "../../primitives/sources/GeneratedSourceProvider.h"
#include "../../primitives/composite/CompositeSurfaceProvider.h"
#include "../../primitives/video/VideoSurfaceProvider.h"
#if MANIFOLD_HAS_ML
#include "../../primitives/ml/MLMaskSurfaceProvider.h"
#endif

#include <algorithm>

inline void ImGuiDirectHost::recalculateOwnedGpuBytes() {
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

    surfaceColorBytes_.store(videoColorBytes + generatedColorBytes + shaderColorBytes + compositeColorBytes
#if MANIFOLD_HAS_ML
                             + mlColorBytes
#endif
                             , std::memory_order_relaxed);
    surfaceDepthBytes_.store(videoDepthBytes + generatedDepthBytes + shaderDepthBytes + compositeDepthBytes
#if MANIFOLD_HAS_ML
                             + mlDepthBytes
#endif
                             , std::memory_order_relaxed);
}

