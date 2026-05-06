#pragma once

#include "../primitives/control/ControlServer.h"

#include <juce_graphics/juce_graphics.h>

#include <cstdio>
#include <optional>
#include <string>

namespace editor_capture {

enum class ScreenshotCaptureSource {
    None,
    DirectHost,
    ComponentSnapshot,
};

struct ScreenshotCapturePlan {
    ScreenshotCaptureSource primarySource = ScreenshotCaptureSource::None;
    bool allowComponentFallback = false;
    juce::Rectangle<int> componentSnapshotBounds;
};

inline ScreenshotCapturePlan buildScreenshotCapturePlan(bool directHostVisible,
                                                        int editorWidth,
                                                        int editorHeight) {
    const bool hasSnapshotBounds = editorWidth > 0 && editorHeight > 0;
    const auto snapshotBounds = hasSnapshotBounds
        ? juce::Rectangle<int>(0, 0, editorWidth, editorHeight)
        : juce::Rectangle<int>();

    if (directHostVisible) {
        return {
            ScreenshotCaptureSource::DirectHost,
            hasSnapshotBounds,
            snapshotBounds,
        };
    }

    if (hasSnapshotBounds) {
        return {
            ScreenshotCaptureSource::ComponentSnapshot,
            false,
            snapshotBounds,
        };
    }

    return {};
}

inline bool writePng(const juce::Image& image, const std::string& outputPath) {
    if (!image.isValid() || outputPath.empty()) {
        return false;
    }

    juce::File outputFile(outputPath);
    std::unique_ptr<juce::FileOutputStream> stream(outputFile.createOutputStream());
    if (stream == nullptr) {
        return false;
    }

    juce::PNGImageFormat pngFormat;
    if (!pngFormat.writeImageToStream(image, *stream)) {
        return false;
    }

    stream->flush();
    return true;
}

struct RecordingCropPlan {
    juce::Rectangle<int> requestedBounds;
    juce::Rectangle<int> effectiveBounds;
    bool cropApplied = false;
    bool usedResolvedNodeBounds = false;
};

inline RecordingCropPlan buildRecordingCropPlan(const RecordingOptions& options,
                                                const std::optional<juce::Rectangle<int>>& resolvedNodeBounds,
                                                const juce::Rectangle<int>& frameBounds) {
    if (!options.cropEnabled) {
        return {frameBounds, frameBounds, false, false};
    }

    auto requestedBounds = juce::Rectangle<int>(options.cropX,
                                                options.cropY,
                                                options.cropW,
                                                options.cropH);
    bool usedResolvedNodeBounds = false;
    if ((!options.cropNodeId.empty() || options.cropStableId != 0) && resolvedNodeBounds.has_value()) {
        requestedBounds = *resolvedNodeBounds;
        usedResolvedNodeBounds = true;
    }

    const auto clipped = requestedBounds.getIntersection(frameBounds);
    if (clipped.isEmpty()) {
        return {requestedBounds, frameBounds, false, usedResolvedNodeBounds};
    }

    return {requestedBounds, clipped, true, usedResolvedNodeBounds};
}

inline juce::Image applyRecordingCrop(const juce::Image& frame,
                                      const RecordingCropPlan& plan) {
    if (!frame.isValid() || !plan.cropApplied) {
        return frame;
    }
    return frame.getClippedImage(plan.effectiveBounds);
}

enum class RecordingFrameSink {
    Ram,
    Disk,
};

inline RecordingFrameSink chooseRecordingFrameSink(const RecordingOptions& options,
                                                   const std::string& outputDir) {
    return options.streamFramesToDisk && !outputDir.empty()
        ? RecordingFrameSink::Disk
        : RecordingFrameSink::Ram;
}

inline std::string buildRecordingFramePath(const std::string& outputDir,
                                           int frameNumber) {
    if (outputDir.empty() || frameNumber <= 0) {
        return {};
    }

    char framePath[512];
    std::snprintf(framePath,
                  sizeof(framePath),
                  "%s/frame_%04d.tga",
                  outputDir.c_str(),
                  frameNumber);
    return framePath;
}

} // namespace editor_capture
