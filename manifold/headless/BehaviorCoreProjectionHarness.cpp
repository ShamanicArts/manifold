/**
 * BehaviorCoreProjectionHarness — Phase 0 contract harness for
 * BehaviorCoreProcessor + BehaviorCoreEditor splitting.
 *
 * Creates a real processor + editor, exports comprehensive state as JSON,
 * and supports --write-contract / --verify-contract for byte-identical
 * golden file comparison.
 *
 * Usage:
 *   BehaviorCoreProjectionHarness --write-contract golden.json
 *   BehaviorCoreProjectionHarness --verify-contract golden.json
 *   BehaviorCoreProjectionHarness --print-contract
 */

#include "../../manifold/core/BehaviorCoreProcessor.h"
#include "../../manifold/core/BehaviorCoreEditor.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <limits>
#include <sstream>
#include <string>
#include <juce_core/juce_core.h>

namespace {

struct HarnessOptions {
    enum Mode { Print, Write, Verify };
    Mode mode = Print;
    std::string contractPath;
};

void printUsage(const char* name) {
    std::fprintf(stderr,
        "Usage: %s [--print-contract | --write-contract PATH | --verify-contract PATH]\n"
        "  --print-contract       Print combined processor+editor contract to stdout\n"
        "  --write-contract PATH  Write combined contract JSON to PATH\n"
        "  --verify-contract PATH Verify current state matches golden file at PATH\n",
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

// Remove non-deterministic keys from a parsed JSON object (mutates in place).
// The deterministic contract compares structure and config. The separate sniff
// suite covers runtime/perf state. Here we strip only frame timings.
static void removeNonDeterministicKeys(juce::var& root) {
    if (!root.isObject())
        return;
    auto* obj = root.getDynamicObject();
    if (obj == nullptr)
        return;

    auto edVar = obj->getProperty("editor");
    if (auto* edObj = edVar.getDynamicObject()) {
        edObj->removeProperty("frameTimings");
    }
}

bool verifyContract(const std::string& rawCurrent, const std::string& goldenPath) {
    const auto rawGolden = readFile(goldenPath);

    // Parse both, strip non-deterministic keys, re-serialize with stable formatting
    auto goldenVar = juce::JSON::parse(rawGolden);
    auto currentVar = juce::JSON::parse(rawCurrent);

    if (goldenVar.isVoid() || currentVar.isVoid()) {
        std::fprintf(stderr, "FAIL: could not parse contract JSON\n");
        return false;
    }

    removeNonDeterministicKeys(goldenVar);
    removeNonDeterministicKeys(currentVar);

    const auto goldenStr = juce::JSON::toString(goldenVar).toStdString();
    const auto currentStr = juce::JSON::toString(currentVar).toStdString();

    if (goldenStr == currentStr) {
        std::fprintf(stdout, "OK: contract matches golden file (deterministic fields)\n");
        return true;
    }

    // Find first diff position
    const size_t minLen = std::min(currentStr.size(), goldenStr.size());
    size_t diffPos = 0;
    while (diffPos < minLen && currentStr[diffPos] == goldenStr[diffPos])
        ++diffPos;

    std::fprintf(stderr, "FAIL: contract MISMATCH with golden file\n");
    std::fprintf(stderr, "  golden: %zu bytes, current: %zu bytes\n",
                 goldenStr.size(), currentStr.size());
    std::fprintf(stderr, "  first diff at byte %zu\n", diffPos);

    const size_t contextStart = (diffPos > 80) ? diffPos - 80 : 0;
    const size_t contextLen = std::min<size_t>(160, goldenStr.size() - contextStart);
    std::fprintf(stderr, "\n  --- golden ---\n  %.*s\n",
                 static_cast<int>(contextLen), goldenStr.c_str() + contextStart);
    const size_t currentContextLen = std::min<size_t>(160, currentStr.size() - contextStart);
    std::fprintf(stderr, "  --- current ---\n  %.*s\n",
                 static_cast<int>(currentContextLen), currentStr.c_str() + contextStart);

    return false;
}

} // anonymous namespace // anonymous namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts))
        return 1;

    juce::ScopedJuceInitialiser_GUI juceInit;

    // --- Create processor ---
    BehaviorCoreProcessor processor;
    processor.getControlServer().start(&processor);
    processor.prepareToPlay(44100.0, 512);

    // Add one deterministic named DSP slot so the contract covers both the
    // legacy default slot and named-slot lifecycle/state.
    const auto primaryDspFile = processor.getPrimaryDspScriptFile();
    if (primaryDspFile.existsAsFile()) {
        if (!processor.loadDspScript(primaryDspFile, "contract_test_slot")) {
            std::fprintf(stderr, "FAIL: could not load named DSP slot contract_test_slot: %s\n",
                         processor.getDspScriptLastError().c_str());
            std::_Exit(2);
        }
    }

    // --- Create editor (loads empty_launcher.lua via Settings auto-detect) ---
    // The editor constructor loads the Lua UI and captures memory baselines.
    // We DON'T run timer ticks here because ImGuiDirectHost needs an OpenGL
    // context that doesn't exist in headless mode. The contract captures
    // initialization-time state only; the sniff suite covers runtime ticks.
    auto editor = std::make_unique<BehaviorCoreEditor>(processor);
    std::fprintf(stderr, "[Harness] Editor created OK\n");

    // --- Build combined contract ---
    juce::DynamicObject::Ptr root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    std::fprintf(stderr, "[Harness] Exporting processor contract...\n");
    const auto procJson = processor.exportStateContract();
    const auto procVar = juce::JSON::parse(procJson);
    if (procVar.isVoid()) {
        std::fprintf(stderr, "FAIL: could not parse processor contract JSON\n");
        std::_Exit(2);
    }
    root->setProperty("processor", procVar);
    std::fprintf(stderr, "[Harness] Processor contract OK (%zu bytes)\n", procJson.size());

    std::fprintf(stderr, "[Harness] Exporting editor contract...\n");
    const auto edJson = editor->exportStateContract();
    const auto edVar = juce::JSON::parse(edJson);
    if (edVar.isVoid()) {
        std::fprintf(stderr, "FAIL: could not parse editor contract JSON\n");
        std::_Exit(2);
    }
    root->setProperty("editor", edVar);
    std::fprintf(stderr, "[Harness] Editor contract OK (%zu bytes)\n", edJson.size());

    const auto combined = juce::JSON::toString(juce::var(root.get()), true).toStdString();

    // --- Mode dispatch ---
    switch (opts.mode) {
        case HarnessOptions::Write: {
            std::ofstream file(opts.contractPath);
            if (!file.is_open()) {
                std::fprintf(stderr, "ERROR: cannot write to %s\n", opts.contractPath.c_str());
                return 2;
            }
            file << combined;
            file.close();
            std::fprintf(stdout, "OK: wrote contract (%zu bytes) to %s\n",
                         combined.size(), opts.contractPath.c_str());
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit(0);
        }

        case HarnessOptions::Verify: {
            const bool ok = verifyContract(combined, opts.contractPath);
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit(ok ? 0 : 1);
        }
        case HarnessOptions::Print: {
            std::fprintf(stdout, "%s", combined.c_str());
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit(0);
        }
    }

    std::_Exit(0);
}
