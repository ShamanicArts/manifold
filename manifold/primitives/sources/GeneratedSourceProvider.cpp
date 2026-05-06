#include "GeneratedSourceProvider.h"

#include "GeneratedSourceSupport.h"
#include "../shaders/ShaderEffectRegistry.h"
#include "../shaders/UniformContract.h"

#include <juce_core/juce_core.h>
#include <juce_opengl/juce_opengl.h>

#include <algorithm>
#include <array>
#include <memory>
#include <string>
#include <unordered_map>
#include <utility>

using namespace juce::gl;

namespace manifold::sources {
namespace {

namespace source_support = manifold::sources::generated_source_support;

void applyUniformValue(int location, const juce::var& value) {
    if (location < 0) {
        return;
    }
    if (source_support::varIsNumber(value)) {
        glUniform1f(location, static_cast<float>(source_support::varToDoubleValue(value)));
        return;
    }
    if (auto* arr = value.getArray(); arr != nullptr) {
        if (arr->size() == 2) {
            glUniform2f(location,
                        static_cast<float>(source_support::varToDoubleValue(arr->getReference(0))),
                        static_cast<float>(source_support::varToDoubleValue(arr->getReference(1))));
        } else if (arr->size() == 3) {
            glUniform3f(location,
                        static_cast<float>(source_support::varToDoubleValue(arr->getReference(0))),
                        static_cast<float>(source_support::varToDoubleValue(arr->getReference(1))),
                        static_cast<float>(source_support::varToDoubleValue(arr->getReference(2))));
        } else if (arr->size() >= 4) {
            glUniform4f(location,
                        static_cast<float>(source_support::varToDoubleValue(arr->getReference(0))),
                        static_cast<float>(source_support::varToDoubleValue(arr->getReference(1))),
                        static_cast<float>(source_support::varToDoubleValue(arr->getReference(2))),
                        static_cast<float>(source_support::varToDoubleValue(arr->getReference(3))));
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

struct SourceResources {
    unsigned int program = 0;
    unsigned int fbo = 0;
    unsigned int colorTex = 0;
    std::string vertexSource;
    std::string fragmentSource;
    juce::var uniforms;
    std::array<float, 4> clearColor { 0.0f, 0.0f, 0.0f, 1.0f };
    std::string signature;
    int width = 0;
    int height = 0;
    uint64_t sequence = 0;
};

void releaseSourceResources(SourceResources& source) {
    if (source.program != 0) {
        glDeleteProgram(source.program);
        source.program = 0;
    }
    if (source.colorTex != 0) {
        glDeleteTextures(1, &source.colorTex);
        source.colorTex = 0;
    }
    if (source.fbo != 0) {
        glDeleteFramebuffers(1, &source.fbo);
        source.fbo = 0;
    }
    source.width = 0;
    source.height = 0;
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

bool buildProgram(SourceResources& source, std::string& errorOut) {
    unsigned int vertexShader = 0;
    unsigned int fragmentShader = 0;
    if (!compileShader(vertexShader, GL_VERTEX_SHADER, source.vertexSource, errorOut)) {
        return false;
    }
    if (!compileShader(fragmentShader, GL_FRAGMENT_SHADER, source.fragmentSource, errorOut)) {
        glDeleteShader(vertexShader);
        return false;
    }

    source.program = glCreateProgram();
    if (source.program == 0) {
        glDeleteShader(vertexShader);
        glDeleteShader(fragmentShader);
        errorOut = "glCreateProgram failed";
        return false;
    }

    glAttachShader(source.program, vertexShader);
    glAttachShader(source.program, fragmentShader);
    glBindAttribLocation(source.program, 0, "aPos");
    glBindAttribLocation(source.program, 1, "aUv");
    glLinkProgram(source.program);

    GLint linkStatus = GL_FALSE;
    glGetProgramiv(source.program, GL_LINK_STATUS, &linkStatus);
    glDeleteShader(vertexShader);
    glDeleteShader(fragmentShader);
    if (linkStatus == GL_TRUE) {
        return true;
    }

    GLint logLength = 0;
    glGetProgramiv(source.program, GL_INFO_LOG_LENGTH, &logLength);
    std::string log;
    if (logLength > 1) {
        log.resize(static_cast<std::size_t>(logLength));
        glGetProgramInfoLog(source.program, logLength, nullptr, log.data());
    }
    glDeleteProgram(source.program);
    source.program = 0;
    errorOut = log.empty() ? "program link failed" : log;
    return false;
}

bool createTarget(SourceResources& source, int width, int height, std::string& errorOut) {
    glGenTextures(1, &source.colorTex);
    if (source.colorTex == 0) {
        errorOut = "glGenTextures failed";
        return false;
    }
    glBindTexture(GL_TEXTURE_2D, source.colorTex);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, nullptr);

    glGenFramebuffers(1, &source.fbo);
    if (source.fbo == 0) {
        errorOut = "glGenFramebuffers failed";
        return false;
    }
    glBindFramebuffer(GL_FRAMEBUFFER, source.fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, source.colorTex, 0);
    const auto status = glCheckFramebufferStatus(GL_FRAMEBUFFER);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    if (status != GL_FRAMEBUFFER_COMPLETE) {
        errorOut = "framebuffer incomplete";
        return false;
    }

    source.width = width;
    source.height = height;
    return true;
}

} // namespace

struct GeneratedSourceProvider::Impl {
    std::unordered_map<uint64_t, std::unique_ptr<SourceResources>> states;
    unsigned int quadVao = 0;
    unsigned int quadVbo = 0;
    unsigned int quadIbo = 0;
    int64_t colorBytes = 0;
    int64_t depthBytes = 0;

    bool ensureQuadGeometry() {
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

    void releaseQuadGeometry() {
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
            if (state->colorTex != 0 && state->width > 0 && state->height > 0) {
                colorBytes += static_cast<int64_t>(state->width) * static_cast<int64_t>(state->height) * 4;
            }
        }
    }
};

GeneratedSourceProvider::GeneratedSourceProvider()
    : pImpl_(std::make_unique<Impl>()) {
}

GeneratedSourceProvider::~GeneratedSourceProvider() {
    releaseAll();
}

bool GeneratedSourceProvider::handlesType(const std::string& surfaceType) const {
    return surfaceType == "generated_source";
}

std::uintptr_t GeneratedSourceProvider::prepareTexture(const RuntimeNode& node,
                                                       int width,
                                                       int height,
                                                       double timeSeconds) {
    if (node.getStableId() == 0 || width <= 0 || height <= 0) {
        return 0;
    }

    auto& impl = *pImpl_;
    source_support::ParsedSourceDescriptor descriptor;
    std::string error;
    if (!source_support::parseSourceDescriptor(node.getCustomSurfaceType(),
                                               node.getCustomRenderPayload(),
                                               descriptor,
                                               error)) {
        std::fprintf(stderr, "[GeneratedSourceProvider] descriptor failed: %s\n", error.c_str());
        std::fflush(stderr);
        return 0;
    }

    auto& state = impl.states[node.getStableId()];
    if (!state) {
        state = std::make_unique<SourceResources>();
    }

    if (state->signature != descriptor.signature) {
        releaseSourceResources(*state);
        state->signature = descriptor.signature;
        state->vertexSource = descriptor.vertexSource;
        state->fragmentSource = descriptor.fragmentSource;
        state->uniforms = descriptor.uniforms.clone();
        state->clearColor = descriptor.clearColor;
        std::string buildError;
        if (!buildProgram(*state, buildError)) {
            std::fprintf(stderr, "[GeneratedSourceProvider] build failed: %s\n", buildError.c_str());
            std::fflush(stderr);
            return 0;
        }
    } else {
        state->uniforms = descriptor.uniforms.clone();
        state->clearColor = descriptor.clearColor;
    }

    if (state->width != width || state->height != height || state->fbo == 0 || state->colorTex == 0) {
        if (state->colorTex != 0) {
            glDeleteTextures(1, &state->colorTex);
            state->colorTex = 0;
        }
        if (state->fbo != 0) {
            glDeleteFramebuffers(1, &state->fbo);
            state->fbo = 0;
        }
        std::string targetError;
        if (!createTarget(*state, width, height, targetError)) {
            std::fprintf(stderr, "[GeneratedSourceProvider] target failed: %s\n", targetError.c_str());
            std::fflush(stderr);
            return 0;
        }
        impl.recalculateOwnedGpuBytes();
    }

    if (!impl.ensureQuadGeometry()) {
        return 0;
    }

    glDisable(GL_SCISSOR_TEST);
    glDisable(GL_DEPTH_TEST);
    glBindVertexArray(impl.quadVao);
    glBindFramebuffer(GL_FRAMEBUFFER, state->fbo);
    glViewport(0, 0, width, height);
    glClearColor(state->clearColor[0], state->clearColor[1], state->clearColor[2], state->clearColor[3]);
    glClear(GL_COLOR_BUFFER_BIT);

    glUseProgram(state->program);
    applyUniformBlock(state->program, state->uniforms);

    const auto timeLoc = glGetUniformLocation(state->program, manifold::shaders::UniformContract::kTime);
    if (timeLoc >= 0) {
        glUniform1f(timeLoc, static_cast<float>(timeSeconds));
    }
    const auto resolutionLoc = glGetUniformLocation(state->program, manifold::shaders::UniformContract::kResolution);
    if (resolutionLoc >= 0) {
        glUniform2f(resolutionLoc, static_cast<float>(width), static_cast<float>(height));
    }
    const auto aspectLoc = glGetUniformLocation(state->program, manifold::shaders::UniformContract::kAspect);
    if (aspectLoc >= 0) {
        glUniform1f(aspectLoc, height > 0 ? static_cast<float>(width) / static_cast<float>(height) : 1.0f);
    }

    glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_SHORT, nullptr);
    glBindVertexArray(0);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glUseProgram(0);

    ++state->sequence;
    return static_cast<std::uintptr_t>(state->colorTex);
}

bool GeneratedSourceProvider::getSurfaceInfo(uint64_t stableId, int& w, int& h, uint64_t& seq) const {
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

void GeneratedSourceProvider::prune(const std::unordered_set<uint64_t>& touchedStableIds) {
    auto& impl = *pImpl_;
    for (auto it = impl.states.begin(); it != impl.states.end();) {
        if (touchedStableIds.find(it->first) != touchedStableIds.end()) {
            ++it;
            continue;
        }
        if (it->second) {
            releaseSourceResources(*it->second);
        }
        it = impl.states.erase(it);
    }
    impl.recalculateOwnedGpuBytes();
}

void GeneratedSourceProvider::releaseAll() {
    auto& impl = *pImpl_;
    for (auto& [_, state] : impl.states) {
        if (state) {
            releaseSourceResources(*state);
        }
    }
    impl.states.clear();
    impl.releaseQuadGeometry();
    impl.recalculateOwnedGpuBytes();
}

int64_t GeneratedSourceProvider::estimateStateBytes() const {
    const auto& impl = *pImpl_;
    int64_t total = static_cast<int64_t>(impl.states.size()) * static_cast<int64_t>(sizeof(std::pair<const uint64_t, std::unique_ptr<SourceResources>>));
    for (const auto& [_, state] : impl.states) {
        if (!state) {
            continue;
        }
        total += static_cast<int64_t>(sizeof(SourceResources));
        total += static_cast<int64_t>(state->vertexSource.capacity());
        total += static_cast<int64_t>(state->fragmentSource.capacity());
        total += static_cast<int64_t>(state->signature.capacity());
    }
    return total;
}

void GeneratedSourceProvider::getOwnedGpuBytes(int64_t& colorBytes, int64_t& depthBytes) const {
    colorBytes = pImpl_->colorBytes;
    depthBytes = pImpl_->depthBytes;
}

} // namespace manifold::sources
