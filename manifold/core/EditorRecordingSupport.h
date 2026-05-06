#pragma once

#include "../primitives/control/ControlServer.h"
#include <juce_gui_basics/juce_gui_basics.h>
#include <cstdio>
#include <mutex>
#include <vector>
#include <string>
#include <cstdint>

namespace editor_recording {

struct RamFrameAccumulator {
    std::vector<juce::Image> ramFrames;
    std::size_t ramFramesBytes = 0;
    bool ramFramesLimitWarned = false;
    std::mutex ramFramesMutex;

    void clear() {
        std::lock_guard<std::mutex> lock(ramFramesMutex);
        ramFrames.clear();
        ramFramesBytes = 0;
        ramFramesLimitWarned = false;
    }

    std::vector<juce::Image> takeAll() {
        std::lock_guard<std::mutex> lock(ramFramesMutex);
        std::vector<juce::Image> result = std::move(ramFrames);
        ramFrames.clear();
        ramFramesBytes = 0;
        ramFramesLimitWarned = false;
        return result;
    }

    bool tryAddFrame(const juce::Image& frame,
                     std::size_t byteLimit = 384u * 1024u * 1024u) {
        const auto frameBytes = static_cast<std::size_t>(frame.getWidth())
                            * static_cast<std::size_t>(frame.getHeight())
                            * 4u;
        std::lock_guard<std::mutex> lock(ramFramesMutex);
        if (ramFramesBytes + frameBytes <= byteLimit) {
            ramFramesBytes += frameBytes;
            ramFrames.push_back(frame);
            return true;
        }
        if (!ramFramesLimitWarned) {
            ramFramesLimitWarned = true;
            std::fprintf(stderr,
                         "BehaviorCoreEditor: recording frame RAM cap reached (%zu bytes), dropping further frames\n",
                         byteLimit);
        }
        return false;
    }
};

inline bool writeTga(const juce::Image& image, const std::string& path) {
    FILE* f = std::fopen(path.c_str(), "wb");
    if (!f) return false;
    const int w = image.getWidth();
    const int h = image.getHeight();
    std::uint8_t header[18] = {};
    header[2] = 2;
    header[12] = static_cast<std::uint8_t>(w & 0xFF);
    header[13] = static_cast<std::uint8_t>((w >> 8) & 0xFF);
    header[14] = static_cast<std::uint8_t>(h & 0xFF);
    header[15] = static_cast<std::uint8_t>((h >> 8) & 0xFF);
    header[16] = 32;
    header[17] = 0x28;
    std::fwrite(header, 1, 18, f);
    juce::Image::BitmapData bitmap(image, juce::Image::BitmapData::readOnly);
    for (int y = 0; y < h; ++y) {
        const auto* src = bitmap.getLinePointer(y);
        for (int x = 0; x < w; ++x) {
            std::uint8_t pixel[4] = {src[x * 4 + 0], src[x * 4 + 1], src[x * 4 + 2], src[x * 4 + 3]};
            std::fwrite(pixel, 1, 4, f);
        }
    }
    std::fclose(f);
    return true;
}

inline void flushRamFramesToDisk(std::vector<juce::Image> frames,
                                  const std::string& outputDir,
                                  RecordingState& rec) {
    if (frames.empty()) {
        return;
    }
    int frameNum = 0;
    for (const auto& image : frames) {
        ++frameNum;
        char framePath[512];
        std::snprintf(framePath, sizeof(framePath), "%s/frame_%04d.tga",
                      outputDir.c_str(), frameNum);
        if (writeTga(image, framePath)) {
            std::lock_guard<std::mutex> lock(rec.mutex);
            rec.framePaths.push_back(framePath);
        }
    }
}

} // namespace editor_recording
