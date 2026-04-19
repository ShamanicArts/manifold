#pragma once

#include <string>
#include <unordered_map>
#include <vector>

namespace manifold::shaders {

struct InputBinding {
    std::string uniformName;
    std::string sourceType;
    int textureUnit = 0;
};

struct PassDescriptor {
    std::string effectId = "none";
    std::unordered_map<std::string, float> params;
    int blendMode = 0;
    float opacity = 1.0f;
};

struct ShaderPipelineDescriptor {
    int version = 2;
    std::string kind = "shaderQuad";
    std::string shaderLanguage = "glsl";
    std::string fitMode = "contain";
    std::string vertexShaderId = "default";
    std::vector<InputBinding> inputs;
    std::vector<PassDescriptor> passes;
};

} // namespace manifold::shaders
