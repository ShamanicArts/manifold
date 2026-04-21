#include "CompositeSurfaceProvider.h"

#include "../shaders/ShaderEffectRegistry.h"
#include "../shaders/UniformContract.h"
#include "../ui/RuntimeNode.h"

#include <juce_core/juce_core.h>
#include <juce_opengl/juce_opengl.h>

#include <algorithm>
#include <array>
#include <memory>
#include <string>
#include <unordered_map>

using namespace juce::gl;

namespace manifold::composite {
namespace {

bool varIsNumber(const juce::var& value) {
    return value.isInt() || value.isInt64() || value.isDouble() || value.isBool();
}

double varToDoubleValue(const juce::var& value, double fallback = 0.0) {
    if (value.isVoid() || value.isUndefined()) {
        return fallback;
    }
    if (value.isBool()) {
        return static_cast<bool>(value) ? 1.0 : 0.0;
    }
    return static_cast<double>(value);
}

void applyUniformValue(int location, const juce::var& value) {
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

void applyUniformBlock(unsigned int program, const juce::var& uniforms) {
    if (auto* obj = uniforms.getDynamicObject(); obj != nullptr) {
        for (const auto& property : obj->getProperties()) {
            const auto location = glGetUniformLocation(program, property.name.toString().toRawUTF8());
            applyUniformValue(location, property.value);
        }
    }
}

struct SurfaceState {
    unsigned int program = 0;
    unsigned int fbo = 0;
    unsigned int colorTex = 0;
    unsigned int quadVao = 0;
    unsigned int quadVbo = 0;
    unsigned int quadIbo = 0;
    std::string signature;
    std::string vertexSource;
    std::string fragmentSource;
    std::string bottomNodeId;
    std::string topNodeId;
    juce::var blendParams;
    float opacity = 1.0f;
    int width = 0;
    int height = 0;
    uint64_t sequence = 0;
    std::string lastError;
};

void releaseSurfaceState(SurfaceState& state) {
    if (state.program != 0) {
        glDeleteProgram(state.program);
        state.program = 0;
    }
    if (state.colorTex != 0) {
        glDeleteTextures(1, &state.colorTex);
        state.colorTex = 0;
    }
    if (state.fbo != 0) {
        glDeleteFramebuffers(1, &state.fbo);
        state.fbo = 0;
    }
    if (state.quadVao != 0) {
        glDeleteVertexArrays(1, &state.quadVao);
        state.quadVao = 0;
    }
    if (state.quadVbo != 0) {
        glDeleteBuffers(1, &state.quadVbo);
        state.quadVbo = 0;
    }
    if (state.quadIbo != 0) {
        glDeleteBuffers(1, &state.quadIbo);
        state.quadIbo = 0;
    }
    state.width = 0;
    state.height = 0;
    state.sequence = 0;
}

bool compileShader(unsigned int& shaderOut, GLenum type, const std::string& source, std::string& errorOut) {
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

bool buildProgram(SurfaceState& state, std::string& errorOut) {
    unsigned int vertexShader = 0;
    unsigned int fragmentShader = 0;
    if (!compileShader(vertexShader, GL_VERTEX_SHADER, state.vertexSource, errorOut)) {
        return false;
    }
    if (!compileShader(fragmentShader, GL_FRAGMENT_SHADER, state.fragmentSource, errorOut)) {
        glDeleteShader(vertexShader);
        return false;
    }

    state.program = glCreateProgram();
    if (state.program == 0) {
        glDeleteShader(vertexShader);
        glDeleteShader(fragmentShader);
        errorOut = "glCreateProgram failed";
        return false;
    }

    glAttachShader(state.program, vertexShader);
    glAttachShader(state.program, fragmentShader);
    glBindAttribLocation(state.program, 0, "aPos");
    glBindAttribLocation(state.program, 1, "aUv");
    glLinkProgram(state.program);

    GLint linkStatus = GL_FALSE;
    glGetProgramiv(state.program, GL_LINK_STATUS, &linkStatus);
    glDeleteShader(vertexShader);
    glDeleteShader(fragmentShader);
    if (linkStatus == GL_TRUE) {
        return true;
    }

    GLint logLength = 0;
    glGetProgramiv(state.program, GL_INFO_LOG_LENGTH, &logLength);
    std::string log;
    if (logLength > 1) {
        log.resize(static_cast<std::size_t>(logLength));
        glGetProgramInfoLog(state.program, logLength, nullptr, log.data());
    }
    glDeleteProgram(state.program);
    state.program = 0;
    errorOut = log.empty() ? "program link failed" : log;
    return false;
}

bool ensureQuad(SurfaceState& state) {
    if (state.quadVao != 0 && state.quadVbo != 0 && state.quadIbo != 0) {
        return true;
    }

    static constexpr float vertices[] = {
        -1.0f, -1.0f, 0.0f, 0.0f,
         1.0f, -1.0f, 1.0f, 0.0f,
         1.0f,  1.0f, 1.0f, 1.0f,
        -1.0f,  1.0f, 0.0f, 1.0f,
    };
    static constexpr unsigned short indices[] = { 0, 1, 2, 0, 2, 3 };

    glGenVertexArrays(1, &state.quadVao);
    glGenBuffers(1, &state.quadVbo);
    glGenBuffers(1, &state.quadIbo);
    if (state.quadVao == 0 || state.quadVbo == 0 || state.quadIbo == 0) {
        return false;
    }

    glBindVertexArray(state.quadVao);
    glBindBuffer(GL_ARRAY_BUFFER, state.quadVbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STATIC_DRAW);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, state.quadIbo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(indices), indices, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), nullptr);
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), reinterpret_cast<void*>(2 * sizeof(float)));
    glBindVertexArray(0);
    return true;
}

bool ensureTarget(SurfaceState& state, int width, int height, std::string& errorOut) {
    if (state.fbo != 0 && state.colorTex != 0 && state.width == width && state.height == height) {
        return true;
    }

    if (state.colorTex != 0) {
        glDeleteTextures(1, &state.colorTex);
        state.colorTex = 0;
    }
    if (state.fbo != 0) {
        glDeleteFramebuffers(1, &state.fbo);
        state.fbo = 0;
    }

    glGenTextures(1, &state.colorTex);
    if (state.colorTex == 0) {
        errorOut = "glGenTextures failed";
        return false;
    }
    glBindTexture(GL_TEXTURE_2D, state.colorTex);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);

    glGenFramebuffers(1, &state.fbo);
    if (state.fbo == 0) {
        errorOut = "glGenFramebuffers failed";
        return false;
    }
    glBindFramebuffer(GL_FRAMEBUFFER, state.fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, state.colorTex, 0);
    const auto status = glCheckFramebufferStatus(GL_FRAMEBUFFER);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    if (status != GL_FRAMEBUFFER_COMPLETE) {
        errorOut = "framebuffer incomplete";
        return false;
    }

    state.width = width;
    state.height = height;
    return true;
}

std::string buildSignature(const std::string& bottomNodeId,
                           const std::string& topNodeId,
                           const std::string& blendOpId,
                           const std::string& vertexSource,
                           const std::string& fragmentSource) {
    return "bottom=" + bottomNodeId + "\n"
        + "top=" + topNodeId + "\n"
        + "blendOp=" + blendOpId + "\n"
        + "vertex:\n" + vertexSource + "\n"
        + "fragment:\n" + fragmentSource + "\n";
}

} // namespace

struct CompositeSurfaceProvider::Impl {
    std::unordered_map<uint64_t, std::unique_ptr<SurfaceState>> states;
    NodeTextureResolver nodeTextureResolver;
    int64_t colorBytes = 0;
    int64_t depthBytes = 0;

    void recalculateOwnedGpuBytes() {
        colorBytes = 0;
        depthBytes = 0;
        for (const auto& [_, state] : states) {
            if (!state) {
                continue;
            }
            if (state->colorTex != 0 && state->width > 0 && state->height > 0) {
                colorBytes += static_cast<int64_t>(state->width) * static_cast<int64_t>(state->height) * 4;
            }
        }
    }
};

CompositeSurfaceProvider::CompositeSurfaceProvider()
    : pImpl_(std::make_unique<Impl>()) {
}

CompositeSurfaceProvider::~CompositeSurfaceProvider() {
    releaseAll();
}

bool CompositeSurfaceProvider::handlesType(const std::string& surfaceType) const {
    return surfaceType == "gpu_composite";
}

std::uintptr_t CompositeSurfaceProvider::prepareTexture(const RuntimeNode& node,
                                                        int width,
                                                        int height,
                                                        double timeSeconds) {
    if (node.getStableId() == 0 || width <= 0 || height <= 0) {
        return 0;
    }

    auto& impl = *pImpl_;
    if (!handlesType(node.getCustomSurfaceType()) || !impl.nodeTextureResolver) {
        return 0;
    }

    const auto payload = node.getCustomRenderPayload();
    auto* payloadObj = payload.getDynamicObject();
    if (payloadObj == nullptr) {
        return 0;
    }

    const auto bottomNodeId = payloadObj->getProperty("bottomNodeId").toString().toStdString();
    const auto topNodeId = payloadObj->getProperty("topNodeId").toString().toStdString();
    const auto blendOpId = payloadObj->getProperty("blendOpId").toString().toStdString();
    const auto opacityVar = payloadObj->getProperty("opacity");
    const auto opacity = (opacityVar.isDouble() || opacityVar.isInt() || opacityVar.isInt64())
        ? std::clamp(static_cast<float>(opacityVar), 0.0f, 1.0f)
        : 1.0f;
    const auto blendParams = payloadObj->getProperty("blendParams").clone();

    const auto vertexSource = manifold::shaders::ShaderEffectRegistry::instance().vertexShader();
    const auto fragmentSource = manifold::shaders::ShaderEffectRegistry::instance().fragmentShaderForBlendOp(blendOpId.empty() ? std::string("normal") : blendOpId);
    if (vertexSource.empty() || fragmentSource.empty()) {
        return 0;
    }

    auto& state = impl.states[node.getStableId()];
    if (!state) {
        state = std::make_unique<SurfaceState>();
    }

    state->bottomNodeId = bottomNodeId;
    state->topNodeId = topNodeId;
    state->blendParams = blendParams.clone();
    state->opacity = opacity;

    const auto signature = buildSignature(bottomNodeId, topNodeId, blendOpId, vertexSource, fragmentSource);
    if (state->signature != signature) {
        state->lastError.clear();
        if (state->program != 0) {
            glDeleteProgram(state->program);
            state->program = 0;
        }
        state->vertexSource = vertexSource;
        state->fragmentSource = fragmentSource;
        state->signature = signature;
        if (!buildProgram(*state, state->lastError)) {
            return 0;
        }
    }

    if (!ensureQuad(*state) || !ensureTarget(*state, width, height, state->lastError)) {
        impl.recalculateOwnedGpuBytes();
        return 0;
    }

    const auto bottomResolved = impl.nodeTextureResolver(bottomNodeId, node, width, height, timeSeconds);
    const auto topResolved = impl.nodeTextureResolver(topNodeId, node, width, height, timeSeconds);
    if (bottomResolved.textureHandle == 0 || topResolved.textureHandle == 0) {
        return 0;
    }

    glBindFramebuffer(GL_FRAMEBUFFER, state->fbo);
    glViewport(0, 0, width, height);
    glDisable(GL_DEPTH_TEST);
    glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
    glClear(GL_COLOR_BUFFER_BIT);

    glUseProgram(state->program);
    applyUniformBlock(state->program, state->blendParams);

    const auto opacityLoc = glGetUniformLocation(state->program, manifold::shaders::UniformContract::kOpacity);
    if (opacityLoc >= 0) {
        glUniform1f(opacityLoc, state->opacity);
    }
    const auto baseLoc = glGetUniformLocation(state->program, manifold::shaders::UniformContract::kBaseTex);
    if (baseLoc >= 0) {
        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D, static_cast<unsigned int>(bottomResolved.textureHandle));
        glUniform1i(baseLoc, 0);
    }
    const auto blendLoc = glGetUniformLocation(state->program, manifold::shaders::UniformContract::kBlendTex);
    if (blendLoc >= 0) {
        glActiveTexture(GL_TEXTURE1);
        glBindTexture(GL_TEXTURE_2D, static_cast<unsigned int>(topResolved.textureHandle));
        glUniform1i(blendLoc, 1);
    }

    glBindVertexArray(state->quadVao);
    glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_SHORT, nullptr);
    glBindVertexArray(0);

    glActiveTexture(GL_TEXTURE1);
    glBindTexture(GL_TEXTURE_2D, 0);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, 0);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glUseProgram(0);

    state->sequence = std::max(bottomResolved.sequence, topResolved.sequence);
    impl.recalculateOwnedGpuBytes();
    return static_cast<std::uintptr_t>(state->colorTex);
}

bool CompositeSurfaceProvider::getSurfaceInfo(uint64_t stableId, int& w, int& h, uint64_t& seq) const {
    const auto& impl = *pImpl_;
    const auto it = impl.states.find(stableId);
    if (it == impl.states.end() || !it->second) {
        return false;
    }

    w = it->second->width;
    h = it->second->height;
    seq = it->second->sequence;
    return w > 0 && h > 0;
}

void CompositeSurfaceProvider::prune(const std::unordered_set<uint64_t>& touchedStableIds) {
    auto& impl = *pImpl_;
    for (auto it = impl.states.begin(); it != impl.states.end();) {
        if (touchedStableIds.find(it->first) != touchedStableIds.end()) {
            ++it;
            continue;
        }
        if (it->second) {
            releaseSurfaceState(*it->second);
        }
        it = impl.states.erase(it);
    }
    impl.recalculateOwnedGpuBytes();
}

void CompositeSurfaceProvider::releaseAll() {
    auto& impl = *pImpl_;
    for (auto& [_, state] : impl.states) {
        if (state) {
            releaseSurfaceState(*state);
        }
    }
    impl.states.clear();
    impl.recalculateOwnedGpuBytes();
}

void CompositeSurfaceProvider::setNodeTextureResolver(NodeTextureResolver resolver) {
    pImpl_->nodeTextureResolver = std::move(resolver);
}

int64_t CompositeSurfaceProvider::estimateStateBytes() const {
    const auto& impl = *pImpl_;
    int64_t total = static_cast<int64_t>(impl.states.size()) * static_cast<int64_t>(sizeof(std::pair<const uint64_t, std::unique_ptr<SurfaceState>>));
    for (const auto& [_, state] : impl.states) {
        if (!state) {
            continue;
        }
        total += static_cast<int64_t>(sizeof(SurfaceState));
        total += static_cast<int64_t>(state->signature.capacity());
        total += static_cast<int64_t>(state->vertexSource.capacity());
        total += static_cast<int64_t>(state->fragmentSource.capacity());
        total += static_cast<int64_t>(state->bottomNodeId.capacity());
        total += static_cast<int64_t>(state->topNodeId.capacity());
        total += static_cast<int64_t>(state->lastError.capacity());
    }
    return total;
}

void CompositeSurfaceProvider::getOwnedGpuBytes(int64_t& colorBytes, int64_t& depthBytes) const {
    colorBytes = pImpl_->colorBytes;
    depthBytes = pImpl_->depthBytes;
}

} // namespace manifold::composite
