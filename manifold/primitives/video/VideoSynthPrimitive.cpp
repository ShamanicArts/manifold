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

const char* kRandPreamble = R"(
float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}
)";

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
                       {
                           makeParam("intensity",       "Intensity",       "",   0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",           "Speed",           "",   0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",          "Aberration",      "",   0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",          "Pulse",           "",   0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("aberrationScale", "Aberration Scale","",   0.0f, 0.2f, 0.05f, 0.005f),
                           makeParam("edgeBoost",       "Edge Boost",      "",   0.0f, 2.0f, 0.5f, 0.05f),
                       }),
            "",
            R"(
    vec2 center = vec2(0.5);
    vec2 dir = vUv - center;
    float dist = length(dir);

    float baseAberr = param1 * aberrationScale;
    float pulse = 1.0 + param2 * sin(uTime * speed);
    float aberration = intensity * baseAberr * pulse;
    aberration *= (edgeBoost + dist);

    float r = texture(uInputTex, vUv + dir * aberration).r;
    float g = texture(uInputTex, vUv).g;
    float b = texture(uInputTex, vUv - dir * aberration).b;
    fragColor = vec4(r, g, b, 1.0);
)"
        },
        {
            makeEffect("glitch", "Glitch", "glitch",
                       "Block-shift glitch with scanline tears and RGB split",
                       {
                           makeParam("intensity",      "Intensity",      "",  0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",          "Speed",          "",  0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",         "Blocks",         "",  0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",         "Frequency",      "",  0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("triggerBase",    "Trigger Base",   "",  0.5f, 1.0f, 0.95f, 0.01f),
                           makeParam("scanlineFreq",   "Scanline Freq",  "",  20.0f, 500.0f, 200.0f, 5.0f),
                           makeParam("scanlineAmount", "Scanline Amount","",  0.0f, 0.1f, 0.01f, 0.001f),
                           makeParam("rgbSplitAmount", "RGB Split",      "",  0.0f, 0.1f, 0.02f, 0.001f),
                       }),
            kRandPreamble,
            R"(
    vec2 uv = vUv;
    float t = uTime * speed;
    float blocks = mix(5.0, 30.0, param1);
    float freq = mix(5.0, 30.0, param2);
    float glitchIntensity = intensity;

    float blockY = floor(vUv.y * blocks) / blocks;
    float glitchTrigger = step(triggerBase, rand(vec2(blockY, floor(t * freq))));
    if (glitchTrigger > 0.5) {
        uv.x += (rand(vec2(blockY, t)) - 0.5) * glitchIntensity * 0.3;
    }

    float scanGlitch = sin(vUv.y * scanlineFreq + t * 5.0) * glitchIntensity * scanlineAmount;
    uv.x += scanGlitch * step(0.97, rand(vec2(floor(t * 20.0), vUv.y)));

    vec4 color = texture(uInputTex, uv);
    if (glitchTrigger > 0.5) {
        color.rgb = vec3(
            texture(uInputTex, uv + vec2(rgbSplitAmount * glitchIntensity, 0.0)).r,
            color.g,
            texture(uInputTex, uv - vec2(rgbSplitAmount * glitchIntensity, 0.0)).b
        );
    }
    fragColor = color;
)"
        },
        {
            makeEffect("vhs", "VHS", "glitch",
                       "VHS-style tearing, wobble, noise and chroma bleed",
                       {
                           makeParam("intensity",     "Intensity",     "",  0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",         "Speed",         "",  0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",        "Noise",         "",  0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",        "Bleed",         "",  0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("tearThreshold", "Tear Threshold","",  0.5f, 1.0f, 0.96f, 0.01f),
                           makeParam("tearAmount",    "Tear Amount",   "",  0.0f, 0.2f, 0.05f, 0.005f),
                           makeParam("wobbleAmount",  "Wobble Amount", "",  0.0f, 0.05f, 0.005f, 0.001f),
                           makeParam("bleedScale",    "Bleed Scale",   "",  0.0f, 0.1f, 0.02f, 0.001f),
                       }),
            kRandPreamble,
            R"(
    vec2 uv = vUv;
    float t = uTime * speed;

    float tearLine = step(tearThreshold, rand(vec2(floor(vUv.y * 50.0), floor(t * 3.0))));
    if (tearLine > 0.5) {
        uv.x += sin(t * 30.0) * intensity * tearAmount;
    }
    uv.y += sin(uv.x * 40.0 + t * 2.0) * intensity * wobbleAmount;

    float noise = rand(uv + vec2(t)) * intensity * param1;

    float bleed = sin(uv.y * 100.0 + t) * intensity * bleedScale * param2;
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
                       {
                           makeParam("intensity", "Intensity",   "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",     "Speed",       "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",    "Warp",        "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",    "Color Shift", "", 0.0f, 1.0f, 0.5f, 0.01f),
                       }),
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
                       {
                           makeParam("intensity", "Intensity", "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",     "Speed",     "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",    "Frequency", "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",    "Waves",     "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("freqMin",   "Freq Min",  "", 1.0f, 100.0f, 20.0f, 1.0f),
                           makeParam("freqMax",   "Freq Max",  "", 1.0f, 120.0f, 60.0f, 1.0f),
                           makeParam("waveScale", "Wave Scale","", 0.0f, 0.1f, 0.02f, 0.005f),
                           makeParam("maxLayers", "Max Layers","", 1.0f, 8.0f, 5.0f, 1.0f),
                       }),
            "",
            R"(
    vec2 uv = vUv;
    float t = uTime * speed;

    vec2 center = vec2(0.5);
    vec2 delta = uv - center;
    float dist = length(delta);

    float freq = mix(freqMin, freqMax, param1);
    float waves = mix(2.0, maxLayers, param2);

    float wave = 0.0;
    for (float i = 1.0; i <= 8.0; i++) {
        if (i > waves) break;
        wave += sin(dist * freq * i - t * 4.0 * i) * intensity * waveScale / i;
    }

    uv += delta * wave;
    uv = clamp(uv, vec2(0.0), vec2(1.0));
    fragColor = texture(uInputTex, uv);
)"
        },
        {
            makeEffect("pixelate", "Pixelate", "color",
                       "Block pixelation with subtle animation",
                       {
                           makeParam("intensity", "Intensity", "",  0.0f, 1.0f, 1.0f, 0.01f),
                           makeParam("speed",     "Speed",     "",  0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",    "Size",      "",  0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",    "Animate",   "",  0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("pixelMin",  "Pixel Min", "",  0.00001f, 0.01f, 0.0001f, 0.00005f),
                           makeParam("pixelMax",  "Pixel Max", "",  0.001f, 0.05f, 0.01f, 0.001f),
                           makeParam("animScale", "Anim Scale","",  0.0f, 0.01f, 0.00005f, 0.00005f),
                       }),
            "",
            R"(
    float t = uTime * speed;
    float pixelSize = mix(pixelMin, pixelMax, param1);
    pixelSize += sin(t) * animScale * param2;
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
                       {
                           makeParam("intensity", "Intensity", "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",     "Speed",     "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",    "Distance",  "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",    "Rotation",  "", 0.0f, 1.0f, 0.5f, 0.01f),
                       }),
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
                       {
                           makeParam("intensity",   "Intensity",    "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",       "Speed",        "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",      "Amplitude",    "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",      "Frequency",    "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("ampScale",    "Amp Scale",    "", 0.0f, 0.1f, 0.03f, 0.005f),
                           makeParam("freqBase",    "Freq Base",    "", 1.0f, 50.0f, 15.0f, 1.0f),
                           makeParam("freqRange",   "Freq Range",   "", 0.0f, 50.0f, 20.0f, 1.0f),
                           makeParam("layer2Scale", "Layer 2 Scale","", 0.0f, 2.0f, 0.5f, 0.05f),
                           makeParam("layer3Scale", "Layer 3 Scale","", 0.0f, 2.0f, 0.4f, 0.05f),
                       }),
            "",
            R"(
    vec2 uv = vUv;
    float t = uTime * speed;

    float amp = intensity * param1 * ampScale;
    float freq = freqBase + param2 * freqRange;

    uv.x += sin(uv.y * freq + t * 3.0) * amp;
    uv.y += cos(uv.x * freq * 0.8 + t * 2.0) * amp * 0.7;
    uv.x += sin(uv.y * freq * 2.0 + t * 5.0) * amp * layer2Scale;
    uv.y += cos(uv.x * freq * 1.5 + t * 4.0) * amp * layer3Scale;

    uv = clamp(uv, vec2(0.0), vec2(1.0));
    fragColor = texture(uInputTex, uv);
)"
        },
        {
            makeEffect("posterize", "Posterize", "color",
                       "Reduce color levels with animated shift",
                       {
                           makeParam("intensity", "Intensity",   "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",     "Speed",       "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",    "Levels",      "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",    "Color Shift", "", 0.0f, 1.0f, 0.5f, 0.01f),
                       }),
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
                       {
                           makeParam("intensity",   "Intensity",    "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",       "Speed",        "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",      "Length",       "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",      "Fade",         "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("maxSamples",  "Max Samples",  "", 1.0f, 16.0f, 10.0f, 1.0f),
                           makeParam("offsetScale", "Offset Scale", "", 0.0001f, 0.02f, 0.003f, 0.0005f),
                           makeParam("fadeFloor",   "Fade Floor",   "", 0.0f, 1.0f, 0.5f, 0.01f),
                       }),
            "",
            R"(
    float t = uTime * speed;
    vec4 color = vec4(0.0);

    float trailLength = 1.0 + intensity * param1 * maxSamples;
    float fade = 1.0 - param2 * fadeFloor;

    for (float i = 0.0; i < 16.0; i++) {
        if (i >= trailLength) break;

        float offset = i * offsetScale * intensity;
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
                       {
                           makeParam("intensity",      "Intensity",      "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",          "Speed",          "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",         "Length",         "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",         "Feedback",       "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("maxSamples",     "Max Samples",    "", 1.0f, 16.0f, 10.0f, 1.0f),
                           makeParam("offsetScale",    "Offset Scale",   "", 0.0001f, 0.02f, 0.004f, 0.0005f),
                           makeParam("noiseCutoff",    "Noise Cutoff",   "", 0.0f, 1.0f, 0.3f, 0.01f),
                           makeParam("dissolveMin",    "Dissolve Min",   "", 0.0f, 1.0f, 0.3f, 0.01f),
                           makeParam("dissolveRange",  "Dissolve Range", "", 0.0f, 1.0f, 0.7f, 0.01f),
                       }),
            "",
            R"(
    float t = uTime * speed;
    vec4 original = texture(uInputTex, vUv);

    vec3 trailAccum = vec3(0.0);
    float totalWeight = 0.0;
    float samples = 4.0 + param1 * maxSamples;
    float fade = 0.85;

    for (float i = 0.0; i < 16.0; i++) {
        if (i >= samples) break;

        float offset = i * offsetScale * intensity;
        vec2 sampleUv = vUv;
        sampleUv.x += sin(t * 2.0 + i * 0.5) * offset;
        sampleUv.y += cos(t * 1.5 + i * 0.3) * offset;

        vec4 texColor = texture(uInputTex, clamp(sampleUv, vec2(0.0), vec2(1.0)));
        float noise = fract(sin(dot(sampleUv * 30.0 + vec2(t + i * 0.1), vec2(12.9898, 78.233))) * 43758.5453);
        float dissolve = dissolveMin + dissolveRange * step(noiseCutoff, noise + param2 * 0.5);

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
                       {
                           makeParam("intensity", "Intensity",   "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",     "Speed",       "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",    "Sensitivity", "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",    "Color Speed", "", 0.0f, 1.0f, 0.5f, 0.01f),
                       }),
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
                       {
                           makeParam("intensity", "Intensity",   "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",     "Speed",       "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",    "Decay",       "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",    "Color Shift", "", 0.0f, 1.0f, 0.5f, 0.01f),
                       }),
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
                       {
                           makeParam("intensity",       "Intensity",       "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",           "Speed",           "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",          "Threshold",       "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",          "Glow",            "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("thresholdBase",   "Threshold Base",  "", 0.0f, 1.0f, 0.3f, 0.01f),
                           makeParam("thresholdRange",  "Threshold Range", "", 0.0f, 1.0f, 0.3f, 0.01f),
                           makeParam("glowPulseAmount", "Glow Pulse",      "", 0.0f, 1.0f, 0.15f, 0.01f),
                       }),
            "",
            R"(
    vec4 color = texture(uInputTex, vUv);
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));

    float threshold = thresholdBase - param1 * thresholdRange;
    float glowPulse = (1.0 - glowPulseAmount) + glowPulseAmount * sin(uTime * speed);
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
                       {
                           makeParam("intensity", "Intensity", "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",     "Speed",     "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",    "Thickness", "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",    "Glow",      "", 0.0f, 1.0f, 0.5f, 0.01f),
                       }),
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
                           makeParam("intensity", "Mix",      "", 0.0f, 1.0f, 0.85f, 0.01f),
                           makeParam("speed",     "Rotation", "", -4.0f, 4.0f, 0.8f, 0.05f),
                           makeParam("param1",    "Segments", "", 2.0f, 16.0f, 8.0f, 1.0f),
                           makeParam("param2",    "Zoom",     "", 0.25f, 1.75f, 1.0f, 0.01f),
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
        {
            makeEffect("optical-flow", "Optical Flow", "feedback",
                       "Horn-Schunck optical flow with advection and flow visualization",
                       {
                           makeParam("intensity",   "Intensity",   "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",       "Speed",       "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",      "Sensitivity", "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",      "Advection",   "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("offsetBase",  "Offset Base", "", 0.001f, 0.02f, 0.004f, 0.001f),
                           makeParam("offsetScale", "Offset Scale","", 0.0f, 0.02f, 0.008f, 0.001f),
                           makeParam("lambda",      "Smoothness",  "", 0.001f, 0.05f, 0.005f, 0.001f),
                           makeParam("overlayGain", "Overlay Gain","", 0.1f, 2.0f, 0.7f, 0.05f),
                           makeParam("maskMin",     "Mask Min",    "", 0.0f, 0.02f, 0.001f, 0.001f),
                           makeParam("maskMax",     "Mask Max",    "", 0.005f, 0.1f, 0.02f, 0.001f),
                       }),
            R"(
float luma(vec4 c) {
    return dot(c.rgb, vec3(0.299, 0.587, 0.114));
}
)",
            R"(
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);
    float eff = intensity * 0.0003;
    float offset = offsetBase + param1 * offsetScale;

    float nextR = luma(texture(uInputTex, uv + vec2(offset, 0.0)));
    float nextL = luma(texture(uInputTex, uv - vec2(offset, 0.0)));
    float nextU = luma(texture(uInputTex, uv + vec2(0.0, offset)));
    float nextD = luma(texture(uInputTex, uv - vec2(0.0, offset)));

    float pastR = luma(texture(uFeedbackTex, uv + vec2(offset, 0.0)));
    float pastL = luma(texture(uFeedbackTex, uv - vec2(offset, 0.0)));
    float pastU = luma(texture(uFeedbackTex, uv + vec2(0.0, offset)));
    float pastD = luma(texture(uFeedbackTex, uv - vec2(0.0, offset)));

    float gradX = (nextR - nextL) + (pastR - pastL);
    float gradY = (nextU - nextD) + (pastU - pastD);
    float gradMag = sqrt(gradX * gradX + gradY * gradY + lambda);

    float curr = luma(liveVid);
    float prev = luma(texture(uFeedbackTex, uv));
    float diff = curr - prev;

    vec2 flow = vec2(diff * gradX / gradMag, diff * gradY / gradMag);

    float advectStrength = param2 * eff * 5.0 * (0.5 + speed * 0.25);
    vec2 advectedUv = uv - flow * advectStrength;
    vec4 advected = texture(uFeedbackTex, clamp(advectedUv, 0.0, 1.0));

    float decay = 0.92 + (1.0 - eff * 33.0) * 0.06;
    advected.rgb *= clamp(decay, 0.85, 0.98);

    float flowPower = length(flow);
    float flowAngle = atan(flow.y, flow.x);

    float hue = flowAngle / 6.2832 + 0.5;
    float sat = 0.85 * clamp(flowPower * 80.0, 0.0, 1.0);
    float lit = 0.5 * clamp(flowPower * 60.0, 0.0, 1.0);

    float ch = (1.0 - abs(2.0 * lit - 1.0)) * sat;
    float xh = ch * (1.0 - abs(mod(hue * 6.0, 2.0) - 1.0));
    float mh = lit - ch * 0.5;
    vec3 flowColor;
    float h6 = hue * 6.0;
    if (h6 < 1.0) flowColor = vec3(ch, xh, 0.0);
    else if (h6 < 2.0) flowColor = vec3(xh, ch, 0.0);
    else if (h6 < 3.0) flowColor = vec3(0.0, ch, xh);
    else if (h6 < 4.0) flowColor = vec3(0.0, xh, ch);
    else if (h6 < 5.0) flowColor = vec3(xh, 0.0, ch);
    else flowColor = vec3(ch, 0.0, xh);
    flowColor += mh;

    vec3 base = max(liveVid.rgb, advected.rgb);
    float flowMask = smoothstep(maskMin, maskMax, flowPower) * (eff * 36.0);
    vec3 result = mix(base, base + flowColor * overlayGain, clamp(flowMask, 0.0, 1.0));

    fragColor = vec4(result, 1.0);
)"
        },
        {
            makeEffect("datamosh", "Datamosh", "glitch",
                       "Temporal diff + edge-protect + P-frame drift smearing",
                       {
                           makeParam("intensity",   "Intensity",   "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",       "Speed",       "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",      "Edge Protect","", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",      "Smear",       "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("edgeMin",     "Edge Min",    "", 0.01f, 0.5f, 0.15f, 0.01f),
                           makeParam("edgeMaxBase", "Edge Max Base","", 0.1f, 1.5f, 0.6f, 0.01f),
                           makeParam("smearScale",  "Smear Scale", "", 0.005f, 0.2f, 0.06f, 0.005f),
                       }),
            "",
            R"(
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);
    vec4 history = texture(uFeedbackTex, uv);

    vec2 t = vec2(0.006);
    float tl = dot(texture(uInputTex, uv + vec2(-t.x, -t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tc = dot(texture(uInputTex, uv + vec2( 0.0, -t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(uInputTex, uv + vec2( t.x, -t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture(uInputTex, uv + vec2(-t.x,  0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture(uInputTex, uv + vec2( t.x,  0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(uInputTex, uv + vec2(-t.x,  t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float bc = dot(texture(uInputTex, uv + vec2( 0.0,  t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(uInputTex, uv + vec2( t.x,  t.y)).rgb, vec3(0.299, 0.587, 0.114));

    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*tc - tr + bl + 2.0*bc + br;
    float edge = sqrt(gx*gx + gy*gy);

    float edgeProtect = smoothstep(edgeMin, edgeMaxBase + param1 * 0.8, edge);

    vec2 ft = vec2(0.004);
    float fn = dot(texture(uFeedbackTex, uv + vec2(0.0, ft.y)).rgb, vec3(0.333));
    float fs = dot(texture(uFeedbackTex, uv - vec2(0.0, ft.y)).rgb, vec3(0.333));
    float fe = dot(texture(uFeedbackTex, uv + vec2(ft.x, 0.0)).rgb, vec3(0.333));
    float fw = dot(texture(uFeedbackTex, uv - vec2(ft.x, 0.0)).rgb, vec3(0.333));
    vec2 flow = vec2(fe - fw, fn - fs);

    float smearAmt = param2 * intensity * smearScale * (0.5 + speed * 0.25);
    vec2 smearUv = uv - flow * smearAmt;
    vec4 moshed = texture(uFeedbackTex, clamp(smearUv, 0.0, 1.0));

    float diff = distance(liveVid.rgb, history.rgb);
    float refreshMask = smoothstep(0.3, 0.6, diff);

    float liveMix = max(edgeProtect, refreshMask);
    liveMix = mix(1.0, liveMix, intensity);

    fragColor = vec4(mix(moshed.rgb, liveVid.rgb, liveMix), 1.0);
)"
        },
        {
            makeEffect("fluid-smoke", "Fluid Smoke", "feedback",
                       "Curl-noise fluid simulation with feedback decay",
                       {
                           makeParam("intensity",       "Intensity",       "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",           "Speed",           "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",          "Flow Speed",      "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",          "Smoke Life",      "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("texelScale",      "Texel Scale",     "", 0.001f, 0.02f, 0.004f, 0.001f),
                           makeParam("turbulenceScale", "Turbulence",      "", 0.0f, 0.02f, 0.005f, 0.001f),
                           makeParam("decayMin",        "Decay Min",       "", 0.5f, 0.98f, 0.85f, 0.01f),
                           makeParam("decayMax",        "Decay Max",       "", 0.7f, 0.999f, 0.99f, 0.001f),
                       }),
            "",
            R"(
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);
    vec2 texel = vec2(texelScale);
    float t = uTime * speed;

    float flowSpeed = param1 * 0.01 * intensity * (0.85 + 0.15 * sin(t));
    vec2 sampleUv = uv - vec2(0.0, flowSpeed);

    float left  = dot(texture(uFeedbackTex, sampleUv - vec2(texel.x, 0.0)).rgb, vec3(0.333));
    float right = dot(texture(uFeedbackTex, sampleUv + vec2(texel.x, 0.0)).rgb, vec3(0.333));
    float down  = dot(texture(uFeedbackTex, sampleUv - vec2(0.0, texel.y)).rgb, vec3(0.333));
    float up    = dot(texture(uFeedbackTex, sampleUv + vec2(0.0, texel.y)).rgb, vec3(0.333));

    sampleUv.x += (down - up) * turbulenceScale * intensity;
    sampleUv.y += (right - left) * turbulenceScale * intensity;

    vec4 history = texture(uFeedbackTex, clamp(sampleUv, 0.0, 1.0));

    float decay = mix(decayMin, decayMax, param2);
    vec3 smoke = history.rgb * decay;

    vec3 result = max(smoke, liveVid.rgb);

    fragColor = vec4(result, 1.0);
)"
        },
        {
            makeEffect("fractal-echo", "Fractal Echo", "feedback",
                       "Recursive zoom/rotate feedback with hue-shifted trails",
                       {
                           makeParam("intensity", "Intensity",   "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",     "Speed",       "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",    "Zoom",        "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",    "Spin + Color","", 0.0f, 1.0f, 0.5f, 0.01f),
                       }),
            R"(
vec3 hueShift(vec3 col, float shift) {
    float cosA = cos(shift);
    float sinA = sin(shift);
    vec3 k = vec3(0.57735);
    return col * cosA + cross(k, col) * sinA + k * dot(k, col) * (1.0 - cosA);
}
)",
            R"(
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);

    vec2 center = uv - 0.5;

    float zoom = 1.0 - (0.005 + param1 * 0.025) * intensity;
    center *= zoom;

    float angle = (0.003 + param2 * 0.02) * intensity * speed;
    float co = cos(angle);
    float si = sin(angle);
    center = vec2(center.x * co - center.y * si, center.x * si + center.y * co);

    vec2 feedbackUv = clamp(center + 0.5, 0.0, 1.0);
    vec4 history = texture(uFeedbackTex, feedbackUv);

    float hueAngle = (0.03 + param2 * 0.12) * intensity * speed;
    history.rgb = hueShift(history.rgb, hueAngle);

    float histLuma = dot(history.rgb, vec3(0.299, 0.587, 0.114));
    history.rgb = mix(vec3(histLuma), history.rgb, 1.15);

    float decay = 0.90 + (1.0 - intensity) * 0.07;
    history.rgb *= decay;
    history.rgb = clamp(history.rgb, 0.0, 1.0);

    float edgeDist = length(uv - 0.5) * 2.0;
    float liveMix = smoothstep(0.2, 0.85, edgeDist);
    liveMix = max(liveMix, 1.0 - intensity);

    vec3 blended = max(liveVid.rgb, history.rgb);
    vec3 result = mix(history.rgb, blended, liveMix);

    fragColor = vec4(result, 1.0);
)"
        },
        {
            makeEffect("pixel-sort", "Pixel Sort", "glitch",
                       "Threshold-based pixel sorting with feedback streaks",
                       {
                           makeParam("intensity",      "Intensity",       "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",          "Speed",           "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",         "Direction",       "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",         "Threshold",       "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("thresholdBase",  "Threshold Base",  "", 0.0f, 1.0f, 0.05f, 0.01f),
                           makeParam("thresholdRange", "Threshold Range", "", 0.0f, 1.0f, 0.6f, 0.01f),
                           makeParam("maxDisplace",    "Max Displace",    "", 0.05f, 1.0f, 0.25f, 0.01f),
                           makeParam("chromaAmount",   "Chroma Amount",   "", 0.0f, 1.0f, 0.015f, 0.005f),
                       }),
            R"(
float getLuma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}
)",
            R"(
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);
    float luma = getLuma(liveVid.rgb);

    float angle = mix(0.0, 1.5708, param1);
    vec2 sortDir = vec2(cos(angle), sin(angle));

    float thresh = thresholdBase + param2 * thresholdRange;
    float sortMask = smoothstep(thresh - 0.08, thresh + 0.08, luma);

    float maxDisp = intensity * maxDisplace;
    vec3 bestColor = liveVid.rgb;
    float bestLuma = luma;

    for (float i = 1.0; i <= 8.0; i++) {
      float d = i * maxDisp / 8.0;
      vec2 sampleUv = clamp(uv - sortDir * d, 0.0, 1.0);
      vec3 s = texture(uInputTex, sampleUv).rgb;
      float sl = getLuma(s);
      if (sl > bestLuma && sl > thresh) {
        bestLuma = sl;
        bestColor = s;
      }
    }

    float chromaOff = sortMask * intensity * chromaAmount;
    float sR = texture(uInputTex, clamp(uv - sortDir * maxDisp * 0.5 + vec2(chromaOff, 0.0), 0.0, 1.0)).r;
    float sB = texture(uInputTex, clamp(uv - sortDir * maxDisp * 0.5 - vec2(chromaOff, 0.0), 0.0, 1.0)).b;
    vec3 chromaSorted = vec3(sR, bestColor.g, sB);

    vec3 sorted = mix(bestColor, chromaSorted, 0.6);

    vec2 feedbackUv = uv - sortDir * intensity * 0.02 * (0.5 + speed * 0.25);
    vec4 history = texture(uFeedbackTex, clamp(feedbackUv, 0.0, 1.0));
    float decay = 0.88 + (1.0 - intensity) * 0.08;

    float histLuma = getLuma(history.rgb);
    float histMask = smoothstep(thresh - 0.08, thresh + 0.08, histLuma);
    vec3 streaked = history.rgb * decay;

    vec3 sortResult = mix(liveVid.rgb, sorted, sortMask);
    sortResult = max(sortResult, streaked * histMask * 0.7);

    fragColor = vec4(mix(liveVid.rgb, sortResult, intensity), 1.0);
)"
        },
        {
            makeEffect("time-smear", "Time Smear", "feedback",
                       "Chromatic channel-separated time trails with tint drift",
                       {
                           makeParam("intensity", "Intensity",   "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("speed",     "Speed",       "", 0.0f, 3.0f, 1.0f, 0.1f),
                           makeParam("param1",    "Angle",       "", 0.0f, 1.0f, 0.5f, 0.01f),
                           makeParam("param2",    "Persistence", "", 0.0f, 1.0f, 0.5f, 0.01f),
                       }),
            "",
            R"(
    vec2 uv = vUv;
    vec4 liveVid = texture(uInputTex, uv);

    float angle = param1 * 6.2832;
    float drift = intensity * 0.015;
    float decay = 0.82 + param2 * 0.16;

    float spread = 0.15 * intensity;

    vec2 dirR = vec2(cos(angle - spread), sin(angle - spread));
    vec2 dirG = vec2(cos(angle), sin(angle));
    vec2 dirB = vec2(cos(angle + spread), sin(angle + spread));

    float hR = texture(uFeedbackTex, clamp(uv - dirR * drift, 0.0, 1.0)).r * decay;
    float hG = texture(uFeedbackTex, clamp(uv - dirG * drift, 0.0, 1.0)).g * decay;
    float hB = texture(uFeedbackTex, clamp(uv - dirB * drift, 0.0, 1.0)).b * decay;

    float wR = texture(uFeedbackTex, clamp(uv - dirR * drift * 2.5, 0.0, 1.0)).r * decay * 0.85;
    float wG = texture(uFeedbackTex, clamp(uv - dirG * drift * 2.5, 0.0, 1.0)).g * decay * 0.85;
    float wB = texture(uFeedbackTex, clamp(uv - dirB * drift * 2.5, 0.0, 1.0)).b * decay * 0.85;

    vec3 trail = vec3(max(hR, wR), max(hG, wG), max(hB, wB));

    vec3 trailed = max(liveVid.rgb, trail);

    float timeTint = uTime * speed * 0.3;
    vec3 tint = vec3(
      0.5 + 0.5 * sin(timeTint),
      0.5 + 0.5 * sin(timeTint + 2.094),
      0.5 + 0.5 * sin(timeTint + 4.189)
    );
    vec3 trailOnly = max(trail - liveVid.rgb, vec3(0.0));
    trailed += trailOnly * tint * intensity * 0.4;

    fragColor = vec4(mix(liveVid.rgb, trailed, intensity), 1.0);
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

// Blend helper available to every effect. Applied after the shader body writes
// to fragColor so that multi-pass composites can stack layers with blend
// modes and opacity. uBlendMode: 0=normal, 1=add, 2=multiply, 3=screen,
// 4=difference.
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

std::string fragmentPreambleFor(const VideoSynthShaderDefinition& definition, bool includeBlendEpilogue) {
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
    return fragmentShaderSource(effectId, true);
}

std::string VideoSynthPrimitive::fragmentShaderSource(const std::string& effectId, bool includeBlendEpilogue) {
    const auto* definition = findDefinition(effectId.empty() ? std::string("none") : effectId);
    if (definition == nullptr) {
        const auto* fallback = findDefinition("none");
        return fallback != nullptr ? fragmentPreambleFor(*fallback, includeBlendEpilogue) : std::string{};
    }
    return fragmentPreambleFor(*definition, includeBlendEpilogue);
}

} // namespace manifold::video
