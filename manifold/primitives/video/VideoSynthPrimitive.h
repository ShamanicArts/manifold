#pragma once

#include <string>
#include <unordered_map>
#include <vector>

namespace manifold::video {

struct VideoSynthParamSpec {
    std::string id;
    std::string name;
    std::string unit;
    float min = 0.0f;
    float max = 1.0f;
    float defaultValue = 0.0f;
    float step = 0.01f;
};

struct VideoSynthEffectSpec {
    std::string id;
    std::string name;
    std::string category;
    std::string description;
    std::vector<VideoSynthParamSpec> params;
};

class VideoSynthPrimitive {
public:
    static const std::vector<VideoSynthEffectSpec>& effects();
    static const VideoSynthEffectSpec* findEffect(const std::string& effectId);

    static std::unordered_map<std::string, float> defaultParams(const std::string& effectId);
    static std::unordered_map<std::string, float> sanitizeParams(
        const std::string& effectId,
        const std::unordered_map<std::string, float>& params);

    static std::string vertexShaderSource();
    static std::string fragmentShaderSource(const std::string& effectId);
};

} // namespace manifold::video
