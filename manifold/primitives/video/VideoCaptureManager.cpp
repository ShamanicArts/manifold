#include "VideoCaptureManager.h"

#include <juce_core/juce_core.h>
#include <juce_graphics/juce_graphics.h>

#include <algorithm>
#include <array>
#include <cerrno>
#include <chrono>
#include <cmath>
#include <cstring>

#if JUCE_LINUX
#include <fcntl.h>
#include <linux/videodev2.h>
#include <poll.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>
#endif

namespace manifold::video {

namespace {

void clampToByte(int& value) {
    value = std::clamp(value, 0, 255);
}

void convertYuyvToRgba(const std::uint8_t* src,
                       int width,
                       int height,
                       std::vector<std::uint8_t>& dst) {
    dst.resize(static_cast<std::size_t>(width) * static_cast<std::size_t>(height) * 4u);
    for (int y = 0; y < height; ++y) {
        const auto* row = src + static_cast<std::size_t>(y) * static_cast<std::size_t>(width) * 2u;
        auto* out = dst.data() + static_cast<std::size_t>(y) * static_cast<std::size_t>(width) * 4u;
        for (int x = 0; x < width; x += 2) {
            const int y0 = row[0];
            const int u = row[1] - 128;
            const int y1 = row[2];
            const int v = row[3] - 128;
            row += 4;

            auto writePixel = [&](int yy) {
                int c = yy - 16;
                int d = u;
                int e = v;
                int r = (298 * c + 409 * e + 128) >> 8;
                int g = (298 * c - 100 * d - 208 * e + 128) >> 8;
                int b = (298 * c + 516 * d + 128) >> 8;
                clampToByte(r);
                clampToByte(g);
                clampToByte(b);
                *out++ = static_cast<std::uint8_t>(r);
                *out++ = static_cast<std::uint8_t>(g);
                *out++ = static_cast<std::uint8_t>(b);
                *out++ = 255u;
            };

            writePixel(y0);
            writePixel(y1);
        }
    }
}

void convertRgb24ToRgba(const std::uint8_t* src,
                        int width,
                        int height,
                        std::vector<std::uint8_t>& dst) {
    dst.resize(static_cast<std::size_t>(width) * static_cast<std::size_t>(height) * 4u);
    const auto pixelCount = static_cast<std::size_t>(width) * static_cast<std::size_t>(height);
    for (std::size_t i = 0; i < pixelCount; ++i) {
        dst[i * 4u + 0u] = src[i * 3u + 0u];
        dst[i * 4u + 1u] = src[i * 3u + 1u];
        dst[i * 4u + 2u] = src[i * 3u + 2u];
        dst[i * 4u + 3u] = 255u;
    }
}

std::string fourccToString(std::uint32_t fourcc) {
    std::string result(4, ' ');
    result[0] = static_cast<char>(fourcc & 0xffu);
    result[1] = static_cast<char>((fourcc >> 8) & 0xffu);
    result[2] = static_cast<char>((fourcc >> 16) & 0xffu);
    result[3] = static_cast<char>((fourcc >> 24) & 0xffu);
    return result;
}

bool decodeMjpegToRgba(const std::uint8_t* src,
                       std::size_t size,
                       FrameData& outFrame) {
    auto image = juce::ImageFileFormat::loadFrom(src, size);
    if (!image.isValid()) {
        return false;
    }

    outFrame.width = image.getWidth();
    outFrame.height = image.getHeight();
    outFrame.rgba.resize(static_cast<std::size_t>(outFrame.width) * static_cast<std::size_t>(outFrame.height) * 4u);

    for (int y = 0; y < outFrame.height; ++y) {
        for (int x = 0; x < outFrame.width; ++x) {
            const auto colour = image.getPixelAt(x, y);
            const auto offset = (static_cast<std::size_t>(y) * static_cast<std::size_t>(outFrame.width)
                               + static_cast<std::size_t>(x)) * 4u;
            outFrame.rgba[offset + 0u] = colour.getRed();
            outFrame.rgba[offset + 1u] = colour.getGreen();
            outFrame.rgba[offset + 2u] = colour.getBlue();
            outFrame.rgba[offset + 3u] = colour.getAlpha();
        }
    }

    return true;
}

} // namespace

VideoCaptureManager& VideoCaptureManager::instance() {
    static VideoCaptureManager manager;
    return manager;
}

VideoCaptureManager::VideoCaptureManager() = default;

VideoCaptureManager::~VideoCaptureManager() {
    closeDevice();
}

void VideoCaptureManager::setLastError(const std::string& error) {
    std::lock_guard<std::mutex> lock(stateMutex_);
    lastError_ = error;
}

std::string VideoCaptureManager::getLastError() const {
    std::lock_guard<std::mutex> lock(stateMutex_);
    return lastError_;
}

bool VideoCaptureManager::isOpen() const {
    return running_.load(std::memory_order_acquire);
}

int VideoCaptureManager::getActiveDeviceIndex() const {
    std::lock_guard<std::mutex> lock(stateMutex_);
    return activeDeviceIndex_;
}

FrameData VideoCaptureManager::getLatestFrameCopy() const {
    std::lock_guard<std::mutex> lock(frameMutex_);
    return latestFrame_;
}

std::vector<DeviceInfo> VideoCaptureManager::listDevices() {
#if JUCE_LINUX
    std::vector<DeviceInfo> devices;
    juce::File devDir("/dev");
    auto files = devDir.findChildFiles(juce::File::findFiles, false, "video*");
    files.sort();

    int index = 0;
    for (const auto& file : files) {
        const auto path = file.getFullPathName().toStdString();
        const int fd = ::open(path.c_str(), O_RDONLY | O_NONBLOCK);
        if (fd < 0) {
            continue;
        }

        v4l2_capability caps{};
        if (::ioctl(fd, VIDIOC_QUERYCAP, &caps) == 0) {
            const auto hasCapture = (caps.capabilities & V4L2_CAP_VIDEO_CAPTURE) != 0
                                 || (caps.capabilities & V4L2_CAP_VIDEO_CAPTURE_MPLANE) != 0;
            if (hasCapture) {
                DeviceInfo info;
                info.index = index++;
                info.path = path;
                info.name = reinterpret_cast<const char*>(caps.card);
                info.label = info.name + std::string(" (") + info.path + ")";
                devices.push_back(std::move(info));
            }
        }

        ::close(fd);
    }

    return devices;
#else
    return {};
#endif
}

std::vector<VideoMode> VideoCaptureManager::listModes(int deviceIndex) {
#if JUCE_LINUX
    const auto devices = listDevices();
    if (deviceIndex < 0 || deviceIndex >= static_cast<int>(devices.size())) {
        return {};
    }

    std::vector<VideoMode> modes;
    const auto& device = devices[static_cast<std::size_t>(deviceIndex)];
    const int fd = ::open(device.path.c_str(), O_RDONLY | O_NONBLOCK);
    if (fd < 0) {
        return {};
    }

    auto enumIoctl = [](int enumFd, unsigned long request, void* arg) {
        int result = 0;
        do {
            result = ::ioctl(enumFd, request, arg);
        } while (result == -1 && errno == EINTR);
        return result != -1;
    };

    v4l2_fmtdesc formatDesc{};
    formatDesc.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    while (enumIoctl(fd, VIDIOC_ENUM_FMT, &formatDesc)) {
        const auto pixelFormat = formatDesc.pixelformat;
        const auto pixelFormatText = fourccToString(pixelFormat);

        v4l2_frmsizeenum sizeDesc{};
        sizeDesc.pixel_format = pixelFormat;
        while (enumIoctl(fd, VIDIOC_ENUM_FRAMESIZES, &sizeDesc)) {
            if (sizeDesc.type == V4L2_FRMSIZE_TYPE_DISCRETE) {
                const int width = static_cast<int>(sizeDesc.discrete.width);
                const int height = static_cast<int>(sizeDesc.discrete.height);

                v4l2_frmivalenum intervalDesc{};
                intervalDesc.pixel_format = pixelFormat;
                intervalDesc.width = sizeDesc.discrete.width;
                intervalDesc.height = sizeDesc.discrete.height;

                bool intervalAdded = false;
                while (enumIoctl(fd, VIDIOC_ENUM_FRAMEINTERVALS, &intervalDesc)) {
                    if (intervalDesc.type == V4L2_FRMIVAL_TYPE_DISCRETE && intervalDesc.discrete.numerator != 0) {
                        const int fps = static_cast<int>(std::lround(static_cast<double>(intervalDesc.discrete.denominator)
                                                                   / static_cast<double>(intervalDesc.discrete.numerator)));
                        VideoMode mode;
                        mode.width = width;
                        mode.height = height;
                        mode.fps = fps;
                        mode.pixelFormat = pixelFormatText;
                        mode.label = std::to_string(width) + "x" + std::to_string(height)
                                   + " @ " + std::to_string(fps) + " fps (" + pixelFormatText + ")";
                        modes.push_back(std::move(mode));
                        intervalAdded = true;
                    }
                    ++intervalDesc.index;
                }

                if (!intervalAdded) {
                    VideoMode mode;
                    mode.width = width;
                    mode.height = height;
                    mode.fps = 30;
                    mode.pixelFormat = pixelFormatText;
                    mode.label = std::to_string(width) + "x" + std::to_string(height)
                               + " @ auto (" + pixelFormatText + ")";
                    modes.push_back(std::move(mode));
                }
            }
            ++sizeDesc.index;
        }
        ++formatDesc.index;
    }

    ::close(fd);
    std::sort(modes.begin(), modes.end(), [](const VideoMode& a, const VideoMode& b) {
        if (a.width != b.width) return a.width < b.width;
        if (a.height != b.height) return a.height < b.height;
        if (a.fps != b.fps) return a.fps > b.fps;
        return a.pixelFormat < b.pixelFormat;
    });
    modes.erase(std::unique(modes.begin(), modes.end(), [](const VideoMode& a, const VideoMode& b) {
        return a.width == b.width && a.height == b.height && a.fps == b.fps && a.pixelFormat == b.pixelFormat;
    }), modes.end());
    return modes;
#else
    juce::ignoreUnused(deviceIndex);
    return {};
#endif
}

bool VideoCaptureManager::openDevice(int index,
                                     int requestedWidth,
                                     int requestedHeight,
                                     int requestedFps) {
    closeDevice();
    const auto devices = listDevices();
    if (index < 0 || index >= static_cast<int>(devices.size())) {
        setLastError("video device index out of range");
        return false;
    }

#if JUCE_LINUX
    return openDeviceLinux(devices[static_cast<std::size_t>(index)], requestedWidth, requestedHeight, requestedFps);
#else
    juce::ignoreUnused(devices, requestedWidth, requestedHeight, requestedFps);
    setLastError("video capture is currently implemented for Linux/V4L2 only");
    return false;
#endif
}

void VideoCaptureManager::closeDevice() {
#if JUCE_LINUX
    closeDeviceLinux();
#else
    running_.store(false, std::memory_order_release);
    if (captureThread_.joinable()) {
        captureThread_.join();
    }
    {
        std::lock_guard<std::mutex> stateLock(stateMutex_);
        activeDeviceIndex_ = -1;
    }
    {
        std::lock_guard<std::mutex> frameLock(frameMutex_);
        latestFrame_ = {};
    }
#endif
}

#if JUCE_LINUX

struct VideoCaptureManager::LinuxState {
    struct Buffer {
        void* start = nullptr;
        std::size_t length = 0;
    };

    int fd = -1;
    v4l2_buf_type bufferType = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    v4l2_pix_format pixelFormat{};
    std::vector<Buffer> buffers;
};

namespace {

bool xioctl(int fd, unsigned long request, void* arg) {
    int result = 0;
    do {
        result = ::ioctl(fd, request, arg);
    } while (result == -1 && errno == EINTR);
    return result != -1;
}

std::array<std::uint32_t, 3> preferredFormats() {
    return { V4L2_PIX_FMT_YUYV, V4L2_PIX_FMT_RGB24, V4L2_PIX_FMT_MJPEG };
}

bool deviceSupportsFormat(int fd, std::uint32_t pixelFormat) {
    v4l2_fmtdesc desc{};
    desc.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    while (xioctl(fd, VIDIOC_ENUM_FMT, &desc)) {
        if (desc.pixelformat == pixelFormat) {
            return true;
        }
        ++desc.index;
    }
    return false;
}

} // namespace

bool VideoCaptureManager::openDeviceLinux(const DeviceInfo& device,
                                          int requestedWidth,
                                          int requestedHeight,
                                          int requestedFps) {
    juce::ignoreUnused(requestedFps);

    auto linuxState = std::make_unique<LinuxState>();
    auto cleanupOnFailure = [&]() {
        if (!linuxState) {
            return;
        }
        for (auto& buffer : linuxState->buffers) {
            if (buffer.start != nullptr && buffer.length > 0) {
                ::munmap(buffer.start, buffer.length);
                buffer.start = nullptr;
                buffer.length = 0;
            }
        }
        if (linuxState->fd >= 0) {
            ::close(linuxState->fd);
            linuxState->fd = -1;
        }
    };

    linuxState->fd = ::open(device.path.c_str(), O_RDWR | O_NONBLOCK, 0);
    if (linuxState->fd < 0) {
        setLastError("failed to open " + device.path + ": " + std::strerror(errno));
        return false;
    }

    v4l2_capability caps{};
    if (!xioctl(linuxState->fd, VIDIOC_QUERYCAP, &caps)) {
        setLastError("VIDIOC_QUERYCAP failed for " + device.path);
        cleanupOnFailure();
        return false;
    }

    const auto captureType = (caps.capabilities & V4L2_CAP_VIDEO_CAPTURE_MPLANE)
        ? V4L2_BUF_TYPE_VIDEO_CAPTURE_MPLANE
        : V4L2_BUF_TYPE_VIDEO_CAPTURE;
    if (captureType != V4L2_BUF_TYPE_VIDEO_CAPTURE) {
        setLastError("multi-plane video capture is not supported yet for " + device.path);
        cleanupOnFailure();
        return false;
    }

    std::uint32_t chosenFormat = 0;
    for (const auto fmt : preferredFormats()) {
        if (deviceSupportsFormat(linuxState->fd, fmt)) {
            chosenFormat = fmt;
            break;
        }
    }
    if (chosenFormat == 0) {
        setLastError("no supported pixel format found for " + device.path + " (need YUYV, RGB24, or MJPEG)");
        cleanupOnFailure();
        return false;
    }

    linuxState->bufferType = captureType;

    v4l2_format format{};
    format.type = captureType;
    format.fmt.pix.width = static_cast<__u32>(std::max(160, requestedWidth));
    format.fmt.pix.height = static_cast<__u32>(std::max(120, requestedHeight));
    format.fmt.pix.pixelformat = chosenFormat;
    format.fmt.pix.field = V4L2_FIELD_ANY;
    if (!xioctl(linuxState->fd, VIDIOC_S_FMT, &format)) {
        const int savedErrno = errno;
        if (savedErrno != EBUSY || !xioctl(linuxState->fd, VIDIOC_G_FMT, &format)) {
            setLastError("VIDIOC_S_FMT failed for " + device.path + ": " + std::string(std::strerror(savedErrno)));
            cleanupOnFailure();
            return false;
        }
    }
    linuxState->pixelFormat = format.fmt.pix;

    if (requestedFps > 0) {
        v4l2_streamparm streamParams{};
        streamParams.type = captureType;
        streamParams.parm.capture.timeperframe.numerator = 1;
        streamParams.parm.capture.timeperframe.denominator = static_cast<__u32>(requestedFps);
        xioctl(linuxState->fd, VIDIOC_S_PARM, &streamParams);
    }

    v4l2_requestbuffers requestBuffers{};
    requestBuffers.count = 4;
    requestBuffers.type = captureType;
    requestBuffers.memory = V4L2_MEMORY_MMAP;
    if (!xioctl(linuxState->fd, VIDIOC_REQBUFS, &requestBuffers) || requestBuffers.count < 2) {
        setLastError("VIDIOC_REQBUFS failed for " + device.path + ": " + std::string(std::strerror(errno)));
        cleanupOnFailure();
        return false;
    }

    linuxState->buffers.resize(requestBuffers.count);
    for (std::size_t i = 0; i < linuxState->buffers.size(); ++i) {
        v4l2_buffer buffer{};
        buffer.type = captureType;
        buffer.memory = V4L2_MEMORY_MMAP;
        buffer.index = static_cast<__u32>(i);
        if (!xioctl(linuxState->fd, VIDIOC_QUERYBUF, &buffer)) {
            setLastError("VIDIOC_QUERYBUF failed for " + device.path + ": " + std::string(std::strerror(errno)));
            cleanupOnFailure();
            return false;
        }

        linuxState->buffers[i].length = buffer.length;
        linuxState->buffers[i].start = ::mmap(nullptr,
                                              buffer.length,
                                              PROT_READ | PROT_WRITE,
                                              MAP_SHARED,
                                              linuxState->fd,
                                              buffer.m.offset);
        if (linuxState->buffers[i].start == MAP_FAILED) {
            linuxState->buffers[i].start = nullptr;
            setLastError("mmap failed for " + device.path + ": " + std::string(std::strerror(errno)));
            cleanupOnFailure();
            return false;
        }
    }

    for (std::size_t i = 0; i < linuxState->buffers.size(); ++i) {
        v4l2_buffer buffer{};
        buffer.type = captureType;
        buffer.memory = V4L2_MEMORY_MMAP;
        buffer.index = static_cast<__u32>(i);
        if (!xioctl(linuxState->fd, VIDIOC_QBUF, &buffer)) {
            setLastError("VIDIOC_QBUF failed for " + device.path + ": " + std::string(std::strerror(errno)));
            cleanupOnFailure();
            return false;
        }
    }

    auto streamType = captureType;
    if (!xioctl(linuxState->fd, VIDIOC_STREAMON, &streamType)) {
        setLastError("VIDIOC_STREAMON failed for " + device.path + ": " + std::string(std::strerror(errno)));
        cleanupOnFailure();
        return false;
    }

    {
        std::lock_guard<std::mutex> frameLock(frameMutex_);
        latestFrame_ = {};
    }
    {
        std::lock_guard<std::mutex> stateLock(stateMutex_);
        activeDeviceIndex_ = device.index;
        lastError_.clear();
    }

    linux_ = std::move(linuxState);
    running_.store(true, std::memory_order_release);
    captureThread_ = std::thread([this]() { captureLoopLinux(); });
    return true;
}

void VideoCaptureManager::closeDeviceLinux() {
    running_.store(false, std::memory_order_release);
    if (captureThread_.joinable()) {
        captureThread_.join();
    }

    if (linux_) {
        if (linux_->fd >= 0) {
            auto streamType = linux_->bufferType;
            ::ioctl(linux_->fd, VIDIOC_STREAMOFF, &streamType);
        }

        for (auto& buffer : linux_->buffers) {
            if (buffer.start != nullptr && buffer.length > 0) {
                ::munmap(buffer.start, buffer.length);
                buffer.start = nullptr;
                buffer.length = 0;
            }
        }

        if (linux_->fd >= 0) {
            ::close(linux_->fd);
            linux_->fd = -1;
        }

        linux_.reset();
    }

    {
        std::lock_guard<std::mutex> stateLock(stateMutex_);
        activeDeviceIndex_ = -1;
    }
    {
        std::lock_guard<std::mutex> frameLock(frameMutex_);
        latestFrame_ = {};
    }
}

void VideoCaptureManager::captureLoopLinux() {
    uint64_t sequence = 0;
    while (running_.load(std::memory_order_acquire)) {
        if (!linux_ || linux_->fd < 0) {
            break;
        }

        pollfd descriptor{};
        descriptor.fd = linux_->fd;
        descriptor.events = POLLIN;
        const int pollResult = ::poll(&descriptor, 1, 250);
        if (pollResult <= 0) {
            continue;
        }

        v4l2_buffer buffer{};
        buffer.type = linux_->bufferType;
        buffer.memory = V4L2_MEMORY_MMAP;
        if (!xioctl(linux_->fd, VIDIOC_DQBUF, &buffer)) {
            if (errno == EAGAIN) {
                continue;
            }
            setLastError("VIDIOC_DQBUF failed: " + std::string(std::strerror(errno)));
            break;
        }

        if (buffer.index >= linux_->buffers.size()) {
            setLastError("driver returned out-of-range video buffer index");
            break;
        }

        const auto width = static_cast<int>(linux_->pixelFormat.width);
        const auto height = static_cast<int>(linux_->pixelFormat.height);
        const auto* bytes = static_cast<const std::uint8_t*>(linux_->buffers[buffer.index].start);
        FrameData frame;
        frame.width = width;
        frame.height = height;
        frame.sequence = ++sequence;

        const auto pixelFormat = linux_->pixelFormat.pixelformat;
        bool converted = false;
        if (pixelFormat == V4L2_PIX_FMT_YUYV) {
            convertYuyvToRgba(bytes, width, height, frame.rgba);
            converted = true;
        } else if (pixelFormat == V4L2_PIX_FMT_RGB24) {
            convertRgb24ToRgba(bytes, width, height, frame.rgba);
            converted = true;
        } else if (pixelFormat == V4L2_PIX_FMT_MJPEG) {
            converted = decodeMjpegToRgba(bytes, static_cast<std::size_t>(buffer.bytesused), frame);
            frame.sequence = sequence;
        }

        if (converted) {
            std::lock_guard<std::mutex> frameLock(frameMutex_);
            latestFrame_ = std::move(frame);
        }

        if (!xioctl(linux_->fd, VIDIOC_QBUF, &buffer)) {
            setLastError("VIDIOC_QBUF failed during capture loop");
            break;
        }
    }

    running_.store(false, std::memory_order_release);
}

#endif // JUCE_LINUX

} // namespace manifold::video
