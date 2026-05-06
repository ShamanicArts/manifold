#include "ContractHarnessUtils.h"
#include "../ui/imgui/RuntimeNodeGeometrySupport.h"

#include <juce_core/juce_core.h>

#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

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

juce::var makeRect(const juce::Rectangle<int>& rect) {
    auto obj = makeObject();
    asObject(obj)->setProperty("x", rect.getX());
    asObject(obj)->setProperty("y", rect.getY());
    asObject(obj)->setProperty("w", rect.getWidth());
    asObject(obj)->setProperty("h", rect.getHeight());
    return obj;
}

juce::var makeRect(const juce::Rectangle<float>& rect) {
    auto obj = makeObject();
    asObject(obj)->setProperty("x", roundTo(rect.getX()));
    asObject(obj)->setProperty("y", roundTo(rect.getY()));
    asObject(obj)->setProperty("w", roundTo(rect.getWidth()));
    asObject(obj)->setProperty("h", roundTo(rect.getHeight()));
    return obj;
}

juce::var makePoint(const juce::Point<float>& point) {
    auto obj = makeObject();
    asObject(obj)->setProperty("x", roundTo(point.x));
    asObject(obj)->setProperty("y", roundTo(point.y));
    return obj;
}

juce::var makeTransform(const manifold::ui::imgui::RuntimeNodePreviewTransformData& transform) {
    auto obj = makeObject();
    asObject(obj)->setProperty("valid", transform.valid);
    asObject(obj)->setProperty("scale", roundTo(transform.scale));
    asObject(obj)->setProperty("offsetX", roundTo(transform.offsetX));
    asObject(obj)->setProperty("offsetY", roundTo(transform.offsetY));
    asObject(obj)->setProperty("sceneBounds", makeRect(transform.sceneBounds));
    return obj;
}

juce::var makeHit(const manifold::ui::imgui::RuntimeNodeHitTestResultData& hit) {
    auto obj = makeObject();
    asObject(obj)->setProperty("hit", hit.node != nullptr);
    asObject(obj)->setProperty("nodeId", hit.node != nullptr ? juce::String(hit.node->getNodeId()) : juce::String());
    asObject(obj)->setProperty("stableIdPositive", hit.stableId > 0);
    asObject(obj)->setProperty("sceneBounds", makeRect(hit.sceneBounds));
    asObject(obj)->setProperty("scenePosition", makePoint(hit.scenePosition));
    return obj;
}

juce::Point<float> sceneToPreview(const juce::Point<float>& scene,
                                  const manifold::ui::imgui::RuntimeNodePreviewTransformData& transform) {
    return { transform.offsetX + scene.x * transform.scale,
             transform.offsetY + scene.y * transform.scale };
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    RuntimeNode root("root");
    root.setNodeId("root");
    root.setBounds(0, 0, 10, 10);
    root.setInputCapabilities({ false, false, false, false, false });

    auto* transformed = root.createChild("transformed");
    transformed->setNodeId("transformed");
    transformed->setBounds(-30, 120, 40, 40);
    transformed->setTransform(2.0f, 1.5f, 5.0f, -10.0f);
    transformed->setZOrder(-1);
    transformed->setInputCapabilities({ true, false, false, false, false });

    auto* knob = root.createChild("knob");
    knob->setNodeId("knob");
    knob->setBounds(20, 20, 100, 80);
    knob->setZOrder(1);
    knob->setInputCapabilities({ true, false, false, false, false });

    auto* wheelOnly = root.createChild("wheelOnly");
    wheelOnly->setNodeId("wheelOnly");
    wheelOnly->setBounds(40, 40, 80, 60);
    wheelOnly->setZOrder(2);
    wheelOnly->setInputCapabilities({ false, true, false, false, false });

    auto* clipped = root.createChild("clipped");
    clipped->setNodeId("clipped");
    clipped->setBounds(200, 20, 100, 80);
    clipped->setClipRect(10, 10, 20, 20);
    clipped->setZOrder(3);
    clipped->setInputCapabilities({ true, false, false, false, false });

    const auto visibleBounds = manifold::ui::imgui::runtime_node_geometry_support::collectVisibleBounds(root);
    const auto fitTransform = manifold::ui::imgui::runtime_node_geometry_support::buildPreviewTransform(root, 220, 160, 10.0f, 10.0f, 20.0f, 10.0f, true);
    const auto rawTransform = manifold::ui::imgui::runtime_node_geometry_support::buildPreviewTransform(root, 220, 160, 10.0f, 10.0f, 20.0f, 10.0f, false);
    const auto previewBounds = manifold::ui::imgui::runtime_node_geometry_support::previewRect(visibleBounds, fitTransform);

    const auto overlapPreview = sceneToPreview({ 50.0f, 50.0f }, fitTransform);
    const auto clipInsidePreview = sceneToPreview({ 225.0f, 45.0f }, fitTransform);
    const auto clipOutsidePreview = sceneToPreview({ 205.0f, 25.0f }, fitTransform);
    const auto transformedPreview = sceneToPreview({ 0.0f, 130.0f }, fitTransform);
    const auto rootPreview = sceneToPreview({ 5.0f, 5.0f }, fitTransform);

    const auto pointerHit = manifold::ui::imgui::runtime_node_geometry_support::hitTest(
        root, overlapPreview, fitTransform, manifold::ui::imgui::RuntimeNodeHitTestModeData::Pointer);
    const auto wheelHit = manifold::ui::imgui::runtime_node_geometry_support::hitTest(
        root, overlapPreview, fitTransform, manifold::ui::imgui::RuntimeNodeHitTestModeData::Wheel);
    const auto anyVisibleHit = manifold::ui::imgui::runtime_node_geometry_support::hitTest(
        root, overlapPreview, fitTransform, manifold::ui::imgui::RuntimeNodeHitTestModeData::AnyVisible);
    const auto clippedInsideHit = manifold::ui::imgui::runtime_node_geometry_support::hitTest(
        root, clipInsidePreview, fitTransform, manifold::ui::imgui::RuntimeNodeHitTestModeData::Pointer);
    const auto clippedOutsideHit = manifold::ui::imgui::runtime_node_geometry_support::hitTest(
        root, clipOutsidePreview, fitTransform, manifold::ui::imgui::RuntimeNodeHitTestModeData::Pointer);
    const auto transformedHit = manifold::ui::imgui::runtime_node_geometry_support::hitTest(
        root, transformedPreview, fitTransform, manifold::ui::imgui::RuntimeNodeHitTestModeData::Pointer);
    const auto rootAnyVisibleHit = manifold::ui::imgui::runtime_node_geometry_support::hitTest(
        root, rootPreview, fitTransform, manifold::ui::imgui::RuntimeNodeHitTestModeData::AnyVisible);

    auto sortedChildren = makeArray();
    for (auto* child : manifold::ui::imgui::runtime_node_geometry_support::sortedChildren(root)) {
        append(sortedChildren, juce::String(child->getNodeId()));
    }

    auto contract = makeObject();
    asObject(contract)->setProperty("visibleBounds", makeRect(visibleBounds));
    asObject(contract)->setProperty("fitTransform", makeTransform(fitTransform));
    asObject(contract)->setProperty("rawTransform", makeTransform(rawTransform));
    asObject(contract)->setProperty("previewBounds", makeRect(previewBounds));
    asObject(contract)->setProperty("sortedChildren", sortedChildren);
    asObject(contract)->setProperty("pointerHit", makeHit(pointerHit));
    asObject(contract)->setProperty("wheelHit", makeHit(wheelHit));
    asObject(contract)->setProperty("anyVisibleHit", makeHit(anyVisibleHit));
    asObject(contract)->setProperty("clippedInsideHit", makeHit(clippedInsideHit));
    asObject(contract)->setProperty("clippedOutsideHit", makeHit(clippedOutsideHit));
    asObject(contract)->setProperty("transformedHit", makeHit(transformedHit));
    asObject(contract)->setProperty("rootAnyVisibleHit", makeHit(rootAnyVisibleHit));

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "RuntimeNodeGeometry contract", raw);
}
