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
  w = px(1080), h = px(520),
  style = { bg = C.bg },
  children = {
    {
      id = "title",
      type = "Label",
      x = px(18), y = px(12), w = px(600), h = px(28),
      props = { text = "KARPLUS-STRONG LAB" },
      style = { colour = C.text, fontSize = 22 }
    },
    {
      id = "subtitle",
      type = "Label",
      x = px(18), y = px(40), w = px(800), h = px(16),
      props = { text = "Noise → SVF(tone) → EnvGain → Comb → Allpass(stiffness) → Filter → Resonator(body) → Out" },
      style = { colour = C.textMuted, fontSize = 10 }
    },

    -- MIDI input row
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
      props = { label = "Pluck C4", paramPath = "/ks/manual_trigger" },
      style = { bg = C.triggerBg, textColour = C.triggerText, fontSize = 12, radius = 4 }
    },
    {
      id = "panic_btn",
      type = "Button",
      x = px(170), y = px(126), w = px(100), h = px(36),
      props = { label = "Panic", paramPath = "/ks/panic" },
      style = { bg = C.panicBg, textColour = C.panicText, fontSize = 12, radius = 4 }
    },

    -- Source panel
    {
      id = "source_label",
      type = "Label",
      x = px(18), y = px(178), w = px(200), h = px(16),
      props = { text = "Source" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    slider("noise_color",        18, 198, 240, 18, { min = 0.0,   max = 1.0,     step = 0.01,  value = 0.0,   label = "Noise Color", path = "/ks/noise/color" }),

    -- Excitation panel
    {
      id = "excitation_label",
      type = "Label",
      x = px(18), y = px(228), w = px(200), h = px(16),
      props = { text = "Excitation (Noise Burst)" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    slider("excitation_attack",  18, 248, 240, 18, { min = 0.1,   max = 50.0,    step = 0.1,   value = 5.0,   label = "Attack (ms)",  path = "/ks/excitation/attack" }),
    slider("excitation_decay",   18, 272, 240, 18, { min = 1.0,   max = 100.0,   step = 1.0,   value = 20.0,  label = "Decay (ms)",   path = "/ks/excitation/decay" }),
    slider("excitation_level",   18, 296, 240, 18, { min = 0.0,   max = 1.0,     step = 0.01,  value = 0.8,   label = "Level",        path = "/ks/excitation/level" }),

    -- Excitation tone panel
    {
      id = "tone_label",
      type = "Label",
      x = px(280), y = px(228), w = px(200), h = px(16),
      props = { text = "Excitation Tone (SVF)" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    {
      id = "tone_mode",
      type = "Dropdown",
      x = px(280), y = px(248), w = px(240), h = px(20),
      props = { options = { "Lowpass", "Bandpass", "Highpass", "Notch" }, selected = 1, paramPath = "/ks/excitation/tone_mode", max_visible_rows = 4 },
      style = { bg = C.accentDark, colour = C.text, fontSize = 10 }
    },
    slider("tone_cutoff",        280, 274, 240, 18, { min = 100.0, max = 10000.0, step = 10.0,  value = 4000.0, label = "Cutoff (Hz)",  path = "/ks/excitation/tone_cutoff" }),
    slider("tone_reson",         280, 298, 240, 18, { min = 0.0,   max = 1.0,     step = 0.01,  value = 0.3,   label = "Resonance",    path = "/ks/excitation/tone_reson" }),

    -- String panel
    {
      id = "string_label",
      type = "Label",
      x = px(542), y = px(228), w = px(200), h = px(16),
      props = { text = "String" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    slider("string_decay",       542, 248, 240, 18, { min = 0.1,   max = 10.0,    step = 0.1,   value = 2.0,   label = "Decay (s)",    path = "/ks/string/decay" }),
    slider("string_stiffness",   542, 272, 240, 18, { min = 0.0,   max = 1.0,     step = 0.01,  value = 0.0,   label = "Stiffness",    path = "/ks/string/stiffness" }),

    -- Filter panel
    {
      id = "filter_label",
      type = "Label",
      x = px(542), y = px(296), w = px(200), h = px(16),
      props = { text = "Filter (LP)" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    slider("filter_cutoff",      542, 316, 240, 18, { min = 100.0, max = 12000.0, step = 10.0,  value = 4000.0, label = "Cutoff (Hz)",  path = "/ks/filter/cutoff" }),
    slider("filter_resonance",   542, 340, 240, 18, { min = 0.0,   max = 1.0,     step = 0.01,  value = 0.2,   label = "Resonance",    path = "/ks/filter/resonance" }),

    -- Body panel
    {
      id = "body_label",
      type = "Label",
      x = px(804), y = px(228), w = px(200), h = px(16),
      props = { text = "Body (Resonator)" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    slider("body_freq",          804, 248, 240, 18, { min = 20.0,  max = 5000.0,  step = 10.0,  value = 200.0, label = "Freq (Hz)",    path = "/ks/body/freq" }),
    slider("body_q",             804, 272, 240, 18, { min = 1.0,   max = 100.0,   step = 1.0,   value = 12.0,  label = "Q",            path = "/ks/body/q" }),
    slider("body_gain",          804, 296, 240, 18, { min = 0.0,   max = 2.0,     step = 0.01,  value = 0.8,   label = "Gain",         path = "/ks/body/gain" }),
    slider("body_mix",           804, 320, 240, 18, { min = 0.0,   max = 1.0,     step = 0.01,  value = 0.35,  label = "Mix",          path = "/ks/body/mix" }),

    -- Master
    {
      id = "master_label",
      type = "Label",
      x = px(18), y = px(366), w = px(200), h = px(16),
      props = { text = "Output" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    slider("master_gain",        18, 386, 240, 18, { min = 0.0,   max = 2.0,   step = 0.01,  value = 0.7,   label = "Gain",         path = "/ks/master/gain" }),

    -- Presets
    {
      id = "preset_label",
      type = "Label",
      x = px(280), y = px(366), w = px(200), h = px(16),
      props = { text = "Presets" },
      style = { colour = C.textMuted, fontSize = 11 }
    },
    button("preset_guitar",  280, 386, 80, 28, "Guitar",  C.presetOff, C.text),
    button("preset_harp",    368, 386, 80, 28, "Harp",    C.presetOff, C.text),
    button("preset_kalimba", 456, 386, 80, 28, "Kalimba", C.presetOff, C.text),
    button("preset_bell",    544, 386, 80, 28, "Bell",    C.presetOff, C.text),
    button("preset_drum",    632, 386, 80, 28, "Drum",    C.presetOff, C.text),

    -- Footer
    {
      id = "footer",
      type = "Label",
      x = px(18), y = px(450), w = px(1040), h = px(16),
      props = { text = "Play MIDI notes, hit Pluck, or choose a preset. Adjust noise color, excitation tone, string stiffness and body resonance to sculpt the instrument." },
      style = { colour = C.label, fontSize = 10 }
    },
  },
}
