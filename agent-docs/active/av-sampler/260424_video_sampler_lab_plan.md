# Video Sampler Lab — Revised Plan & Architecture

**Date:** 2026-04-24  
**Source:** User discussion + codebase absorption of video capture/rendering, shader surface provider, audio retrospective capture, and `SampleRegionPlaybackNode` infrastructure  
**Author:** Agent  
**Status:** ACTIVE — revised after deeper code read; implementation-ready, but supersedes the earlier UI-only interpretation

---

## Core Correction

The original plan correctly identified that **video pixels must not run through the realtime audio callback**. That part stands.

But it underweighted the actual sampler requirement.

A good Manifold video sampler must not merely be a UI-side clip player with `play()`/`stop()`. It must tie into the **actual audio sampler semantics** already present in the codebase:

- retrospective capture windows
- free/retro capture modes
- `samplesBack`
- bars / samples-per-bar
- play start
- loop start/end
- one-shot vs looping behavior
- trigger/play/stop
- actual `SampleRegionPlaybackNode` position
- sample/rack module capture flow

So the corrected principle is:

> Video frame storage and GL rendering live outside DSP, but video capture and playback timing must be driven by the same audio sampler/capture model used by `RetrospectiveCaptureNode` and `SampleRegionPlaybackNode`.

The right model is:

```text
Audio side:
RetrospectiveCaptureNode
    ↓ copyRecentToLoop(samplesBack)
SampleRegionPlaybackNode
    ↓ getLoopAwarePosition()

Video side:
VideoRetrospectiveCapture
    ↓ copyRecentToSampler(samplesBack, nowSamples)
VideoSampler / VideoSampleClip
    ↓ getFrameAtNormalizedPosition(audioPosition)
VideoSurfaceProvider
    ↓ GL texture
Viewport / ShaderSurfaceProvider
```

The critical line is:

```text
audio sampler position drives video frame lookup
```

Not:

```text
renderer calls getCurrentFrame() and advances video playback
```

Renderer-driven playback can exist as a standalone fallback, but it must not be the core synced sampler model.

---

## Relevant Existing Code

### Video Stack

| File | Current role |
|------|--------------|
| `manifold/primitives/video/VideoCaptureManager.h/.cpp` | V4L2 capture thread; latest RGBA `FrameData`; one latest-frame copy API |
| `manifold/primitives/video/VideoSurfaceProvider.h/.cpp` | `video_input` custom surface provider; uploads latest capture frame to one GL texture |
| `manifold/primitives/shaders/ShaderSurfaceProvider.h/.cpp` | `gpu_shader` provider; resolves `video_input` / `generated_source` input texture |
| `manifold/ui/imgui/ImGuiDirectHost.cpp` | registers video/generated/shader/composite providers and shader input resolver |
| `manifold/primitives/ui/CustomSurfaceProvider.h` | renderer/provider seam |
| `manifold/primitives/ui/RuntimeNode.h` | custom surface type + payload storage |
| `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp` | `node:setCustomSurface(type, payload)` binding |
| `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` | current `capture` and `shaders` Lua APIs |
| `UserScripts/projects/WebcamViewer/` | existing webcam/shader UI reference |

### Audio Sampler Stack

| File | Current role |
|------|--------------|
| `dsp/core/nodes/RetrospectiveCaptureNode.h/.cpp` | realtime audio capture ring; `copyRecentToLoop()` into loop/sample playback |
| `dsp/core/nodes/SampleRegionPlaybackNode.h/.cpp` | actual audio sample playback node; loop/play/trigger/seek/analysis/peaks |
| `dsp/core/nodes/QuantizerNode.h/.cpp` | tempo and samples-per-bar calculation |
| `dsp/core/nodes/ForwardCommitSchedulerNode.h/.cpp` | scheduled forward commit logic |
| `dsp/core/nodes/PlaybackStateGateNode.h/.cpp` | playback gate state |
| `manifold/primitives/scripting/dsp_host/DSPHostBindingsCore.cpp` | Lua usertype/table bindings for `SampleRegionPlaybackNode`, `RetrospectiveCaptureNode`, etc. |
| `manifold/primitives/scripting/dsp_host/DSPHostLoopLayerBundle.cpp` | existing loop layer commit behavior using capture → playback copy |
| `UserScripts/projects/Main/lib/sample_synth.lua` | high-level sample capture request generation: retro/free modes, `samplesBack` |
| `UserScripts/projects/Main/lib/rack_modules/sample.lua` | dynamic rack sample module; commits capture request into voices |
| `UserScripts/projects/Main/dsp/midisynth_integration.lua` | main synth sample capture/playback integration |
| `UserScripts/projects/Main/lib/sample_capture_sources.lua` | sample source config: live/layer capture sources |

---

## Current Code Facts That Change The Plan

### 1. `capture.getFrameInfo()` does not expose pixels

Current Lua binding only returns metadata:

```lua
{
  valid = bool,
  width = int,
  height = int,
  sequence = number,
  open = bool,
  activeDeviceIndex = int,
}
```

It does **not** expose RGBA bytes.

Therefore this earlier idea is wrong:

```lua
sampler:ingestFrame(capture.getFrameInfo())
```

A video sampler should not shove full RGBA frames through Lua anyway. C++ should ingest frames directly from `VideoCaptureManager`.

Correct API shape:

```lua
videoCapture:ingestLatest()
```

or:

```lua
videoSampler:ingestLatestCaptureFrame()
```

Internally this pulls:

```cpp
VideoCaptureManager::instance().getLatestFrameCopy()
```

and stamps it with host timing.

---

### 2. Video frames currently have no timing metadata

`FrameData` currently contains:

```cpp
struct FrameData {
    int width = 0;
    int height = 0;
    uint64_t sequence = 0;
    std::vector<std::uint8_t> rgba;
};
```

For audio-synced video sampling we need timing metadata outside or alongside this:

```cpp
struct TimedVideoFrame {
    FrameData frame;
    double hostSamplePosition = 0.0;
    double hostTimeSeconds = 0.0;
};
```

The sync key should be **host audio sample position**, because audio capture commits are measured in samples:

```lua
request.samplesBack
```

A video capture ring should select frames in:

```text
[nowSamples - samplesBack, nowSamples]
```

Then commit those frames to a sampler clip with relative sample offsets.

---

### 3. `VideoSurfaceProvider` currently has one global texture

Current implementation:

```cpp
struct VideoSurfaceProvider::Impl {
    unsigned int texture = 0;
    int width = 0;
    int height = 0;
    uint64_t sequence = 0;
    FrameData latestFrame;
};
```

This is okay for one live webcam source.

It is not enough for video samplers.

A sampler-capable provider needs per-node or per-source texture state:

```cpp
struct TextureState {
    unsigned int texture = 0;
    int width = 0;
    int height = 0;
    uint64_t sequence = 0;
};

std::unordered_map<uint64_t, TextureState> statesByStableId;
```

or a key that includes source identity:

```text
stableId + sourceType + samplerId
```

Otherwise multiple sampler viewports, A/B stacks, shader taps, or mixed live/sampler sources will stomp each other.

---

### 4. `SampleRegionPlaybackNode` is the real transport model

The actual audio sampler exposes:

```cpp
setSpeed()
setOneShot()
play()
pause()
stop()
trigger()
seekNormalized()
getNormalizedPosition()
getLoopAwarePosition()
setPlayStart()
setLoopStart()
setLoopEnd()
setCrossfade()
setUnison()
setDetune()
setSpread()
loadFile()
copyFromCaptureBuffer()
```

Important implications:

- The video sampler should mirror `setPlayStart`, `setLoopStart`, `setLoopEnd`, and `setCrossfade` semantics.
- The earlier `setLoop(bool)` concept is not aligned with the actual audio sampler. Audio looping is effectively `oneShot == false` plus loop region.
- Current audio `setSpeed()` clamps to `0.0..8.0`; negative/reverse speed is **not** supported yet.
- Video reverse should be deferred unless reverse is implemented in audio too.

---

### 5. Shader sampler source support is not currently wired

`shaders.buildPipeline()` currently supports:

- `{ type = "webcam" }` → `sourceType = "video_input"`
- `{ type = "generator", sourceId = ... }` → `sourceType = "generated_source"`

`ShaderSurfaceProvider` currently accepts only:

```cpp
"video_input"
"generated_source"
"generator_shader"
```

So this earlier target is not currently supported:

```lua
shaders.buildPipeline(layers, "contain", {
  type = "sampler",
  samplerId = sampler:getId(),
})
```

We need to either:

1. keep `sourceType = "video_input"` and put sampler config inside source payload, or
2. add a new source type such as `"video_sampler"` and teach the shader input resolver to dispatch it.

Long-term cleaner design: `video_sampler` source type.  
Fastest MVP: overload `video_input` payload with sampler source fields.

---

## Target Architecture

### Layer Diagram

```text
┌──────────────────────────────────────────────────────────────┐
│ Lua / Project Layer                                           │
│ - sampleSynth.triggerCapture() returns samplesBack/mode       │
│ - videoCapture.copyRecentToSampler(... same samplesBack ...)  │
│ - viewport binds sampler + audio playback position            │
├──────────────────────────────────────────────────────────────┤
│ Audio Sampler Authority                                       │
│ RetrospectiveCaptureNode → SampleRegionPlaybackNode           │
│ owns capture window, play/loop/trigger/position semantics      │
├──────────────────────────────────────────────────────────────┤
│ Video Capture Ring                                            │
│ VideoRetrospectiveCapture                                     │
│ stores TimedVideoFrame { FrameData, hostSamplePosition }       │
├──────────────────────────────────────────────────────────────┤
│ Video Clip / Sampler                                          │
│ committed frames mapped to relative sample positions           │
│ getFrameAtNormalizedPosition(pos)                             │
│ optional standalone transport fallback                         │
├──────────────────────────────────────────────────────────────┤
│ Surface Providers                                             │
│ VideoSurfaceProvider: live webcam or sampler-backed texture    │
│ ShaderSurfaceProvider: post-process or sampler source          │
├──────────────────────────────────────────────────────────────┤
│ Renderer                                                      │
│ ImGuiDirectHost / GL texture upload / viewport                 │
└──────────────────────────────────────────────────────────────┘
```

---

## New C++ Concepts

### `TimedVideoFrame`

```cpp
namespace manifold::video {

struct TimedVideoFrame {
    FrameData frame;
    double hostSamplePosition = 0.0;
    double hostTimeSeconds = 0.0;
};

} // namespace manifold::video
```

This keeps `FrameData` simple and avoids forcing audio timing fields into the generic capture frame struct.

---

### `CommittedVideoFrame`

Frames inside a committed sampler clip should know where they belong relative to the captured audio window.

```cpp
struct CommittedVideoFrame {
    FrameData frame;
    double relativeSamplePosition = 0.0; // 0..durationSamples
    float normalizedPosition = 0.0f;     // 0..1 convenience
};
```

The important lookup is normalized position, because `SampleRegionPlaybackNode` already exposes:

```cpp
getNormalizedPosition()
getLoopAwarePosition()
```

---

### `VideoRetrospectiveCapture`

Video analogue of `RetrospectiveCaptureNode`, but not an `IPrimitiveNode` and not called from the realtime audio thread.

```cpp
namespace manifold::video {

class VideoRetrospectiveCapture {
public:
    explicit VideoRetrospectiveCapture(float captureSeconds = 30.0f);

    void setCaptureSeconds(float seconds);
    float getCaptureSeconds() const;

    // Pulls latest FrameData from VideoCaptureManager and stamps it with host timing.
    // Should drop duplicate sequence numbers.
    bool ingestLatestFrame(double hostSamplePosition, double hostTimeSeconds);

    bool copyRecentToSampler(VideoSampler& sampler,
                             double nowSamples,
                             double samplesBack) const;

    int getFrameCount() const;
    void clear();

private:
    mutable std::mutex mutex_;
    std::deque<TimedVideoFrame> frames_;
    float captureSeconds_ = 30.0f;
    uint64_t lastIngestedSequence_ = 0;
    int lockedWidth_ = 0;
    int lockedHeight_ = 0;
};

} // namespace manifold::video
```

Key behavior:

- `ingestLatestFrame()` drops duplicate `FrameData.sequence` values.
- first valid frame locks resolution.
- mismatched frames are dropped for MVP.
- pruning removes frames older than `captureSeconds` using host time/sample metadata.
- copy window is sample-based: `[nowSamples - samplesBack, nowSamples]`.

---

### `VideoSampler`

Committed video clip + lookup.

```cpp
namespace manifold::video {

class VideoSampler {
public:
    explicit VideoSampler(std::string id = {});

    const std::string& getId() const;

    void commitFrames(std::vector<CommittedVideoFrame> frames,
                      double durationSamples,
                      double sampleRate);

    bool hasFrames() const;
    int getFrameCount() const;
    double getDurationSamples() const;
    float getDurationSeconds() const;

    // Primary synced lookup.
    FrameData getFrameAtNormalizedPosition(float normalized) const;

    // Optional standalone fallback transport.
    void play();
    void pause();
    void stop();
    void trigger();
    bool isPlaying() const;
    void seekNormalized(float normalized);
    float getNormalizedPosition() const;
    void advance(double deltaSeconds);

    void setOneShot(bool enabled);
    bool isOneShot() const;
    void setPlayStart(float normalized);
    void setLoopStart(float normalized);
    void setLoopEnd(float normalized);
    void setCrossfade(float normalized);

    void clear();

private:
    mutable std::mutex mutex_;
    std::string id_;
    std::vector<CommittedVideoFrame> frames_;
    double durationSamples_ = 0.0;
    double sampleRate_ = 44100.0;

    // standalone fallback only
    std::atomic<bool> playing_{false};
    std::atomic<bool> oneShot_{false};
    std::atomic<float> positionNorm_{0.0f};
    std::atomic<float> playStartNorm_{0.0f};
    std::atomic<float> loopStartNorm_{0.0f};
    std::atomic<float> loopEndNorm_{1.0f};
    std::atomic<float> crossfadeNorm_{0.0f};
};

} // namespace manifold::video
```

Important: the primary synced path should be read-only:

```cpp
getFrameAtNormalizedPosition(audioPlayback->getLoopAwarePosition())
```

No hidden advancement from renderer calls.

---

### `VideoSamplerRegistry`

Needed because surface providers resolve sources from node payloads.

```cpp
class VideoSamplerRegistry {
public:
    static VideoSamplerRegistry& instance();

    std::shared_ptr<VideoSampler> createSampler();
    void registerSampler(const std::string& id, std::shared_ptr<VideoSampler> sampler);
    void unregisterSampler(const std::string& id);
    std::shared_ptr<VideoSampler> getSampler(const std::string& id) const;

    std::shared_ptr<VideoRetrospectiveCapture> createCapture();
    std::shared_ptr<VideoRetrospectiveCapture> getCapture(const std::string& id) const;
};
```

Registry ownership must be cleaned up when scripts reload to avoid leaking old sampler instances.

---

## Surface Provider Changes

### `VideoSurfaceProvider` should support source modes

Current live video payload:

```lua
node:setCustomSurface("video_input", {
  version = 1,
  fitMode = "contain",
})
```

Sampler payload:

```lua
node:setCustomSurface("video_input", {
  version = 2,
  fitMode = "contain",
  source = "sampler",
  samplerId = sampler:getId(),
  position = 0.0, -- explicit normalized fallback
})
```

Synced payload option:

```lua
node:setCustomSurface("video_input", {
  version = 2,
  fitMode = "contain",
  source = "sampler",
  samplerId = sampler:getId(),
  audioPlaybackPath = "/midi/synth/rack/sample/1/voice/1/sample",
  positionMode = "loopAware",
})
```

Implementation paths:

1. If `source == "sampler"`:
   - find sampler by `samplerId`
   - resolve position:
     - explicit `position`, or
     - `audioPlaybackPath` via a resolver, or
     - sampler standalone position
   - call `sampler->getFrameAtNormalizedPosition(pos)`
2. Else:
   - fall back to `VideoCaptureManager::getLatestFrameCopy()`

Provider must maintain texture state per node/source, not a single global texture.

---

## Audio Position Resolution

There are three possible integration levels.

### Level 1 — Lua-driven sync

Lua queries existing functions:

```lua
local pos = getSampleRegionPlaybackLoopAwarePosition(audioPath)
sampler:setPosition(pos)
viewport.node:setCustomSurface("video_input", {
  source = "sampler",
  samplerId = sampler:getId(),
  position = pos,
})
```

Pros:
- minimal C++ graph plumbing
- easy lab slice

Cons:
- position update is UI-rate
- more Lua churn

### Level 2 — provider path resolver

`VideoSurfaceProvider` gets an injected resolver, similar to `ShaderSurfaceProvider::InputResolver`:

```cpp
using AudioPlaybackPositionResolver = std::function<float(
    const std::string& path,
    const std::string& mode)>;
```

Then payload can use:

```lua
audioPlaybackPath = "..."
positionMode = "loopAware"
```

Pros:
- cleaner binding
- renderer resolves current position directly

Cons:
- provider needs access to processor/graph path lookup via injection

### Level 3 — direct paired audio/video sampler binding

A registry stores:

```cpp
std::weak_ptr<dsp_primitives::SampleRegionPlaybackNode> audioPlayback;
std::shared_ptr<manifold::video::VideoSampler> videoSampler;
```

Then provider uses the audio node directly.

Pros:
- strongest architecture
- no string path lookup per frame

Cons:
- more binding/lifetime complexity

Recommended implementation path:

1. Slice with Level 1 to prove behavior.
2. Move to Level 2 for real provider integration.
3. Consider Level 3 only if path lookup becomes ugly or expensive.

---

## Lua API Shape

Do not expose raw pixels to Lua. Expose control and commit operations.

```lua
local videoCap = videoSampler.capture({ maxSeconds = 30 })
local video = videoSampler.new()

-- Called periodically from UI/lab behavior, internally stamps with processor play time.
videoCap:ingestLatest()

-- Use same capture request as audio sample capture.
local request = sampleSynth.triggerCapture()
if request then
  captureNode:copyRecentToLoop(audioPlaybackNode, request.samplesBack, false)
  videoCap:copyRecentToSampler(video, request.samplesBack)
end

-- Bind sampler to viewport, position explicitly driven by audio node.
local pos = getSampleRegionPlaybackLoopAwarePosition(audioPath)
viewport.node:setCustomSurface("video_input", {
  version = 2,
  fitMode = "contain",
  source = "sampler",
  samplerId = video:getId(),
  position = pos,
})
```

Possible C++-backed methods:

```lua
videoSampler.new(opts) -> sampler
videoSampler.capture(opts) -> captureRing

captureRing:ingestLatest()
captureRing:getFrameCount()
captureRing:clear()
captureRing:copyRecentToSampler(sampler, samplesBack)

sampler:getId()
sampler:hasFrames()
sampler:getFrameCount()
sampler:getDurationSeconds()
sampler:clear()
sampler:setPosition(normalized) -- explicit standalone/UI sync fallback
sampler:getPosition()
sampler:play()
sampler:pause()
sampler:stop()
sampler:trigger()
sampler:setOneShot(bool)
sampler:setPlayStart(n)
sampler:setLoopStart(n)
sampler:setLoopEnd(n)
sampler:setCrossfade(n)
```

Important: `copyRecentToSampler()` should internally use current host play time and sample rate from the processor exposed to `LuaControlBindings`, not Lua-provided wall clock.

---

## Shader Integration

### Post-process sampler output

This is the first shader target.

```lua
local pos = getSampleRegionPlaybackLoopAwarePosition(audioPath)
local pipeline = shaders.buildPipeline(
  {
    { effectId = "glitch", params = { intensity = 0.6 } },
  },
  "contain",
  {
    type = "sampler",
    samplerId = video:getId(),
    position = pos,
  }
)
viewport.node:setCustomSurface("gpu_shader", pipeline)
```

Implementation requirement:

- `shaders.buildPipeline()` must preserve sampler source data in the payload.
- `ShaderSurfaceProvider` must accept either:
  - `sourceType = "video_input"` with nested sampler source, or
  - new `sourceType = "video_sampler"`.
- `ImGuiDirectHost` shader input resolver must route sampler source to the appropriate provider.

Recommended:

- MVP: use `sourceType = "video_input"` and include `{ source = "sampler", samplerId, position }` in payload.
- Later: split to explicit `sourceType = "video_sampler"`.

### Shader as source / baked effects

Recording shader output via `glReadPixels` / PBO readback is future work.

Do not block MVP on it.

First prove:

```text
webcam → video capture ring → video sampler → shader post-process → viewport
```

Then later:

```text
webcam → shader → readback → video capture ring → sampler
```

---

## Revised Vertical Slices

### Slice 1 — Committed `VideoSampler` Clip Storage

**Goal:** deterministic frame storage and lookup by normalized position.

**Layers:** C++ only

**Checklist:**

- [ ] Create `manifold/primitives/video/VideoSampler.h/.cpp`
- [ ] Define `CommittedVideoFrame`
- [ ] Implement `commitFrames()`
- [ ] Implement `getFrameAtNormalizedPosition(float)`
- [ ] Implement `getFrameCount()`, `hasFrames()`, `getDurationSamples()`, `getDurationSeconds()`
- [ ] Implement `clear()`
- [ ] Add standalone fallback controls only if cheap: `play`, `pause`, `stop`, `trigger`, `seekNormalized`
- [ ] Add `VideoSamplerRegistry`
- [ ] Add synthetic C++ test/harness:
  - commit 30 synthetic frames
  - lookup `0.0`, `0.5`, `1.0`
  - verify expected frame sequence

**Done when:** a synthetic test can commit frames and retrieve deterministic frames by normalized position without any GL/video capture involvement.

---

### Slice 2 — `VideoRetrospectiveCapture`

**Goal:** video ring buffer that mirrors audio retrospective capture semantics.

**Layers:** C++ + Lua binding support

**Checklist:**

- [ ] Create `VideoRetrospectiveCapture.h/.cpp`
- [ ] Define `TimedVideoFrame`
- [ ] Implement `ingestLatestFrame(hostSamplePosition, hostTimeSeconds)`
- [ ] Drop duplicate `FrameData.sequence`
- [ ] Lock resolution on first valid frame; drop mismatches for MVP
- [ ] Prune by max capture seconds
- [ ] Implement `copyRecentToSampler(VideoSampler&, nowSamples, samplesBack)`
- [ ] Compute committed frame relative sample positions and normalized positions
- [ ] Add Lua method `captureRing:ingestLatest()` that internally stamps using processor play time/sample rate
- [ ] Add Lua method `captureRing:copyRecentToSampler(sampler, samplesBack)`

**Done when:** a test can ingest timestamped fake frames, commit a sample window, and verify only frames inside `[now - samplesBack, now]` are committed.

---

### Slice 3 — `VideoSurfaceProvider` Sampler Source

**Goal:** a viewport can display a committed `VideoSampler` frame.

**Layers:** C++ renderer/provider

**Checklist:**

- [ ] Change `VideoSurfaceProvider::Impl` from one global texture to per-node/per-source `TextureState`
- [ ] Parse payload:
  - default/live webcam mode
  - `{ source = "sampler", samplerId = "...", position = n }`
- [ ] Resolve sampler from `VideoSamplerRegistry`
- [ ] Fetch frame via `getFrameAtNormalizedPosition(position)`
- [ ] Upload to GL texture
- [ ] Preserve live webcam fallback
- [ ] Make `getSurfaceInfo(stableId, ...)` return per-node info
- [ ] Implement pruning of unused texture states

**Done when:** Lua can bind a committed sampler to a viewport and scrub `position` manually.

---

### Slice 4 — Audio-Synced Video Playback

**Goal:** video follows a real `SampleRegionPlaybackNode` position.

**Layers:** Lua first, then optional provider resolver

**Checklist:**

- [ ] In lab Lua, create/use an audio `SampleRegionPlaybackNode`
- [ ] Commit audio sample via existing `RetrospectiveCaptureNode:copyRecentToLoop()`
- [ ] Commit video sample using same `request.samplesBack`
- [ ] Query audio position with existing:
  - `getSampleRegionPlaybackLoopAwarePosition(path)` or direct playback object method
- [ ] Set sampler viewport position from audio position
- [ ] Verify play/start/loop changes affect video frame selection
- [ ] Verify stop/trigger behavior is visually coherent

**Done when:** captured audio and captured video loop together, and video follows the audio loop region/playhead.

---

### Slice 5 — Real `VideoSamplerLab` With DSP

**Goal:** lab proves actual audio/video sampler semantics, not just UI-side video playback.

**Important correction:** this lab should not be UI-only if it is proving the real sampler. It needs a minimal DSP section.

**Project files:**

```text
UserScripts/projects/VideoSamplerLab/manifold.project.json5
UserScripts/projects/VideoSamplerLab/dsp/default_dsp.lua
UserScripts/projects/VideoSamplerLab/ui/main.ui.lua
UserScripts/projects/VideoSamplerLab/ui/behaviors/main.lua
```

**DSP:**

- minimal audio input capture path
- `RetrospectiveCaptureNode`
- `SampleRegionPlaybackNode`
- optional `QuantizerNode`
- exposed capture/playback node paths

**UI:**

- live webcam viewport
- committed video viewport
- audio waveform using existing sample/capture widgets if practical
- capture button using same request for audio and video
- play/stop/trigger
- play start / loop start / loop length controls
- one-shot toggle
- status: audio length, video frame count, duration, current position

**Acceptance:**

1. Open webcam.
2. Audio capture ring is running.
3. Video capture ring ingests latest frames.
4. Hit capture for N bars.
5. Audio commits via `copyRecentToLoop()`.
6. Video commits same `samplesBack` window.
7. Audio playback starts.
8. Video follows `SampleRegionPlaybackNode:getLoopAwarePosition()`.
9. Adjust loop start/length and see both audio and video follow the same loop window.

---

### Slice 6 — Shader Post-Process On Sampler

**Goal:** sampler output can be used as shader input.

**Checklist:**

- [ ] Extend `shaders.buildPipeline()` to accept source `{ type = "sampler", samplerId = ..., position = ... }`
- [ ] Preserve sampler source fields in returned payload
- [ ] Teach `ShaderSurfaceProvider` / input resolver to route sampler input
- [ ] Verify sampler playback through `glitch`, `kaleidoscope`, etc.
- [ ] Keep shader readback/baked shader recording deferred

**Done when:** committed video sampler playback can be post-processed by existing shader effects.

---

## Memory Budget

Raw RGBA is expensive but acceptable for lab-scale clips at modest resolution.

| Resolution | Raw RGBA/frame | 30s @ 30fps | 10s @ 30fps | 5s @ 30fps |
|-----------|----------------|-------------|-------------|------------|
| 640×480   | ~1.17 MB       | ~1.05 GB    | ~351 MB     | ~176 MB    |
| 1280×720  | ~3.52 MB       | ~3.16 GB    | ~1.05 GB    | ~527 MB    |
| 1920×1080 | ~7.91 MB       | ~7.12 GB    | ~2.37 GB    | ~1.19 GB   |

Correct frame count examples:

```text
5s @ 30fps  = 150 frames
10s @ 30fps = 300 frames
30s @ 30fps = 900 frames
```

Default lab constraints:

- open webcam at 640×480
- max capture ring: 30 seconds
- committed clip typical: 1–4 bars / a few seconds
- raw RGBA first
- compression deferred

Future options:

- MJPEG-compressed frame storage
- GPU texture array/PBO storage
- max-resolution clamp on ingest
- frame decimation policy

---

## Threading Model

### Video capture thread

`VideoCaptureManager` already captures frames on its own thread and exposes safe copies through:

```cpp
getLatestFrameCopy()
```

### UI/control thread

Lua or bound C++ calls:

```lua
videoCapture:ingestLatest()
```

This pulls latest frame and stamps it with processor timing.

### Renderer thread

`VideoSurfaceProvider::prepareTexture()` should:

- resolve frame
- upload texture
- not advance synced playback state

### Audio thread

No video frame copying, allocation, GL, or mutex waits in the audio callback.

The only audio-thread-owned data used by video should be exposed through safe atomics / existing query methods such as `SampleRegionPlaybackNode::getLoopAwarePosition()`.

---

## Capture Semantics

### Retro mode

Use existing sample request:

```lua
samplesBack = samplesPerBar * sampleCaptureBars
```

Audio:

```lua
captureNode:copyRecentToLoop(audioPlaybackNode, samplesBack, false)
```

Video:

```lua
videoCapture:copyRecentToSampler(videoSampler, samplesBack)
```

Both use the same window length.

### Free mode

Existing sample code tracks capture start offset from the audio capture node.

Video must mirror this behavior using host sample time, not wall time.

Free mode flow:

1. user starts capture
2. store audio capture start offset / host sample position
3. video capture ring continues ingesting timed frames
4. user stops capture
5. audio request computes duration in samples
6. video commits same sample duration

---

## Acceptance Criteria

| Slice | Acceptance test |
|-------|-----------------|
| 1 | Synthetic committed video frames can be looked up by normalized position deterministically |
| 2 | Timed video ring commits only frames inside a `samplesBack` window |
| 3 | Viewport displays committed video sampler frames and manual position scrub works |
| 4 | Video follows actual `SampleRegionPlaybackNode:getLoopAwarePosition()` during playback |
| 5 | Lab captures audio+video using same capture request and loops them together |
| 6 | Existing shader effects post-process video sampler playback |

Final lab acceptance:

1. Start VideoSamplerLab.
2. See live webcam feed.
3. Audio capture source is active.
4. Capture one bar.
5. Audio sample commits.
6. Video sample commits matching the same capture window.
7. Trigger playback.
8. Audio and video stay aligned over repeated loops.
9. Adjust play start / loop start / loop length.
10. Video follows the same loop region as audio.
11. Apply shader post-process to committed video playback.

---

## Deferred Work

- reverse playback unless audio sampler gains reverse support too
- shader output readback / baked shader recording
- frame interpolation / optical-flow slow motion
- compression
- GPU-resident clip storage
- multiple video layers in one sampler
- audio/video export/render-to-file
- MIDI-triggered video clips beyond simple audio sampler pairing

---

## Updated Bottom Line

The video sampler should be built as a **media companion to the real audio sampler**, not as an isolated visual looper.

Pixels stay out of DSP.  
Timing comes from audio sampler/capture semantics.  
Capture windows use the same `samplesBack`.  
Playback position follows `SampleRegionPlaybackNode`.  
Rendering remains GL/provider based.

That gives Manifold a video sampler that behaves like an actual sampler instead of a pretty but disconnected clip player.
