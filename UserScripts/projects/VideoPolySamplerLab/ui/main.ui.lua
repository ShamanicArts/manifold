local px = math.floor

local C = {
  bg = 0xff050816,
  panel = 0xff0f172a,
  panel2 = 0xff111827,
  border = 0xff334155,
  text = 0xffffffff,
  muted = 0xff94a3b8,
  live = 0xff22d3ee,
  sample = 0xfff97316,
  voice = 0xffa78bfa,
  good = 0xff22c55e,
  warn = 0xfffacc15,
  bad = 0xffef4444,
  slider = 0xff38bdf8,
  track = 0xff020617,
  button = 0xff1e293b,
}

local function label(id, x, y, w, h, text, colour, size)
  return {
    id = id,
    type = "Label",
    x = px(x), y = px(y), w = px(w), h = px(h),
    props = { text = text },
    style = { colour = colour or C.text, fontSize = size or 11, justification = Justify.centredLeft },
  }
end

local function button(id, x, y, w, h, text, bg, fg)
  return {
    id = id,
    type = "Button",
    x = px(x), y = px(y), w = px(w), h = px(h),
    props = { label = text },
    style = { bg = bg or C.button, textColour = fg or C.text, fontSize = 11, radius = 5, border = C.border, borderWidth = 1 },
  }
end

local function slider(id, x, y, w, h, labelText, min, max, step, value, paramPath)
  return {
    id = id,
    type = "Slider",
    x = px(x), y = px(y), w = px(w), h = px(h),
    props = { label = labelText, min = min, max = max, step = step, value = value, compact = true, showValue = true, paramPath = paramPath },
    style = { colour = C.slider, bg = C.track, fontSize = 10 },
  }
end

local function viewport(id, x, y, w, h, titleColour)
  return {
    id = id,
    type = "Panel",
    x = px(x), y = px(y), w = px(w), h = px(h),
    style = { bg = 0xff000000, border = titleColour or C.border, borderWidth = 1, radius = 8 },
  }
end

local function voiceViewport(index)
  return {
    id = "voiceViewport" .. tostring(index),
    type = "Panel",
    x = 0, y = 0, w = 0, h = 0,
    style = { bg = 0xff000000, border = C.voice, borderWidth = 1, radius = 5 },
  }
end

local function voiceOverlay(index)
  return label("voiceOverlay" .. tostring(index), 0, 0, 0, 0, "", C.voice, 10)
end

local function samplerGridViewport()
  return {
    id = "sampleViewport",
    type = "Panel",
    x = px(662), y = px(200), w = px(600), h = px(338),
    style = { bg = 0xff000000, border = C.sample, borderWidth = 1, radius = 8 },
    children = {
      voiceViewport(1), voiceViewport(2), voiceViewport(3), voiceViewport(4),
      voiceViewport(5), voiceViewport(6), voiceViewport(7), voiceViewport(8),
      voiceOverlay(1), voiceOverlay(2), voiceOverlay(3), voiceOverlay(4),
      voiceOverlay(5), voiceOverlay(6), voiceOverlay(7), voiceOverlay(8),
    }
  }
end

return {
  id = "root",
  type = "Panel",
  behavior = "ui/behaviors/main.lua",
  x = 0, y = 0, w = px(1280), h = px(820),
  shellLayout = { mode = "fill", designW = 1280, designH = 820 },
  style = { bg = C.bg },
  children = {
    label("title", 18, 14, 520, 28, "VIDEO POLY SAMPLER LAB", C.text, 22),
    label("subtitle", 18, 42, 1160, 18, "Polyphonic webcam → video retrospective capture → committed VideoSampler grid. Up to eight audio voices drive split video cells from SampleRegionPlaybackNode positions.", C.muted, 11),

    { id = "headerPanel", type = "Panel", x = px(16), y = px(72), w = px(1248), h = px(86), style = { bg = C.panel, border = C.border, borderWidth = 1, radius = 8 } },
    button("refreshDevices", 32, 88, 90, 26, "Devices", C.button, C.text),
    { id = "deviceSelect", type = "Dropdown", x = px(132), y = px(88), w = px(280), h = px(26), props = { options = { "Device 0" }, selected = 1, max_visible_rows = 8 }, style = { bg = C.panel2, colour = C.live, fontSize = 10 } },
    button("openWebcam", 424, 88, 100, 26, "Open 640", C.panel2, C.live),
    button("closeWebcam", 534, 88, 80, 26, "Close", C.panel2, C.bad),
    label("webcamStatus", 630, 92, 610, 18, "Webcam: not opened", C.muted, 10),

    slider("captureSeconds", 32, 124, 180, 22, "Capture sec", 0.25, 6.0, 0.25, 4.0, "/video_poly_sampler_lab/capture_seconds"),
    { id = "captureMode", type = "Toggle", x = px(222), y = px(122), w = px(60), h = px(22), props = { offLabel = "Retro", onLabel = "Free", value = false, paramPath = "/video_poly_sampler_lab/capture_mode" }, style = { bg = C.button, colour = C.good, fontSize = 10 } },
    button("captureNow", 296, 122, 88, 28, "Cap", C.good, 0xff04110a),
    button("play", 396, 122, 72, 28, "Trigger", C.sample, 0xff111111),
    button("stop", 478, 122, 64, 28, "Stop", C.button, C.text),
    button("clear", 552, 122, 64, 28, "Clear", C.button, C.bad),
    button("recordBtn", 626, 122, 80, 28, "Record", C.bad, 0xffffffff),
    label("recordStatus", 716, 128, 200, 18, "Recording: idle", C.muted, 10),
    label("clockStatus", 930, 128, 310, 18, "Clock: --", C.muted, 10),

    label("liveTitle", 18, 176, 300, 18, "Live Webcam Source", C.live, 13),
    viewport("liveViewport", 18, 200, 600, 338, C.live),
    label("liveOverlay", 32, 214, 560, 18, "live video_input", C.live, 10),

    label("sampleTitle", 662, 176, 480, 18, "Committed VideoSampler Playback — Auto Voice Split", C.sample, 13),
    samplerGridViewport(),

    { id = "controlPanel", type = "Panel", x = px(18), y = px(560), w = px(1244), h = px(206), style = { bg = C.panel, border = C.border, borderWidth = 1, radius = 8 } },
    label("transportLabel", 34, 576, 330, 18, "Audio-authority transport / polyphonic video lookup", C.muted, 12),
    slider("manualPosition", 34, 604, 340, 22, "Manual / fallback position", 0, 1, 0.001, 0, nil),
    slider("speed", 34, 634, 220, 22, "Audio speed", -2, 4, 0.01, 1, "/video_poly_sampler_lab/speed"),
    slider("output", 270, 634, 180, 22, "Audio output", 0, 2, 0.01, 0.75, "/video_poly_sampler_lab/output"),
    label("midiLabel", 34, 664, 110, 18, "MIDI poly input", C.muted, 12),
    { id = "midiInput", type = "Dropdown", x = px(34), y = px(686), w = px(282), h = px(26), props = { options = { "None (Disabled)" }, selected = 1, max_visible_rows = 8 }, style = { bg = C.panel2, colour = C.good, fontSize = 10 } },
    button("midiRefresh", 326, 686, 82, 26, "Refresh", C.button, C.text),
    slider("rootNote", 34, 724, 150, 22, "Root note", 0, 127, 1, 60, "/video_poly_sampler_lab/root_note"),
    { id = "pitchTracking", type = "Toggle", x = px(196), y = px(722), w = px(116), h = px(26), props = { label = "Pitch", value = true, paramPath = "/video_poly_sampler_lab/pitch_tracking" }, style = { bg = C.button, colour = C.good, fontSize = 10 } },
    { id = "polyphony", type = "Toggle", x = px(324), y = px(722), w = px(104), h = px(26), props = { label = "Poly", value = true, paramPath = "/video_poly_sampler_lab/polyphony" }, style = { bg = C.button, colour = C.voice, fontSize = 10 } },
    slider("voiceCount", 34, 752, 210, 22, "Voices", 1, 8, 1, 8, "/video_poly_sampler_lab/voice_count"),
    label("midiStatus", 260, 752, 430, 16, "MIDI: not opened", C.muted, 10),

    slider("playStart", 486, 604, 220, 22, "Play start", 0, 1, 0.001, 0, "/video_poly_sampler_lab/play_start"),
    slider("loopStart", 486, 634, 220, 22, "Loop start", 0, 1, 0.001, 0, "/video_poly_sampler_lab/loop_start"),
    slider("loopEnd", 486, 664, 220, 22, "Loop end", 0, 1, 0.001, 1, "/video_poly_sampler_lab/loop_end"),
    slider("crossfade", 486, 694, 220, 22, "Audio xfade", 0, 0.5, 0.001, 0.03, "/video_poly_sampler_lab/crossfade"),
    { id = "oneShot", type = "Toggle", x = px(486), y = px(724), w = px(116), h = px(26), props = { label = "One-shot", value = false, paramPath = "/video_poly_sampler_lab/one_shot" }, style = { bg = C.button, colour = C.warn, fontSize = 10 } },

    label("statusTitle", 760, 576, 180, 18, "Status", C.muted, 12),
    label("captureStatus", 760, 604, 470, 18, "Capture ring: --", C.text, 10),
    label("samplerStatus", 760, 628, 470, 18, "Sampler: --", C.text, 10),
    label("audioStatus", 760, 652, 470, 18, "Audio: --", C.text, 10),
    label("positionStatus", 760, 676, 470, 18, "Position: --", C.text, 10),
    label("help", 760, 704, 470, 46, "Workflow: open webcam, wait for frames, click Capture A/V, then play chords. Active voices auto-split the committed sampler viewport up to 8 cells.", C.warn, 10),

    label("footer", 18, 786, 1220, 18, "The video texture is one committed clip, rendered multiple times at each audio voice's loop-aware SampleRegionPlaybackNode position. Negative speed reverses audio and video follows.", C.muted, 10),
  }
}
