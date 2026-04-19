#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <unordered_set>

#include "RuntimeNode.h"

/**
 * @brief Abstract interface for surface providers that can produce textures or render pipelines.
 *
 * This interface decouples the renderer (ImGuiDirectHost) from specific surface types
 * like video input or GPU shaders. Each provider implements a specific surface type
 * and is registered with the renderer to handle texture/pipeline preparation.
 *
 * Pattern: Similar to JUCE callback delegation (MidiManager::setNoteOnCallback()).
 * The renderer registers providers without knowing the caller's implementation.
 */
class CustomSurfaceProvider {
public:
    virtual ~CustomSurfaceProvider() = default;

    /**
     * @brief Check if this provider handles the given surface type.
     *
     * @param surfaceType The surface type identifier (e.g., "video_input", "gpu_shader").
     * @return true if this provider can handle the surface type.
     */
    virtual bool handlesType(const std::string& surfaceType) const = 0;

    /**
     * @brief Prepare the provider's resources for rendering.
     *
     * Called by the renderer when a node with this surface type needs to be rendered.
     * The provider is responsible for:
     * - Allocating or reusing GL textures/FBOs
     * - Uploading data (video frames, shader inputs, etc.)
     * - Compiling shaders if needed
     * - Managing feedback buffers
     *
     * @param node The RuntimeNode that owns this surface.
     * @param width Desired output width.
     * @param height Desired output height.
     * @param timeSeconds Current time in seconds for shader animations.
     * @return A stable ID identifying this prepared surface (opaque to renderer).
     */
    virtual std::uintptr_t prepareTexture(const RuntimeNode& node,
                                          int width,
                                          int height,
                                          double timeSeconds) = 0;

    /**
     * @brief Get information about a prepared surface.
     *
     * Called by the renderer for validation, debugging, or diagnostics.
     *
     * @param stableId The stable ID returned by prepareTexture().
     * @param[out] w Width of the surface.
     * @param[out] h Height of the surface.
     * @param[out] seq Sequence number for frame validation.
     * @return true if the surface exists and information was retrieved.
     */
    virtual bool getSurfaceInfo(uint64_t, int&, int&, uint64_t&) const {
        return false;
    }

    /**
     * @brief Prune resources no longer in use.
     *
     * Called by the renderer when a surface is no longer needed.
     * The provider should release any unreferenced resources to avoid leaks.
     *
     * @param touchedStableIds Set of stable IDs that are still in use.
     */
    virtual void prune(const std::unordered_set<uint64_t>& touchedStableIds) = 0;

    /**
     * @brief Release all provider resources.
     *
     * Called when the renderer is shutting down or when the provider is being unregistered.
     * The provider should release all GL textures, FBOs, shaders, etc.
     */
    virtual void releaseAll() = 0;
};