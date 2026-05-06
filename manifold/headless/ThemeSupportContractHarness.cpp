#include "ContractHarnessUtils.h"
#include "../ui/imgui/ThemeSupport.h"

#include "external/imgui/imgui.h"

#include <juce_core/juce_core.h>

#include <cmath>
#include <cstdint>

namespace {

juce::var makeObject() {
    return juce::var(new juce::DynamicObject());
}

double roundTo(double value, int decimals = 4) {
    const double scale = std::pow(10.0, decimals);
    return std::round(value * scale) / scale;
}

juce::DynamicObject* asObject(juce::var& value) {
    return value.getDynamicObject();
}

juce::var makeVec2(const ImVec2& value) {
    auto obj = makeObject();
    asObject(obj)->setProperty("x", roundTo(value.x));
    asObject(obj)->setProperty("y", roundTo(value.y));
    return obj;
}

juce::var makeStyleSnapshot(const manifold::ui::imgui::ToolThemeStyleSnapshot& snapshot) {
    auto obj = makeObject();
    asObject(obj)->setProperty("windowRounding", roundTo(snapshot.windowRounding));
    asObject(obj)->setProperty("childRounding", roundTo(snapshot.childRounding));
    asObject(obj)->setProperty("frameRounding", roundTo(snapshot.frameRounding));
    asObject(obj)->setProperty("windowPadding", makeVec2(snapshot.windowPadding));
    asObject(obj)->setProperty("framePadding", makeVec2(snapshot.framePadding));
    asObject(obj)->setProperty("itemSpacing", makeVec2(snapshot.itemSpacing));
    asObject(obj)->setProperty("indentSpacing", roundTo(snapshot.indentSpacing));
    asObject(obj)->setProperty("scrollbarSize", roundTo(snapshot.scrollbarSize));
    asObject(obj)->setProperty("windowBg", static_cast<juce::int64>(ImGui::ColorConvertFloat4ToU32(snapshot.colors[ImGuiCol_WindowBg])));
    asObject(obj)->setProperty("childBg", static_cast<juce::int64>(ImGui::ColorConvertFloat4ToU32(snapshot.colors[ImGuiCol_ChildBg])));
    asObject(obj)->setProperty("header", static_cast<juce::int64>(ImGui::ColorConvertFloat4ToU32(snapshot.colors[ImGuiCol_Header])));
    asObject(obj)->setProperty("buttonHovered", static_cast<juce::int64>(ImGui::ColorConvertFloat4ToU32(snapshot.colors[ImGuiCol_ButtonHovered])));
    asObject(obj)->setProperty("navHighlight", static_cast<juce::int64>(ImGui::ColorConvertFloat4ToU32(snapshot.colors[ImGuiCol_NavHighlight])));
    return obj;
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    IMGUI_CHECKVERSION();
    auto* context = ImGui::CreateContext();
    ImGui::SetCurrentContext(context);

    const auto snapshot = manifold::ui::imgui::makeToolThemeStyleSnapshot(manifold::ui::imgui::toolTheme());
    manifold::ui::imgui::applyToolTheme();
    const auto& style = ImGui::GetStyle();

    auto contract = makeObject();
    asObject(contract)->setProperty("snapshot", makeStyleSnapshot(snapshot));
    asObject(contract)->setProperty("actualWindowPadding", makeVec2(style.WindowPadding));
    asObject(contract)->setProperty("actualFramePadding", makeVec2(style.FramePadding));
    asObject(contract)->setProperty("actualItemSpacing", makeVec2(style.ItemSpacing));
    asObject(contract)->setProperty("actualIndentSpacing", roundTo(style.IndentSpacing));
    asObject(contract)->setProperty("actualScrollbarSize", roundTo(style.ScrollbarSize));
    asObject(contract)->setProperty("actualWindowBg", static_cast<juce::int64>(ImGui::ColorConvertFloat4ToU32(style.Colors[ImGuiCol_WindowBg])));
    asObject(contract)->setProperty("actualHeader", static_cast<juce::int64>(ImGui::ColorConvertFloat4ToU32(style.Colors[ImGuiCol_Header])));
    asObject(contract)->setProperty("actualNavHighlight", static_cast<juce::int64>(ImGui::ColorConvertFloat4ToU32(style.Colors[ImGuiCol_NavHighlight])));
    asObject(contract)->setProperty("windowPaddingMatches", style.WindowPadding.x == snapshot.windowPadding.x && style.WindowPadding.y == snapshot.windowPadding.y);
    asObject(contract)->setProperty("framePaddingMatches", style.FramePadding.x == snapshot.framePadding.x && style.FramePadding.y == snapshot.framePadding.y);
    asObject(contract)->setProperty("windowBgMatches", ImGui::ColorConvertFloat4ToU32(style.Colors[ImGuiCol_WindowBg]) == ImGui::ColorConvertFloat4ToU32(snapshot.colors[ImGuiCol_WindowBg]));
    asObject(contract)->setProperty("headerMatches", ImGui::ColorConvertFloat4ToU32(style.Colors[ImGuiCol_Header]) == ImGui::ColorConvertFloat4ToU32(snapshot.colors[ImGuiCol_Header]));

    const auto raw = juce::JSON::toString(contract, true).toStdString();

    ImGui::DestroyContext(context);
    return contract_harness_utils::finishJsonContract(options, "ThemeSupport contract", raw);
}
