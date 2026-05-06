#include "ScriptPathResolver.h"

#include "../core/Settings.h"

#include <juce_gui_basics/juce_gui_basics.h>

#include <sstream>

namespace script_path_resolver {
namespace {

bool isProjectManifestFile(const juce::File& file) {
  return file.existsAsFile() &&
         file.getFileName().equalsIgnoreCase("manifold.project.json5");
}

bool isStructuredUiFile(const juce::File& file) {
  return file.existsAsFile() &&
         file.getFileName().endsWithIgnoreCase(".ui.lua");
}

juce::String escapeLuaString(const juce::String& text) {
  auto s = text.replace("\\", "\\\\");
  s = s.replace("\"", "\\\"");
  s = s.replace("\n", "\\n");
  s = s.replace("\r", "\\r");
  return s;
}

} // namespace

bool shouldUseSharedShell(const UiLoadTarget& target, bool isOverlay) {
  if (isOverlay) {
    return false;
  }

  if (target.useSharedShell) {
    return true;
  }

  return juce::JUCEApplicationBase::isStandaloneApp();
}

juce::File resolveCompiledSystemUiDir() {
#ifdef MANIFOLD_SOURCE_DIR
  auto sourceDir = juce::String(JUCE_STRINGIFY(MANIFOLD_SOURCE_DIR));
  if (sourceDir.length() >= 2 && sourceDir.startsWithChar('"') && sourceDir.endsWithChar('"')) {
    sourceDir = sourceDir.substring(1, sourceDir.length() - 1);
  }
  juce::File dir(sourceDir);
  if (dir.isDirectory()) {
    auto uiDir = dir.getChildFile("manifold").getChildFile("ui");
    if (uiDir.isDirectory()) {
      return uiDir;
    }
  }
#endif
  return {};
}

juce::File resolveSystemUiDir() {
  auto& settings = Settings::getInstance();
  auto devDir = settings.getDevScriptsDir();
  if (devDir.isNotEmpty()) {
    juce::File dir(devDir);
    if (dir.isDirectory()) {
      return dir;
    }
  }

  auto compiledUiDir = resolveCompiledSystemUiDir();
  if (compiledUiDir.isDirectory()) {
    return compiledUiDir;
  }

  auto defaultUiScript = settings.getDefaultUiScript();
  if (defaultUiScript.isNotEmpty()) {
    juce::File script(defaultUiScript);
    if (script.existsAsFile() && !script.getFileName().equalsIgnoreCase("manifold.project.json5")) {
      return script.getParentDirectory();
    }
  }

  return {};
}

juce::File resolveProjectAssetRef(const juce::File& projectRoot,
                                 const juce::String& assetRef) {
  if (juce::File::isAbsolutePath(assetRef)) {
    return juce::File(assetRef);
  }

  auto local = projectRoot.getChildFile(assetRef);
  if (local.exists()) {
    return local;
  }

  juce::File systemUiRoot = resolveSystemUiDir();
  if (systemUiRoot.isDirectory()) {
    auto system = systemUiRoot.getChildFile(assetRef);
    if (system.exists()) {
      return system;
    }
  }

  return local;
}

UiLoadTarget resolveUiLoadTarget(const juce::File& requestedPath) {
  UiLoadTarget target;
  target.requestedPath = requestedPath;

  if (isProjectManifestFile(requestedPath)) {
    auto json = juce::JSON::parse(requestedPath);
    if (!json.isObject()) {
      target.error = "project manifest is not valid JSON/JSON5 subset";
      return target;
    }

    auto* obj = json.getDynamicObject();
    if (obj == nullptr || !obj->hasProperty("ui")) {
      target.error = "project manifest missing ui section";
      return target;
    }

    auto uiVar = obj->getProperty("ui");
    if (!uiVar.isObject()) {
      target.error = "project manifest ui section is not an object";
      return target;
    }

    auto* uiObj = uiVar.getDynamicObject();
    if (uiObj == nullptr || !uiObj->hasProperty("root")) {
      target.error = "project manifest missing ui.root";
      return target;
    }

    if (uiObj->hasProperty("sharedShell")) {
      target.useSharedShell = static_cast<bool>(uiObj->getProperty("sharedShell"));
    }

    auto rootRel = uiObj->getProperty("root").toString();
    if (rootRel.isEmpty()) {
      target.error = "project manifest ui.root is empty";
      return target;
    }

    const auto projectRoot = requestedPath.getParentDirectory();
    const auto uiRoot = resolveProjectAssetRef(projectRoot, rootRel);
    if (!uiRoot.existsAsFile()) {
      target.error = "project ui root does not exist: " + uiRoot.getFullPathName().toStdString();
      return target;
    }

    if (obj->hasProperty("dsp")) {
      auto dspVar = obj->getProperty("dsp");
      if (dspVar.isObject()) {
        auto* dspObj = dspVar.getDynamicObject();
        if (dspObj != nullptr && dspObj->hasProperty("default")) {
          auto dspRef = dspObj->getProperty("default").toString();
          if (dspRef.isNotEmpty()) {
            target.dspDefaultFile = resolveProjectAssetRef(projectRoot, dspRef);
          }
        }
      }
    } else {
      target.isSystemProject = true;
    }

    if (obj->hasProperty("behavior")) {
      auto behaviorVar = obj->getProperty("behavior");
      if (behaviorVar.isObject()) {
        auto* behaviorObj = behaviorVar.getDynamicObject();
        if (behaviorObj != nullptr && behaviorObj->hasProperty("isOverlay")) {
          target.isOverlay = behaviorObj->getProperty("isOverlay");
        }
      }
    }

    target.projectRoot = projectRoot;
    target.manifestFile = requestedPath;
    target.structuredUiRoot = uiRoot;
    target.bootstrapPath = uiRoot;
    target.displayName = obj->hasProperty("name")
                             ? obj->getProperty("name").toString()
                             : projectRoot.getFileName();
    if (target.displayName.isEmpty()) {
      target.displayName = projectRoot.getFileName();
    }
    target.isProject = true;
    target.isStructured = isStructuredUiFile(uiRoot);
    return target;
  }

  if (isStructuredUiFile(requestedPath)) {
    target.structuredUiRoot = requestedPath;
    target.bootstrapPath = requestedPath;
    target.projectRoot = requestedPath.getParentDirectory();
    target.displayName = requestedPath.getFileNameWithoutExtension();
    target.isStructured = true;
    return target;
  }

  target.bootstrapPath = requestedPath;
  target.displayName = requestedPath.getFileNameWithoutExtension();
  return target;
}

std::string makeStructuredUiBootstrap(const UiLoadTarget& target,
                                      const juce::File& userScriptsRoot,
                                      const juce::File& systemUiDir,
                                      const juce::File& systemDspDir,
                                      bool skipDspLoad) {
  std::ostringstream code;
  code << "local loader = require(\"project_loader\")\n";
  code << "loader.install({\n";
  code << "  requestedPath = \"" << escapeLuaString(target.requestedPath.getFullPathName()).toStdString() << "\",\n";
  code << "  projectRoot = \"" << escapeLuaString(target.projectRoot.getFullPathName()).toStdString() << "\",\n";
  code << "  manifestPath = \"" << escapeLuaString(target.manifestFile.getFullPathName()).toStdString() << "\",\n";
  code << "  uiRoot = \"" << escapeLuaString(target.structuredUiRoot.getFullPathName()).toStdString() << "\",\n";
  code << "  displayName = \"" << escapeLuaString(target.displayName).toStdString() << "\",\n";
  code << "  userScriptsRoot = \"" << escapeLuaString(userScriptsRoot.getFullPathName()).toStdString() << "\",\n";
  code << "  systemUiRoot = \"" << escapeLuaString(systemUiDir.getFullPathName()).toStdString() << "\",\n";
  code << "  systemDspRoot = \"" << escapeLuaString(systemDspDir.getFullPathName()).toStdString() << "\",\n";
  code << "})\n";
  if (target.dspDefaultFile.existsAsFile() && !skipDspLoad) {
    code << "if loadDspScript then loadDspScript(\""
         << escapeLuaString(target.dspDefaultFile.getFullPathName()).toStdString()
         << "\") end\n";
  }
  return code.str();
}

} // namespace script_path_resolver
