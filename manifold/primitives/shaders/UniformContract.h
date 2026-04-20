#pragma once

#include <string>

namespace manifold::shaders {

struct UniformContract {
    static constexpr const char* kInputTex = "uInputTex";
    static constexpr const char* kPrevTex = "uPrevTex";
    static constexpr const char* kFeedbackTex = "uFeedbackTex";
    static constexpr const char* kBaseTex = "uBaseTex";
    static constexpr const char* kBlendTex = "uBlendTex";
    static constexpr const char* kTime = "uTime";
    static constexpr const char* kResolution = "uResolution";
    static constexpr const char* kAspect = "uAspect";
    static constexpr const char* kBlendMode = "uBlendMode";
    static constexpr const char* kOpacity = "uOpacity";
};

} // namespace manifold::shaders
