#pragma once

#include "../ui/Canvas.h"
#include <juce_gui_basics/juce_gui_basics.h>

#include <functional>
#include <memory>
#include <string>
#include <vector>

// Forward-declare sol types to avoid pulling sol.hpp into every TU
namespace sol {
class state;
}

class LooperProcessor;

/**
 * LuaEngine: hosts a Lua VM on the JUCE message thread.
 *
 * Responsibilities:
 *  - Load and execute Lua scripts
 *  - Bind Canvas, CanvasStyle, Graphics to Lua
 *  - Bind `command()` so Lua can post ControlServer commands
 *  - Push processor state snapshot to Lua each tick
 *  - Support hot-reload on script file change
 *
 * Threading: ALL methods must be called on the message thread only.
 */
class LuaEngine {
public:
  LuaEngine();
  ~LuaEngine();

  /** Initialise the Lua VM and register all bindings.
   *  @param processor  The audio processor (for command posting and state
   * reading).
   *  @param rootCanvas The root Canvas node that Lua will populate with
   * children.
   */
  void initialise(LooperProcessor *processor, Canvas *rootCanvas);

  /** Load and execute a script file.  Calls ui_init(root) in the script. */
  bool loadScript(const juce::File &scriptFile);

  /** Switch to a different script file (tears down current UI, loads new one).
   */
  bool switchScript(const juce::File &scriptFile);

  /** Reload the currently loaded script (hot-reload). */
  bool reloadCurrentScript();

  /** Get list of available UI scripts in a directory.
   *  Returns vector of {name, absolutePath} pairs. */
  std::vector<std::pair<std::string, std::string>>
  getAvailableScripts(const juce::File &directory) const;

  /** Called on editor resize.  Calls ui_resized(w, h) in the script. */
  void notifyResized(int width, int height);

  /** Called at timer rate (~30Hz).  Pushes state and calls ui_update(state).
   *  Also checks for hot-reload if enough time has elapsed. */
  void notifyUpdate();

  /** Returns true if a script is loaded and running. */
  bool isScriptLoaded() const;

  /** Get last error message (empty if no error). */
  const std::string &getLastError() const;

  /** Get the directory where the current script lives. */
  juce::File getScriptDirectory() const;

private:
  void registerBindings();
  void pushStateToLua();
  void checkHotReload();

  struct Impl;
  std::unique_ptr<Impl> pImpl;

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(LuaEngine)
};
