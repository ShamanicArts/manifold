#pragma once

#include "ImGuiDirectHost.h"
#include "DirectHostRuntimeSupport.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>

inline void ImGuiDirectHost::mouseDown(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    if (e.mods.isLeftButtonDown()) {
        leftMouseDown_ = true;
        queueMouseButton(0, true);
    }
    if (e.mods.isRightButtonDown()) {
        rightMouseDown_ = true;
        queueMouseButton(1, true);
    }
    if (e.mods.isMiddleButtonDown()) {
        middleMouseDown_ = true;
        queueMouseButton(2, true);
    }

    if (wantCaptureMouse_.load(std::memory_order_relaxed)) {
        grabKeyboardFocus();
        renderNow();
        lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
        return;
    }

    updateHover(e.position, &e.mods);
    auto hit = hitTestLiveTree(e.position, manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Pointer);
    if (hit.node != nullptr) {
        pressedNodeStableId_ = hit.stableId;
        grabKeyboardFocus();
        setLiveFocus(hit.stableId);

        if (copyIdModeEnabled_) {
            const std::string nodeId = hit.node->getNodeId();
            const std::string widgetType = hit.node->getWidgetType();
            const uint64_t stableId = hit.node->getStableId();

            std::vector<std::string> parts;
            std::string displayName = nodeId;
            parts.push_back("widget:" + displayName);
            parts.push_back("type:" + (widgetType.empty() ? std::string("RuntimeNode") : widgetType));
            parts.push_back("stableId:" + std::to_string(stableId));

            std::string treePath;
            const RuntimeNode* current = hit.node;
            std::vector<std::string> pathParts;
            while (current != nullptr) {
                const RuntimeNode* parent = current->getParent();
                if (parent) {
                    int index = -1;
                    for (int i = 0; i < parent->getNumChildren(); ++i) {
                        if (parent->getChild(i) == current) {
                            index = i;
                            break;
                        }
                    }
                    if (index >= 0) {
                        pathParts.push_back(std::to_string(index) + ":" + current->getNodeId());
                    }
                } else {
                    pathParts.push_back("0:" + current->getNodeId());
                }
                current = parent;
            }
            std::reverse(pathParts.begin(), pathParts.end());
            for (size_t i = 0; i < pathParts.size(); ++i) {
                if (i > 0) treePath += "/";
                treePath += pathParts[i];
            }
            if (!treePath.empty()) {
                parts.push_back("tree:" + treePath);
            }

            const auto& callbacks = hit.node->getCallbacks();
            std::vector<std::string> cbNames;
            if (callbacks.onMouseDown.valid()) cbNames.push_back("onMouseDown");
            if (callbacks.onMouseDrag.valid()) cbNames.push_back("onMouseDrag");
            if (callbacks.onMouseUp.valid()) cbNames.push_back("onMouseUp");
            if (callbacks.onMouseMove.valid()) cbNames.push_back("onMouseMove");
            if (callbacks.onMouseWheel.valid()) cbNames.push_back("onMouseWheel");
            if (callbacks.onKeyPress.valid()) cbNames.push_back("onKeyPress");
            if (callbacks.onClick.valid()) cbNames.push_back("onClick");
            if (callbacks.onDoubleClick.valid()) cbNames.push_back("onDoubleClick");
            if (callbacks.onMouseEnter.valid()) cbNames.push_back("onMouseEnter");
            if (callbacks.onMouseExit.valid()) cbNames.push_back("onMouseExit");
            if (callbacks.onValueChanged.valid()) cbNames.push_back("onValueChanged");
            if (callbacks.onToggled.valid()) cbNames.push_back("onToggled");

            if (!cbNames.empty()) {
                std::string cbStr = "callbacks:";
                for (size_t i = 0; i < cbNames.size(); ++i) {
                    if (i > 0) cbStr += ",";
                    cbStr += cbNames[i];
                }
                parts.push_back(cbStr);
            }

            std::string fullId;
            for (size_t i = 0; i < parts.size(); ++i) {
                if (i > 0) fullId += " | ";
                fullId += parts[i];
            }

            juce::SystemClipboard::copyTextToClipboard(juce::String(fullId));
            if (copyIdCallback_) {
                copyIdCallback_(fullId);
            }

            renderNow();
            return;
        }

        const auto localPosition = juce::Point<float>(hit.scenePosition.x - static_cast<float>(hit.sceneBounds.getX()),
                                                      hit.scenePosition.y - static_cast<float>(hit.sceneBounds.getY()));
        if (auto* node = findLiveNodeByStableId(hit.stableId)) {
            invokeLiveMouseDown(*node, localPosition, e.mods);
        }
        renderNow();
    } else {
        pressedNodeStableId_ = 0;
        setLiveFocus(0);
        renderNow();
    }
}

inline void ImGuiDirectHost::mouseDrag(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    if (wantCaptureMouse_.load(std::memory_order_relaxed)) {
        const double nowMs = juce::Time::getMillisecondCounterHiRes();
        if (nowMs - lastContinuousInputDispatchMs_ >= (1000.0 / 60.0)) {
            renderNow();
            lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
        }
        return;
    }

    if (pressedNodeStableId_ == 0 || liveRoot_ == nullptr) {
        return;
    }

    auto* pressedNode = findLiveNodeByStableId(pressedNodeStableId_);
    if (pressedNode == nullptr) {
        pressedNodeStableId_ = 0;
        return;
    }

    auto scenePosition = scenePositionFromLocal(e.position);
    auto localPosition = direct_host_render_support::localPositionForNode(pressedNode, scenePosition);
    juce::Point<float> dragDelta(e.getDistanceFromDragStartX() / std::max(1.0f, previewTransform_.scale),
                                 e.getDistanceFromDragStartY() / std::max(1.0f, previewTransform_.scale));

    pendingDragEvent_.valid = true;
    pendingDragEvent_.stableId = pressedNodeStableId_;
    pendingDragEvent_.localPosition = localPosition;
    pendingDragEvent_.dragDelta = dragDelta;
    pendingDragEvent_.mods = e.mods;

    const double nowMs = juce::Time::getMillisecondCounterHiRes();
    if (nowMs - lastContinuousInputDispatchMs_ >= (1000.0 / 60.0)) {
        flushPendingDrag();
    }
}

inline void ImGuiDirectHost::mouseUp(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    if (leftMouseDown_) {
        leftMouseDown_ = false;
        queueMouseButton(0, false);
    }
    if (rightMouseDown_) {
        rightMouseDown_ = false;
        queueMouseButton(1, false);
    }
    if (middleMouseDown_) {
        middleMouseDown_ = false;
        queueMouseButton(2, false);
    }

    if (wantCaptureMouse_.load(std::memory_order_relaxed)) {
        flushPendingDrag();
        renderNow();
        lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
        return;
    }

    flushPendingDrag();
    auto hit = hitTestLiveTree(e.position, manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Pointer);
    const uint64_t pressedStableId = pressedNodeStableId_;
    pressedNodeStableId_ = 0;

    if (pressedStableId == 0 || liveRoot_ == nullptr) {
        return;
    }

    auto* pressedNode = findLiveNodeByStableId(pressedStableId);
    if (pressedNode == nullptr) {
        return;
    }

    auto scenePosition = scenePositionFromLocal(e.position);
    auto localPosition = direct_host_render_support::localPositionForNode(pressedNode, scenePosition);
    const bool triggerDoubleClick = hit.node != nullptr && hit.stableId == pressedStableId && e.getNumberOfClicks() >= 2;
    const bool triggerClick = hit.node != nullptr && hit.stableId == pressedStableId && !triggerDoubleClick && !e.mouseWasDraggedSinceMouseDown();
    invokeLiveMouseUp(*pressedNode, localPosition, triggerClick, triggerDoubleClick, e.mods);
    renderNow();
}

inline void ImGuiDirectHost::mouseMove(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    if (wantCaptureMouse_.load(std::memory_order_relaxed)) {
        const double nowMs = juce::Time::getMillisecondCounterHiRes();
        if (nowMs - lastContinuousInputDispatchMs_ >= (1000.0 / 60.0)) {
            renderNow();
            lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
        }
        return;
    }
    updateHover(e.position, &e.mods);
}

inline void ImGuiDirectHost::mouseExit(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);
    queueMousePosition(juce::Point<float>(-1.0f, -1.0f));
    const uint64_t previousHoveredStableId = hoveredNodeStableId_;
    hoveredNodeStableId_ = 0;
    if (previousHoveredStableId != 0) {
        invokeLiveMouseExit(previousHoveredStableId);
        renderNow();
    }
}

inline void ImGuiDirectHost::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) {
    queueMousePosition(e.position);
    queueMouseWheel(wheel.deltaX, wheel.deltaY);
    if (wantCaptureMouse_.load(std::memory_order_relaxed)) {
        renderNow();
        lastContinuousInputDispatchMs_ = juce::Time::getMillisecondCounterHiRes();
        return;
    }

    updateHover(e.position, &e.mods);
    auto hit = hitTestLiveTree(e.position, manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Wheel);
    if (hit.node == nullptr || hit.stableId == 0) {
        return;
    }

    if (auto* node = findLiveNodeByStableId(hit.stableId)) {
        invokeLiveMouseWheel(*node, hit.scenePosition, wheel.deltaY, e.mods);
        renderNow();
    }
}

inline bool ImGuiDirectHost::keyPressed(const juce::KeyPress& key) {
    if (globalKeyHandler_ && globalKeyHandler_(key)) {
        renderNow();
        return true;
    }

    auto* node = findLiveNodeByStableId(focusedNodeStableId_);
    if (node == nullptr) {
        return juce::Component::keyPressed(key);
    }

    node->setFocused(true);
    auto& callbacks = node->getCallbacks();
    if (!callbacks.onKeyPress.valid()) {
        return juce::Component::keyPressed(key);
    }

    sol::protected_function fn = callbacks.onKeyPress;
    auto mods = key.getModifiers();
    auto result = fn(key.getKeyCode(),
                     static_cast<int>(key.getTextCharacter()),
                     mods.isShiftDown(),
                     direct_host_render_support::isCtrlLikeDown(mods),
                     mods.isAltDown());
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "[ImGuiDirectHost] onKeyPress error for %s: %s\n",
                     node->getNodeId().c_str(),
                     err.what());
        return false;
    }

    renderNow();
    if (result.get_type() == sol::type::boolean) {
        return result.get<bool>();
    }
    return true;
}
