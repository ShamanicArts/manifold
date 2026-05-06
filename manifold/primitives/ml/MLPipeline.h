#pragma once

#include <atomic>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <vector>

namespace manifold::ml {

struct FrameJob {
    int width = 0;
    int height = 0;
    std::vector<std::uint8_t> rgba;
    // Segmentation-specific: if set, worker runs full infer+mask+RGBA pipeline
    bool isSegmentation = false;
    float segGain = 1.0f;
    bool segUseSigmoid = true;
    float segThreshold = 0.5f;
    float segFeather = 0.15f;
    bool segInvert = false;
    float segBackground = 0.0f;
    uint64_t sequence = 0;
    bool valid() const { return width > 0 && height > 0 && !rgba.empty(); }
};

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

    /** Set input normalization: output = resized * scale + bias. Default scale=2 bias=-1 ([-1,1]). */
    void setNormalization(float scale, float bias);

    /** Last error message. */
    const std::string& lastError() const;

    // --- Async inference API ---

    /** Start the background inference worker thread. Safe to call multiple times. */
    void startBackgroundWorker();

    /** Submit a frame for async inference. Thread-safe. */
    void submitFrame(int width, int height, std::vector<std::uint8_t> rgba);

    /**
     * Poll for the latest completed inference result.
     * Returns true if new data was available, false if no result ready yet.
     * Thread-safe.
     */
    bool pollResult(std::vector<float>& output);

    // --- Segmentation-specific async pipeline ---

    struct SegmentationOpts {
        float gain = 1.0f;
        bool useSigmoid = true;
        float threshold = 0.5f;
        float feather = 0.15f;
        bool invert = false;
        float background = 0.0f;
    };

    /** Submit a frame for full segmentation pipeline (infer + mask process + RGBA). Thread-safe. */
    void submitSegmentation(int width, int height, std::vector<std::uint8_t> rgba,
                            const SegmentationOpts& opts);

    /**
     * Poll for the latest completed segmentation result (pre-built RGBA frame).
     * Returns the frame data if available. Caller takes ownership.
     * Thread-safe.
     */
    std::vector<std::uint8_t> pollSegmentationResult(int& outW, int& outH, uint64_t& sequence);

private:
    struct Impl;
    std::unique_ptr<Impl> pImpl_;
};

} // namespace manifold::ml
