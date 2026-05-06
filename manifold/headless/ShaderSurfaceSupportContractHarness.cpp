#include "../primitives/shaders/ShaderSurfaceSupport.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>

#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace manifold::shaders::surface_support;

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

juce::var buildFullContract() {
  auto* root = new juce::DynamicObject();
  root->setProperty("contractVersion", 1);

  {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("numberInt", varIsNumber(juce::var(4)));
    obj->setProperty("numberDouble", varIsNumber(juce::var(4.5)));
    obj->setProperty("numberBool", varIsNumber(juce::var(true)));
    obj->setProperty("numberString", varIsNumber(juce::var("4")));
    obj->setProperty("doubleVoidFallback", varToDoubleValue(juce::var(), 3.5));
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
    arrayColor.add(juce::var(0.4));
    const auto fromArray = readColorVec4(juce::var(arrayColor));
    obj->setProperty("arrayR", fromArray[0]);
    obj->setProperty("arrayG", fromArray[1]);
    obj->setProperty("arrayB", fromArray[2]);
    obj->setProperty("arrayA", fromArray[3]);

    auto* colorObj = new juce::DynamicObject();
    colorObj->setProperty("r", 0.9);
    colorObj->setProperty("g", 0.8);
    colorObj->setProperty("b", 0.7);
    const auto fromObject = readColorVec4(juce::var(colorObj), { 0.0f, 0.0f, 0.0f, 1.0f });
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
    auto* obj = new juce::DynamicObject();
    obj->setProperty("blendNumeric", readBlendModeValue(juce::var(7)));
    obj->setProperty("blendAdd", readBlendModeValue(juce::var("add")));
    obj->setProperty("blendMultiply", readBlendModeValue(juce::var("multiply")));
    obj->setProperty("blendScreen", readBlendModeValue(juce::var("screen")));
    obj->setProperty("blendDifference", readBlendModeValue(juce::var("difference")));
    obj->setProperty("blendUnknown", readBlendModeValue(juce::var("bogus")));
    root->setProperty("blendModes", juce::var(obj));
  }

  {
    auto* passObj = new juce::DynamicObject();
    passObj->setProperty("vertexShader", "vs_main");
    passObj->setProperty("fragmentShader", "fs_main");
    passObj->setProperty("inputTextureUniform", "uInput");
    passObj->setProperty("prevTextureUniform", "uPrev");
    passObj->setProperty("depth", true);
    passObj->setProperty("blendMode", "multiply");
    passObj->setProperty("opacity", 2.0);
    passObj->setProperty("chain", true);
    passObj->setProperty("composite", true);
    passObj->setProperty("blendOpId", "normal");
    passObj->setProperty("blendParams", juce::var(0.5));
    juce::Array<juce::var> clearColor;
    clearColor.add(juce::var(0.2));
    clearColor.add(juce::var(0.3));
    clearColor.add(juce::var(0.4));
    clearColor.add(juce::var(0.5));
    passObj->setProperty("clearColor", juce::var(clearColor));

    ParsedPassConfig parsed;
    std::string error;
    const bool ok = parsePassConfig(juce::var(passObj), parsed, error);

    auto* obj = new juce::DynamicObject();
    obj->setProperty("ok", ok);
    obj->setProperty("error", juce::String(error));
    obj->setProperty("vertex", juce::String(parsed.vertexSource));
    obj->setProperty("fragment", juce::String(parsed.fragmentSource));
    obj->setProperty("inputUniform", juce::String(parsed.inputTextureUniform));
    obj->setProperty("prevUniform", juce::String(parsed.prevTextureUniform));
    obj->setProperty("depth", parsed.enableDepth);
    obj->setProperty("blendMode", parsed.blendMode);
    obj->setProperty("opacityClamped", parsed.opacity);
    obj->setProperty("chain", parsed.chain);
    obj->setProperty("composite", parsed.composite);
    obj->setProperty("blendOpId", juce::String(parsed.blendOpId));
    obj->setProperty("clearA", parsed.clearColor[3]);

    ParsedPassConfig missingParsed;
    std::string missingError;
    const bool missingOk = parsePassConfig(juce::var(new juce::DynamicObject()), missingParsed, missingError);
    obj->setProperty("missingOk", missingOk);
    obj->setProperty("missingError", juce::String(missingError));

    root->setProperty("passParsing", juce::var(obj));
  }

  {
    auto* srcObj = new juce::DynamicObject();
    srcObj->setProperty("vertexShader", "src_vs");
    srcObj->setProperty("fragmentShader", "src_fs");
    auto* clearObj = new juce::DynamicObject();
    clearObj->setProperty("r", 0.25);
    clearObj->setProperty("g", 0.5);
    clearObj->setProperty("b", 0.75);
    clearObj->setProperty("a", 1.0);
    srcObj->setProperty("clearColor", juce::var(clearObj));

    ParsedSourceConfig parsed;
    std::string error;
    const bool ok = parseSourceConfig(juce::var(srcObj), parsed, error);

    auto* obj = new juce::DynamicObject();
    obj->setProperty("ok", ok);
    obj->setProperty("error", juce::String(error));
    obj->setProperty("vertex", juce::String(parsed.vertexSource));
    obj->setProperty("fragment", juce::String(parsed.fragmentSource));
    obj->setProperty("clearR", parsed.clearColor[0]);
    obj->setProperty("clearA", parsed.clearColor[3]);

    ParsedSourceConfig missingParsed;
    std::string missingError;
    const bool missingOk = parseSourceConfig(juce::var(new juce::DynamicObject()), missingParsed, missingError);
    obj->setProperty("missingOk", missingOk);
    obj->setProperty("missingError", juce::String(missingError));

    root->setProperty("sourceParsing", juce::var(obj));
  }

  {
    ParsedPassConfig passA;
    passA.vertexSource = "va";
    passA.fragmentSource = "fa";
    passA.inputTextureUniform = "inputA";
    passA.prevTextureUniform = "prevA";
    passA.enableDepth = true;
    passA.chain = false;
    passA.composite = true;
    passA.blendOpId = "normal";

    ParsedPassConfig passB;
    passB.vertexSource = "vb";
    passB.fragmentSource = "fb";
    passB.inputTextureUniform = "inputB";
    passB.prevTextureUniform = "prevB";
    passB.enableDepth = false;
    passB.chain = true;
    passB.composite = false;
    passB.blendOpId = "screen";

    ParsedSourceConfig source;
    source.vertexSource = "sv";
    source.fragmentSource = "sf";

    const auto signature = buildDescriptorSignature("gpu_shader", "generator_shader", {passA, passB}, &source);

    auto* obj = new juce::DynamicObject();
    obj->setProperty("containsSurfaceType", signature.find("surfaceType=gpu_shader") != std::string::npos);
    obj->setProperty("containsSourceVertex", signature.find("sourceVertex:\nsv") != std::string::npos);
    obj->setProperty("containsPassCount", signature.find("passCount=2") != std::string::npos);
    obj->setProperty("containsPass0BlendOp", signature.find("blendOpId=normal") != std::string::npos);
    obj->setProperty("containsPass1BlendOp", signature.find("blendOpId=screen") != std::string::npos);
    obj->setProperty("containsPass1Chain", signature.find("chain=1") != std::string::npos);
    obj->setProperty("containsPass0Depth", signature.find("enableDepth=1") != std::string::npos);
    obj->setProperty("signatureSize", static_cast<int>(signature.size()));
    root->setProperty("descriptorSignature", juce::var(obj));
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

  return finishJsonContract(opts, "ShaderSurfaceSupport contract", contractJson.toStdString());
}
