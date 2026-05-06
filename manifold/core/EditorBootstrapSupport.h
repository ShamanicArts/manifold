#pragma once

#include "EditorRendererSupport.h"

#include <juce_core/juce_core.h>

#include <cstdio>

namespace editor_bootstrap {

enum class RootMode {
    Canvas = 0,
    RuntimeNode = 1,
};

enum class ScriptResolutionKind {
    Configured = 0,
    FallbackForMissingConfigured = 1,
    FallbackForEmptyConfigured = 2,
    MissingConfiguredAndFallback = 3,
    MissingEmptyConfiguredAndFallback = 4,
};

struct ScriptResolution {
    ScriptResolutionKind kind = ScriptResolutionKind::MissingEmptyConfiguredAndFallback;
    juce::File scriptFile;
    juce::String configuredScript;
    juce::String fallbackScript;

    bool shouldAttemptLoad() const { return scriptFile.existsAsFile(); }

    juce::String errorMessage() const {
        switch (kind) {
            case ScriptResolutionKind::Configured:
            case ScriptResolutionKind::FallbackForMissingConfigured:
            case ScriptResolutionKind::FallbackForEmptyConfigured:
                return {};
            case ScriptResolutionKind::MissingConfiguredAndFallback:
                return "UI script not found:\n"
                       "  Configure defaultUiScript or devScriptsDir in .manifold.settings.json\n";
            case ScriptResolutionKind::MissingEmptyConfiguredAndFallback:
                return "No UI script configured:\n"
                       "Configure defaultUiScript or devScriptsDir in .manifold.settings.json\n";
        }

        return {};
    }
};

inline juce::String canonicalContractPath(const juce::File& file) {
    if (!file.exists()) {
        return {};
    }
#ifdef MANIFOLD_SOURCE_DIR
    const juce::File sourceRoot(juce::String(MANIFOLD_SOURCE_DIR));
    if (sourceRoot.isDirectory()) {
        return file.getRelativePathFrom(sourceRoot);
    }
#endif
    return file.getFullPathName();
}

inline bool parseProfileWindowSizeValue(const char* envValue, int& widthOut, int& heightOut) {
    if (envValue == nullptr || *envValue == '\0') {
        return false;
    }

    int width = 0;
    int height = 0;
    if (std::sscanf(envValue, "%dx%d", &width, &height) != 2
        && std::sscanf(envValue, "%dX%d", &width, &height) != 2) {
        return false;
    }

    if (width <= 0 || height <= 0) {
        return false;
    }

    widthOut = width;
    heightOut = height;
    return true;
}

inline RootMode resolveRootMode(const char* envRenderer,
                                int currentUiRendererMode,
                                RootMode requestedMode) {
    juce::ignoreUnused(requestedMode);
    if (envRenderer != nullptr) {
        const auto envMode = editor_renderer::runtimeRendererModeFromString(
            envRenderer, editor_renderer::RuntimeRendererMode::ImGuiDirect);
        if (envMode == editor_renderer::RuntimeRendererMode::Canvas
            || envMode == editor_renderer::RuntimeRendererMode::ImGuiOverlay
            || envMode == editor_renderer::RuntimeRendererMode::ImGuiReplace) {
            return RootMode::Canvas;
        }
        return RootMode::RuntimeNode;
    }

    switch (currentUiRendererMode) {
        case 0:
        case 1:
        case 2:
            return RootMode::Canvas;
        case 3:
        default:
            return RootMode::RuntimeNode;
    }
}

inline editor_renderer::RuntimeRendererMode resolveInitialRuntimeRendererMode(
    const char* envRenderer,
    const char* envRuntimeNodeDebug,
    RootMode rootMode) {
    using RuntimeRendererMode = editor_renderer::RuntimeRendererMode;

    RuntimeRendererMode mode = (rootMode == RootMode::RuntimeNode)
        ? RuntimeRendererMode::ImGuiDirect
        : RuntimeRendererMode::Canvas;

    if (envRenderer != nullptr) {
        mode = editor_renderer::runtimeRendererModeFromString(envRenderer, mode);
    } else if (envRuntimeNodeDebug != nullptr) {
        mode = editor_renderer::runtimeRendererModeFromString(
            envRuntimeNodeDebug, RuntimeRendererMode::ImGuiOverlay);
    }

    if (rootMode == RootMode::RuntimeNode
        && (mode == RuntimeRendererMode::Canvas || mode == RuntimeRendererMode::ImGuiOverlay)) {
        mode = RuntimeRendererMode::ImGuiDirect;
    }

    return mode;
}

inline ScriptResolution resolveInitialLuaUiScript(const juce::String& configuredScript,
                                                  const juce::String& devScriptsDir) {
    ScriptResolution result;
    result.configuredScript = configuredScript;

    if (devScriptsDir.isNotEmpty()) {
        const auto fallback = juce::File(devScriptsDir).getChildFile("empty_launcher.lua");
        result.fallbackScript = fallback.getFullPathName();
    }

    if (configuredScript.isNotEmpty()) {
        const juce::File configuredFile(configuredScript);
        if (configuredFile.existsAsFile()) {
            result.kind = ScriptResolutionKind::Configured;
            result.scriptFile = configuredFile;
            return result;
        }

        const juce::File fallbackFile(result.fallbackScript);
        if (fallbackFile.existsAsFile()) {
            result.kind = ScriptResolutionKind::FallbackForMissingConfigured;
            result.scriptFile = fallbackFile;
            return result;
        }

        result.kind = ScriptResolutionKind::MissingConfiguredAndFallback;
        return result;
    }

    const juce::File fallbackFile(result.fallbackScript);
    if (fallbackFile.existsAsFile()) {
        result.kind = ScriptResolutionKind::FallbackForEmptyConfigured;
        result.scriptFile = fallbackFile;
        return result;
    }

    result.kind = ScriptResolutionKind::MissingEmptyConfiguredAndFallback;
    return result;
}

} // namespace editor_bootstrap
