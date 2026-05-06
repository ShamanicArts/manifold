local function dirname(path)
  return (tostring(path or ""):gsub("/+$", ""):match("^(.*)/[^/]+$") or ".")
end

local function join(...)
  local parts = { ... }
  local out = ""
  for i = 1, #parts do
    local part = tostring(parts[i] or "")
    if part ~= "" then
      out = out == "" and part or (out:gsub("/+$", "") .. "/" .. part:gsub("^/+", ""))
    end
  end
  return out
end

local function appendPackageRoot(root)
  if type(root) ~= "string" or root == "" then return end
  local entry = root .. "/?.lua;" .. root .. "/?/init.lua"
  local current = tostring(package.path or "")
  if not current:find(entry, 1, true) then package.path = current == "" and entry or (current .. ";" .. entry) end
end

local projectRoot = tostring(__manifoldProjectRoot or dirname(__manifoldProjectManifest or ""))
local mainRoot = join(projectRoot, "../Main")
appendPackageRoot(join(mainRoot, "ui"))
appendPackageRoot(join(mainRoot, "lib"))

local RackModuleShell = require("components.rack_module_shell")
local px = math.floor

local C = {
  bg = 0xff050816, panel = 0xff0f172a, panel2 = 0xff111827, border = 0xff334155,
  text = 0xffffffff, muted = 0xff94a3b8, live = 0xff22d3ee, seg = 0xff22c55e,
  pose = 0xffa78bfa, sample = 0xfff97316, warn = 0xfffacc15, bad = 0xffef4444,
  slider = 0xff38bdf8, track = 0xff020617, button = 0xff1e293b,
}

local function label(id, x, y, w, h, text, colour, size)
  return { id=id, type="Label", x=px(x), y=px(y), w=px(w), h=px(h), props={ text=text },
    style={ colour=colour or C.text, fontSize=size or 10, justification=Justify.centredLeft } }
end

local function button(id, x, y, w, h, text, bg, fg)
  return { id=id, type="Button", x=px(x), y=px(y), w=px(w), h=px(h), props={ label=text },
    style={ bg=bg or C.button, textColour=fg or C.text, fontSize=10, radius=5, border=C.border, borderWidth=1 } }
end

local function slider(id, x, y, w, h, text, min, max, step, value, path)
  return { id=id, type="Slider", x=px(x), y=px(y), w=px(w), h=px(h),
    props={ label=text, min=min, max=max, step=step, value=value, compact=true, showValue=true, paramPath=path },
    style={ colour=C.slider, bg=C.track, fontSize=9 } }
end

local function dropdown(id, x, y, w, h, opts, selected, colour)
  return { id=id, type="Dropdown", x=px(x), y=px(y), w=px(w), h=px(h),
    props={ options=opts or {"--"}, selected=selected or 1, max_visible_rows=12 },
    style={ bg=C.panel2, colour=colour or C.text, fontSize=9 } }
end

local function toggle(id, x, y, w, h, offLabel, onLabel, value, path, colour)
  return { id=id, type="Toggle", x=px(x), y=px(y), w=px(w), h=px(h),
    props={ offLabel=offLabel, onLabel=onLabel, value=value or false, paramPath=path },
    style={ bg=C.button, colour=colour or C.slider, fontSize=9 } }
end

local function panel(id, x, y, w, h, border, bg, visible)
  return { id=id, type="Panel", x=px(x), y=px(y), w=px(w), h=px(h), props={ visible = visible },
    style={ bg=bg or 0xff000000, border=border or C.border, borderWidth=1, radius=7 } }
end

local function rowCell(i)
  return { id="cell" .. i, type="Panel", x=0, y=0, w=0, h=0,
    style={ bg=0x00000000, border=0x00000000, borderWidth=0, radius=0 } }
end

local function rowLabel(i)
  return label("cellLabel" .. i, 0, 0, 0, 0, "", C.sample, 10)
end

local function outputViewport()
  local children = {}
  for i=1,8 do children[#children+1] = rowCell(i) end
  for i=1,8 do children[#children+1] = rowLabel(i) end
  return { id="outputViewport", type="Panel", x=px(654), y=px(202), w=px(608), h=px(342),
    style={ bg=0xff000000, border=C.sample, borderWidth=1, radius=8 }, children=children }
end

local function fxShell(id, nodeName, x, y, slot, accent)
  return RackModuleShell({
    id = id,
    layout = false,
    x = x, y = y,
    w = 472, h = 220,
    sizeKey = "1x2",
    accentColor = accent,
    nodeName = nodeName,
    componentRef = "../Main/ui/components/fx_slot.ui.lua",
    componentId = id .. "Component",
    componentBehavior = "../Main/ui/behaviors/fx_slot.lua",
    componentProps = {
      instanceNodeId = id,
      paramBase = "/midi/synth/rack/fx/" .. tostring(slot),
    },
  })
end

return {
  id="root", type="Panel", behavior="ui/behaviors/main.lua", x=0, y=0, w=px(1280), h=px(1200),
  shellLayout={ mode="fill", designW=1280, designH=1200 }, style={ bg=C.bg },
  children={
    label("title", 18, 12, 460, 26, "A/V SAMPLER LAB", C.text, 22),
    label("subtitle", 18, 40, 1180, 18, "Segmented webcam capture → shared A/V sampler → accurate poly/slice timeline → shader background → exact FX rack modules.", C.muted, 10),

    panel("header", 16, 68, 1248, 82, C.border, C.panel),
    button("refreshDevices", 30, 84, 82, 25, "Devices", C.button),
    dropdown("deviceSelect", 120, 84, 260, 25, {"Device 0"}, 1, C.live),
    button("openWebcam", 390, 84, 84, 25, "Open", C.panel2, C.live),
    button("closeWebcam", 482, 84, 70, 25, "Close", C.panel2, C.bad),
    toggle("mode", 566, 84, 90, 25, "Poly", "Slice", false, "/avlab/mode", C.sample),
    toggle("captureMode", 666, 84, 70, 25, "Retro", "Free", false, "/avlab/capture_mode", C.seg),
    slider("captureSeconds", 746, 84, 150, 22, "Retro win", 0.25, 6.0, 0.25, 4.0, "/avlab/capture_seconds"),
    button("captureNow", 908, 82, 96, 29, "Capture A/V", C.seg, 0xff04110a),
    button("play", 1012, 82, 54, 29, "Play", C.sample, 0xff111111),
    button("stop", 1074, 82, 54, 29, "Stop", C.button),
    button("clear", 1136, 82, 54, 29, "Clear", C.button, C.bad),
    label("webcamStatus", 30, 120, 600, 18, "Webcam: --", C.muted, 10),
    label("clockStatus", 670, 120, 270, 18, "Clock: --", C.muted, 10),
    label("rendererStatus", 958, 120, 290, 18, "Renderer: --", C.muted, 10),

    label("rawTitle", 18, 172, 190, 18, "Raw input", C.live, 12),
    panel("liveViewport", 18, 202, 196, 142, C.live),
    label("segTitle", 228, 172, 190, 18, "Segmented capture feed", C.seg, 12),
    panel("segViewport", 228, 202, 196, 142, C.seg),
    label("poseTitle", 438, 172, 190, 18, "Pose overlay", C.pose, 12),
    panel("poseViewport", 438, 202, 196, 142, C.pose),

    panel("mlPanel", 18, 360, 616, 184, C.border, C.panel),
    label("mlLabel", 32, 374, 230, 18, "ML / capture / pose", C.muted, 12),
    button("loadModels", 486, 372, 130, 25, "Reload Models", C.panel2, C.pose),
    slider("segGain", 32, 404, 180, 22, "Mask gain", 0.25, 4, 0.05, 1, nil),
    slider("segThreshold", 224, 404, 180, 22, "Threshold", 0, 1, 0.01, 0.5, nil),
    slider("segFeather", 416, 404, 180, 22, "Feather", 0, 1, 0.01, 0.15, nil),
    toggle("segInvert", 32, 436, 92, 24, "Normal", "Invert", false, nil, C.warn),
    slider("poseConf", 140, 436, 170, 22, "Pose conf", 0, 1, 0.01, 0.3, nil),
    toggle("showSkeleton", 324, 436, 112, 24, "Skel off", "Skel on", true, nil, C.pose),
    label("poseStatus", 32, 474, 566, 18, "Pose: --", C.pose, 10),
    label("captureStatus", 32, 498, 566, 18, "Capture ring: --", C.seg, 10),
    label("samplerStatus", 32, 522, 566, 18, "Sampler: --", C.sample, 10),

    label("outputTitle", 654, 172, 500, 18, "Output: shader/source background + bottom-pinned active sample row", C.sample, 12),
    outputViewport(),

    label("waveLabel", 18, 562, 700, 18, "Committed audio timeline — poly shows universal window; slice shows slice markers", C.muted, 12),
    { id="waveform", type="WaveformView", x=px(18), y=px(584), w=px(1244), h=px(122),
      props={ mode="samplePath", samplePath="/avlab/poly/voice/1/sample", colour=0xff4a5568, bg=C.panel, playheadColour=0xffffd54f },
      style={ bg=C.panel, border=C.border, borderWidth=1, radius=6 } },
    label("waveformStatus", 32, 596, 980, 18, "Poly: play/loop region + voice playheads. Slice: editable markers + slice playheads.", C.muted, 10),

    panel("transportPanel", 18, 722, 330, 152, C.border, C.panel),
    label("transportLabel", 32, 736, 170, 18, "Transport / MIDI", C.muted, 12),
    slider("speed", 32, 762, 144, 22, "Speed", -2, 4, 0.01, 1, "/avlab/speed"),
    slider("output", 190, 762, 144, 22, "Output", 0, 2, 0.01, 0.8, "/avlab/output"),
    slider("rootNote", 32, 792, 104, 22, "Root", 0, 127, 1, 60, "/avlab/root_note"),
    dropdown("midiInput", 32, 824, 214, 25, {"None (Disabled)"}, 1, C.seg),
    button("midiRefresh", 256, 824, 64, 25, "MIDI", C.button),
    label("midiStatus", 32, 854, 285, 16, "MIDI: --", C.muted, 10),

    panel("polyPanel", 364, 722, 342, 152, C.border, C.panel, true),
    label("polyLabel", 378, 736, 190, 18, "Poly voice window", C.muted, 12),
    toggle("pitchTracking", 578, 734, 98, 24, "Fixed", "Pitch", true, "/avlab/pitch_tracking", C.seg),
    slider("voiceCount", 378, 762, 130, 22, "Voices", 1, 8, 1, 8, "/avlab/voice_count"),
    slider("playStart", 522, 762, 154, 22, "Play start", 0, 1, 0.001, 0, "/avlab/play_start"),
    slider("loopStart", 378, 792, 130, 22, "Loop start", 0, 1, 0.001, 0, "/avlab/loop_start"),
    slider("loopEnd", 522, 792, 154, 22, "Loop end", 0, 1, 0.001, 1, "/avlab/loop_end"),
    slider("crossfade", 378, 822, 130, 22, "XFade", 0, 0.5, 0.001, 0.03, "/avlab/crossfade"),
    toggle("oneShot", 522, 822, 96, 22, "Loop", "1-shot", false, "/avlab/one_shot", C.warn),

    panel("slicePanel", 364, 722, 342, 152, C.border, C.panel, false),
    label("sliceLabel", 378, 736, 170, 18, "Slice mode", C.muted, 12),
    dropdown("selectedSlice", 378, 762, 110, 25, {"Slice 1","Slice 2","Slice 3","Slice 4","Slice 5","Slice 6","Slice 7","Slice 8"}, 1, C.pose),
    button("auditionSelected", 502, 762, 126, 25, "Audition", C.panel2, C.pose),
    label("sliceHelp", 378, 798, 280, 42, "Slice starts/ends are edited on the waveform. End = next marker or sample end. Root-major notes trigger slices.", C.warn, 10),

    panel("shaderPanel", 722, 722, 540, 152, C.border, C.panel),
    label("shaderLabel", 736, 736, 170, 18, "Shader/source stack", C.muted, 12),
    dropdown("sourceSelect", 736, 762, 124, 24, {"Webcam"}, 1, C.live),
    dropdown("shaderLayer", 870, 762, 54, 24, {"L1","L2","L3","L4","L5","L6","L7","L8"}, 1, C.sample),
    toggle("shaderEnabled", 934, 762, 54, 24, "Off", "On", true, nil, C.seg),
    dropdown("effectSelect", 998, 762, 242, 24, {"Passthrough"}, 1, C.sample),
    slider("shaderParam1", 736, 794, 96, 18, "P1", 0, 1, 0.01, 0.5, nil),
    slider("shaderParam2", 842, 794, 96, 18, "P2", 0, 1, 0.01, 0.5, nil),
    slider("shaderParam3", 948, 794, 96, 18, "P3", 0, 1, 0.01, 0.5, nil),
    slider("shaderParam4", 1054, 794, 96, 18, "P4", 0, 1, 0.01, 0.5, nil),
    slider("shaderParam5", 1158, 794, 82, 18, "P5", 0, 1, 0.01, 0.5, nil),
    slider("shaderParam6", 736, 822, 96, 18, "P6", 0, 1, 0.01, 0.5, nil),
    slider("shaderParam7", 842, 822, 96, 18, "P7", 0, 1, 0.01, 0.5, nil),
    slider("shaderParam8", 948, 822, 96, 18, "P8", 0, 1, 0.01, 0.5, nil),
    slider("shaderParam9", 1054, 822, 96, 18, "P9", 0, 1, 0.01, 0.5, nil),
    label("shaderStatus", 736, 852, 500, 16, "Shader: --", C.muted, 9),

    fxShell("fx1", "FX1", 18, 892, 1, 0xff22d3ee),
    fxShell("fx2", "FX2", 502, 892, 2, 0xff38bdf8),
    label("fxStatus", 990, 902, 260, 34, "FX rack modules are the exact Main/ui/components/fx_slot.ui.lua module, bound to /midi/synth/rack/fx/{1,2}.", C.muted, 10),

    panel("mappingPanel", 18, 1120, 1244, 76, C.border, C.panel),
    label("mappingLabel", 32, 1124, 88, 16, "Pose map", C.muted, 11),
    label("track1Label", 32, 1132, 20, 16, "T1", C.pose, 9),
    toggle("mapping1Enable", 58, 1130, 56, 22, "Off", "On", true, nil, C.pose),
    dropdown("mapping1Source", 122, 1130, 160, 22, {"left_wrist.y"}, 1, C.pose),
    dropdown("mapping1Target", 290, 1130, 150, 22, {"Shader L1 P1","FX1 Mix","Sampler Speed","Slice Select"}, 1, C.sample),
    slider("mapping1Min", 448, 1130, 90, 20, "Min", -2, 2, 0.01, 0, nil),
    slider("mapping1Max", 546, 1130, 90, 20, "Max", -2, 2, 0.01, 1, nil),
    toggle("mapping1Invert", 644, 1130, 72, 22, "Normal", "Invert", false, nil, C.warn),
    label("track2Label", 32, 1160, 20, 16, "T2", C.pose, 9),
    toggle("mapping2Enable", 58, 1158, 56, 22, "Off", "On", true, nil, C.pose),
    dropdown("mapping2Source", 122, 1158, 160, 22, {"right_wrist.y"}, 1, C.pose),
    dropdown("mapping2Target", 290, 1158, 150, 22, {"Shader L1 P1","FX1 Mix","Sampler Speed","Slice Select"}, 1, C.sample),
    slider("mapping2Min", 448, 1158, 90, 20, "Min", -2, 2, 0.01, 0, nil),
    slider("mapping2Max", 546, 1158, 90, 20, "Max", -2, 2, 0.01, 1, nil),
    toggle("mapping2Invert", 644, 1158, 72, 22, "Normal", "Invert", false, nil, C.warn),
    label("mappingStatus", 726, 1132, 300, 16, "Mapping: --", C.warn, 10),
  }
}
