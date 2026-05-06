#include "../primitives/shaders/ShaderEffectRegistry.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <set>
#include <string>
#include <unordered_map>
#include <vector>

#include <juce_core/juce_core.h>

using manifold::shaders::EffectCategory;
using manifold::shaders::EffectSpec;
using manifold::shaders::PassDescriptor;
using manifold::shaders::ShaderEffectRegistry;
using manifold::shaders::ShaderPipelineDescriptor;

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
        std::fprintf(stdout, "OK: Shader registry contract matches golden file\n");
        return true;
    }

    const size_t minLen = std::min(goldenStr.size(), currentStr.size());
    size_t diffPos = 0;
    while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos]) {
        ++diffPos;
    }

    std::fprintf(stderr, "FAIL: Shader registry contract mismatch\n");
    std::fprintf(stderr, "  golden: %zu bytes, current: %zu bytes\n",
                 goldenStr.size(), currentStr.size());
    std::fprintf(stderr, "  first diff at byte %zu\n", diffPos);
    return false;
}

juce::var paramToVar(const manifold::shaders::ParamSpec& param) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("id", juce::String(param.id));
    obj->setProperty("name", juce::String(param.name));
    obj->setProperty("unit", juce::String(param.unit));
    obj->setProperty("min", static_cast<double>(param.min));
    obj->setProperty("max", static_cast<double>(param.max));
    obj->setProperty("defaultValue", static_cast<double>(param.defaultValue));
    obj->setProperty("step", static_cast<double>(param.step));
    return juce::var(obj);
}

juce::var effectToVar(const EffectSpec& effect) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("id", juce::String(effect.id));
    obj->setProperty("name", juce::String(effect.name));
    obj->setProperty("category", juce::String(effect.category));
    obj->setProperty("effectCategory",
                     juce::String(effect.effectCategory == EffectCategory::BlendOp ? "blendOp" : "effect"));
    obj->setProperty("description", juce::String(effect.description));
    obj->setProperty("paramCount", static_cast<int>(effect.params.size()));

    juce::Array<juce::var> params;
    for (const auto& param : effect.params) {
        params.add(paramToVar(param));
    }
    obj->setProperty("params", juce::var(params));
    return juce::var(obj);
}

bool contains(const std::string& haystack, const std::string& needle) {
    return haystack.find(needle) != std::string::npos;
}

juce::var sanitizeMapToVar(const std::unordered_map<std::string, float>& values) {
    std::vector<std::pair<std::string, float>> sorted(values.begin(), values.end());
    std::sort(sorted.begin(), sorted.end(),
              [](const auto& a, const auto& b) { return a.first < b.first; });

    juce::Array<juce::var> entries;
    for (const auto& [key, value] : sorted) {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("id", juce::String(key));
        obj->setProperty("value", static_cast<double>(value));
        entries.add(juce::var(obj));
    }
    return juce::var(entries);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    auto& registry = ShaderEffectRegistry::instance();
    registry.clearRuntimeEffects();

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // ======================================================================
    // Domain 1: Builtin inventory and metadata integrity
    // ======================================================================
    {
        auto effects = registry.listEffects();
        std::sort(effects.begin(), effects.end(),
                  [](const EffectSpec& a, const EffectSpec& b) { return a.id < b.id; });

        std::set<std::string> uniqueIds;
        int blendOpCount = 0;
        int effectCount = 0;
        int totalParams = 0;
        int emptyDescriptionCount = 0;
        int invalidRangeCount = 0;
        int emptyIdCount = 0;
        int emptyNameCount = 0;

        juce::Array<juce::var> effectsArray;
        for (const auto& effect : effects) {
            uniqueIds.insert(effect.id);
            totalParams += static_cast<int>(effect.params.size());
            if (effect.effectCategory == EffectCategory::BlendOp) {
                blendOpCount++;
            } else {
                effectCount++;
            }
            if (effect.description.empty()) {
                emptyDescriptionCount++;
            }
            if (effect.id.empty()) {
                emptyIdCount++;
            }
            if (effect.name.empty()) {
                emptyNameCount++;
            }
            for (const auto& param : effect.params) {
                if (param.max < param.min) {
                    invalidRangeCount++;
                }
            }
            effectsArray.add(effectToVar(effect));
        }

        auto* inventory = new juce::DynamicObject();
        inventory->setProperty("builtinCount", static_cast<int>(effects.size()));
        inventory->setProperty("uniqueIdCount", static_cast<int>(uniqueIds.size()));
        inventory->setProperty("effectCount", effectCount);
        inventory->setProperty("blendOpCount", blendOpCount);
        inventory->setProperty("totalParamCount", totalParams);
        inventory->setProperty("emptyDescriptionCount", emptyDescriptionCount);
        inventory->setProperty("invalidRangeCount", invalidRangeCount);
        inventory->setProperty("emptyIdCount", emptyIdCount);
        inventory->setProperty("emptyNameCount", emptyNameCount);
        inventory->setProperty("effects", juce::var(effectsArray));
        root->setProperty("builtinInventory", juce::var(inventory));
    }

    // ======================================================================
    // Domain 2: Lookup and shader source generation
    // ======================================================================
    {
        auto* lookup = new juce::DynamicObject();

        const auto* wave = registry.findEffect("wave");
        const auto* normal = registry.findEffect("normal");
        const auto* missing = registry.findEffect("does-not-exist");

        lookup->setProperty("waveFound", wave != nullptr);
        lookup->setProperty("normalBlendFound", normal != nullptr);
        lookup->setProperty("missingFound", missing != nullptr);
        if (wave != nullptr) {
            lookup->setProperty("waveParamCount", static_cast<int>(wave->params.size()));
        }
        if (normal != nullptr) {
            lookup->setProperty("normalEffectCategory",
                                juce::String(normal->effectCategory == EffectCategory::BlendOp ? "blendOp" : "effect"));
        }

        const auto vertex = registry.vertexShader();
        const auto waveFragment = registry.fragmentShaderFor("wave", true);
        const auto waveFragmentNoBlend = registry.fragmentShaderFor("wave", false);
        const auto normalBlendFragment = registry.fragmentShaderForBlendOp("normal");
        const auto missingFragment = registry.fragmentShaderFor("does-not-exist", true);

        lookup->setProperty("vertexHasPosition", contains(vertex, "gl_Position"));
        lookup->setProperty("vertexHasUv", contains(vertex, "vUv"));
        lookup->setProperty("waveFragmentHasVersion", contains(waveFragment, "#version 150"));
        lookup->setProperty("waveFragmentHasIntensityUniform", contains(waveFragment, "uniform float intensity;"));
        lookup->setProperty("waveFragmentHasBlendEpilogue", contains(waveFragment, "uBlendMode") && contains(waveFragment, "uOpacity"));
        lookup->setProperty("waveFragmentNoBlendHasBlendEpilogue", contains(waveFragmentNoBlend, "uBlendMode") && contains(waveFragmentNoBlend, "uOpacity"));
        lookup->setProperty("blendFragmentHasBaseTex", contains(normalBlendFragment, "uBaseTex"));
        lookup->setProperty("blendFragmentHasBlendTex", contains(normalBlendFragment, "uBlendTex"));
        lookup->setProperty("blendFragmentHasOpacity", contains(normalBlendFragment, "uOpacity"));
        lookup->setProperty("missingFragmentEmpty", missingFragment.empty());
        lookup->setProperty("waveFragmentLength", static_cast<int>(waveFragment.size()));
        lookup->setProperty("normalBlendFragmentLength", static_cast<int>(normalBlendFragment.size()));

        root->setProperty("lookupAndShaderGeneration", juce::var(lookup));
    }

    // ======================================================================
    // Domain 3: Parameter sanitization
    // ======================================================================
    {
        auto* sanitize = new juce::DynamicObject();

        const std::unordered_map<std::string, float> rawWaveParams{
            {"intensity", -1.0f},
            {"speed", 99.0f},
            {"param1", 0.25f},
            {"param2", 0.75f},
            {"ampScale", 0.5f},
            {"unknownParam", 123.0f},
        };
        auto sanitizedWave = registry.sanitizeParams("wave", rawWaveParams);
        sanitize->setProperty("wave", sanitizeMapToVar(sanitizedWave));
        sanitize->setProperty("waveCount", static_cast<int>(sanitizedWave.size()));

        const std::unordered_map<std::string, float> rawBlendParams{
            {"opacity", -0.5f},
            {"baseLevel", 5.0f},
            {"topLevel", 1.25f},
            {"topGamma", 0.1f},
            {"nonsense", 42.0f},
        };
        auto sanitizedBlend = registry.sanitizeParams("normal", rawBlendParams);
        sanitize->setProperty("normalBlend", sanitizeMapToVar(sanitizedBlend));
        sanitize->setProperty("normalBlendCount", static_cast<int>(sanitizedBlend.size()));

        const std::unordered_map<std::string, float> rawMissingParams{{"foo", 1.0f}};
        auto sanitizedMissing = registry.sanitizeParams("does-not-exist", rawMissingParams);
        sanitize->setProperty("missingCount", static_cast<int>(sanitizedMissing.size()));

        root->setProperty("sanitizeParams", juce::var(sanitize));
    }

    // ======================================================================
    // Domain 4: Pipeline descriptor validation
    // ======================================================================
    {
        auto* validation = new juce::DynamicObject();
        std::string error;

        ShaderPipelineDescriptor emptyPipeline;
        emptyPipeline.passes.clear();
        validation->setProperty("emptyValid", registry.validatePipelineDescriptor(emptyPipeline, &error));
        validation->setProperty("emptyError", juce::String(error));

        ShaderPipelineDescriptor unknownEffect;
        PassDescriptor unknownPass;
        unknownPass.effectId = "definitely-missing";
        unknownEffect.passes = { unknownPass };
        error.clear();
        validation->setProperty("unknownEffectValid", registry.validatePipelineDescriptor(unknownEffect, &error));
        validation->setProperty("unknownEffectError", juce::String(error));

        ShaderPipelineDescriptor validSingle;
        PassDescriptor validSinglePassDesc;
        validSinglePassDesc.effectId = "wave";
        validSingle.passes = { validSinglePassDesc };
        error.clear();
        validation->setProperty("validSinglePass", registry.validatePipelineDescriptor(validSingle, &error));
        validation->setProperty("validSingleError", juce::String(error));

        ShaderPipelineDescriptor validMulti;
        PassDescriptor passA;
        passA.effectId = "none";
        PassDescriptor passB;
        passB.effectId = "wave";
        passB.opacity = 0.7f;
        PassDescriptor passC;
        passC.effectId = "pixelate";
        passC.blendOpId = "normal";
        passC.opacity = 0.5f;
        validMulti.passes = { passA, passB, passC };
        error.clear();
        validation->setProperty("validMultiPass", registry.validatePipelineDescriptor(validMulti, &error));
        validation->setProperty("validMultiError", juce::String(error));

        root->setProperty("pipelineValidation", juce::var(validation));
    }

    // ======================================================================
    // Domain 5: Runtime effect reload / clear
    // ======================================================================
    {
        auto* runtime = new juce::DynamicObject();

        auto originalCwd = juce::File::getCurrentWorkingDirectory();
        auto tempRoot = juce::File::getSpecialLocation(juce::File::tempDirectory)
                            .getChildFile("manifold_shader_registry_contract");
        tempRoot.deleteRecursively();
        tempRoot.createDirectory();
        tempRoot.setAsCurrentWorkingDirectory();

        auto shadersDir = tempRoot.getChildFile("UserScripts").getChildFile("shaders");
        shadersDir.createDirectory();

        auto runtimeJson = shadersDir.getChildFile("runtime-test.json");
        auto runtimeGlsl = shadersDir.getChildFile("runtime-test.glsl");

        runtimeJson.replaceWithText(R"({
  "id": "runtime-test",
  "name": "Runtime Test",
  "category": "test",
  "description": "runtime loaded shader",
  "effectCategory": "effect",
  "params": [
    { "id": "uAmount", "name": "Amount", "min": 0.0, "max": 2.0, "default": 1.0, "step": 0.1 }
  ]
})");
        runtimeGlsl.replaceWithText(R"(
vec4 src = texture(uInputTex, vUv);
fragColor = vec4(src.rgb * uAmount, 1.0);
)");

        registry.clearRuntimeEffects();
        const auto beforeReload = static_cast<int>(registry.listEffects().size());
        registry.reloadRuntimeEffects();
        const auto afterReload = static_cast<int>(registry.listEffects().size());
        const auto* runtimeEffect = registry.findEffect("runtime-test");
        const auto runtimeFragment = registry.fragmentShaderFor("runtime-test", true);

        runtime->setProperty("beforeReloadCount", beforeReload);
        runtime->setProperty("afterReloadCount", afterReload);
        runtime->setProperty("runtimeFound", runtimeEffect != nullptr);
        runtime->setProperty("runtimeFragmentHasUniform", contains(runtimeFragment, "uniform float uAmount;"));
        runtime->setProperty("runtimeFragmentHasBody", contains(runtimeFragment, "src.rgb * uAmount"));
        if (runtimeEffect != nullptr) {
            runtime->setProperty("runtimeEffect", effectToVar(*runtimeEffect));
        }

        registry.clearRuntimeEffects();
        runtime->setProperty("afterClearFound", registry.findEffect("runtime-test") != nullptr);
        runtime->setProperty("afterClearCount", static_cast<int>(registry.listEffects().size()));

        originalCwd.setAsCurrentWorkingDirectory();
        tempRoot.deleteRecursively();

        root->setProperty("runtimeEffects", juce::var(runtime));
    }

    // ======================================================================
    // Domain 6: Direct manifest loading failure cases
    // ======================================================================
    {
        auto* failures = new juce::DynamicObject();

        auto tempRoot = juce::File::getSpecialLocation(juce::File::tempDirectory)
                            .getChildFile("manifold_shader_registry_failures");
        tempRoot.deleteRecursively();
        tempRoot.createDirectory();

        auto validGlsl = tempRoot.getChildFile("valid.glsl");
        validGlsl.replaceWithText("fragColor = vec4(1.0);\n");

        auto invalidJson = tempRoot.getChildFile("invalid.json");
        invalidJson.replaceWithText("{ this is not valid json ");

        auto missingManifestPath = tempRoot.getChildFile("missing.json").getFullPathName().toStdString();
        auto missingGlslPath = tempRoot.getChildFile("missing.glsl").getFullPathName().toStdString();
        auto invalidJsonPath = invalidJson.getFullPathName().toStdString();
        auto validGlslPath = validGlsl.getFullPathName().toStdString();

        failures->setProperty("missingManifest",
                              registry.loadEffectFromManifest(missingManifestPath, validGlslPath, false));
        failures->setProperty("missingGlsl",
                              registry.loadEffectFromManifest(invalidJsonPath, missingGlslPath, false));
        failures->setProperty("invalidJson",
                              registry.loadEffectFromManifest(invalidJsonPath, validGlslPath, false));

        tempRoot.deleteRecursively();
        root->setProperty("loadFailures", juce::var(failures));
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
            std::fprintf(stdout, "OK: wrote Shader registry contract (%zu bytes) to %s\n",
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
