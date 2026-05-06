#include "ContractHarnessUtils.h"
#include "../ui/imgui/PerfOverlaySupport.h"

#include <juce_core/juce_core.h>

namespace {

juce::var makeObject() { return juce::var(new juce::DynamicObject()); }
juce::DynamicObject* asObject(juce::var& value) { return value.getDynamicObject(); }

juce::var makeRect(const juce::Rectangle<int>& rect) {
    auto obj = makeObject();
    asObject(obj)->setProperty("x", rect.getX());
    asObject(obj)->setProperty("y", rect.getY());
    asObject(obj)->setProperty("w", rect.getWidth());
    asObject(obj)->setProperty("h", rect.getHeight());
    return obj;
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    manifold::ui::imgui::PerfOverlaySnapshotData snapshot;
    snapshot.activeTab = "cpu";
    snapshot.title = "Perf";
    snapshot.tabs = {
        { "cpu", "CPU", { {"avg", "10ms"}, {"peak", "20ms"}, {"p99", "30ms"}, {"drop", "1"} } },
        { "gpu", "GPU", { {"avg", "5ms"} } },
        { "mem", "Mem", { } }
    };

    const auto bounds = juce::Rectangle<int>(0, 0, 320, 240);
    const auto title = manifold::ui::imgui::perfOverlayTitleBarBounds(bounds);
    const auto close = manifold::ui::imgui::perfOverlayCloseButtonBounds(bounds);
    const auto tab0 = manifold::ui::imgui::perfOverlayTabBoundsForIndex(bounds, 0);
    const auto tab2 = manifold::ui::imgui::perfOverlayTabBoundsForIndex(bounds, 2);
    const auto content = manifold::ui::imgui::perfOverlayContentBounds(bounds);
    const auto clampedDrag = manifold::ui::imgui::clampPerfOverlayDraggedBounds(
        juce::Rectangle<int>(40, 30, 100, 80),
        juce::Rectangle<int>(0, 0, 220, 180),
        juce::Point<int>(200, 200));

    auto contract = makeObject();
    asObject(contract)->setProperty("titleBar", makeRect(title));
    asObject(contract)->setProperty("closeButton", makeRect(close));
    asObject(contract)->setProperty("tab0", makeRect(tab0));
    asObject(contract)->setProperty("tab2", makeRect(tab2));
    asObject(contract)->setProperty("content", makeRect(content));
    asObject(contract)->setProperty("activeTabId", juce::String(manifold::ui::imgui::resolvePerfOverlayActiveTab(snapshot)->id));
    asObject(contract)->setProperty("visibleRows", manifold::ui::imgui::perfOverlayVisibleRows(content));
    asObject(contract)->setProperty("clampedScroll", manifold::ui::imgui::clampPerfOverlayScrollRows(manifold::ui::imgui::resolvePerfOverlayActiveTab(snapshot), content, 99));
    asObject(contract)->setProperty("nextScrollDown", manifold::ui::imgui::nextPerfOverlayScrollRows(snapshot, content, 0, -1.0f));
    asObject(contract)->setProperty("nextScrollUp", manifold::ui::imgui::nextPerfOverlayScrollRows(snapshot, content, 2, 1.0f));
    asObject(contract)->setProperty("currentTabIndex", manifold::ui::imgui::currentPerfOverlayTabIndex(snapshot));
    asObject(contract)->setProperty("nextTabLeft", manifold::ui::imgui::nextPerfOverlayTabIndex(snapshot, -1));
    asObject(contract)->setProperty("nextTabRight", manifold::ui::imgui::nextPerfOverlayTabIndex(snapshot, 1));
    asObject(contract)->setProperty("valuePosX", manifold::ui::imgui::perfOverlayValuePositionX(juce::Rectangle<int>(10, 10, 100, 20), 50, 32.2f));
    asObject(contract)->setProperty("clampedDrag", makeRect(clampedDrag));

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "PerfOverlaySupport contract", raw);
}
