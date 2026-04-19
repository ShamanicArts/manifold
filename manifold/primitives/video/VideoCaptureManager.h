#pragma once

#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include <juce_core/juce_core.h>

namespace manifold::video {

struct DeviceInfo {
    int index = -1;
    std::string path;
    std::string name;
    std::string label;
};

struct VideoMode {
    int width = 0;
    int height = 0;
    int fps = 0;
    std::string pixelFormat;
    std::string label;
};

struct FrameData {
    int width = 0;
    int height = 0;
    uint64_t sequence = 0;
    std::vector<std::uint8_t> rgba;

    bool valid() const {
        return width > 0 && height > 0 && !rgba.empty();
    }
};

class VideoCaptureManager {
public:
    static VideoCaptureManager& instance();

    std::vector<DeviceInfo> listDevices();
    std::vector<VideoMode> listModes(int deviceIndex);

    bool openDevice(int index,
                    int requestedWidth = 640,
                    int requestedHeight = 480,
                    int requestedFps = 30);
    void closeDevice();

    bool isOpen() const;
    int getActiveDeviceIndex() const;
    std::string getLastError() const;
    FrameData getLatestFrameCopy() const;

private:
    VideoCaptureManager();
    ~VideoCaptureManager();

    VideoCaptureManager(const VideoCaptureManager&) = delete;
    VideoCaptureManager& operator=(const VideoCaptureManager&) = delete;

    void setLastError(const std::string& error);

#if JUCE_LINUX
    bool openDeviceLinux(const DeviceInfo& device,
                         int requestedWidth,
                         int requestedHeight,
                         int requestedFps);
    void closeDeviceLinux();
    void captureLoopLinux();
#endif

    mutable std::mutex stateMutex_;
    mutable std::mutex frameMutex_;
    std::string lastError_;
    int activeDeviceIndex_ = -1;
    std::atomic<bool> running_{false};
    std::thread captureThread_;
    FrameData latestFrame_;

#if JUCE_LINUX
    struct LinuxState;
    std::unique_ptr<LinuxState> linux_;
#endif
};

} // namespace manifold::video
