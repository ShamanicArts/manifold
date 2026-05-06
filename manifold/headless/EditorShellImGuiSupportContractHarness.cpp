#include "ContractHarnessUtils.h"
#include "../core/EditorShellImGuiSupport.h"

#include <juce_core/juce_core.h>

#include <string>
#include <vector>

namespace {

juce::var makeObject() { return juce::var(new juce::DynamicObject()); }
juce::var makeArray() { juce::var out; out.resize(0); return out; }
juce::DynamicObject* asObject(juce::var& value) { return value.getDynamicObject(); }
juce::Array<juce::var>* asArray(juce::var& value) { return value.getArray(); }
void append(juce::var& array, juce::var value) { if (auto* arr = asArray(array)) arr->add(std::move(value)); }

juce::var encodeHierarchyRow(const ImGuiHierarchyHost::TreeRow& row) {
    auto obj = makeObject();
    asObject(obj)->setProperty("depth", row.depth);
    asObject(obj)->setProperty("selected", row.selected);
    asObject(obj)->setProperty("type", juce::String(row.type));
    asObject(obj)->setProperty("name", juce::String(row.name));
    asObject(obj)->setProperty("path", juce::String(row.path));
    return obj;
}

juce::var encodeInspectorRow(const ImGuiInspectorHost::InspectorRow& row) {
    auto obj = makeObject();
    asObject(obj)->setProperty("rowIndex", row.rowIndex);
    asObject(obj)->setProperty("section", row.section);
    asObject(obj)->setProperty("interactive", row.interactive);
    asObject(obj)->setProperty("selected", row.selected);
    asObject(obj)->setProperty("key", juce::String(row.key));
    asObject(obj)->setProperty("value", juce::String(row.value));
    return obj;
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    std::vector<editor_shell::HierarchyTreeRowData> hierarchyInput {
        { 0, false, "Canvas", "Root", "/root" },
        { 2, true, "Button", "Play", "/root/play" },
        { -1, false, "Label", "Status", "/root/status" },
    };
    const auto hierarchyRows = editor_shell::buildHierarchyHostRows(hierarchyInput);

    std::vector<editor_shell::InspectorRowData> inspectorInput {
        { false, "Transform", "", "" },
        { true, "x", "120", "/bounds/x" },
        { true, "y", "84", "/bounds/y" },
        { false, "metadata", "read-only", "/meta" },
    };
    const auto inspectorRows = editor_shell::buildInspectorHostRows(inspectorInput, "/bounds/y");

    auto hierarchyArray = makeArray();
    for (const auto& row : hierarchyRows) {
        append(hierarchyArray, encodeHierarchyRow(row));
    }

    auto inspectorArray = makeArray();
    for (const auto& row : inspectorRows) {
        append(inspectorArray, encodeInspectorRow(row));
    }

    auto enumResolution = makeObject();
    asObject(enumResolution)->setProperty("fallback", editor_shell::resolveInspectorEnumSelectedIndex({}, 3));
    asObject(enumResolution)->setProperty("middleMatch", editor_shell::resolveInspectorEnumSelectedIndex({ false, true, false }, 1));
    asObject(enumResolution)->setProperty("lastMatch", editor_shell::resolveInspectorEnumSelectedIndex({ false, false, true }, 1));

    auto contract = makeObject();
    asObject(contract)->setProperty("hierarchyRows", hierarchyArray);
    asObject(contract)->setProperty("inspectorRows", inspectorArray);
    asObject(contract)->setProperty("enumResolution", enumResolution);

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "EditorShellImGuiSupport contract", raw);
}
