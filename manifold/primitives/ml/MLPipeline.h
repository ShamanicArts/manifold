#pragma once

#include <memory>
#include <string>
#include <vector>

namespace manifold::ml {

/**
 * A TensorFlow Lite inference wrapper.
 *
 * Loads a .tflite or .task model file, provides resize/normalize of RGBA
 * frame data, runs inference, and returns float output buffers.
 *
 * Threading: not thread-safe. Create one pipeline per inference thread.
 */
class MLPipeline {
public:
    MLPipeline();
    ~MLPipeline();

    MLPipeline(const MLPipeline&) = delete;
    MLPipeline& operator=(const MLPipeline&) = delete;
    MLPipeline(MLPipeline&&) = default;
    MLPipeline& operator=(MLPipeline&&) = default;

    /** Load a .tflite or .task model from disk. Returns true on success. */
    bool load(const std::string& modelPath);

    /** Returns true if a model is loaded and ready. */
    bool isLoaded() const;

    /** Input tensor dimensions expected by the model (after preprocessing). */
    int inputWidth() const;
    int inputHeight() const;
    int inputChannels() const;

    /** Output tensor dimensions (flat). */
    int outputElements() const;

    /**
     * Run inference on RGBA frame data.
     * Resizes to model's input dims, converts to RGB, normalizes.
     * Returns raw float output buffer.
     */
    bool infer(const unsigned char* rgbaData,
               int srcWidth,
               int srcHeight,
               std::vector<float>& output);

    /** Convenience: single-channel mask output. Call after infer(). */
    bool getOutputAsMask(std::vector<float>& mask);

    /** Last error message. */
    const std::string& lastError() const;

private:
    struct Impl;
    std::unique_ptr<Impl> pImpl_;
};

} // namespace manifold::ml
