#pragma once

#include "external/imgui/imgui.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

namespace manifold::ui::imgui {

struct ToolComponentRuntimeParamSupport {
    std::string endpointPath;
    std::string path;
    std::string displayValue;
    bool active = false;
    bool hasValue = false;
    double value = 0.0;
    bool hasMin = false;
    bool hasMax = false;
    double minValue = 0.0;
    double maxValue = 1.0;
    double stepValue = 0.0;
};

struct ToolComponentGraphNode {
    std::string var;
    std::string prim;
};

struct ToolComponentGraphEdge {
    int fromIndex = -1;
    int toIndex = -1;
};

struct ToolComponentGraphPoint {
    float x = 0.0f;
    float y = 0.0f;
};

struct ToolComponentGraphLayout {
    std::vector<ToolComponentGraphPoint> centers;
    std::vector<ToolComponentGraphPoint> corners;
    int columns = 0;
    float cellW = 110.0f;
    float cellH = 48.0f;
    float nodeW = 96.0f;
    float nodeH = 24.0f;
};

inline ImVec4 toolComponentArgbToImVec4(std::uint32_t argb) {
    const float a = static_cast<float>((argb >> 24) & 0xffu) / 255.0f;
    const float r = static_cast<float>((argb >> 16) & 0xffu) / 255.0f;
    const float g = static_cast<float>((argb >> 8) & 0xffu) / 255.0f;
    const float b = static_cast<float>(argb & 0xffu) / 255.0f;
    return ImVec4(r, g, b, a);
}

inline std::uint32_t toolComponentImVec4ToArgb(const ImVec4& rgba) {
    const auto clampByte = [](float v) {
        return static_cast<std::uint32_t>(std::clamp(v, 0.0f, 1.0f) * 255.0f + 0.5f);
    };
    const std::uint32_t r = clampByte(rgba.x);
    const std::uint32_t g = clampByte(rgba.y);
    const std::uint32_t b = clampByte(rgba.z);
    const std::uint32_t a = clampByte(rgba.w);
    return (a << 24) | (r << 16) | (g << 8) | b;
}

inline double resolveToolComponentRuntimeStep(const ToolComponentRuntimeParamSupport& param) {
    if (param.stepValue > 0.0) {
        return param.stepValue;
    }

    if (param.hasMin && param.hasMax) {
        const auto span = std::abs(param.maxValue - param.minValue);
        if (span <= 2.0) {
            return 0.01;
        }
        if (span <= 20.0) {
            return 0.1;
        }
        return std::max(0.01, span / 100.0);
    }

    return std::max(0.01, std::abs(param.value) * 0.05);
}

inline ToolComponentGraphLayout buildToolComponentGraphLayout(std::size_t nodeCount,
                                                              float originX,
                                                              float originY) {
    ToolComponentGraphLayout layout;
    if (nodeCount == 0) {
        return layout;
    }

    layout.columns = std::max(1, static_cast<int>(std::ceil(std::sqrt(static_cast<double>(nodeCount)))));
    layout.centers.resize(nodeCount);
    layout.corners.resize(nodeCount);

    for (std::size_t i = 0; i < nodeCount; ++i) {
        const int col = static_cast<int>(i) % layout.columns;
        const int row = static_cast<int>(i) / layout.columns;
        const float x = originX + static_cast<float>(col) * layout.cellW;
        const float y = originY + static_cast<float>(row) * layout.cellH;
        layout.corners[i] = { x, y };
        layout.centers[i] = { x + layout.nodeW * 0.5f, y + layout.nodeH * 0.5f };
    }

    return layout;
}

inline bool toolComponentGraphEdgeIsRenderable(const ToolComponentGraphLayout& layout,
                                               const ToolComponentGraphEdge& edge) {
    if (edge.fromIndex < 1 || edge.toIndex < 1) {
        return false;
    }
    const auto fromIndex = static_cast<std::size_t>(edge.fromIndex - 1);
    const auto toIndex = static_cast<std::size_t>(edge.toIndex - 1);
    return fromIndex < layout.centers.size() && toIndex < layout.centers.size();
}

inline std::string buildToolComponentGraphNodeLabel(const ToolComponentGraphNode& node) {
    return node.var + ":" + node.prim;
}

} // namespace manifold::ui::imgui
