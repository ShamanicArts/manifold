local px = math.floor

local C = {
  bg           = 0xff161616,
  panelBg      = 0xff1a1a1a,
  panelBorder  = 0xff2a2a2a,
  accent       = 0xff79d0ee,
  accentDark   = 0xff2a3146,
  text         = 0xffffffff,
  textMuted    = 0xff93c5fd,
  label        = 0xffaaaaaa,
  sliderFill   = 0xff47a7d3,
  sliderTrack  = 0xff0f0f0f,
  buttonBg     = 0xff2a2623,
  triggerBg    = 0xff1a2a1a,
  triggerText  = 0xff86efac,
  panicBg      = 0xff2a1a17,
  panicText    = 0xffff8888,
  presetOn     = 0xffe2ad34,
  presetOff    = 0xff2a2623,
  modeLabel    = 0xff888888,
}

local function slider(id, x, y, w, h, opts)
  return {
    id = id, type = "Slider", x = px(x), y = px(y), w = px(w), h = px(h),
    props = {
      min = opts.min, max = opts.max, step = opts.step or 0.01,
      value = opts.value, label = opts.label, compact = true,
      showValue = (opts.showValue ~= false), paramPath = opts.path,
    },
    style = { colour = C.sliderFill, bg = C.sliderTrack, fontSize = 10 }
  }
end

local function button(id, x, y, w, h, label, bg, textColour)
  return {
    id = id, type = "Button", x = px(x), y = px(y), w = px(w), h = px(h),
    props = { label = label },
    style = { bg = bg or C.buttonBg, textColour = textColour or C.text, fontSize = 11, radius = 4 }
  }
end

return {
  type = "Panel",
  behavior = "ui/behaviors/main.lua",
  x = px(0), y = px(0),
  w = px(1200), h = px(680),
  style = { bg = C.bg },
  children = {
    {
      id = "title",
      type = "Label",
      x = px(18), y = px(12), w = px(600), h = px(28),
      props = { text = "MODAL SYNTHESIS LAB" },
      style = { colour = C.text, fontSize = 22 }
    },
    {
      id = "subtitle",
      type = "Label",
      x = px(18), y = px(40), w = px(900), h = px(16),
      props = { text = "Noise burst → Parallel resonators (6 modes) → Mix → Filter → Out" },
      style = { colour = C.textMuted, fontSize = 10 }
    },

    -- MIDI row
    {
      id = "midi_label",
      type = "Label",
      x = px(18), y = px(68), w = px(100), h = px(16),
      props = { text = "MIDI Input" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    {
      id = "midi_input_dropdown",
      type = "Dropdown",
      x = px(18), y = px(86), w = px(280), h = px(24),
      props = { options = { "Scanning..." }, selected = 1, max_visible_rows = 8 },
      style = { bg = C.accentDark, colour = C.text, fontSize = 10 }
    },
    button("midi_refresh_btn", 308, 86, 80, 24, "Refresh", C.buttonBg, C.text),
    {
      id = "midi_status",
      type = "Label",
      x = px(400), y = px(88), w = px(660), h = px(20),
      props = { text = "Device: scanning..." },
      style = { colour = C.triggerText, fontSize = 11 }
    },

    -- Trigger / panic
    {
      id = "trigger_btn",
      type = "Button",
      x = px(18), y = px(126), w = px(140), h = px(36),
      props = { label = "Strike C4", paramPath = "/modal/manual_trigger" },
      style = { bg = C.triggerBg, textColour = C.triggerText, fontSize = 12, radius = 4 }
    },
    {
      id = "panic_btn",
      type = "Button",
      x = px(170), y = px(126), w = px(100), h = px(36),
      props = { label = "Panic", paramPath = "/modal/panic" },
      style = { bg = C.panicBg, textColour = C.panicText, fontSize = 12, radius = 4 }
    },

    -- Excitation panel
    {
      id = "excitation_label",
      type = "Label",
      x = px(18), y = px(178), w = px(200), h = px(16),
      props = { text = "Excitation (Noise Burst)" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    slider("excitation_attack",   18, 198, 240, 18, { min = 0.1,   max = 50.0,    step = 0.1,   value = 2.0,   label = "Attack (ms)",  path = "/modal/excitation/attack" }),
    slider("excitation_decay",    18, 222, 240, 18, { min = 1.0,   max = 100.0,   step = 1.0,   value = 15.0,  label = "Decay (ms)",   path = "/modal/excitation/decay" }),
    slider("excitation_level",    18, 246, 240, 18, { min = 0.0,   max = 1.0,     step = 0.01,  value = 1.0,   label = "Level",        path = "/modal/excitation/level" }),
    {
      id = "tone_mode",
      type = "Dropdown",
      x = px(18), y = px(270), w = px(240), h = px(20),
      props = { options = { "Lowpass", "Bandpass", "Highpass", "Notch" }, selected = 1, paramPath = "/modal/excitation/tone_mode", max_visible_rows = 4 },
      style = { bg = C.accentDark, colour = C.text, fontSize = 10 }
    },
    slider("tone_cutoff",         18, 294, 240, 18, { min = 100.0, max = 12000.0, step = 10.0,  value = 6000.0, label = "Cutoff (Hz)",  path = "/modal/excitation/tone_cutoff" }),
    slider("tone_reson",          18, 318, 240, 18, { min = 0.0,   max = 1.0,     step = 0.01,  value = 0.3,   label = "Resonance",    path = "/modal/excitation/tone_reson" }),

    -- Modes panel
    {
      id = "modes_label",
      type = "Label",
      x = px(280), y = px(178), w = px(200), h = px(16),
      props = { text = "Modes" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    slider("modes_decay_scale",   280, 198, 240, 18, { min = 0.2,   max = 3.0,     step = 0.01,  value = 1.0,   label = "Decay Scale",  path = "/modal/modes/decay_scale" }),
    slider("modes_brightness",    280, 222, 240, 18, { min = 0.0,   max = 1.0,     step = 0.01,  value = 1.0,   label = "Brightness",   path = "/modal/modes/brightness" }),
    slider("modes_res_gain",      280, 246, 240, 18, { min = 0.0,   max = 10.0,    step = 0.1,   value = 3.0,   label = "Res Gain",     path = "/modal/modes/resonator_gain" }),

    -- Mode display (6 labels showing ratios/freqs for reference note)
    {
      id = "mode_display_label",
      type = "Label",
      x = px(280), y = px(276), w = px(240), h = px(14),
      props = { text = "Mode ratios (ref A4=440Hz):" },
      style = { colour = C.modeLabel, fontSize = 9 }
    },
    {
      id = "mode_1",
      type = "Label",
      x = px(280), y = px(292), w = px(240), h = px(14),
      props = { text = "M1: ×1.0   440 Hz" },
      style = { colour = C.modeLabel, fontSize = 9 }
    },
    {
      id = "mode_2",
      type = "Label",
      x = px(280), y = px(306), w = px(240), h = px(14),
      props = { text = "M2: ×2.7  1188 Hz" },
      style = { colour = C.modeLabel, fontSize = 9 }
    },
    {
      id = "mode_3",
      type = "Label",
      x = px(280), y = px(320), w = px(240), h = px(14),
      props = { text = "M3: ×5.4  2376 Hz" },
      style = { colour = C.modeLabel, fontSize = 9 }
    },
    {
      id = "mode_4",
      type = "Label",
      x = px(280), y = px(334), w = px(240), h = px(14),
      props = { text = "M4: ×8.9  3916 Hz" },
      style = { colour = C.modeLabel, fontSize = 9 }
    },
    {
      id = "mode_5",
      type = "Label",
      x = px(280), y = px(348), w = px(240), h = px(14),
      props = { text = "M5: ×13.5 5940 Hz" },
      style = { colour = C.modeLabel, fontSize = 9 }
    },
    {
      id = "mode_6",
      type = "Label",
      x = px(280), y = px(362), w = px(240), h = px(14),
      props = { text = "M6: ×18.8 8272 Hz" },
      style = { colour = C.modeLabel, fontSize = 9 }
    },

    -- Output panel
    {
      id = "output_label",
      type = "Label",
      x = px(542), y = px(178), w = px(200), h = px(16),
      props = { text = "Output" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    slider("filter_cutoff",       542, 198, 240, 18, { min = 100.0, max = 16000.0, step = 10.0,  value = 8000.0, label = "Filter Cutoff", path = "/modal/filter/cutoff" }),
    slider("filter_reson",        542, 222, 240, 18, { min = 0.0,   max = 1.0,     step = 0.01,  value = 0.2,   label = "Resonance",    path = "/modal/filter/resonance" }),
    slider("master_gain",         542, 246, 240, 18, { min = 0.0,   max = 2.0,     step = 0.01,  value = 1.0,   label = "Gain",         path = "/modal/master/gain" }),

    -- Presets
    {
      id = "preset_label",
      type = "Label",
      x = px(804), y = px(178), w = px(200), h = px(16),
      props = { text = "Presets" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    button("preset_bell",    804, 198, 100, 28, "Bell",    C.presetOff, C.text),
    button("preset_marimba", 804, 230, 100, 28, "Marimba", C.presetOff, C.text),
    button("preset_glass",   804, 262, 100, 28, "Glass",   C.presetOff, C.text),
    button("preset_steel",   804, 294, 100, 28, "Steel",   C.presetOff, C.text),
    button("preset_wood",    804, 326, 100, 28, "Wood",    C.presetOff, C.text),

    -- Mode Editor section
    {
      id = "editor_label",
      type = "Label",
      x = px(18), y = px(396), w = px(300), h = px(18),
      props = { text = "MODE EDITOR" },
      style = { colour = C.accent, fontSize = 12 }
    },
    {
      id = "editor_ratio_label",
      type = "Label",
      x = px(18), y = px(418), w = px(80), h = px(14),
      props = { text = "Ratio" },
      style = { colour = C.textMuted, fontSize = 10 }
    },
    {
      id = "editor_gain_label",
      type = "Label",
      x = px(280), y = px(418), w = px(80), h = px(14),
      props = { text = "Gain" },
      style = { colour = C.textMuted, fontSize = 10 }
    },
    {
      id = "editor_q_label",
      type = "Label",
      x = px(542), y = px(418), w = px(80), h = px(14),
      props = { text = "Q" },
      style = { colour = C.textMuted, fontSize = 10 }
    },

    -- M1
    slider("m1_ratio",  18,  436, 240, 16, { min = 0.5, max = 30.0, step = 0.1, value = 1.0,  label = "M1 Ratio", path = "/modal/mode/1/ratio" }),
    slider("m1_gain",   280, 436, 240, 16, { min = 0.0, max = 10.0, step = 0.1, value = 3.0,  label = "M1 Gain",  path = "/modal/mode/1/gain" }),
    slider("m1_q",      542, 436, 240, 16, { min = 1.0, max = 200.0, step = 1.0, value = 90.0, label = "M1 Q",     path = "/modal/mode/1/q" }),
    -- M2
    slider("m2_ratio",  18,  456, 240, 16, { min = 0.5, max = 30.0, step = 0.1, value = 2.7,  label = "M2 Ratio", path = "/modal/mode/2/ratio" }),
    slider("m2_gain",   280, 456, 240, 16, { min = 0.0, max = 10.0, step = 0.1, value = 2.5,  label = "M2 Gain",  path = "/modal/mode/2/gain" }),
    slider("m2_q",      542, 456, 240, 16, { min = 1.0, max = 200.0, step = 1.0, value = 75.0, label = "M2 Q",     path = "/modal/mode/2/q" }),
    -- M3
    slider("m3_ratio",  18,  476, 240, 16, { min = 0.5, max = 30.0, step = 0.1, value = 5.4,  label = "M3 Ratio", path = "/modal/mode/3/ratio" }),
    slider("m3_gain",   280, 476, 240, 16, { min = 0.0, max = 10.0, step = 0.1, value = 1.9,  label = "M3 Gain",  path = "/modal/mode/3/gain" }),
    slider("m3_q",      542, 476, 240, 16, { min = 1.0, max = 200.0, step = 1.0, value = 60.0, label = "M3 Q",     path = "/modal/mode/3/q" }),
    -- M4
    slider("m4_ratio",  18,  496, 240, 16, { min = 0.5, max = 30.0, step = 0.1, value = 8.9,  label = "M4 Ratio", path = "/modal/mode/4/ratio" }),
    slider("m4_gain",   280, 496, 240, 16, { min = 0.0, max = 10.0, step = 0.1, value = 1.5,  label = "M4 Gain",  path = "/modal/mode/4/gain" }),
    slider("m4_q",      542, 496, 240, 16, { min = 1.0, max = 200.0, step = 1.0, value = 45.0, label = "M4 Q",     path = "/modal/mode/4/q" }),
    -- M5
    slider("m5_ratio",  18,  516, 240, 16, { min = 0.5, max = 30.0, step = 0.1, value = 13.5, label = "M5 Ratio", path = "/modal/mode/5/ratio" }),
    slider("m5_gain",   280, 516, 240, 16, { min = 0.0, max = 10.0, step = 0.1, value = 1.1,  label = "M5 Gain",  path = "/modal/mode/5/gain" }),
    slider("m5_q",      542, 516, 240, 16, { min = 1.0, max = 200.0, step = 1.0, value = 35.0, label = "M5 Q",     path = "/modal/mode/5/q" }),
    -- M6
    slider("m6_ratio",  18,  536, 240, 16, { min = 0.5, max = 30.0, step = 0.1, value = 18.8, label = "M6 Ratio", path = "/modal/mode/6/ratio" }),
    slider("m6_gain",   280, 536, 240, 16, { min = 0.0, max = 10.0, step = 0.1, value = 0.85, label = "M6 Gain",  path = "/modal/mode/6/gain" }),
    slider("m6_q",      542, 536, 240, 16, { min = 1.0, max = 200.0, step = 1.0, value = 25.0, label = "M6 Q",     path = "/modal/mode/6/q" }),

    -- Footer
    {
      id = "footer",
      type = "Label",
      x = px(18), y = px(570), w = px(1160), h = px(16),
      props = { text = "Play MIDI notes, hit Strike, or choose a preset. Edit individual mode ratios, gains and Q values below." },
      style = { colour = C.label, fontSize = 10 }
    },
  },
}
