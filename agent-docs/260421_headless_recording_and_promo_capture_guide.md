# Headless Recording & Promo Capture Guide

**Audience:** anyone (human or agent) capturing audio + GL-rendered UI frames from Manifold in headless mode, then muxing to MP4.
**Reference implementations:** `test_inline_composite.py`, `test_rack_osc_promo.py`, `manifold/headless/ManifoldHeadless.cpp`, `manifold/core/BehaviorCoreEditor.cpp`, `manifold/primitives/control/ControlServer.cpp`.
**Key binaries:** `ManifoldHeadless`, `Manifold_Standalone`.

This doc captures how the screenshot/recording pipeline works, how to run it, how it was debugged, and the traps that burned time.

---

## 1. What the pipeline does

The system can capture **real OpenGL-rendered UI frames** plus **real output audio** from Manifold running headlessly (no X11 window), then mux them into a viewable MP4. Frames are captured at ~30fps using RAM accumulation, then bulk-written to disk when recording stops for optimal performance.

| Layer | Responsibility |
|-------|---------------|
| **IPC command parser** | `CommandParser.h` — parses `SCREENSHOT`, `RECORD START <fmt> <path>`, `RECORD STOP`, `RECORD STATUS` |
| **Control server** | `ControlServer.cpp` — owns recording state, starts/stops capture, manages the audio ring buffer |
| **Audio thread** | `BehaviorCoreProcessor::processBlock()` — writes output samples into `AudioCaptureRing` while recording is active |
| **UI thread** | `BehaviorCoreEditor::timerCallback()` — captures frames at ~30fps during recording using RAM accumulation |
| **Headless harness** | `ManifoldHeadless.cpp` — runs audio and UI on separate threads, drives everything without a display server |
| **Automation script** | `test_inline_composite.py` — loads composite project, animates parameters, records, muxes with ffmpeg |

---

## 2. Architecture — why it works

### 2.1 Audio and UI must run on separate threads

**The single most important invariant.** The original headless harness ran `processBlock()` and `callPendingTimersSynchronously()` on the same loop iteration. UI rendering + PNG writes took ~40ms per frame. That made the harness fall behind real-time: 5 seconds of wall-clock time produced only ~1.7 seconds of audio, while frames were captured based on wall-clock time.

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

The editor runs at 30Hz (`startTimerHz(30)`). During recording, frames are captured via `ImGuiDirectHost::captureScreenshot()` which does render + readback in one call.

**Key insight:** In headless mode, `renderNow()` returns early because no JUCE OpenGL context is attached. The only way to render and capture is via `captureScreenshot()`.

```cpp
if (isRecording) {
    juce::Image frame = directHost_.captureScreenshot();
    if (frame.isValid()) {
        std::lock_guard<std::mutex> lock(ramFramesMutex_);
        ramFrames_.push_back(frame);
    }
    rec.frameCounter.fetch_add(1);
} else {
    directHost_.renderNow();  // Normal display path
}
```

### 2.3 Audio capture is lock-free

`AudioCaptureRing` is a lock-free SPSC ring buffer (audio thread writes, writer thread reads). Capacity is ~1M floats (~11.6s @ 44.1kHz stereo).

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

### 2.4 RAM accumulation for optimal frame capture

To achieve 30fps without disk I/O blocking the UI thread, frames are accumulated in RAM during recording and bulk-written when recording stops:

```cpp
// During recording: capture to RAM
if (isRecording && frameDue) {
    juce::Image frame = directHost_.captureScreenshot();
    std::lock_guard<std::mutex> lock(ramFramesMutex_);
    ramFrames_.push_back(frame);
}

// On stop: flush all frames to disk
void BehaviorCoreEditor::flushRamFramesToDisk(const std::string& outputDir) {
    std::vector<juce::Image> frames;
    {
        std::lock_guard<std::mutex> lock(ramFramesMutex_);
        frames = std::move(ramFrames_);
    }
    // Write all frames synchronously (recording has stopped, so this is fine)
    for (const auto& image : frames) {
        writeTga(image, framePath);
    }
}
```

**Why RAM accumulation?** Writing PNG/TGA frames in the timer callback caused frame drops. Even with a background writer thread, queue management and sync overhead was complex. Accumulating in RAM (350MB for 10s at 640×480) is simpler and more reliable.

**Why TGA format?** Uncompressed TGA writes at memcpy speed (~5ms per frame at 640×480). PNG compression takes ~100ms per frame, making 30fps impossible. TGA is the fast path; ffmpeg converts it to MP4 efficiently.

### 2.5 EGL offscreen context for true headless GL

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
| `RECORD START tga /tmp/my_rec` | `OK {"format":"tga","recording":true,...}` | Starts audio writer thread + frame capture (RAM accumulation) |
| `RECORD STOP` | `OK {"recording":false,"frameCount":N,...}` | Stops audio thread, drains ring, flushes RAM frames to disk, writes manifest.json |
| `RECORD STATUS` | `OK {"recording":true,"frameCount":N,...}` | Current state without changing it |

**Supported formats:** `tga`, `png`, `jpg`. TGA is recommended for headless recording (fastest). PNG/JPG work but are slower.

The `RECORD START` command takes a **directory** path, not a file. It creates:
- `<dir>/audio.wav` — 16-bit stereo WAV
- `<dir>/frame_0001.tga` … `frame_NNNN.tga` — TGA sequence
- `<dir>/manifest.json` — fps, sampleRate, frame list

---

## 4. Automation script — `test_inline_composite.py`

### 4.1 What it does

1. Starts `ManifoldHeadless --test-ui --duration 0`
2. Loads a composite UI project via `UISWITCH`
3. Starts recording: `RECORD START tga <dir>`
4. Animates parameters for 10 seconds with continuous motion
5. Stops recording: `RECORD STOP`
6. Muxes frames + WAV into MP4 via ffmpeg

### 4.2 The A/V sync fix — compute actual fps from audio duration

After recording, the script measures the real WAV duration and computes the exact fps:

```python
# Get audio duration from WAV file
result = subprocess.run(
    ["ffprobe", "-v", "error", "-show_entries", "format=duration",
     "-of", "default=noprint_wrappers=1:nokey=1", wav_path],
    capture_output=True, text=True
)
audio_duration = float(result.stdout.strip())
actual_fps = len(frame_files) / audio_duration
```

Then passes `actual_fps` to ffmpeg:

```python
cmd = [
    "ffmpeg", "-y",
    "-framerate", str(actual_fps),  # Dynamic fps from audio
    "-start_number", "1",
    "-i", frame_pattern,  # TGA sequence
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-vsync", "cfr",
    out_mp4,
]
```

**Key points:**
- Do NOT hardcode 30fps — actual fps may vary slightly
- Use `-vsync cfr` to ensure constant frame rate output
- TGA frames are read directly by ffmpeg (no conversion needed)
- Audio WAV is muxed in the same ffmpeg call if needed

### 4.3 Continuous automation for smooth motion

Avoid discrete "step" automation that creates a slideshow effect. Use continuous time-based functions:

```lua
-- Bad: discrete phase changes every N seconds
local phase = math.floor(t / 3) % 3

-- Good: continuous blend between phases
local cycle = (t * 0.5) % 3
local phase = math.floor(cycle)
local blend = cycle - phase  -- 0.0 to 1.0
```

Use `math.sin()` for smooth oscillation:
```lua
local intensity = 0.3 + 0.3 * math.sin(t * 0.5)  -- Smooth wave
local scale = 4.0 + 3.0 * math.sin(t * 0.8)       -- Continuous morphing
```

This creates natural, flowing motion instead of jarring discrete jumps.

### 4.4 Removing the shared shell

The MANIFOLD header/sidebar is controlled by `"sharedShell": false` in the project manifest:

```json
{
  "name": "InlineComposite",
  "version": 1,
  "ui": {
    "root": "ui/composite.ui.lua",
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
python3 test_inline_composite.py

# 3. Inspect output
ffprobe -v error -show_entries stream=duration,nb_frames \
  -of default=noprint_wrappers=1 inline_composite.mp4

# 4. Inspect a frame
file /tmp/composite_rec/frame_0001.tga
# → TGA image data, 640 x 480, 32-bit/pixel

# 5. Inspect audio
ffprobe -v error -show_entries stream=duration,sample_rate \
  -of default=noprint_wrappers=1 /tmp/composite_rec/audio.wav
```

---

## 6. Common issues and fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Audio much shorter than video | UI rendering blocked audio thread | Run audio + UI on separate threads (§2.1) |
| Audio/video drift | Hardcoded 30fps mux vs actual frame timing | Compute `actual_fps = frames / audio_duration` (§4.2) |
| Black/transparent frames | `glReadPixels()` before ImGui init or no GL context | Ensure EGL PBuffer + `juce::gl::loadFunctions()` before `ImGui_ImplOpenGL3_Init()` (§2.5) |
| Manifest not loading | Wrong filename | Must be exactly `manifold.project.json5` (§4.4) |
| Frames have shell chrome | `sharedShell: true` | Create manifest with `"sharedShell": false` (§4.4) |
| Steppy/slideshow motion | Discrete automation using `math.floor()` | Use continuous `math.sin()` and smooth interpolation (§4.3) |
| Too slow for 30fps | PNG compression in timer callback | Use TGA format + RAM accumulation (§2.4) |
| Audio truncated at end | Ring buffer not drained on stop | Post-loop drain already implemented in `ControlServer.cpp` |

---

## 7. Extending the pipeline

### 7.1 Recording a different module

1. Create a standalone UI manifest for that module.
2. Know the module's pixel dimensions.
3. Update `MANIFOLD_PROFILE_WINDOW_SIZE` to those dimensions.
4. Update parameter paths in the animation loop.

### 7.2 Format support and adding new formats

**Supported formats:**
- `tga` — Uncompressed TGA (fastest, recommended for headless)
- `png` — Compressed PNG (slower, smaller files)
- `jpg` — Compressed JPEG (slower, smallest files)

To add a new format (e.g. `mp4`):

1. Add validation in `CommandParser.h`:
```cpp
if (upperFormat == "PNG" || upperFormat == "JPG" || 
    upperFormat == "JPEG" || upperFormat == "TGA" || 
    upperFormat == "MP4") {
```

2. In `ControlServer::startRecording()`, handle the new format.
3. For video formats, you'd need to encode directly (complex) or keep the PNG+audio approach and encode at the end.

**Recommendation:** Stick with TGA + WAV + ffmpeg muxing. It's simple, fast, and produces high-quality MP4 output.

### 7.3 Higher frame rates

The timer runs at 30Hz. For 60fps:
- Change `startTimerHz(60)` in `BehaviorCoreEditor.cpp`.
- Lower the frame capture throttle from 33ms to 16ms.
- RAM accumulation handles the I/O load — frames are written after recording stops.
- Be aware that `captureScreenshot()` is called every frame, which does render + readback. At 60fps this may be heavy on GPU/CPU.

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
- [ ] Parameters visibly animate across frames (continuous motion, not steppy)
- [ ] No shared shell chrome in frames (if intended)
- [ ] Editor size matches module size (no dark padding)

---

## 9. Key files reference

| File | Role |
|------|------|
| `manifold/primitives/control/CommandParser.h` | Parses screenshot/recording IPC commands (SCREENSHOT, RECORD START/STOP/STATUS) |
| `manifold/primitives/control/ControlServer.cpp` | Recording state, audio ring, writer thread, frame path tracking |
| `manifold/primitives/control/ControlServer.h` | `AudioCaptureRing`, `RecordingState` structs |
| `manifold/core/BehaviorCoreProcessor.cpp` | `writeAudioSamples()` call in `processBlock()` for audio capture |
| `manifold/core/BehaviorCoreEditor.cpp` | Frame capture in `timerCallback()`, RAM accumulation, `flushRamFramesToDisk()` |
| `manifold/core/BehaviorCoreEditor.h` | `ramFrames_`, `ramFramesMutex_`, `wasRecording_` state |
| `manifold/ui/imgui/ImGuiDirectHost.cpp` | `captureScreenshot()` via `glReadPixels()`, `readbackFramebuffer()` |
| `manifold/ui/imgui/ImGuiDirectHost.h` | `EglOffscreenContext`, `skipNextSwap_`, `forceNextRender_` |
| `manifold/headless/ManifoldHeadless.cpp` | Headless harness — audio + UI threads split |
| `test_inline_composite.py` | Full automation script with continuous motion |
| `test_rack_osc_promo.py` | Original automation script (oscillator promo) |
| `UserScripts/projects/StandaloneOsc/` | Example standalone oscillator project |

---

## 10. Lessons learned, condensed

1. **Audio and UI must never share a thread.** The headless harness was the root cause of the A/V sync bug — not ffmpeg, not frame drops, not the ring buffer. `processBlock()` has hard real-time requirements; UI rendering does not.

2. **Always measure actual fps from the audio file.** Hardcoding 30fps in ffmpeg is guaranteed desync if the timer thread is late or early. The audio file is the ground truth.

3. **EGL offscreen works, but order matters.** `juce::gl::loadFunctions()` must happen after making the EGL context current and before `ImGui_ImplOpenGL3_Init()`. Get it wrong and you get black frames with no error message.

4. **The manifest filename is exact.** `manifold.project.json5` is the only string `isProjectManifestFile()` accepts. A temp file named anything else silently falls through to Lua parsing and explodes with a syntax error.

5. **RAM accumulation is the fast path.** Writing PNG/TGA in the timer callback causes frame drops. Accumulating in RAM and bulk-writing after recording stops achieves 30fps reliably.

6. **TGA is faster than PNG for capture.** Uncompressed TGA writes at memcpy speed (~5ms per frame). PNG compression takes ~100ms per frame. TGA + ffmpeg muxing is the recommended approach.

7. **Continuous automation creates smooth motion.** Use `math.sin()` and smooth interpolation instead of discrete `math.floor()` phase changes to avoid the "slideshow" effect.

8. **In headless mode, use `captureScreenshot()` only.** `renderNow()` returns early because no JUCE OpenGL context is attached. `captureScreenshot()` handles EGL context creation and rendering.

9. **`_Exit(0)` is a band-aid.** The headless harness intentionally leaks the editor on shutdown and calls `_Exit(0)` to avoid late-destructor segfaults in offscreen GL state. This is test-only; do not copy into production plugin code.
