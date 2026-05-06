#pragma once

#include "ImGuiDirectHost.h"
#include "DirectHostRenderSupport.h"
#include "imgui.h"

#include <algorithm>
#include <cmath>

namespace direct_host_embedded_panel_support {

inline bool renderEmbeddedRuntimePanel(
    ImGuiDirectHost& host,
    manifold::ui::imgui::RuntimeNodeRenderer& renderer,
    std::unordered_map<uint64_t, ImGuiDirectHost::EmbeddedPanelState>& embeddedPanelStates,
    std::unordered_set<uint64_t>& embeddedPanelTouchedSurfaceIds,
    RuntimeNode& root,
    float width,
    float height,
    const ImGuiDirectHost::EmbeddedPanelOptions& options) {
    if (root.getStableId() == 0 || width <= 0.0f || height <= 0.0f) {
        return false;
    }

    const std::string itemId = "##embedded_runtime_panel_" + std::to_string(root.getStableId());
    ImGui::InvisibleButton(itemId.c_str(), ImVec2(width, height));

    const ImVec2 itemMin = ImGui::GetItemRectMin();
    const ImVec2 itemMax = ImGui::GetItemRectMax();
    auto* drawList = ImGui::GetWindowDrawList();
    if (drawList == nullptr) {
        return false;
    }

    manifold::ui::imgui::RuntimeNodeRenderer::RenderOptions renderOptions;
    renderOptions.leftPad = 0.0f;
    renderOptions.rightPad = 0.0f;
    renderOptions.topPad = 0.0f;
    renderOptions.bottomPad = 0.0f;
    renderOptions.fitToView = options.fitToView;
    renderOptions.showFallbackBoxes = false;
    renderOptions.showNodeLabels = false;
    renderOptions.showSurfaceLabels = false;
    renderOptions.showHoveredOutline = false;
    renderOptions.showSelectedOutline = false;

    auto transform = renderer.buildPreviewTransform(root,
                                                    std::max(1, juce::roundToInt(width)),
                                                    std::max(1, juce::roundToInt(height)),
                                                    renderOptions);
    if (!options.fitToView) {
        const auto& bounds = root.getBounds();
        transform.valid = true;
        transform.scale = 1.0f;
        transform.offsetX = itemMin.x - static_cast<float>(bounds.x);
        transform.offsetY = itemMin.y - static_cast<float>(bounds.y);
    } else {
        transform.offsetX += itemMin.x;
        transform.offsetY += itemMin.y;
    }

    const auto subtreeSceneBounds = direct_host_render_support::collectSceneBoundsRecursive(
        root, direct_host_render_support::SceneTransform{});
    const auto subtreePreviewBounds = direct_host_render_support::previewRect(subtreeSceneBounds, transform);
    const ImVec2 clipMin(std::min(itemMin.x, subtreePreviewBounds.getX()),
                         std::min(itemMin.y, subtreePreviewBounds.getY()));
    const ImVec2 clipMax(std::max(itemMax.x, subtreePreviewBounds.getRight()),
                         std::max(itemMax.y, subtreePreviewBounds.getBottom()));

    auto& state = embeddedPanelStates[root.getStableId()];
    drawList->PushClipRect(clipMin, clipMax, true);
    direct_host_render_support::renderLiveTree(host,
                                               root,
                                               drawList,
                                               renderOptions,
                                               transform,
                                               embeddedPanelTouchedSurfaceIds,
                                               ImGui::GetTime(),
                                               state.hoveredNodeStableId,
                                               state.pressedNodeStableId);
    drawList->PopClipRect();

    const auto mousePos = ImGui::GetIO().MousePos;
    const juce::Point<float> previewPosition(mousePos.x, mousePos.y);
    const auto mods = direct_host_render_support::currentRealtimeModifiers();
    const bool panelHovered = ImGui::IsMouseHoveringRect(clipMin, clipMax, false);

    auto updateHoverForHit = [&](const manifold::ui::imgui::RuntimeNodeRenderer::HitTestResult& hit) {
        const uint64_t nextHovered = hit.node != nullptr ? hit.stableId : 0;
        if (state.hoveredNodeStableId != nextHovered) {
            if (state.hoveredNodeStableId != 0) {
                host.invokeLiveMouseExit(state.hoveredNodeStableId);
            }
            state.hoveredNodeStableId = nextHovered;
            if (nextHovered != 0) {
                host.invokeLiveMouseEnter(nextHovered);
            }
        }
        if (hit.node != nullptr) {
            auto localPosition = direct_host_render_support::localPositionForNodeWithinRoot(
                &root, const_cast<RuntimeNode*>(hit.node), hit.scenePosition);
            host.invokeLiveMouseMove(const_cast<RuntimeNode&>(*hit.node), localPosition, mods);
        }
    };

    if (panelHovered) {
        auto hit = direct_host_render_support::hitTestLiveTreeDetailed(
            renderer,
            &root,
            previewPosition,
            transform,
            manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Pointer);
        updateHoverForHit(hit);

        if (ImGui::IsMouseClicked(ImGuiMouseButton_Left) && hit.node != nullptr) {
            state.pressedNodeStableId = hit.stableId;
            state.dragStartScenePosition = hit.scenePosition;
            auto localPosition = direct_host_render_support::localPositionForNodeWithinRoot(
                &root, const_cast<RuntimeNode*>(hit.node), hit.scenePosition);
            host.setLiveFocus(hit.stableId);
            host.invokeLiveMouseDown(const_cast<RuntimeNode&>(*hit.node), localPosition, mods);
        }

        if (options.captureWheel && std::abs(ImGui::GetIO().MouseWheel) > 0.0001f && hit.node != nullptr) {
            host.invokeLiveMouseWheel(const_cast<RuntimeNode&>(*hit.node), hit.scenePosition, ImGui::GetIO().MouseWheel, mods, &root);
        }
    } else if (state.hoveredNodeStableId != 0) {
        host.invokeLiveMouseExit(state.hoveredNodeStableId);
        state.hoveredNodeStableId = 0;
    }

    if (state.pressedNodeStableId != 0 && ImGui::IsMouseDown(ImGuiMouseButton_Left)) {
        if (auto* pressedNode = host.findLiveNodeByStableId(state.pressedNodeStableId)) {
            const auto scenePosition = juce::Point<float>((previewPosition.x - transform.offsetX) / std::max(0.0001f, transform.scale),
                                                          (previewPosition.y - transform.offsetY) / std::max(0.0001f, transform.scale));
            const auto localPosition = direct_host_render_support::localPositionForNodeWithinRoot(&root, pressedNode, scenePosition);
            const auto dragDelta = juce::Point<float>(scenePosition.x - state.dragStartScenePosition.x,
                                                      scenePosition.y - state.dragStartScenePosition.y);
            host.invokeLiveMouseDrag(*pressedNode, localPosition, dragDelta, mods);
        } else {
            state.pressedNodeStableId = 0;
        }
    }

    if (state.pressedNodeStableId != 0 && ImGui::IsMouseReleased(ImGuiMouseButton_Left)) {
        if (auto* pressedNode = host.findLiveNodeByStableId(state.pressedNodeStableId)) {
            const auto scenePosition = juce::Point<float>((previewPosition.x - transform.offsetX) / std::max(0.0001f, transform.scale),
                                                          (previewPosition.y - transform.offsetY) / std::max(0.0001f, transform.scale));
            const auto localPosition = direct_host_render_support::localPositionForNodeWithinRoot(&root, pressedNode, scenePosition);
            const auto releaseHit = panelHovered
                ? direct_host_render_support::hitTestLiveTreeDetailed(
                      renderer,
                      &root,
                      previewPosition,
                      transform,
                      manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Pointer)
                : manifold::ui::imgui::RuntimeNodeRenderer::HitTestResult{};
            const bool triggerClick = releaseHit.stableId != 0 && releaseHit.stableId == state.pressedNodeStableId;
            const bool triggerDoubleClick = triggerClick && ImGui::IsMouseDoubleClicked(ImGuiMouseButton_Left);
            host.invokeLiveMouseUp(*pressedNode, localPosition, triggerClick, triggerDoubleClick, mods);
        }
        state.pressedNodeStableId = 0;
    }

    return panelHovered;
}

} // namespace direct_host_embedded_panel_support
