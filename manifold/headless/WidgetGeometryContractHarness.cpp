#include "ContractHarnessUtils.h"
#include "../ui/imgui/WidgetGeometrySupport.h"

#include <juce_core/juce_core.h>

#include <cmath>
#include <cstdint>
#include <string>

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

juce::var makeStyle(const manifold::ui::imgui::WidgetRowResolvedStyle& style) {
    auto obj = makeObject();
    asObject(obj)->setProperty("rowHeight", roundTo(style.rowHeight));
    asObject(obj)->setProperty("background", static_cast<juce::int64>(style.background));
    asObject(obj)->setProperty("separator", static_cast<juce::int64>(style.separator));
    asObject(obj)->setProperty("labelColor", static_cast<juce::int64>(style.labelColor));
    asObject(obj)->setProperty("detailColor", static_cast<juce::int64>(style.detailColor));
    return obj;
}

juce::var makeLayout(const manifold::ui::imgui::WidgetRowLayout& layout) {
    auto obj = makeObject();
    asObject(obj)->setProperty("left", roundTo(layout.left));
    asObject(obj)->setProperty("right", roundTo(layout.right));
    asObject(obj)->setProperty("textY", roundTo(layout.textY));
    asObject(obj)->setProperty("detailX", roundTo(layout.detailX));
    asObject(obj)->setProperty("clipMaxX", roundTo(layout.clipMaxX));
    return obj;
}

juce::var makeHeaderLayout(const manifold::ui::imgui::SectionHeaderLayout& layout) {
    auto obj = makeObject();
    asObject(obj)->setProperty("width", roundTo(layout.width));
    asObject(obj)->setProperty("height", roundTo(layout.height));
    asObject(obj)->setProperty("textX", roundTo(layout.textX));
    asObject(obj)->setProperty("textY", roundTo(layout.textY));
    asObject(obj)->setProperty("lineY", roundTo(layout.lineY));
    asObject(obj)->setProperty("lineStart", roundTo(layout.lineStart));
    return obj;
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    const auto& theme = manifold::ui::imgui::toolTheme();
    constexpr float textLineHeight = 14.0f;
    constexpr float detailWidth = 42.0f;
    constexpr ImVec2 min(10.0f, 20.0f);
    constexpr ImVec2 max(210.0f, 46.0f);

    const manifold::ui::imgui::RowOptions defaultRow { "Node", "Type", false, false, 24.0f };
    const manifold::ui::imgui::RowOptions selectedRow { "Selected", "Detail", true, false, 12.0f };
    const manifold::ui::imgui::RowOptions mutedRow { "Muted", nullptr, false, true, 0.0f };

    const auto defaultStyle = manifold::ui::imgui::resolveWidgetRowStyle(theme, defaultRow, true, false, textLineHeight);
    const auto selectedStyle = manifold::ui::imgui::resolveWidgetRowStyle(theme, selectedRow, false, false, textLineHeight);
    const auto activeStyle = manifold::ui::imgui::resolveWidgetRowStyle(theme, defaultRow, false, true, textLineHeight);
    const auto mutedStyle = manifold::ui::imgui::resolveWidgetRowStyle(theme, mutedRow, false, false, textLineHeight);

    const auto defaultLayout = manifold::ui::imgui::computeWidgetRowLayout(theme, defaultRow, min, max, textLineHeight, detailWidth);
    const auto selectedLayout = manifold::ui::imgui::computeWidgetRowLayout(theme, selectedRow, min, max, textLineHeight, 36.0f);
    const auto mutedLayout = manifold::ui::imgui::computeWidgetRowLayout(theme, mutedRow, min, max, textLineHeight, 0.0f);
    const auto headerLayout = manifold::ui::imgui::computeSectionHeaderLayout(theme, ImVec2(8.0f, 16.0f), 180.0f, textLineHeight, 54.0f);

    auto contract = makeObject();
    asObject(contract)->setProperty("rowHeight", roundTo(manifold::ui::imgui::resolveWidgetRowHeight(theme, textLineHeight)));
    asObject(contract)->setProperty("rowWidthClamp", roundTo(manifold::ui::imgui::resolveWidgetRowWidth(-9.0f)));
    asObject(contract)->setProperty("defaultStyle", makeStyle(defaultStyle));
    asObject(contract)->setProperty("selectedStyle", makeStyle(selectedStyle));
    asObject(contract)->setProperty("activeStyle", makeStyle(activeStyle));
    asObject(contract)->setProperty("mutedStyle", makeStyle(mutedStyle));
    asObject(contract)->setProperty("defaultLayout", makeLayout(defaultLayout));
    asObject(contract)->setProperty("selectedLayout", makeLayout(selectedLayout));
    asObject(contract)->setProperty("mutedLayout", makeLayout(mutedLayout));
    asObject(contract)->setProperty("headerLayout", makeHeaderLayout(headerLayout));

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "WidgetGeometry contract", raw);
}
