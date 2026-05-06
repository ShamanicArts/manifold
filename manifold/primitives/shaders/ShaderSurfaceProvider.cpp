#include "ShaderSurfaceProvider.h"

#include "ShaderEffectRegistry.h"
#include "ShaderSurfaceSupport.h"
#include "UniformContract.h"
#include "../sources/TextureSourceRegistry.h"
#include "../ui/RuntimeNode.h"

#include <juce_core/juce_core.h>
#include <juce_opengl/juce_opengl.h>

#include <algorithm>
#include <array>
#include <cstdio>
#include <memory>
#include <string>
#include <unordered_map>
#include <utility>

using namespace juce::gl;

namespace manifold::shaders {
namespace {

bool varIsNumber(const juce::var& value) {
    return surface_support::varIsNumber(value);
}

double varToDoubleValue(const juce::var& value, double fallback = 0.0) {
    return surface_support::varToDoubleValue(value, fallback);
}

void applySurfaceUniformValue(int location, const juce::var& value) {
    if (location < 0) {
        return;
    }

    if (varIsNumber(value)) {
        glUniform1f(location, static_cast<float>(varToDoubleValue(value)));
        return;
    }

    if (auto* arr = value.getArray(); arr != nullptr) {
        if (arr->size() == 2) {
            glUniform2f(location,
                        static_cast<float>(varToDoubleValue(arr->getReference(0))),
                        static_cast<float>(varToDoubleValue(arr->getReference(1))));
        } else if (arr->size() == 3) {
            glUniform3f(location,
                        static_cast<float>(varToDoubleValue(arr->getReference(0))),
                        static_cast<float>(varToDoubleValue(arr->getReference(1))),
                        static_cast<float>(varToDoubleValue(arr->getReference(2))));
        } else if (arr->size() >= 4) {
            glUniform4f(location,
                        static_cast<float>(varToDoubleValue(arr->getReference(0))),
                        static_cast<float>(varToDoubleValue(arr->getReference(1))),
                        static_cast<float>(varToDoubleValue(arr->getReference(2))),
                        static_cast<float>(varToDoubleValue(arr->getReference(3))));
        }
    }
}

void applySurfaceUniformBlock(unsigned int program, const juce::var& uniforms) {
    if (auto* obj = uniforms.getDynamicObject(); obj != nullptr) {
        for (const auto& property : obj->getProperties()) {
            const auto location = glGetUniformLocation(program, property.name.toString().toRawUTF8());
            applySurfaceUniformValue(location, property.value);
        }
        return;
    }

    if (auto* arr = uniforms.getArray(); arr != nullptr) {
        for (const auto& entry : *arr) {
            auto* item = entry.getDynamicObject();
            if (item == nullptr) {
                continue;
            }
            const auto name = item->getProperty("name").toString().toStdString();
            if (name.empty()) {
                continue;
            }
            const auto location = glGetUniformLocation(program, name.c_str());
            applySurfaceUniformValue(location, item->getProperty("value"));
        }
    }
}

struct PassResources {
    unsigned int program = 0;
    unsigned int fbo = 0;
    unsigned int colorTex = 0;
    unsigned int depthRbo = 0;
    std::string vertexSource;
    std::string fragmentSource;
    std::string inputTextureUniform = UniformContract::kInputTex;
    std::string prevTextureUniform = UniformContract::kPrevTex;
    juce::var uniforms;
    std::array<float, 4> clearColor { 0.0f, 0.0f, 0.0f, 0.0f };
    bool enableDepth = false;
    int blendMode = 0;
    float opacity = 1.0f;
    bool chain = false;
    bool composite = false;
    std::string blendOpId;
    unsigned int blendOpProgram = 0;
    juce::var blendParams;
};

using ParsedPassConfig = surface_support::ParsedPassConfig;
using ParsedSourceConfig = surface_support::ParsedSourceConfig;

void initializePassResources(PassResources& pass, const ParsedPassConfig& parsed) {
    pass.vertexSource = parsed.vertexSource;
    pass.fragmentSource = parsed.fragmentSource;
    pass.inputTextureUniform = parsed.inputTextureUniform;
    pass.prevTextureUniform = parsed.prevTextureUniform;
    pass.uniforms = parsed.uniforms.clone();
    pass.clearColor = parsed.clearColor;
    pass.enableDepth = parsed.enableDepth;
    pass.blendMode = parsed.blendMode;
    pass.opacity = parsed.opacity;
    pass.chain = parsed.chain;
    pass.composite = parsed.composite;
    pass.blendOpId = parsed.blendOpId;
    pass.blendParams = parsed.blendParams.clone();
}

void updatePassRuntimeState(PassResources& pass, const ParsedPassConfig& parsed) {
    pass.inputTextureUniform = parsed.inputTextureUniform;
    pass.prevTextureUniform = parsed.prevTextureUniform;
    pass.uniforms = parsed.uniforms.clone();
    pass.clearColor = parsed.clearColor;
    pass.blendMode = parsed.blendMode;
    pass.opacity = parsed.opacity;
    pass.chain = parsed.chain;
    pass.blendParams = parsed.blendParams.clone();
}

void initializeSourceResources(PassResources& sourcePass, const ParsedSourceConfig& parsed) {
    sourcePass.vertexSource = parsed.vertexSource;
    sourcePass.fragmentSource = parsed.fragmentSource;
    sourcePass.uniforms = parsed.uniforms.clone();
    sourcePass.clearColor = parsed.clearColor;
}

void updateSourceRuntimeState(PassResources& sourcePass, const ParsedSourceConfig& parsed) {
    sourcePass.uniforms = parsed.uniforms.clone();
    sourcePass.clearColor = parsed.clearColor;
}

struct SurfaceState {
    std::string surfaceType;
    std::string payloadSignature;
    std::string sourceType;
    std::string sourceId;
    bool usesGeneratedSource = false;
    PassResources sourcePass;
    std::vector<PassResources> passes;
    unsigned int sourceTexture = 0;
    int sourceWidth = 0;
    int sourceHeight = 0;
    uint64_t sourceSequence = 0;
    unsigned int feedbackTex = 0;
    int feedbackWidth = 0;
    int feedbackHeight = 0;
    unsigned int compositeFbo = 0;
    unsigned int compositeTex = 0;
    int width = 0;
    int height = 0;
    bool debugLogged = false;
    std::string lastError;
};

void releaseShaderSurfacePass(PassResources& pass) {
    if (pass.program != 0) {
        glDeleteProgram(pass.program);
        pass.program = 0;
    }
    if (pass.blendOpProgram != 0) {
        glDeleteProgram(pass.blendOpProgram);
        pass.blendOpProgram = 0;
    }
    if (pass.depthRbo != 0) {
        glDeleteRenderbuffers(1, &pass.depthRbo);
        pass.depthRbo = 0;
    }
    if (pass.colorTex != 0) {
        glDeleteTextures(1, &pass.colorTex);
        pass.colorTex = 0;
    }
    if (pass.fbo != 0) {
        glDeleteFramebuffers(1, &pass.fbo);
        pass.fbo = 0;
    }
}

bool compileSurfaceShader(unsigned int& shaderOut,
                          GLenum type,
                          const std::string& source,
                          std::string& errorOut) {
    shaderOut = glCreateShader(type);
    if (shaderOut == 0) {
        errorOut = "glCreateShader failed";
        return false;
    }

    const GLchar* src = source.c_str();
    glShaderSource(shaderOut, 1, &src, nullptr);
    glCompileShader(shaderOut);

    GLint status = GL_FALSE;
    glGetShaderiv(shaderOut, GL_COMPILE_STATUS, &status);
    if (status == GL_TRUE) {
        return true;
    }

    GLint logLength = 0;
    glGetShaderiv(shaderOut, GL_INFO_LOG_LENGTH, &logLength);
    std::string log;
    if (logLength > 1) {
        log.resize(static_cast<std::size_t>(logLength));
        glGetShaderInfoLog(shaderOut, logLength, nullptr, log.data());
    }
    glDeleteShader(shaderOut);
    shaderOut = 0;
    errorOut = log.empty() ? "shader compile failed" : log;
    return false;
}

bool buildSurfaceProgram(PassResources& pass, std::string& errorOut) {
    unsigned int vertexShader = 0;
    unsigned int fragmentShader = 0;
    if (!compileSurfaceShader(vertexShader, GL_VERTEX_SHADER, pass.vertexSource, errorOut)) {
        return false;
    }
    if (!compileSurfaceShader(fragmentShader, GL_FRAGMENT_SHADER, pass.fragmentSource, errorOut)) {
        glDeleteShader(vertexShader);
        return false;
    }

    pass.program = glCreateProgram();
    if (pass.program == 0) {
        glDeleteShader(vertexShader);
        glDeleteShader(fragmentShader);
        errorOut = "glCreateProgram failed";
        return false;
    }

    glAttachShader(pass.program, vertexShader);
    glAttachShader(pass.program, fragmentShader);
    glBindAttribLocation(pass.program, 0, "aPos");
    glBindAttribLocation(pass.program, 1, "aUv");
    glLinkProgram(pass.program);

    GLint linkStatus = GL_FALSE;
    glGetProgramiv(pass.program, GL_LINK_STATUS, &linkStatus);
    glDeleteShader(vertexShader);
    glDeleteShader(fragmentShader);
    if (linkStatus == GL_TRUE) {
        return true;
    }

    GLint logLength = 0;
    glGetProgramiv(pass.program, GL_INFO_LOG_LENGTH, &logLength);
    std::string log;
    if (logLength > 1) {
        log.resize(static_cast<std::size_t>(logLength));
        glGetProgramInfoLog(pass.program, logLength, nullptr, log.data());
    }
    glDeleteProgram(pass.program);
    pass.program = 0;
    errorOut = log.empty() ? "program link failed" : log;
    return false;
}

bool createSurfaceTarget(PassResources& pass, int width, int height, std::string& errorOut) {
    glGenTextures(1, &pass.colorTex);
    if (pass.colorTex == 0) {
        errorOut = "glGenTextures failed";
        return false;
    }
    glBindTexture(GL_TEXTURE_2D, pass.colorTex);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);

    glGenFramebuffers(1, &pass.fbo);
    if (pass.fbo == 0) {
        errorOut = "glGenFramebuffers failed";
        return false;
    }
    glBindFramebuffer(GL_FRAMEBUFFER, pass.fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, pass.colorTex, 0);

    if (pass.enableDepth) {
        glGenRenderbuffers(1, &pass.depthRbo);
        if (pass.depthRbo == 0) {
            errorOut = "glGenRenderbuffers failed";
            return false;
        }
        glBindRenderbuffer(GL_RENDERBUFFER, pass.depthRbo);
        glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8, width, height);
        glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_RENDERBUFFER, pass.depthRbo);
    }

    const auto status = glCheckFramebufferStatus(GL_FRAMEBUFFER);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    if (status == GL_FRAMEBUFFER_COMPLETE) {
        return true;
    }

    errorOut = "framebuffer incomplete";
    return false;
}

} // namespace

struct ShaderSurfaceProvider::Impl {
    std::unordered_map<uint64_t, std::unique_ptr<SurfaceState>> states;
    unsigned int quadVao = 0;
    unsigned int quadVbo = 0;
    unsigned int quadIbo = 0;
    InputResolver inputResolver;
    int64_t colorBytes = 0;
    int64_t depthBytes = 0;

    bool ensureSurfaceQuadGeometry() {
        if (quadVao != 0 && quadVbo != 0 && quadIbo != 0) {
            return true;
        }

        static constexpr float vertices[] = {
            -1.0f, -1.0f, 0.0f, 0.0f,
             1.0f, -1.0f, 1.0f, 0.0f,
             1.0f,  1.0f, 1.0f, 1.0f,
            -1.0f,  1.0f, 0.0f, 1.0f,
        };
        static constexpr unsigned short indices[] = { 0, 1, 2, 0, 2, 3 };

        glGenVertexArrays(1, &quadVao);
        glGenBuffers(1, &quadVbo);
        glGenBuffers(1, &quadIbo);
        if (quadVao == 0 || quadVbo == 0 || quadIbo == 0) {
            return false;
        }

        glBindVertexArray(quadVao);
        glBindBuffer(GL_ARRAY_BUFFER, quadVbo);
        glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STATIC_DRAW);
        glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, quadIbo);
        glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(indices), indices, GL_STATIC_DRAW);
        glEnableVertexAttribArray(0);
        glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), nullptr);
        glEnableVertexAttribArray(1);
        glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), reinterpret_cast<void*>(2 * sizeof(float)));
        glBindVertexArray(0);
        return true;
    }

    void releaseSurfaceQuadGeometry() {
        if (quadVao != 0) {
            glDeleteVertexArrays(1, &quadVao);
            quadVao = 0;
        }
        if (quadVbo != 0) {
            glDeleteBuffers(1, &quadVbo);
            quadVbo = 0;
        }
        if (quadIbo != 0) {
            glDeleteBuffers(1, &quadIbo);
            quadIbo = 0;
        }
    }

    void recalculateOwnedGpuBytes() {
        colorBytes = 0;
        depthBytes = 0;
        for (const auto& [_, state] : states) {
            if (!state) {
                continue;
            }
            if (state->width <= 0 || state->height <= 0) {
                continue;
            }
            if (state->sourcePass.colorTex != 0) {
                colorBytes += static_cast<int64_t>(state->width) * static_cast<int64_t>(state->height) * 4;
            }
            for (const auto& pass : state->passes) {
                if (pass.colorTex != 0) {
                    colorBytes += static_cast<int64_t>(state->width) * static_cast<int64_t>(state->height) * 4;
                }
                if (pass.depthRbo != 0) {
                    depthBytes += static_cast<int64_t>(state->width) * static_cast<int64_t>(state->height) * 4;
                }
            }
            if (state->feedbackTex != 0) {
                colorBytes += static_cast<int64_t>(state->width) * static_cast<int64_t>(state->height) * 4;
            }
        }
    }
};

ShaderSurfaceProvider::ShaderSurfaceProvider()
    : pImpl_(std::make_unique<Impl>()) {
}

ShaderSurfaceProvider::~ShaderSurfaceProvider() {
    releaseAll();
}

bool ShaderSurfaceProvider::handlesType(const std::string& surfaceType) const {
    return surfaceType == "gpu_shader" || surfaceType == "opengl";
}

std::uintptr_t ShaderSurfaceProvider::prepareTexture(const RuntimeNode& node,
                                                     int width,
                                                     int height,
                                                     double timeSeconds) {
    if (node.getStableId() == 0 || width <= 0 || height <= 0) {
        return 0;
    }

    auto& impl = *pImpl_;
    const auto surfaceType = node.getCustomSurfaceType();
    if (!handlesType(surfaceType)) {
        return 0;
    }

    const auto payload = node.getCustomRenderPayload();
    if (payload.isVoid() || payload.isUndefined()) {
        return 0;
    }

    auto* payloadObj = payload.getDynamicObject();
    if (payloadObj == nullptr) {
        return 0;
    }

    const auto kind = payloadObj->getProperty("kind").toString().toStdString();
    const auto shaderLanguage = payloadObj->getProperty("shaderLanguage").toString().toStdString();
    const auto sourceType = payloadObj->getProperty("sourceType").toString().toStdString();
    const auto sourceId = payloadObj->getProperty("sourceId").toString().toStdString();
    if (!kind.empty() && kind != "shaderQuad") {
        return 0;
    }
    if (!shaderLanguage.empty() && shaderLanguage != "glsl") {
        return 0;
    }
    if (!sourceType.empty() && sourceType != "video_input" && sourceType != "generated_source" && sourceType != "generator_shader" && sourceType != "node_surface") {
        return 0;
    }

    auto& state = impl.states[node.getStableId()];
    if (!state) {
        state = std::make_unique<SurfaceState>();
    }

    std::vector<ParsedPassConfig> parsedPasses;
    auto appendParsedPass = [&](const juce::var& passVar) {
        ParsedPassConfig parsedPass;
        std::string parseError;
        if (!parsePassConfig(passVar, parsedPass, parseError)) {
            state->lastError = parseError;
            return false;
        }
        parsedPasses.push_back(std::move(parsedPass));
        return true;
    };

    ParsedSourceConfig parsedSource;
    bool hasParsedSource = false;

    state->lastError.clear();
    if (sourceType == "generator_shader") {
        if (!parseSourceConfig(payloadObj->getProperty("sourceShader"), parsedSource, state->lastError)) {
            return 0;
        }
        hasParsedSource = true;
    }

    if (auto* passes = payloadObj->getProperty("passes").getArray(); passes != nullptr && !passes->isEmpty()) {
        parsedPasses.reserve(static_cast<std::size_t>(passes->size()));
        for (const auto& passVar : *passes) {
            if (!appendParsedPass(passVar)) {
                break;
            }
        }
    } else {
        appendParsedPass(payload);
    }

    if (parsedPasses.empty() || !state->lastError.empty()) {
        return 0;
    }

    const auto descriptorSignature = buildDescriptorSignature(surfaceType, sourceType, parsedPasses, hasParsedSource ? &parsedSource : nullptr);
    const bool descriptorChanged = state->surfaceType != surfaceType || state->payloadSignature != descriptorSignature;
    if (descriptorChanged) {
        releaseShaderSurfacePass(state->sourcePass);
        state->usesGeneratedSource = false;
        state->sourceId.clear();
        for (auto& pass : state->passes) {
            releaseShaderSurfacePass(pass);
        }
        state->passes.clear();
        if (state->feedbackTex != 0) {
            glDeleteTextures(1, &state->feedbackTex);
            state->feedbackTex = 0;
            state->feedbackWidth = 0;
            state->feedbackHeight = 0;
        }
        state->surfaceType = surfaceType;
        state->payloadSignature = descriptorSignature;
        state->sourceType = sourceType;
        state->sourceId = sourceId;
        state->debugLogged = false;
        state->lastError.clear();

        if (hasParsedSource) {
            initializeSourceResources(state->sourcePass, parsedSource);
            if (!buildSurfaceProgram(state->sourcePass, state->lastError)) {
                releaseShaderSurfacePass(state->sourcePass);
            } else {
                state->usesGeneratedSource = true;
            }
        }

        if (state->lastError.empty()) {
            for (const auto& parsedPass : parsedPasses) {
                PassResources pass;
                initializePassResources(pass, parsedPass);
                if (!buildSurfaceProgram(pass, state->lastError)) {
                    releaseShaderSurfacePass(pass);
                    break;
                }
                if (pass.composite && !pass.blendOpId.empty()) {
                    const auto blendOpSource = manifold::shaders::ShaderEffectRegistry::instance().fragmentShaderForBlendOp(pass.blendOpId);
                    if (!blendOpSource.empty()) {
                        PassResources blendOpPass;
                        blendOpPass.vertexSource = pass.vertexSource;
                        blendOpPass.fragmentSource = blendOpSource;
                        if (buildSurfaceProgram(blendOpPass, state->lastError)) {
                            pass.blendOpProgram = blendOpPass.program;
                            blendOpPass.program = 0;
                        } else {
                            releaseShaderSurfacePass(blendOpPass);
                            state->lastError = "failed to compile blend op '" + pass.blendOpId + "': " + state->lastError;
                        }
                    } else {
                        state->lastError = "unknown blend op: " + pass.blendOpId;
                    }
                }
                if (!state->lastError.empty()) {
                    releaseShaderSurfacePass(pass);
                    break;
                }
                state->passes.push_back(std::move(pass));
            }
        }

        if (state->passes.size() != parsedPasses.size() || !state->lastError.empty()) {
            if (!state->lastError.empty()) {
                juce::Logger::writeToLog("[ShaderSurfaceProvider] rebuild failed for node " + juce::String((long long) node.getStableId()) + ": " + juce::String(state->lastError));
            }
            impl.recalculateOwnedGpuBytes();
            return 0;
        }
        state->width = 0;
        state->height = 0;
    }

    if (state->passes.empty() || !state->lastError.empty()) {
        if (!state->lastError.empty()) {
            juce::Logger::writeToLog("[ShaderSurfaceProvider] prepare aborted for node " + juce::String((long long) node.getStableId()) + ": " + juce::String(state->lastError));
        }
        return 0;
    }

    if (state->passes.size() != parsedPasses.size()) {
        state->lastError = "shader pass count mismatch";
        juce::Logger::writeToLog("[ShaderSurfaceProvider] prepare aborted for node " + juce::String((long long) node.getStableId()) + ": " + juce::String(state->lastError));
        return 0;
    }

    state->sourceType = sourceType;
    state->sourceId = sourceId;
    if (hasParsedSource && state->usesGeneratedSource) {
        updateSourceRuntimeState(state->sourcePass, parsedSource);
    }
    for (std::size_t i = 0; i < parsedPasses.size(); ++i) {
        updatePassRuntimeState(state->passes[i], parsedPasses[i]);
    }

    ResolvedInputTexture resolvedSource;
    if (!state->sourceType.empty() && state->sourceType != "generator_shader") {
        if (!impl.inputResolver) {
            return 0;
        }
        resolvedSource = impl.inputResolver(state->sourceType, state->sourceId, node, width, height, timeSeconds);
        if (resolvedSource.textureHandle == 0 || resolvedSource.width <= 0 || resolvedSource.height <= 0) {
            return 0;
        }
        state->sourceTexture = static_cast<unsigned int>(resolvedSource.textureHandle);
        state->sourceWidth = resolvedSource.width;
        state->sourceHeight = resolvedSource.height;
        state->sourceSequence = resolvedSource.sequence;
    } else if (state->sourceType == "generator_shader") {
        state->sourceTexture = state->sourcePass.colorTex;
        state->sourceWidth = width;
        state->sourceHeight = height;
        state->sourceSequence = 0;
    } else {
        state->sourceTexture = 0;
        state->sourceWidth = width;
        state->sourceHeight = height;
        state->sourceSequence = 0;
    }

    const int targetWidth = state->sourceType.empty() ? width : std::max(1, state->sourceWidth);
    const int targetHeight = state->sourceType.empty() ? height : std::max(1, state->sourceHeight);

    if (state->width != targetWidth || state->height != targetHeight) {
        state->lastError.clear();
        if (state->usesGeneratedSource) {
            if (state->sourcePass.depthRbo != 0) {
                glDeleteRenderbuffers(1, &state->sourcePass.depthRbo);
                state->sourcePass.depthRbo = 0;
            }
            if (state->sourcePass.colorTex != 0) {
                glDeleteTextures(1, &state->sourcePass.colorTex);
                state->sourcePass.colorTex = 0;
            }
            if (state->sourcePass.fbo != 0) {
                glDeleteFramebuffers(1, &state->sourcePass.fbo);
                state->sourcePass.fbo = 0;
            }
            if (!createSurfaceTarget(state->sourcePass, targetWidth, targetHeight, state->lastError)) {
                if (!state->lastError.empty()) {
                    juce::Logger::writeToLog("[ShaderSurfaceProvider] source target creation failed for node " + juce::String((long long) node.getStableId()) + ": " + juce::String(state->lastError));
                }
                impl.recalculateOwnedGpuBytes();
                return 0;
            }
        }
        for (auto& pass : state->passes) {
            if (pass.depthRbo != 0) {
                glDeleteRenderbuffers(1, &pass.depthRbo);
                pass.depthRbo = 0;
            }
            if (pass.colorTex != 0) {
                glDeleteTextures(1, &pass.colorTex);
                pass.colorTex = 0;
            }
            if (pass.fbo != 0) {
                glDeleteFramebuffers(1, &pass.fbo);
                pass.fbo = 0;
            }
            if (!createSurfaceTarget(pass, targetWidth, targetHeight, state->lastError)) {
                if (!state->lastError.empty()) {
                    juce::Logger::writeToLog("[ShaderSurfaceProvider] pass target creation failed for node " + juce::String((long long) node.getStableId()) + ": " + juce::String(state->lastError));
                }
                impl.recalculateOwnedGpuBytes();
                return 0;
            }
        }
        if (state->compositeFbo != 0) {
            glDeleteFramebuffers(1, &state->compositeFbo);
            state->compositeFbo = 0;
        }
        if (state->compositeTex != 0) {
            glDeleteTextures(1, &state->compositeTex);
            state->compositeTex = 0;
        }
        state->width = targetWidth;
        state->height = targetHeight;
        impl.recalculateOwnedGpuBytes();
    }

    if (!impl.ensureSurfaceQuadGeometry()) {
        return 0;
    }

    glDisable(GL_SCISSOR_TEST);
    glBindVertexArray(impl.quadVao);

    if (state->usesGeneratedSource) {
        glBindFramebuffer(GL_FRAMEBUFFER, state->sourcePass.fbo);
        glViewport(0, 0, targetWidth, targetHeight);
        glDisable(GL_DEPTH_TEST);
        glClearColor(state->sourcePass.clearColor[0], state->sourcePass.clearColor[1], state->sourcePass.clearColor[2], state->sourcePass.clearColor[3]);
        glClear(GL_COLOR_BUFFER_BIT);

        glUseProgram(state->sourcePass.program);
        applySurfaceUniformBlock(state->sourcePass.program, state->sourcePass.uniforms);

        const auto timeLoc = glGetUniformLocation(state->sourcePass.program, UniformContract::kTime);
        if (timeLoc >= 0) {
            glUniform1f(timeLoc, static_cast<float>(timeSeconds));
        }
        const auto resolutionLoc = glGetUniformLocation(state->sourcePass.program, UniformContract::kResolution);
        if (resolutionLoc >= 0) {
            glUniform2f(resolutionLoc, static_cast<float>(targetWidth), static_cast<float>(targetHeight));
        }
        const auto aspectLoc = glGetUniformLocation(state->sourcePass.program, UniformContract::kAspect);
        if (aspectLoc >= 0) {
            glUniform1f(aspectLoc, targetHeight > 0 ? static_cast<float>(targetWidth) / static_cast<float>(targetHeight) : 1.0f);
        }
        glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_SHORT, nullptr);
        state->sourceTexture = state->sourcePass.colorTex;
    }

    const unsigned int sourceTexture = state->sourceTexture;
    unsigned int prevTexture = sourceTexture;
    for (auto& pass : state->passes) {
        glBindFramebuffer(GL_FRAMEBUFFER, pass.fbo);
        glViewport(0, 0, targetWidth, targetHeight);
        if (pass.enableDepth) {
            glEnable(GL_DEPTH_TEST);
            glClear(GL_DEPTH_BUFFER_BIT);
        } else {
            glDisable(GL_DEPTH_TEST);
        }
        glClearColor(pass.clearColor[0], pass.clearColor[1], pass.clearColor[2], pass.clearColor[3]);
        GLbitfield clearMask = GL_COLOR_BUFFER_BIT;
        if (pass.enableDepth) {
            clearMask |= GL_DEPTH_BUFFER_BIT;
        }
        glClear(clearMask);

        glUseProgram(pass.program);
        applySurfaceUniformBlock(pass.program, pass.uniforms);

        const auto timeLoc = glGetUniformLocation(pass.program, UniformContract::kTime);
        if (timeLoc >= 0) {
            glUniform1f(timeLoc, static_cast<float>(timeSeconds));
        }
        const auto resolutionLoc = glGetUniformLocation(pass.program, UniformContract::kResolution);
        if (resolutionLoc >= 0) {
            glUniform2f(resolutionLoc, static_cast<float>(targetWidth), static_cast<float>(targetHeight));
        }
        const auto blendLoc = glGetUniformLocation(pass.program, UniformContract::kBlendMode);
        if (blendLoc >= 0) {
            glUniform1i(blendLoc, pass.blendMode);
        }
        const auto opacityLoc = glGetUniformLocation(pass.program, UniformContract::kOpacity);
        if (opacityLoc >= 0) {
            glUniform1f(opacityLoc, pass.opacity);
        }

        const unsigned int inputTexture = pass.composite ? sourceTexture : (pass.chain ? prevTexture : sourceTexture);
        if (inputTexture != 0) {
            const auto inputLoc = glGetUniformLocation(pass.program, pass.inputTextureUniform.c_str());
            if (inputLoc >= 0) {
                glActiveTexture(GL_TEXTURE0);
                glBindTexture(GL_TEXTURE_2D, inputTexture);
                glUniform1i(inputLoc, 0);
            }
        }
        if (prevTexture != 0) {
            const auto prevLoc = glGetUniformLocation(pass.program, pass.prevTextureUniform.c_str());
            if (prevLoc >= 0) {
                glActiveTexture(GL_TEXTURE1);
                glBindTexture(GL_TEXTURE_2D, prevTexture);
                glUniform1i(prevLoc, 1);
            }
        }
        if (state->feedbackTex != 0) {
            const auto feedbackLoc = glGetUniformLocation(pass.program, UniformContract::kFeedbackTex);
            if (feedbackLoc >= 0) {
                glActiveTexture(GL_TEXTURE2);
                glBindTexture(GL_TEXTURE_2D, state->feedbackTex);
                glUniform1i(feedbackLoc, 2);
            }
        }

        glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_SHORT, nullptr);
        glActiveTexture(GL_TEXTURE2);
        glBindTexture(GL_TEXTURE_2D, 0);
        glActiveTexture(GL_TEXTURE1);
        glBindTexture(GL_TEXTURE_2D, 0);
        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D, 0);

        if (pass.composite && pass.blendOpProgram != 0) {
            // Ensure composite FBO exists
            if (state->compositeFbo == 0 || state->compositeTex == 0) {
                glGenTextures(1, &state->compositeTex);
                glBindTexture(GL_TEXTURE_2D, state->compositeTex);
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
                glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, targetWidth, targetHeight, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
                glGenFramebuffers(1, &state->compositeFbo);
                glBindFramebuffer(GL_FRAMEBUFFER, state->compositeFbo);
                glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, state->compositeTex, 0);
                glBindFramebuffer(GL_FRAMEBUFFER, 0);
                impl.recalculateOwnedGpuBytes();
            }

            glBindFramebuffer(GL_FRAMEBUFFER, state->compositeFbo);
            glViewport(0, 0, targetWidth, targetHeight);
            glDisable(GL_DEPTH_TEST);
            glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
            glClear(GL_COLOR_BUFFER_BIT);

            glUseProgram(pass.blendOpProgram);
            applySurfaceUniformBlock(pass.blendOpProgram, pass.blendParams);

            const auto blendOpacityLoc = glGetUniformLocation(pass.blendOpProgram, UniformContract::kOpacity);
            if (blendOpacityLoc >= 0) {
                glUniform1f(blendOpacityLoc, pass.opacity);
            }

            if (prevTexture != 0) {
                const auto baseLoc = glGetUniformLocation(pass.blendOpProgram, UniformContract::kBaseTex);
                if (baseLoc >= 0) {
                    glActiveTexture(GL_TEXTURE0);
                    glBindTexture(GL_TEXTURE_2D, prevTexture);
                    glUniform1i(baseLoc, 0);
                }
            }
            if (pass.colorTex != 0) {
                const auto blendTexLoc = glGetUniformLocation(pass.blendOpProgram, UniformContract::kBlendTex);
                if (blendTexLoc >= 0) {
                    glActiveTexture(GL_TEXTURE1);
                    glBindTexture(GL_TEXTURE_2D, pass.colorTex);
                    glUniform1i(blendTexLoc, 1);
                }
            }

            glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_SHORT, nullptr);
            glActiveTexture(GL_TEXTURE1);
            glBindTexture(GL_TEXTURE_2D, 0);
            glActiveTexture(GL_TEXTURE0);
            glBindTexture(GL_TEXTURE_2D, 0);

            prevTexture = state->compositeTex;
        } else {
            prevTexture = pass.colorTex;
        }
    }

    if (!state->passes.empty()) {
        const auto finalTex = state->passes.back().colorTex;
        if (finalTex != 0) {
            glBindFramebuffer(GL_FRAMEBUFFER, state->passes.back().fbo);
            if (state->sourceType.empty() && !state->debugLogged) {
                unsigned char pixel[4] = { 0, 0, 0, 0 };
                glReadPixels(0, 0, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, pixel);
                std::fprintf(stderr,
                    "[ShaderSurfaceProvider] generator sample rgba=%d,%d,%d,%d\n",
                    (int) pixel[0], (int) pixel[1], (int) pixel[2], (int) pixel[3]);
                std::fflush(stderr);
                state->debugLogged = true;
            }
            if (state->feedbackTex == 0 || state->feedbackWidth != targetWidth || state->feedbackHeight != targetHeight) {
                if (state->feedbackTex != 0) {
                    glDeleteTextures(1, &state->feedbackTex);
                }
                glGenTextures(1, &state->feedbackTex);
                glBindTexture(GL_TEXTURE_2D, state->feedbackTex);
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
                glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
                glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, targetWidth, targetHeight, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);
                state->feedbackWidth = targetWidth;
                state->feedbackHeight = targetHeight;
                impl.recalculateOwnedGpuBytes();
            }
            glBindTexture(GL_TEXTURE_2D, state->feedbackTex);
            glCopyTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, 0, 0, targetWidth, targetHeight);
            glBindTexture(GL_TEXTURE_2D, 0);
        }
    }

    glBindVertexArray(0);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glUseProgram(0);
    glDisable(GL_DEPTH_TEST);

    return state->passes.empty() ? 0 : static_cast<std::uintptr_t>(state->passes.back().colorTex);
}

bool ShaderSurfaceProvider::getSurfaceInfo(uint64_t stableId, int& w, int& h, uint64_t& seq) const {
    const auto& impl = *pImpl_;
    const auto it = impl.states.find(stableId);
    if (it == impl.states.end() || !it->second) {
        return false;
    }

    w = it->second->sourceWidth;
    h = it->second->sourceHeight;
    seq = it->second->sourceSequence;
    return w > 0 && h > 0;
}

void ShaderSurfaceProvider::prune(const std::unordered_set<uint64_t>& touchedStableIds) {
    auto& impl = *pImpl_;
    for (auto it = impl.states.begin(); it != impl.states.end();) {
        if (touchedStableIds.find(it->first) != touchedStableIds.end()) {
            ++it;
            continue;
        }

        if (it->second) {
            releaseShaderSurfacePass(it->second->sourcePass);
            for (auto& pass : it->second->passes) {
                releaseShaderSurfacePass(pass);
            }
            if (it->second->feedbackTex != 0) {
                glDeleteTextures(1, &it->second->feedbackTex);
                it->second->feedbackTex = 0;
            }
            if (it->second->compositeFbo != 0) {
                glDeleteFramebuffers(1, &it->second->compositeFbo);
                it->second->compositeFbo = 0;
            }
            if (it->second->compositeTex != 0) {
                glDeleteTextures(1, &it->second->compositeTex);
                it->second->compositeTex = 0;
            }
        }
        it = impl.states.erase(it);
    }
    impl.recalculateOwnedGpuBytes();
}

void ShaderSurfaceProvider::releaseAll() {
    auto& impl = *pImpl_;
    for (auto& [_, state] : impl.states) {
        if (!state) {
            continue;
        }
        releaseShaderSurfacePass(state->sourcePass);
        for (auto& pass : state->passes) {
            releaseShaderSurfacePass(pass);
        }
        state->passes.clear();
        if (state->feedbackTex != 0) {
            glDeleteTextures(1, &state->feedbackTex);
            state->feedbackTex = 0;
        }
        if (state->compositeFbo != 0) {
            glDeleteFramebuffers(1, &state->compositeFbo);
            state->compositeFbo = 0;
        }
        if (state->compositeTex != 0) {
            glDeleteTextures(1, &state->compositeTex);
            state->compositeTex = 0;
        }
    }
    impl.states.clear();
    impl.releaseSurfaceQuadGeometry();
    impl.recalculateOwnedGpuBytes();
}

void ShaderSurfaceProvider::setInputResolver(InputResolver resolver) {
    pImpl_->inputResolver = std::move(resolver);
}

int64_t ShaderSurfaceProvider::estimateStateBytes() const {
    const auto& impl = *pImpl_;
    int64_t total = static_cast<int64_t>(impl.states.size()) * static_cast<int64_t>(sizeof(std::pair<const uint64_t, std::unique_ptr<SurfaceState>>));
    for (const auto& [_, state] : impl.states) {
        if (!state) {
            continue;
        }
        total += static_cast<int64_t>(sizeof(SurfaceState));
        total += static_cast<int64_t>(state->surfaceType.capacity());
        total += static_cast<int64_t>(state->payloadSignature.capacity());
        total += static_cast<int64_t>(state->sourceType.capacity());
        total += static_cast<int64_t>(state->sourceId.capacity());
        total += static_cast<int64_t>(state->lastError.capacity());
        total += static_cast<int64_t>(sizeof(PassResources));
        total += static_cast<int64_t>(state->sourcePass.vertexSource.capacity());
        total += static_cast<int64_t>(state->sourcePass.fragmentSource.capacity());
        total += static_cast<int64_t>(state->passes.capacity()) * static_cast<int64_t>(sizeof(PassResources));
        for (const auto& pass : state->passes) {
            total += static_cast<int64_t>(pass.vertexSource.capacity());
            total += static_cast<int64_t>(pass.fragmentSource.capacity());
            total += static_cast<int64_t>(pass.inputTextureUniform.capacity());
            total += static_cast<int64_t>(pass.prevTextureUniform.capacity());
        }
    }
    return total;
}

void ShaderSurfaceProvider::getOwnedGpuBytes(int64_t& colorBytes, int64_t& depthBytes) const {
    colorBytes = pImpl_->colorBytes;
    depthBytes = pImpl_->depthBytes;
}

} // namespace manifold::shaders
