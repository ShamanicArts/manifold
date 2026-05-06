#include "../primitives/control/OSCSettingsPersistence.h"

#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>

#include <unistd.h>

#include <juce_core/juce_core.h>

namespace {

struct HarnessOptions {
    enum Mode { Print, Write, Verify } mode = Print;
    std::string contractPath;
};

void printUsage(const char* name) {
    std::fprintf(stderr,
                 "Usage: %s [--print-contract | --write-contract PATH | --verify-contract PATH]\n",
                 name);
}

bool parseOptions(int argc, char* argv[], HarnessOptions& out) {
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--print-contract") {
            out.mode = HarnessOptions::Print;
        } else if (arg == "--write-contract" && i + 1 < argc) {
            out.mode = HarnessOptions::Write;
            out.contractPath = argv[++i];
        } else if (arg == "--verify-contract" && i + 1 < argc) {
            out.mode = HarnessOptions::Verify;
            out.contractPath = argv[++i];
        } else if (arg == "--help" || arg == "-h") {
            printUsage(argv[0]);
            return false;
        } else {
            std::fprintf(stderr, "Unknown argument: %s\n", argv[i]);
            printUsage(argv[0]);
            return false;
        }
    }
    return true;
}

std::string readFile(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        std::fprintf(stderr, "ERROR: cannot read file: %s\n", path.c_str());
        std::exit(2);
    }
    return std::string((std::istreambuf_iterator<char>(file)),
                       std::istreambuf_iterator<char>());
}

bool verifyContract(const std::string& rawCurrent, const std::string& goldenPath) {
    const auto rawGolden = readFile(goldenPath);
    const auto goldenVar = juce::JSON::parse(rawGolden);
    const auto currentVar = juce::JSON::parse(rawCurrent);

    if (goldenVar.isVoid() || currentVar.isVoid()) {
        std::fprintf(stderr, "FAIL: could not parse contract JSON\n");
        return false;
    }

    const auto goldenStr = juce::JSON::toString(goldenVar).toStdString();
    const auto currentStr = juce::JSON::toString(currentVar).toStdString();
    if (goldenStr == currentStr) {
        std::fprintf(stdout, "OK: OSCSettingsPersistence contract matches golden file\n");
        return true;
    }

    const size_t minLen = std::min(goldenStr.size(), currentStr.size());
    size_t diffPos = 0;
    while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos]) {
        ++diffPos;
    }

    std::fprintf(stderr, "FAIL: OSCSettingsPersistence contract mismatch\n");
    std::fprintf(stderr, "  golden: %zu bytes, current: %zu bytes\n",
                 goldenStr.size(), currentStr.size());
    std::fprintf(stderr, "  first diff at byte %zu\n", diffPos);
    return false;
}

juce::var settingsToVar(const OSCSettings& settings) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("inputPort", settings.inputPort);
    obj->setProperty("queryPort", settings.queryPort);
    obj->setProperty("oscEnabled", settings.oscEnabled);
    obj->setProperty("oscQueryEnabled", settings.oscQueryEnabled);
    juce::Array<juce::var> targets;
    for (const auto& target : settings.outTargets) {
        targets.add(target);
    }
    obj->setProperty("outTargets", juce::var(targets));
    return juce::var(obj);
}

constexpr const char* kSandboxMarker = "MANIFOLD_OSC_SETTINGS_SANDBOXED";
constexpr const char* kSandboxHome = "/tmp/manifold_osc_settings_persistence_contract_home";

} // namespace

int main(int argc, char* argv[]) {
    if (std::getenv(kSandboxMarker) == nullptr) {
        juce::File sandboxHome{kSandboxHome};
        sandboxHome.deleteRecursively();
        sandboxHome.createDirectory();
        sandboxHome.getChildFile(".config").createDirectory();

        ::setenv("HOME", sandboxHome.getFullPathName().toStdString().c_str(), 1);
        ::setenv("XDG_CONFIG_HOME", sandboxHome.getChildFile(".config").getFullPathName().toStdString().c_str(), 1);
        ::setenv(kSandboxMarker, "1", 1);
        ::execv(argv[0], argv);
        std::perror("execv");
        return 2;
    }

    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    juce::File tempRoot{kSandboxHome};

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);
    root->setProperty("tempRoot", tempRoot.getFullPathName());

    // ======================================================================
    // Domain 1: path resolution under overridden XDG_CONFIG_HOME
    // ======================================================================
    {
        auto* obj = new juce::DynamicObject();
        const auto file = OSCSettingsPersistence::getSettingsFile();
        obj->setProperty("settingsPath", file.getFullPathName());
        obj->setProperty("parentDir", file.getParentDirectory().getFullPathName());
        obj->setProperty("existsInitially", file.existsAsFile());
        obj->setProperty("isInsideTempRoot", file.getFullPathName().startsWith(tempRoot.getFullPathName()));
        root->setProperty("pathResolution", juce::var(obj));
    }

    // ======================================================================
    // Domain 2: load defaults with no file present
    // ======================================================================
    {
        const auto defaults = OSCSettingsPersistence::load();
        auto* obj = new juce::DynamicObject();
        obj->setProperty("defaults", settingsToVar(defaults));
        root->setProperty("loadWithoutFile", juce::var(obj));
    }

    // ======================================================================
    // Domain 3: save custom settings and load them back
    // ======================================================================
    {
        OSCSettings custom;
        custom.inputPort = 9100;
        custom.queryPort = 9101;
        custom.oscEnabled = true;
        custom.oscQueryEnabled = true;
        custom.outTargets.add("127.0.0.1:9000");
        custom.outTargets.add("10.0.0.5:9010");

        const bool saved = OSCSettingsPersistence::save(custom);
        const auto loaded = OSCSettingsPersistence::load();

        auto* obj = new juce::DynamicObject();
        obj->setProperty("saved", saved);
        obj->setProperty("loaded", settingsToVar(loaded));
        obj->setProperty("settingsFileExists", OSCSettingsPersistence::getSettingsFile().existsAsFile());
        obj->setProperty("rawJson", OSCSettingsPersistence::getSettingsFile().loadFileAsString());
        root->setProperty("saveAndLoad", juce::var(obj));
    }

    // ======================================================================
    // Domain 4: invalid JSON falls back to defaults
    // ======================================================================
    {
        auto file = OSCSettingsPersistence::getSettingsFile();
        file.replaceWithText("{ invalid json }");
        const auto loaded = OSCSettingsPersistence::load();

        auto* obj = new juce::DynamicObject();
        obj->setProperty("loaded", settingsToVar(loaded));
        obj->setProperty("fileStillExists", file.existsAsFile());
        root->setProperty("invalidJsonFallback", juce::var(obj));
    }

    // ======================================================================
    // Domain 5: reset to defaults rewrites file
    // ======================================================================
    {
        const bool reset = OSCSettingsPersistence::resetToDefaults();
        const auto loaded = OSCSettingsPersistence::load();

        auto* obj = new juce::DynamicObject();
        obj->setProperty("reset", reset);
        obj->setProperty("loaded", settingsToVar(loaded));
        obj->setProperty("rawJson", OSCSettingsPersistence::getSettingsFile().loadFileAsString());
        root->setProperty("resetToDefaults", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    tempRoot.deleteRecursively();

    switch (opts.mode) {
        case HarnessOptions::Write: {
            std::ofstream file(opts.contractPath);
            if (!file.is_open()) {
                std::fprintf(stderr, "ERROR: cannot write to %s\n", opts.contractPath.c_str());
                std::_Exit(2);
            }
            file << contract;
            file.close();
            std::fprintf(stdout, "OK: wrote OSCSettingsPersistence contract (%zu bytes) to %s\n",
                         contract.size(), opts.contractPath.c_str());
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit(0);
        }
        case HarnessOptions::Verify: {
            const bool ok = verifyContract(contract, opts.contractPath);
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit(ok ? 0 : 1);
        }
        case HarnessOptions::Print: {
            std::fprintf(stdout, "%s", contract.c_str());
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit(0);
        }
    }

    std::_Exit(0);
}
