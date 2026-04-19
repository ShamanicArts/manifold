#include "VideoSynthPrimitive.h"

#include <algorithm>
#include <unordered_map>
#include <utility>

namespace manifold::video {
namespace {

struct VideoSynthShaderDefinition {
    VideoSynthEffectSpec spec;
    std::string fragmentPreamble;
    std::string fragmentBody;
};

VideoSynthParamSpec makeParam(const char* id,
                             const char* name,
                             const char* unit,
                             float min,
                             float max,
                             float defaultValue,
                             float step) {
    VideoSynthParamSpec param;
    param.id = id;
    param.name = name;
    param.unit = unit;
    param.min = min;
    param.max = max;
    param.defaultValue = defaultValue;
    param.step = step;
    return param;
}

VideoSynthEffectSpec makeEffect(const char* id,
                                const char* name,
                                const char* category,
                                const char* description,
                                std::vector<VideoSynthParamSpec> params) {
    VideoSynthEffectSpec effect;
    effect.id = id;
    effect.name = name;
    effect.category = category;
    effect.description = description;
    effect.params = std::move(params);
    return effect;
}

// Common helpers injected before main() for shaders that need them.
const char* kRandPreamble = R"(
float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}
)";

std::vector<VideoSynthParamSpec> standardParams(float intensityDefault,
                                                const char* p1Name,
                                                float p1Default,
                                                const char* p2Name,
                                                float p2Default,
                                                float speedDefault = 1.0f) {
    return {
        makeParam("intensity", "Intensity", "", 0.0f, 1.0f, intensityDefault, 0.01f),
        makeParam("speed", "Speed", "", 0.0f, 3.0f, speedDefault, 0.05f),
        makeParam("param1", p1Name, "", 0.0f, 1.0f, p1Default, 0.01f),
        makeParam("param2", p2Name, "", 0.0f, 1.0f, p2Default, 0.01f),
    };
}

const std::vector<VideoSynthShaderDefinition>& shaderDefinitions() {
    static const std::vector<VideoSynthShaderDefinition> definitions = {
        {
            makeEffect("none", "Passthrough", "utility",
                       "Dry webcam feed with no processing", {}),
            "",
            R"(
    fragColor = texture(uInputTex, vUv);
)"
        },
        {
            makeEffect("chromatic", "Chromatic", "color",
                       "Chromatic aberration with animated edge separation",
                       standardParams(0.5f, "Aberration", 0.5f, "Pulse", 0.5f, 1.0f)),
            "",
            R"(
    vec2 center = vec2(0.5);
    vec2 dir = vUv - center;
    float dist = length(dir);

    float baseAberr = param1 * 0.05;
    float pulse = 1.0 + param2 * sin(uTime * speed);
    float aberration = intensity * baseAberr * pulse;
    aberration *= (0.5 + dist);

    float r = texture(uInputTex, vUv + dir * aberration).r;
    float g = texture(uInputTex, vUv).g;
    float b = texture(uInputTex, vUv - dir * aberration).b;

    fragColor = vec4(r, g, b, 1.0);
)"
        },
        {
            makeEffect("glitch", "Glitch", "glitch",
                       "Block-shift glitch with scanline tears and RGB split",
                       standardParams(0.5f, "Blocks", 0.5f, "Frequency", 0.5f, 1.0f)),
            kRandPreamble,
            R"(
    vec2 uv = vUv;
    float t = uTime * speed;
    float blocks = mix(5.0, 30.0, param1);
    float freq = mix(5.0, 30.0, param2);
    float glitchIntensity = intensity;

    float blockY = floor(vUv.y * blocks) / blocks;
    float glitchTrigger = step(0.95, rand(vec2(blockY, floor(t * freq))));
    if (glitchTrigger > 0.5) {
        uv.x += (rand(vec2(blockY, t)) - 0.5) * glitchIntensity * 0.3;
    }

    float scanGlitch = sin(vUv.y * 200.0 + t * 5.0) * glitchIntensity * 0.01;
    uv.x += scanGlitch * step(0.97, rand(vec2(floor(t * 20.0), vUv.y)));

    vec4 color = texture(uInputTex, uv);
    if (glitchTrigger > 0.5) {
        color.rgb = vec3(
            texture(uInputTex, uv + vec2(0.02 * glitchIntensity, 0.0)).r,
            color.g,
            texture(uInputTex, uv - vec2(0.02 * glitchIntensity, 0.0)).b
        );
    }
    fragColor = color;
)"
        },
        {
            makeEffect("vhs", "VHS", "glitch",
                       "VHS-style tearing, wobble, noise and chroma bleed",
                       standardParams(0.5f, "Noise", 0.5f, "Bleed", 0.5f, 1.0f)),
            kRandPreamble,
            R"(
    vec2 uv = vUv;
    float t = uTime * speed;

    float tearLine = step(0.96, rand(vec2(floor(vUv.y * 50.0), floor(t * 3.0))));
    if (tearLine > 0.5) {
        uv.x += sin(t * 30.0) * intensity * 0.05;
    }
    uv.y += sin(uv.x * 40.0 + t * 2.0) * intensity * 0.005;

    float noise = rand(uv + vec2(t)) * intensity * param1;

    float bleed = sin(uv.y * 100.0 + t) * intensity * 0.02 * param2;
    vec4 color = texture(uInputTex, uv);
    color.r = texture(uInputTex, uv + vec2(bleed, 0.0)).r;
    color.b = texture(uInputTex, uv - vec2(bleed, 0.0)).b;

    color.rgb += vec3(noise);
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(luma), color.rgb, 0.85);
    color.rgb = (color.rgb - 0.5) * 1.1 + 0.5;
    fragColor = color;
)"
        },
        {
            makeEffect("psychedelic", "Psychedelic", "color",
                       "Spiral warp with cycling hue rotation",
                       standardParams(0.5f, "Warp", 0.5f, "Color Shift", 0.5f, 1.0f)),
            "",
            R"(
    vec2 uv = vUv;
    float t = uTime * speed;

    vec2 center = vec2(0.5);
    vec2 delta = uv - center;
    float dist = length(delta);
    float angle = atan(delta.y, delta.x);

    float warpAmount = param1 * intensity * 0.35;
    angle += sin(dist * 8.0 - t * 2.0) * warpAmount * 0.5;
    dist += sin(angle * 4.0 + t) * warpAmount * 0.05;

    uv = center + vec2(cos(angle), sin(angle)) * dist;
    uv = clamp(uv, vec2(0.0), vec2(1.0));

    vec4 color = texture(uInputTex, uv);

    float hueShift = t * param2 * 0.5 + dist * 2.0;
    float eff = intensity * 0.5;
    float c = cos(hueShift * eff);
    float s = sin(hueShift * eff);
    color.rgb = vec3(
        color.r * c - color.g * s * 0.5,
        color.r * s * 0.5 + color.g * c,
        color.b + sin(t + dist * 10.0) * eff * 0.3
    );
    color.rgb = clamp(color.rgb, 0.0, 1.0);

    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(luma), color.rgb, 1.0 + eff * 0.4);
    fragColor = color;
)"
        },
        {
            makeEffect("ripple", "Ripple", "distortion",
                       "Concentric ripples radiating from center",
                       standardParams(0.5f, "Frequency", 0.5f, "Waves", 0.5f, 1.0f)),
            "",
            R"(
    vec2 uv = vUv;
    float t = uTime * speed;

    vec2 center = vec2(0.5);
    vec2 delta = uv - center;
    float dist = length(delta);

    float freq = mix(20.0, 60.0, param1);
    float waves = mix(2.0, 5.0, param2);

    float wave = 0.0;
    for (float i = 1.0; i <= 8.0; i++) {
        if (i > waves) break;
        wave += sin(dist * freq * i - t * 4.0 * i) * intensity * 0.02 / i;
    }

    uv += delta * wave;
    uv = clamp(uv, vec2(0.0), vec2(1.0));
    fragColor = texture(uInputTex, uv);
)"
        },
        {
            makeEffect("pixelate", "Pixelate", "color",
                       "Block pixelation with subtle animation",
                       standardParams(1.0f, "Size", 0.5f, "Animate", 0.5f, 1.0f)),
            "",
            R"(
    float t = uTime * speed;
    float pixelSize = mix(0.0001, 0.01, param1);
    pixelSize += sin(t) * 0.00005 * param2;
    pixelSize = clamp(pixelSize, 0.0001, 0.02);

    vec2 uv = floor(vUv / pixelSize) * pixelSize + pixelSize * 0.5;
    vec4 base = texture(uInputTex, vUv);
    vec4 pix = texture(uInputTex, uv);
    fragColor = mix(base, pix, intensity);
)"
        },
        {
            makeEffect("rgb-split", "RGB Split", "color",
                       "Directional RGB channel separation",
                       standardParams(0.5f, "Distance", 0.5f, "Rotation", 0.5f, 1.0f)),
            "",
            R"(
    float t = uTime * speed;
    vec2 uv = vUv;

    float angle = t * param2;
    vec2 dir = vec2(cos(angle), sin(angle));

    float split = intensity * 0.06 * param1;
    split += sin(t * 3.0) * 0.01;

    float r = texture(uInputTex, uv + dir * split).r;
    float g = texture(uInputTex, uv).g;
    float b = texture(uInputTex, uv - dir * split).b;

    vec4 color = vec4(r, g, b, 1.0);
    color.rgb = (color.rgb - 0.5) * 1.2 + 0.5;
    fragColor = color;
)"
        },
        {
            makeEffect("wave", "Wave", "distortion",
                       "Layered sine waves distort the image",
                       standardParams(0.5f, "Amplitude", 0.5f, "Frequency", 0.5f, 1.0f)),
            "",
            R"(
    vec2 uv = vUv;
    float t = uTime * speed;

    float amp = intensity * param1 * 0.03;
    float freq = 15.0 + param2 * 20.0;

    uv.x += sin(uv.y * freq + t * 3.0) * amp;
    uv.y += cos(uv.x * freq * 0.8 + t * 2.0) * amp * 0.7;
    uv.x += sin(uv.y * freq * 2.0 + t * 5.0) * amp * 0.5;
    uv.y += cos(uv.x * freq * 1.5 + t * 4.0) * amp * 0.4;

    uv = clamp(uv, vec2(0.0), vec2(1.0));
    fragColor = texture(uInputTex, uv);
)"
        },
        {
            makeEffect("posterize", "Posterize", "color",
                       "Reduce color levels with animated shift",
                       standardParams(0.5f, "Levels", 0.5f, "Color Shift", 0.5f, 1.0f)),
            "",
            R"(
    float t = uTime * speed;
    vec4 color = texture(uInputTex, vUv);

    float levels = mix(16.0, 2.0, intensity * param1);
    levels = max(2.0, levels + sin(t) * 2.0);
    color.rgb = floor(color.rgb * levels) / levels;

    color.r += sin(t + vUv.x * 10.0) * intensity * param2 * 0.1;
    color.b += cos(t + vUv.y * 10.0) * intensity * param2 * 0.1;
    fragColor = color;
)"
        },
        {
            makeEffect("trail", "Trail", "feedback",
                       "Motion-blur style trails via time-offset sampling",
                       standardParams(0.5f, "Length", 0.5f, "Fade", 0.5f, 1.0f)),
            "",
            R"(
    float t = uTime * speed;
    vec4 color = vec4(0.0);

    float trailLength = 1.0 + intensity * param1 * 10.0;
    float fade = 1.0 - param2 * 0.5;

    for (float i = 0.0; i < 16.0; i++) {
        if (i >= trailLength) break;

        float offset = i * 0.003 * intensity;
        vec2 sampleUv = vUv;
        sampleUv.x += sin(t * 2.0 + i * 0.5) * offset;
        sampleUv.y += cos(t * 1.5 + i * 0.3) * offset;

        float weight = pow(fade, i);
        color += texture(uInputTex, clamp(sampleUv, vec2(0.0), vec2(1.0))) * weight;
    }
    color /= trailLength * 0.5;
    color.a = 1.0;
    fragColor = color;
)"
        },
        {
            makeEffect("trail-dissolve", "Trail Dissolve", "feedback",
                       "Dissolving particle trail over the live image",
                       standardParams(0.5f, "Length", 0.5f, "Feedback", 0.5f, 1.0f)),
            "",
            R"(
    float t = uTime * speed;
    vec4 original = texture(uInputTex, vUv);

    vec3 trailAccum = vec3(0.0);
    float totalWeight = 0.0;
    float samples = 4.0 + param1 * 10.0;
    float fade = 0.85;

    for (float i = 0.0; i < 16.0; i++) {
        if (i >= samples) break;

        float offset = i * 0.004 * intensity;
        vec2 sampleUv = vUv;
        sampleUv.x += sin(t * 2.0 + i * 0.5) * offset;
        sampleUv.y += cos(t * 1.5 + i * 0.3) * offset;

        vec4 texColor = texture(uInputTex, clamp(sampleUv, vec2(0.0), vec2(1.0)));
        float noise = fract(sin(dot(sampleUv * 30.0 + vec2(t + i * 0.1), vec2(12.9898, 78.233))) * 43758.5453);
        float dissolve = 0.3 + 0.7 * step(0.3, noise + param2 * 0.5);

        float weight = pow(fade, i) * dissolve;
        trailAccum += texColor.rgb * weight;
        totalWeight += weight;
    }

    trailAccum = mix(original.rgb, trailAccum / max(totalWeight, 0.1), 0.7);

    float curNoise = fract(sin(dot(vUv * 30.0 + vec2(t), vec2(12.9898, 78.233))) * 43758.5453);
    float curDissolve = 0.2 + 0.8 * step(0.3, curNoise + param2 * 0.5);
    float trailIntensity = min(curDissolve * intensity, 0.7);

    fragColor = vec4(mix(original.rgb, trailAccum, trailIntensity), 1.0);
)"
        },
        {
            makeEffect("edge-glow", "Edge Glow", "color",
                       "Sobel edge detection with cycling neon color",
                       standardParams(0.5f, "Sensitivity", 0.5f, "Color Speed", 0.5f, 1.0f)),
            "",
            R"(
    float t = uTime * speed;
    vec2 texel = vec2(0.001 * (1.0 + param1));

    float tl = dot(texture(uInputTex, vUv + vec2(-texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tc = dot(texture(uInputTex, vUv + vec2(0.0, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(uInputTex, vUv + vec2(texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture(uInputTex, vUv + vec2(-texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture(uInputTex, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(uInputTex, vUv + vec2(-texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float bc = dot(texture(uInputTex, vUv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(uInputTex, vUv + vec2(texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));

    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
    float edge = sqrt(gx*gx + gy*gy);

    vec3 edgeColor = vec3(
        0.5 + 0.5 * sin(t * param2 + edge * 10.0),
        0.5 + 0.5 * sin(t * param2 * 1.3 + edge * 10.0 + 2.0),
        0.5 + 0.5 * sin(t * param2 * 0.7 + edge * 10.0 + 4.0)
    );

    vec4 original = texture(uInputTex, vUv);
    float edgeMask = smoothstep(0.1, 0.5, edge * intensity);
    vec3 color = mix(original.rgb, edgeColor, edgeMask * 0.8);
    fragColor = vec4(color, 1.0);
)"
        },
        {
            makeEffect("edge-trails", "Edge Trails", "feedback",
                       "Persistent edge smears with cycling color",
                       standardParams(0.5f, "Decay", 0.5f, "Color Shift", 0.5f, 1.0f)),
            "",
            R"(
    float t = uTime * speed;
    vec4 original = texture(uInputTex, vUv);

    vec3 trailAccum = vec3(0.0);
    float totalWeight = 0.0;
    float samples = 4.0 + param1 * 6.0;
    float fade = 0.85;
    vec2 texel = vec2(0.002);

    for (float i = 0.0; i < 8.0; i++) {
        if (i >= samples) break;

        vec2 offset = vec2(
            sin(t * 0.5 + i * 0.4) * 0.005 * i,
            cos(t * 0.4 + i * 0.3) * 0.005 * i
        );
        vec2 sampleUv = clamp(vUv + offset, vec2(0.0), vec2(1.0));

        float stl = dot(texture(uInputTex, sampleUv + vec2(-texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
        float stc = dot(texture(uInputTex, sampleUv + vec2(0.0, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
        float str = dot(texture(uInputTex, sampleUv + vec2(texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
        float sml = dot(texture(uInputTex, sampleUv + vec2(-texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float smr = dot(texture(uInputTex, sampleUv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float sbl = dot(texture(uInputTex, sampleUv + vec2(-texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
        float sbc = dot(texture(uInputTex, sampleUv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
        float sbr = dot(texture(uInputTex, sampleUv + vec2(texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));

        float sgx = -stl - 2.0*sml - sbl + str + 2.0*smr + sbr;
        float sgy = -stl - 2.0*stc - str + sbl + 2.0*sbc + sbr;
        float sEdge = sqrt(sgx*sgx + sgy*sgy);

        vec3 col = vec3(
            0.5 + 0.5 * sin(t * param2 + sEdge * 10.0),
            0.5 + 0.5 * sin(t * param2 * 1.3 + sEdge * 10.0 + 2.0),
            0.5 + 0.5 * sin(t * param2 * 0.7 + sEdge * 10.0 + 4.0)
        );

        float weight = pow(fade, i) * sEdge;
        trailAccum += col * weight;
        totalWeight += weight;
    }
    if (totalWeight > 0.0) trailAccum /= totalWeight;

    float tl = dot(texture(uInputTex, vUv + vec2(-texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tc = dot(texture(uInputTex, vUv + vec2(0.0, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(uInputTex, vUv + vec2(texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture(uInputTex, vUv + vec2(-texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture(uInputTex, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(uInputTex, vUv + vec2(-texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float bc = dot(texture(uInputTex, vUv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(uInputTex, vUv + vec2(texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));

    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
    float edge = sqrt(gx*gx + gy*gy);

    float trailIntensity = min(edge * intensity * 2.0, 0.8);
    fragColor = vec4(mix(original.rgb, trailAccum, trailIntensity), 1.0);
)"
        },
        {
            makeEffect("luma-feedback", "Luma Bloom", "color",
                       "Threshold-based bloom on bright areas",
                       standardParams(0.5f, "Threshold", 0.5f, "Glow", 0.5f, 1.0f)),
            "",
            R"(
    vec4 color = texture(uInputTex, vUv);
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    float threshold = 0.3 - param1 * 0.3;
    float glowPulse = 0.85 + 0.15 * sin(uTime * speed);
    float glow = param2 * intensity * glowPulse;

    if (luma > threshold) {
        float brightness = (luma - threshold) / max(1.0 - threshold, 0.001);
        color.rgb += color.rgb * brightness * glow;
    }
    fragColor = color;
)"
        },
        {
            makeEffect("neon-edge", "Neon Edge", "color",
                       "Sobel edges become animated neon lines over dimmed source",
                       standardParams(0.5f, "Thickness", 0.5f, "Glow", 0.5f, 1.0f)),
            "",
            R"(
    float t = uTime * speed;
    vec2 texel = vec2(0.002 * (1.0 + param1));

    float tl = dot(texture(uInputTex, vUv + vec2(-texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tc = dot(texture(uInputTex, vUv + vec2(0.0, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(uInputTex, vUv + vec2(texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture(uInputTex, vUv + vec2(-texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture(uInputTex, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(uInputTex, vUv + vec2(-texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float bc = dot(texture(uInputTex, vUv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(uInputTex, vUv + vec2(texel.x, texel.y)).rgb, vec3(0.299, 0.587, 0.114));

    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
    float edge = sqrt(gx*gx + gy*gy);

    vec4 orig = texture(uInputTex, vUv);
    vec3 neon = vec3(
        0.5 + 0.5 * sin(t + vUv.x * 5.0),
        0.5 + 0.5 * sin(t * 1.3 + vUv.y * 5.0),
        0.5 + 0.5 * sin(t * 0.7 + (vUv.x + vUv.y) * 5.0)
    );

    float strength = clamp(edge * intensity * 5.0, 0.0, 1.0);
    vec3 color = mix(orig.rgb * 0.15, neon, strength);
    color += neon * edge * param2 * intensity * 0.3;
    fragColor = vec4(color, 1.0);
)"
        },
        {
            makeEffect("kaleidoscope", "Kaleidoscope", "distortion",
                       "Segmented mirror fold with rotation and zoom",
                       {
                           makeParam("intensity", "Mix", "", 0.0f, 1.0f, 0.85f, 0.01f),
                           makeParam("speed", "Rotation", "", -4.0f, 4.0f, 0.8f, 0.05f),
                           makeParam("param1", "Segments", "", 2.0f, 16.0f, 8.0f, 1.0f),
                           makeParam("param2", "Zoom", "", 0.25f, 1.75f, 1.0f, 0.01f),
                       }),
            "",
            R"(
    vec2 centered = (vUv - vec2(0.5)) / max(0.0001, param2);
    float angle = atan(centered.y, centered.x) + uTime * speed;
    float radius = length(centered);
    float segCount = max(2.0, floor(param1 + 0.5));
    float segAngle = 6.2831853 / segCount;

    angle = mod(angle, segAngle);
    angle = abs(angle - segAngle * 0.5);

    vec2 warped = vec2(cos(angle), sin(angle)) * radius + vec2(0.5);
    warped = clamp(warped, vec2(0.0), vec2(1.0));

    vec4 base = texture(uInputTex, vUv);
    vec4 effected = texture(uInputTex, warped);
    fragColor = mix(base, effected, intensity);
)"
        },
    };
    return definitions;
}

const VideoSynthShaderDefinition* findDefinition(const std::string& effectId) {
    const auto& definitions = shaderDefinitions();
    const auto it = std::find_if(definitions.begin(), definitions.end(), [&](const auto& def) {
        return def.spec.id == effectId;
    });
    if (it == definitions.end()) {
        return nullptr;
    }
    return &(*it);
}

std::string fragmentPreambleFor(const VideoSynthShaderDefinition& definition) {
    std::string source = R"(#version 150
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uInputTex;
uniform float uTime;
uniform vec2 uResolution;
)";

    for (const auto& param : definition.spec.params) {
        source += "uniform float " + param.id + ";\n";
    }

    if (!definition.fragmentPreamble.empty()) {
        source += definition.fragmentPreamble;
    }

    source += "\nvoid main() {\n";
    source += definition.fragmentBody;
    source += "\n}\n";
    return source;
}

} // namespace

const std::vector<VideoSynthEffectSpec>& VideoSynthPrimitive::effects() {
    static std::vector<VideoSynthEffectSpec> specs;
    if (specs.empty()) {
        specs.reserve(shaderDefinitions().size());
        for (const auto& definition : shaderDefinitions()) {
            specs.push_back(definition.spec);
        }
    }
    return specs;
}

const VideoSynthEffectSpec* VideoSynthPrimitive::findEffect(const std::string& effectId) {
    const auto& specs = effects();
    const auto it = std::find_if(specs.begin(), specs.end(), [&](const auto& spec) {
        return spec.id == effectId;
    });
    if (it == specs.end()) {
        return nullptr;
    }
    return &(*it);
}

std::unordered_map<std::string, float> VideoSynthPrimitive::defaultParams(const std::string& effectId) {
    std::unordered_map<std::string, float> values;
    const auto* effect = findEffect(effectId);
    if (effect == nullptr) {
        return values;
    }
    for (const auto& param : effect->params) {
        values[param.id] = param.defaultValue;
    }
    return values;
}

std::unordered_map<std::string, float> VideoSynthPrimitive::sanitizeParams(
    const std::string& effectId,
    const std::unordered_map<std::string, float>& params) {
    auto values = defaultParams(effectId);
    const auto* effect = findEffect(effectId);
    if (effect == nullptr) {
        return values;
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

std::string VideoSynthPrimitive::vertexShaderSource() {
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

std::string VideoSynthPrimitive::fragmentShaderSource(const std::string& effectId) {
    const auto* definition = findDefinition(effectId.empty() ? std::string("none") : effectId);
    if (definition == nullptr) {
        const auto* fallback = findDefinition("none");
        return fallback != nullptr ? fragmentPreambleFor(*fallback) : std::string{};
    }
    return fragmentPreambleFor(*definition);
}

} // namespace manifold::video
