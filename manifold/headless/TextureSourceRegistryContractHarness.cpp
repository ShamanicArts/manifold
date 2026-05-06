#include "../primitives/sources/TextureSourceRegistry.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace manifold::sources;

constexpr const char* kSandboxRoot = "/tmp/manifold_texture_source_registry_contract";

juce::String indentString(int indent) {
  juce::String out;
  for (int i = 0; i < indent; ++i) out += "  ";
  return out;
}

void appendCanonicalJson(const juce::var& value, juce::String& out, int indent) {
  if (auto* object = value.getDynamicObject()) {
    struct PropertyEntry { juce::String name; juce::var value; };
    std::vector<PropertyEntry> properties;
    const auto& namedValues = object->getProperties();
    properties.reserve(static_cast<std::size_t>(namedValues.size()));
    for (int i = 0; i < namedValues.size(); ++i) {
      properties.push_back({namedValues.getName(i).toString(), namedValues.getValueAt(i)});
    }
    std::sort(properties.begin(), properties.end(),
              [](const PropertyEntry& a, const PropertyEntry& b) { return a.name < b.name; });

    out += "{\n";
    for (std::size_t i = 0; i < properties.size(); ++i) {
      out += indentString(indent + 1);
      out += juce::JSON::toString(juce::var(properties[i].name), true);
      out += ": ";
      appendCanonicalJson(properties[i].value, out, indent + 1);
      if (i + 1 < properties.size()) out += ",";
      out += "\n";
    }
    out += indentString(indent);
    out += "}";
    return;
  }

  if (auto* array = value.getArray()) {
    out += "[";
    if (!array->isEmpty()) {
      out += "\n";
      for (int i = 0; i < array->size(); ++i) {
        out += indentString(indent + 1);
        appendCanonicalJson(array->getReference(i), out, indent + 1);
        if (i + 1 < array->size()) out += ",";
        out += "\n";
      }
      out += indentString(indent);
    }
    out += "]";
    return;
  }

  out += juce::JSON::toString(value, true);
}

juce::File sandboxRoot() { return juce::File(kSandboxRoot); }
juce::File runtimeManifest() { return sandboxRoot().getChildFile("runtime_source.json"); }
juce::File runtimeShader() { return sandboxRoot().getChildFile("runtime_source.glsl"); }

juce::var buildFullContract() {
  sandboxRoot().deleteRecursively();
  sandboxRoot().createDirectory();

  runtimeManifest().replaceWithText(R"({
  "id": "runtime_test",
  "name": "Runtime Test",
  "category": "generator",
  "description": "Runtime loaded test source",
  "preamble": "uniform vec2 uMouse;\n",
  "params": [
    { "id": "gain", "name": "Gain", "unit": "db", "min": 0.0, "max": 2.0, "default": 0.75, "step": 0.05 },
    { "id": "bias", "name": "Bias", "min": -1.0, "max": 1.0, "default": 0.1, "step": 0.01 }
  ]
})");
  runtimeShader().replaceWithText("fragColor = vec4(vec3(gain + bias), 1.0);\n");

  auto& registry = TextureSourceRegistry::instance();

  auto* root = new juce::DynamicObject();
  root->setProperty("contractVersion", 1);

  {
    auto specs = registry.listSources();
    std::sort(specs.begin(), specs.end(), [](const SourceSpec& a, const SourceSpec& b) { return a.id < b.id; });

    auto* obj = new juce::DynamicObject();
    obj->setProperty("count", static_cast<int>(specs.size()));
    obj->setProperty("hasChecker", registry.findSource("checker") != nullptr);
    obj->setProperty("hasNoise", registry.findSource("noise") != nullptr);
    if (!specs.empty()) {
      obj->setProperty("firstId", juce::String(specs.front().id));
      obj->setProperty("lastId", juce::String(specs.back().id));
    }
    const auto* checker = registry.findSource("checker");
    obj->setProperty("checkerParamCount", checker != nullptr ? static_cast<int>(checker->params.size()) : -1);
    if (checker != nullptr && checker->params.size() >= 2) {
      obj->setProperty("checkerParam0Id", juce::String(checker->params[0].id));
      obj->setProperty("checkerParam1Id", juce::String(checker->params[1].id));
      obj->setProperty("checkerParam0Default", checker->params[0].defaultValue);
      obj->setProperty("checkerParam1Max", checker->params[1].max);
    }
    root->setProperty("builtins", juce::var(obj));
  }

  {
    const auto shader = registry.fragmentShaderFor("checker");
    auto* obj = new juce::DynamicObject();
    obj->setProperty("exists", !shader.empty());
    obj->setProperty("hasVersion", shader.find("#version 150") != std::string::npos);
    obj->setProperty("hasFragColor", shader.find("fragColor") != std::string::npos);
    obj->setProperty("hasScaleUniform", shader.find("uniform float scale;") != std::string::npos);
    obj->setProperty("hasSoftnessUniform", shader.find("uniform float softness;") != std::string::npos);
    obj->setProperty("missingEmpty", registry.fragmentShaderFor("nope").empty());
    root->setProperty("fragmentShader", juce::var(obj));
  }

  {
    const bool loaded = registry.loadSourceFromManifest(runtimeManifest().getFullPathName().toStdString(),
                                                        runtimeShader().getFullPathName().toStdString(),
                                                        false);
    const auto* runtime = registry.findSource("runtime_test");
    const auto runtimeShaderText = registry.fragmentShaderFor("runtime_test");
    auto* obj = new juce::DynamicObject();
    obj->setProperty("loaded", loaded);
    obj->setProperty("found", runtime != nullptr);
    obj->setProperty("paramCount", runtime != nullptr ? static_cast<int>(runtime->params.size()) : -1);
    obj->setProperty("shaderHasMousePreamble", runtimeShaderText.find("uniform vec2 uMouse;") != std::string::npos);
    obj->setProperty("shaderHasGainUniform", runtimeShaderText.find("uniform float gain;") != std::string::npos);
    obj->setProperty("shaderHasBiasUniform", runtimeShaderText.find("uniform float bias;") != std::string::npos);
    root->setProperty("runtimeLoad", juce::var(obj));
  }

  {
    const auto sanitized = registry.sanitizeParams("checker", {
        {"scale", 200.0f},
        {"softness", -5.0f},
        {"ignored", 123.0f},
    });
    auto* obj = new juce::DynamicObject();
    obj->setProperty("count", static_cast<int>(sanitized.size()));
    obj->setProperty("scale", sanitized.count("scale") != 0 ? sanitized.at("scale") : -1.0f);
    obj->setProperty("softness", sanitized.count("softness") != 0 ? sanitized.at("softness") : -1.0f);
    obj->setProperty("unknownEmpty", registry.sanitizeParams("nope", {}).empty());
    root->setProperty("sanitizeChecker", juce::var(obj));
  }

  {
    const auto sanitized = registry.sanitizeParams("runtime_test", {
        {"gain", -10.0f},
        {"bias", 10.0f},
    });
    auto* obj = new juce::DynamicObject();
    obj->setProperty("count", static_cast<int>(sanitized.size()));
    obj->setProperty("gain", sanitized.count("gain") != 0 ? sanitized.at("gain") : -1.0f);
    obj->setProperty("bias", sanitized.count("bias") != 0 ? sanitized.at("bias") : -1.0f);
    root->setProperty("sanitizeRuntime", juce::var(obj));
  }

  sandboxRoot().deleteRecursively();
  return juce::var(root);
}

} // namespace

int main(int argc, char* argv[]) {
  HarnessOptions opts;
  if (!parseOptions(argc, argv, opts)) return 1;

  const juce::String contractJson = [&]() {
    juce::String out;
    appendCanonicalJson(buildFullContract(), out, 0);
    out += "\n";
    return out;
  }();

  return finishJsonContract(opts, "TextureSourceRegistry contract", contractJson.toStdString());
}
