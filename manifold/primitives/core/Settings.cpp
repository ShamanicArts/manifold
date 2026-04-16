#include "Settings.h"

#include "SystemPaths.h"

namespace {

bool isRepoRoot(const juce::File& dir) {
    return dir.isDirectory() &&
           dir.getChildFile("CMakeLists.txt").existsAsFile() &&
           dir.getChildFile("manifold").isDirectory();
}

juce::File findRepoRoot(juce::File startDir) {
    if (!startDir.isDirectory()) {
        return {};
    }

    while (startDir.isDirectory()) {
        if (isRepoRoot(startDir)) {
            return startDir;
        }

        const auto parent = startDir.getParentDirectory();
        if (parent == startDir) {
            break;
        }
        startDir = parent;
    }

    return {};
}

juce::File detectRepoRoot() {
    const auto cwdRoot = findRepoRoot(juce::File::getCurrentWorkingDirectory());
    if (cwdRoot.isDirectory()) {
        return cwdRoot;
    }

    const auto exeDir = juce::File::getSpecialLocation(juce::File::currentExecutableFile)
                            .getParentDirectory();
    const auto exeRoot = findRepoRoot(exeDir);
    if (exeRoot.isDirectory()) {
        return exeRoot;
    }

    return {};
}

juce::File getDefaultLauncherScript() {
    const auto repoRoot = detectRepoRoot();
    if (repoRoot.isDirectory()) {
        const auto repoLauncher = repoRoot.getChildFile("manifold")
                                         .getChildFile("ui")
                                         .getChildFile("empty_launcher.lua");
        if (repoLauncher.existsAsFile()) {
            return repoLauncher;
        }
    }

#ifdef MANIFOLD_SOURCE_DIR
    auto sourceDir = juce::String(JUCE_STRINGIFY(MANIFOLD_SOURCE_DIR));
    if (sourceDir.length() >= 2 && sourceDir.startsWithChar('"') && sourceDir.endsWithChar('"')) {
        sourceDir = sourceDir.substring(1, sourceDir.length() - 1);
    }
    const auto compiledLauncher = juce::File(sourceDir)
                                      .getChildFile("manifold")
                                      .getChildFile("ui")
                                      .getChildFile("empty_launcher.lua");
    if (compiledLauncher.existsAsFile()) {
        return compiledLauncher;
    }
#endif

    return {};
}

void applyDefaultPaths(Settings& settings) {
    const auto repoRoot = detectRepoRoot();

    if (repoRoot.isDirectory()) {
        const auto devScriptsDir = repoRoot.getChildFile("manifold").getChildFile("ui");
        const auto userScriptsDir = repoRoot.getChildFile("UserScripts");
        const auto dspScriptsDir = repoRoot.getChildFile("manifold").getChildFile("dsp");

        if (devScriptsDir.isDirectory()) {
            settings.setDevScriptsDir(devScriptsDir.getFullPathName());
        }
        if (userScriptsDir.isDirectory()) {
            settings.setUserScriptsDir(userScriptsDir.getFullPathName());
        }
        if (dspScriptsDir.isDirectory()) {
            settings.setDspScriptsDir(dspScriptsDir.getFullPathName());
        }
    } else {
        const auto userScriptsDir = SystemPaths::getUserScriptsDir();
        if (userScriptsDir.isDirectory()) {
            settings.setUserScriptsDir(userScriptsDir.getFullPathName());
        }
    }

    const auto launcherScript = getDefaultLauncherScript();
    if (launcherScript.existsAsFile()) {
        settings.setDefaultUiScript(launcherScript.getFullPathName());
    }
}

} // namespace

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
    const auto repoRoot = detectRepoRoot();
    if (repoRoot.isDirectory()) {
        return repoRoot.getChildFile(".manifold.settings.json");
    }
    return getConfigDir().getChildFile("settings.json");
}

void Settings::load() {
    applyDefaultPaths(*this);

    auto configFile = getConfigFile();
    if (!configFile.existsAsFile()) {
        loaded_ = true;
        return;
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
    configFile.getParentDirectory().createDirectory();
    configFile.replaceWithText(juce::JSON::toString(json));
}
