#pragma once

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>

#include <juce_core/juce_core.h>

namespace contract_harness_utils {

struct HarnessOptions {
    enum Mode { Print, Write, Verify } mode = Print;
    std::string contractPath;
};

inline void printUsage(const char* name) {
    std::fprintf(stderr,
                 "Usage: %s [--print-contract | --write-contract PATH | --verify-contract PATH]\n",
                 name);
}

inline bool parseOptions(int argc, char* argv[], HarnessOptions& out) {
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

inline std::string readFile(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        std::fprintf(stderr, "ERROR: cannot read file: %s\n", path.c_str());
        std::exit(2);
    }
    return std::string((std::istreambuf_iterator<char>(file)),
                       std::istreambuf_iterator<char>());
}

inline bool verifyJsonContract(const std::string& contractName,
                               const std::string& rawCurrent,
                               const std::string& goldenPath) {
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
        std::fprintf(stdout, "OK: %s matches golden file\n", contractName.c_str());
        return true;
    }

    const size_t minLen = std::min(goldenStr.size(), currentStr.size());
    size_t diffPos = 0;
    while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos]) {
        ++diffPos;
    }

    std::fprintf(stderr, "FAIL: %s mismatch\n", contractName.c_str());
    std::fprintf(stderr, "  golden: %zu bytes, current: %zu bytes\n",
                 goldenStr.size(), currentStr.size());
    std::fprintf(stderr, "  first diff at byte %zu\n", diffPos);
    return false;
}

inline int finishJsonContract(const HarnessOptions& opts,
                              const std::string& contractName,
                              const std::string& rawContract) {
    switch (opts.mode) {
        case HarnessOptions::Write: {
            std::ofstream file(opts.contractPath);
            if (!file.is_open()) {
                std::fprintf(stderr, "ERROR: cannot write to %s\n", opts.contractPath.c_str());
                return 2;
            }
            file << rawContract;
            std::fprintf(stdout,
                         "OK: wrote %s (%zu bytes) to %s\n",
                         contractName.c_str(),
                         rawContract.size(),
                         opts.contractPath.c_str());
            return 0;
        }
        case HarnessOptions::Verify:
            return verifyJsonContract(contractName, rawContract, opts.contractPath) ? 0 : 3;
        case HarnessOptions::Print:
        default:
            std::fprintf(stdout, "%s\n", rawContract.c_str());
            return 0;
    }
}

} // namespace contract_harness_utils
