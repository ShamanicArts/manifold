#include "../primitives/composite/CompositeSurfaceSupport.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace manifold::composite::surface_support;

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

int objectPropertyCount(const juce::var& value) {
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
    obj->setProperty("doubleVoidFallback", varToDoubleValue(juce::var(), 5.5));
    obj->setProperty("doubleBoolTrue", varToDoubleValue(juce::var(true), 0.0));
    obj->setProperty("doubleBoolFalse", varToDoubleValue(juce::var(false), 0.0));
    root->setProperty("numericHelpers", juce::var(obj));
  }

  {
    const auto signature = buildSignature("bottomA", "topB", "screen", "vs_main", "fs_main");
    auto* obj = new juce::DynamicObject();
    obj->setProperty("containsBottom", signature.find("bottom=bottomA") != std::string::npos);
    obj->setProperty("containsTop", signature.find("top=topB") != std::string::npos);
    obj->setProperty("containsBlendOp", signature.find("blendOp=screen") != std::string::npos);
    obj->setProperty("containsVertex", signature.find("vertex:\nvs_main") != std::string::npos);
    obj->setProperty("containsFragment", signature.find("fragment:\nfs_main") != std::string::npos);
    obj->setProperty("size", static_cast<int>(signature.size()));
    root->setProperty("signature", juce::var(obj));
  }

  {
    juce::var blendParamsVar(new juce::DynamicObject());
    auto* blendParams = blendParamsVar.getDynamicObject();
    blendParams->setProperty("bias", 0.25);

    juce::var payloadVar(new juce::DynamicObject());
    auto* payload = payloadVar.getDynamicObject();
    payload->setProperty("bottomNodeId", "node_bottom");
    payload->setProperty("topNodeId", "node_top");
    payload->setProperty("blendParams", blendParamsVar);

    ParsedCompositeDescriptor descriptor;
    std::string error;
    const bool ok = parseCompositeDescriptor(payloadVar, descriptor, error);
    blendParams->setProperty("bias", 99.0);

    auto* obj = new juce::DynamicObject();
    obj->setProperty("ok", ok);
    obj->setProperty("error", juce::String(error));
    obj->setProperty("bottom", juce::String(descriptor.bottomNodeId));
    obj->setProperty("top", juce::String(descriptor.topNodeId));
    obj->setProperty("requestedBlendOpEmpty", descriptor.requestedBlendOpId.empty());
    obj->setProperty("effectiveBlendOp", juce::String(descriptor.effectiveBlendOpId));
    obj->setProperty("opacity", descriptor.opacity);
    obj->setProperty("blendParamCount", objectPropertyCount(descriptor.blendParams));
    obj->setProperty("blendClonePreserved", descriptor.blendParams.getProperty("bias", juce::var()) == juce::var(0.25));
    obj->setProperty("vertexHasAPos", descriptor.vertexSource.find("aPos") != std::string::npos);
    obj->setProperty("fragmentNonEmpty", !descriptor.fragmentSource.empty());
    obj->setProperty("signatureHasNormal", descriptor.signature.find("blendOp=normal") != std::string::npos);
    root->setProperty("defaultBlendDescriptor", juce::var(obj));
  }

  {
    juce::var blendParamsVar(new juce::DynamicObject());
    auto* blendParams = blendParamsVar.getDynamicObject();
    blendParams->setProperty("mix", 0.8);

    juce::var payloadVar(new juce::DynamicObject());
    auto* payload = payloadVar.getDynamicObject();
    payload->setProperty("bottomNodeId", "bottom_explicit");
    payload->setProperty("topNodeId", "top_explicit");
    payload->setProperty("blendOpId", "screen");
    payload->setProperty("opacity", 4.0);
    payload->setProperty("blendParams", blendParamsVar);

    ParsedCompositeDescriptor descriptor;
    std::string error;
    const bool ok = parseCompositeDescriptor(payloadVar, descriptor, error);

    auto* obj = new juce::DynamicObject();
    obj->setProperty("ok", ok);
    obj->setProperty("error", juce::String(error));
    obj->setProperty("requestedBlendOp", juce::String(descriptor.requestedBlendOpId));
    obj->setProperty("effectiveBlendOp", juce::String(descriptor.effectiveBlendOpId));
    obj->setProperty("opacityClamped", descriptor.opacity);
    obj->setProperty("fragmentHasBlendTex", descriptor.fragmentSource.find("uBlendTex") != std::string::npos);
    obj->setProperty("signatureHasScreen", descriptor.signature.find("blendOp=screen") != std::string::npos);
    root->setProperty("explicitBlendDescriptor", juce::var(obj));
  }

  {
    juce::var payloadVar(new juce::DynamicObject());
    auto* payload = payloadVar.getDynamicObject();
    payload->setProperty("bottomNodeId", "b");
    payload->setProperty("topNodeId", "t");
    payload->setProperty("opacity", -2.0);

    ParsedCompositeDescriptor descriptor;
    std::string error;
    const bool ok = parseCompositeDescriptor(payloadVar, descriptor, error);

    auto* obj = new juce::DynamicObject();
    obj->setProperty("ok", ok);
    obj->setProperty("opacityClamped", descriptor.opacity);
    root->setProperty("negativeOpacity", juce::var(obj));
  }

  {
    ParsedCompositeDescriptor descriptor;
    std::string nonObjectError;
    const bool nonObjectOk = parseCompositeDescriptor(juce::var(), descriptor, nonObjectError);

    juce::var badPayloadVar(new juce::DynamicObject());
    auto* badPayload = badPayloadVar.getDynamicObject();
    badPayload->setProperty("bottomNodeId", "b");
    badPayload->setProperty("topNodeId", "t");
    badPayload->setProperty("blendOpId", "definitely_not_real");
    std::string badBlendError;
    const bool badBlendOk = parseCompositeDescriptor(badPayloadVar, descriptor, badBlendError);

    auto* obj = new juce::DynamicObject();
    obj->setProperty("nonObjectOk", nonObjectOk);
    obj->setProperty("nonObjectError", juce::String(nonObjectError));
    obj->setProperty("badBlendOk", badBlendOk);
    obj->setProperty("badBlendError", juce::String(badBlendError));
    root->setProperty("failures", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("bottomWins", static_cast<int>(resolveCompositeSequence(9, 4)));
    obj->setProperty("topWins", static_cast<int>(resolveCompositeSequence(4, 9)));
    obj->setProperty("equal", static_cast<int>(resolveCompositeSequence(7, 7)));
    root->setProperty("sequenceResolution", juce::var(obj));
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

  return finishJsonContract(opts, "CompositeSurfaceSupport contract", contractJson.toStdString());
}
