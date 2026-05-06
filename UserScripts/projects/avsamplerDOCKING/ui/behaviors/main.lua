-- avsamplerDOCKING behavior.
-- Replaces manual pane layout (modulePane, layoutPresetRects) with an ImGui
-- DockSpace + DockBuilder initial layout. Each panel is a regular ImGui window
-- that can be dragged, resized, tabbed, or closed by the user.

local M = {}
local NS = "/avsampler"

-- ── Colour palette (AVSampler tokens) ────────────────────────────────────────
local C = {
  bg      = 0xff050816,
  chrome  = 0xff0b0e16,
  module  = 0xff121a2f,
  well    = 0xff0a0a14,
  border  = 0xff1f2b4d,
  text    = 0xffffffff,
  muted   = 0xff94a3b8,
  dim     = 0xff55627f,
  live    = 0xff22d3ee,
  seg     = 0xff22c55e,
  pose    = 0xffa78bfa,
  sample  = 0xfff97316,
  warn    = 0xfffacc15,
  bad     = 0xffef4444,
  button  = 0xff151a25,
  track   = 0xff020617,
}

-- ── Constants ────────────────────────────────────────────────────────────────
local PANEL_IDS = {
  "Output", "Inputs", "Preview",
  "Deck", "Waveform", "FX",
  "Transport", "Shader", "Mapping", "PolySlice",
}
local MAX = 8
local KEYPOINTS = {
  "nose","left_eye","right_eye","left_ear","right_ear",
  "left_shoulder","right_shoulder","left_elbow","right_elbow",
  "left_wrist","right_wrist","left_hip","right_hip",
  "left_knee","right_knee","left_ankle","right_ankle",
}
local FX_NAMES = {
  "Chorus","Phaser","WaveShaper","Compressor","Filter","Reverb",
  "Stereo Delay","Pitch Shift","Granulator","Ring Mod","EQ","Limiter",
}

-- ── Helpers ──────────────────────────────────────────────────────────────────

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function hsl(h, s, l)
  -- Saturate at 0xaarrggbb
  s = clamp(s, 0, 1)
  l = clamp(l, 0, 1)
  local c = (1 - math.abs(2 * l - 1)) * s
  local x = c * (1 - math.abs((h / 60) % 2 - 1))
  local m = l - c / 2
  local r, g, b = 0, 0, 0
  if h < 60 then r, g, b = c, x, 0
  elseif h < 120 then r, g, b = x, c, 0
  elseif h < 180 then r, g, b = 0, c, x
  elseif h < 240 then r, g, b = 0, x, c
  elseif h < 300 then r, g, b = x, 0, c
  else r, g, b = c, 0, x end
  r = math.floor((r + m) * 255)
  g = math.floor((g + m) * 255)
  b = math.floor((b + m) * 255)
  return 0xff000000 | (r << 16) | (g << 8) | b
end

local function readParam(path, fallback)
  if type(getParam) == "function" then local ok, v = pcall(getParam, path); if ok and v ~= nil then return v end end
  return fallback
end
local function writeParam(path, value)
  local n = type(value) == "boolean" and (value and 1 or 0) or (tonumber(value) or 0)
  if type(setParam) == "function" then return setParam(path, n) end
  return false
end
local function bump(path) writeParam(path, (readParam(path, 0) + 1) % 1000000) end
local function nowSeconds() return (type(getTime) == "function" and tonumber(getTime())) or 0 end

-- ── Docking Layout Setup ────────────────────────────────────────────────────
-- Called once on first frame to build the initial split layout.

local function setupDockingLayout(ctx, dockspaceId, w, h)
  if not (imguiDockBuilderRemoveNode and imguiDockBuilderAddNode) then
    ctx._dockingSetupDone = true
    return
  end
  imguiDockBuilderRemoveNode(dockspaceId)
  imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
  imguiDockBuilderSetNodeSize(dockspaceId, w, h)

  -- Split: Left column / Right
  local s1 = imguiDockBuilderSplitNode(dockspaceId, imguiDir_Left, 0.30)
  local leftId = s1.atDir
  local rightId = s1.opposite

  -- Left: Output (top 65%) / Inputs (bottom 35%)
  local s2 = imguiDockBuilderSplitNode(leftId, imguiDir_Down, 0.35)
  local inputsId = s2.atDir
  local outputId = s2.opposite

  -- Right: Deck (top 60%) / Transport (bottom 40%)
  local s3 = imguiDockBuilderSplitNode(rightId, imguiDir_Down, 0.40)
  local transportId = s3.atDir
  local deckId = s3.opposite

  imguiDockBuilderDockWindow("Output", outputId)
  imguiDockBuilderDockWindow("Inputs", inputsId)
  imguiDockBuilderDockWindow("Deck", deckId)
  imguiDockBuilderDockWindow("Transport", transportId)

  imguiDockBuilderFinish(dockspaceId)
  ctx._dockingSetupDone = true
end

-- ── Window Content Renderers ─────────────────────────────────────────────────

local function renderOutputPane()
  if not imguiBegin("Output") then imguiEnd(); return end
  imguiText("Output Viewport — drag to rearrange")
  imguiSeparator()
  for i = 1, 4 do
    if i > 1 then imguiSameLine() end
    imguiButton("V" .. i, 48, 32)
  end
  imguiEnd()
end

local function renderInputsPane()
  if not imguiBegin("Inputs") then imguiEnd(); return end
  imguiText("Raw / Segmented / Pose")
  imguiSeparator()
  if imguiButton("Load ML") then end
  imguiSameLine()
  if imguiButton("Open Webcam") then end
  imguiEnd()
end

local function renderPreviewPane()
  if not imguiBegin("Preview") then imguiEnd(); return end

  imguiPushStyleColor(imguiCol_FrameBg, 0xff000000)
  local av = imguiGetContentRegionAvail()
  if imguiBeginChild("preview", av.x, av.y - 4, true) then
    imguiTextColored(0xffaa8844, "Preview Stage")
  end
  imguiEndChild()
  imguiPopStyleColor()
  imguiEnd()
end

local function renderDeckPane()
  if not imguiBegin("Deck") then imguiEnd(); return end
  imguiText("Deck / Layer Matrix")
  imguiEnd()
end

local function renderTransportPane()
  if not imguiBegin("Transport") then imguiEnd(); return end
  imguiText("Transport / MIDI controls")
  imguiEnd()
end

-- ── Main Frame ───────────────────────────────────────────────────────────────

local function renderFrame(ctx)
  -- DockSpace FIRST — its background window goes behind everything
  local dsId = imguiGetID("MainDS")
  imguiDockSpaceOverViewport(dsId, imguiDockNodeFlags_DockSpace)

  -- One-time DockBuilder layout
  if not ctx._dockingSetupDone then
    local ok, err = pcall(setupDockingLayout, ctx, dsId, 1280, 720)
    ctx._dockingSetupDone = true
    if not ok and type(print) == "function" then
      print("DockBuilder error: " .. tostring(err))
    end
  end

  -- DIAGNOSTIC: a floating window on top — should appear over the DockSpace
  imguiSetNextWindowPos(60, 60, imguiCond_Appearing)
  imguiSetNextWindowSize(500, 300, imguiCond_Appearing)
  if imguiBegin("AVSamplerPanel") then
    imguiTextColored(0xff22d3ee, "AVSampler Docking Skeleton")
    imguiSeparator()
    imguiText("Drag the title bar to dock/rearrange.")
    if imguiButton("CAPTURE") then end
    imguiSameLine()
    if imguiButton("PLAY") then end
    imguiSameLine()
    if imguiButton("STOP") then end
  end
  imguiEnd()

  -- Panel windows — these get docked into the DockBuilder layout
  renderOutputPane()
  renderInputsPane()
  renderDeckPane()
  renderTransportPane()
end

-- ── Lifecycle ────────────────────────────────────────────────────────────────

function M.init(ctx)
  ctx._dockingSetupDone = false
  ctx._layoutPreset = "deck"

  -- Register params that the UI controls (the DSP registers the rest)
  -- Just ensure the ones we touch in this UI exist
  if type(registerParam) == "function" then
    local reg = registerParam
    reg(NS .. "/mode", { type="f", min=0, max=1, default=0 })
    reg(NS .. "/speed", { type="f", min=-2, max=4, default=1 })
    reg(NS .. "/output", { type="f", min=0, max=2, default=0.8 })
    reg(NS .. "/root_note", { type="f", min=0, max=127, default=60 })
    reg(NS .. "/pitch_tracking", { type="f", min=0, max=1, default=1 })
    reg(NS .. "/voice_count", { type="f", min=1, max=8, default=8 })
    reg(NS .. "/capture_seconds", { type="f", min=0.25, max=6, default=4 })
    reg(NS .. "/capture_trigger", { type="f", min=0, max=1000000, default=0 })
    reg(NS .. "/play_trigger", { type="f", min=0, max=1000000, default=0 })
    reg(NS .. "/stop_trigger", { type="f", min=0, max=1000000, default=0 })
    reg(NS .. "/play_start", { type="f", min=0, max=1, default=0 })
    reg(NS .. "/loop_start", { type="f", min=0, max=1, default=0 })
    reg(NS .. "/loop_end", { type="f", min=0, max=1, default=1 })
    reg(NS .. "/crossfade", { type="f", min=0, max=0.5, default=0.03 })
    reg(NS .. "/one_shot", { type="f", min=0, max=1, default=0 })
    reg(NS .. "/seg/gain", { type="f", min=0.25, max=4, default=1 })
    reg(NS .. "/seg/threshold", { type="f", min=0, max=1, default=0.5 })
    reg(NS .. "/seg/feather", { type="f", min=0, max=1, default=0.15 })
    reg(NS .. "/seg/invert", { type="f", min=0, max=1, default=0 })
    reg(NS .. "/pose/confidence", { type="f", min=0, max=1, default=0.3 })
    reg(NS .. "/shader/active_layer", { type="f", min=1, max=8, default=1 })
    reg(NS .. "/selected_slice", { type="f", min=1, max=8, default=1 })
    for i = 1, 8 do
      reg(NS .. "/slice/" .. i .. "/start", { type="f", min=0, max=0.999, default=(i-1)/8 })
      reg(NS .. "/slice/" .. i .. "/trigger", { type="f", min=0, max=1000000, default=0 })
    end
    for i = 1, 8 do
      reg(NS .. "/shader/layer/" .. i .. "/enabled", { type="f", min=0, max=1, default=i==1 and 1 or 0 })
      reg(NS .. "/shader/layer/" .. i .. "/effect", { type="f", min=1, max=128, default=1 })
      for p = 1, 9 do reg(NS .. "/shader/layer/" .. i .. "/param/" .. p, { type="f", min=0, max=1, default=0.5 }) end
    end
    for i = 1, 8 do
      reg(NS .. "/mapping/" .. i .. "/enabled", { type="f", min=0, max=1, default=i<=2 and 1 or 0 })
      reg(NS .. "/mapping/" .. i .. "/source", { type="f", min=1, max=64, default=i==1 and 29 or (i==2 and 32 or 1) })
      reg(NS .. "/mapping/" .. i .. "/target", { type="f", min=1, max=128, default=1 })
      reg(NS .. "/mapping/" .. i .. "/min", { type="f", min=0, max=1, default=0 })
      reg(NS .. "/mapping/" .. i .. "/max", { type="f", min=0, max=1, default=1 })
      reg(NS .. "/mapping/" .. i .. "/invert", { type="f", min=0, max=1, default=0 })
    end
  end

  -- Register OSC endpoints for pose data
  if osc and osc.registerEndpoint then
    for _, name in ipairs(KEYPOINTS) do
      pcall(osc.registerEndpoint, NS .. "/pose/" .. name .. "/x", { type="f", range={0,1}, access=3 })
      pcall(osc.registerEndpoint, NS .. "/pose/" .. name .. "/y", { type="f", range={0,1}, access=3 })
      pcall(osc.registerEndpoint, NS .. "/pose/" .. name .. "/confidence", { type="f", range={0,1}, access=3 })
    end
  end

  -- Register the onImGuiFrame callback that drives the entire UI
  if ctx.root and ctx.root.node and ctx.root.node.setOnImGuiFrame then
    ctx.root.node:setOnImGuiFrame(function(node)
      renderFrame(ctx)
    end)
  end
end

function M.resized(ctx)
  -- Docking handles this automatically — no manual layout needed
end

function M.update(ctx)
  -- Pass through — the dock layout is driven by onImGuiFrame
end

function M.cleanup(ctx)
  if capture and capture.close then pcall(capture.close) end
end

return M
