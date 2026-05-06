#include "../primitives/scripting/dsp_host/DSPHostInternal.h"
#include "dsp/core/nodes/GainNode.h"
#include "dsp/core/nodes/FilterNode.h"
#include "dsp/core/nodes/OscillatorNode.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <limits>
#include <string>
#include <unordered_map>
#include <vector>

#include <juce_core/juce_core.h>

using dsp_host::clampParamValue;
using dsp_host::sanitizePath;
using dsp_host::isRegistryOwnedCategory;
using dsp_host::DspParamSpec;
using dsp_host::handleParamRegister;
using dsp_host::PathMapperFn;

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
        std::fprintf(stdout, "OK: ParamRegistry contract matches golden file\n");
        return true;
    }

    const size_t minLen = std::min(goldenStr.size(), currentStr.size());
    size_t diffPos = 0;
    while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos]) {
        ++diffPos;
    }

    std::fprintf(stderr, "FAIL: ParamRegistry contract mismatch\n");
    std::fprintf(stderr, "  golden: %zu bytes, current: %zu bytes\n",
                 goldenStr.size(), currentStr.size());
    std::fprintf(stderr, "  first diff at byte %zu\n", diffPos);
    return false;
}

DspParamSpec makeSpec(float min, float max, float def = 0.0f, const std::string& type = "f") {
    DspParamSpec s;
    s.typeTag = type;
    s.rangeMin = min;
    s.rangeMax = max;
    s.defaultValue = def;
    return s;
}

juce::var specToVar(const DspParamSpec& s) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("typeTag", s.typeTag);
    obj->setProperty("rangeMin", static_cast<double>(s.rangeMin));
    obj->setProperty("rangeMax", static_cast<double>(s.rangeMax));
    obj->setProperty("defaultValue", static_cast<double>(s.defaultValue));
    obj->setProperty("access", s.access);
    obj->setProperty("description", s.description);
    obj->setProperty("deferGraphMutation", s.deferGraphMutation);
    return juce::var(obj);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    juce::ScopedJuceInitialiser_GUI juceInit;
    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // ==========================================================================
    // Domain 1: clampParamValue — edge cases
    // ==========================================================================
    {
        auto* clampObj = new juce::DynamicObject();

        // Normal range [0, 1]
        auto s1 = makeSpec(0.0f, 1.0f);
        clampObj->setProperty("normal_mid", static_cast<double>(clampParamValue(s1, 0.5f)));
        clampObj->setProperty("normal_below", static_cast<double>(clampParamValue(s1, -1.0f)));
        clampObj->setProperty("normal_above", static_cast<double>(clampParamValue(s1, 2.0f)));
        clampObj->setProperty("normal_min", static_cast<double>(clampParamValue(s1, 0.0f)));
        clampObj->setProperty("normal_max", static_cast<double>(clampParamValue(s1, 1.0f)));

        // Negative range [-10, -1]
        auto s2 = makeSpec(-10.0f, -1.0f);
        clampObj->setProperty("neg_mid", static_cast<double>(clampParamValue(s2, -5.0f)));
        clampObj->setProperty("neg_below", static_cast<double>(clampParamValue(s2, -20.0f)));
        clampObj->setProperty("neg_above", static_cast<double>(clampParamValue(s2, 0.0f)));

        // Inverted range (min > max): returns value unchanged
        auto s3 = makeSpec(1.0f, 0.0f);
        clampObj->setProperty("inverted_mid", static_cast<double>(clampParamValue(s3, 0.5f)));
        clampObj->setProperty("inverted_extreme", static_cast<double>(clampParamValue(s3, 999.0f)));

        // NaN and infinity
        clampObj->setProperty("nan_input", static_cast<double>(clampParamValue(s1, std::numeric_limits<float>::quiet_NaN())));
        clampObj->setProperty("inf_input", static_cast<double>(clampParamValue(s1, std::numeric_limits<float>::infinity())));
        clampObj->setProperty("neg_inf_input", static_cast<double>(clampParamValue(s1, -std::numeric_limits<float>::infinity())));

        // Large range
        auto s4 = makeSpec(0.0f, 10000.0f);
        clampObj->setProperty("large_mid", static_cast<double>(clampParamValue(s4, 5000.0f)));

        // Equal min=max
        auto s5 = makeSpec(0.5f, 0.5f);
        clampObj->setProperty("equal_mid", static_cast<double>(clampParamValue(s5, 0.5f)));
        clampObj->setProperty("equal_below", static_cast<double>(clampParamValue(s5, 0.0f)));

        root->setProperty("clampParamValue", juce::var(clampObj));
    }

    // ==========================================================================
    // Domain 2: sanitizePath — path normalization
    // ==========================================================================
    {
        auto* pathObj = new juce::DynamicObject();
        pathObj->setProperty("already_has_slash", sanitizePath("/foo/bar"));
        pathObj->setProperty("no_slash", sanitizePath("foo/bar"));
        pathObj->setProperty("single_segment", sanitizePath("foo"));
        pathObj->setProperty("root_only", sanitizePath("/"));
        pathObj->setProperty("empty_string", sanitizePath(""));
        pathObj->setProperty("double_slash", sanitizePath("//foo"));
        pathObj->setProperty("trailing_slash", sanitizePath("/foo/bar/"));
        root->setProperty("sanitizePath", juce::var(pathObj));
    }

    // ==========================================================================
    // Domain 3: isRegistryOwnedCategory — category ownership checks
    // ==========================================================================
    {
        auto* catObj = new juce::DynamicObject();
        catObj->setProperty("backend", isRegistryOwnedCategory("backend"));
        catObj->setProperty("query", isRegistryOwnedCategory("query"));
        catObj->setProperty("dsp", isRegistryOwnedCategory("dsp"));
        catObj->setProperty("control", isRegistryOwnedCategory("control"));
        catObj->setProperty("empty", isRegistryOwnedCategory(""));
        catObj->setProperty("Backend_case_mismatch", isRegistryOwnedCategory("Backend"));
        root->setProperty("isRegistryOwnedCategory", juce::var(catObj));
    }

    // ==========================================================================
    // Domain 4: handleParamRegister — full param registration via sol2
    // ==========================================================================
    {
        sol::state lua;
        lua.open_libraries(sol::lib::base);

        std::unordered_map<std::string, DspParamSpec> paramSpecs;
        std::unordered_map<std::string, float> paramValues;
        std::unordered_map<std::string, std::string> externalToInternal;
        std::unordered_map<std::string, std::string> internalToExternal;

        auto identityMap = [](const std::string& p) { return p; };

        // Basic float param with full options
        auto basicOpts = lua.create_table();
        basicOpts["type"] = "f";
        basicOpts["min"] = 0.0f;
        basicOpts["max"] = 1.0f;
        basicOpts["default"] = 0.5f;
        basicOpts["description"] = "Test gain";
        handleParamRegister("/test/gain", basicOpts, paramSpecs, paramValues,
                          externalToInternal, internalToExternal, identityMap, identityMap);

        // Integer param with restricted access
        auto intOpts = lua.create_table();
        intOpts["type"] = "i";
        intOpts["min"] = 0.0f;
        intOpts["max"] = 10.0f;
        intOpts["default"] = 4.0f;
        intOpts["access"] = 1;
        handleParamRegister("/test/count", intOpts, paramSpecs, paramValues,
                          externalToInternal, internalToExternal, identityMap, identityMap);

        // Float param with deferred graph mutation
        auto deferOpts = lua.create_table();
        deferOpts["type"] = "f";
        deferOpts["min"] = 20.0f;
        deferOpts["max"] = 20000.0f;
        deferOpts["default"] = 1000.0f;
        deferOpts["deferGraphMutation"] = true;
        handleParamRegister("/test/filter/cutoff", deferOpts, paramSpecs, paramValues,
                          externalToInternal, internalToExternal, identityMap, identityMap);

        // Default outside range (should clamp to max)
        auto clampDefaultOpts = lua.create_table();
        clampDefaultOpts["min"] = 0.0f;
        clampDefaultOpts["max"] = 1.0f;
        clampDefaultOpts["default"] = 5.0f;
        handleParamRegister("/test/clamped_default", clampDefaultOpts, paramSpecs, paramValues,
                          externalToInternal, internalToExternal, identityMap, identityMap);

        // Empty options table
        auto emptyOpts = lua.create_table();
        handleParamRegister("/test/empty_spec", emptyOpts, paramSpecs, paramValues,
                          externalToInternal, internalToExternal, identityMap, identityMap);

        // Serialize registered specs
        auto* regObj = new juce::DynamicObject();
        auto* specsArr = new juce::Array<juce::var>();
        for (const auto& kv : paramSpecs) {
            auto* entry = new juce::DynamicObject();
            entry->setProperty("path", juce::String(kv.first));
            entry->setProperty("spec", specToVar(kv.second));
            specsArr->add(juce::var(entry));
        }
        regObj->setProperty("registeredSpecs", juce::var(*specsArr));

        // Serialize current values
        auto* valsArr = new juce::Array<juce::var>();
        for (const auto& kv : paramValues) {
            auto* entry = new juce::DynamicObject();
            entry->setProperty("path", juce::String(kv.first));
            entry->setProperty("value", static_cast<double>(kv.second));
            valsArr->add(juce::var(entry));
        }
        regObj->setProperty("paramValues", juce::var(*valsArr));

        // Verify external/internal path mapping
        auto* pathArr = new juce::Array<juce::var>();
        for (const auto& kv : externalToInternal) {
            auto* entry = new juce::DynamicObject();
            entry->setProperty("external", juce::String(kv.first));
            entry->setProperty("internal", juce::String(kv.second));
            pathArr->add(juce::var(entry));
        }
        regObj->setProperty("pathMapping", juce::var(*pathArr));
        regObj->setProperty("totalParams", static_cast<int>(paramSpecs.size()));

        // Register with a custom path mapper (prefix)
        std::unordered_map<std::string, DspParamSpec> mappedSpecs;
        std::unordered_map<std::string, float> mappedValues;
        std::unordered_map<std::string, std::string> mappedExtToInt;
        std::unordered_map<std::string, std::string> mappedIntToExt;

        auto prefixMapper = [](const std::string& p) { return "/prefix" + p; };
        auto stripMapper = [](const std::string& p) {
            return p.substr(0, 7) == "/prefix" ? p.substr(7) : p;
        };

        auto mappedOpts = lua.create_table();
        mappedOpts["type"] = "f";
        mappedOpts["min"] = 0.0f;
        mappedOpts["max"] = 1.0f;
        mappedOpts["default"] = 0.5f;
        handleParamRegister("/test/param", mappedOpts, mappedSpecs, mappedValues,
                          mappedExtToInt, mappedIntToExt, prefixMapper, stripMapper);

        auto* mappedArr = new juce::Array<juce::var>();
        for (const auto& kv : mappedSpecs) {
            auto* entry = new juce::DynamicObject();
            entry->setProperty("externalPath", juce::String(kv.first));
            entry->setProperty("spec", specToVar(kv.second));
            mappedArr->add(juce::var(entry));
        }
        regObj->setProperty("mappedSpecs", juce::var(*mappedArr));
        regObj->setProperty("totalMappedParams", static_cast<int>(mappedSpecs.size()));

        root->setProperty("paramRegister", juce::var(regObj));
    }

    // ==========================================================================
    // Domain 5: Binding callback dispatch via dynamic_pointer_cast
    // Tests that the lambda shapes handleParamBind creates actually call the
    // correct node methods. We construct lambdas matching the pattern from
    // DSPHostParamRegistry.cpp and verify they produce correct side effects.
    // ==========================================================================
    {
        auto* bindObj = new juce::DynamicObject();

        // GainNode::setGain binding
        {
            auto gain = std::make_shared<dsp_primitives::GainNode>();
            std::function<void(float)> cb = [gain](float v) { gain->setGain(v); };
            gain->setGain(0.0f);
            cb(0.75f);
            bindObj->setProperty("gain_setGain", static_cast<double>(gain->getGain()));
        }

        // GainNode::setMuted binding
        {
            auto gain = std::make_shared<dsp_primitives::GainNode>();
            std::function<void(float)> cb = [gain](float v) { gain->setMuted(v > 0.5f); };
            gain->setMuted(false);
            cb(1.0f);  // > 0.5 → muted = true
            bindObj->setProperty("gain_setMuted", gain->isMuted());
        }

        // FilterNode::setCutoff binding
        {
            auto filter = std::make_shared<dsp_primitives::FilterNode>();
            std::function<void(float)> cb = [filter](float v) { filter->setCutoff(v); };
            filter->setCutoff(100.0f);
            cb(5000.0f);
            bindObj->setProperty("filter_setCutoff", static_cast<double>(filter->getCutoff()));
        }

        // FilterNode::setResonance binding
        {
            auto filter = std::make_shared<dsp_primitives::FilterNode>();
            std::function<void(float)> cb = [filter](float v) { filter->setResonance(v); };
            filter->setResonance(0.1f);
            cb(0.707f);
            bindObj->setProperty("filter_setResonance", static_cast<double>(filter->getResonance()));
        }

        // FilterNode::setMix binding
        {
            auto filter = std::make_shared<dsp_primitives::FilterNode>();
            std::function<void(float)> cb = [filter](float v) { filter->setMix(v); };
            filter->setMix(0.0f);
            cb(0.8f);
            bindObj->setProperty("filter_setMix", static_cast<double>(filter->getMix()));
        }

        // Self-edge: test that dynamic_pointer_cast dispatch matches the node type
        // GainNode also has setGain — verify FilterNode's setGain doesn't exist
        // (should not compile — different interface)
        // Instead, test each node type's specific methods
        {
            auto gain = std::make_shared<dsp_primitives::GainNode>();
            auto filter = std::make_shared<dsp_primitives::FilterNode>();

            // Attempt cast via dynamic_pointer_cast pattern from handleParamBind
            auto gainCast = std::dynamic_pointer_cast<dsp_primitives::GainNode>(filter);
            auto filterCast = std::dynamic_pointer_cast<dsp_primitives::FilterNode>(gain);
            bindObj->setProperty("gainPtr_on_filterNode", gainCast != nullptr);
            bindObj->setProperty("filterPtr_on_gainNode", filterCast != nullptr);
        }

        // Method dispatch test: same method name on different node types
        {
            auto gain = std::make_shared<dsp_primitives::GainNode>();
            auto osc = std::make_shared<dsp_primitives::OscillatorNode>();
            // Both have some overlapping conceptual methods? No, they're different.
            // GainNode has setGain, OscillatorNode has setFrequency — verify isolation.
            std::function<void(float)> gainCb = [gain](float v) { gain->setGain(v); };
            std::function<void(float)> oscCb = [osc](float v) { osc->setFrequency(v); };

            gain->setGain(0.0f);
            osc->setFrequency(0.0f);
            gainCb(0.5f);  // should NOT affect oscillator
            oscCb(440.0f); // should NOT affect gain
            bindObj->setProperty("gain_isolation", static_cast<double>(gain->getGain()));
            bindObj->setProperty("osc_isolation", static_cast<double>(osc->getFrequency()));
        }

        root->setProperty("paramBind", juce::var(bindObj));
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
            std::fprintf(stdout, "OK: wrote ParamRegistry contract (%zu bytes) to %s\n",
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
