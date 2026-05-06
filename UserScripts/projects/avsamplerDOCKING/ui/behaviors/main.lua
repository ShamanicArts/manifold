-- AVSamplerDocking behavior.
-- Coarse ImGui docking skeleton scoped to Manifold's project content area.
-- Dock windows are major work areas only; sub-panels are lightweight sections
-- inside those windows and can later host retained-mode components.
--
-- Layouts use DockBuilder once, then let ImGui persist the state.
-- No force-attack hack, no per-frame dock fighting.

local M = {}

local DOCK_WINDOWS = {
  { key = "toolbar",  title = "Toolbar",              accent = 0xff22d3ee },
  { key = "deck",     title = "Deck",                 accent = 0xff22d3ee },
  { key = "stage",    title = "Output / Stage",       accent = 0xfff97316 },
  { key = "sources",  title = "Capture / Sources",   accent = 0xffa78bfa },
  { key = "waveform", title = "Waveform",             accent = 0xffaa88aa },
  { key = "controls", title = "Controls / Inspector", accent = 0xff22c55e },
  { key = "fx",       title = "FX",                   accent = 0xff22d3ee },
}

local function bor(...)
  local args = { ... }
  local out = 0
  for i = 1, #args do out = out | args[i] end
  return out
end

local function toNum(v)
  local t = type(v)
  if t == "number" then return v end
  if t == "string" then return tonumber(v) end
  return nil
end

local function nowSeconds() return (type(getTime) == "function" and tonumber(getTime())) or 0 end

local function viewportSize()
  if type(imguiGetMainViewport) == "function" then
    local vp = imguiGetMainViewport()
    if type(vp) == "table" then
      local w = toNum(vp.w or vp.width or vp.sizeX or vp.size_x) or 0
      local h = toNum(vp.h or vp.height or vp.sizeY or vp.size_y) or 0
      if w > 0 and h > 0 then return w, h end
    end
  end
  return 1280, 720
end

local BOUNDS_CACHE_DURATION = 0.1

local function projectContentBounds(ctx)
  if ctx._boundsCache and (nowSeconds() - ctx._boundsCacheTime) < BOUNDS_CACHE_DURATION then
    return ctx._boundsCache.x, ctx._boundsCache.y, ctx._boundsCache.w, ctx._boundsCache.h
  end
  local totalW, totalH = viewportSize()
  local x, y, w, h = 0, 0, totalW, totalH
  if type(shell) == "table" and type(shell.getContentBounds) == "function" then
    local ok, sx, sy, sw, sh = pcall(function() return shell:getContentBounds(totalW, totalH) end)
    if ok and toNum(sw) and toNum(sh) and sw > 0 and sh > 0 then
      x, y, w, h = toNum(sx) or 0, toNum(sy) or 0, toNum(sw), toNum(sh)
    end
  end
  ctx._boundsCache = { x = x, y = y, w = w, h = h }
  ctx._boundsCacheTime = nowSeconds()
  return x, y, w, h
end

local function windowName(ctx, win)
  return win.title .. "###AVSD_" .. tostring(ctx._dockSuffix or "0") .. "_" .. win.key
end

-- ── DockBuilder helpers ────────────────────────────────────────────────
-- imguiDockBuilderSplitNode returns a table: { atDir=id, opposite=id }
-- atDir = child in the split direction (ratio applies here)
-- opposite = child on the opposite side

local function split(t)
  local r = imguiDockBuilderSplitNode(t.node, t.dir, t.ratio)
  if imguiDockBuilderSetNodeFlags then
    imguiDockBuilderSetNodeFlags(r.atDir, imguiDockNodeFlags_HiddenTabBar)
    imguiDockBuilderSetNodeFlags(r.opposite, imguiDockNodeFlags_HiddenTabBar)
  end
  return r.atDir, r.opposite
end

-- DECK layout: deck center-top, stage left-top, waveform center-bottom,
-- sources left-bottom, controls right-top, fx right-bottom
local function buildDeckLayout(ctx, dockId)
  -- Toolbar top 3%, main area bottom 97%
  local toolNode, mainArea = split{ node=dockId, dir=imguiDir_Up, ratio=0.03 }
  -- Right 20% = fx/controls, left 80% = deck/wave/stage/sources
  local rightCol, leftCol = split{ node=mainArea, dir=imguiDir_Right, ratio=0.20 }
  -- Split left 80% into: left 31.25% (stage/sources), center 68.75% (deck/wave)
  local leftInner, center = split{ node=leftCol, dir=imguiDir_Left, ratio=0.3125 }
  -- Center: deck top 75%, waveform bottom 25%
  local wave, deck = split{ node=center, dir=imguiDir_Down, ratio=0.25 }
  -- LeftInner: stage top 35%, sources bottom 65%
  local sources, stage = split{ node=leftInner, dir=imguiDir_Down, ratio=0.65 }
  -- RightCol: controls top 30%, fx bottom 70%
  local fx, ctrl = split{ node=rightCol, dir=imguiDir_Down, ratio=0.70 }

  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[1]), toolNode)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[2]), deck)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[3]), stage)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[4]), sources)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[5]), wave)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[6]), ctrl)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[7]), fx)
end

-- STAGE layout: stage left-large top, controls right-top,
-- deck+wave left-bottom, fx+sources right-bottom
local function buildStageLayout(ctx, dockId)
  local toolNode, mainArea = split{ node=dockId, dir=imguiDir_Up, ratio=0.03 }
  -- Right 40% (ctrl + fx + sources), left 60% (stage + deck + wave)
  local rightCol, leftCol = split{ node=mainArea, dir=imguiDir_Right, ratio=0.40 }
  -- Right: controls top 50%, bottom 50% = fx + sources
  local rightBot, ctrl = split{ node=rightCol, dir=imguiDir_Down, ratio=0.50 }
  -- rightBot: fx top 40%, sources bottom 60%
  local sources, fx = split{ node=rightBot, dir=imguiDir_Down, ratio=0.60 }
  -- Left: stage top 30%, bottom 70% = deck + wave
  local leftBot, stage = split{ node=leftCol, dir=imguiDir_Down, ratio=0.30 }
  -- leftBot: deck top 50%, wave bottom 50%
  local wave, deck = split{ node=leftBot, dir=imguiDir_Down, ratio=0.50 }

  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[1]), toolNode)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[2]), deck)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[3]), stage)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[4]), sources)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[5]), wave)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[6]), ctrl)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[7]), fx)
end

-- INSPECTOR layout: controls right-large top, stage left-top,
-- deck+wave left-middle, sources left-bottom, fx right-bottom
local function buildInspectorLayout(ctx, dockId)
  local toolNode, mainArea = split{ node=dockId, dir=imguiDir_Up, ratio=0.03 }
  -- Right 35% (ctrl + fx), left 65% (stage + deck + wave + sources)
  local rightCol, leftCol = split{ node=mainArea, dir=imguiDir_Right, ratio=0.35 }
  -- Right: controls top 60%, fx bottom 40%
  local fx, ctrl = split{ node=rightCol, dir=imguiDir_Down, ratio=0.40 }
  -- Left: sources bottom 30%, topLeft top 70% (stage + deck + wave)
  local sources, topLeft = split{ node=leftCol, dir=imguiDir_Down, ratio=0.30 }
  -- topLeft: stage top 65%, bottom 35% (deck + wave)
  local botMid, stage = split{ node=topLeft, dir=imguiDir_Down, ratio=0.35 }
  -- botMid: deck top 50%, wave bottom 50%
  local wave, deck = split{ node=botMid, dir=imguiDir_Down, ratio=0.50 }

  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[1]), toolNode)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[2]), deck)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[3]), stage)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[4]), sources)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[5]), wave)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[6]), ctrl)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[7]), fx)
end

-- ── Section content helpers ────────────────────────────────────────────

local function section(title, accent, lines)
  imguiTextColored(accent or 0xff94a3b8, title)
  imguiSeparator()
  for _, line in ipairs(lines or {}) do imguiText(line) end
  imguiSpacing()
end

local function renderToolbar(ctx)
  imguiTextColored(0xff22d3ee, "AVSampler Docking")
  imguiSameLine(); imguiText("Preset:")
  imguiSameLine(); if imguiButton("DECK", 58, 22) then ctx._layoutPreset = "deck"; ctx._rebuildDockTree = true end
  imguiSameLine(); if imguiButton("STAGE", 64, 22) then ctx._layoutPreset = "stage"; ctx._rebuildDockTree = true end
  imguiSameLine(); if imguiButton("INSPECT", 78, 22) then ctx._layoutPreset = "inspector"; ctx._rebuildDockTree = true end
  imguiSameLine(); if imguiButton("RESET", 62, 22) then ctx._rebuildDockTree = true end
end

local function renderStage()
  section("Output", 0xfff97316, { "Main viewport placeholder." })
  section("Preview", 0xffaa8844, { "Preview viewport placeholder." })
end

local function renderSources()
  section("Raw", 0xff22d3ee, { "Webcam/raw input viewport placeholder." })
  section("Segmented", 0xff22c55e, { "Segmentation viewport placeholder." })
  section("Pose", 0xffa78bfa, { "Pose skeleton viewport placeholder." })
end

local function renderControls()
  section("Transport / MIDI", 0xfff97316, { "Speed, output, root note, MIDI input." })
  section("Poly / Slice", 0xff22c55e, { "Poly voice areas and slice mode controls." })
  section("Shader", 0xff22c55e, { "Shader layer/effect parameter component placeholder." })
  section("Pose / Seg / Mapping", 0xffa78bfa, { "Mapping table component placeholder." })
  section("All Parameters", 0xfff97316, { "Inspector/all-params component placeholder." })
end

local function renderFx()
  section("FX Rack", 0xff22d3ee, { "FX slot component placeholder." })
  section("FX Status", 0xff94a3b8, { "FX status/readout placeholder." })
end

local function renderPanel(ctx, win)
  if imguiBegin(windowName(ctx, win), imguiWindowFlags_NoCollapse) then
    if win.key == "toolbar" then renderToolbar(ctx)
    elseif win.key == "stage" then renderStage()
    elseif win.key == "sources" then renderSources()
    elseif win.key == "controls" then renderControls()
    elseif win.key == "fx" then renderFx()
    elseif win.key == "deck" then section("Deck / Layers", 0xff22d3ee, { "Clip/layer matrix component placeholder." })
    elseif win.key == "waveform" then section("Waveform / Transport", 0xffaa88aa, { "Waveform and slice editing component placeholder." })
    end
  end
  imguiEnd()
end

-- ── Frame render ───────────────────────────────────────────────────────

local function renderFrame(ctx)
  local x, y, w, h = projectContentBounds(ctx)
  if w < 64 or h < 64 then return end

  local hostFlags = bor(
    imguiWindowFlags_NoTitleBar, imguiWindowFlags_NoResize,
    imguiWindowFlags_NoMove, imguiWindowFlags_NoCollapse,
    imguiWindowFlags_NoSavedSettings, imguiWindowFlags_NoScrollbar,
    imguiWindowFlags_NoBringToFrontOnFocus
  )
  imguiSetNextWindowPos(x, y, imguiCond_Always)
  imguiSetNextWindowSize(w, h, imguiCond_Always)

  local hostName = "AVSampler Dockspace Host###AVSD_host_" .. tostring(ctx._dockSuffix or "0")
  local dockspaceId = imguiGetID("AVSamplerProjectDockspace_" .. tostring(ctx._dockSuffix or "0"))

  if imguiBegin(hostName, hostFlags) then
    -- DockSpace renders first, returns the root node ID
    local rootId = imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)
    
    -- Build dock tree when needed, using the returned root node directly
    if (ctx._rebuildDockTree or not ctx._dockTreeBuilt) and w > 200 and h > 160 then
      local preset = tostring(ctx._layoutPreset or "deck")
      
      -- Remove existing node tree, add fresh one
      imguiDockBuilderRemoveNode(dockspaceId)
      imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
      imguiDockBuilderSetNodeSize(dockspaceId, w, h)
      
      if preset == "stage" then
        buildStageLayout(ctx, dockspaceId)
      elseif preset == "inspector" then
        buildInspectorLayout(ctx, dockspaceId)
      else
        buildDeckLayout(ctx, dockspaceId)
      end
      imguiDockBuilderFinish(dockspaceId)
      ctx._dockTreeBuilt = true
      ctx._rebuildDockTree = false
    end
  end
  imguiEnd()

  for _, win in ipairs(DOCK_WINDOWS) do renderPanel(ctx, win) end
end

-- ── Behavior lifecycle ─────────────────────────────────────────────────

function M.init(ctx)
  _G.__avsdDockInstanceCounter = (type(_G.__avsdDockInstanceCounter) == "number" and _G.__avsdDockInstanceCounter or 0) + 1
  local t = (type(getTime) == "function" and getTime()) or 0
  ctx._dockSuffix = tostring(math.floor(t * 1000000)) .. "_" .. tostring(_G.__avsdDockInstanceCounter)
  ctx._layoutPreset = "deck"
  ctx._dockTreeBuilt = false
  ctx._rebuildDockTree = false
  ctx._firstDockSpaceDone = false
  _G.__avsdSetPreset = function(preset)
    local p = tostring(preset or "deck")
    if p ~= "stage" and p ~= "inspector" then p = "deck" end
    ctx._layoutPreset = p
    ctx._rebuildDockTree = true
    return true
  end
  if ctx.root and ctx.root.node and ctx.root.node.setOnImGuiFrame then
    ctx.root.node:setOnImGuiFrame(function(_node) renderFrame(ctx) end)
  end
end

function M.resized(ctx) end
function M.update(ctx) end
function M.cleanup(ctx) if _G.__avsdSetPreset then _G.__avsdSetPreset = nil end end

return M
