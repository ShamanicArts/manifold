#include "ContractHarnessUtils.h"
#include "../ui/imgui/RuntimeNodeHostSupport.h"

#include <juce_core/juce_core.h>

#include <cmath>

namespace {

juce::var makeObject() { return juce::var(new juce::DynamicObject()); }
juce::DynamicObject* asObject(juce::var& value) { return value.getDynamicObject(); }

double roundTo(double value, int decimals = 4) {
    const double scale = std::pow(10.0, decimals);
    return std::round(value * scale) / scale;
}

juce::var makePoint(const juce::Point<float>& point) {
    auto obj = makeObject();
    asObject(obj)->setProperty("x", roundTo(point.x));
    asObject(obj)->setProperty("y", roundTo(point.y));
    return obj;
}

juce::var makeHover(const manifold::ui::imgui::RuntimeNodeHostHoverUpdate& update) {
    auto obj = makeObject();
    asObject(obj)->setProperty("previousHoveredStableId", static_cast<juce::int64>(update.previousHoveredStableId));
    asObject(obj)->setProperty("nextHoveredStableId", static_cast<juce::int64>(update.nextHoveredStableId));
    asObject(obj)->setProperty("nextHoveredId", juce::String(update.nextHoveredId));
    asObject(obj)->setProperty("exitPrevious", update.exitPrevious);
    asObject(obj)->setProperty("enterNext", update.enterNext);
    asObject(obj)->setProperty("invokeMove", update.invokeMove);
    asObject(obj)->setProperty("localPosition", makePoint(update.localPosition));
    return obj;
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    const auto scenePosition = manifold::ui::imgui::runtimeNodeHostScenePositionFromPreview({ 110.0f, 74.0f }, true, 2.0f, 10.0f, 14.0f);
    const auto localPosition = manifold::ui::imgui::runtimeNodeHostLocalPositionFromHit({ true, 7, "nodeA", { 20, 30, 50, 40 }, { 42.0f, 56.0f } });
    const auto hoverEnter = manifold::ui::imgui::computeRuntimeNodeHostHoverUpdate(0, { true, 7, "nodeA", { 20, 30, 50, 40 }, { 42.0f, 56.0f } }, true);
    const auto hoverMoveOnly = manifold::ui::imgui::computeRuntimeNodeHostHoverUpdate(7, { true, 7, "nodeA", { 20, 30, 50, 40 }, { 45.0f, 60.0f } }, true);
    const auto hoverExit = manifold::ui::imgui::computeRuntimeNodeHostHoverUpdate(7, { false, 0, "", {}, {} }, false);

    auto contract = makeObject();
    asObject(contract)->setProperty("scenePosition", makePoint(scenePosition));
    asObject(contract)->setProperty("invalidScenePosition", makePoint(manifold::ui::imgui::runtimeNodeHostScenePositionFromPreview({ 10.0f, 10.0f }, false, 0.0f, 0.0f, 0.0f)));
    asObject(contract)->setProperty("localPosition", makePoint(localPosition));
    asObject(contract)->setProperty("hoverEnter", makeHover(hoverEnter));
    asObject(contract)->setProperty("hoverMoveOnly", makeHover(hoverMoveOnly));
    asObject(contract)->setProperty("hoverExit", makeHover(hoverExit));
    asObject(contract)->setProperty("requestExitReplace", manifold::ui::imgui::runtimeNodeHostShouldRequestExit(manifold::ui::imgui::RuntimeNodeHostPresentationModeData::Replace, juce::KeyPress::escapeKey));
    asObject(contract)->setProperty("requestExitPreview", manifold::ui::imgui::runtimeNodeHostShouldRequestExit(manifold::ui::imgui::RuntimeNodeHostPresentationModeData::DebugPreview, juce::KeyPress::escapeKey));
    asObject(contract)->setProperty("triggerClick", manifold::ui::imgui::runtimeNodeHostShouldTriggerClick(true, false, false));
    asObject(contract)->setProperty("suppressClickOnDrag", manifold::ui::imgui::runtimeNodeHostShouldTriggerClick(true, false, true));
    asObject(contract)->setProperty("suppressClickOnDouble", manifold::ui::imgui::runtimeNodeHostShouldTriggerClick(true, true, false));

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "RuntimeNodeHostSupport contract", raw);
}
