#pragma once

#include <string>

namespace editor_renderer {

enum class RuntimeRendererMode {
    Canvas = 0,
    ImGuiOverlay = 1,
    ImGuiReplace = 2,
    ImGuiDirect = 3,
};

inline const char* runtimeRendererModeToString(RuntimeRendererMode mode) {
    switch (mode) {
        case RuntimeRendererMode::Canvas:
            return "canvas";
        case RuntimeRendererMode::ImGuiOverlay:
            return "imgui-overlay";
        case RuntimeRendererMode::ImGuiReplace:
            return "imgui-replace";
        case RuntimeRendererMode::ImGuiDirect:
            return "imgui-direct";
    }
    return "canvas";
}

inline RuntimeRendererMode runtimeRendererModeFromString(
    const std::string& value,
    RuntimeRendererMode fallback) {
    std::string normalized;
    normalized.reserve(value.size());
    for (char ch : value) {
        if (ch >= 'A' && ch <= 'Z') {
            normalized.push_back(static_cast<char>(ch - 'A' + 'a'));
        } else {
            normalized.push_back(ch == '_' ? '-' : ch);
        }
    }

    if (normalized.empty()) {
        return fallback;
    }
    if (normalized == "0" || normalized == "off" || normalized == "false" || normalized == "canvas") {
        return RuntimeRendererMode::Canvas;
    }
    if (normalized == "1" || normalized == "on" || normalized == "true" || normalized == "imgui"
        || normalized == "overlay" || normalized == "imgui-overlay") {
        return RuntimeRendererMode::ImGuiOverlay;
    }
    if (normalized == "replace" || normalized == "full" || normalized == "imgui-replace"
        || normalized == "imgui-full") {
        return RuntimeRendererMode::ImGuiReplace;
    }
    if (normalized == "direct" || normalized == "imgui-direct") {
        return RuntimeRendererMode::ImGuiDirect;
    }
    return fallback;
}

} // namespace editor_renderer
