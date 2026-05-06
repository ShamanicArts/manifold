#include "LuaOpenGLBindings.h"

// sol2 requires Lua headers before inclusion
extern "C" {
#include <lauxlib.h>
#include <lua.h>
#include <lualib.h>
}

#define SOL_ALL_SAFETIES_ON 1
#include <sol/sol.hpp>

#include "../core/LuaCoreEngine.h"

#include <algorithm>
#include <array>
#include <cstdint>
#include <string>
#include <vector>

#include <juce_opengl/juce_opengl.h>

using namespace juce::gl;

namespace lua_bindings {

void registerOpenGLBindings(LuaCoreEngine& engine) {
    auto& lua = engine.getLuaState();
    auto gl = lua.create_named_table("gl");

    // Immediate mode and basic functions
    gl["clearColor"] = [](float r, float g, float b, float a) {
        glClearColor(r, g, b, a);
    };

    gl["clear"] = [](sol::optional<int> mask) {
        const int m = mask.value_or(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
        glClear(static_cast<GLbitfield>(m));
    };

    gl["viewport"] = [](int x, int y, int w, int h) { glViewport(x, y, w, h); };

    gl["enable"] = [](int cap) { glEnable(static_cast<GLenum>(cap)); };
    gl["disable"] = [](int cap) { glDisable(static_cast<GLenum>(cap)); };

    gl["blendFunc"] = [](int sfactor, int dfactor) {
        glBlendFunc(static_cast<GLenum>(sfactor), static_cast<GLenum>(dfactor));
    };

    gl["depthFunc"] = [](int func) { glDepthFunc(static_cast<GLenum>(func)); };
    gl["depthMask"] = [](bool flag) { glDepthMask(flag ? GL_TRUE : GL_FALSE); };

#ifndef __ANDROID__
    // Desktop OpenGL matrix functions (not available in OpenGL ES)
    gl["matrixMode"] = [](int mode) { glMatrixMode(static_cast<GLenum>(mode)); };
    gl["loadIdentity"] = []() { glLoadIdentity(); };
    gl["pushMatrix"] = []() { glPushMatrix(); };
    gl["popMatrix"] = []() { glPopMatrix(); };
    gl["translate"] = [](float x, float y, float z) { glTranslatef(x, y, z); };
    gl["rotate"] = [](float angle, float x, float y, float z) {
        glRotatef(angle, x, y, z);
    };
    gl["scale"] = [](float x, float y, float z) { glScalef(x, y, z); };

    // Desktop OpenGL immediate mode (not available in OpenGL ES)
    gl["begin"] = [](int mode) { glBegin(static_cast<GLenum>(mode)); };
    gl["end"] = []() { glEnd(); };
    gl["vertex2"] = [](float x, float y) { glVertex2f(x, y); };
    gl["vertex3"] = [](float x, float y, float z) { glVertex3f(x, y, z); };
    gl["color3"] = [](float r, float g, float b) { glColor3f(r, g, b); };
    gl["color4"] = [](float r, float g, float b, float a) { glColor4f(r, g, b, a); };
    gl["texCoord2"] = [](float s, float t) { glTexCoord2f(s, t); };
    gl["normal3"] = [](float x, float y, float z) { glNormal3f(x, y, z); };
#endif

    // Shader functions
    gl["createShader"] = [](int shaderType) -> unsigned int {
        return static_cast<unsigned int>(glCreateShader((GLenum)shaderType));
    };

    gl["deleteShader"] = [](unsigned int shaderId) {
        glDeleteShader(static_cast<GLuint>(shaderId));
    };

    gl["shaderSource"] = [](unsigned int shaderId, const std::string& source) {
        const char* src = source.c_str();
        GLint length = static_cast<GLint>(source.size());
        glShaderSource(static_cast<GLuint>(shaderId), 1, &src, &length);
    };

    gl["compileShader"] = [](unsigned int shaderId) {
        glCompileShader(static_cast<GLuint>(shaderId));
    };

    gl["getShaderCompileStatus"] = [](unsigned int shaderId) -> bool {
        GLint status = GL_FALSE;
        glGetShaderiv(static_cast<GLuint>(shaderId), GL_COMPILE_STATUS, &status);
        return status == GL_TRUE;
    };

    gl["getShaderInfoLog"] = [](unsigned int shaderId) -> std::string {
        GLint length = 0;
        glGetShaderiv(static_cast<GLuint>(shaderId), GL_INFO_LOG_LENGTH, &length);
        if (length <= 1) return {};
        std::string log(static_cast<size_t>(length), '\0');
        GLsizei written = 0;
        glGetShaderInfoLog(static_cast<GLuint>(shaderId), length, &written, log.data());
        if (written > 0 && static_cast<size_t>(written) < log.size())
            log.resize(static_cast<size_t>(written));
        return log;
    };

    gl["createProgram"] = []() -> unsigned int {
        return static_cast<unsigned int>(glCreateProgram());
    };

    gl["deleteProgram"] = [](unsigned int programId) {
        glDeleteProgram(static_cast<GLuint>(programId));
    };

    gl["attachShader"] = [](unsigned int programId, unsigned int shaderId) {
        glAttachShader(static_cast<GLuint>(programId), static_cast<GLuint>(shaderId));
    };

    gl["detachShader"] = [](unsigned int programId, unsigned int shaderId) {
        glDetachShader(static_cast<GLuint>(programId), static_cast<GLuint>(shaderId));
    };

    gl["linkProgram"] = [](unsigned int programId) {
        glLinkProgram(static_cast<GLuint>(programId));
    };

    gl["useProgram"] = [](unsigned int programId) {
        glUseProgram(static_cast<GLuint>(programId));
    };

    gl["getProgramLinkStatus"] = [](unsigned int programId) -> bool {
        GLint status = GL_FALSE;
        glGetProgramiv(static_cast<GLuint>(programId), GL_LINK_STATUS, &status);
        return status == GL_TRUE;
    };

    gl["getProgramInfoLog"] = [](unsigned int programId) -> std::string {
        GLint length = 0;
        glGetProgramiv(static_cast<GLuint>(programId), GL_INFO_LOG_LENGTH, &length);
        if (length <= 1) return {};
        std::string log(static_cast<size_t>(length), '\0');
        GLsizei written = 0;
        glGetProgramInfoLog(static_cast<GLuint>(programId), length, &written, log.data());
        if (written > 0 && static_cast<size_t>(written) < log.size())
            log.resize(static_cast<size_t>(written));
        return log;
    };

    gl["getAttribLocation"] = [](unsigned int programId, const std::string& name) -> int {
        return glGetAttribLocation(static_cast<GLuint>(programId), name.c_str());
    };

    gl["getUniformLocation"] = [](unsigned int programId, const std::string& name) -> int {
        return glGetUniformLocation(static_cast<GLuint>(programId), name.c_str());
    };

    gl["uniform1f"] = [](int location, float v0) { glUniform1f(location, v0); };
    gl["uniform2f"] = [](int location, float v0, float v1) { glUniform2f(location, v0, v1); };
    gl["uniform3f"] = [](int location, float v0, float v1, float v2) { glUniform3f(location, v0, v1, v2); };
    gl["uniform4f"] = [](int location, float v0, float v1, float v2, float v3) {
        glUniform4f(location, v0, v1, v2, v3);
    };
    gl["uniform1i"] = [](int location, int v0) { glUniform1i(location, v0); };

    gl["uniformMatrix4"] = [](int location, sol::table values, sol::optional<bool> transpose) {
        const bool tx = transpose.value_or(false);
        const size_t count = values.size();
        if (count < 16) return;
        std::array<float, 16> matrix{};
        for (size_t i = 0; i < 16; ++i) {
            auto value = values.get<sol::optional<float>>(i + 1);
            matrix[i] = value.value_or(0.0f);
        }
        glUniformMatrix4fv(location, 1, tx ? GL_TRUE : GL_FALSE, matrix.data());
    };

    // Buffer functions
    gl["createBuffer"] = []() -> unsigned int {
        GLuint id = 0;
        glGenBuffers(1, &id);
        return static_cast<unsigned int>(id);
    };

    gl["deleteBuffer"] = [](unsigned int bufferId) {
        GLuint id = static_cast<GLuint>(bufferId);
        glDeleteBuffers(1, &id);
    };

    gl["bindBuffer"] = [](int target, unsigned int bufferId) {
        glBindBuffer(static_cast<GLenum>(target), static_cast<GLuint>(bufferId));
    };

    gl["bufferDataFloat"] = [](int target, sol::table values, int usage) {
        const size_t count = values.size();
        std::vector<float> data;
        data.reserve(count);
        for (size_t i = 1; i <= count; ++i) {
            auto value = values.get<sol::optional<float>>(i);
            data.push_back(value.value_or(0.0f));
        }
        glBufferData(static_cast<GLenum>(target),
                     static_cast<GLsizeiptr>(data.size() * sizeof(float)),
                     data.empty() ? nullptr : data.data(),
                     static_cast<GLenum>(usage));
    };

    gl["bufferSubDataFloat"] = [](int target, int offsetBytes, sol::table values) {
        const size_t count = values.size();
        std::vector<float> data;
        data.reserve(count);
        for (size_t i = 1; i <= count; ++i) {
            auto value = values.get<sol::optional<float>>(i);
            data.push_back(value.value_or(0.0f));
        }
        glBufferSubData(static_cast<GLenum>(target),
                        static_cast<GLintptr>(offsetBytes),
                        static_cast<GLsizeiptr>(data.size() * sizeof(float)),
                        data.empty() ? nullptr : data.data());
    };

    gl["bufferDataUInt16"] = [](int target, sol::table values, int usage) {
        const size_t count = values.size();
        std::vector<uint16_t> data;
        data.reserve(count);
        for (size_t i = 1; i <= count; ++i) {
            auto value = values.get<sol::optional<int>>(i);
            data.push_back(static_cast<uint16_t>(value.value_or(0)));
        }
        glBufferData(static_cast<GLenum>(target),
                     static_cast<GLsizeiptr>(data.size() * sizeof(uint16_t)),
                     data.empty() ? nullptr : data.data(),
                     static_cast<GLenum>(usage));
    };

    // VAO functions
    gl["createVertexArray"] = []() -> unsigned int {
        GLuint id = 0;
        glGenVertexArrays(1, &id);
        return static_cast<unsigned int>(id);
    };

    gl["bindVertexArray"] = [](unsigned int vaoId) {
        glBindVertexArray(static_cast<GLuint>(vaoId));
    };

    gl["deleteVertexArray"] = [](unsigned int vaoId) {
        GLuint id = static_cast<GLuint>(vaoId);
        glDeleteVertexArrays(1, &id);
    };

    gl["enableVertexAttribArray"] = [](unsigned int index) {
        glEnableVertexAttribArray(static_cast<GLuint>(index));
    };

    gl["disableVertexAttribArray"] = [](unsigned int index) {
        glDisableVertexAttribArray(static_cast<GLuint>(index));
    };

    gl["vertexAttribPointer"] = [](unsigned int index, int size, int type,
                                   bool normalized, int strideBytes, int offsetBytes) {
        glVertexAttribPointer(static_cast<GLuint>(index), size,
                              static_cast<GLenum>(type),
                              normalized ? GL_TRUE : GL_FALSE,
                              static_cast<GLsizei>(strideBytes),
                              reinterpret_cast<const void*>(static_cast<uintptr_t>(offsetBytes)));
    };

    // Draw functions
    gl["drawArrays"] = [](int mode, int first, int count) {
        glDrawArrays(static_cast<GLenum>(mode), first, count);
    };

    gl["drawElements"] = [](int mode, int count, int indexType, int indexOffsetBytes) {
        glDrawElements(static_cast<GLenum>(mode), count,
                       static_cast<GLenum>(indexType),
                       reinterpret_cast<const void*>(static_cast<uintptr_t>(indexOffsetBytes)));
    };

    // Texture functions
    gl["createTexture"] = []() -> unsigned int {
        GLuint id = 0;
        glGenTextures(1, &id);
        return static_cast<unsigned int>(id);
    };

    gl["deleteTexture"] = [](unsigned int textureId) {
        GLuint id = static_cast<GLuint>(textureId);
        glDeleteTextures(1, &id);
    };

    gl["activeTexture"] = [](int textureUnit) {
        glActiveTexture(static_cast<GLenum>(textureUnit));
    };

    gl["bindTexture"] = [](int target, unsigned int textureId) {
        glBindTexture(static_cast<GLenum>(target), static_cast<GLuint>(textureId));
    };

    gl["texParameteri"] = [](int target, int pname, int value) {
        glTexParameteri(static_cast<GLenum>(target), static_cast<GLenum>(pname), value);
    };

    gl["texImage2DRGBA"] = [](int target, int level, int width, int height,
                               sol::optional<sol::table> pixelData) {
        std::vector<uint8_t> data;
        const uint8_t* ptr = nullptr;
        if (pixelData.has_value()) {
            auto table = pixelData.value();
            const size_t count = table.size();
            data.reserve(count);
            for (size_t i = 1; i <= count; ++i) {
                auto value = table.get<sol::optional<int>>(i);
                data.push_back(static_cast<uint8_t>(std::clamp(value.value_or(0), 0, 255)));
            }
            ptr = data.empty() ? nullptr : data.data();
        }
        glTexImage2D(static_cast<GLenum>(target), level, GL_RGBA8, width, height, 0,
                     GL_RGBA, GL_UNSIGNED_BYTE, ptr);
    };

    gl["texSubImage2DRGBA"] = [](int target, int level, int xoffset, int yoffset,
                                  int width, int height, sol::table pixelData) {
        const size_t count = pixelData.size();
        std::vector<uint8_t> data;
        data.reserve(count);
        for (size_t i = 1; i <= count; ++i) {
            auto value = pixelData.get<sol::optional<int>>(i);
            data.push_back(static_cast<uint8_t>(std::clamp(value.value_or(0), 0, 255)));
        }
        glTexSubImage2D(static_cast<GLenum>(target), level, xoffset, yoffset, width,
                        height, GL_RGBA, GL_UNSIGNED_BYTE,
                        data.empty() ? nullptr : data.data());
    };

    gl["generateMipmap"] = [](int target) {
        glGenerateMipmap(static_cast<GLenum>(target));
    };

    // Framebuffer functions
    gl["createFramebuffer"] = []() -> unsigned int {
        GLuint id = 0;
        glGenFramebuffers(1, &id);
        return static_cast<unsigned int>(id);
    };

    gl["deleteFramebuffer"] = [](unsigned int framebufferId) {
        GLuint id = static_cast<GLuint>(framebufferId);
        glDeleteFramebuffers(1, &id);
    };

    gl["bindFramebuffer"] = [](int target, unsigned int framebufferId) {
        glBindFramebuffer(static_cast<GLenum>(target), static_cast<GLuint>(framebufferId));
    };

    gl["framebufferTexture2D"] = [](int target, int attachment, int texTarget,
                                     unsigned int textureId, int level) {
        glFramebufferTexture2D(static_cast<GLenum>(target), static_cast<GLenum>(attachment),
                               static_cast<GLenum>(texTarget),
                               static_cast<GLuint>(textureId), level);
    };

    gl["checkFramebufferStatus"] = [](int target) -> int {
        return static_cast<int>(glCheckFramebufferStatus(static_cast<GLenum>(target)));
    };

    gl["drawBuffers"] = [](sol::table buffers) {
        const size_t count = buffers.size();
        std::vector<GLenum> values;
        values.reserve(count);
        for (size_t i = 1; i <= count; ++i)
            values.push_back(static_cast<GLenum>(buffers.get_or<int>(i, GL_COLOR_ATTACHMENT0)));
        if (!values.empty())
            glDrawBuffers(static_cast<GLsizei>(values.size()), values.data());
    };

    // Renderbuffer functions
    gl["createRenderbuffer"] = []() -> unsigned int {
        GLuint id = 0;
        glGenRenderbuffers(1, &id);
        return static_cast<unsigned int>(id);
    };

    gl["deleteRenderbuffer"] = [](unsigned int renderbufferId) {
        GLuint id = static_cast<GLuint>(renderbufferId);
        glDeleteRenderbuffers(1, &id);
    };

    gl["bindRenderbuffer"] = [](int target, unsigned int renderbufferId) {
        glBindRenderbuffer(static_cast<GLenum>(target), static_cast<GLuint>(renderbufferId));
    };

    gl["renderbufferStorage"] = [](int target, int internalFormat, int width, int height) {
        glRenderbufferStorage(static_cast<GLenum>(target),
                              static_cast<GLenum>(internalFormat), width, height);
    };

    gl["framebufferRenderbuffer"] = [](int target, int attachment, int renderbufferTarget,
                                        unsigned int renderbufferId) {
        glFramebufferRenderbuffer(static_cast<GLenum>(target),
                                  static_cast<GLenum>(attachment),
                                  static_cast<GLenum>(renderbufferTarget),
                                  static_cast<GLuint>(renderbufferId));
    };

    // Additional functions
    gl["blitFramebuffer"] = [](int srcX0, int srcY0, int srcX1, int srcY1,
                                int dstX0, int dstY0, int dstX1, int dstY1,
                                int mask, int filter) {
        glBlitFramebuffer(srcX0, srcY0, srcX1, srcY1, dstX0, dstY0, dstX1, dstY1,
                          static_cast<GLbitfield>(mask), static_cast<GLenum>(filter));
    };

#ifndef __ANDROID__
    gl["clearDepth"] = [](double depth) { glClearDepth(depth); };
#endif

    gl["blendEquation"] = [](int mode) {
        glBlendEquation(static_cast<GLenum>(mode));
    };

    gl["scissor"] = [](int x, int y, int width, int height) {
        glScissor(x, y, width, height);
    };

    gl["cullFace"] = [](int mode) { glCullFace(static_cast<GLenum>(mode)); };

    gl["lineWidth"] = [](float width) { glLineWidth(width); };

    gl["getError"] = []() -> int { return static_cast<int>(glGetError()); };
}

} // namespace lua_bindings
