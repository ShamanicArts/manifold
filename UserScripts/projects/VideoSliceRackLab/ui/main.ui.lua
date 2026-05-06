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
  slice = 0xffa78bfa,
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

local function sliceViewport(index)
  return {
    id = "sliceViewport" .. tostring(index),
    type = "Panel",
    x = 0, y = 0, w = 0, h = 0,
    style = { bg = 0xff000000, border = C.slice, borderWidth = 1, radius = 5 },
  }
end

local function sliceOverlay(index)
  return label("sliceOverlay" .. tostring(index), 0, 0, 0, 0, "", C.slice, 10)
end

local function dynamicSamplerViewport()
  return {
    id = "sampleViewport",
    type = "Panel",
    x = px(662), y = px(198), w = px(600), h = px(276),
    style = { bg = 0xff000000, border = C.sample, borderWidth = 1, radius = 8 },
    children = {
      sliceViewport(1), sliceViewport(2), sliceViewport(3), sliceViewport(4),
      sliceViewport(5), sliceViewport(6), sliceViewport(7), sliceViewport(8),
      sliceOverlay(1), sliceOverlay(2), sliceOverlay(3), sliceOverlay(4),
      sliceOverlay(5), sliceOverlay(6), sliceOverlay(7), sliceOverlay(8),
    }
  }
end

return {
  id = "root",
  type = "Panel",
  behavior = "ui/behaviors/main.lua",
  x = 0, y = 0, w = px(1280), h = px(840),
  shellLayout = { mode = "fill", designW = 1280, designH = 840 },
  style = { bg = C.bg },
  children = {
    label("title", 18, 14, 560, 28, "VIDEO SLICE RACK LAB", C.text, 22),
    label("subtitle", 18, 42, 1160, 18, "One committed A/V capture. Eight root-major notes trigger eight slice one-shots. Active slices auto-split the video viewport; waveform edits slice markers.", C.muted, 11),

    { id = "headerPanel", type = "Panel", x = px(16), y = px(72), w = px(1248), h = px(86), style = { bg = C.panel, border = C.border, borderWidth = 1, radius = 8 } },
    button("refreshDevices", 32, 88, 90, 26, "Devices", C.button, C.text),
    { id = "deviceSelect", type = "Dropdown", x = px(132), y = px(88), w = px(280), h = px(26), props = { options = { "Device 0" }, selected = 1, max_visible_rows = 8 }, style = { bg = C.panel2, colour = C.live, fontSize = 10 } },
    button("openWebcam", 424, 88, 100, 26, "Open 640", C.panel2, C.live),
    button("closeWebcam", 534, 88, 80, 26, "Close", C.panel2, C.bad),
    label("webcamStatus", 630, 92, 610, 18, "Webcam: not opened", C.muted, 10),

    slider("captureSeconds", 32, 124, 180, 22, "Capture sec", 0.25, 6.0, 0.25, 4.0, "/video_slice_rack_lab/capture_seconds"),
    { id = "captureMode", type = "Toggle", x = px(222), y = px(122), w = px(60), h = px(22), props = { offLabel = "Retro", onLabel = "Free", value = false, paramPath = "/video_slice_rack_lab/capture_mode" }, style = { bg = C.button, colour = C.good, fontSize = 10 } },
    button("captureNow", 296, 122, 104, 28, "Capture A/V", C.good, 0xff04110a),
    button("stop", 412, 122, 64, 28, "Stop", C.button, C.text),
    button("clear", 486, 122, 64, 28, "Clear", C.button, C.bad),
    button("recordBtn", 560, 122, 80, 28, "Record", C.bad, 0xffffffff),
    label("recordStatus", 650, 128, 260, 18, "Recording: idle", C.muted, 10),
    label("clockStatus", 930, 128, 310, 18, "Clock: --", C.muted, 10),

    label("liveTitle", 18, 176, 300, 18, "Live Webcam Source", C.live, 13),
    viewport("liveViewport", 18, 198, 600, 276, C.live),
    label("liveOverlay", 32, 212, 560, 18, "live video_input", C.live, 10),

    label("sampleTitle", 662, 176, 560, 18, "Active Slice Playback — Dynamic Auto Split", C.sample, 13),
    dynamicSamplerViewport(),

    label("waveformLabel", 18, 494, 520, 18, "Committed Audio Waveform — slice marker editor", C.muted, 12),
    { id="waveform", type="WaveformView", x=px(18), y=px(516), w=px(1244), h=px(178),
      props={ mode="samplePath", samplePath="/video_slice_rack_lab/slice/1/sample", colour=0xff4a5568, bg=C.panel, playheadColour=0xffffd54f },
      style={ bg=C.panel, border=C.border, borderWidth=1, radius=6 } },
    label("waveformStatus", 32, 530, 980, 18, "Capture A/V, then play the eight root-major MIDI notes. Drag the waveform: nearest slice marker moves; active colored playheads show triggered slices.", C.muted, 10),

    { id = "controlPanel", type = "Panel", x = px(18), y = px(714), w = px(1244), h = px(96), style = { bg = C.panel, border = C.border, borderWidth = 1, radius = 8 } },
    label("midiLabel", 34, 730, 128, 18, "MIDI slice rack", C.muted, 12),
    { id = "midiInput", type = "Dropdown", x = px(34), y = px(752), w = px(282), h = px(26), props = { options = { "None (Disabled)" }, selected = 1, max_visible_rows = 8 }, style = { bg = C.panel2, colour = C.good, fontSize = 10 } },
    button("midiRefresh", 326, 752, 82, 26, "Refresh", C.button, C.text),
    slider("rootNote", 424, 752, 150, 22, "Root note", 0, 127, 1, 60, "/video_slice_rack_lab/root_note"),
    { id = "selectedSlice", type = "Dropdown", x = px(590), y = px(752), w = px(118), h = px(26), props = { options = { "Slice 1", "Slice 2", "Slice 3", "Slice 4", "Slice 5", "Slice 6", "Slice 7", "Slice 8" }, selected = 1, paramPath = "/video_slice_rack_lab/selected_slice", max_visible_rows = 8 }, style = { bg = C.panel2, colour = C.slice, fontSize = 10 } },
    button("auditionSelected", 718, 752, 120, 26, "Audition Slice", C.panel2, C.slice),
    slider("speed", 858, 738, 164, 22, "Speed", -2, 4, 0.01, 1, "/video_slice_rack_lab/speed"),
    slider("output", 858, 768, 164, 22, "Output", 0, 2, 0.01, 0.8, "/video_slice_rack_lab/output"),
    slider("crossfade", 1038, 738, 164, 22, "XFade", 0, 0.05, 0.001, 0.002, "/video_slice_rack_lab/crossfade"),
    label("midiStatus", 34, 790, 680, 16, "MIDI: not opened", C.muted, 10),
    label("status", 718, 790, 510, 16, "Status: --", C.warn, 10),

    label("footer", 18, 820, 1220, 16, "This keeps the dynamic renderer: only active slice one-shots appear, split 1/2/3/4/6/8 like the poly lab. No static pad-grid downgrade.", C.muted, 10),
  }
}
