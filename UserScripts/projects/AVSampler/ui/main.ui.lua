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
local MAX_MAPPINGS = 8

local C = {
  bg = 0xff050816,
  chrome = 0xff0b0e16,
  module = 0xff121a2f,
  moduleDark = 0xff0d1420,
  well = 0xff0a0a14,
  border = 0xff1f2b4d,
  border2 = 0xff334155,
  text = 0xffffffff,
  muted = 0xff94a3b8,
  dim = 0xff55627f,
  live = 0xff22d3ee,
  seg = 0xff22c55e,
  pose = 0xffa78bfa,
  sample = 0xfff97316,
  warn = 0xfffacc15,
  bad = 0xffef4444,
  button = 0xff151a25,
  track = 0xff020617,
}

local function label(id, x, y, w, h, text, colour, size)
  return { id=id, type="Label", x=px(x), y=px(y), w=px(w), h=px(h), props={ text=text },
    style={ colour=colour or C.text, fontSize=size or 9, justification=Justify.centredLeft } }
end

local function button(id, x, y, w, h, text, bg, fg)
  return { id=id, type="Button", x=px(x), y=px(y), w=px(w), h=px(h), props={ label=text, text=text },
    style={ bg=bg or C.button, hoverBg=0xff1c2433, textColour=fg or C.muted, fontSize=8, radius=1, border=C.border2, borderWidth=1 } }
end

local function slider(id, x, y, w, h, text, min, max, step, value, path, colour)
  return { id=id, type="Slider", x=px(x), y=px(y), w=px(w), h=px(h),
    props={ label=text, min=min, max=max, step=step, value=value, compact=true, showValue=true, paramPath=path },
    style={ colour=colour or C.live, bg=C.track, fontSize=8 } }
end

local function dropdown(id, x, y, w, h, opts, selected, colour)
  return { id=id, type="Dropdown", x=px(x), y=px(y), w=px(w), h=px(h),
    props={ options=opts or {"--"}, selected=selected or 1, max_visible_rows=12 },
    style={ bg=0xff1e293b, colour=colour or C.live, fontSize=8 } }
end

local function toggle(id, x, y, w, h, offLabel, onLabel, value, path, colour)
  return { id=id, type="Toggle", x=px(x), y=px(y), w=px(w), h=px(h),
    props={ offLabel=offLabel, onLabel=onLabel, value=value or false, paramPath=path },
    style={ bg=C.button, colour=colour or C.live, fontSize=8 } }
end

local function panel(id, x, y, w, h, border, bg, visible)
  return { id=id, type="Panel", x=px(x), y=px(y), w=px(w), h=px(h), props={ visible = visible },
    style={ bg=bg or C.moduleDark, border=border or C.border, borderWidth=1, radius=4 } }
end

local function modulePane(id, title, accent, x, y, w, h, children)
  local headerH = 18
  local out = {
    id=id, type="Panel", x=px(x), y=px(y), w=px(w), h=px(h),
    style={ bg=C.module, border=C.border, borderWidth=1, radius=8 },
    props={ interceptsMouse=false },
    children={
      { id=id .. "Delete", type="Button", x=0, y=0, w=22, h=headerH,
        layout={ mode="hybrid", left=0, top=0, width=22, height=headerH }, props={ text="" },
        style={ bg=0xff991b1b, hoverBg=0xffb91c1c, radius=0 } },
      { id=id .. "Drag", type="Panel", x=22, y=0, w=px(w)-44, h=headerH,
        layout={ mode="hybrid", left=22, top=0, right=22, height=headerH },
        style={ bg=accent or C.border2, radius=0 }, props={ interceptsMouse=true }, children={
          { id=id .. "Title", type="Label", x=7, y=1, w=px(w)-58, h=16,
            layout={ mode="hybrid", left=7, top=1, right=7, height=16 }, props={ text=title },
            style={ colour=C.text, fontSize=8, justification=Justify.centredLeft } },
        } },
      { id=id .. "Resize", type="Button", x=px(w)-22, y=0, w=22, h=headerH,
        layout={ mode="hybrid", right=0, top=0, width=22, height=headerH }, props={ text="" },
        style={ bg=0x20ffffff, hoverBg=0x40ffffff, radius=0 } },
    },
  }
  for _, child in ipairs(children or {}) do out.children[#out.children + 1] = child end
  return out
end

local function stage(id, x, y, w, h, text, border)
  return { id=id, type="Panel", x=px(x), y=px(y), w=px(w), h=px(h),
    layout={ mode="hybrid", left=px(x), top=px(y), right=0, bottom=0 },
    style={ bg=0xff000000, border=border or C.border2, borderWidth=1, radius=4 },
    children={ label(id .. "Tag", 5, 4, math.max(1, w - 10), 12, text, 0x55ffffff, 8) } }
end

local function rowCell(i)
  return { id="cell" .. i, type="Panel", x=0, y=0, w=0, h=0, style={ bg=0x00000000, border=0x00000000, borderWidth=0, radius=0 } }
end

local function rowLabel(i)
  return label("cellLabel" .. i, 0, 0, 0, 0, "", C.sample, 8)
end

local function outputViewport()
  local children = {}
  for i=1,8 do children[#children+1] = rowCell(i) end
  for i=1,8 do children[#children+1] = rowLabel(i) end
  return { id="outputViewport", type="Panel", x=6, y=24, w=430, h=302,
    layout={ mode="hybrid", left=6, top=24, right=6, bottom=6 },
    style={ bg=0xff000000, border=C.sample, borderWidth=1, radius=4 }, children=children }
end

local function clipCell(id, x, y, w, h, text, selected)
  return { id=id, type="Panel", x=px(x), y=px(y), w=px(w), h=px(h),
    style={ bg=selected and 0xff0d2430 or C.well, border=selected and C.live or 0xff1a1a22, borderWidth=1, radius=3 },
    children={
      { id=id .. "Thumb", type="Panel", x=2, y=2, w=math.max(1, px(w)-4), h=math.max(1, px(h)-17),
        style={ bg=0xff10182a, border=0x22ffffff, borderWidth=1, radius=2 } },
      label(id .. "Label", 4, h-14, math.max(1, w-8), 12, text, selected and C.live or 0x88ffffff, 7),
    } }
end

local function deckChildren()
  local children = {}
  local names = {
    { "Cap1", "Cap2", "Cap3", "Cap4", "Raw", "Seg", "Pose", "Out" },
    { "Move1", "Move2", "Raw", "Seg", "Pose", "FX", "Delay", "Out" },
    { "Cap1", "Smoke", "Mask", "Pose", "Raw", "Seg", "Queue", "Out" },
  }
  for row=1,3 do
    local y = 25 + (row - 1) * 46
    local layer = 4 - row
    children[#children+1] = label("deckLayer" .. row, 8, y + 2, 22, 12, "L" .. tostring(layer), C.muted, 8)
    children[#children+1] = button("deckLayer" .. row .. "A", 34, y, 20, 13, "A", row == 2 and C.seg or C.button, row == 2 and 0xff041312 or C.dim)
    children[#children+1] = button("deckLayer" .. row .. "B", 56, y, 20, 13, "B", row ~= 2 and C.seg or C.button, row ~= 2 and 0xff041312 or C.dim)
    children[#children+1] = { id="deckBlend" .. row, type="Panel", x=34, y=y+18, w=42, h=11,
      style={ bg=0xff0f172a, border=0xff26304a, borderWidth=1, radius=2 }, children={
        { id="deckBlendFill" .. row, type="Panel", x=0, y=0, w=math.floor(16 + row * 7), h=11, style={ bg=row == 2 and 0xff16a34a or 0xff1d4ed8, radius=2 } },
      } }
    for i=1,8 do
      children[#children+1] = clipCell("deckCell" .. row .. "_" .. i, 86 + (i - 1) * 70, y, 66, 38, names[row][i], i == row or i == (9 - row))
    end
  end
  return children
end

local function paramGrid(prefix, specs, x, y, colW, h, cols)
  local children = {}
  cols = cols or 2
  for i, spec in ipairs(specs) do
    local cx = x + ((i - 1) % cols) * colW
    local cy = y + math.floor((i - 1) / cols) * (h + 4)
    children[#children+1] = slider(prefix .. i, cx, cy, colW - 6, h, spec[1], spec[2] or 0, spec[3] or 1, spec[4] or 0.01, spec[5] or 0.5, spec[6], spec[7])
  end
  return children
end

local function shaderChildren()
  local children = {
    dropdown("sourceSelect", 8, 25, 82, 18, {"Webcam"}, 1, C.live),
    dropdown("shaderLayer", 96, 25, 44, 18, {"L1","L2","L3","L4","L5","L6","L7","L8"}, 1, C.sample),
    toggle("shaderEnabled", 146, 25, 44, 18, "Off", "On", true, nil, C.seg),
    dropdown("effectSelect", 196, 25, 120, 18, {"Passthrough"}, 1, C.sample),
    label("shaderStatus", 8, 178, 310, 14, "Shader: --", C.muted, 8),
  }
  local grid = paramGrid("shaderParam", {
    {"P1",0,1,0.01,0.5,nil,C.live},{"P2",0,1,0.01,0.5,nil,C.seg},{"P3",0,1,0.01,0.5,nil,C.sample},
    {"P4",0,1,0.01,0.5,nil,C.bad},{"P5",0,1,0.01,0.5,nil,C.pose},{"P6",0,1,0.01,0.5,nil,C.live},
    {"P7",0,1,0.01,0.5,nil,C.warn},{"P8",0,1,0.01,0.5,nil,0xffec4899},{"P9",0,1,0.01,0.5,nil,0xff14b8a6},
  }, 8, 51, 104, 18, 3)
  for _, child in ipairs(grid) do children[#children+1] = child end
  return children
end

local function mappingChildren()
  local children = {
    label("mappingHelp", 8, 23, 430, 14, "Pose source → exposed parameter. Normal mode flips screen-space Y so upward motion increases.", C.muted, 8),
  }
  for i = 1, MAX_MAPPINGS do
    local y = 41 + (i - 1) * 22
    children[#children+1] = label("track" .. i .. "Label", 8, y + 2, 18, 14, "T" .. i, C.pose, 8)
    children[#children+1] = toggle("mapping" .. i .. "Enable", 28, y, 42, 17, "Off", "On", i <= 2, nil, C.pose)
    children[#children+1] = dropdown("mapping" .. i .. "Source", 74, y, 120, 17, { "left_wrist.y" }, 1, C.pose)
    children[#children+1] = dropdown("mapping" .. i .. "Target", 198, y, 120, 17, { "FX1 Mix" }, 1, C.sample)
    children[#children+1] = slider("mapping" .. i .. "Min", 322, y, 50, 16, "Lo", 0, 1, 0.01, 0, nil, C.pose)
    children[#children+1] = slider("mapping" .. i .. "Max", 376, y, 50, 16, "Hi", 0, 1, 0.01, 1, nil, C.pose)
    children[#children+1] = toggle("mapping" .. i .. "Invert", 430, y, 48, 17, "Norm", "Inv", false, nil, C.warn)
  end
  children[#children+1] = label("mappingStatus", 8, 222, 450, 14, "Mapping: --", C.warn, 8)
  return children
end

local function inputsChildren()
  return {
    panel("liveViewport", 6, 24, 130, 82, C.live, 0xff000000),
    panel("segViewport", 142, 24, 130, 82, C.seg, 0xff000000),
    panel("poseViewport", 278, 24, 130, 82, C.pose, 0xff000000),
    label("rawTitle", 10, 108, 90, 12, "Raw", C.live, 8),
    label("segTitle", 146, 108, 90, 12, "Segmented", C.seg, 8),
    label("poseTitle", 282, 108, 90, 12, "Pose", C.pose, 8),
    slider("segGain", 6, 125, 86, 17, "Gain", 0.25, 4, 0.05, 1, nil, C.seg),
    slider("segThreshold", 98, 125, 86, 17, "Thresh", 0, 1, 0.01, 0.5, nil, C.seg),
    slider("segFeather", 190, 125, 86, 17, "Feather", 0, 1, 0.01, 0.15, nil, C.seg),
    toggle("segInvert", 282, 124, 60, 18, "Norm", "Inv", false, nil, C.warn),
    slider("poseConf", 348, 125, 70, 17, "Pose", 0, 1, 0.01, 0.3, nil, C.pose),
    toggle("showSkeleton", 424, 124, 70, 18, "Skel off", "Skel on", true, nil, C.pose),
    button("loadModels", 500, 123, 34, 19, "ML", C.button, C.pose),
    label("poseStatus", 6, 150, 520, 13, "Pose: --", C.pose, 8),
    label("captureStatus", 6, 166, 520, 13, "Capture ring: --", C.seg, 8),
    label("samplerStatus", 6, 182, 520, 13, "Sampler: --", C.sample, 8),
  }
end

local function transportChildren()
  return {
    slider("speed", 8, 25, 82, 17, "Speed", -2, 4, 0.01, 1, "/avsampler/speed", C.sample),
    slider("output", 94, 25, 82, 17, "Output", 0, 2, 0.01, 0.8, "/avsampler/output", C.sample),
    slider("rootNote", 180, 25, 60, 17, "Root", 0, 127, 1, 60, "/avsampler/root_note", C.sample),
    dropdown("midiInput", 8, 50, 150, 18, {"None (Disabled)"}, 1, C.seg),
    button("midiRefresh", 164, 50, 44, 18, "MIDI"),
    label("midiStatus", 8, 73, 230, 13, "MIDI: --", C.muted, 8),
  }
end

local function polyChildren()
  return {
    toggle("pitchTracking", 8, 25, 58, 18, "Fixed", "Pitch", true, "/avsampler/pitch_tracking", C.seg),
    slider("voiceCount", 72, 25, 66, 17, "Voices", 1, 8, 1, 8, "/avsampler/voice_count", C.seg),
    slider("playStart", 144, 25, 72, 17, "Play", 0, 1, 0.001, 0, "/avsampler/play_start", C.seg),
    slider("loopStart", 8, 50, 82, 17, "L Start", 0, 1, 0.001, 0, "/avsampler/loop_start", C.seg),
    slider("loopEnd", 96, 50, 82, 17, "L End", 0, 1, 0.001, 1, "/avsampler/loop_end", C.seg),
    slider("crossfade", 184, 50, 66, 17, "XFade", 0, 0.5, 0.001, 0.03, "/avsampler/crossfade", C.warn),
    toggle("oneShot", 8, 74, 58, 18, "Loop", "1-shot", false, "/avsampler/one_shot", C.warn),
  }
end

local function sliceChildren()
  return {
    dropdown("selectedSlice", 8, 25, 86, 18, {"Slice 1","Slice 2","Slice 3","Slice 4","Slice 5","Slice 6","Slice 7","Slice 8"}, 1, C.pose),
    button("auditionSelected", 100, 25, 66, 18, "Audition", C.button, C.pose),
    label("sliceHelp", 8, 50, 225, 42, "Slice starts/ends are edited on the waveform. End = next marker or sample end. Root-major notes trigger slices.", C.warn, 8),
  }
end

local function fxShell()
  return RackModuleShell({
    id = "fx1",
    layout = false,
    x = 802, y = 488,
    w = 472, h = 220,
    sizeKey = "1x2",
    accentColor = C.live,
    nodeName = "FX1",
    componentRef = "../Main/ui/components/fx_slot.ui.lua",
    componentId = "fx1Component",
    componentBehavior = "../Main/ui/behaviors/fx_slot.lua",
    componentProps = { instanceNodeId = "fx1", paramBase = "/midi/synth/rack/fx/1" },
  })
end

return {
  id="root", type="Panel", behavior="ui/behaviors/main.lua", x=0, y=0, w=px(1280), h=px(1200),
  shellLayout={ mode="fill", designW=1280, designH=1200 }, style={ bg=C.bg },
  children={
    { id="toolbarPane", type="Panel", x=0, y=0, w=1280, h=22, layout={ mode="hybrid", left=0, top=0, right=0, height=22 }, style={ bg=C.chrome, border=C.border, borderWidth=1, radius=0 }, children={
      button("layoutDeck", 6, 3, 42, 15, "DECK", C.live, 0xff031217),
      button("layoutStage", 52, 3, 44, 15, "STAGE"),
      button("layoutInspector", 100, 3, 58, 15, "INSPECT"),
      toggle("resizeMode", 164, 3, 58, 15, "FIX", "RESIZE", false, nil, C.warn),
      button("resetLayout", 226, 3, 42, 15, "RESET"),
      button("refreshDevices", 276, 3, 48, 15, "DEV"),
      dropdown("deviceSelect", 328, 3, 132, 15, {"Device 0"}, 1, C.live),
      button("openWebcam", 464, 3, 40, 15, "OPEN", C.button, C.live),
      button("closeWebcam", 508, 3, 42, 15, "CLOSE", C.button, C.bad),
      toggle("mode", 560, 3, 54, 15, "POLY", "SLICE", false, "/avsampler/mode", C.sample),
      toggle("captureMode", 618, 3, 58, 15, "RETRO", "FREE", false, "/avsampler/capture_mode", C.seg),
      slider("captureSeconds", 682, 3, 90, 15, "Win", 0.25, 6.0, 0.25, 4.0, "/avsampler/capture_seconds", C.live),
      button("captureNow", 778, 2, 70, 17, "CAPTURE", C.seg, 0xff04110a),
      button("play", 854, 2, 38, 17, "LOOP", C.sample, 0xff111111),
      button("stop", 896, 2, 34, 17, "STOP"),
      button("clear", 934, 2, 40, 17, "CLEAR", C.button, C.bad),
      label("webcamStatus", 984, 3, 126, 15, "Webcam: --", C.dim, 8),
      label("clockStatus", 1114, 3, 82, 15, "Clock: --", C.dim, 8),
      label("rendererStatus", 1200, 3, 76, 15, "Renderer: --", C.dim, 8),
      label("resizeHelp", 982, 3, 290, 15, "Resize: drag headers / corner tabs. 1/2/3 switch views.", C.warn, 8),
    } },

    modulePane("deckPane", "Deck / Layers", 0xff008c8c, 1, 24, 1278, 162, deckChildren()),
    modulePane("outputPane", "Output", C.sample, 1, 188, 442, 332, { outputViewport() }),
    modulePane("previewPane", "Preview", 0xffaa8844, 445, 188, 208, 198, { stage("previewStage", 6, 24, 196, 168, "Preview", 0xffaa8844) }),
    modulePane("inputsPane", "Raw / Segmented / Pose", C.pose, 1, 522, 652, 204, inputsChildren()),
    modulePane("waveformPane", "Waveform / Transport", 0xffaa88aa, 1, 728, 652, 122, {
      { id="waveform", type="WaveformView", x=6, y=26, w=640, h=70, layout={ mode="hybrid", left=6, top=26, right=6, bottom=22 },
        props={ mode="samplePath", samplePath="/avsampler/poly/voice/1/sample", colour=0xff4a5568, bg=C.moduleDark, playheadColour=0xffffd54f },
        style={ bg=C.moduleDark, border=C.border2, borderWidth=1, radius=4 } },
      label("waveformStatus", 8, 100, 630, 14, "Poly: play/loop region + voice playheads. Slice: markers + slice playheads.", C.muted, 8),
    }),

    modulePane("allParamsPane", "All Parameters", C.sample, 1, 852, 652, 340, {}),

    modulePane("shaderPanel", "Shader", 0xff22c55e, 656, 188, 320, 202, shaderChildren()),
    modulePane("mappingPanel", "Pose / Seg / Mapping", C.pose, 656, 392, 486, 252, mappingChildren()),
    modulePane("transportPane", "Transport / MIDI", C.sample, 978, 188, 296, 98, transportChildren()),
    modulePane("polyPanel", "Poly Voice Areas", C.seg, 978, 288, 296, 104, polyChildren()),
    modulePane("slicePanel", "Slice Mode", C.pose, 978, 288, 296, 104, sliceChildren()),

    fxShell(),
    label("fxStatus", 808, 712, 450, 18, "FX1 type=-- mix=--", C.muted, 8),
  }
}
