#include "Settings.h"

Settings& Settings::getInstance() {
    static Settings instance;
    if (!instance.loaded_) {
        instance.load();
    }
    return instance;
}

juce::File Settings::getConfigDir() const {
    return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
           .getChildFile("Manifold");
}

juce::File Settings::getConfigFile() const {
    // Priority 1: Local dev settings in project root
    auto localSettings = juce::File("/home/shamanic/dev/my-plugin/.manifold.settings.json");
    if (localSettings.existsAsFile()) {
        return localSettings;
    }
    
    // Priority 2: User config directory
    return getConfigDir().getChildFile("settings.json");
}

void Settings::ensureConfigDirExists() const {
    getConfigDir().createDirectory();
}

void Settings::load() {
    auto configFile = getConfigFile();
    if (!configFile.existsAsFile()) {
        loaded_ = true;
        return; // Use defaults
    }

    auto json = juce::JSON::parse(configFile);
    if (json.isObject()) {
        auto* obj = json.getDynamicObject();
        
        // OSC settings
        if (obj->hasProperty("oscPort")) {
            oscPort_ = obj->getProperty("oscPort");
        }
        if (obj->hasProperty("oscQueryPort")) {
            oscQueryPort_ = obj->getProperty("oscQueryPort");
        }
        
        // UI settings
        if (obj->hasProperty("defaultUiScript")) {
            defaultUiScript_ = obj->getProperty("defaultUiScript").toString();
        }
        
        // Development settings
        if (obj->hasProperty("devScriptsDir")) {
            devScriptsDir_ = obj->getProperty("devScriptsDir").toString();
        }
        
        // User scripts directory
        if (obj->hasProperty("userScriptsDir")) {
            userScriptsDir_ = obj->getProperty("userScriptsDir").toString();
        }
        
        // DSP scripts directory
        if (obj->hasProperty("dspScriptsDir")) {
            dspScriptsDir_ = obj->getProperty("dspScriptsDir").toString();
        }
    }
    
    loaded_ = true;
}

void Settings::save() const {
    ensureConfigDirExists();
    
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    
    // OSC settings
    obj->setProperty("oscPort", oscPort_);
    obj->setProperty("oscQueryPort", oscQueryPort_);
    
    // UI settings
    if (defaultUiScript_.isNotEmpty()) {
        obj->setProperty("defaultUiScript", defaultUiScript_);
    }
    
    // Development settings
    if (devScriptsDir_.isNotEmpty()) {
        obj->setProperty("devScriptsDir", devScriptsDir_);
    }
    
    // User scripts directory
    if (userScriptsDir_.isNotEmpty()) {
        obj->setProperty("userScriptsDir", userScriptsDir_);
    }
    
    // DSP scripts directory
    if (dspScriptsDir_.isNotEmpty()) {
        obj->setProperty("dspScriptsDir", dspScriptsDir_);
    }
    
    auto json = juce::var(obj.get());
    auto configFile = getConfigFile();
    configFile.replaceWithText(juce::JSON::toString(json));
}
