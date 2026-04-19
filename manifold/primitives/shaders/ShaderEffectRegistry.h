#pragma once

#include "ShaderPipelineDescriptor.h"

#include <string>
#include <unordered_map>
#include <vector>

namespace manifold::shaders {

struct ParamSpec {
    std::string id;
    std::string name;
    std::string unit;
    float min = 0.0f;
    float max = 1.0f;
    float defaultValue = 0.0f;
    float step = 0.01f;
};

struct EffectSpec {
    std::string id;
    std::string name;
    std::string category;
    std::string description;
    std::vector<ParamSpec> params;
};

struct ShaderDefinition {
    EffectSpec spec;
    std::string fragmentPreamble;
    std::string fragmentBody;
};

class ShaderEffectRegistry {
public:
    static ShaderEffectRegistry& instance();

    void registerBuiltinEffects();
    bool loadEffectFromManifest(const std::string& manifestPath,
                                const std::string& fragmentPath,
                                bool builtin = false);

    // Load all .json manifests from a directory, pairing each with a .glsl file
    void reloadRuntimeEffects();
    void clearRuntimeEffects();

    std::vector<EffectSpec> listEffects() const;
    const EffectSpec* findEffect(const std::string& effectId) const;

    std::string vertexShader() const;
    std::string fragmentShaderFor(const std::string& effectId, bool includeBlendEpilogue = true) const;
    std::unordered_map<std::string, float> sanitizeParams(
        const std::string& effectId,
        const std::unordered_map<std::string, float>& params) const;
    bool validatePipelineDescriptor(const ShaderPipelineDescriptor& descriptor,
                                   std::string* errorMessage = nullptr) const;

private:
    ShaderEffectRegistry() = default;
    ~ShaderEffectRegistry() = default;

    const ShaderDefinition* findDefinition(const std::string& effectId) const;

    std::vector<ShaderDefinition> builtinDefinitions_;
    std::vector<ShaderDefinition> runtimeDefinitions_;
};

} // namespace manifold::shaders