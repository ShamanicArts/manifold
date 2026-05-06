#pragma once

#include <algorithm>
#include <array>
#include <atomic>
#include <cstring>
#include <functional>
#include <juce_core/juce_core.h>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

#if !JUCE_WINDOWS
#include <fcntl.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#endif

#include "BehaviorControlState.h"
#include "BehaviorRuntimeTelemetry.h"
#include "../scripting/ScriptingConfig.h"
#include "../ui/FrameTimings.h"

// Forward declarations
class ScriptableProcessor;
class CaptureBuffer;
class LuaEngine;
struct ParseResult;

// ============================================================================
// Lock-free SPSC command queue: control thread -> audio thread
// ============================================================================

enum class ControlOperation {
  Legacy = 0,
  Set,
  Get,
  Trigger,
};

enum class ControlValueKind {
  None = 0,
  Float,
  Int,
  Bool,
  Trigger,
};

struct ControlValuePayload {
  ControlValueKind kind = ControlValueKind::None;
  float floatValue = 0.0f;
  int intValue = 0;
  bool boolValue = false;
};

struct ControlCommand {
  enum class Type {
    None,
    Commit,            // commit N bars retrospectively
    ForwardCommit,     // wait N bars, then commit N bars retrospectively
    SetTempo,          // set tempo
    StartRecording,    // start recording
    ToggleOverdub,     // toggle overdub mode on/off
    SetOverdubEnabled, // set overdub mode explicitly
    StopRecording,     // stop recording
    GlobalStop,        // stop all layer playback
    GlobalPlay,        // resume all paused layers
    GlobalPause,       // pause all playing layers
    SetActiveLayer,    // select layer
    LayerMute,         // mute/unmute layer
    LayerSpeed,        // set layer speed
    LayerReverse,      // set layer reverse
    LayerVolume,       // set layer volume
    LayerStop,         // stop playback without clearing
    LayerPlay,         // resume layer playback
    LayerPause,        // pause layer playback
    LayerClear,        // clear layer
    LayerSeek, // seek layer playhead (floatParam = normalized 0-1 position)
    ClearAllLayers,  // clear all layers
    SetRecordMode,   // set record mode
    SetMasterVolume,    // set master volume
    SetInputVolume,     // set input volume
    SetPassthroughEnabled, // toggle input passthrough
    SetTargetBPM,       // set target BPM
    UISwitch,           // switch UI script (path in stringParam)
  };

  // New resolver-oriented internal payload shape.
  // During migration, legacy `type/intParam/floatParam` stays supported.
  ControlOperation operation = ControlOperation::Legacy;
  int endpointId = -1;
  ControlValuePayload value;

  Type type = Type::None;
  int intParam = 0;        // layer index, mode enum, etc.
  float floatParam = 0.0f; // bars, bpm, speed, volume, etc.
};

template <std::size_t Capacity> class SPSCQueue {
public:
  bool enqueue(const ControlCommand &cmd) {
    const std::size_t w = writeIdx.load(std::memory_order_relaxed);
    const std::size_t next = (w + 1) % Capacity;
    if (next == readIdx.load(std::memory_order_acquire))
      return false; // full
    ring[w] = cmd;
    writeIdx.store(next, std::memory_order_release);
    return true;
  }

  bool dequeue(ControlCommand &cmd) {
    const std::size_t r = readIdx.load(std::memory_order_relaxed);
    if (r == writeIdx.load(std::memory_order_acquire))
      return false; // empty
    cmd = ring[r];
    readIdx.store((r + 1) % Capacity, std::memory_order_release);
    return true;
  }

private:
  std::array<ControlCommand, Capacity> ring{};
  std::atomic<std::size_t> writeIdx{0};
  std::atomic<std::size_t> readIdx{0};
};

// ============================================================================
// Lock-free event ring: audio thread -> control thread (for broadcast)
// ============================================================================

struct ControlEvent {
  char json[scripting::BufferConfig::MAX_JSON_PAYLOAD_SIZE]; // pre-formatted JSON string
  int length = 0;
};

template <std::size_t Capacity> class EventRing {
public:
  // Called from audio thread only
  void push(const char *jsonStr, int len) {
    const std::size_t w = writeIdx.load(std::memory_order_relaxed);
    auto &slot = ring[w];
    const auto clampedLen = len < 0 ? 0 : len;
    const auto copyLen = std::min<std::size_t>(static_cast<std::size_t>(clampedLen),
                                               sizeof(slot.json) - 1);
    std::memcpy(slot.json, jsonStr, copyLen);
    slot.json[copyLen] = '\0';
    slot.length = static_cast<int>(copyLen);
    writeIdx.store((w + 1) % Capacity, std::memory_order_release);
  }

  // Called from server thread only. Returns number of events read.
  int drain(ControlEvent *out, int maxEvents) {
    std::size_t count = 0;
    while (count < static_cast<std::size_t>(std::max(0, maxEvents))) {
      const std::size_t r = readIdx.load(std::memory_order_relaxed);
      if (r == writeIdx.load(std::memory_order_acquire))
        break;
      out[count] = ring[r];
      readIdx.store((r + 1) % Capacity, std::memory_order_release);
      ++count;
    }
    return static_cast<int>(count);
  }

private:
  std::array<ControlEvent, Capacity> ring{};
  std::atomic<std::size_t> writeIdx{0};
  std::atomic<std::size_t> readIdx{0};
};

// ============================================================================
// Atomic state snapshot - updated each audio block by the processor
// ============================================================================

struct AtomicLayerState {
  std::atomic<int> state{0};       // ManifoldLayer::State enum as int
  std::atomic<int> length{0};      // buffer length in samples
  std::atomic<int> playheadPos{0}; // current position
  std::atomic<float> speed{1.0f};
  std::atomic<bool> reversed{false};
  std::atomic<float> volume{1.0f};
  std::atomic<float> numBars{0.0f};
  std::atomic<bool> muted{false};  // Mute is independent of playback state
};

struct AtomicState {
  static constexpr int MAX_LAYERS = scripting::LayerConfig::MAX_LAYERS;

  std::atomic<float> tempo{120.0f};
  std::atomic<float> targetBPM{120.0f};
  std::atomic<float> samplesPerBar{0.0f};
  std::atomic<double> sampleRate{44100.0};
  std::atomic<int> captureSize{0};
  std::atomic<int> captureWritePos{0};
  std::atomic<float> captureLevel{0.0f};
  std::atomic<bool> isRecording{false};
  std::atomic<bool> overdubEnabled{false};
  std::atomic<bool> forwardArmed{false};
  std::atomic<float> forwardBars{0.0f};
  std::atomic<bool> graphEnabled{false};
  std::atomic<int> recordMode{0};
  std::atomic<int> activeLayer{0};
  std::atomic<float> masterVolume{1.0f};
  std::atomic<float> inputVolume{1.0f};
  std::atomic<bool> passthroughEnabled{true};
  std::atomic<double> playTime{0.0};
  std::atomic<int> commitCount{0};
  std::atomic<double> uptimeSeconds{0.0};

  AtomicLayerState layers[MAX_LAYERS];
};

// ============================================================================
// Audio injection buffer: server thread loads WAV, audio thread drains into
// CaptureBuffer as if it were live mic input.
// ============================================================================

struct InjectionBuffer {
  std::vector<float> samplesL;
  std::vector<float> samplesR;
  int totalSamples = 0;
};

// ============================================================================
// UI switch request: server thread sets path, audio thread reads and forwards
// ============================================================================

struct UISwitchRequest {
  std::string path;
  std::atomic<bool> pending{false};
  std::mutex mutex;
};

struct UIRendererRequest {
  std::string mode;
  std::atomic<bool> pending{false};
  std::mutex mutex;
};

// ============================================================================
// Screenshot request: server thread sets path, UI thread captures and saves
// ============================================================================

struct ScreenshotRequest {
  std::string outputPath;
  std::atomic<bool> pending{false};
  std::atomic<bool> completed{false};
  std::atomic<bool> success{false};
  std::mutex mutex;
};

// ============================================================================
// Lock-free audio capture ring buffer: audio thread -> writer thread
// ============================================================================

class AudioCaptureRing {
public:
  static constexpr std::size_t CAPACITY = 1 << 20; // ~1M floats = ~11.6s @ 44.1k stereo

  // Write interleaved stereo floats. Called from audio thread only.
  bool write(const float* left, const float* right, int numSamples) {
    if (left == nullptr || numSamples <= 0) return false;
    const std::size_t toWrite = static_cast<std::size_t>(numSamples) * 2;
    if (toWrite > CAPACITY) return false;
    const std::size_t w = writeIdx.load(std::memory_order_relaxed);
    const std::size_t r = readIdx.load(std::memory_order_acquire);
    const std::size_t available = (r <= w) ? (CAPACITY - (w - r) - 1) : (r - w - 1);
    if (toWrite > available) return false; // ring full, drop
    for (int i = 0; i < numSamples; ++i) {
      buffer[(w + i * 2) & (CAPACITY - 1)] = left[i];
      buffer[(w + i * 2 + 1) & (CAPACITY - 1)] = (right != nullptr) ? right[i] : left[i];
    }
    writeIdx.store((w + toWrite) & (CAPACITY - 1), std::memory_order_release);
    return true;
  }

  // Read interleaved stereo floats. Called from writer thread only.
  std::size_t read(float* out, std::size_t maxSamples) {
    const std::size_t r = readIdx.load(std::memory_order_relaxed);
    const std::size_t w = writeIdx.load(std::memory_order_acquire);
    if (r == w) return 0;
    const std::size_t available = (w >= r) ? (w - r) : (CAPACITY - r + w);
    const std::size_t toRead = std::min(available, maxSamples);
    for (std::size_t i = 0; i < toRead; ++i) {
      out[i] = buffer[(r + i) & (CAPACITY - 1)];
    }
    readIdx.store((r + toRead) & (CAPACITY - 1), std::memory_order_release);
    return toRead;
  }

private:
  std::array<float, CAPACITY> buffer{};
  std::atomic<std::size_t> writeIdx{0};
  std::atomic<std::size_t> readIdx{0};
};

// ============================================================================
// Forward declarations
// ============================================================================

namespace juce {
  class AudioFormatWriter;
}

// ============================================================================
// Debug capture: screenshot and recording state
// ============================================================================

struct CaptureState {
  std::string lastScreenshotPath;
  std::atomic<bool> captureInProgress{false};
  std::mutex mutex;
};

struct RecordingOptions {
  bool cropEnabled = false;
  std::string cropNodeId;
  uint64_t cropStableId = 0;
  int cropX = 0;
  int cropY = 0;
  int cropW = 0;
  int cropH = 0;
  bool streamFramesToDisk = false;
  bool muxAfterStop = false;
  int fps = 30;
  std::string muxOutputPath;
};

struct RecordingState {
  std::string format = "png";       // png, jpg
  int duration = 0;                 // 0 = manual stop
  int startTimestamp = 0;          // time when recording started
  std::string outputPath;          // output directory or file
  std::string outputDir;           // resolved output directory
  std::atomic<bool> recording{false};
  std::atomic<int> frameCounter{0};
  std::atomic<double> startTimeSec{0.0};
  std::vector<std::string> framePaths;  // captured frame paths
  RecordingOptions options;
  std::mutex mutex;

  // Audio capture
  std::unique_ptr<AudioCaptureRing> audioRing;
  juce::AudioFormatWriter* audioWriter = nullptr; // owned, deleted in stopRecording
  std::thread audioWriterThread;
  double audioSampleRate = 44100.0;
  int audioChannels = 2;
};

// ============================================================================
// ControlServer - Unix socket IPC for observation and control
// ============================================================================

class ControlServer {
public:
  ControlServer();
  ~ControlServer();

  // Lifecycle - called from processor
  void start(ScriptableProcessor *processor);
  void stop();

  // Audio thread interface - all lock-free
  SPSCQueue<scripting::QueueConfig::COMMAND_QUEUE_SIZE> &getCommandQueue() { return commandQueue; }
  bool enqueueCommand(const ControlCommand &command);
  void pushEvent(const char *json, int len) { eventRing.push(json, len); }
  AtomicState &getAtomicState() { return atomicState; }
  const AtomicState &getAtomicState() const { return atomicState; }
  manifold::BehaviorControlState &getBehaviorControlState() { return behaviorControlState; }
  const manifold::BehaviorControlState &getBehaviorControlState() const { return behaviorControlState; }
  manifold::BehaviorRuntimeTelemetry &getBehaviorRuntimeTelemetry() { return behaviorRuntimeTelemetry; }
  const manifold::BehaviorRuntimeTelemetry &getBehaviorRuntimeTelemetry() const { return behaviorRuntimeTelemetry; }
  void syncOwnedStateFromLegacyMirror();
  void syncLegacyMirrorFromOwnedState();

  // Audio injection: audio thread calls this each block to drain injected
  // audio into the CaptureBuffer. Returns number of samples injected.
  int drainInjection(CaptureBuffer &capture, int maxSamples, float gain = 1.0f);

  // Check if injection is in progress
  bool isInjecting() const {
    return injectionActive.load(std::memory_order_acquire);
  }

  // Get socket path (for logging/debugging)
  const std::string &getSocketPath() const { return socketPath; }

  // Snapshot JSON used by IPC/OSCQuery state queries.
  std::string getStateJson();
  std::string getDiagnosticsJson();
  std::string runCommand(const std::string &cmd) { return processCommand(cmd); }

  void setFrameTimings(FrameTimings *timings) { frameTimings = timings; }
  FrameTimings *getFrameTimings() const { return frameTimings; }
  void setLuaEngine(LuaEngine *engine) { luaEngine = engine; }
  LuaEngine *getLuaEngine() const { return luaEngine; }
  void setEditorStateProvider(std::function<std::string()> provider) {
    std::lock_guard<std::mutex> lock(editorStateProviderMutex);
    editorStateProvider = std::move(provider);
  }
  std::string getEditorStateJson() const;

  // UI switch / renderer request access
  UISwitchRequest &getUISwitchRequest() { return uiSwitchRequest; }
  UIRendererRequest &getUIRendererRequest() { return uiRendererRequest; }
  void setCurrentUIRendererMode(int mode) {
    currentUIRendererMode.store(mode, std::memory_order_relaxed);
  }
  int getCurrentUIRendererMode() const {
    return currentUIRendererMode.load(std::memory_order_relaxed);
  }

  // Screenshot request access (for UI thread to read/write)
  ScreenshotRequest &getScreenshotRequest() { return screenshotRequest; }

  // Debug capture: screenshot and recording
  std::string captureScreenshot(const std::string &path);
  std::string startRecording(const std::string &format, int duration, const std::string &path);
  std::string startRecording(const std::string &format, int duration, const std::string &path, const RecordingOptions& options);
  std::string stopRecording();
  std::string getRecordingStatus();

  RecordingState &getRecordingState() { return recordingState; }
  const RecordingState &getRecordingState() const { return recordingState; }

  // Audio thread: write output samples to recording ring buffer
  void writeAudioSamples(const float *left, const float *right, int numSamples);
  bool isRecording() const { return recordingState.recording.load(std::memory_order_acquire); }

private:
  void acceptLoop();
  void clientLoop(int clientFd);
  std::string processCommand(const std::string &cmd);

  // Command dispatch: prefix handlers (Stage 1 - short-circuit before parser)
  std::optional<std::string> handleDspRun(const std::string& cmd, const std::string& upperTrimmedCmd);
  std::optional<std::string> handlePerfReset(const std::string& upperTrimmedCmd);
  std::optional<std::string> handleEval(const std::string& cmd, const std::string& upperTrimmedCmd);
  std::optional<std::string> handleDirectSet(const std::string& cmd, const std::string& upperTrimmedCmd);

  // Command dispatch: parsed handlers (Stage 2 - after CommandParser::parse)
  std::string handleEnqueue(const ParseResult& result);
  std::string handleQuery(const ParseResult& result);
  std::string handleWatch(const ParseResult& result);
  std::string handleInject(const ParseResult& result);
  std::string handleInjectionStatus(const ParseResult& result);
  std::string handleUISwitch(const ParseResult& result);
  std::string handleUIRenderer(const ParseResult& result);
  std::string handleScreenshot(const ParseResult& result);
  std::string handleRecordStart(const ParseResult& result);
  std::string handleRecordStop(const ParseResult& result);
  std::string handleRecordStatus(const ParseResult& result);
  std::string handleNoOpWarning(const ParseResult& result);
  std::string handleError(const ParseResult& result);

  // Dispatch map registration
  void registerCommandHandlers();

  std::string buildStateJson();
  std::string buildDiagnoseJson();

  void addWatcher(int fd);
  void removeWatcher(int fd);
  void broadcastToWatchers(const std::string &msg);
  void drainAndBroadcastEvents();

  // Load a WAV file and prepare injection buffer (called from server thread)
  std::string loadFileForInjection(const std::string &filepath);

  ScriptableProcessor *owner = nullptr;
  std::string socketPath;
  int serverFd = -1;
  std::atomic<bool> running{false};

  std::thread acceptThread;
  std::thread broadcastThread;

  // Client management
  std::mutex clientsMutex;
  std::vector<int> clientFds;

  // Watcher (EVENT stream) management
  std::mutex watchersMutex;
  std::vector<int> watcherFds;

  // Lock-free queues
  std::mutex commandQueueWriteMutex;
  SPSCQueue<scripting::QueueConfig::COMMAND_QUEUE_SIZE> commandQueue;
  EventRing<scripting::QueueConfig::EVENT_QUEUE_SIZE> eventRing;
  manifold::BehaviorControlState behaviorControlState;
  manifold::BehaviorRuntimeTelemetry behaviorRuntimeTelemetry;
  AtomicState atomicState;

  // Audio injection state
  // Server thread writes a new InjectionBuffer then sets injectionActive.
  // Audio thread reads from it and advances injectionReadPos.
  std::mutex injectionMutex; // only held by server thread during load
  InjectionBuffer injectionBuffer;
  std::atomic<int> injectionReadPos{0};
  std::atomic<bool> injectionActive{false};

  // Stats
  std::atomic<int> commandsProcessed{0};
  std::atomic<int> eventsDropped{0};

  // UI switch / renderer requests (set by server thread, read by GUI thread)
  UISwitchRequest uiSwitchRequest;
  UIRendererRequest uiRendererRequest;
  ScreenshotRequest screenshotRequest;
  std::atomic<int> currentUIRendererMode{3};

  FrameTimings *frameTimings = nullptr;
  LuaEngine *luaEngine = nullptr;
  mutable std::mutex editorStateProviderMutex;
  std::function<std::string()> editorStateProvider;

  // Debug capture state
  CaptureState captureState;
  RecordingState recordingState;

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ControlServer)
};
