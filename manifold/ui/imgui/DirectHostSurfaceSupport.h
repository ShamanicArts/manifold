#pragma once

#include "ImGuiDirectHost.h"

inline void ImGuiDirectHost::recalculateOwnedGpuBytes() {
    if (surfaceHostImpl_ == nullptr) {
        surfaceColorBytes_.store(0, std::memory_order_relaxed);
        surfaceDepthBytes_.store(0, std::memory_order_relaxed);
        return;
    }

    surfaceHostImpl_->recalculateOwnedGpuBytes(surfaceColorBytes_, surfaceDepthBytes_);
}

