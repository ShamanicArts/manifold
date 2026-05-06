local px = math.floor

local C = {
  bg=0xff151515, text=0xffffffff, muted=0xff93c5fd, label=0xffaaaaaa,
  panel=0xff101827, panelBorder=0xff253044, accent=0xff8b5cf6, accent2=0xff22d3ee,
  slider=0xff8b5cf6, track=0xff0b1020, btn=0xff26223a, good=0xff15351f, goodText=0xff86efac,
  bad=0xff351515, badText=0xffff8888, preset=0xff2a2623,
}

local function slider(id, x, y, w, h, opts)
  return { id=id, type="Slider", x=px(x), y=px(y), w=px(w), h=px(h),
    props={ min=opts.min, max=opts.max, step=opts.step or 0.01, value=opts.value, label=opts.label, compact=true, showValue=(opts.showValue ~= false), paramPath=opts.path },
    style={ colour=C.slider, bg=C.track, fontSize=10 } }
end

local function label(id, x, y, w, h, text, colour, size)
  return { id=id, type="Label", x=px(x), y=px(y), w=px(w), h=px(h), props={ text=text }, style={ colour=colour or C.text, fontSize=size or 11 } }
end

local function button(id, x, y, w, h, text, bg, fg)
  return { id=id, type="Button", x=px(x), y=px(y), w=px(w), h=px(h), props={ label=text }, style={ bg=bg or C.btn, textColour=fg or C.text, fontSize=11, radius=4 } }
end

return {
  type="Panel", behavior="ui/behaviors/main.lua", x=0, y=0, w=px(1200), h=px(720), style={ bg=C.bg },
  children={
    label("title", 18, 12, 500, 28, "VECTOR SYNTH", C.text, 22),
    label("subtitle", 18, 40, 820, 16, "8-voice polyphonic vector synth: A Osc | B Noise | C Additive | D Pulse/Sub + per-note vector envelope", C.muted, 10),

    label("midi_label", 18, 68, 100, 16, "MIDI Input", C.muted, 11),
    { id="midi_input_dropdown", type="Dropdown", x=px(18), y=px(86), w=px(280), h=px(24), props={ options={"Scanning..."}, selected=1, max_visible_rows=8 }, style={ bg=C.panelBorder, colour=C.text, fontSize=10 } },
    button("midi_refresh_btn", 308, 86, 80, 24, "Refresh", C.btn, C.text),
    label("midi_status", 400, 88, 660, 20, "Device: scanning...", C.goodText, 11),

    { id="trigger_btn", type="Button", x=px(18), y=px(126), w=px(140), h=px(36), props={ label="Strike C4", paramPath="/vector/manual_trigger" }, style={ bg=C.good, textColour=C.goodText, fontSize=12, radius=4 } },
    { id="panic_btn", type="Button", x=px(170), y=px(126), w=px(100), h=px(36), props={ label="Panic", paramPath="/vector/panic" }, style={ bg=C.bad, textColour=C.badText, fontSize=12, radius=4 } },

    label("xy_title", 18, 178, 260, 18, "VECTOR XY", C.muted, 12),
    { id="xy_pad", type="Panel", x=px(18), y=px(200), w=px(330), h=px(330), props={ interceptsMouse=true }, style={ bg=C.panel, border=C.panelBorder, borderWidth=1, radius=6 } },
    label("xy_hint", 18, 536, 330, 16, "Drag pad. Env Amount blends manual XY with per-note path.", C.label, 10),

    label("vector_label", 380, 178, 220, 18, "Vector Envelope", C.muted, 12),
    slider("vector_x", 380, 202, 250, 18, { min=0, max=1, step=0.01, value=0.5, label="Manual X", path="/vector/x" }),
    slider("vector_y", 380, 226, 250, 18, { min=0, max=1, step=0.01, value=0.5, label="Manual Y", path="/vector/y" }),
    slider("env_amount", 380, 250, 250, 18, { min=0, max=1, step=0.01, value=0.75, label="Env Amount", path="/vector/env_amount" }),
    slider("env_speed", 380, 274, 250, 18, { min=0.05, max=8, step=0.01, value=1.0, label="Env Speed", path="/vector/env_speed" }),
    { id="env_path", type="Dropdown", x=px(380), y=px(300), w=px(250), h=px(22), props={ options={"Orbit", "Corner Tour", "Horizontal", "Vertical", "Random Walk"}, selected=1, paramPath="/vector/env_path", max_visible_rows=5 }, style={ bg=C.panelBorder, colour=C.text, fontSize=10 } },
    { id="env_loop", type="Toggle", x=px(380), y=px(330), w=px(120), h=px(22), props={ label="Loop Path", value=false, paramPath="/vector/env_loop" }, style={ bg=C.btn, colour=C.accent2, fontSize=10 } },

    label("amp_label", 380, 370, 160, 18, "Amp Envelope", C.muted, 12),
    slider("env_attack", 380, 394, 250, 18, { min=0.1, max=5000, step=1, value=20, label="Attack ms", path="/env/attack" }),
    slider("env_decay", 380, 418, 250, 18, { min=1, max=5000, step=1, value=300, label="Decay ms", path="/env/decay" }),
    slider("env_sustain", 380, 442, 250, 18, { min=0, max=1, step=0.01, value=0.7, label="Sustain", path="/env/sustain" }),
    slider("env_release", 380, 466, 250, 18, { min=1, max=8000, step=1, value=900, label="Release ms", path="/env/release" }),

    label("global_label", 660, 178, 160, 18, "Global / Filter", C.muted, 12),
    slider("filter_cutoff", 660, 202, 250, 18, { min=40, max=16000, step=10, value=9000, label="Filter Cutoff", path="/filter/cutoff" }),
    slider("filter_res", 660, 226, 250, 18, { min=0, max=1, step=0.01, value=0.15, label="Filter Resonance", path="/filter/resonance" }),
    slider("glide", 660, 250, 250, 18, { min=0, max=5000, step=1, value=0, label="Glide ms", path="/glide" }),
    slider("master_gain", 660, 274, 250, 18, { min=0, max=2, step=0.01, value=0.75, label="Master Gain", path="/master/gain" }),

    label("source_a_label", 660, 318, 240, 18, "A: Oscillator / Supersaw", C.muted, 12),
    { id="a_wave", type="Dropdown", x=px(660), y=px(342), w=px(250), h=px(22), props={ options={"Sine","Saw","Square","Triangle","Blend","Noise","Pulse","Supersaw"}, selected=2, paramPath="/source/a/waveform", max_visible_rows=8 }, style={ bg=C.panelBorder, colour=C.text, fontSize=10 } },
    slider("a_oct", 660, 370, 120, 18, { min=-2, max=2, step=1, value=0, label="A Oct", path="/source/a/octave" }),
    slider("a_semi", 790, 370, 120, 18, { min=-12, max=12, step=1, value=0, label="A Semi", path="/source/a/semitone" }),
    slider("a_detune", 660, 394, 120, 18, { min=0, max=100, step=1, value=12, label="A Detune", path="/source/a/detune" }),
    slider("a_spread", 790, 394, 120, 18, { min=0, max=1, step=0.01, value=0.4, label="A Spread", path="/source/a/spread" }),
    slider("a_unison", 660, 418, 250, 18, { min=1, max=8, step=1, value=3, label="A Unison", path="/source/a/unison" }),

    label("source_b_label", 940, 178, 220, 18, "B: Noise", C.muted, 12),
    slider("b_color", 940, 202, 220, 18, { min=0, max=1, step=0.01, value=0.35, label="Noise Color", path="/source/b/color" }),

    label("source_c_label", 940, 250, 220, 18, "C: Additive", C.muted, 12),
    slider("c_partials", 940, 274, 220, 18, { min=1, max=32, step=1, value=12, label="Partials", path="/source/c/partials" }),
    slider("c_tilt", 940, 298, 220, 18, { min=-1, max=1, step=0.01, value=0.25, label="Tilt", path="/source/c/tilt" }),
    slider("c_drift", 940, 322, 220, 18, { min=0, max=1, step=0.01, value=0.05, label="Drift", path="/source/c/drift" }),
    slider("c_oct", 940, 346, 105, 18, { min=-2, max=2, step=1, value=1, label="C Oct", path="/source/c/octave" }),
    slider("c_semi", 1055, 346, 105, 18, { min=-12, max=12, step=1, value=0, label="C Semi", path="/source/c/semitone" }),

    label("source_d_label", 940, 394, 220, 18, "D: Pulse/Sub", C.muted, 12),
    { id="d_wave", type="Dropdown", x=px(940), y=px(418), w=px(220), h=px(22), props={ options={"Sine","Saw","Square","Triangle","Blend","Noise","Pulse","Supersaw"}, selected=7, paramPath="/source/d/waveform", max_visible_rows=8 }, style={ bg=C.panelBorder, colour=C.text, fontSize=10 } },
    slider("d_oct", 940, 446, 105, 18, { min=-2, max=2, step=1, value=-1, label="D Oct", path="/source/d/octave" }),
    slider("d_semi", 1055, 446, 105, 18, { min=-12, max=12, step=1, value=0, label="D Semi", path="/source/d/semitone" }),
    slider("d_pulse", 940, 470, 105, 18, { min=0.01, max=0.99, step=0.01, value=0.35, label="Pulse", path="/source/d/pulse_width" }),
    slider("d_detune", 1055, 470, 105, 18, { min=0, max=100, step=1, value=5, label="D Detune", path="/source/d/detune" }),

    label("preset_label", 18, 590, 100, 18, "Presets", C.muted, 12),
    button("preset_lead", 18, 616, 86, 28, "Lead", C.preset, C.text),
    button("preset_pad", 112, 616, 86, 28, "Pad", C.preset, C.text),
    button("preset_noise", 206, 616, 86, 28, "Noise", C.preset, C.text),
    button("preset_add", 300, 616, 86, 28, "Additive", C.preset, C.text),
    button("preset_sub", 394, 616, 86, 28, "Sub", C.preset, C.text),
    button("preset_chaos", 488, 616, 86, 28, "Chaos", C.preset, C.text),

    label("footer", 18, 666, 1100, 16, "CC1 controls X, CC74 controls Y. Per-note vector envelopes start from t=0 on every note-on.", C.label, 10),
  }
}
