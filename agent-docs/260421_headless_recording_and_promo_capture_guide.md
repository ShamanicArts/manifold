# Headless Recording & Promo Capture Guide

**Audience:** anyone (human or agent) capturing audio + GL-rendered UI frames from Manifold in headless mode, then muxing to MP4.
**Reference implementations:** `test_rack_osc_promo.py`, `manifold/headless/ManifoldHeadless.cpp`, `manifold/core/BehaviorCoreEditor.cpp`, `manifold/primitives/control/ControlServer.cpp`.
**Key binaries:** `ManifoldHeadless`, `Manifold_Standalone`.

This doc captures how the screenshot/recording pipeline works, how to run it, how it was debugged, and the traps that burned time.

---

## 1. What the pipeline does

The system can capture **real OpenGL-rendered UI frames** plus **real output audio** from Manifold running headlessly (no X11 window), then mux them into a viewable MP4.

| Layer | Responsibility |
|-------|---------------|
| **IPC command parser** | `CommandParser.h` — parses `SCREENSHOT`, `RECORD START <fmt> <path>`, `RECORD STOP`, `RECORD STATUS` |
| **Control server** | `ControlServer.cpp` — owns recording state, starts/stops capture, manages the audio ring buffer |
| **Audio thread** | `BehaviorCoreProcessor::processBlock()` — writes output samples into `AudioCaptureRing` while recording is active |
| **UI thread** | `BehaviorCoreEditor::timerCallback()` — captures frames at ~30fps during recording |
| **Headless harness** | `ManifoldHeadless.cpp` — runs audio and UI on separate threads, drives everything without a display server |
| **Automation script** | `test_rack_osc_promo.py` — loads DSP, switches UI, animates parameters, starts/stops recording, muxes with ffmpeg |

---

## 2. Architecture — why it works

### 2.1 Audio and UI must run on separate threads

**The single most important invariant.** The original headless harness ran `processBlock()` and `callPendingTimersSynchronously()` on the same loop iteration. UI rendering + PNG writes took ~40ms per frame at 1000×640. That made the harness fall behind real-time: 5 seconds of wall-clock time produced only ~1.7 seconds of audio, while frames were captured based on wall-clock time. Muxing 150 frames at 30fps against 1.7s of audio gave massive A/V desync.

Fix in `ManifoldHeadless.cpp`:
- **Audio thread:** tight loop calling `processBlock()`, sleeping to maintain exact block cadence.
- **Main thread:** polls `callPendingTimersSynchronously()` every 1ms so UI timers fire as close to 30Hz as possible, without ever blocking audio.

```cpp
std::thread audioThread([&]() {
    while (!shouldQuit.load() && !audioDone.load()) {
        // processBlock() + sleep to maintain sampleRate/blockSize cadence
    }
});

while (!shouldQuit.load() && !audioDone.load()) {
    if (testUi) {
        juce::Timer::callPendingTimersSynchronously();
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(1));
}
```

### 2.2 Frame capture happens in `BehaviorCoreEditor::timerCallback()`

The editor runs at 30Hz (`startTimerHz(30)`). During recording it checks `msSinceLast >= 33` and, if enough time has elapsed, captures a frame via `ImGuiDirectHost::captureScreenshot()` (OpenGL framebuffer readback) or JUCE `createComponentSnapshot()` as fallback.

```cpp
if (processorRef.getControlServer().isRecording()) {
    auto& rec = processorRef.getControlServer().getRecordingState();
    const auto frameNow = Clock::now();
    // ...throttle to ~30fps...
    const int frameNum = rec.frameCounter.fetch_add(1);
    juce::Image frameImage = directHost_.captureScreenshot();
    // ...write PNG...
}
```

### 2.3 Audio capture is lock-free

`AudioCaptureRing` is a lock-free SPSC ring buffer (audio thread writes, writer thread reads). Capacity is ~1M floats (~11.6s @ 44.1kHz stereo). The writer thread runs in the background, drains the ring, and writes to a JUCE `WavAudioFormat` writer.

```cpp
// Audio thread (processBlock)
if (controlServer.isRecording()) {
    controlServer.writeAudioSamples(outL, outR, numSamples);
}

// Writer thread (ControlServer::startRecording)
while (recordingState.recording.load()) {
    n = audioRing->read(temp.data(), kTempSize);
    if (n > 0 && audioWriter) {
        audioWriter->writeFromAudioSampleBuffer(buf, 0, samples);
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
}
```

### 2.4 EGL offscreen context for true headless GL

`ImGuiDirectHost` creates an EGL PBuffer surface when no native window is available. This lets `captureScreenshot()` call `glReadPixels()` on real rendered pixels even without X11.

Key ordering:
```cpp
// In ImGuiDirectHost::initialise()
if (!hasNativeWindow) {
    eglContext_ = std::make_unique<EglOffscreenContext>(width, height);
    eglContext_->makeCurrent();
    juce::gl::loadFunctions();  // MUST happen before ImGui_ImplOpenGL3_Init
}
ImGui_ImplOpenGL3_Init(glslVersion);
```

Without `juce::gl::loadFunctions()`, the ImGui GL backend has no function pointers and will crash or render black.

---

## 3. IPC commands

| Command | Response | Effect |
|---------|----------|--------|
| `SCREENSHOT /path/to/out.png` | `OK {"path":"...","captured":true}` | Queues screenshot request; UI thread captures next frame |
| `RECORD START png /tmp/my_rec` | `OK {"format":"png","recording":true,...}` | Starts audio writer thread + frame capture |
| `RECORD STOP` | `OK {"recording":false,"frameCount":N,...}` | Stops audio thread, drains ring, writes manifest.json |
| `RECORD STATUS` | `OK {"recording":true,"frameCount":N,...}` | Current state without changing it |

The `RECORD START` command takes a **directory** path, not a file. It creates:
- `<dir>/audio.wav` — 16-bit stereo WAV
- `<dir>/frame_0001.png` … `frame_NNNN.png` — PNG sequence
- `<dir>/manifest.json` — fps, sampleRate, frame list

---

## 4. Automation script — `test_rack_osc_promo.py`

### 4.1 What it does

1. Starts `ManifoldHeadless --test-ui --duration 0`
2. Loads a DSP script via `EVAL loadDspScript(...)`
3. Switches to a UI manifest via `UISWITCH <manifest>`
4. Configures oscillator parameters via `SET <path> <value>`
5. Starts recording: `RECORD START png <dir>`
6. Animates parameters for 5 seconds (pitch sweep, waveform cycle, etc.)
7. Stops recording: `RECORD STOP`
8. Muxes frames + WAV into MP4 via ffmpeg

### 4.2 The A/V sync fix — compute actual fps from audio duration

After recording, the script measures the real WAV duration and computes the exact fps:

```python
stats = analyze_wav(wav_path)
audio_duration = stats["sample_count"] / 2 / 44100.0  # stereo
actual_fps = len(frame_files) / audio_duration
```

Then passes `actual_fps` to ffmpeg, plus `-vsync cfr -async 1`:

```python
cmd = [
    "ffmpeg", "-y",
    "-framerate", str(actual_fps),
    "-start_number", "1",
    "-i", frame_pattern,
    "-i", wav_path,
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-vsync", "cfr", "-async", "1",
    out_mp4,
]
```

This guarantees every frame maps 1:1 to the correct audio time. Do NOT hardcode 30fps.

### 4.3 Matching editor size to the module

Set `MANIFOLD_PROFILE_WINDOW_SIZE=WxH` in the environment before starting headless. The oscillator rack module is 472×208, so:

```python
env["MANIFOLD_PROFILE_WINDOW_SIZE"] = "472x208"
proc = subprocess.Popen([HEADLESS_BIN, "--test-ui", "--duration", "0"],
                        env=env, ...)
```

This eliminates dark padding and speeds up rendering.

### 4.4 Removing the shared shell

The MANIFOLD header/sidebar is controlled by `"sharedShell": false` in the project manifest. The script creates a sibling directory with a temporary manifest:

```json
{
  "name": "StandaloneOscillator",
  "version": 1,
  "ui": {
    "root": "ui/standalone_osc.ui.lua",
    "sharedShell": false
  }
}
```

The manifest file **must** be named exactly `manifold.project.json5` — `isProjectManifestFile()` checks `file.getFileName().equalsIgnoreCase("manifold.project.json5")`. Any other name falls through to plain Lua loading and gets a syntax error.

---

## 5. End-to-end workflow

```bash
# 1. Build headless binary
cmake --build build-dev --target ManifoldHeadless

# 2. Run the automation script
cd /home/shamanic/dev/my-plugin-experiment
python3 test_rack_osc_promo.py

# 3. Inspect output
ffprobe -v error -show_entries stream=duration,nb_frames \
  -of default=noprint_wrappers=1 rack_osc_promo.mp4

# 4. Inspect a frame
file /tmp/test_rack_osc_promo/frame_0001.png
# → PNG image data, 472 x 208, 8-bit/color RGBA

# 5. Inspect audio
ffprobe -v error -show_entries stream=duration,sample_rate \
  -of default=noprint_wrappers=1 /tmp/test_rack_osc_promo/audio.wav
```

---

## 6. Common issues and fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Audio much shorter than video | UI rendering blocked audio thread | Run audio + UI on separate threads (§2.1) |
| Audio/video drift | Hardcoded 30fps mux vs actual frame timing | Compute `actual_fps = frames / audio_duration` (§4.2) |
| Black/transparent frames | `glReadPixels()` before ImGui init or no GL context | Ensure EGL PBuffer + `juce::gl::loadFunctions()` before `ImGui_ImplOpenGL3_Init()` (§2.4) |
| Manifest not loading | Wrong filename | Must be exactly `manifold.project.json5` (§4.4) |
| Frames have shell chrome | `sharedShell: true` | Create manifest with `"sharedShell": false` (§4.4) |
| Empty dark padding around module | Editor bigger than module | Set `MANIFOLD_PROFILE_WINDOW_SIZE` to module bounds (§4.3) |
| Writer thread exits early | `recording=true` set after thread creation | Set atomic before spawning thread; already fixed in current code |
| Audio truncated at end | Ring buffer not drained on stop | Post-loop drain already implemented in `ControlServer.cpp` |

---

## 7. Extending the pipeline

### 7.1 Recording a different module

1. Create a standalone UI manifest for that module (copy `StandaloneOsc/` pattern).
2. Know the module's pixel dimensions (check its Lua bounds or measure with a screenshot).
3. Update `MANIFOLD_PROFILE_WINDOW_SIZE` to those dimensions.
4. Update parameter paths in the animation loop to the new module's OSC endpoints.

### 7.2 Adding a new `RECORD START` format

Currently only `"png"` and `"jpg"` are accepted in `CommandParser.h`. To add e.g. `"mp4"`:

1. Add validation in `CommandParser::toLower(format)` check.
2. In `ControlServer::startRecording()`, spawn an ffmpeg subprocess that reads from the ring buffer and encodes directly.
3. Or keep the PNG+WAV intermediate approach and call ffmpeg internally in `stopRecording()`.

### 7.3 Higher frame rates

The timer runs at 30Hz. For 60fps:
- Change `startTimerHz(60)` in `BehaviorCoreEditor.cpp`.
- Lower the frame capture throttle from 33ms to 16ms.
- Be aware that PNG writing in `timerCallback()` is synchronous and may drop frames if it can't keep up. Move PNG writes to a background thread if needed.

### 7.4 Capturing from the standalone (windowed) instead of headless

The same IPC commands work on `Manifold_Standalone`. The only difference is the standalone has a real window, so `ImGuiDirectHost` uses the native GL context instead of EGL. Screenshots and recording work identically.

---

## 8. Validation checklist

Before claiming a recording pipeline is working:

- [ ] Audio WAV duration matches wall-clock recording time (±50ms)
- [ ] Frame count × (1/actual_fps) equals audio duration (±1 frame)
- [ ] MP4 video stream duration equals audio stream duration (ffprobe)
- [ ] At least one frame contains real rendered content (not black/transparent)
- [ ] Audio has non-silent signal (`max_abs > 1000` for 16-bit)
- [ ] Parameters visibly animate across frames (e.g. waveform display changes)
- [ ] No shared shell chrome in frames (if intended)
- [ ] Editor size matches module size (no dark padding)

---

## 9. Key files reference

| File | Role |
|------|------|
| `manifold/primitives/control/CommandParser.h` | Parses screenshot/recording IPC commands |
| `manifold/primitives/control/ControlServer.cpp` | Recording state, audio ring, writer thread |
| `manifold/primitives/control/ControlServer.h` | `AudioCaptureRing`, `RecordingState` structs |
| `manifold/core/BehaviorCoreProcessor.cpp` | `writeAudioSamples()` call in `processBlock()` |
| `manifold/core/BehaviorCoreEditor.cpp` | Frame capture logic in `timerCallback()` |
| `manifold/core/BehaviorCoreEditor.h` | Frame capture timing state |
| `manifold/ui/imgui/ImGuiDirectHost.cpp` | `captureScreenshot()` via `glReadPixels()` |
| `manifold/ui/imgui/ImGuiDirectHost.h` | `EglOffscreenContext`, `skipNextSwap_`, `forceNextRender_` |
| `manifold/headless/ManifoldHeadless.cpp` | Headless harness — audio + UI threads |
| `test_rack_osc_promo.py` | Full automation script |
| `UserScripts/projects/StandaloneOsc/` | Example standalone oscillator project |

---

## 10. Lessons learned, condensed

1. **Audio and UI must never share a thread.** The headless harness was the root cause of the A/V sync bug — not ffmpeg, not frame drops, not the ring buffer. `processBlock()` has hard real-time requirements; UI rendering does not.

2. **Always measure actual fps from the audio file.** Hardcoding 30fps in ffmpeg is guaranteed desync if the timer thread is late or early. The audio file is the ground truth.

3. **EGL offscreen works, but order matters.** `juce::gl::loadFunctions()` must happen after making the EGL context current and before `ImGui_ImplOpenGL3_Init()`. Get it wrong and you get black frames with no error message.

4. **The manifest filename is exact.** `manifold.project.json5` is the only string `isProjectManifestFile()` accepts. A temp file named anything else silently falls through to Lua parsing and explodes with a syntax error.

5. **PNG writes in the timer callback are a bottleneck.** At 1000×640 each PNG is ~100KB and takes ~5–10ms to compress and write. This is fine at 30fps, but 60fps or 4K will need a background writer thread. The infrastructure for that (`PendingFrame`, `frameWriterThread_`) was sketched but not fully landed — the threaded harness made it unnecessary for the current use case.

6. **`_Exit(0)` is a band-aid.** The headless harness intentionally leaks the editor on shutdown (`editor.release()`) and calls `_Exit(0)` to avoid late-destructor segfaults in offscreen GL state. This is test-only; do not copy into production plugin code.
