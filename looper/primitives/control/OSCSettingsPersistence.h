#pragma once

#include "OSCServer.h"

/**
 * Load/save OSCSettings to JSON file
 * Location: ~/.config/looper/settings.json (Linux/macOS) or %APPDATA%/looper/settings.json (Windows)
 */
class OSCSettingsPersistence {
public:
    static juce::File getSettingsFile();
    static OSCSettings load();
    static bool save(const OSCSettings& settings);
    static bool resetToDefaults();
};
