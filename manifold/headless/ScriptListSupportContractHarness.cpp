#include "ContractHarnessUtils.h"
#include "../ui/imgui/ScriptListSupport.h"

#include <juce_core/juce_core.h>

namespace {

juce::var makeObject() { return juce::var(new juce::DynamicObject()); }
juce::DynamicObject* asObject(juce::var& value) { return value.getDynamicObject(); }

juce::var encodeInteraction(const manifold::ui::imgui::ScriptListInteractionResult& result) {
    auto obj = makeObject();
    asObject(obj)->setProperty("requestSelect", result.requestSelect);
    asObject(obj)->setProperty("requestOpen", result.requestOpen);
    return obj;
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    const manifold::ui::imgui::ScriptListSupportRow sectionRow { true, false, false, false, false, "", "", "ignored", "DSP", "" };
    const manifold::ui::imgui::ScriptListSupportRow nonInteractiveRow { false, true, false, false, false, "", "", "Readme", "", "" };
    const manifold::ui::imgui::ScriptListSupportRow activeDirtyRow { false, false, true, true, true, "dsp", "editor-owned", "Looper", "", "/tmp/loop.lua" };
    const manifold::ui::imgui::ScriptListSupportRow plainRow { false, false, false, false, false, "ui", "project", "Surface", "", "/tmp/ui.lua" };

    auto contract = makeObject();
    asObject(contract)->setProperty("sectionLabel", juce::String(manifold::ui::imgui::buildScriptListDisplayLabel(sectionRow)));
    asObject(contract)->setProperty("nonInteractiveLabel", juce::String(manifold::ui::imgui::buildScriptListDisplayLabel(nonInteractiveRow)));
    asObject(contract)->setProperty("activeDirtyLabel", juce::String(manifold::ui::imgui::buildScriptListDisplayLabel(activeDirtyRow)));
    asObject(contract)->setProperty("plainLabel", juce::String(manifold::ui::imgui::buildScriptListDisplayLabel(plainRow)));
    asObject(contract)->setProperty("activatedOnly", encodeInteraction(manifold::ui::imgui::resolveScriptListInteraction(true, false)));
    asObject(contract)->setProperty("doubleClickOnly", encodeInteraction(manifold::ui::imgui::resolveScriptListInteraction(false, true)));
    asObject(contract)->setProperty("none", encodeInteraction(manifold::ui::imgui::resolveScriptListInteraction(false, false)));

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "ScriptListSupport contract", raw);
}
