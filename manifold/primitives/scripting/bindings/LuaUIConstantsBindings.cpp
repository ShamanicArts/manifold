#include "LuaUIConstantsBindings.h"

#include <juce_opengl/juce_opengl.h>

using namespace juce::gl;

namespace lua_bindings {

void registerConstants(sol::state& lua) {
    // Justification constants
    lua["Justify"] = lua.create_table_with(
        "left", 1, "right", 2, "horizontallyCentred", 4, "top", 8, "bottom", 16,
        "verticallyCentred", 32, "centred", 36, "centredLeft", 33, "centredRight",
        34, "centredTop", 12, "centredBottom", 20, "topLeft", 9, "topRight", 10,
        "bottomLeft", 17, "bottomRight", 18
    );

    // Font style constants
    lua["FontStyle"] = lua.create_table_with(
        "plain", 0, "bold", 1, "italic", 2, "boldItalic", 3
    );

    // OpenGL constants
    lua["GL"] = lua.create_table_with(
        // Buffer bits
        "COLOR_BUFFER_BIT", GL_COLOR_BUFFER_BIT,
        "DEPTH_BUFFER_BIT", GL_DEPTH_BUFFER_BIT,
        "STENCIL_BUFFER_BIT", GL_STENCIL_BUFFER_BIT,
        // Primitives
        "POINTS", GL_POINTS,
        "LINES", GL_LINES,
        "LINE_STRIP", GL_LINE_STRIP,
        "LINE_LOOP", GL_LINE_LOOP,
        "TRIANGLES", GL_TRIANGLES,
        "TRIANGLE_STRIP", GL_TRIANGLE_STRIP,
        "TRIANGLE_FAN", GL_TRIANGLE_FAN,
        "QUADS", GL_QUADS,
#ifndef __ANDROID__
        "QUAD_STRIP", GL_QUAD_STRIP,
        "POLYGON", GL_POLYGON,
#endif
        // Capabilities
        "BLEND", GL_BLEND,
        "DEPTH_TEST", GL_DEPTH_TEST,
        "CULL_FACE", GL_CULL_FACE,
#ifndef __ANDROID__
        "LIGHTING", GL_LIGHTING,
        "LIGHT0", GL_LIGHT0,
        "LIGHT1", GL_LIGHT1,
        "MODELVIEW", GL_MODELVIEW,
        "PROJECTION", GL_PROJECTION,
#endif
        "TEXTURE_2D", GL_TEXTURE_2D,
        "SCISSOR_TEST", GL_SCISSOR_TEST,
        // Blend factors
        "ZERO", GL_ZERO,
        "ONE", GL_ONE,
        "SRC_COLOR", GL_SRC_COLOR,
        "ONE_MINUS_SRC_COLOR", GL_ONE_MINUS_SRC_COLOR,
        "SRC_ALPHA", GL_SRC_ALPHA,
        "ONE_MINUS_SRC_ALPHA", GL_ONE_MINUS_SRC_ALPHA,
        "DST_ALPHA", GL_DST_ALPHA,
        "ONE_MINUS_DST_ALPHA", GL_ONE_MINUS_DST_ALPHA,
        "FUNC_ADD", GL_FUNC_ADD,
        // Depth functions
        "NEVER", GL_NEVER,
        "LESS", GL_LESS,
        "EQUAL", GL_EQUAL,
        "LEQUAL", GL_LEQUAL,
        "GREATER", GL_GREATER,
        "NOTEQUAL", GL_NOTEQUAL,
        "GEQUAL", GL_GEQUAL,
        "ALWAYS", GL_ALWAYS,
        // Cull modes
        "FRONT", GL_FRONT,
        "BACK", GL_BACK,
        "FRONT_AND_BACK", GL_FRONT_AND_BACK,
        // Matrix modes
#ifndef __ANDROID__
        "MODELVIEW", GL_MODELVIEW,
        "PROJECTION", GL_PROJECTION,
#endif
        "TEXTURE", GL_TEXTURE,
        // Shader/program pipeline
        "VERTEX_SHADER", GL_VERTEX_SHADER,
        "FRAGMENT_SHADER", GL_FRAGMENT_SHADER,
        "COMPILE_STATUS", GL_COMPILE_STATUS,
        "LINK_STATUS", GL_LINK_STATUS,
        "INFO_LOG_LENGTH", GL_INFO_LOG_LENGTH,
        // Buffer API
        "ARRAY_BUFFER", GL_ARRAY_BUFFER,
        "ELEMENT_ARRAY_BUFFER", GL_ELEMENT_ARRAY_BUFFER,
        "STATIC_DRAW", GL_STATIC_DRAW,
        "DYNAMIC_DRAW", GL_DYNAMIC_DRAW,
        "STREAM_DRAW", GL_STREAM_DRAW,
        "READ_FRAMEBUFFER", GL_READ_FRAMEBUFFER,
        "DRAW_FRAMEBUFFER", GL_DRAW_FRAMEBUFFER,
        // Framebuffer / renderbuffer
        "FRAMEBUFFER", GL_FRAMEBUFFER,
        "RENDERBUFFER", GL_RENDERBUFFER,
        "FRAMEBUFFER_COMPLETE", GL_FRAMEBUFFER_COMPLETE,
        "COLOR_ATTACHMENT0", GL_COLOR_ATTACHMENT0,
        "DEPTH_ATTACHMENT", GL_DEPTH_ATTACHMENT,
        "DEPTH_STENCIL_ATTACHMENT", GL_DEPTH_STENCIL_ATTACHMENT,
        "DEPTH24_STENCIL8", GL_DEPTH24_STENCIL8,
        // Texture API
        "TEXTURE0", GL_TEXTURE0,
        "TEXTURE1", GL_TEXTURE1,
        "TEXTURE2", GL_TEXTURE2,
        "TEXTURE_MIN_FILTER", GL_TEXTURE_MIN_FILTER,
        "TEXTURE_MAG_FILTER", GL_TEXTURE_MAG_FILTER,
        "TEXTURE_WRAP_S", GL_TEXTURE_WRAP_S,
        "TEXTURE_WRAP_T", GL_TEXTURE_WRAP_T,
        "CLAMP_TO_EDGE", GL_CLAMP_TO_EDGE,
        "REPEAT", GL_REPEAT,
        "LINEAR", GL_LINEAR,
        "NEAREST", GL_NEAREST,
        "RGBA", GL_RGBA,
        "RGBA8", GL_RGBA8,
        // Types
        "FLOAT", GL_FLOAT,
        "UNSIGNED_BYTE", GL_UNSIGNED_BYTE,
        "UNSIGNED_SHORT", GL_UNSIGNED_SHORT,
        "UNSIGNED_INT", GL_UNSIGNED_INT,
        // Error values
        "NO_ERROR", GL_NO_ERROR,
        "INVALID_ENUM", GL_INVALID_ENUM,
        "INVALID_VALUE", GL_INVALID_VALUE,
        "INVALID_OPERATION", GL_INVALID_OPERATION,
        "OUT_OF_MEMORY", GL_OUT_OF_MEMORY
    );
}

} // namespace lua_bindings
