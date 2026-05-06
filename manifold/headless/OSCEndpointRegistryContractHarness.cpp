#include "../primitives/control/OSCEndpointRegistry.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

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
        std::fprintf(stdout, "OK: OSCEndpointRegistry contract matches golden file\n");
        return true;
    }

    const size_t minLen = std::min(goldenStr.size(), currentStr.size());
    size_t diffPos = 0;
    while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos]) {
        ++diffPos;
    }

    std::fprintf(stderr, "FAIL: OSCEndpointRegistry contract mismatch\n");
    std::fprintf(stderr, "  golden: %zu bytes, current: %zu bytes\n",
                 goldenStr.size(), currentStr.size());
    std::fprintf(stderr, "  first diff at byte %zu\n", diffPos);
    return false;
}

juce::var endpointToVar(const OSCEndpoint& ep) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("path", ep.path);
    obj->setProperty("type", ep.type);
    obj->setProperty("rangeMin", static_cast<double>(ep.rangeMin));
    obj->setProperty("rangeMax", static_cast<double>(ep.rangeMax));
    obj->setProperty("access", ep.access);
    obj->setProperty("description", ep.description);
    obj->setProperty("category", ep.category);
    obj->setProperty("commandType", static_cast<int>(ep.commandType));
    obj->setProperty("layerIndex", ep.layerIndex);
    return juce::var(obj);
}

juce::var statsToVar(const OSCEndpointRegistry::Stats& stats) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("totalCount", static_cast<double>(stats.totalCount));
    obj->setProperty("backendCount", static_cast<double>(stats.backendCount));
    obj->setProperty("customCount", static_cast<double>(stats.customCount));
    obj->setProperty("pathBytes", static_cast<double>(stats.pathBytes));
    obj->setProperty("descriptionBytes", static_cast<double>(stats.descriptionBytes));
    return juce::var(obj);
}

juce::var sortedPathsToVar(const std::vector<OSCEndpoint>& endpoints) {
    std::vector<juce::String> paths;
    paths.reserve(endpoints.size());
    for (const auto& ep : endpoints) {
        paths.push_back(ep.path);
    }
    std::sort(paths.begin(), paths.end(), [](const juce::String& a, const juce::String& b) {
        return a < b;
    });

    juce::Array<juce::var> out;
    for (const auto& path : paths) {
        out.add(path);
    }
    return juce::var(out);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // ======================================================================
    // Domain 1: default backend inventory
    // ======================================================================
    {
        OSCEndpointRegistry registry;
        auto* obj = new juce::DynamicObject();

        const auto all = registry.getAllEndpoints();
        const auto backend = registry.getBackendEndpoints();
        obj->setProperty("numLayers", registry.getNumLayers());
        obj->setProperty("backendEnabled", registry.isBackendEnabled());
        obj->setProperty("allCount", static_cast<int>(all.size()));
        obj->setProperty("backendCount", static_cast<int>(backend.size()));
        obj->setProperty("stats", statsToVar(registry.getStats()));
        obj->setProperty("paths", sortedPathsToVar(all));

        obj->setProperty("tempo", endpointToVar(registry.findEndpoint("/core/behavior/tempo")));
        obj->setProperty("recording", endpointToVar(registry.findEndpoint("/core/behavior/recording")));
        obj->setProperty("layer0Speed", endpointToVar(registry.findEndpoint("/core/behavior/layer/0/speed")));
        obj->setProperty("layer3Reverse", endpointToVar(registry.findEndpoint("/core/behavior/layer/3/reverse")));
        obj->setProperty("missingPathFound", registry.findEndpoint("/core/behavior/nope").path.isNotEmpty());

        root->setProperty("defaultBackendInventory", juce::var(obj));
    }

    // ======================================================================
    // Domain 2: rebuild after layer-count change
    // ======================================================================
    {
        OSCEndpointRegistry registry;
        registry.setNumLayers(2);
        registry.rebuild();

        auto* obj = new juce::DynamicObject();
        const auto all = registry.getAllEndpoints();
        obj->setProperty("numLayers", registry.getNumLayers());
        obj->setProperty("allCount", static_cast<int>(all.size()));
        obj->setProperty("stats", statsToVar(registry.getStats()));
        obj->setProperty("hasLayer0Speed", registry.findEndpoint("/core/behavior/layer/0/speed").path.isNotEmpty());
        obj->setProperty("hasLayer1Speed", registry.findEndpoint("/core/behavior/layer/1/speed").path.isNotEmpty());
        obj->setProperty("hasLayer2Speed", registry.findEndpoint("/core/behavior/layer/2/speed").path.isNotEmpty());
        obj->setProperty("hasLayer3Speed", registry.findEndpoint("/core/behavior/layer/3/speed").path.isNotEmpty());
        root->setProperty("layerCountRebuild", juce::var(obj));
    }

    // ======================================================================
    // Domain 3: backend enable / disable semantics
    // ======================================================================
    {
        OSCEndpointRegistry registry;
        auto* obj = new juce::DynamicObject();

        registry.setBackendEnabled(false);
        obj->setProperty("backendEnabledAfterDisable", registry.isBackendEnabled());
        obj->setProperty("allCountAfterDisable", static_cast<int>(registry.getAllEndpoints().size()));
        obj->setProperty("statsAfterDisable", statsToVar(registry.getStats()));
        obj->setProperty("tempoFoundAfterDisable", registry.findEndpoint("/core/behavior/tempo").path.isNotEmpty());

        registry.setBackendEnabled(true);
        obj->setProperty("backendEnabledAfterEnable", registry.isBackendEnabled());
        obj->setProperty("allCountAfterEnable", static_cast<int>(registry.getAllEndpoints().size()));
        obj->setProperty("tempoFoundAfterEnable", registry.findEndpoint("/core/behavior/tempo").path.isNotEmpty());

        root->setProperty("backendToggle", juce::var(obj));
    }

    // ======================================================================
    // Domain 4: custom endpoint lifecycle
    // ======================================================================
    {
        OSCEndpointRegistry registry;
        auto* obj = new juce::DynamicObject();

        OSCEndpoint xy;
        xy.path = "/custom/xy";
        xy.type = "ff";
        xy.rangeMin = 0.0f;
        xy.rangeMax = 1.0f;
        xy.access = 3;
        xy.description = "XY pad";
        xy.category = "custom";
        xy.commandType = ControlCommand::Type::None;
        xy.layerIndex = -1;
        registry.registerCustomEndpoint(xy);

        OSCEndpoint meter;
        meter.path = "/custom/meter";
        meter.type = "f";
        meter.rangeMin = -60.0f;
        meter.rangeMax = 6.0f;
        meter.access = 1;
        meter.description = "Level meter";
        meter.category = "custom";
        registry.registerCustomEndpoint(meter);

        obj->setProperty("afterRegisterCount", static_cast<int>(registry.getAllEndpoints().size()));
        obj->setProperty("afterRegisterStats", statsToVar(registry.getStats()));
        obj->setProperty("xy", endpointToVar(registry.findEndpoint("/custom/xy")));
        obj->setProperty("meter", endpointToVar(registry.findEndpoint("/custom/meter")));

        // update existing custom endpoint in place
        xy.description = "XY pad updated";
        xy.access = 1;
        registry.registerCustomEndpoint(xy);
        obj->setProperty("xyUpdated", endpointToVar(registry.findEndpoint("/custom/xy")));

        registry.unregisterCustomEndpoint("/custom/meter");
        obj->setProperty("meterFoundAfterUnregister", registry.findEndpoint("/custom/meter").path.isNotEmpty());
        obj->setProperty("afterUnregisterStats", statsToVar(registry.getStats()));

        registry.clearCustomEndpoints();
        obj->setProperty("xyFoundAfterClear", registry.findEndpoint("/custom/xy").path.isNotEmpty());
        obj->setProperty("afterClearStats", statsToVar(registry.getStats()));

        root->setProperty("customEndpointLifecycle", juce::var(obj));
    }

    // ======================================================================
    // Domain 5: backend/custom coexistence and ordering
    // ======================================================================
    {
        OSCEndpointRegistry registry;
        auto* obj = new juce::DynamicObject();

        OSCEndpoint custom;
        custom.path = "/zzz/custom";
        custom.type = "i";
        custom.access = 3;
        custom.description = "late custom";
        custom.category = "custom";
        registry.registerCustomEndpoint(custom);

        const auto all = registry.getAllEndpoints();
        obj->setProperty("allCount", static_cast<int>(all.size()));
        obj->setProperty("stats", statsToVar(registry.getStats()));
        obj->setProperty("paths", sortedPathsToVar(all));
        obj->setProperty("customFound", registry.findEndpoint("/zzz/custom").path.isNotEmpty());
        obj->setProperty("backendTempoStillFound", registry.findEndpoint("/core/behavior/tempo").path.isNotEmpty());

        root->setProperty("coexistence", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();

    switch (opts.mode) {
        case HarnessOptions::Write: {
            std::ofstream file(opts.contractPath);
            if (!file.is_open()) {
                std::fprintf(stderr, "ERROR: cannot write to %s\n", opts.contractPath.c_str());
                std::_Exit(2);
            }
            file << contract;
            file.close();
            std::fprintf(stdout, "OK: wrote OSCEndpointRegistry contract (%zu bytes) to %s\n",
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
