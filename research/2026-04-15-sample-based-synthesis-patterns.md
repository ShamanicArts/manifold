# Sample-Based Synthesis UX & Integration Patterns
*Research for Manifold MIDI Synth sample engine — 2026-04-15*

---

## 1. Sample Capture UX Patterns

### Retrospective Capture ("Loop Back")
**Used by:** Ableton Simpler, Bitwig Sampler, Octatrack
- User triggers capture *after* the interesting audio has passed
- System captures the last N bars/beats from a rolling buffer
- **Key UX principle:** One-button operation. The user shouldn't think about "start recording" — they just hear something, then capture it.

**Manifold alignment:**
- `sample_synth.lua` already implements `RetrospectiveCaptureNode` with `captureSeconds(30.0)`
- `buildRetroCaptureRequest()` uses `hostSamplesPerBar() * sampleCaptureBars`
- **Recommendation:** UI should expose a single large "Capture Last" button with a bars dropdown (1/2/4/8), not separate start/stop controls.

### Free Capture ("Armed Recording")
**Used by:** Logic Quick Sampler, Koala Sampler, hardware samplers
- User arms recording, plays audio, then stops
- Allows exact start/end point selection
- **Key UX principle:** Visual feedback on recording state (red border, pulsing record LED, waveform scrolling)

**Manifold alignment:**
- `beginFreeCapture()` / `finishFreeCapture()` already track `sampleCaptureRecordingStartOffset`
- `setCaptureRecording()` provides the on/off interface
- **Recommendation:** The UI should show:
  1. Armed state (yellow)
  2. Recording state (red pulse + scrolling waveform)
  3. Completed state (waveform with selectable region)

### Hybrid Pattern: "Smart Capture"
**Used by:** Bitwig Sampler's "Record" tab
- Default to retrospective for speed
- Allow free capture for precision
- Auto-analyze on capture complete

**Manifold alignment:**
- `triggerCapture()` already branches on `sampleCaptureMode == 1`
- `requestAnalysis()` can be called immediately after capture
- **Recommendation:** After any capture, automatically queue spectral analysis if the blend mode is "Add" or "Morph" — this removes a manual step.

---

## 2. Spectral Visualization Patterns

### Partial Bar Graph (Additive View)
**Best for:** "Add" blend mode, morphing synthesis
- X-axis: frequency/partial index (log or linear)
- Y-axis: amplitude
- **Update rate:** 15-30 Hz is sufficient; full FFT every frame is overkill

**Implementation sketch for Manifold:**
```lua
-- Poll analysis results from sample_synth
local complete, analysis, partials, temporal = synth.pollAnalysis(playbackNode)
if complete and partials then
  -- partials is likely a table of {freq, amp, phase} entries
  scopeWidget:setPartialData(partials)
end
```

### Spectral Waterfall (Temporal View)
**Best for:** Understanding spectral evolution over time
- X-axis: frequency
- Y-axis: time (scrolling)
- Color/brightness: amplitude
- **Performance note:** Requires a history buffer of FFT frames. Not suitable for real-time Lua UI canvas unless decimated heavily.

**Recommendation:** Skip waterfall for now. A simple partial bar graph + waveform overlay is more useful and performant.

### Waveform + Spectral Overlay
**Best for:** Sample editing and loop point selection
- Show waveform as the primary view
- Overlay spectral centroid or dominant partials as a line graph
- **Integration point:** This could live in a new "Sample" tab of the MIDI synth UI, alongside the existing "Wave", "Blend", "Filter" tabs.

---

## 3. Phase Vocoder Parameter Mapping

The `sample_synth.lua` creates a `PhaseVocoderNode` with:
- `pitchSemitones`
- `timeStretch`
- `mix`
- `fftOrder`

### Recommended UI Mapping
| Param | Widget | Range | Default |
|-------|--------|-------|---------|
| Pitch | Knob | ±24 semitones | 0 |
| Time Stretch | Knob | 0.25x – 4x | 1.0 |
| Mix | VSlider or Knob | 0% – 100% | 0% |
| FFT Size | Dropdown | 256, 512, 1024, 2048, 4096 | 2048 (order 11) |

### Critical UX Considerations
1. **Pitch and Time Stretch are not independent** in a phase vocoder. Large pitch shifts with time stretching causes transient smearing. Consider ganging them or adding a "Quality" mode that adjusts FFT size automatically.
2. **FFT Order latency:** Higher orders = better quality but more latency. For live input monitoring, keep FFT small (order 9-10 = 512-1024 samples).
3. **Mix at 0% should bypass the vocoder entirely** to save CPU. The node is already created; routing should skip it when mix == 0.

---

## 4. Blend Mode UI Semantics

The MIDI synth supports 6 blend modes: Mix, Ring, FM, Sync, Add, Morph.

### Contextual Parameter Panels
Each blend mode should show only relevant parameters:

| Mode | Primary Visual | Secondary Params |
|------|---------------|------------------|
| Mix | Waveform + sample waveforms | Mix position, crossfade curve |
| Ring | Amplitude envelope visualization | Carrier/sample balance |
| FM | Frequency spectrum | Mod index, FM ratio |
| Sync | Oscillator phase plot | Hard sync amount |
| Add | Partial bar graph | Partial count, tilt, drift |
| Morph | Morph position slider + spectral interpolation | Morph depth, curve |

### Manifold Integration
The `rack_sample.lua` behavior already handles blend mode switching. A new `sampleScope` or `spectralDisplay` widget could be conditionally shown when mode is "Add" or "Morph".

---

## 5. Async Analysis Integration Recommendations

### Current Flow (observed in `sample_synth.lua`)
1. Capture completes → `playbackNode` updated
2. `requestAnalysis(playbackNode)` queues async analysis
3. `pollAnalysis(playbackNode)` checks completion
4. Results populate `latestAnalysis`, `latestPartials`, `latestTemporal`

### Recommended UI Flow
```lua
-- In the sample tab update loop
local inFlight = synth.isAnalysisInFlight()
if not inFlight and not hasAnalysisForCurrentSample then
  synth.requestAnalysis(playbackNode)
  setAnalysisSpinnerVisible(true)
end

local complete, analysis, partials, temporal = synth.pollAnalysis(playbackNode)
if complete then
  setAnalysisSpinnerVisible(false)
  updateSpectralDisplay(partials)
end
```

### Avoid These Pitfalls
1. **Don't poll every frame if analysis is known to take >100ms.** Poll every 5-10 frames instead.
2. **Don't request analysis on every parameter change.** Only request after capture completes or after the user explicitly clicks "Analyze".
3. **Handle analysis failure gracefully.** If `pcall` fails inside `requestAnalysis`, the UI should show "Analysis unavailable" rather than crashing or retrying infinitely.

---

## 6. Web Remote Integration Path

The web remote custom surface builder (from 2026-04-14) can eventually host sample visualization widgets.

### Proposed OSCQuery Endpoints
To support a web-based sample editor, the export shell should expose:
```
/sample/waveform         → Float32 array of waveform peaks (decimated)
/sample/spectralPartials → JSON array of {freq, amp} objects
/sample/captureState     → string: "idle" | "armed" | "recording" | "processing"
/sample/loopRegion       → {start, end} in samples
```

### Streaming Strategy
For waveform data, use **bundle polling** (not SSE) because:
- Waveform data is large (~512-2048 floats)
- It only changes on capture, not continuously
- Polling on a 500ms interval is sufficient

For capture state, standard OSCQuery polling (already working) is fine.

---

## 7. Key Takeaways

1. **Capture UX should be modeless by default.** Retrospective capture with a single button is the 90% use case.
2. **Spectral visualization should be simple.** A partial bar graph is more useful than a waterfall for additive/morph modes.
3. **Phase vocoder parameters need quality presets.** Don't expose raw FFT order to users unless they're advanced.
4. **Blend modes should drive the visible UI.** Show the waveform scope for Mix/Ring/FM/Sync, show spectral display for Add/Morph.
5. **Analysis is a background operation.** Spinner + poll pattern. Never block the UI thread.

---

*This research supports the ongoing MIDI synth sample engine work. The companion prototype `prototypes/2026-04-15-sample-synth-visualizer.html` demonstrates these patterns interactively.*
