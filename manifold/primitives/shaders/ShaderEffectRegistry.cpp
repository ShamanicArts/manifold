#include "ShaderEffectRegistry.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <unordered_map>
#include <utility>

namespace manifold::shaders {
namespace {

const char* kBlendEpilogue = R"(
    vec4 __effected = fragColor;
    vec4 __prev = texture(uPrevTex, vUv);
    vec3 __blended;
    if (uBlendMode == 1) {
        __blended = __prev.rgb + __effected.rgb;
    } else if (uBlendMode == 2) {
        __blended = __prev.rgb * __effected.rgb;
    } else if (uBlendMode == 3) {
        __blended = 1.0 - (1.0 - __prev.rgb) * (1.0 - __effected.rgb);
    } else if (uBlendMode == 4) {
        __blended = abs(__prev.rgb - __effected.rgb);
    } else {
        __blended = __effected.rgb;
    }
    fragColor = vec4(mix(__prev.rgb, __blended, clamp(uOpacity, 0.0, 1.0)), 1.0);
)";

std::string fragmentPreambleFor(const ShaderDefinition& definition, bool includeBlendEpilogue) {
    std::string source = R"(#version 150
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uInputTex;
uniform sampler2D uPrevTex;
uniform sampler2D uFeedbackTex;
uniform float uTime;
uniform vec2 uResolution;
uniform int uBlendMode;
uniform float uOpacity;
)";

    for (const auto& param : definition.spec.params) {
        source += "uniform float " + param.id + ";\n";
    }

    if (!definition.fragmentPreamble.empty()) {
        source += definition.fragmentPreamble;
    }

    source += "\nvoid main() {\n";
    source += definition.fragmentBody;
    if (includeBlendEpilogue) {
        source += kBlendEpilogue;
    }
    source += "\n}\n";
    return source;
}

} // namespace

ShaderEffectRegistry& ShaderEffectRegistry::instance() {
    static ShaderEffectRegistry registry;
    registry.registerBuiltinEffects();
    return registry;
}

void ShaderEffectRegistry::registerBuiltinEffects() {
    if (!builtinDefinitions_.empty()) {
        return;
    }

    juce::File shadersDir{juce::File::getCurrentWorkingDirectory().getChildFile("manifold/shaders")};
    if (!shadersDir.isDirectory()) {
        return;
    }

    auto jsonFiles = shadersDir.findChildFiles(juce::File::findFiles, false, "*.json");
    for (const auto& jsonFile : jsonFiles) {
        auto glslFile = jsonFile.withFileExtension("glsl");
        if (glslFile.existsAsFile()) {
            loadEffectFromManifest(jsonFile.getFullPathName().toStdString(),
                                   glslFile.getFullPathName().toStdString(),
                                   true /* builtin */);
        }
    }
}

bool ShaderEffectRegistry::loadEffectFromManifest(const std::string& manifestPath,
                                                  const std::string& fragmentPath,
                                                  bool builtin) {
    juce::File manifestFile{juce::String(manifestPath)};
    if (!manifestFile.existsAsFile()) {
        return false;
    }

    juce::File fragmentFile{juce::String(fragmentPath)};
    if (!fragmentFile.existsAsFile()) {
        return false;
    }

    auto json = juce::JSON::parse(manifestFile);
    if (json.isVoid()) {
        return false;
    }

    ShaderDefinition def;
    def.spec.id = json.getProperty("id", juce::var()).toString().toStdString();
    def.spec.name = json.getProperty("name", juce::var()).toString().toStdString();
    def.spec.category = json.getProperty("category", juce::var()).toString().toStdString();
    def.spec.description = json.getProperty("description", juce::var()).toString().toStdString();

    auto paramsVar = json.getProperty("params", juce::var());
    if (paramsVar.isArray()) {
        auto* paramsArray = paramsVar.getArray();
        for (const auto& paramVar : *paramsArray) {
            ParamSpec param;
            param.id = paramVar.getProperty("id", juce::var()).toString().toStdString();
            param.name = paramVar.getProperty("name", juce::var()).toString().toStdString();
            param.unit = paramVar.getProperty("unit", juce::var()).toString().toStdString();
            param.min = static_cast<float>(paramVar.getProperty("min", juce::var(0.0)));
            param.max = static_cast<float>(paramVar.getProperty("max", juce::var(1.0)));
            param.defaultValue = static_cast<float>(paramVar.getProperty("default", juce::var(0.5)));
            param.step = static_cast<float>(paramVar.getProperty("step", juce::var(0.01)));
            def.spec.params.push_back(std::move(param));
        }
    }

    def.fragmentPreamble = json.getProperty("preamble", juce::var()).toString().toStdString();
    def.fragmentBody = fragmentFile.loadFileAsString().toStdString();

    auto& targetList = builtin ? builtinDefinitions_ : runtimeDefinitions_;
    auto it = std::find_if(targetList.begin(), targetList.end(),
        [&](const auto& d) { return d.spec.id == def.spec.id; });
    if (it != targetList.end()) {
        *it = std::move(def);
    } else {
        targetList.push_back(std::move(def));
    }

    return true;
}

void ShaderEffectRegistry::reloadRuntimeEffects() {
    clearRuntimeEffects();

    juce::File shadersDir{juce::File::getCurrentWorkingDirectory().getChildFile("UserScripts/shaders")};
    if (!shadersDir.isDirectory()) {
        return;
    }

    auto jsonFiles = shadersDir.findChildFiles(juce::File::findFiles, false, "*.json");
    for (const auto& jsonFile : jsonFiles) {
        auto glslFile = jsonFile.withFileExtension("glsl");
        if (glslFile.existsAsFile()) {
            loadEffectFromManifest(jsonFile.getFullPathName().toStdString(),
                                   glslFile.getFullPathName().toStdString(),
                                   false /* runtime */);
        }
    }
}

void ShaderEffectRegistry::clearRuntimeEffects() {
    runtimeDefinitions_.clear();
}

std::vector<EffectSpec> ShaderEffectRegistry::listEffects() const {
    std::vector<EffectSpec> specs;
    specs.reserve(builtinDefinitions_.size() + runtimeDefinitions_.size());
    for (const auto& definition : builtinDefinitions_) {
        specs.push_back(definition.spec);
    }
    for (const auto& definition : runtimeDefinitions_) {
        specs.push_back(definition.spec);
    }
    return specs;
}

const EffectSpec* ShaderEffectRegistry::findEffect(const std::string& effectId) const {
    auto it = std::find_if(builtinDefinitions_.begin(), builtinDefinitions_.end(),
        [&](const auto& def) { return def.spec.id == effectId; });
    if (it != builtinDefinitions_.end()) {
        return &it->spec;
    }
    it = std::find_if(runtimeDefinitions_.begin(), runtimeDefinitions_.end(),
        [&](const auto& def) { return def.spec.id == effectId; });
    if (it != runtimeDefinitions_.end()) {
        return &it->spec;
    }
    return nullptr;
}

const ShaderDefinition* ShaderEffectRegistry::findDefinition(const std::string& effectId) const {
    auto it = std::find_if(builtinDefinitions_.begin(), builtinDefinitions_.end(),
        [&](const auto& def) { return def.spec.id == effectId; });
    if (it != builtinDefinitions_.end()) {
        return &(*it);
    }
    it = std::find_if(runtimeDefinitions_.begin(), runtimeDefinitions_.end(),
        [&](const auto& def) { return def.spec.id == effectId; });
    if (it != runtimeDefinitions_.end()) {
        return &(*it);
    }
    return nullptr;
}

std::unordered_map<std::string, float> ShaderEffectRegistry::sanitizeParams(
    const std::string& effectId,
    const std::unordered_map<std::string, float>& params) const {
    std::unordered_map<std::string, float> values;
    const auto* effect = findEffect(effectId);
    if (effect == nullptr) {
        return values;
    }

    for (const auto& param : effect->params) {
        values[param.id] = param.defaultValue;
    }

    for (const auto& param : effect->params) {
        const auto found = params.find(param.id);
        if (found == params.end()) {
            continue;
        }
        values[param.id] = std::clamp(found->second, param.min, param.max);
    }

    return values;
}

std::string ShaderEffectRegistry::vertexShader() const {
    return R"(#version 150
in vec2 aPos;
in vec2 aUv;
out vec2 vUv;
void main() {
    vUv = aUv;
    gl_Position = vec4(aPos, 0.0, 1.0);
}
)";
}

std::string ShaderEffectRegistry::fragmentShaderFor(const std::string& effectId, bool includeBlendEpilogue) const {
    const auto id = effectId.empty() ? std::string("none") : effectId;
    const auto* definition = findDefinition(id);
    if (definition != nullptr) {
        return fragmentPreambleFor(*definition, includeBlendEpilogue);
    }
    return std::string{};
}

bool ShaderEffectRegistry::validatePipelineDescriptor(const ShaderPipelineDescriptor& descriptor,
                                                     std::string* errorMessage) const {
    if (descriptor.passes.empty()) {
        if (errorMessage != nullptr) {
            *errorMessage = "shader pipeline must contain at least one pass";
        }
        return false;
    }

    for (std::size_t i = 0; i < descriptor.passes.size(); ++i) {
        const auto& pass = descriptor.passes[i];
        if (findEffect(pass.effectId) == nullptr) {
            if (errorMessage != nullptr) {
                *errorMessage = "shader pipeline references unknown effect at pass "
                              + std::to_string(i)
                              + ": " + pass.effectId;
            }
            return false;
        }
    }

    if (errorMessage != nullptr) {
        errorMessage->clear();
    }
    return true;
}

} // namespace manifold::shaders
