#include "ContractHarnessUtils.h"
#include "../ui/imgui/ToolComponentSupport.h"

#include <juce_core/juce_core.h>

#include <cmath>

namespace {

juce::var makeObject() { return juce::var(new juce::DynamicObject()); }
juce::var makeArray() { juce::var out; out.resize(0); return out; }
juce::DynamicObject* asObject(juce::var& value) { return value.getDynamicObject(); }
juce::Array<juce::var>* asArray(juce::var& value) { return value.getArray(); }
void append(juce::var& array, juce::var value) { if (auto* arr = asArray(array)) arr->add(std::move(value)); }

double roundTo(double value, int decimals = 4) {
    const double scale = std::pow(10.0, decimals);
    return std::round(value * scale) / scale;
}

juce::var makeVec2(const manifold::ui::imgui::ToolComponentGraphPoint& point) {
    auto obj = makeObject();
    asObject(obj)->setProperty("x", roundTo(point.x));
    asObject(obj)->setProperty("y", roundTo(point.y));
    return obj;
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    const auto rgba = manifold::ui::imgui::toolComponentArgbToImVec4(0x80402010u);
    const auto argb = manifold::ui::imgui::toolComponentImVec4ToArgb(rgba);

    manifold::ui::imgui::ToolComponentRuntimeParamSupport bounded;
    bounded.value = 0.5;
    bounded.hasMin = true;
    bounded.hasMax = true;
    bounded.minValue = -1.0;
    bounded.maxValue = 1.0;

    manifold::ui::imgui::ToolComponentRuntimeParamSupport wide;
    wide.value = 10.0;
    wide.hasMin = true;
    wide.hasMax = true;
    wide.minValue = 0.0;
    wide.maxValue = 200.0;

    manifold::ui::imgui::ToolComponentRuntimeParamSupport explicitStep;
    explicitStep.stepValue = 0.25;

    const auto layout = manifold::ui::imgui::buildToolComponentGraphLayout(5, 12.0f, 24.0f);

    auto centers = makeArray();
    for (const auto& center : layout.centers) {
        append(centers, makeVec2(center));
    }
    auto corners = makeArray();
    for (const auto& corner : layout.corners) {
        append(corners, makeVec2(corner));
    }

    auto contract = makeObject();
    asObject(contract)->setProperty("rgbaX", roundTo(rgba.x));
    asObject(contract)->setProperty("rgbaY", roundTo(rgba.y));
    asObject(contract)->setProperty("rgbaZ", roundTo(rgba.z));
    asObject(contract)->setProperty("rgbaW", roundTo(rgba.w));
    asObject(contract)->setProperty("roundTripArgb", static_cast<juce::int64>(argb));
    asObject(contract)->setProperty("boundedStep", roundTo(manifold::ui::imgui::resolveToolComponentRuntimeStep(bounded)));
    asObject(contract)->setProperty("wideStep", roundTo(manifold::ui::imgui::resolveToolComponentRuntimeStep(wide)));
    asObject(contract)->setProperty("explicitStep", roundTo(manifold::ui::imgui::resolveToolComponentRuntimeStep(explicitStep)));
    asObject(contract)->setProperty("graphColumns", layout.columns);
    asObject(contract)->setProperty("graphCenters", centers);
    asObject(contract)->setProperty("graphCorners", corners);
    asObject(contract)->setProperty("edgeRenderable", manifold::ui::imgui::toolComponentGraphEdgeIsRenderable(layout, {1, 5}));
    asObject(contract)->setProperty("edgeInvalid", manifold::ui::imgui::toolComponentGraphEdgeIsRenderable(layout, {0, 7}));
    asObject(contract)->setProperty("nodeLabel", juce::String(manifold::ui::imgui::buildToolComponentGraphNodeLabel({"osc1", "Gain"})));

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "ToolComponentSupport contract", raw);
}
