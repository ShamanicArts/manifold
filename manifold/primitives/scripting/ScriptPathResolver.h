#pragma once

#include <juce_core/juce_core.h>

#include <string>

namespace script_path_resolver {

struct UiLoadTarget {
  juce::File requestedPath;
  juce::File bootstrapPath;
  juce::File projectRoot;
  juce::File manifestFile;
  juce::File structuredUiRoot;
  juce::File dspDefaultFile;
  juce::String displayName;
  bool isProject = false;
  bool isStructured = false;
  bool isSystemProject = false;
  bool isOverlay = false;
  bool useSharedShell = true;
  std::string error;
};

bool shouldUseSharedShell(const UiLoadTarget& target, bool isOverlay);
juce::File resolveCompiledSystemUiDir();
juce::File resolveSystemUiDir();
juce::File resolveProjectAssetRef(const juce::File& projectRoot,
                                  const juce::String& assetRef);
UiLoadTarget resolveUiLoadTarget(const juce::File& requestedPath);
std::string makeStructuredUiBootstrap(const UiLoadTarget& target,
                                      const juce::File& userScriptsRoot,
                                      const juce::File& systemUiDir,
                                      const juce::File& systemDspDir,
                                      bool skipDspLoad = false);

} // namespace script_path_resolver
