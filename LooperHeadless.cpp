/**
 * LooperHeadless: Headless test harness for the Looper plugin.
 *
 * Instantiates LooperProcessor, pumps processBlock() in a loop on the main
 * thread. No GUI, no audio device, no display server required. The
 * ControlServer starts and accepts commands via Unix socket just like the
 * real plugin.
 *
 * Usage:
 *   ./LooperHeadless [--samplerate 44100] [--blocksize 512] [--duration 0]
 *
 *   --samplerate  Sample rate in Hz (default: 44100)
 *   --blocksize   Audio block size in samples (default: 512)
 *   --duration    Run for N seconds then exit (0 = run forever, default: 0)
 *
 * While running, use looper-cli to interact:
 *   ./tools/looper-cli state
 *   ./tools/looper-cli inject /tmp/test.wav
 *   ./tools/looper-cli commit 2.0
 */

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_events/juce_events.h>

#include "LooperProcessor.h"

#include <csignal>
#include <cstdio>
#include <cstring>
#include <chrono>
#include <thread>

static std::atomic<bool> shouldQuit{false};

static void signalHandler(int) {
    shouldQuit.store(true);
}

static void printUsage(const char* name) {
    std::fprintf(stderr,
        "Usage: %s [--samplerate SR] [--blocksize BS] [--duration SECS]\n"
        "  --samplerate  Sample rate (default: 44100)\n"
        "  --blocksize   Block size (default: 512)\n"
        "  --duration    Run duration in seconds, 0=forever (default: 0)\n",
        name);
}

int main(int argc, char* argv[]) {
    // Parse args
    double sampleRate = 44100.0;
    int blockSize = 512;
    double duration = 0.0; // 0 = forever

    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--samplerate") == 0 && i + 1 < argc) {
            sampleRate = std::atof(argv[++i]);
        } else if (std::strcmp(argv[i], "--blocksize") == 0 && i + 1 < argc) {
            blockSize = std::atoi(argv[++i]);
        } else if (std::strcmp(argv[i], "--duration") == 0 && i + 1 < argc) {
            duration = std::atof(argv[++i]);
        } else if (std::strcmp(argv[i], "--help") == 0 || std::strcmp(argv[i], "-h") == 0) {
            printUsage(argv[0]);
            return 0;
        } else {
            std::fprintf(stderr, "Unknown argument: %s\n", argv[i]);
            printUsage(argv[0]);
            return 1;
        }
    }

    // Initialise minimal JUCE infrastructure (no GUI)
    juce::ScopedJuceInitialiser_GUI juceInit;

    std::fprintf(stderr, "LooperHeadless: sampleRate=%.0f blockSize=%d duration=%.1fs\n",
        sampleRate, blockSize, duration);

    // Create processor
    LooperProcessor processor;
    processor.prepareToPlay(sampleRate, blockSize);

    std::fprintf(stderr, "LooperHeadless: ControlServer at %s\n",
        processor.getControlServer().getSocketPath().c_str());
    std::fprintf(stderr, "LooperHeadless: Running. Use looper-cli to interact. Ctrl+C to stop.\n");

    // Signal handling for clean shutdown
    std::signal(SIGINT, signalHandler);
    std::signal(SIGTERM, signalHandler);

    // Allocate audio buffer (stereo, silent input)
    juce::AudioBuffer<float> buffer(2, blockSize);
    juce::MidiBuffer midi;

    // Timing: simulate real-time audio callback rate
    auto blockDuration = std::chrono::microseconds(
        static_cast<long long>(blockSize / sampleRate * 1'000'000.0));

    auto startTime = std::chrono::steady_clock::now();
    long long blocksProcessed = 0;

    while (!shouldQuit.load()) {
        auto blockStart = std::chrono::steady_clock::now();

        // Clear buffer (silence input, as if mic is quiet)
        buffer.clear();

        // Process one block
        processor.processBlock(buffer, midi);
        ++blocksProcessed;

        // Check duration limit
        if (duration > 0.0) {
            auto elapsed = std::chrono::steady_clock::now() - startTime;
            double elapsedSecs = std::chrono::duration<double>(elapsed).count();
            if (elapsedSecs >= duration) break;
        }

        // Sleep to approximate real-time rate
        // This keeps CPU usage low and gives the ControlServer threads time
        auto elapsed = std::chrono::steady_clock::now() - blockStart;
        auto remaining = blockDuration - elapsed;
        if (remaining.count() > 0) {
            std::this_thread::sleep_for(remaining);
        }
    }

    // Clean shutdown
    auto totalTime = std::chrono::steady_clock::now() - startTime;
    double totalSecs = std::chrono::duration<double>(totalTime).count();

    std::fprintf(stderr,
        "\nLooperHeadless: Stopped. %lld blocks processed in %.1fs (%.1f blocks/sec)\n",
        blocksProcessed, totalSecs,
        blocksProcessed / (totalSecs > 0 ? totalSecs : 1.0));

    processor.releaseResources();
    return 0;
}
