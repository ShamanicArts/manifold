#include "ContractHarnessUtils.h"
#include "../ui/imgui/TextInputHostSupport.h"

#include <juce_core/juce_core.h>
#include <juce_gui_basics/juce_gui_basics.h>

#include <cmath>
#include <string>
#include <unordered_set>
#include <vector>

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

juce::var encodeEvent(const manifold::ui::imgui::TextInputHostEvent& event) {
    auto obj = makeObject();
    const char* type = "unknown";
    switch (event.type) {
        case manifold::ui::imgui::TextInputHostEventType::MousePos: type = "mousePos"; break;
        case manifold::ui::imgui::TextInputHostEventType::MouseButton: type = "mouseButton"; break;
        case manifold::ui::imgui::TextInputHostEventType::MouseWheel: type = "mouseWheel"; break;
        case manifold::ui::imgui::TextInputHostEventType::Key: type = "key"; break;
        case manifold::ui::imgui::TextInputHostEventType::Char: type = "char"; break;
        case manifold::ui::imgui::TextInputHostEventType::Focus: type = "focus"; break;
    }
    asObject(obj)->setProperty("type", type);
    asObject(obj)->setProperty("x", roundTo(event.x));
    asObject(obj)->setProperty("y", roundTo(event.y));
    asObject(obj)->setProperty("button", event.button);
    asObject(obj)->setProperty("down", event.down);
    asObject(obj)->setProperty("key", event.key);
    asObject(obj)->setProperty("codepoint", static_cast<juce::int64>(event.codepoint));
    asObject(obj)->setProperty("focused", event.focused);
    return obj;
}

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

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    std::vector<manifold::ui::imgui::TextInputHostEvent> events;
    manifold::ui::imgui::TextInputHostButtons buttons;
    manifold::ui::imgui::TextInputHostModifiers modifiers;
    std::unordered_set<int> activeKeys;

    manifold::ui::imgui::queueTextInputMousePosition(events, { 11.5f, 22.25f });
    manifold::ui::imgui::syncTextInputMouseButtons(events, buttons, juce::ModifierKeys(juce::ModifierKeys::leftButtonModifier | juce::ModifierKeys::middleButtonModifier));
    manifold::ui::imgui::syncTextInputModifierKeys(events, modifiers, juce::ModifierKeys(juce::ModifierKeys::ctrlModifier | juce::ModifierKeys::altModifier));
    manifold::ui::imgui::queueTextInputMouseWheel(events, juce::MouseWheelDetails { 0.5f, -1.25f, false, false, false });
    manifold::ui::imgui::queueTextInputFocus(events, true);
    manifold::ui::imgui::queueTextInputKeyPress(events, activeKeys, juce::KeyPress('A', juce::ModifierKeys(juce::ModifierKeys::shiftModifier), 'A'));
    manifold::ui::imgui::releaseInactiveTextInputKeysWithPredicate(events, activeKeys, [](int) { return false; });
    manifold::ui::imgui::syncTextInputModifierKeys(events, modifiers, juce::ModifierKeys::noModifiers);
    manifold::ui::imgui::releaseAllTextInputMouseButtons(events, buttons);
    manifold::ui::imgui::queueTextInputMouseExitIfIdle(events, buttons);
    manifold::ui::imgui::queueTextInputFocus(events, false);

    auto eventArray = makeArray();
    for (const auto& event : events) {
        append(eventArray, encodeEvent(event));
    }

    auto languageMap = makeObject();
    asObject(languageMap)->setProperty("lua", encodeLanguage(manifold::ui::imgui::resolveLanguageDefinitionForFile(juce::File("foo.lua"))));
    asObject(languageMap)->setProperty("json5", encodeLanguage(manifold::ui::imgui::resolveLanguageDefinitionForFile(juce::File("foo.json5"))));
    asObject(languageMap)->setProperty("shader", encodeLanguage(manifold::ui::imgui::resolveLanguageDefinitionForFile(juce::File("foo.glsl"))));
    asObject(languageMap)->setProperty("python", encodeLanguage(manifold::ui::imgui::resolveLanguageDefinitionForFile(juce::File("foo.py"))));
    asObject(languageMap)->setProperty("header", encodeLanguage(manifold::ui::imgui::resolveLanguageDefinitionForFile(juce::File("foo.hpp"))));
    asObject(languageMap)->setProperty("unknown", encodeLanguage(manifold::ui::imgui::resolveLanguageDefinitionForFile(juce::File("foo.md"))));

    auto keyMap = makeObject();
    asObject(keyMap)->setProperty("left", manifold::ui::imgui::translateTextInputKeyCodeToImGuiKey(juce::KeyPress::leftKey));
    asObject(keyMap)->setProperty("aLower", manifold::ui::imgui::translateTextInputKeyCodeToImGuiKey('a'));
    asObject(keyMap)->setProperty("aUpper", manifold::ui::imgui::translateTextInputKeyCodeToImGuiKey('A'));
    asObject(keyMap)->setProperty("digit", manifold::ui::imgui::translateTextInputKeyCodeToImGuiKey('7'));
    asObject(keyMap)->setProperty("slash", manifold::ui::imgui::translateTextInputKeyCodeToImGuiKey('/'));
    asObject(keyMap)->setProperty("unknown", manifold::ui::imgui::translateTextInputKeyCodeToImGuiKey(juce::KeyPress::F1Key));

    auto contract = makeObject();
    asObject(contract)->setProperty("eventCount", static_cast<int>(events.size()));
    asObject(contract)->setProperty("events", eventArray);
    asObject(contract)->setProperty("buttonsIdle", !buttons.left && !buttons.right && !buttons.middle);
    asObject(contract)->setProperty("modifiersIdle", !modifiers.ctrl && !modifiers.shift && !modifiers.alt && !modifiers.super);
    asObject(contract)->setProperty("activeKeysEmpty", activeKeys.empty());
    asObject(contract)->setProperty("languageMap", languageMap);
    asObject(contract)->setProperty("keyMap", keyMap);

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "TextInputHostSupport contract", raw);
}
