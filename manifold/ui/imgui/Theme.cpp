#include "Theme.h"
#include "ThemeSupport.h"

#include <juce_core/juce_core.h>

namespace manifold {
namespace ui {
namespace imgui {

const ThemeTokens& toolTheme() {
    static const ThemeTokens theme;
    return theme;
}

ImU32 toU32(const ImVec4& color) {
    return ImGui::ColorConvertFloat4ToU32(color);
}

void configureToolFonts(ImGuiIO& io) {
    auto* atlas = io.Fonts;
    if (atlas == nullptr) {
        return;
    }

    atlas->Clear();

    static const ImWchar baseRanges[] = {
        0x0020, 0x00FF,
        0,
    };
    static const ImWchar symbolRanges[] = {
        0x2190, 0x21FF,
        0x2300, 0x27BF,
        0x2B00, 0x2BFF,
        0,
    };

    ImFontConfig baseConfig;
    baseConfig.OversampleH = 2;
    baseConfig.OversampleV = 2;
    baseConfig.PixelSnapH = false;
    baseConfig.SizePixels = 16.0f;

    ImFont* baseFont = nullptr;
    const juce::String baseCandidates[] = {
        "/usr/share/fonts/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/liberation/LiberationSans-Regular.ttf",
    };

    for (const auto& path : baseCandidates) {
        if (juce::File(path).existsAsFile()) {
            baseFont = atlas->AddFontFromFileTTF(path.toRawUTF8(), 16.0f, &baseConfig, baseRanges);
            if (baseFont != nullptr) {
                break;
            }
        }
    }

    if (baseFont == nullptr) {
        baseFont = atlas->AddFontDefault();
    }

    const juce::File symbolFont("/usr/share/fonts/noto/NotoSansSymbols2-Regular.ttf");
    if (symbolFont.existsAsFile()) {
        ImFontConfig symbolConfig;
        symbolConfig.MergeMode = true;
        symbolConfig.OversampleH = 2;
        symbolConfig.OversampleV = 2;
        symbolConfig.PixelSnapH = false;
        symbolConfig.SizePixels = 16.0f;
        atlas->AddFontFromFileTTF(symbolFont.getFullPathName().toRawUTF8(), 16.0f, &symbolConfig, symbolRanges);
    }

    io.FontDefault = baseFont;
}

void applyToolTheme() {
    const auto snapshot = makeToolThemeStyleSnapshot(toolTheme());

    ImGui::StyleColorsDark();
    auto& style = ImGui::GetStyle();
    style.WindowRounding = snapshot.windowRounding;
    style.ChildRounding = snapshot.childRounding;
    style.FrameRounding = snapshot.frameRounding;
    style.PopupRounding = snapshot.popupRounding;
    style.GrabRounding = snapshot.grabRounding;
    style.TabRounding = snapshot.tabRounding;
    style.WindowBorderSize = snapshot.windowBorderSize;
    style.ChildBorderSize = snapshot.childBorderSize;
    style.FrameBorderSize = snapshot.frameBorderSize;
    style.WindowPadding = snapshot.windowPadding;
    style.FramePadding = snapshot.framePadding;
    style.ItemSpacing = snapshot.itemSpacing;
    style.ItemInnerSpacing = snapshot.itemInnerSpacing;
    style.CellPadding = snapshot.cellPadding;
    style.IndentSpacing = snapshot.indentSpacing;
    style.ScrollbarSize = snapshot.scrollbarSize;

    for (int colorIndex = 0; colorIndex < ImGuiCol_COUNT; ++colorIndex) {
        style.Colors[colorIndex] = snapshot.colors[static_cast<size_t>(colorIndex)];
    }
}

void beginFullWindow(const char* windowId, int width, int height) {
    ImGui::SetNextWindowPos(ImVec2(0.0f, 0.0f), ImGuiCond_Always);
    ImGui::SetNextWindowSize(ImVec2(static_cast<float>(width), static_cast<float>(height)), ImGuiCond_Always);

    constexpr ImGuiWindowFlags windowFlags = ImGuiWindowFlags_NoDecoration
                                           | ImGuiWindowFlags_NoMove
                                           | ImGuiWindowFlags_NoResize
                                           | ImGuiWindowFlags_NoSavedSettings
                                           | ImGuiWindowFlags_NoBringToFrontOnFocus;

    ImGui::Begin(windowId, nullptr, windowFlags);
}

} // namespace imgui
} // namespace ui
} // namespace manifold
