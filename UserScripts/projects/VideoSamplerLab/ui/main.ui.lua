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

return {
  id = "root",
  type = "Panel",
  behavior = "ui/behaviors/main.lua",
  x = 0, y = 0, w = px(1280), h = px(820),
  shellLayout = { mode = "fill", designW = 1280, designH = 820 },
  style = { bg = C.bg },
  children = {
    label("title", 18, 14, 480, 28, "VIDEO SAMPLER LAB", C.text, 22),
    label("subtitle", 18, 42, 1120, 18, "Verify webcam → video retrospective capture → committed VideoSampler → VideoSurfaceProvider. Audio SampleRegionPlaybackNode is the timing authority.", C.muted, 11),

    { id = "headerPanel", type = "Panel", x = px(16), y = px(72), w = px(1248), h = px(86), style = { bg = C.panel, border = C.border, borderWidth = 1, radius = 8 } },
    button("refreshDevices", 32, 88, 90, 26, "Devices", C.button, C.text),
    { id = "deviceSelect", type = "Dropdown", x = px(132), y = px(88), w = px(280), h = px(26), props = { options = { "Device 0" }, selected = 1, max_visible_rows = 8 }, style = { bg = C.panel2, colour = C.live, fontSize = 10 } },
    button("openWebcam", 424, 88, 100, 26, "Open 640", C.panel2, C.live),
    button("closeWebcam", 534, 88, 80, 26, "Close", C.panel2, C.bad),
    label("webcamStatus", 630, 92, 610, 18, "Webcam: not opened", C.muted, 10),

    slider("captureSeconds", 32, 124, 180, 22, "Capture sec", 0.25, 30.0, 0.25, 4.0, "/video_sampler_lab/capture_seconds"),
    { id = "captureMode", type = "Toggle", x = px(222), y = px(122), w = px(60), h = px(22), props = { offLabel = "Retro", onLabel = "Free", value = false, paramPath = "/video_sampler_lab/capture_mode" }, style = { bg = C.button, colour = C.good, fontSize = 10 } },
    button("captureNow", 296, 122, 88, 28, "Cap", C.good, 0xff04110a),
    button("play", 396, 122, 72, 28, "Trigger", C.sample, 0xff111111),
    button("stop", 478, 122, 64, 28, "Stop", C.button, C.text),
    button("clear", 552, 122, 64, 28, "Clear", C.button, C.bad),
    label("clockStatus", 630, 128, 610, 18, "Clock: --", C.muted, 10),

    label("liveTitle", 18, 176, 300, 18, "Live Webcam Source", C.live, 13),
    viewport("liveViewport", 18, 200, 600, 338, C.live),
    label("liveOverlay", 32, 214, 560, 18, "live video_input", C.live, 10),

    label("sampleTitle", 662, 176, 340, 18, "Committed VideoSampler Playback", C.sample, 13),
    viewport("sampleViewport", 662, 200, 600, 338, C.sample),
    label("sampleOverlay", 676, 214, 560, 18, "waiting for committed frames", C.sample, 10),

    { id = "controlPanel", type = "Panel", x = px(18), y = px(560), w = px(1244), h = px(206), style = { bg = C.panel, border = C.border, borderWidth = 1, radius = 8 } },
    label("transportLabel", 34, 576, 220, 18, "Audio-authority transport / video lookup", C.muted, 12),
    slider("manualPosition", 34, 604, 340, 22, "Manual / fallback position", 0, 1, 0.001, 0, nil),
    slider("speed", 34, 634, 220, 22, "Audio speed", 0, 8, 0.01, 1, "/video_sampler_lab/speed"),
    slider("output", 270, 634, 180, 22, "Audio output", 0, 2, 0.01, 0.75, "/video_sampler_lab/output"),
    label("midiLabel", 34, 664, 110, 18, "MIDI mono input", C.muted, 12),
    { id = "midiInput", type = "Dropdown", x = px(34), y = px(686), w = px(282), h = px(26), props = { options = { "None (Disabled)" }, selected = 1, max_visible_rows = 8 }, style = { bg = C.panel2, colour = C.good, fontSize = 10 } },
    button("midiRefresh", 326, 686, 82, 26, "Refresh", C.button, C.text),
    slider("rootNote", 34, 724, 170, 22, "Root note", 0, 127, 1, 60, "/video_sampler_lab/root_note"),
    { id = "pitchTracking", type = "Toggle", x = px(220), y = px(722), w = px(134), h = px(26), props = { label = "Pitch track", value = true, paramPath = "/video_sampler_lab/pitch_tracking" }, style = { bg = C.button, colour = C.good, fontSize = 10 } },
    label("midiStatus", 34, 752, 420, 16, "MIDI: not opened", C.muted, 10),

    slider("playStart", 486, 604, 220, 22, "Play start", 0, 1, 0.001, 0, "/video_sampler_lab/play_start"),
    slider("loopStart", 486, 634, 220, 22, "Loop start", 0, 1, 0.001, 0, "/video_sampler_lab/loop_start"),
    slider("loopEnd", 486, 664, 220, 22, "Loop end", 0, 1, 0.001, 1, "/video_sampler_lab/loop_end"),
    slider("crossfade", 486, 694, 220, 22, "Audio xfade", 0, 0.5, 0.001, 0.03, "/video_sampler_lab/crossfade"),
    { id = "oneShot", type = "Toggle", x = px(486), y = px(724), w = px(116), h = px(26), props = { label = "One-shot", value = false, paramPath = "/video_sampler_lab/one_shot" }, style = { bg = C.button, colour = C.warn, fontSize = 10 } },

    label("statusTitle", 760, 576, 180, 18, "Status", C.muted, 12),
    label("captureStatus", 760, 604, 470, 18, "Capture ring: --", C.text, 10),
    label("samplerStatus", 760, 628, 470, 18, "Sampler: --", C.text, 10),
    label("audioStatus", 760, 652, 470, 18, "Audio: --", C.text, 10),
    label("positionStatus", 760, 676, 470, 18, "Position: --", C.text, 10),
    label("help", 760, 704, 470, 46, "Workflow: open webcam, wait for frames, click Capture A/V, then Trigger. The right viewport is not live: it is the committed VideoSampler frame selected by audio loop-aware position.", C.warn, 10),

    label("footer", 18, 786, 1220, 18, "If right viewport changes while left webcam keeps moving, Slice 1-3 are actually working. If Trigger is playing, right viewport follows SampleRegionPlaybackNode:getLoopAwarePosition().", C.muted, 10),
  }
}
