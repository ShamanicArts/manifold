local px = math.floor

local C = {
  bg = 0xff151515, text = 0xffffffff, muted = 0xff93c5fd,
  label = 0xffaaaaaa, panel = 0xff101827, panelBorder = 0xff253044,
  accent = 0xff00c896, accentDim = 0xff15352d, accentText = 0xff86efac,
  freezeOn = 0xff00c896, freezeOff = 0xff2a3540, freezeText = 0xffffffff,
  slider = 0xff00c896, track = 0xff0b1020, btn = 0xff26223a,
  bad = 0xff351515, badText = 0xffff8888, preset = 0xff2a2623,
  live = 0xff22d3ee, sample = 0xfffca5a5, warn = 0xffffcc66,
}

local function slider(id, x, y, w, h, opts)
  return { id=id, type="Slider", x=px(x), y=px(y), w=px(w), h=px(h),
    props={ min=opts.min, max=opts.max, step=opts.step or 0.01, value=opts.value,
            label=opts.label, compact=true, showValue=(opts.showValue ~= false), paramPath=opts.path },
    style={ colour=C.slider, bg=C.track, fontSize=10 } }
end

local function label(id, x, y, w, h, text, colour, size)
  return { id=id, type="Label", x=px(x), y=px(y), w=px(w), h=px(h),
    props={ text=text }, style={ colour=colour or C.text, fontSize=size or 11 } }
end

local function button(id, x, y, w, h, text, bg, fg)
  return { id=id, type="Button", x=px(x), y=px(y), w=px(w), h=px(h),
    props={ label=text }, style={ bg=bg or C.btn, textColour=fg or C.text, fontSize=11, radius=4 } }
end

return {
  type="Panel", behavior="ui/behaviors/main.lua", x=0, y=0, w=px(1120), h=px(700), style={ bg=C.bg },
  children={
    label("title", 18, 12, 500, 28, "GRANULAR LAB", C.text, 22),
    label("subtitle", 18, 40, 760, 16, "Polyphonic granular sampler: load a file or capture live input, then play grains from MIDI. CC1→Position, CC74→Spray.", C.muted, 10),

    label("midi_label", 18, 68, 100, 16, "MIDI Input", C.muted, 11),
    { id="midi_input_dropdown", type="Dropdown", x=px(18), y=px(86), w=px(280), h=px(24),
      props={ options={"Scanning..."}, selected=1, max_visible_rows=8 },
      style={ bg=C.panelBorder, colour=C.text, fontSize=10 } },
    button("midi_refresh_btn", 308, 86, 80, 24, "Refresh", C.btn, C.text),
    label("midi_status", 400, 88, 660, 20, "Device: scanning...", C.accentText, 11),

    { id="freeze_btn", type="Button", x=px(18), y=px(126), w=px(130), h=px(44),
      props={ label="LIVE FREEZE", paramPath="/granular/freeze" },
      style={ bg=C.freezeOn, textColour=C.freezeText, fontSize=14, radius=6 } },
    label("freeze_hint", 18, 176, 240, 16, "Only affects Live mode; sample buffers are already held", C.label, 9),

    { id="mode_live", type="Toggle", x=px(170), y=px(126), w=px(80), h=px(28),
      props={ label="Live", value=false, paramPath="/granular/mode" },
      style={ bg=C.btn, colour=C.live, fontSize=11 } },
    { id="mode_sample", type="Toggle", x=px(260), y=px(126), w=px(90), h=px(28),
      props={ label="Sample", value=true },
      style={ bg=C.btn, colour=C.sample, fontSize=11 } },
    { id="midi_mode", type="Toggle", x=px(360), y=px(126), w=px(110), h=px(28),
      props={ label="MIDI Gate", value=true, paramPath="/granular/midi_mode" },
      style={ bg=C.btn, colour=C.accent, fontSize=11 } },
    { id="panic_btn", type="Button", x=px(486), y=px(126), w=px(88), h=px(34),
      props={ label="Panic", paramPath="/granular/panic" },
      style={ bg=C.bad, textColour=C.badText, fontSize=12, radius=4 } },

    label("waveform_label", 18, 210, 200, 18, "Sample / Capture Waveform", C.muted, 12),
    { id="waveform", type="WaveformView", x=px(18), y=px(232), w=px(560), h=px(190),
      props={ mode="samplePath", samplePath="/granular/voice/1/sample",
              colour=0xff4a5568, bg=C.panel, playheadColour=0xffffd54f },
      style={ bg=C.panel, border=C.panelBorder, borderWidth=1, radius=6 } },
    label("waveform_status", 28, 242, 390, 16, "Sample buffer", C.label, 10),

    label("sample_label", 610, 210, 200, 18, "Sample / Recording", C.muted, 12),
    button("sample_load", 610, 232, 100, 28, "Load File", C.accentDim, C.accentText),
    button("capture_to_sample", 720, 232, 130, 28, "Capture Live", C.accentDim, C.accentText),
    button("sample_play", 860, 232, 70, 28, "Play", C.accentDim, C.accentText),
    button("sample_stop", 940, 232, 70, 28, "Stop", C.btn, C.text),
    label("sample_file", 610, 264, 480, 18, "No sample loaded", C.label, 10),
    slider("sample_speed", 610, 292, 230, 18, { min=0.25, max=4.0, step=0.01, value=1.0, label="Speed", path="/sample/speed" }),
    slider("sample_seek", 610, 316, 230, 18, { min=0, max=1, step=0.001, value=0, label="Playhead / Seek", path="/sample/seek" }),
    slider("play_start", 610, 340, 230, 18, { min=0, max=1, step=0.001, value=0, label="Play Start", path="/sample/play_start" }),
    slider("loop_start", 610, 364, 230, 18, { min=0, max=1, step=0.001, value=0, label="Loop Start", path="/sample/loop_start" }),
    slider("loop_end", 610, 388, 230, 18, { min=0, max=1, step=0.001, value=1, label="Loop End", path="/sample/loop_end" }),
    slider("crossfade", 860, 292, 180, 18, { min=0, max=0.5, step=0.001, value=0.03, label="Loop XFade", path="/sample/crossfade" }),
    slider("sample_level", 860, 316, 180, 18, { min=0, max=2, step=0.01, value=0.0, label="Dry Sample", path="/sample/level" }),
    label("sample_loop_info", 860, 344, 180, 22, "Looping while voice is held", C.label, 10),

    label("granular_label", 18, 448, 200, 18, "Granulator", C.muted, 12),
    slider("grain_size", 18, 472, 250, 18, { min=1, max=500, step=1, value=90, label="Grain Size (ms)", path="/granular/grain_size" }),
    slider("density", 18, 496, 250, 18, { min=1, max=100, step=1, value=24, label="Density (grains/s)", path="/granular/density" }),
    slider("position", 18, 520, 250, 18, { min=0, max=1, step=0.001, value=0, label="Grain Position", path="/granular/position" }),
    slider("pitch", 18, 544, 250, 18, { min=-24, max=24, step=0.1, value=0, label="Pitch Offset (st)", path="/granular/pitch" }),
    slider("spray", 18, 568, 250, 18, { min=0, max=1, step=0.01, value=0.18, label="Spray / Random Position", path="/granular/spray" }),
    slider("granular_mix", 18, 592, 120, 18, { min=0, max=1, step=0.01, value=1.0, label="Wet Mix", path="/granular/mix" }),
    slider("grain_level", 148, 592, 120, 18, { min=0, max=2, step=0.01, value=1.0, label="Grain Level", path="/granular/grain_level" }),
    slider("voice_count", 18, 616, 120, 18, { min=1, max=6, step=1, value=6, label="Voices", path="/granular/voice_count" }),
    { id="envelope_type", type="Dropdown", x=px(148), y=px(616), w=px(120), h=px(22),
      props={ options={"Hann", "Triangle", "Blackman", "Tukey", "Rect"}, selected=1, paramPath="/granular/envelope", max_visible_rows=5 },
      style={ bg=C.panelBorder, colour=C.text, fontSize=10 } },

    label("fx_label", 300, 448, 200, 18, "Filter / Reverb", C.muted, 12),
    slider("filter_cutoff", 300, 472, 230, 18, { min=20, max=16000, step=10, value=10000, label="Cutoff", path="/filter/cutoff" }),
    slider("filter_res", 300, 496, 230, 18, { min=0, max=1, step=0.01, value=0.15, label="Resonance", path="/filter/resonance" }),
    slider("reverb_size", 300, 520, 230, 18, { min=0, max=1, step=0.01, value=0.55, label="Reverb Size", path="/reverb/size" }),
    slider("reverb_wet", 300, 544, 230, 18, { min=0, max=1, step=0.01, value=0.25, label="Reverb Wet", path="/reverb/wet" }),
    slider("master_gain", 300, 568, 230, 18, { min=0, max=2, step=0.01, value=0.8, label="Master Gain", path="/master/gain" }),
    slider("base_note", 300, 592, 110, 18, { min=36, max=96, step=1, value=60, label="Root Note", path="/granular/base_note" }),
    slider("glide", 420, 592, 110, 18, { min=0, max=1000, step=1, value=15, label="Glide ms", path="/granular/glide" }),
    slider("capture_seconds", 300, 616, 230, 18, { min=1, max=30, step=1, value=12, label="Capture / Grain Buffer sec", path="/granular/capture_seconds" }),

    label("preset_label", 610, 448, 100, 18, "Presets", C.muted, 12),
    button("preset_cloud", 610, 472, 88, 28, "Cloud", C.preset, C.text),
    button("preset_rain", 706, 472, 88, 28, "Rain", C.preset, C.text),
    button("preset_texture", 802, 472, 88, 28, "Texture", C.preset, C.text),
    button("preset_stutter", 610, 508, 88, 28, "Stutter", C.preset, C.text),
    button("preset_pad", 706, 508, 88, 28, "Pad", C.preset, C.text),
    button("preset_riser", 802, 508, 88, 28, "Riser", C.preset, C.text),

    label("help", 610, 560, 470, 52, "Workflow: Load File or Capture Live → press MIDI keys. Play is manual drone/audition. In Sample mode the waveform playhead follows voice 1 playback; dragging waveform moves grain position and seek.", C.label, 10),
    label("footer", 18, 666, 1000, 16, "This is a sampler: per-voice sample playback feeds per-voice granulators. Live mode still granulates mic/input directly.", C.warn, 10),
  }
}
