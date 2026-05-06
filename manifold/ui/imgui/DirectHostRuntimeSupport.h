#pragma once

#include "ImGuiDirectHost.h"
#include "DirectHostRenderSupport.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

inline void ImGuiDirectHost::setGlobalKeyHandler(GlobalKeyHandler handler) {
    globalKeyHandler_ = std::move(handler);
}

inline void ImGuiDirectHost::setRootNode(RuntimeNode* root) {
    if (liveRoot_ == root) {
        return;
    }

    liveRoot_ = root;
    pressedNodeStableId_ = 0;
    hoveredNodeStableId_ = 0;
    focusedNodeStableId_ = 0;
    pendingDragEvent_ = {};
    lastContinuousInputDispatchMs_ = 0.0;
    previewTransform_ = {};

    {
        std::lock_guard<std::mutex> lock(snapshotMutex_);
        pendingSnapshot_ = {};
        activeSnapshot_ = {};
    }
    snapshotReady_.store(true, std::memory_order_release);
}

inline void ImGuiDirectHost::buildRenderSnapshot() {
    const auto renderOptions = direct_host_render_support::makeDirectRenderOptions();
    if (liveRoot_ != nullptr && getWidth() > 0 && getHeight() > 0) {
        previewTransform_ = renderer_.buildPreviewTransform(*liveRoot_, getWidth(), getHeight(), renderOptions);
    } else {
        previewTransform_ = {};
    }
}

inline void ImGuiDirectHost::flushPendingDrag() {
    if (!pendingDragEvent_.valid || pendingDragEvent_.stableId == 0) {
        return;
    }

    auto* node = findLiveNodeByStableId(pendingDragEvent_.stableId);
    if (node != nullptr) {
        invokeLiveMouseDrag(*node,
                            pendingDragEvent_.localPosition,
                            pendingDragEvent_.dragDelta,
                            pendingDragEvent_.mods);
    }

    pendingDragEvent_ = {};
    lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
}

inline void ImGuiDirectHost::renderNow() {
    if (renderInProgress_) {
        return;
    }
    juce::ScopedValueSetter<bool> renderGuard(renderInProgress_, true);

    attachContextIfNeeded();

    if (getWidth() <= 0 || getHeight() <= 0 || (!isShowing() && !forceNextRender_)) {
        wantCaptureMouse_.store(false, std::memory_order_relaxed);
        wantCaptureKeyboard_.store(false, std::memory_order_relaxed);
        lastVertexCount_.store(0, std::memory_order_relaxed);
        lastIndexCount_.store(0, std::memory_order_relaxed);
        return;
    }

    if (!openGLContext_.isAttached() || !contextReady_) {
        wantCaptureMouse_.store(false, std::memory_order_relaxed);
        wantCaptureKeyboard_.store(false, std::memory_order_relaxed);
        lastVertexCount_.store(0, std::memory_order_relaxed);
        lastIndexCount_.store(0, std::memory_order_relaxed);
        return;
    }

    flushPendingDrag();

    if (!openGLContext_.makeActive()) {
        return;
    }

    const auto scale = static_cast<float>(openGLContext_.getRenderingScale());
    (void) renderFrameWithCurrentContext(scale, true);
    juce::OpenGLContext::deactivateCurrentContext();
}

inline void ImGuiDirectHost::newOpenGLContextCreated() {
    initialiseImGuiBackendIfNeeded();
}

inline void ImGuiDirectHost::renderOpenGL() {
}

inline void ImGuiDirectHost::openGLContextClosing() {
    wantCaptureMouse_.store(false, std::memory_order_relaxed);
    wantCaptureKeyboard_.store(false, std::memory_order_relaxed);
    lastVertexCount_.store(0, std::memory_order_relaxed);
    lastIndexCount_.store(0, std::memory_order_relaxed);
    deferredSurfaceRequests_.clear();
    deferredSurfaceOrder_.clear();
    cachedSurfaceTextures_.clear();

    if (surfaceHostImpl_ != nullptr) {
        surfaceHostImpl_->releaseAll();
    }
    recalculateOwnedGpuBytes();
    shutdownImGuiBackend();
}

inline void ImGuiDirectHost::attachContextIfNeeded() {
    if (!isShowing()) {
        return;
    }

    if (!openGLContext_.isAttached()) {
        openGLContext_.attachTo(*this);
    }
}

inline void ImGuiDirectHost::updateHover(juce::Point<float> position, const juce::ModifierKeys* mods) {
    auto hit = hitTestLiveTree(position, manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Pointer);
    const uint64_t nextHoveredStableId = hit.node != nullptr ? hit.stableId : 0;
    const uint64_t previousHoveredStableId = hoveredNodeStableId_;
    hoveredNodeStableId_ = nextHoveredStableId;

    if (previousHoveredStableId != nextHoveredStableId) {
        if (previousHoveredStableId != 0) {
            invokeLiveMouseExit(previousHoveredStableId);
        }
        if (nextHoveredStableId != 0) {
            invokeLiveMouseEnter(nextHoveredStableId);
        }
    }

    if (mods != nullptr && hit.node != nullptr && nextHoveredStableId != 0) {
        const auto localPosition = juce::Point<float>(hit.scenePosition.x - static_cast<float>(hit.sceneBounds.getX()),
                                                      hit.scenePosition.y - static_cast<float>(hit.sceneBounds.getY()));
        if (auto* node = findLiveNodeByStableId(nextHoveredStableId)) {
            invokeLiveMouseMove(*node, localPosition, *mods);
        }
    }
}

inline manifold::ui::imgui::RuntimeNodeRenderer::HitTestResult ImGuiDirectHost::hitTestLiveTree(
    juce::Point<float> position,
    manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode mode) {
    if (liveRoot_ == nullptr) {
        return {};
    }

    if ((!previewTransform_.valid || previewTransform_.scale <= 0.0f) && getWidth() > 0 && getHeight() > 0) {
        previewTransform_ = renderer_.buildPreviewTransform(*liveRoot_, getWidth(), getHeight(), direct_host_render_support::makeDirectRenderOptions());
    }

    return direct_host_render_support::hitTestLiveTreeDetailed(renderer_, liveRoot_, position, previewTransform_, mode);
}

inline RuntimeNode* ImGuiDirectHost::findLiveNodeByStableId(uint64_t stableId) const {
    if (liveRoot_ == nullptr || stableId == 0) {
        return nullptr;
    }
    return liveRoot_->findByStableId(stableId);
}

inline RuntimeNode* ImGuiDirectHost::findLiveWheelTarget(RuntimeNode* node) const {
    while (node != nullptr) {
        if (node->getCallbacks().onMouseWheel.valid()) {
            return node;
        }
        node = node->getParent();
    }
    return nullptr;
}

inline void ImGuiDirectHost::setLiveFocus(uint64_t stableId) {
    if (liveRoot_ == nullptr) {
        focusedNodeStableId_ = 0;
        return;
    }

    direct_host_render_support::clearFocusRecursive(*liveRoot_);
    focusedNodeStableId_ = stableId;
    if (auto* node = liveRoot_->findByStableId(stableId)) {
        node->setFocused(true);
    }
}

inline void ImGuiDirectHost::invokeLiveMouseDown(RuntimeNode& node,
                                                 juce::Point<float> localPosition,
                                                 const juce::ModifierKeys& mods) {
    node.setPressed(true);
    auto& callbacks = node.getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseDown,
                      "onMouseDown",
                      node.getNodeId(),
                      localPosition.x,
                      localPosition.y,
                      mods.isShiftDown(),
                      direct_host_render_support::isCtrlLikeDown(mods),
                      mods.isAltDown(),
                      mods.isRightButtonDown());
}

inline void ImGuiDirectHost::invokeLiveMouseDrag(RuntimeNode& node,
                                                 juce::Point<float> localPosition,
                                                 juce::Point<float> dragDelta,
                                                 const juce::ModifierKeys& mods) {
    auto& callbacks = node.getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseDrag,
                      "onMouseDrag",
                      node.getNodeId(),
                      localPosition.x,
                      localPosition.y,
                      dragDelta.x,
                      dragDelta.y,
                      mods.isShiftDown(),
                      direct_host_render_support::isCtrlLikeDown(mods),
                      mods.isAltDown(),
                      mods.isRightButtonDown());
}

inline void ImGuiDirectHost::invokeLiveMouseUp(RuntimeNode& node,
                                               juce::Point<float> localPosition,
                                               bool triggerClick,
                                               bool triggerDoubleClick,
                                               const juce::ModifierKeys& mods) {
    node.setPressed(false);
    auto& callbacks = node.getCallbacks();
    if (triggerDoubleClick) {
        direct_host_render_support::invokeLuaCallback(callbacks.onDoubleClick, "onDoubleClick", node.getNodeId());
    } else if (triggerClick) {
        direct_host_render_support::invokeLuaCallback(callbacks.onClick, "onClick", node.getNodeId());
    }
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseUp,
                      "onMouseUp",
                      node.getNodeId(),
                      localPosition.x,
                      localPosition.y,
                      mods.isShiftDown(),
                      direct_host_render_support::isCtrlLikeDown(mods),
                      mods.isAltDown(),
                      mods.isRightButtonDown());
}

inline void ImGuiDirectHost::invokeLiveMouseMove(RuntimeNode& node,
                                                 juce::Point<float> localPosition,
                                                 const juce::ModifierKeys& mods) {
    auto& callbacks = node.getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseMove,
                      "onMouseMove",
                      node.getNodeId(),
                      localPosition.x,
                      localPosition.y,
                      mods.isShiftDown(),
                      direct_host_render_support::isCtrlLikeDown(mods),
                      mods.isAltDown());
}

inline void ImGuiDirectHost::invokeLiveMouseEnter(uint64_t stableId) {
    auto* node = findLiveNodeByStableId(stableId);
    if (node == nullptr) {
        return;
    }

    node->setHovered(true);
    auto& callbacks = node->getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseEnter, "onMouseEnter", node->getNodeId());
}

inline void ImGuiDirectHost::invokeLiveMouseExit(uint64_t stableId) {
    auto* node = findLiveNodeByStableId(stableId);
    if (node == nullptr) {
        return;
    }

    node->setHovered(false);
    node->setPressed(false);
    auto& callbacks = node->getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseExit, "onMouseExit", node->getNodeId());
}

inline void ImGuiDirectHost::invokeLiveMouseWheel(RuntimeNode& hitNode,
                                                  juce::Point<float> scenePosition,
                                                  float deltaY,
                                                  const juce::ModifierKeys& mods,
                                                  RuntimeNode* coordinateRoot) {
    auto* node = findLiveWheelTarget(&hitNode);
    if (node == nullptr) {
        return;
    }

    auto localPosition = direct_host_render_support::localPositionForNodeWithinRoot(coordinateRoot, node, scenePosition);
    auto& callbacks = node->getCallbacks();
    direct_host_render_support::invokeLuaCallback(callbacks.onMouseWheel,
                      "onMouseWheel",
                      node->getNodeId(),
                      localPosition.x,
                      localPosition.y,
                      deltaY,
                      mods.isShiftDown(),
                      direct_host_render_support::isCtrlLikeDown(mods),
                      mods.isAltDown());
}

inline juce::Point<float> ImGuiDirectHost::scenePositionFromLocal(juce::Point<float> local) {
    if ((!previewTransform_.valid || previewTransform_.scale <= 0.0f) && liveRoot_ != nullptr && getWidth() > 0 && getHeight() > 0) {
        previewTransform_ = renderer_.buildPreviewTransform(*liveRoot_, getWidth(), getHeight(), direct_host_render_support::makeDirectRenderOptions());
    }

    if (!previewTransform_.valid || previewTransform_.scale <= 0.0f) {
        return local;
    }

    return juce::Point<float>((local.x - previewTransform_.offsetX) / previewTransform_.scale,
                              (local.y - previewTransform_.offsetY) / previewTransform_.scale);
}

inline void ImGuiDirectHost::queueMousePosition(juce::Point<float> position) {
    PendingEvent event;
    event.type = EventType::MousePos;
    event.x = position.x;
    event.y = position.y;
    std::lock_guard<std::mutex> lock(inputMutex_);
    pendingEvents_.push_back(std::move(event));
}

inline void ImGuiDirectHost::queueMouseButton(int button, bool down) {
    PendingEvent event;
    event.type = EventType::MouseButton;
    event.button = button;
    event.down = down;
    std::lock_guard<std::mutex> lock(inputMutex_);
    pendingEvents_.push_back(std::move(event));
}

inline void ImGuiDirectHost::queueMouseWheel(float deltaX, float deltaY) {
    PendingEvent event;
    event.type = EventType::MouseWheel;
    event.x = deltaX;
    event.y = deltaY;
    std::lock_guard<std::mutex> lock(inputMutex_);
    pendingEvents_.push_back(std::move(event));
}

inline void ImGuiDirectHost::queueFocus(bool focused) {
    PendingEvent event;
    event.type = EventType::Focus;
    event.focused = focused;
    std::lock_guard<std::mutex> lock(inputMutex_);
    pendingEvents_.push_back(std::move(event));
}
