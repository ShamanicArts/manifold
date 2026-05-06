// ============================================================================
// SystemPaths Contract Harness
//
// Tests SystemPaths: path resolution for system and user script directories.
// All methods are static pure functions that resolve paths relative to the
// executable location. The contract captures the resolved paths and verifies
// they are valid, absolute, and non-empty.
// ============================================================================

#include "../primitives/core/SystemPaths.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>

#include <cstdio>
#include <string>

// ============================================================================
// Contract builder
// ============================================================================

namespace {

using namespace contract_harness_utils;

// Simple absolute path check (works cross-platform JUCE)
static bool isPathAbsolute(const juce::File& f) {
  return juce::File::isAbsolutePath(f.getFullPathName());
}

juce::var buildFullContract() {
  // No GUI init needed - SystemPaths is pure static

  auto* root = new juce::DynamicObject();
  root->setProperty("contractVersion", 1);

  // Call all public static methods
  juce::File sysScripts = SystemPaths::getSystemScriptsDir();
  juce::File userScripts = SystemPaths::getUserScriptsDir();
  juce::File sysProjects = SystemPaths::getSystemProjectsDir();
  juce::File userProjects = SystemPaths::getUserProjectsDir();

  // Capture results
  auto* result = new juce::DynamicObject();
  result->setProperty("systemScriptsDir", sysScripts.getFullPathName());
  result->setProperty("userScriptsDir", userScripts.getFullPathName());
  result->setProperty("systemProjectsDir", sysProjects.getFullPathName());
  result->setProperty("userProjectsDir", userProjects.getFullPathName());

  // Validity checks
  result->setProperty("sysScriptsIsDirectory", sysScripts.isDirectory());
  result->setProperty("sysScriptsAbsolutePath", isPathAbsolute(sysScripts));
  result->setProperty("sysScriptsNonEmpty", sysScripts.getFullPathName().isNotEmpty());

  result->setProperty("userScriptsAbsolutePath", isPathAbsolute(userScripts));
  result->setProperty("userScriptsNonEmpty", userScripts.getFullPathName().isNotEmpty());

  result->setProperty("sysProjectsAbsolutePath", isPathAbsolute(sysProjects));
  result->setProperty("sysProjectsNonEmpty", sysProjects.getFullPathName().isNotEmpty());

  result->setProperty("userProjectsAbsolutePath", isPathAbsolute(userProjects));
  result->setProperty("userProjectsNonEmpty", userProjects.getFullPathName().isNotEmpty());

  // Check that directories are related (siblings or parent-child)
  bool sysRelated = sysScripts.getParentDirectory() == sysProjects.getParentDirectory()
      || sysScripts == sysProjects.getParentDirectory()
      || sysProjects == sysScripts.getParentDirectory();
  result->setProperty("sysDirsRelated", sysRelated);

  bool userRelated = userScripts.getParentDirectory() == userProjects.getParentDirectory()
      || userScripts == userProjects.getParentDirectory()
      || userProjects == userScripts.getParentDirectory();
  result->setProperty("userDirsRelated", userRelated);

  // Existence checks
  result->setProperty("sysProjectsExists", sysProjects.isDirectory());
  result->setProperty("userScriptsExists", userScripts.isDirectory());
  result->setProperty("userProjectsExists", userProjects.isDirectory());

  root->setProperty("systemPaths", juce::var(result));
  return juce::var(root);
}

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
    for (int i = 0; i < namedValues.size(); ++i)
      properties.push_back({namedValues.getName(i).toString(), namedValues.getValueAt(i)});
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

  return finishJsonContract(opts, "SystemPaths contract", contractJson.toStdString());
}
