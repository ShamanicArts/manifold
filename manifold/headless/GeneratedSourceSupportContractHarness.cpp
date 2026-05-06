#include "../primitives/sources/GeneratedSourceSupport.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace manifold::sources::generated_source_support;

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

int uniformObjectSize(const juce::var& value) {
  if (auto* obj = value.getDynamicObject()) {
    return obj->getProperties().size();
  }
  return 0;
}

juce::var buildFullContract() {
  auto* root = new juce::DynamicObject();
  root->setProperty("contractVersion", 1);

  {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("numberInt", varIsNumber(juce::var(4)));
    obj->setProperty("numberDouble", varIsNumber(juce::var(4.5)));
    obj->setProperty("numberBool", varIsNumber(juce::var(true)));
    obj->setProperty("numberString", varIsNumber(juce::var("4")));
    obj->setProperty("doubleVoidFallback", varToDoubleValue(juce::var(), 7.5));
    obj->setProperty("doubleBoolTrue", varToDoubleValue(juce::var(true), 0.0));
    obj->setProperty("doubleBoolFalse", varToDoubleValue(juce::var(false), 0.0));
    obj->setProperty("doubleInt", varToDoubleValue(juce::var(9), 0.0));
    root->setProperty("numericHelpers", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    juce::Array<juce::var> arrayColor;
    arrayColor.add(juce::var(0.1));
    arrayColor.add(juce::var(0.2));
    arrayColor.add(juce::var(0.3));
    const auto fromArray = readColorVec4(juce::var(arrayColor));
    obj->setProperty("arrayR", fromArray[0]);
    obj->setProperty("arrayG", fromArray[1]);
    obj->setProperty("arrayB", fromArray[2]);
    obj->setProperty("arrayA", fromArray[3]);

    auto* colorObj = new juce::DynamicObject();
    colorObj->setProperty("r", 0.9);
    colorObj->setProperty("g", 0.8);
    colorObj->setProperty("b", 0.7);
    const auto fromObject = readColorVec4(juce::var(colorObj), { 0.0f, 0.0f, 0.0f, 0.5f });
    obj->setProperty("objectR", fromObject[0]);
    obj->setProperty("objectG", fromObject[1]);
    obj->setProperty("objectB", fromObject[2]);
    obj->setProperty("objectA", fromObject[3]);

    const auto fromFallback = readColorVec4(juce::var(), { 0.5f, 0.6f, 0.7f, 0.8f });
    obj->setProperty("fallbackR", fromFallback[0]);
    obj->setProperty("fallbackA", fromFallback[3]);
    root->setProperty("colorParsing", juce::var(obj));
  }

  {
    const auto signature = buildSourceSignature("vs_main", "fs_main");
    auto* obj = new juce::DynamicObject();
    obj->setProperty("containsVertex", signature.find("vs_main") != std::string::npos);
    obj->setProperty("containsFragment", signature.find("fs_main") != std::string::npos);
    obj->setProperty("containsSeparator", signature.find("\n--frag--\n") != std::string::npos);
    obj->setProperty("size", static_cast<int>(signature.size()));
    root->setProperty("signature", juce::var(obj));
  }

  {
    juce::var uniformsVar(new juce::DynamicObject());
    auto* uniformsObj = uniformsVar.getDynamicObject();
    uniformsObj->setProperty("speed", 0.25);
    juce::Array<juce::var> uvScale;
    uvScale.add(juce::var(2.0));
    uvScale.add(juce::var(3.0));
    uniformsObj->setProperty("uvScale", juce::var(uvScale));

    juce::var payloadVar(new juce::DynamicObject());
    auto* payloadObj = payloadVar.getDynamicObject();
    payloadObj->setProperty("vertexShader", "vs_direct");
    payloadObj->setProperty("fragmentShader", "fs_direct");
    payloadObj->setProperty("uniforms", uniformsVar);
    juce::Array<juce::var> clearColor;
    clearColor.add(juce::var(0.2));
    clearColor.add(juce::var(0.4));
    clearColor.add(juce::var(0.6));
    payloadObj->setProperty("clearColor", juce::var(clearColor));

    ParsedSourceDescriptor descriptor;
    std::string error;
    const bool ok = parseSourceDescriptor("generated_source", payloadVar, descriptor, error);
    uniformsObj->setProperty("speed", 99.0);

    auto* obj = new juce::DynamicObject();
    obj->setProperty("ok", ok);
    obj->setProperty("error", juce::String(error));
    obj->setProperty("vertex", juce::String(descriptor.vertexSource));
    obj->setProperty("fragment", juce::String(descriptor.fragmentSource));
    obj->setProperty("clearR", descriptor.clearColor[0]);
    obj->setProperty("clearA", descriptor.clearColor[3]);
    obj->setProperty("uniformCount", uniformObjectSize(descriptor.uniforms));
    obj->setProperty("uniformClonePreserved", descriptor.uniforms.getProperty("speed", juce::var()) == juce::var(0.25));
    obj->setProperty("signatureHasSeparator", descriptor.signature.find("\n--frag--\n") != std::string::npos);
    root->setProperty("directDescriptor", juce::var(obj));
  }

  {
    juce::var uniformsVar(new juce::DynamicObject());
    auto* uniformsObj = uniformsVar.getDynamicObject();
    uniformsObj->setProperty("gain", 1.5);

    juce::var sourceVar(new juce::DynamicObject());
    auto* sourceObj = sourceVar.getDynamicObject();
    sourceObj->setProperty("vertexShader", "vs_wrapped");
    sourceObj->setProperty("fragmentShader", "fs_wrapped");
    sourceObj->setProperty("uniforms", uniformsVar);
    juce::var clearVar(new juce::DynamicObject());
    auto* clearObj = clearVar.getDynamicObject();
    clearObj->setProperty("r", 0.3);
    clearObj->setProperty("g", 0.2);
    clearObj->setProperty("b", 0.1);
    clearObj->setProperty("a", 0.9);
    sourceObj->setProperty("clearColor", clearVar);

    juce::var payloadVar(new juce::DynamicObject());
    auto* payloadObj = payloadVar.getDynamicObject();
    payloadObj->setProperty("sourceType", "generated_source");
    payloadObj->setProperty("sourceShader", sourceVar);

    ParsedSourceDescriptor descriptor;
    std::string error;
    const bool ok = parseSourceDescriptor("gpu_shader", payloadVar, descriptor, error);
    sourceObj->setProperty("vertexShader", "mutated");

    auto* obj = new juce::DynamicObject();
    obj->setProperty("ok", ok);
    obj->setProperty("error", juce::String(error));
    obj->setProperty("vertex", juce::String(descriptor.vertexSource));
    obj->setProperty("fragment", juce::String(descriptor.fragmentSource));
    obj->setProperty("clearB", descriptor.clearColor[2]);
    obj->setProperty("clearA", descriptor.clearColor[3]);
    obj->setProperty("uniformGain", descriptor.uniforms.getProperty("gain", juce::var(-1.0)));
    obj->setProperty("sourceClonePreserved", descriptor.vertexSource == "vs_wrapped");
    root->setProperty("wrappedDescriptor", juce::var(obj));
  }

  {
    juce::var validSourceVar(new juce::DynamicObject());
    auto* validSource = validSourceVar.getDynamicObject();
    validSource->setProperty("vertexShader", "vs");
    validSource->setProperty("fragmentShader", "fs");

    ParsedSourceDescriptor parsed;
    std::string unsupportedError;
    const bool unsupportedOk = parseSourceDescriptor("video_input", validSourceVar, parsed, unsupportedError);

    std::string nonObjectError;
    const bool nonObjectOk = parseSourceDescriptor("generated_source", juce::var(), parsed, nonObjectError);

    juce::var wrongTypePayloadVar(new juce::DynamicObject());
    auto* wrongTypePayload = wrongTypePayloadVar.getDynamicObject();
    wrongTypePayload->setProperty("sourceType", "video_input");
    wrongTypePayload->setProperty("sourceShader", validSourceVar);
    std::string wrongTypeError;
    const bool wrongTypeOk = parseSourceDescriptor("gpu_shader", wrongTypePayloadVar, parsed, wrongTypeError);

    juce::var missingSourcePayloadVar(new juce::DynamicObject());
    auto* missingSourcePayload = missingSourcePayloadVar.getDynamicObject();
    missingSourcePayload->setProperty("sourceType", "generated_source");
    std::string missingSourceError;
    const bool missingSourceOk = parseSourceDescriptor("gpu_shader", missingSourcePayloadVar, parsed, missingSourceError);

    juce::var missingShaderPayloadVar(new juce::DynamicObject());
    auto* missingShaderPayload = missingShaderPayloadVar.getDynamicObject();
    missingShaderPayload->setProperty("vertexShader", "only_vertex");
    std::string missingShaderError;
    const bool missingShaderOk = parseSourceDescriptor("generated_source", missingShaderPayloadVar, parsed, missingShaderError);

    auto* obj = new juce::DynamicObject();
    obj->setProperty("unsupportedOk", unsupportedOk);
    obj->setProperty("unsupportedError", juce::String(unsupportedError));
    obj->setProperty("nonObjectOk", nonObjectOk);
    obj->setProperty("nonObjectError", juce::String(nonObjectError));
    obj->setProperty("wrongTypeOk", wrongTypeOk);
    obj->setProperty("wrongTypeError", juce::String(wrongTypeError));
    obj->setProperty("missingSourceOk", missingSourceOk);
    obj->setProperty("missingSourceError", juce::String(missingSourceError));
    obj->setProperty("missingShaderOk", missingShaderOk);
    obj->setProperty("missingShaderError", juce::String(missingShaderError));
    root->setProperty("failures", juce::var(obj));
  }

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

  return finishJsonContract(opts, "GeneratedSourceSupport contract", contractJson.toStdString());
}
