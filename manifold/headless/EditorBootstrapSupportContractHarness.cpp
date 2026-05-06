#include "../core/EditorBootstrapSupport.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>

#include <vector>

namespace {

using namespace contract_harness_utils;

constexpr const char* kSandboxRoot = "/tmp/manifold_editor_bootstrap_contract";

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
juce::File configuredScript() { return sandboxRoot().getChildFile("configured.lua"); }
juce::File devScriptsDir() { return sandboxRoot().getChildFile("dev_ui"); }
juce::File fallbackScript() { return devScriptsDir().getChildFile("empty_launcher.lua"); }
juce::File repoFile() { return juce::File(juce::String(MANIFOLD_SOURCE_DIR)).getChildFile("manifold").getChildFile("core").getChildFile("BehaviorCoreEditor.cpp"); }

juce::var buildFullContract() {
  sandboxRoot().deleteRecursively();
  sandboxRoot().createDirectory();
  devScriptsDir().createDirectory();
  configuredScript().replaceWithText("return { kind = 'configured' }\n");
  fallbackScript().replaceWithText("return { kind = 'fallback' }\n");

  auto* root = new juce::DynamicObject();
  root->setProperty("contractVersion", 1);

  {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("repoFileRelative", editor_bootstrap::canonicalContractPath(repoFile()));
    obj->setProperty("repoFileEndsWithCpp", editor_bootstrap::canonicalContractPath(repoFile()).endsWith("manifold/core/BehaviorCoreEditor.cpp"));
    obj->setProperty("missingEmpty", editor_bootstrap::canonicalContractPath(sandboxRoot().getChildFile("missing.lua")).isEmpty());
    root->setProperty("canonicalContractPath", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    int width = 0;
    int height = 0;
    obj->setProperty("parse1280x720", editor_bootstrap::parseProfileWindowSizeValue("1280x720", width, height));
    obj->setProperty("width1280x720", width);
    obj->setProperty("height1280x720", height);
    width = 0;
    height = 0;
    obj->setProperty("parse800X600", editor_bootstrap::parseProfileWindowSizeValue("800X600", width, height));
    obj->setProperty("width800X600", width);
    obj->setProperty("height800X600", height);
    obj->setProperty("parseNull", editor_bootstrap::parseProfileWindowSizeValue(nullptr, width, height));
    obj->setProperty("parseGarbage", editor_bootstrap::parseProfileWindowSizeValue("wat", width, height));
    obj->setProperty("parseZero", editor_bootstrap::parseProfileWindowSizeValue("0x720", width, height));
    obj->setProperty("parseNegative", editor_bootstrap::parseProfileWindowSizeValue("-1x720", width, height));
    root->setProperty("profileWindowSize", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("envCanvas", static_cast<int>(editor_bootstrap::resolveRootMode("canvas", 3, editor_bootstrap::RootMode::RuntimeNode)));
    obj->setProperty("envReplace", static_cast<int>(editor_bootstrap::resolveRootMode("imgui-replace", 3, editor_bootstrap::RootMode::RuntimeNode)));
    obj->setProperty("envDirect", static_cast<int>(editor_bootstrap::resolveRootMode("imgui-direct", 0, editor_bootstrap::RootMode::Canvas)));
    obj->setProperty("savedMode0", static_cast<int>(editor_bootstrap::resolveRootMode(nullptr, 0, editor_bootstrap::RootMode::RuntimeNode)));
    obj->setProperty("savedMode2", static_cast<int>(editor_bootstrap::resolveRootMode(nullptr, 2, editor_bootstrap::RootMode::RuntimeNode)));
    obj->setProperty("savedMode3", static_cast<int>(editor_bootstrap::resolveRootMode(nullptr, 3, editor_bootstrap::RootMode::Canvas)));
    root->setProperty("rootMode", juce::var(obj));
  }

  {
    using Mode = editor_renderer::RuntimeRendererMode;
    auto* obj = new juce::DynamicObject();
    obj->setProperty("envCanvasOnCanvasRoot",
                     static_cast<int>(editor_bootstrap::resolveInitialRuntimeRendererMode("canvas", nullptr, editor_bootstrap::RootMode::Canvas)));
    obj->setProperty("envCanvasOnRuntimeRootCoerced",
                     static_cast<int>(editor_bootstrap::resolveInitialRuntimeRendererMode("canvas", nullptr, editor_bootstrap::RootMode::RuntimeNode)));
    obj->setProperty("envOverlayOnRuntimeRootCoerced",
                     static_cast<int>(editor_bootstrap::resolveInitialRuntimeRendererMode("imgui-overlay", nullptr, editor_bootstrap::RootMode::RuntimeNode)));
    obj->setProperty("envReplaceOnRuntimeRoot",
                     static_cast<int>(editor_bootstrap::resolveInitialRuntimeRendererMode("imgui-replace", nullptr, editor_bootstrap::RootMode::RuntimeNode)));
    obj->setProperty("envDirectOnRuntimeRoot",
                     static_cast<int>(editor_bootstrap::resolveInitialRuntimeRendererMode("imgui-direct", nullptr, editor_bootstrap::RootMode::RuntimeNode)));
    obj->setProperty("debugEnvUsed",
                     static_cast<int>(editor_bootstrap::resolveInitialRuntimeRendererMode(nullptr, "imgui-overlay", editor_bootstrap::RootMode::Canvas)));
    obj->setProperty("defaultCanvasRoot",
                     static_cast<int>(editor_bootstrap::resolveInitialRuntimeRendererMode(nullptr, nullptr, editor_bootstrap::RootMode::Canvas)));
    obj->setProperty("defaultRuntimeRoot",
                     static_cast<int>(editor_bootstrap::resolveInitialRuntimeRendererMode(nullptr, nullptr, editor_bootstrap::RootMode::RuntimeNode)));
    juce::ignoreUnused(Mode::Canvas);
    root->setProperty("runtimeRendererMode", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();

    const auto configured = editor_bootstrap::resolveInitialLuaUiScript(
        configuredScript().getFullPathName(), devScriptsDir().getFullPathName());
    obj->setProperty("configuredKind", static_cast<int>(configured.kind));
    obj->setProperty("configuredPath", configured.scriptFile.getFullPathName());
    obj->setProperty("configuredLoads", configured.shouldAttemptLoad());

    const auto missingConfigured = editor_bootstrap::resolveInitialLuaUiScript(
        sandboxRoot().getChildFile("missing_configured.lua").getFullPathName(), devScriptsDir().getFullPathName());
    obj->setProperty("missingConfiguredKind", static_cast<int>(missingConfigured.kind));
    obj->setProperty("missingConfiguredPath", missingConfigured.scriptFile.getFullPathName());
    obj->setProperty("missingConfiguredLoads", missingConfigured.shouldAttemptLoad());
    obj->setProperty("missingConfiguredError", missingConfigured.errorMessage());

    const auto emptyConfigured = editor_bootstrap::resolveInitialLuaUiScript(
        {}, devScriptsDir().getFullPathName());
    obj->setProperty("emptyConfiguredKind", static_cast<int>(emptyConfigured.kind));
    obj->setProperty("emptyConfiguredPath", emptyConfigured.scriptFile.getFullPathName());
    obj->setProperty("emptyConfiguredLoads", emptyConfigured.shouldAttemptLoad());

    fallbackScript().deleteFile();

    const auto missingNoFallback = editor_bootstrap::resolveInitialLuaUiScript(
        sandboxRoot().getChildFile("missing_again.lua").getFullPathName(), devScriptsDir().getFullPathName());
    obj->setProperty("missingNoFallbackKind", static_cast<int>(missingNoFallback.kind));
    obj->setProperty("missingNoFallbackLoads", missingNoFallback.shouldAttemptLoad());
    obj->setProperty("missingNoFallbackError", missingNoFallback.errorMessage());

    const auto emptyNoFallback = editor_bootstrap::resolveInitialLuaUiScript({}, devScriptsDir().getFullPathName());
    obj->setProperty("emptyNoFallbackKind", static_cast<int>(emptyNoFallback.kind));
    obj->setProperty("emptyNoFallbackLoads", emptyNoFallback.shouldAttemptLoad());
    obj->setProperty("emptyNoFallbackError", emptyNoFallback.errorMessage());

    root->setProperty("scriptResolution", juce::var(obj));
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

  return finishJsonContract(opts, "EditorBootstrapSupport contract", contractJson.toStdString());
}
