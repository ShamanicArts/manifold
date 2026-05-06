#include "ContractHarnessUtils.h"
#include "../ui/imgui/InspectorHostStateSupport.h"

#include <juce_core/juce_core.h>

namespace {

juce::var makeObject() { return juce::var(new juce::DynamicObject()); }
juce::DynamicObject* asObject(juce::var& value) { return value.getDynamicObject(); }

const char* encodeLanguage(manifold::ui::imgui::TextInputHostLanguageDefinition id) {
    switch (id) {
        case manifold::ui::imgui::TextInputHostLanguageDefinition::None: return "None";
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Cpp: return "Cpp";
        case manifold::ui::imgui::TextInputHostLanguageDefinition::C: return "C";
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Cs: return "Cs";
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Python: return "Python";
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Lua: return "Lua";
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Json: return "Json";
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Sql: return "Sql";
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Glsl: return "Glsl";
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Hlsl: return "Hlsl";
    }
    return "Unknown";
}

juce::var encodeTextState(const manifold::ui::imgui::InspectorTextEditState& state) {
    auto obj = makeObject();
    asObject(obj)->setProperty("path", juce::String(state.path));
    asObject(obj)->setProperty("lastSourceValue", juce::String(state.lastSourceValue));
    asObject(obj)->setProperty("buffer", juce::String(state.buffer));
    return obj;
}

juce::var encodeInlineUpdate(const manifold::ui::imgui::InspectorInlineDocumentUpdate& update) {
    auto obj = makeObject();
    asObject(obj)->setProperty("clearState", update.clearState);
    asObject(obj)->setProperty("setReadOnly", update.setReadOnly);
    asObject(obj)->setProperty("reloadDocument", update.reloadDocument);
    asObject(obj)->setProperty("nextPath", juce::String(update.nextPath));
    asObject(obj)->setProperty("nextSyncToken", static_cast<juce::int64>(update.nextSyncToken));
    asObject(obj)->setProperty("language", encodeLanguage(update.language));
    return obj;
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    ImGuiInspectorHost::ActiveProperty emptyProperty;

    ImGuiInspectorHost::ActiveProperty textProperty;
    textProperty.valid = true;
    textProperty.editorType = "text";
    textProperty.path = "/widget/title";
    textProperty.textValue = "hello";

    ImGuiInspectorHost::ActiveProperty textPropertyChanged = textProperty;
    textPropertyChanged.textValue = "world";

    ImGuiInspectorHost::ActiveProperty numberProperty = textProperty;
    numberProperty.editorType = "number";

    const auto resetState = manifold::ui::imgui::syncInspectorTextEditState(
        emptyProperty,
        { "/stale", "old", "dirty" });
    const auto initialState = manifold::ui::imgui::syncInspectorTextEditState(
        textProperty,
        {});
    const auto unchangedState = manifold::ui::imgui::syncInspectorTextEditState(
        textProperty,
        initialState);
    const auto changedState = manifold::ui::imgui::syncInspectorTextEditState(
        textPropertyChanged,
        initialState);
    const auto nonTextState = manifold::ui::imgui::syncInspectorTextEditState(
        numberProperty,
        changedState);

    ImGuiInspectorHost::ScriptInspectorData emptyScript;

    ImGuiInspectorHost::ScriptInspectorData luaScript;
    luaScript.path = "/tmp/test.lua";
    luaScript.syncToken = 7;
    luaScript.inlineReadOnly = true;

    ImGuiInspectorHost::ScriptInspectorData shaderScript = luaScript;
    shaderScript.path = "/tmp/effect.glsl";
    shaderScript.syncToken = 9;

    const auto emptyUpdate = manifold::ui::imgui::resolveInspectorInlineDocumentUpdate(emptyScript, "/tmp/old.lua", 4);
    const auto sameUpdate = manifold::ui::imgui::resolveInspectorInlineDocumentUpdate(luaScript, "/tmp/test.lua", 7);
    const auto reloadUpdate = manifold::ui::imgui::resolveInspectorInlineDocumentUpdate(luaScript, "/tmp/test.lua", 2);
    const auto pathChangeUpdate = manifold::ui::imgui::resolveInspectorInlineDocumentUpdate(shaderScript, "/tmp/test.lua", 9);

    auto contract = makeObject();
    asObject(contract)->setProperty("resetState", encodeTextState(resetState));
    asObject(contract)->setProperty("initialState", encodeTextState(initialState));
    asObject(contract)->setProperty("unchangedState", encodeTextState(unchangedState));
    asObject(contract)->setProperty("changedState", encodeTextState(changedState));
    asObject(contract)->setProperty("nonTextState", encodeTextState(nonTextState));
    asObject(contract)->setProperty("emptyUpdate", encodeInlineUpdate(emptyUpdate));
    asObject(contract)->setProperty("sameUpdate", encodeInlineUpdate(sameUpdate));
    asObject(contract)->setProperty("reloadUpdate", encodeInlineUpdate(reloadUpdate));
    asObject(contract)->setProperty("pathChangeUpdate", encodeInlineUpdate(pathChangeUpdate));

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "InspectorHostStateSupport contract", raw);
}
