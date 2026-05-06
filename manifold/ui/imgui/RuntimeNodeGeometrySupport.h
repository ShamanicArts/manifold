#pragma once

#include "../../primitives/ui/RuntimeNode.h"

#include <juce_graphics/juce_graphics.h>

#include <algorithm>
#include <cmath>
#include <vector>

namespace manifold::ui::imgui {

struct RuntimeNodePreviewTransformData {
    bool valid = false;
    float scale = 1.0f;
    float offsetX = 0.0f;
    float offsetY = 0.0f;
    juce::Rectangle<int> sceneBounds;
};

struct RuntimeNodeHitTestResultData {
    const RuntimeNode* node = nullptr;
    uint64_t stableId = 0;
    juce::Rectangle<int> sceneBounds;
    juce::Point<float> scenePosition;
};

enum class RuntimeNodeHitTestModeData {
    Pointer,
    Wheel,
    AnyVisible
};

namespace runtime_node_geometry_support {

struct SceneTransform {
    float scaleX = 1.0f;
    float scaleY = 1.0f;
    float offsetX = 0.0f;
    float offsetY = 0.0f;
};

inline SceneTransform composeSceneTransform(const RuntimeNode& node, const SceneTransform& parent) {
    const auto& bounds = node.getBounds();
    const auto& transform = node.getTransform();

    SceneTransform out;
    out.scaleX = parent.scaleX * transform.scaleX;
    out.scaleY = parent.scaleY * transform.scaleY;
    out.offsetX = parent.offsetX + parent.scaleX * (static_cast<float>(bounds.x) + transform.translateX);
    out.offsetY = parent.offsetY + parent.scaleY * (static_cast<float>(bounds.y) + transform.translateY);
    return out;
}

inline juce::Rectangle<float> sceneRectFromLocalRect(const juce::Rectangle<float>& localRect,
                                                     const SceneTransform& transform) {
    const float x1 = transform.offsetX + localRect.getX() * transform.scaleX;
    const float y1 = transform.offsetY + localRect.getY() * transform.scaleY;
    const float x2 = transform.offsetX + localRect.getRight() * transform.scaleX;
    const float y2 = transform.offsetY + localRect.getBottom() * transform.scaleY;
    const float left = std::min(x1, x2);
    const float top = std::min(y1, y2);
    const float right = std::max(x1, x2);
    const float bottom = std::max(y1, y2);
    return juce::Rectangle<float>(left, top, std::max(0.0f, right - left), std::max(0.0f, bottom - top));
}

inline juce::Rectangle<float> sceneRectForNode(const RuntimeNode& node, const SceneTransform& parent) {
    const auto nodeTransform = composeSceneTransform(node, parent);
    const auto& bounds = node.getBounds();
    return sceneRectFromLocalRect(juce::Rectangle<float>(0.0f,
                                                         0.0f,
                                                         static_cast<float>(bounds.w),
                                                         static_cast<float>(bounds.h)),
                                  nodeTransform);
}

inline juce::Rectangle<int> enclosingIntRect(const juce::Rectangle<float>& rect) {
    const float left = rect.getX();
    const float top = rect.getY();
    const float right = rect.getRight();
    const float bottom = rect.getBottom();

    const float minX = std::min(left, right);
    const float minY = std::min(top, bottom);
    const float maxX = std::max(left, right);
    const float maxY = std::max(top, bottom);

    const int x = juce::roundToInt(std::floor(minX));
    const int y = juce::roundToInt(std::floor(minY));
    const int r = juce::roundToInt(std::ceil(maxX));
    const int b = juce::roundToInt(std::ceil(maxY));
    return juce::Rectangle<int>(x, y, std::max(0, r - x), std::max(0, b - y));
}

inline void unionRect(juce::Rectangle<float>& bounds, const juce::Rectangle<float>& other, bool& hasBounds) {
    if (!hasBounds) {
        bounds = other;
        hasBounds = true;
        return;
    }

    const float left = std::min(bounds.getX(), other.getX());
    const float top = std::min(bounds.getY(), other.getY());
    const float right = std::max(bounds.getRight(), other.getRight());
    const float bottom = std::max(bounds.getBottom(), other.getBottom());
    bounds = juce::Rectangle<float>(left, top, std::max(0.0f, right - left), std::max(0.0f, bottom - top));
}

inline void collectVisibleBounds(const RuntimeNode& node,
                                 const SceneTransform& parentTransform,
                                 juce::Rectangle<float>& bounds,
                                 bool& hasBounds) {
    if (!node.isVisible()) {
        return;
    }

    const auto nodeTransform = composeSceneTransform(node, parentTransform);
    const auto absolute = sceneRectFromLocalRect(juce::Rectangle<float>(0.0f,
                                                                        0.0f,
                                                                        static_cast<float>(node.getBounds().w),
                                                                        static_cast<float>(node.getBounds().h)),
                                                 nodeTransform);
    if (absolute.getWidth() > 0.0f && absolute.getHeight() > 0.0f) {
        unionRect(bounds, absolute, hasBounds);
    }

    for (auto* child : node.getChildren()) {
        if (child != nullptr) {
            collectVisibleBounds(*child, nodeTransform, bounds, hasBounds);
        }
    }
}

inline juce::Rectangle<float> collectVisibleBounds(const RuntimeNode& root) {
    juce::Rectangle<float> bounds;
    bool hasBounds = false;
    collectVisibleBounds(root, SceneTransform{}, bounds, hasBounds);
    if (!hasBounds) {
        bounds = sceneRectForNode(root, SceneTransform{});
    }
    return bounds;
}

inline RuntimeNodePreviewTransformData buildPreviewTransform(const RuntimeNode& root,
                                                             int width,
                                                             int height,
                                                             float leftPad,
                                                             float rightPad,
                                                             float topPad,
                                                             float bottomPad,
                                                             bool fitToView) {
    RuntimeNodePreviewTransformData transform;
    const auto sceneBounds = collectVisibleBounds(root);

    transform.valid = true;
    transform.sceneBounds = enclosingIntRect(sceneBounds);

    if (!fitToView) {
        transform.scale = 1.0f;
        transform.offsetX = 0.0f;
        transform.offsetY = 0.0f;
        return transform;
    }

    const float availableW = std::max(1.0f, static_cast<float>(width) - leftPad - rightPad);
    const float availableH = std::max(1.0f, static_cast<float>(height) - topPad - bottomPad);
    const float sceneW = std::max(1.0f, static_cast<float>(sceneBounds.getWidth()));
    const float sceneH = std::max(1.0f, static_cast<float>(sceneBounds.getHeight()));
    const float scale = std::min(availableW / sceneW, availableH / sceneH);

    transform.scale = std::max(0.01f, scale);
    transform.offsetX = leftPad + (availableW - sceneW * transform.scale) * 0.5f
        - static_cast<float>(sceneBounds.getX()) * transform.scale;
    transform.offsetY = topPad + (availableH - sceneH * transform.scale) * 0.5f
        - static_cast<float>(sceneBounds.getY()) * transform.scale;
    return transform;
}

inline juce::Rectangle<float> previewRect(const juce::Rectangle<float>& sceneRect,
                                          const RuntimeNodePreviewTransformData& transform) {
    const float x1 = transform.offsetX + sceneRect.getX() * transform.scale;
    const float y1 = transform.offsetY + sceneRect.getY() * transform.scale;
    const float x2 = transform.offsetX + sceneRect.getRight() * transform.scale;
    const float y2 = transform.offsetY + sceneRect.getBottom() * transform.scale;
    const float left = std::min(x1, x2);
    const float top = std::min(y1, y2);
    const float right = std::max(x1, x2);
    const float bottom = std::max(y1, y2);
    return juce::Rectangle<float>(left, top, std::max(1.0f, right - left), std::max(1.0f, bottom - top));
}

inline std::vector<RuntimeNode*> sortedChildren(const RuntimeNode& node) {
    std::vector<RuntimeNode*> children;
    children.reserve(node.getChildren().size());
    for (auto* child : node.getChildren()) {
        if (child != nullptr) {
            children.push_back(child);
        }
    }

    std::stable_sort(children.begin(), children.end(), [](const RuntimeNode* a, const RuntimeNode* b) {
        return a->getZOrder() < b->getZOrder();
    });
    return children;
}

inline bool nodeMatchesHitMode(const RuntimeNode& node, RuntimeNodeHitTestModeData mode) {
    const auto& caps = node.getInputCapabilities();
    switch (mode) {
        case RuntimeNodeHitTestModeData::Pointer:
            return caps.pointer;
        case RuntimeNodeHitTestModeData::Wheel:
            return caps.pointer || caps.wheel;
        case RuntimeNodeHitTestModeData::AnyVisible:
            return true;
    }
    return false;
}

inline RuntimeNodeHitTestResultData hitTestRecursive(const RuntimeNode& node,
                                                     juce::Point<float> position,
                                                     const SceneTransform& parentTransform,
                                                     RuntimeNodeHitTestModeData mode) {
    if (!node.isVisible()) {
        return {};
    }

    const auto nodeTransform = composeSceneTransform(node, parentTransform);
    const auto bounds = sceneRectFromLocalRect(juce::Rectangle<float>(0.0f,
                                                                      0.0f,
                                                                      static_cast<float>(node.getBounds().w),
                                                                      static_cast<float>(node.getBounds().h)),
                                               nodeTransform);

    if (node.hasClipRect()) {
        const auto& clip = node.getClipRect();
        const auto sceneClip = sceneRectFromLocalRect(juce::Rectangle<float>(static_cast<float>(clip.x),
                                                                             static_cast<float>(clip.y),
                                                                             static_cast<float>(clip.w),
                                                                             static_cast<float>(clip.h)),
                                                      nodeTransform);
        if (!sceneClip.contains(position)) {
            return {};
        }
    }

    auto children = sortedChildren(node);
    for (auto it = children.rbegin(); it != children.rend(); ++it) {
        auto hit = hitTestRecursive(**it, position, nodeTransform, mode);
        if (hit.node != nullptr) {
            return hit;
        }
    }

    if (!bounds.contains(position) || !nodeMatchesHitMode(node, mode)) {
        return {};
    }

    RuntimeNodeHitTestResultData result;
    result.node = &node;
    result.stableId = node.getStableId();
    result.sceneBounds = enclosingIntRect(bounds);
    result.scenePosition = position;
    return result;
}

inline RuntimeNodeHitTestResultData hitTest(const RuntimeNode& root,
                                            juce::Point<float> previewPosition,
                                            const RuntimeNodePreviewTransformData& transform,
                                            RuntimeNodeHitTestModeData mode) {
    if (!transform.valid || transform.scale <= 0.0f) {
        return {};
    }

    const float sceneX = (previewPosition.x - transform.offsetX) / transform.scale;
    const float sceneY = (previewPosition.y - transform.offsetY) / transform.scale;
    return hitTestRecursive(root, juce::Point<float>(sceneX, sceneY), SceneTransform{}, mode);
}

} // namespace runtime_node_geometry_support

} // namespace manifold::ui::imgui
