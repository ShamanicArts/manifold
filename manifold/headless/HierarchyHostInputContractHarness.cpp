#include "ContractHarnessUtils.h"
#include "../ui/imgui/HierarchyHostInputSupport.h"

#include <juce_core/juce_core.h>
#include <juce_gui_basics/juce_gui_basics.h>

#include <cmath>
#include <string>

namespace {

juce::var makeObject() {
    return juce::var(new juce::DynamicObject());
}

juce::var makeArray() {
    juce::var out;
    out.resize(0);
    return out;
}

juce::DynamicObject* asObject(juce::var& value) {
    return value.getDynamicObject();
}

juce::Array<juce::var>* asArray(juce::var& value) {
    return value.getArray();
}

void append(juce::var& array, juce::var value) {
    if (auto* arr = asArray(array)) {
        arr->add(std::move(value));
    }
}

double roundTo(double value, int decimals = 4) {
    const double scale = std::pow(10.0, decimals);
    return std::round(value * scale) / scale;
}

juce::var makeEvent(const manifold::ui::imgui::HierarchyHostInputEvent& event) {
    auto obj = makeObject();
    const char* type = "unknown";
    switch (event.type) {
        case manifold::ui::imgui::HierarchyHostInputEventType::MousePos: type = "mousePos"; break;
        case manifold::ui::imgui::HierarchyHostInputEventType::MouseButton: type = "mouseButton"; break;
        case manifold::ui::imgui::HierarchyHostInputEventType::MouseWheel: type = "mouseWheel"; break;
        case manifold::ui::imgui::HierarchyHostInputEventType::Focus: type = "focus"; break;
    }
    asObject(obj)->setProperty("type", type);
    asObject(obj)->setProperty("x", roundTo(event.x));
    asObject(obj)->setProperty("y", roundTo(event.y));
    asObject(obj)->setProperty("button", event.button);
    asObject(obj)->setProperty("down", event.down);
    asObject(obj)->setProperty("focused", event.focused);
    return obj;
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    std::vector<manifold::ui::imgui::HierarchyHostInputEvent> events;
    manifold::ui::imgui::HierarchyHostMouseButtons buttons;

    manifold::ui::imgui::queueHierarchyHostMousePosition(events, { 12.5f, 18.0f });
    manifold::ui::imgui::syncHierarchyHostMouseButtons(
        events,
        buttons,
        juce::ModifierKeys(juce::ModifierKeys::leftButtonModifier | juce::ModifierKeys::rightButtonModifier));
    manifold::ui::imgui::queueHierarchyHostMouseExitIfIdle(events, buttons);
    manifold::ui::imgui::queueHierarchyHostMouseWheel(events, juce::MouseWheelDetails { 0.25f, -1.5f, false, false });
    manifold::ui::imgui::queueHierarchyHostFocus(events, true);
    manifold::ui::imgui::syncHierarchyHostMouseButtons(
        events,
        buttons,
        juce::ModifierKeys(juce::ModifierKeys::leftButtonModifier | juce::ModifierKeys::rightButtonModifier));
    manifold::ui::imgui::releaseHierarchyHostMouseButtons(events, buttons);
    manifold::ui::imgui::releaseHierarchyHostMouseButtons(events, buttons);
    manifold::ui::imgui::queueHierarchyHostMouseExitIfIdle(events, buttons);
    manifold::ui::imgui::queueHierarchyHostFocus(events, false);

    auto encodedEvents = makeArray();
    for (const auto& event : events) {
        append(encodedEvents, makeEvent(event));
    }

    auto contract = makeObject();
    asObject(contract)->setProperty("eventCount", static_cast<int>(events.size()));
    asObject(contract)->setProperty("buttonsLeftDown", buttons.left);
    asObject(contract)->setProperty("buttonsRightDown", buttons.right);
    asObject(contract)->setProperty("buttonsMiddleDown", buttons.middle);
    asObject(contract)->setProperty("events", encodedEvents);

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "HierarchyHostInput contract", raw);
}
