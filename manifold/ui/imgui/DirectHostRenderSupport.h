#pragma once

#include "ImGuiDirectHost.h"
#include "external/imgui/imgui.h"
#include "external/imgui/imgui_internal.h"

#include <algorithm>
#include <cfloat>
#include <cmath>
#include <cstdio>
#include <unordered_set>
#include <vector>

namespace direct_host_render_support {

inline bool isCtrlLikeDown(const juce::ModifierKeys& mods) {
    return mods.isCtrlDown() || mods.isCommandDown();
}

inline juce::ModifierKeys currentRealtimeModifiers() {
    return juce::ModifierKeys::getCurrentModifiersRealtime();
}

template <typename... Args>
void invokeLuaCallback(sol::function& fn, const char* label, const std::string& nodeId, Args&&... args) {
    if (!fn.valid()) {
        return;
    }

    sol::protected_function protectedFn = fn;
    auto result = protectedFn(std::forward<Args>(args)...);
    if (!result.valid()) {
        sol::error err = result;
        std::fprintf(stderr, "[ImGuiDirectHost] %s error for %s: %s\n",
                     label,
                     nodeId.c_str(),
                     err.what());
    }
}

inline void clearFocusRecursive(RuntimeNode& node) {
    node.setFocused(false);
    for (auto* child : node.getChildren()) {
        if (child != nullptr) {
            clearFocusRecursive(*child);
        }
    }
}

inline manifold::ui::imgui::RuntimeNodeRenderer::RenderOptions makeDirectRenderOptions(bool debugOutlines = false) {
    manifold::ui::imgui::RuntimeNodeRenderer::RenderOptions options;
    options.leftPad = 0.0f;
    options.rightPad = 0.0f;
    options.topPad = 0.0f;
    options.bottomPad = 0.0f;
    options.fitToView = false;
    options.showFallbackBoxes = false;
    options.showNodeLabels = false;
    options.showSurfaceLabels = false;
    options.showHoveredOutline = debugOutlines;
    options.showSelectedOutline = debugOutlines;
    return options;
}

inline manifold::ui::imgui::RuntimeNodeRenderer::HitTestResult hitTestLiveTreeDetailed(
    manifold::ui::imgui::RuntimeNodeRenderer& renderer,
    RuntimeNode* root,
    juce::Point<float> position,
    const manifold::ui::imgui::RuntimeNodeRenderer::PreviewTransform& transform,
    manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode mode) {
    if (root == nullptr || !transform.valid || transform.scale <= 0.0f) {
        return {};
    }

    manifold::ui::imgui::RuntimeNodeRenderer::Snapshot liveSnapshot;
    liveSnapshot.root = root;
    return renderer.hitTest(liveSnapshot, position, transform, mode);
}

inline juce::Rectangle<float> sceneBoundsForNodeWithinRoot(RuntimeNode* root, RuntimeNode* node) {
    if (node == nullptr) {
        return {};
    }

    struct NodeSceneTransform {
        float scaleX = 1.0f;
        float scaleY = 1.0f;
        float offsetX = 0.0f;
        float offsetY = 0.0f;
    } transform;

    std::vector<RuntimeNode*> lineage;
    bool foundRoot = root == nullptr;
    for (RuntimeNode* current = node; current != nullptr; current = current->getParent()) {
        lineage.push_back(current);
        if (current == root) {
            foundRoot = true;
            break;
        }
    }
    if (!foundRoot) {
        lineage.clear();
        for (RuntimeNode* current = node; current != nullptr; current = current->getParent()) {
            lineage.push_back(current);
        }
    }
    std::reverse(lineage.begin(), lineage.end());

    for (auto* current : lineage) {
        const auto& bounds = current->getBounds();
        const auto& nodeTransform = current->getTransform();
        transform.offsetX += transform.scaleX * (static_cast<float>(bounds.x) + nodeTransform.translateX);
        transform.offsetY += transform.scaleY * (static_cast<float>(bounds.y) + nodeTransform.translateY);
        transform.scaleX *= nodeTransform.scaleX;
        transform.scaleY *= nodeTransform.scaleY;
    }

    const auto& bounds = node->getBounds();
    const float x1 = transform.offsetX;
    const float y1 = transform.offsetY;
    const float x2 = transform.offsetX + transform.scaleX * static_cast<float>(bounds.w);
    const float y2 = transform.offsetY + transform.scaleY * static_cast<float>(bounds.h);
    const float left = std::min(x1, x2);
    const float top = std::min(y1, y2);
    const float right = std::max(x1, x2);
    const float bottom = std::max(y1, y2);
    return juce::Rectangle<float>(left, top, std::max(1.0f, right - left), std::max(1.0f, bottom - top));
}

inline juce::Point<float> localPositionForNodeWithinRoot(RuntimeNode* root,
                                                  RuntimeNode* node,
                                                  juce::Point<float> scenePosition) {
    if (node == nullptr) {
        return scenePosition;
    }

    const auto sceneBounds = sceneBoundsForNodeWithinRoot(root, node);
    const auto& bounds = node->getBounds();
    const float scaleX = bounds.w > 0 ? (sceneBounds.getWidth() / static_cast<float>(bounds.w)) : 1.0f;
    const float scaleY = bounds.h > 0 ? (sceneBounds.getHeight() / static_cast<float>(bounds.h)) : 1.0f;
    return juce::Point<float>((scenePosition.x - sceneBounds.getX()) / std::max(0.0001f, scaleX),
                              (scenePosition.y - sceneBounds.getY()) / std::max(0.0001f, scaleY));
}

inline juce::Point<float> localPositionForNode(RuntimeNode* node,
                                        juce::Point<float> scenePosition) {
    return localPositionForNodeWithinRoot(nullptr, node, scenePosition);
}

inline ImU32 toImColor(uint32_t argb) {
    const auto a = static_cast<ImU32>((argb >> 24) & 0xffu);
    const auto r = static_cast<ImU32>((argb >> 16) & 0xffu);
    const auto g = static_cast<ImU32>((argb >> 8) & 0xffu);
    const auto b = static_cast<ImU32>(argb & 0xffu);
    return IM_COL32(r, g, b, a);
}

inline juce::Rectangle<float> previewRect(const juce::Rectangle<int>& sceneRect,
                                   const ImGuiDirectHost::PreviewTransform& transform) {
    const float x1 = transform.offsetX + static_cast<float>(sceneRect.getX()) * transform.scale;
    const float y1 = transform.offsetY + static_cast<float>(sceneRect.getY()) * transform.scale;
    const float x2 = transform.offsetX + static_cast<float>(sceneRect.getRight()) * transform.scale;
    const float y2 = transform.offsetY + static_cast<float>(sceneRect.getBottom()) * transform.scale;
    return juce::Rectangle<float>(x1, y1, std::max(1.0f, x2 - x1), std::max(1.0f, y2 - y1));
}

inline juce::Rectangle<float> previewRect(const juce::Rectangle<float>& sceneRect,
                                   const ImGuiDirectHost::PreviewTransform& transform) {
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

inline juce::Rectangle<float> containRectWithin(const juce::Rectangle<float>& bounds,
                                        float contentWidth,
                                        float contentHeight) {
    if (contentWidth <= 0.0f || contentHeight <= 0.0f) {
        return bounds;
    }
    const float sx = bounds.getWidth() / contentWidth;
    const float sy = bounds.getHeight() / contentHeight;
    const float scale = std::min(sx, sy);
    const float drawW = std::max(1.0f, contentWidth * scale);
    const float drawH = std::max(1.0f, contentHeight * scale);
    const float drawX = bounds.getX() + (bounds.getWidth() - drawW) * 0.5f;
    const float drawY = bounds.getY() + (bounds.getHeight() - drawH) * 0.5f;
    return juce::Rectangle<float>(drawX, drawY, drawW, drawH);
}

inline bool videoBackedFitModeForNode(const RuntimeNode& node, std::string& fitModeOut) {
    if (node.getCustomSurfaceType() == "video_input"
        || node.getCustomSurfaceType() == "ml_mask"
        || node.getCustomSurfaceType() == "ml_composite") {
        fitModeOut = "contain";
        const auto payload = node.getCustomRenderPayload();
        if (auto* obj = payload.getDynamicObject(); obj != nullptr) {
            const auto fitMode = obj->getProperty("fitMode").toString().toStdString();
            if (!fitMode.empty()) {
                fitModeOut = fitMode;
            }
        }
        return true;
    }

    if (node.getCustomSurfaceType() != "gpu_shader" && node.getCustomSurfaceType() != "gpu_composite") {
        return false;
    }

    const auto payload = node.getCustomRenderPayload();
    if (auto* obj = payload.getDynamicObject(); obj != nullptr) {
        fitModeOut = obj->getProperty("fitMode").toString().toStdString();
        if (fitModeOut.empty()) {
            fitModeOut = "contain";
        }
        return true;
    }

    return false;
}

inline void invokeOnImGuiFrameRecursive(RuntimeNode& traversalRoot, RuntimeNode& node) {
    if (!node.isVisible()) {
        return;
    }

    auto& callbacks = node.getCallbacks();
    if (callbacks.onImGuiFrame.valid()) {
        sol::protected_function fn = callbacks.onImGuiFrame;
        auto result = fn(node);
        if (!result.valid()) {
            sol::error err = result;
            std::fprintf(stderr, "[ImGuiDirectHost] onImGuiFrame error for %s: %s\n",
                         node.getNodeId().c_str(), err.what());
        }
    }

    std::vector<uint64_t> childStableIds;
    childStableIds.reserve(node.getChildren().size());
    for (auto* child : node.getChildren()) {
        if (child != nullptr) {
            childStableIds.push_back(child->getStableId());
        }
    }

    for (auto stableId : childStableIds) {
        auto* child = traversalRoot.findByStableId(stableId);
        if (child != nullptr && child->getParent() == &node) {
            invokeOnImGuiFrameRecursive(traversalRoot, *child);
        }
    }
}

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

inline juce::Rectangle<float> collectSceneBoundsRecursive(const RuntimeNode& node,
                                                   const SceneTransform& parentTransform) {
    const auto& bounds = node.getBounds();
    const auto nodeTransform = composeSceneTransform(node, parentTransform);
    juce::Rectangle<float> out = sceneRectFromLocalRect(juce::Rectangle<float>(0.0f,
                                                                                0.0f,
                                                                                static_cast<float>(bounds.w),
                                                                                static_cast<float>(bounds.h)),
                                                        nodeTransform);

    for (auto* child : node.getChildren()) {
        if (child == nullptr || !child->isVisible()) {
            continue;
        }
        out = out.getUnion(collectSceneBoundsRecursive(*child, nodeTransform));
    }
    return out;
}

inline juce::Rectangle<int> enclosingIntRect(const juce::Rectangle<float>& rect) {
    const int x = juce::roundToInt(std::floor(rect.getX()));
    const int y = juce::roundToInt(std::floor(rect.getY()));
    const int r = juce::roundToInt(std::ceil(rect.getRight()));
    const int b = juce::roundToInt(std::ceil(rect.getBottom()));
    return juce::Rectangle<int>(x, y, std::max(0, r - x), std::max(0, b - y));
}

inline ImVec2 toImVec2(const juce::Rectangle<float>& rect) {
    return ImVec2(rect.getX(), rect.getY());
}

inline ImVec2 toImVec2BottomRight(const juce::Rectangle<float>& rect) {
    return ImVec2(rect.getRight(), rect.getBottom());
}

struct DrawState {
    ImU32 color = IM_COL32_WHITE;
    float fontSize = 13.0f;
    std::vector<juce::Rectangle<int>> clipStack;
};

inline void popClipStackTo(ImDrawList* drawList,
                    std::vector<juce::Rectangle<int>>& clipStack,
                    std::size_t targetSize) {
    while (clipStack.size() > targetSize) {
        drawList->PopClipRect();
        clipStack.pop_back();
    }
}

inline void renderCompiledDisplayList(const manifold::ui::imgui::CompiledDisplayList& compiled,
                               const juce::Rectangle<int>& sceneBounds,
                               ImDrawList* drawList,
                               DrawState& state,
                               const ImGuiDirectHost::PreviewTransform& transform) {
    std::vector<DrawState> stateStack;

    for (const auto& cmd : compiled.commands) {
        if (cmd.type == manifold::ui::imgui::CompiledDrawCmd::Type::Save) {
            stateStack.push_back(state);
            continue;
        }
        if (cmd.type == manifold::ui::imgui::CompiledDrawCmd::Type::Restore) {
            if (!stateStack.empty()) {
                const auto saved = stateStack.back();
                stateStack.pop_back();
                popClipStackTo(drawList, state.clipStack, saved.clipStack.size());
                state = saved;
            }
            continue;
        }

        if (cmd.hasColor) {
            state.color = cmd.color;
        }
        if (cmd.hasFontSize) {
            state.fontSize = cmd.fontSize;
        }

        const juce::Rectangle<int> sceneRect(sceneBounds.getX() + juce::roundToInt(cmd.x),
                                             sceneBounds.getY() + juce::roundToInt(cmd.y),
                                             juce::roundToInt(cmd.w),
                                             juce::roundToInt(cmd.h));
        const auto rect = previewRect(sceneRect, transform);
        const float scaledRadius = cmd.radius * transform.scale;
        const float scaledThickness = std::max(1.0f, cmd.thickness * transform.scale);

        switch (cmd.type) {
            case manifold::ui::imgui::CompiledDrawCmd::Type::FillRect:
                drawList->AddRectFilled(toImVec2(rect), toImVec2BottomRight(rect), state.color);
                break;
            case manifold::ui::imgui::CompiledDrawCmd::Type::DrawRect:
                drawList->AddRect(toImVec2(rect), toImVec2BottomRight(rect), state.color, scaledRadius, 0, scaledThickness);
                break;
            case manifold::ui::imgui::CompiledDrawCmd::Type::FillRoundedRect:
                drawList->AddRectFilled(toImVec2(rect), toImVec2BottomRight(rect), state.color, scaledRadius);
                break;
            case manifold::ui::imgui::CompiledDrawCmd::Type::DrawRoundedRect:
                drawList->AddRect(toImVec2(rect), toImVec2BottomRight(rect), state.color, scaledRadius, 0, scaledThickness);
                break;
            case manifold::ui::imgui::CompiledDrawCmd::Type::DrawLine: {
                const ImVec2 p1(transform.offsetX + (static_cast<float>(sceneBounds.getX()) + cmd.x1) * transform.scale,
                                transform.offsetY + (static_cast<float>(sceneBounds.getY()) + cmd.y1) * transform.scale);
                const ImVec2 p2(transform.offsetX + (static_cast<float>(sceneBounds.getX()) + cmd.x2) * transform.scale,
                                transform.offsetY + (static_cast<float>(sceneBounds.getY()) + cmd.y2) * transform.scale);
                drawList->AddLine(p1, p2, state.color, scaledThickness);
                break;
            }
            case manifold::ui::imgui::CompiledDrawCmd::Type::DrawBezier: {
                const ImVec2 p1(transform.offsetX + (static_cast<float>(sceneBounds.getX()) + cmd.x1) * transform.scale,
                                transform.offsetY + (static_cast<float>(sceneBounds.getY()) + cmd.y1) * transform.scale);
                const ImVec2 cp1(transform.offsetX + (static_cast<float>(sceneBounds.getX()) + cmd.cx1) * transform.scale,
                                 transform.offsetY + (static_cast<float>(sceneBounds.getY()) + cmd.cy1) * transform.scale);
                const ImVec2 cp2(transform.offsetX + (static_cast<float>(sceneBounds.getX()) + cmd.cx2) * transform.scale,
                                 transform.offsetY + (static_cast<float>(sceneBounds.getY()) + cmd.cy2) * transform.scale);
                const ImVec2 p2(transform.offsetX + (static_cast<float>(sceneBounds.getX()) + cmd.x2) * transform.scale,
                                transform.offsetY + (static_cast<float>(sceneBounds.getY()) + cmd.y2) * transform.scale);
                drawList->AddBezierCubic(p1, cp1, cp2, p2, state.color, scaledThickness, cmd.segments);
                break;
            }
            case manifold::ui::imgui::CompiledDrawCmd::Type::DrawText: {
                const float fontSize = std::max(1.0f, state.fontSize * transform.scale);
                auto* font = ImGui::GetFont();
                if (font == nullptr) {
                    break;
                }
                const ImVec2 textSize = font->CalcTextSizeA(fontSize, FLT_MAX, 0.0f, cmd.text.c_str());
                float textX = rect.getX();
                float textY = rect.getY();

                if (cmd.align == "center") {
                    textX += std::max(0.0f, (rect.getWidth() - textSize.x) * 0.5f);
                } else if (cmd.align == "right") {
                    textX += std::max(0.0f, rect.getWidth() - textSize.x - 4.0f);
                } else {
                    textX += 4.0f;
                }

                if (cmd.valign == "middle") {
                    textY += std::max(0.0f, (rect.getHeight() - textSize.y) * 0.5f);
                } else if (cmd.valign == "bottom") {
                    textY += std::max(0.0f, rect.getHeight() - textSize.y - 2.0f);
                } else {
                    textY += 2.0f;
                }

                drawList->PushClipRect(toImVec2(rect), toImVec2BottomRight(rect), true);
                drawList->AddText(font, fontSize, ImVec2(textX, textY), state.color, cmd.text.c_str());
                drawList->PopClipRect();
                break;
            }
            case manifold::ui::imgui::CompiledDrawCmd::Type::DrawImage:
                if (cmd.textureId != 0) {
                    drawList->AddImage(static_cast<ImTextureID>(cmd.textureId),
                                       toImVec2(rect),
                                       toImVec2BottomRight(rect),
                                       ImVec2(cmd.u0, cmd.v0),
                                       ImVec2(cmd.u1, cmd.v1),
                                       state.color);
                }
                break;
            case manifold::ui::imgui::CompiledDrawCmd::Type::ClipRect: {
                const auto clipMin = toImVec2(rect);
                const auto clipMax = toImVec2BottomRight(rect);
                const bool validClip = clipMin.x < clipMax.x && clipMin.y < clipMax.y;
                if (validClip) {
                    drawList->PushClipRect(clipMin, clipMax, true);
                    state.clipStack.push_back(sceneRect);
                }
                break;
            }
            case manifold::ui::imgui::CompiledDrawCmd::Type::PopClipRect:
                if (!state.clipStack.empty()) {
                    drawList->PopClipRect();
                    state.clipStack.pop_back();
                }
                break;
            case manifold::ui::imgui::CompiledDrawCmd::Type::FillCircle: {
                const ImVec2 center(transform.offsetX + (static_cast<float>(sceneBounds.getX()) + cmd.x + cmd.radius) * transform.scale,
                                    transform.offsetY + (static_cast<float>(sceneBounds.getY()) + cmd.y + cmd.radius) * transform.scale);
                drawList->AddCircleFilled(center, cmd.radius * transform.scale, state.color, cmd.segments);
                break;
            }
            case manifold::ui::imgui::CompiledDrawCmd::Type::DrawCircle: {
                const ImVec2 center(transform.offsetX + (static_cast<float>(sceneBounds.getX()) + cmd.x + cmd.radius) * transform.scale,
                                    transform.offsetY + (static_cast<float>(sceneBounds.getY()) + cmd.y + cmd.radius) * transform.scale);
                drawList->AddCircle(center, cmd.radius * transform.scale, state.color, cmd.segments, scaledThickness);
                break;
            }
            case manifold::ui::imgui::CompiledDrawCmd::Type::DrawArc: {
                const ImVec2 center(transform.offsetX + (static_cast<float>(sceneBounds.getX()) + cmd.x) * transform.scale,
                                    transform.offsetY + (static_cast<float>(sceneBounds.getY()) + cmd.y) * transform.scale);
                const float r = cmd.radius * transform.scale;
                drawList->PathArcTo(center, r, cmd.startAngle, cmd.endAngle, cmd.segments > 0 ? cmd.segments : 0);
                drawList->PathStroke(state.color, 0, scaledThickness);
                break;
            }
            case manifold::ui::imgui::CompiledDrawCmd::Type::FillPolygon:
                if (cmd.polyPoints.size() >= 3) {
                    std::vector<ImVec2> pts;
                    pts.reserve(cmd.polyPoints.size());
                    for (const auto& p : cmd.polyPoints) {
                        pts.emplace_back(transform.offsetX + (static_cast<float>(sceneBounds.getX()) + p.first) * transform.scale,
                                         transform.offsetY + (static_cast<float>(sceneBounds.getY()) + p.second) * transform.scale);
                    }
                    drawList->AddConcavePolyFilled(pts.data(), static_cast<int>(pts.size()), state.color);
                }
                break;
            case manifold::ui::imgui::CompiledDrawCmd::Type::DrawPolyline:
                if (cmd.polyPoints.size() >= 2) {
                    std::vector<ImVec2> pts;
                    pts.reserve(cmd.polyPoints.size());
                    for (const auto& p : cmd.polyPoints) {
                        pts.emplace_back(transform.offsetX + (static_cast<float>(sceneBounds.getX()) + p.first) * transform.scale,
                                         transform.offsetY + (static_cast<float>(sceneBounds.getY()) + p.second) * transform.scale);
                    }
                    drawList->AddPolyline(pts.data(), static_cast<int>(pts.size()), state.color, 0, scaledThickness);
                }
                break;
            case manifold::ui::imgui::CompiledDrawCmd::Type::SetColor:
            case manifold::ui::imgui::CompiledDrawCmd::Type::SetFontSize:
            case manifold::ui::imgui::CompiledDrawCmd::Type::Save:
            case manifold::ui::imgui::CompiledDrawCmd::Type::Restore:
                break;
        }
    }

    while (!stateStack.empty()) {
        const auto saved = stateStack.back();
        stateStack.pop_back();
        popClipStackTo(drawList, state.clipStack, saved.clipStack.size());
        state = saved;
    }

    popClipStackTo(drawList, state.clipStack, 0);
}

inline std::vector<RuntimeNode*> sortedLiveChildren(const RuntimeNode& node) {
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

inline int buildRenderSnapshotRecursive(const RuntimeNode& node,
                                 juce::Point<int> parentOffset,
                                 ImGuiDirectHost::RenderSnapshot& snapshot) {
    const auto& bounds = node.getBounds();
    const int index = static_cast<int>(snapshot.nodes.size());
    snapshot.nodes.emplace_back();
    snapshot.nodes[static_cast<std::size_t>(index)].sceneBounds = juce::Rectangle<int>(parentOffset.x + bounds.x,
                                                                                        parentOffset.y + bounds.y,
                                                                                        bounds.w,
                                                                                        bounds.h);
    snapshot.nodes[static_cast<std::size_t>(index)].style = node.getStyle();
    snapshot.nodes[static_cast<std::size_t>(index)].visible = node.isVisible();
    snapshot.nodes[static_cast<std::size_t>(index)].hasClipRect = node.hasClipRect();
    if (snapshot.nodes[static_cast<std::size_t>(index)].hasClipRect) {
        const auto& clip = node.getClipRect();
        snapshot.nodes[static_cast<std::size_t>(index)].clipRect = juce::Rectangle<int>(clip.x, clip.y, clip.w, clip.h);
    }
    snapshot.nodes[static_cast<std::size_t>(index)].zOrder = node.getZOrder();
    snapshot.nodes[static_cast<std::size_t>(index)].stableId = node.getStableId();
    snapshot.nodes[static_cast<std::size_t>(index)].compiledDisplayList = node.getCompiledDisplayList();
    snapshot.nodes[static_cast<std::size_t>(index)].customSurfaceType = node.getCustomSurfaceType();
    snapshot.nodes[static_cast<std::size_t>(index)].customRenderPayload = node.getCustomRenderPayload().clone();

    if (!snapshot.nodes[static_cast<std::size_t>(index)].visible) {
        return index;
    }

    const auto sceneBounds = snapshot.nodes[static_cast<std::size_t>(index)].sceneBounds;
    for (auto* child : sortedLiveChildren(node)) {
        const int childIndex = buildRenderSnapshotRecursive(*child,
                                                            juce::Point<int>(sceneBounds.getX(), sceneBounds.getY()),
                                                            snapshot);
        snapshot.nodes[static_cast<std::size_t>(index)].childIndices.push_back(childIndex);
    }

    return index;
}

inline void renderSnapshotNodeRecursive(const ImGuiDirectHost::RenderSnapshot& snapshot,
                                 int nodeIndex,
                                 ImDrawList* drawList,
                                 const manifold::ui::imgui::RuntimeNodeRenderer::RenderOptions& options,
                                 int depth) {
    if (nodeIndex < 0 || nodeIndex >= static_cast<int>(snapshot.nodes.size())) {
        return;
    }

    const auto& node = snapshot.nodes[static_cast<std::size_t>(nodeIndex)];
    if (!node.visible) {
        return;
    }

    const auto bounds = previewRect(node.sceneBounds, snapshot.transform);
    const auto& style = node.style;

    bool pushedNodeClip = false;
    if (node.hasClipRect) {
        const juce::Rectangle<int> sceneClip(node.sceneBounds.getX() + node.clipRect.getX(),
                                             node.sceneBounds.getY() + node.clipRect.getY(),
                                             node.clipRect.getWidth(),
                                             node.clipRect.getHeight());
        const auto clipRect = previewRect(sceneClip, snapshot.transform);
        drawList->PushClipRect(toImVec2(clipRect), toImVec2BottomRight(clipRect), true);
        pushedNodeClip = true;
    }

    const bool hasBackground = ((style.background >> 24) & 0xffu) != 0u;
    const bool hasBorder = ((style.border >> 24) & 0xffu) != 0u && style.borderWidth > 0.0f;
    const float cornerRadius = std::max(0.0f, style.cornerRadius * snapshot.transform.scale);
    const float borderWidth = std::max(1.0f, style.borderWidth * snapshot.transform.scale);

    if (hasBackground) {
        drawList->AddRectFilled(toImVec2(bounds), toImVec2BottomRight(bounds), toImColor(style.background), cornerRadius);
    } else if (options.showFallbackBoxes && depth > 0) {
        drawList->AddRectFilled(toImVec2(bounds), toImVec2BottomRight(bounds), IM_COL32(255, 255, 255, 12), cornerRadius);
    }

    if (hasBorder) {
        drawList->AddRect(toImVec2(bounds), toImVec2BottomRight(bounds), toImColor(style.border), cornerRadius, 0, borderWidth);
    } else if (options.showFallbackBoxes) {
        drawList->AddRect(toImVec2(bounds), toImVec2BottomRight(bounds), IM_COL32(148, 163, 184, depth == 0 ? 140 : 90), cornerRadius, 0, 1.0f);
    }

    if (node.compiledDisplayList && !node.compiledDisplayList->commands.empty()) {
        DrawState state;
        renderCompiledDisplayList(*node.compiledDisplayList, node.sceneBounds, drawList, state, snapshot.transform);
    }

    for (int childIndex : node.childIndices) {
        renderSnapshotNodeRecursive(snapshot, childIndex, drawList, options, depth + 1);
    }

    if (pushedNodeClip) {
        drawList->PopClipRect();
    }
}

[[maybe_unused]] inline void renderSnapshot(const ImGuiDirectHost::RenderSnapshot& snapshot,
                    ImDrawList* drawList,
                    const manifold::ui::imgui::RuntimeNodeRenderer::RenderOptions& options) {
    if (drawList == nullptr || !snapshot.transform.valid || snapshot.rootIndex < 0) {
        return;
    }

    renderSnapshotNodeRecursive(snapshot, snapshot.rootIndex, drawList, options, 0);
}


inline void renderLiveNodeRecursive(ImGuiDirectHost& host,
                             const RuntimeNode& node,
                             const SceneTransform& parentTransform,
                             ImDrawList* drawList,
                             const manifold::ui::imgui::RuntimeNodeRenderer::RenderOptions& options,
                             const ImGuiDirectHost::PreviewTransform& transform,
                             std::unordered_set<uint64_t>& touchedSurfaceIds,
                             double timeSeconds,
                             int depth,
                             uint64_t hoveredStableId,
                             uint64_t selectedStableId) {
    if (!node.isVisible()) {
        return;
    }

    const auto& nodeBounds = node.getBounds();
    if (nodeBounds.w <= 0 || nodeBounds.h <= 0) {
        return;
    }

    const auto nodeTransform = composeSceneTransform(node, parentTransform);
    const auto sceneBounds = sceneRectFromLocalRect(juce::Rectangle<float>(0.0f,
                                                                           0.0f,
                                                                           static_cast<float>(nodeBounds.w),
                                                                           static_cast<float>(nodeBounds.h)),
                                                    nodeTransform);
    const auto bounds = previewRect(sceneBounds, transform);
    const auto& style = node.getStyle();
    const float nodeScale = transform.scale * std::min(std::abs(nodeTransform.scaleX), std::abs(nodeTransform.scaleY));

    bool pushedNodeClip = false;
    if (node.hasClipRect()) {
        const auto& clip = node.getClipRect();
        const auto sceneClip = sceneRectFromLocalRect(juce::Rectangle<float>(static_cast<float>(clip.x),
                                                                             static_cast<float>(clip.y),
                                                                             static_cast<float>(clip.w),
                                                                             static_cast<float>(clip.h)),
                                                      nodeTransform);
        const auto clipRect = previewRect(sceneClip, transform);
        drawList->PushClipRect(toImVec2(clipRect), toImVec2BottomRight(clipRect), true);
        pushedNodeClip = true;
    }

    const bool hasBackground = ((style.background >> 24) & 0xffu) != 0u;
    const bool hasBorder = ((style.border >> 24) & 0xffu) != 0u && style.borderWidth > 0.0f;
    const float cornerRadius = std::max(0.0f, style.cornerRadius * nodeScale);
    const float borderWidth = std::max(1.0f, style.borderWidth * nodeScale);

    if (hasBackground) {
        drawList->AddRectFilled(toImVec2(bounds), toImVec2BottomRight(bounds), toImColor(style.background), cornerRadius);
    } else if (options.showFallbackBoxes && depth > 0) {
        drawList->AddRectFilled(toImVec2(bounds), toImVec2BottomRight(bounds), IM_COL32(255, 255, 255, 12), cornerRadius);
    }

    if (!node.getCustomSurfaceType().empty()) {
        touchedSurfaceIds.insert(node.getStableId());
        const auto textureHandle = host.prepareCustomSurfaceTexture(node,
                                                                    std::max(1, juce::roundToInt(sceneBounds.getWidth())),
                                                                    std::max(1, juce::roundToInt(sceneBounds.getHeight())),
                                                                    timeSeconds);
        if (textureHandle != 0) {
            auto drawBounds = bounds;
            std::string fitMode;
            if (videoBackedFitModeForNode(node, fitMode) && fitMode == "contain") {
                int videoWidth = 0;
                int videoHeight = 0;
                uint64_t videoSequence = 0;
                if (host.getVideoSurfaceInfo(node.getStableId(), videoWidth, videoHeight, videoSequence)) {
                    juce::ignoreUnused(videoSequence);
                    drawBounds = containRectWithin(bounds,
                                                   static_cast<float>(videoWidth),
                                                   static_cast<float>(videoHeight));
                }
            }
            drawList->AddImage(static_cast<ImTextureID>(textureHandle),
                               toImVec2(drawBounds),
                               toImVec2BottomRight(drawBounds),
                               ImVec2(0, 0),
                               ImVec2(1, 1),
                               IM_COL32_WHITE);
        }
    }

    if (hasBorder) {
        drawList->AddRect(toImVec2(bounds), toImVec2BottomRight(bounds), toImColor(style.border), cornerRadius, 0, borderWidth);
    } else if (options.showFallbackBoxes) {
        drawList->AddRect(toImVec2(bounds), toImVec2BottomRight(bounds), IM_COL32(148, 163, 184, depth == 0 ? 140 : 90), cornerRadius, 0, 1.0f);
    }

    DrawState state;
    if (auto compiled = node.getCompiledDisplayList(); compiled && !compiled->commands.empty()) {
        renderCompiledDisplayList(*compiled, enclosingIntRect(sceneBounds), drawList, state, transform);
    }

    auto children = sortedLiveChildren(node);
    for (auto* child : children) {
        renderLiveNodeRecursive(host,
                                *child,
                                nodeTransform,
                                drawList,
                                options,
                                transform,
                                touchedSurfaceIds,
                                timeSeconds,
                                depth + 1,
                                hoveredStableId,
                                selectedStableId);
    }

    // Draw debug outlines on top of children
    if (options.showHoveredOutline && node.getStableId() == hoveredStableId) {
        drawList->AddRect(toImVec2(bounds), toImVec2BottomRight(bounds), IM_COL32(255, 255, 255, 180), cornerRadius, 0, 2.0f);
    }
    if (options.showSelectedOutline && node.getStableId() == selectedStableId) {
        drawList->AddRect(toImVec2(bounds), toImVec2BottomRight(bounds), IM_COL32(56, 189, 248, 255), cornerRadius, 0, 3.0f);
    }

    if (pushedNodeClip) {
        drawList->PopClipRect();
    }
}

inline void renderLiveTree(ImGuiDirectHost& host,
                    const RuntimeNode& root,
                    ImDrawList* drawList,
                    const manifold::ui::imgui::RuntimeNodeRenderer::RenderOptions& options,
                    const ImGuiDirectHost::PreviewTransform& transform,
                    std::unordered_set<uint64_t>& touchedSurfaceIds,
                    double timeSeconds,
                    uint64_t hoveredStableId,
                    uint64_t selectedStableId) {
    renderLiveNodeRecursive(host,
                            root,
                            SceneTransform{},
                            drawList,
                            options,
                            transform,
                            touchedSurfaceIds,
                            timeSeconds,
                            0,
                            hoveredStableId,
                            selectedStableId);
}

} // namespace direct_host_render_support
