-- FX Slot component behavior
-- XY pad + all real effect params for the selected FX type.
local ModWidgetSync = require("ui.modulation_widget_sync")
local Layout = require("ui.canonical_layout")

local FxSlotBehavior = {}

local FX_TYPE_NAMES = {
  [0] = "CHORUS",
  [1] = "PHASER",
  [2] = "WAVESHAPER",
  [3] = "COMPRESSOR",
  [4] = "STEREO WIDENER",
  [5] = "FILTER",
  [6] = "SVF FILTER",
  [7] = "REVERB",
  [8] = "STEREO DELAY",
  [9] = "MULTITAP",
  [10] = "PITCH SHIFT",
  [11] = "GRANULATOR",
  [12] = "RING MOD",
  [13] = "FORMANT",
  [14] = "EQ",
  [15] = "LIMITER",
  [16] = "TRANSIENT",
  [17] = "BITCRUSHER",
  [18] = "SHIMMER",
  [19] = "REVERSE DELAY",
  [20] = "STUTTER",
}

local FX_PARAMS = {
  [0]  = { "Rate", "Depth", "Feedback", "Spread", "Voices" },
  [1]  = { "Rate", "Depth", "Feedback", "Spread", "Stages" },
  [2]  = { "Drive", "Curve", "Output", "Bias" },
  [3]  = { "Threshold", "Ratio", "Attack", "Release", "Knee" },
  [4]  = { "Width", "MonoLow" },
  [5]  = { "Cutoff", "Reso" },
  [6]  = { "Cutoff", "Reso", "Drive" },
  [7]  = { "Room", "Damp" },
  [8]  = { "Time", "Feedback" },
  [9]  = { "Taps", "Feedback" },
  [10] = { "Pitch", "Window", "Feedback" },
  [11] = { "Grain", "Density", "Position", "Spray" },
  [12] = { "Freq", "Depth", "Spread" },
  [13] = { "Vowel", "Shift", "Reso", "Drive" },
  [14] = { "Low", "High", "Mid" },
  [15] = { "Threshold", "Drive", "Release", "SoftClip" },
  [16] = { "Attack", "Sustain", "Sensitivity" },
  [17] = { "Bits", "Rate", "Output" },
  [18] = { "Size", "Pitch", "Feedback", "Filter" },
  [19] = { "Time", "Window", "Feedback" },
  [20] = { "Length", "Gate", "Prob", "Filter" },
}

local MAX_VISIBLE_PARAMS = 5
local SYNC_INTERVAL = 0.12
local COMPACT_LAYOUT_CUTOFF_W = 300
local MIN_FREQ = 80
local MAX_FREQ = 16000
local LOG_MIN = math.log(MIN_FREQ)
local LOG_MAX = math.log(MAX_FREQ)
local MIN_RESO = 0.1
local MAX_RESO = 2.0
local DB_RANGE = 14

local COMPACT_REFERENCE_SIZE = { w = 236, h = 208 }
local WIDE_REFERENCE_SIZE = { w = 472, h = 208 }
local COMPACT_RECTS = {
  xy_pad = { x = 10, y = 10, w = 216, h = 188 },
  filter_graph = { x = 10, y = 10, w = 216, h = 188 },
  visual_mode_dots = { x = 104, y = 184, w = 28, h = 12 },
}
local WIDE_RECTS = {
  xy_pad = { x = 10, y = 10, w = 226, h = 188 },
  filter_graph = { x = 10, y = 10, w = 226, h = 188 },
  visual_mode_dots = { x = 109, y = 184, w = 28, h = 12 },
  type_dropdown = { x = 242, y = 10, w = 220, h = 20 },
  xy_x_label = { x = 242, y = 38, w = 12, h = 14 },
  xy_x_dropdown = { x = 256, y = 36, w = 92, h = 20 },
  xy_y_label = { x = 354, y = 38, w = 12, h = 14 },
  xy_y_dropdown = { x = 368, y = 36, w = 94, h = 20 },
  mix_knob = { x = 242, y = 64, w = 220, h = 18 },
}
local WIDE_PARAM_LAYOUT = {
  x = 242,
  y = 86,
  w = 220,
  h = 18,
  gap = 4,
}

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function readParam(path, fallback)
  if type(_G.getParam) == "function" then
    local ok, value = pcall(_G.getParam, path)
    if ok and value ~= nil then
      return value
    end
  end
  return fallback
end

local function writeParam(path, value)
  local numeric = tonumber(value) or 0
  local authoredWriter = type(_G) == "table" and _G.__midiSynthSetAuthoredParam or nil
  if type(authoredWriter) == "function" then
    return authoredWriter(path, numeric)
  end
  if type(_G.setParam) == "function" then
    return _G.setParam(path, numeric)
  end
  if type(command) == "function" then
    command("SET", path, tostring(numeric))
    return true
  end
  return false
end

local function getParamNames(fxType)
  return FX_PARAMS[fxType or 0] or { "Param 1", "Param 2" }
end

local function getParamWidgets(ctx)
  return {
    ctx.widgets.param1,
    ctx.widgets.param2,
    ctx.widgets.param3,
    ctx.widgets.param4,
    ctx.widgets.param5,
  }
end

local function setWidgetVisible(widget, visible)
  Layout.setVisible(widget, visible)
end

local function relayoutManagedSubtree(widget, width, height)
  local runtime = widget and widget._structuredRuntime or nil
  local record = widget and widget._structuredRecord or nil
  if type(runtime) ~= "table" or type(runtime.notifyRecordHostedResized) ~= "function" or type(record) ~= "table" then
    return false
  end
  local ok = pcall(function()
    runtime:notifyRecordHostedResized(record, width, height)
  end)
  return ok == true
end

local function anchorDropdown(dropdown, root)
  if not dropdown or not dropdown.setAbsolutePos or not dropdown.node or not root or not root.node then return end
  local ax, ay = 0, 0
  local node = dropdown.node
  local depth = 0
  while node and depth < 20 do
    local bx, by = node:getBounds()
    ax = ax + (bx or 0)
    ay = ay + (by or 0)
    local ok, parent = pcall(function() return node:getParent() end)
    if ok and parent and parent ~= node then
      node = parent
    else
      break
    end
    depth = depth + 1
  end
  dropdown:setAbsolutePos(ax, ay)
end

local function isUsableInstanceNodeId(nodeId)
  local id = tostring(nodeId or "")
  if id == "" then
    return false
  end
  if id:match("Component$") or id:match("Content$") or id:match("Shell$") then
    return false
  end
  return true
end

local function nodeIdFromGlobalId(globalId)
  local gid = tostring(globalId or "")
  local shellId = gid:match("%.([^.]+Shell)%.[^.]+$")
  if shellId == nil then
    shellId = gid:match("([^.]+Shell)%.[^.]+$")
  end
  if type(shellId) == "string" and shellId ~= "" then
    local nodeId = shellId:gsub("Shell$", "")
    if isUsableInstanceNodeId(nodeId) then
      return nodeId
    end
  end
  return nil
end

local function getInstanceNodeId(ctx)
  if type(ctx) ~= "table" then
    return "fx1"
  end
  local propsNodeId = ctx.instanceProps and ctx.instanceProps.instanceNodeId or nil
  if isUsableInstanceNodeId(propsNodeId) then
    ctx._instanceNodeId = propsNodeId
    return propsNodeId
  end
  if isUsableInstanceNodeId(ctx._instanceNodeId) then
    return ctx._instanceNodeId
  end

  local record = ctx.root and ctx.root._structuredRecord or nil
  local globalId = type(record) == "table" and tostring(record.globalId or "") or ""
  local nodeId = nodeIdFromGlobalId(globalId)
  if nodeId ~= nil then
    ctx._instanceNodeId = nodeId
    return nodeId
  end

  local root = ctx.root
  local node = root and root.node or nil
  local source = node and node.getUserData and node:getUserData("_structuredInstanceSource") or nil
  local sourceNodeId = type(source) == "table" and type(source.nodeId) == "string" and source.nodeId or nil
  if isUsableInstanceNodeId(sourceNodeId) then
    ctx._instanceNodeId = sourceNodeId
    return sourceNodeId
  end

  local sourceGlobalId = type(source) == "table" and tostring(source.globalId or "") or ""
  nodeId = nodeIdFromGlobalId(sourceGlobalId)
  if nodeId ~= nil then
    ctx._instanceNodeId = nodeId
    return nodeId
  end

  return "fx1"
end

local function getParamBase(ctx)
  local instanceProps = type(ctx) == "table" and ctx.instanceProps or nil
  local propsParamBase = type(instanceProps) == "table" and type(instanceProps.paramBase) == "string" and instanceProps.paramBase or nil
  if type(propsParamBase) == "string" and propsParamBase ~= "" then
    return propsParamBase
  end
  local nodeId = getInstanceNodeId(ctx)
  if nodeId == "fx1" then
    return "/midi/synth/fx1"
  elseif nodeId == "fx2" then
    return "/midi/synth/fx2"
  end

  local info = type(_G) == "table" and _G.__midiSynthDynamicModuleInfo or nil
  local entry = type(info) == "table" and info[nodeId] or nil
  local paramBase = type(entry) == "table" and type(entry.paramBase) == "string" and entry.paramBase or nil
  if type(paramBase) == "string" and paramBase ~= "" then
    return paramBase
  end

  return "/midi/synth/fx1"
end

local function typePath(ctx)
  return getParamBase(ctx) .. "/type"
end

local function mixPath(ctx)
  return getParamBase(ctx) .. "/mix"
end

local function paramPath(ctx, index)
  return string.format("%s/p/%d", getParamBase(ctx), math.max(0, math.floor(tonumber(index) or 0)))
end

local function xyAssignPath(ctx, axis)
  if getParamBase(ctx) ~= "/plugin/params" then
    return nil
  end
  if axis == "x" then
    return "/plugin/ui/xyXParam"
  end
  return "/plugin/ui/xyYParam"
end

local function readXyAssign(ctx, axis, fallback)
  local path = xyAssignPath(ctx, axis)
  if not path then
    return math.max(1, math.floor(tonumber(fallback) or 1))
  end
  return math.max(1, math.floor(tonumber(readParam(path, fallback)) or tonumber(fallback) or 1))
end

local function writeXyAssign(ctx, axis, value)
  local path = xyAssignPath(ctx, axis)
  if not path then
    return false
  end
  return writeParam(path, math.max(1, math.floor(tonumber(value) or 1)))
end

local function fxHasFilterGraph(ctx)
  local fxType = math.max(0, math.floor(tonumber(ctx and ctx.fxType or 0) or 0))
  return fxType == 5 or fxType == 6
end

local function filterGraphColour(fxType)
  if fxType == 6 then
    return 0xff4ade80
  end
  return 0xffa78bfa
end

local function svfMagnitude(freq, cutoff, resonance)
  local safeCutoff = math.max(MIN_FREQ, tonumber(cutoff) or 3200)
  local w = freq / safeCutoff
  if w < 0.1 then
    return 1.0
  end
  if w > 10 then
    return 0.0
  end
  local w2 = w * w
  local q = math.max(0.5, (tonumber(resonance) or 0.75) * 2)
  local denom = (1 - w2) * (1 - w2) + (w / q) * (w / q)
  if denom < 1e-10 then denom = 1e-10 end
  return 1.0 / math.sqrt(denom)
end

local function normalizedCutoffToHz(value)
  local t = clamp(value, 0.0, 1.0)
  return math.exp(LOG_MIN + t * (LOG_MAX - LOG_MIN))
end

local function normalizedResoToValue(value)
  return MIN_RESO + clamp(value, 0.0, 1.0) * (MAX_RESO - MIN_RESO)
end

local function buildXYDisplay(ctx, w, h)
  local display = {}
  local xVal = ctx.xyXDisplay or ctx.xyX or 0.5
  local yVal = ctx.xyYDisplay or ctx.xyY or 0.5
  local dragging = ctx.dragging
  local col = ctx.accentColor or 0xff22d3ee
  local colDim = (0x18 << 24) | (col & 0x00ffffff)
  local colMid = (0x44 << 24) | (col & 0x00ffffff)

  display[#display + 1] = {
    cmd = "drawText", x = 4, y = 2, w = w - 8, h = 16,
    text = ctx.fxName or "FX", color = col, fontSize = 11, align = "left", valign = "top",
  }

  for i = 1, 3 do
    display[#display + 1] = {
      cmd = "drawLine", x1 = math.floor(w * i / 4), y1 = 0,
      x2 = math.floor(w * i / 4), y2 = h, thickness = 1, color = 0xff1a1a3a,
    }
    display[#display + 1] = {
      cmd = "drawLine", x1 = 0, y1 = math.floor(h * i / 4),
      x2 = w, y2 = math.floor(h * i / 4), thickness = 1, color = 0xff1a1a3a,
    }
  end

  local cx = math.floor(xVal * w)
  local cy = math.floor((1 - yVal) * h)

  display[#display + 1] = { cmd = "drawLine", x1 = cx, y1 = 0, x2 = cx, y2 = h, thickness = 1, color = colMid }
  display[#display + 1] = { cmd = "drawLine", x1 = 0, y1 = cy, x2 = w, y2 = cy, thickness = 1, color = colMid }
  display[#display + 1] = { cmd = "fillRect", x = 0, y = cy, w = cx, h = h - cy, color = colDim }

  local ptR = dragging and 8 or 6
  if dragging then
    display[#display + 1] = {
      cmd = "fillRoundedRect",
      x = cx - ptR - 3, y = cy - ptR - 3, w = (ptR + 3) * 2, h = (ptR + 3) * 2,
      radius = ptR + 3, color = (0x33 << 24) | (col & 0x00ffffff),
    }
  end
  display[#display + 1] = {
    cmd = "fillRoundedRect",
    x = cx - ptR, y = cy - ptR, w = ptR * 2, h = ptR * 2,
    radius = ptR, color = dragging and col or 0xFFFFFFFF,
  }

  local xName = ctx.xyXName or "X"
  local yName = ctx.xyYName or "Y"
  display[#display + 1] = {
    cmd = "drawText", x = 4, y = h - 14, w = math.floor(w * 0.5), h = 12,
    text = string.format("%s: %.0f%%", xName, xVal * 100),
    color = (0x88 << 24) | (col & 0x00ffffff), fontSize = 9,
  }
  display[#display + 1] = {
    cmd = "drawText", x = math.floor(w * 0.5), y = 2,
    w = math.floor(w * 0.5) - 4, h = 12,
    text = string.format("%s: %.0f%%", yName, yVal * 100),
    color = (0x88 << 24) | (col & 0x00ffffff), fontSize = 9,
    justification = 2,
  }

  return display
end

local function refreshPad(ctx)
  local pad = ctx.widgets.xy_pad
  if not pad or not pad.node then return end
  local w = pad.node:getWidth()
  local h = pad.node:getHeight()
  if w <= 0 or h <= 0 then return end
  pad.node:setDisplayList(buildXYDisplay(ctx, w, h))
  pad.node:repaint()
end

local function buildFilterDisplay(ctx, w, h)
  local display = {}
  local cutoffNorm = clamp(ctx.xyXDisplay or ctx.xyX or 0.5, 0.0, 1.0)
  local resonanceNorm = clamp(ctx.xyYDisplay or ctx.xyY or 0.5, 0.0, 1.0)
  local cutoff = normalizedCutoffToHz(cutoffNorm)
  local resonance = normalizedResoToValue(resonanceNorm)
  local dragging = ctx.dragging
  local col = filterGraphColour(ctx.fxType)
  local colDim = (0x20 << 24) | (col & 0x00ffffff)
  local colMid = (0x60 << 24) | (col & 0x00ffffff)

  display[#display + 1] = {
    cmd = "drawText", x = 4, y = 2, w = w - 8, h = 16,
    text = ctx.fxName or "FILTER", color = col, fontSize = 11, align = "left", valign = "top",
  }

  local freqMarks = { 100, 500, 1000, 5000, 10000 }
  for _, f in ipairs(freqMarks) do
    local x = math.floor((math.log(f) - LOG_MIN) / (LOG_MAX - LOG_MIN) * w)
    display[#display + 1] = {
      cmd = "drawLine", x1 = x, y1 = 0, x2 = x, y2 = h,
      thickness = 1, color = 0xff1a1a3a,
    }
  end

  local dbMarks = { -24, -12, 0, 12, 24 }
  for _, db in ipairs(dbMarks) do
    local y = math.floor(h * 0.5 - (db / DB_RANGE) * h * 0.45)
    if y >= 0 and y <= h then
      display[#display + 1] = {
        cmd = "drawLine", x1 = 0, y1 = y, x2 = w, y2 = y,
        thickness = 1, color = (db == 0) and 0xff1f2b4d or 0xff1a1a3a,
      }
    end
  end

  local cutoffX = math.floor(cutoffNorm * w)
  display[#display + 1] = {
    cmd = "drawLine", x1 = cutoffX, y1 = 0, x2 = cutoffX, y2 = h,
    thickness = 1, color = colMid,
  }

  local numPoints = math.max(60, math.min(w, 200))
  local prevX, prevY
  local zeroY = math.floor(h * 0.5)
  for i = 0, numPoints do
    local t = i / numPoints
    local freq = math.exp(LOG_MIN + t * (LOG_MAX - LOG_MIN))
    local mag = svfMagnitude(freq, cutoff, resonance)
    local db = 20 * math.log(mag + 1e-10) / math.log(10)
    db = math.max(-DB_RANGE, math.min(DB_RANGE, db))
    local x = math.floor(t * w)
    local y = math.floor(h * 0.5 - (db / DB_RANGE) * h * 0.45)
    y = math.max(1, math.min(h - 1, y))

    if i > 0 then
      display[#display + 1] = {
        cmd = "drawLine", x1 = x, y1 = y, x2 = x, y2 = zeroY,
        thickness = math.max(1, math.ceil(w / numPoints)), color = colDim,
      }
    end
    if prevX then
      display[#display + 1] = {
        cmd = "drawLine", x1 = prevX, y1 = prevY, x2 = x, y2 = y,
        thickness = 2, color = col,
      }
    end
    prevX, prevY = x, y
  end

  local peakMag = svfMagnitude(cutoff, cutoff, resonance)
  local peakDb = 20 * math.log(peakMag + 1e-10) / math.log(10)
  peakDb = math.max(-DB_RANGE, math.min(DB_RANGE, peakDb))
  local peakY = math.floor(h * 0.5 - (peakDb / DB_RANGE) * h * 0.45)
  local ptR = dragging and 7 or 5
  if dragging then
    display[#display + 1] = {
      cmd = "fillRoundedRect",
      x = cutoffX - ptR - 3, y = peakY - ptR - 3,
      w = (ptR + 3) * 2, h = (ptR + 3) * 2,
      radius = ptR + 3,
      color = (0x44 << 24) | (col & 0x00ffffff),
    }
  end
  display[#display + 1] = {
    cmd = "fillRoundedRect",
    x = cutoffX - ptR, y = peakY - ptR,
    w = ptR * 2, h = ptR * 2,
    radius = ptR,
    color = dragging and col or 0xFFFFFFFF,
  }

  return display
end

local function refreshFilterGraph(ctx)
  local graph = ctx.widgets and ctx.widgets.filter_graph
  if not graph or not graph.node then return end
  local w = graph.node:getWidth()
  local h = graph.node:getHeight()
  if w <= 0 or h <= 0 then return end
  graph.node:setDisplayList(buildFilterDisplay(ctx, w, h))
  graph.node:repaint()
end

local function resolveVisualDotWidgets(ctx)
  local widgets = ctx.widgets or {}
  local graphDot = widgets.visual_mode_dot_graph
  local xyDot = widgets.visual_mode_dot_xy
  local container = widgets.visual_mode_dots
  local children = container and container.children or nil

  if (graphDot == nil or xyDot == nil or graphDot == xyDot) and type(children) == "table" then
    graphDot = children.visual_mode_dot_graph or children["visual_mode_dot_graph"] or graphDot
    xyDot = children.visual_mode_dot_xy or children["visual_mode_dot_xy"] or xyDot
  end

  return graphDot, xyDot
end

local function updateVisualDots(ctx)
  local hasGraph = fxHasFilterGraph(ctx)
  local graphDot, xyDot = resolveVisualDotWidgets(ctx)
  local dots = {
    { widget = graphDot, mode = 1 },
    { widget = xyDot, mode = 2 },
  }
  for _, entry in ipairs(dots) do
    local dot = entry.widget
    if dot then
      local isActive = hasGraph and (ctx.visualMode or 2) == entry.mode
      local newColour = isActive and 0xffffffff or 0xff475569
      if dot.setVisible then
        dot:setVisible(hasGraph)
      elseif dot.node and dot.node.setVisible then
        dot.node:setVisible(hasGraph)
      end
      if dot.setColour then
        dot:setColour(newColour)
      else
        dot._colour = newColour
        if dot._syncRetained then dot:_syncRetained() end
        if dot.node and dot.node.repaint then dot.node:repaint() end
      end
    end
  end
end

local function syncVisualMode(ctx)
  local widgets = ctx.widgets or {}
  local hasGraph = fxHasFilterGraph(ctx)
  if hasGraph then
    local mode = tonumber(ctx.visualMode) or 1
    if mode ~= 1 and mode ~= 2 then mode = 1 end
    ctx.visualMode = mode
  else
    ctx.visualMode = 2
  end
  Layout.setVisible(widgets.filter_graph, hasGraph and ctx.visualMode == 1)
  Layout.setVisible(widgets.xy_pad, (not hasGraph) or ctx.visualMode == 2)
  Layout.setVisible(widgets.visual_mode_dots, hasGraph)
  updateVisualDots(ctx)
end

local function bindVisualDots(ctx)
  local graphDot, xyDot = resolveVisualDotWidgets(ctx)
  local dots = {
    { widget = graphDot, mode = 1 },
    { widget = xyDot, mode = 2 },
  }
  for _, entry in ipairs(dots) do
    local widget = entry.widget
    if widget and widget.node then
      widget.node:setInterceptsMouse(true, true)
      local mode = entry.mode
      widget.node:setOnClick(function()
        if not fxHasFilterGraph(ctx) then return end
        ctx.visualMode = mode
        syncVisualMode(ctx)
        refreshPad(ctx)
        refreshFilterGraph(ctx)
      end)
    end
  end
end

local function populateDropdown(dropdown, names, selectedIdx)
  if not dropdown then return end
  if dropdown.setOptions then dropdown:setOptions(names) end
  local sel = math.min(selectedIdx or 1, #names)
  if sel < 1 then sel = 1 end
  if dropdown.setSelected then dropdown:setSelected(sel) end
  return sel
end

local function updateParamControls(ctx)
  local names = getParamNames(ctx.fxType)
  ctx.paramNames = names

  local paramWidgets = getParamWidgets(ctx)
  for i = 1, #paramWidgets do
    local widget = paramWidgets[i]
    local name = names[i]
    if widget then
      if widget.setLabel then
        widget:setLabel(name or ("P" .. tostring(i)))
      else
        widget._label = name or ("P" .. tostring(i))
        if widget._syncRetained then widget:_syncRetained() end
      end
      setWidgetVisible(widget, name ~= nil)
    end
  end
end

local function syncAllDropdowns(ctx)
  local names = getParamNames(ctx.fxType)
  ctx.xyXIdx = populateDropdown(ctx.widgets.xy_x_dropdown, names, readXyAssign(ctx, "x", ctx.xyXIdx or 1))
  ctx.xyYIdx = populateDropdown(ctx.widgets.xy_y_dropdown, names, readXyAssign(ctx, "y", ctx.xyYIdx or math.min(2, #names)))
  ctx.xyXName = names[ctx.xyXIdx] or "X"
  ctx.xyYName = names[ctx.xyYIdx] or "Y"
  updateParamControls(ctx)
end

local function syncFromParams(ctx)
  local changed = false
  local typeDrop = ctx.widgets.type_dropdown
  local xyXDrop = ctx.widgets.xy_x_dropdown
  local xyYDrop = ctx.widgets.xy_y_dropdown
  local mixKnob = ctx.widgets.mix_knob
  local paramWidgets = getParamWidgets(ctx)

  local anyDropdownOpen = (typeDrop and typeDrop._open)
    or (xyXDrop and xyXDrop._open)
    or (xyYDrop and xyYDrop._open)

  local fxType = math.max(0, math.floor(tonumber(readParam(typePath(ctx), ctx.fxType or 0)) or 0))
  local mixBase, mixEffective, mixState = ModWidgetSync.resolveValues(mixPath(ctx), 0.0, readParam)
  local mix = clamp(mixBase, 0.0, 1.0)
  local mixEffectiveClamped = clamp(mixEffective, 0.0, 1.0)

  if ctx.fxType ~= fxType and not anyDropdownOpen then
    local hadGraph = fxHasFilterGraph(ctx)
    ctx.fxType = fxType
    ctx.fxName = FX_TYPE_NAMES[fxType] or "FX"
    ctx.accentColor = fxHasFilterGraph(ctx) and filterGraphColour(ctx.fxType) or 0xff22d3ee
    syncAllDropdowns(ctx)
    if fxHasFilterGraph(ctx) and not hadGraph then
      ctx.visualMode = 1
    elseif not fxHasFilterGraph(ctx) then
      ctx.visualMode = 2
    end
    ctx._hadFilterGraph = fxHasFilterGraph(ctx)
    if typeDrop and typeDrop.setSelected then
      typeDrop:setSelected(fxType + 1)
    end
    changed = true
  elseif typeDrop and typeDrop.setSelected and not anyDropdownOpen then
    typeDrop:setSelected(fxType + 1)
  end

  if not anyDropdownOpen then
    local nextXIndex = readXyAssign(ctx, "x", ctx.xyXIdx or 1)
    local nextYIndex = readXyAssign(ctx, "y", ctx.xyYIdx or math.min(2, #ctx.paramNames))
    local names = ctx.paramNames or getParamNames(ctx.fxType)
    if nextXIndex > #names then nextXIndex = 1 end
    if nextYIndex > #names then nextYIndex = math.min(2, #names) end
    if nextYIndex < 1 then nextYIndex = 1 end
    if ctx.xyXIdx ~= nextXIndex then
      ctx.xyXIdx = nextXIndex
      changed = true
    end
    if ctx.xyYIdx ~= nextYIndex then
      ctx.xyYIdx = nextYIndex
      changed = true
    end
    if xyXDrop and xyXDrop.setSelected then
      xyXDrop:setSelected(ctx.xyXIdx)
    end
    if xyYDrop and xyYDrop.setSelected then
      xyYDrop:setSelected(ctx.xyYIdx)
    end
    ctx.xyXName = names[ctx.xyXIdx] or "X"
    ctx.xyYName = names[ctx.xyYIdx] or "Y"
  end

  ModWidgetSync.syncWidget(mixKnob, mix, mixEffectiveClamped, mixState)

  local xIndex = math.max(1, math.floor(tonumber(ctx.xyXIdx) or 1))
  local yIndex = math.max(1, math.floor(tonumber(ctx.xyYIdx) or 2))
  for i = 1, #paramWidgets do
    local valueBase, valueEffective, valueState = ModWidgetSync.resolveValues(paramPath(ctx, i - 1), 0.5, readParam)
    local value = clamp(valueBase, 0.0, 1.0)
    local valueEffectiveClamped = clamp(valueEffective, 0.0, 1.0)
    local widget = paramWidgets[i]
    ModWidgetSync.syncWidget(widget, value, valueEffectiveClamped, valueState)
    if i == xIndex then
      if not ctx.dragging and math.abs((ctx.xyX or 0.0) - value) > 0.0001 then
        ctx.xyX = value
        changed = true
      end
      if math.abs((ctx.xyXDisplay or 0.0) - valueEffectiveClamped) > 0.0001 then
        ctx.xyXDisplay = valueEffectiveClamped
        changed = true
      end
    end
    if i == yIndex then
      if not ctx.dragging and math.abs((ctx.xyY or 0.0) - value) > 0.0001 then
        ctx.xyY = value
        changed = true
      end
      if math.abs((ctx.xyYDisplay or 0.0) - valueEffectiveClamped) > 0.0001 then
        ctx.xyYDisplay = valueEffectiveClamped
        changed = true
      end
    end
  end

  return changed
end

local function bindParamControls(ctx)
  local typeDrop = ctx.widgets.type_dropdown
  local mixKnob = ctx.widgets.mix_knob
  local paramWidgets = getParamWidgets(ctx)

  if typeDrop then
    typeDrop._onSelect = function(idx)
      local nextType = math.max(0, (tonumber(idx) or 1) - 1)
      writeParam(typePath(ctx), nextType)
      ctx.fxType = nextType
      FxSlotBehavior.onTypeChanged(ctx)
    end
  end

  if mixKnob then
    mixKnob._onChange = function(v)
      writeParam(mixPath(ctx), clamp(v, 0.0, 1.0))
      syncFromParams(ctx)
      refreshPad(ctx)
      refreshFilterGraph(ctx)
    end
  end

  for i = 1, #paramWidgets do
    local widget = paramWidgets[i]
    if widget then
      widget._onChange = function(v)
        local normalized = clamp(v, 0.0, 1.0)
        writeParam(paramPath(ctx, i - 1), normalized)
        syncFromParams(ctx)
        refreshPad(ctx)
        refreshFilterGraph(ctx)
      end
    end
  end

  ctx._onXYChanged = function(xVal, yVal)
    local xIndex = math.max(1, math.floor(tonumber(ctx.xyXIdx) or 1))
    local yIndex = math.max(1, math.floor(tonumber(ctx.xyYIdx) or 2))
    writeParam(paramPath(ctx, xIndex - 1), xVal)
    writeParam(paramPath(ctx, yIndex - 1), yVal)
    ctx.xyX = xVal
    ctx.xyY = yVal
    syncFromParams(ctx)
    refreshFilterGraph(ctx)
  end
end

local function setupInteraction(ctx)
  local pad = ctx.widgets.xy_pad
  if pad and pad.node then
    if pad.node.setInterceptsMouse then pad.node:setInterceptsMouse(true, true) end

    local function applyXY(mx, my)
      local w = pad.node:getWidth()
      local h = pad.node:getHeight()
      if w <= 0 or h <= 0 then return end
      ctx.xyX = math.max(0, math.min(1, mx / w))
      ctx.xyY = math.max(0, math.min(1, 1 - my / h))
      if ctx._onXYChanged then ctx._onXYChanged(ctx.xyX, ctx.xyY) end
      refreshPad(ctx)
      refreshFilterGraph(ctx)
    end

    if pad.node.setOnMouseDown then
      pad.node:setOnMouseDown(function(mx, my) ctx.dragging = true; applyXY(mx, my) end)
    end
    if pad.node.setOnMouseDrag then
      pad.node:setOnMouseDrag(function(mx, my) if ctx.dragging then applyXY(mx, my) end end)
    end
    if pad.node.setOnMouseUp then
      pad.node:setOnMouseUp(function() ctx.dragging = false; refreshPad(ctx); refreshFilterGraph(ctx) end)
    end
  end

  local xyXDrop = ctx.widgets.xy_x_dropdown
  if xyXDrop then
    xyXDrop._onSelect = function(idx)
      ctx.xyXIdx = idx
      writeXyAssign(ctx, "x", idx)
      local names = getParamNames(ctx.fxType)
      ctx.xyXName = names[idx] or "X"
      local value, valueEffective = ModWidgetSync.resolveValues(paramPath(ctx, idx - 1), ctx.xyX or 0.5, readParam)
      value = clamp(value, 0.0, 1.0)
      valueEffective = clamp(valueEffective, 0.0, 1.0)
      ctx.xyX = value
      ctx.xyXDisplay = valueEffective
      refreshPad(ctx)
      refreshFilterGraph(ctx)
    end
  end

  local xyYDrop = ctx.widgets.xy_y_dropdown
  if xyYDrop then
    xyYDrop._onSelect = function(idx)
      ctx.xyYIdx = idx
      writeXyAssign(ctx, "y", idx)
      local names = getParamNames(ctx.fxType)
      ctx.xyYName = names[idx] or "Y"
      local value, valueEffective = ModWidgetSync.resolveValues(paramPath(ctx, idx - 1), ctx.xyY or 0.5, readParam)
      value = clamp(value, 0.0, 1.0)
      valueEffective = clamp(valueEffective, 0.0, 1.0)
      ctx.xyY = value
      ctx.xyYDisplay = valueEffective
      refreshPad(ctx)
      refreshFilterGraph(ctx)
    end
  end
end

local function setupFilterGraphInteraction(ctx)
  local graph = ctx.widgets and ctx.widgets.filter_graph
  if not graph or not graph.node then return end
  if graph.node.setInterceptsMouse then graph.node:setInterceptsMouse(true, true) end

  local function applyGraph(mx, my)
    local w = graph.node:getWidth()
    local h = graph.node:getHeight()
    if w <= 0 or h <= 0 then return end
    local xVal = math.max(0, math.min(1, mx / w))
    local yVal = math.max(0, math.min(1, 1 - my / h))
    if ctx._onXYChanged then ctx._onXYChanged(xVal, yVal) end
    ctx.xyX = xVal
    ctx.xyY = yVal
    refreshPad(ctx)
    refreshFilterGraph(ctx)
  end

  if graph.node.setOnMouseDown then
    graph.node:setOnMouseDown(function(mx, my)
      if not fxHasFilterGraph(ctx) then return end
      ctx.dragging = true
      applyGraph(mx, my)
    end)
  end
  if graph.node.setOnMouseDrag then
    graph.node:setOnMouseDrag(function(mx, my)
      if not (ctx.dragging and fxHasFilterGraph(ctx)) then return end
      applyGraph(mx, my)
    end)
  end
  if graph.node.setOnMouseUp then
    graph.node:setOnMouseUp(function()
      ctx.dragging = false
      refreshPad(ctx)
      refreshFilterGraph(ctx)
    end)
  end
end

function FxSlotBehavior.init(ctx)
  ctx.fxType = -1
  ctx.fxName = "FX"
  ctx.xyX = 0.5
  ctx.xyY = 0.5
  ctx.xyXDisplay = 0.5
  ctx.xyYDisplay = 0.5
  ctx.xyXIdx = 1
  ctx.xyYIdx = 2
  ctx.xyXName = "Rate"
  ctx.xyYName = "Depth"
  ctx.dragging = false
  ctx.visualMode = 2
  ctx.accentColor = 0xff22d3ee
  ctx.paramNames = getParamNames(ctx.fxType)
  ctx._lastSyncTime = 0
  setupInteraction(ctx)
  setupFilterGraphInteraction(ctx)
  bindVisualDots(ctx)
  bindParamControls(ctx)
  syncFromParams(ctx)
  syncVisualMode(ctx)
  ctx._refreshPad = function()
    syncVisualMode(ctx)
    refreshPad(ctx)
    refreshFilterGraph(ctx)
  end
  ctx._syncFromParams = function()
    syncFromParams(ctx)
    syncVisualMode(ctx)
    refreshPad(ctx)
    refreshFilterGraph(ctx)
  end
  refreshPad(ctx)
  refreshFilterGraph(ctx)
end

function FxSlotBehavior.onTypeChanged(ctx)
  local names = getParamNames(ctx.fxType)
  local hadGraph = ctx._hadFilterGraph == true
  ctx.fxName = FX_TYPE_NAMES[ctx.fxType] or "FX"
  ctx.accentColor = fxHasFilterGraph(ctx) and filterGraphColour(ctx.fxType) or 0xff22d3ee
  if ctx.xyXIdx > #names then ctx.xyXIdx = 1 end
  if ctx.xyYIdx > #names then ctx.xyYIdx = math.min(2, #names) end
  if ctx.xyYIdx < 1 then ctx.xyYIdx = 1 end
  writeXyAssign(ctx, "x", ctx.xyXIdx)
  writeXyAssign(ctx, "y", ctx.xyYIdx)
  syncAllDropdowns(ctx)
  ctx.xyX = clamp(readParam(paramPath(ctx, (ctx.xyXIdx or 1) - 1), ctx.xyX or 0.5), 0.0, 1.0)
  ctx.xyY = clamp(readParam(paramPath(ctx, (ctx.xyYIdx or 2) - 1), ctx.xyY or 0.5), 0.0, 1.0)
  ctx.xyXDisplay = ctx.xyX
  ctx.xyYDisplay = ctx.xyY
  if fxHasFilterGraph(ctx) and not hadGraph then
    ctx.visualMode = 1
  elseif not fxHasFilterGraph(ctx) then
    ctx.visualMode = 2
  end
  ctx._hadFilterGraph = fxHasFilterGraph(ctx)
  syncVisualMode(ctx)
  refreshPad(ctx)
  refreshFilterGraph(ctx)
end

function FxSlotBehavior.resized(ctx, w, h)
  if (not w or w <= 0) and ctx.root and ctx.root.node then
    w = ctx.root.node:getWidth()
    h = ctx.root.node:getHeight()
  end
  if not w or w <= 0 then return end

  local widgets = ctx.widgets or {}
  local queue = {}
  local mode = Layout.layoutModeForWidth(w, COMPACT_LAYOUT_CUTOFF_W)
  local reference = mode == "compact" and COMPACT_REFERENCE_SIZE or WIDE_REFERENCE_SIZE
  local scaleX, scaleY = Layout.scaleFactors(w, h, reference)
  local paramWidgets = getParamWidgets(ctx)
  local names = getParamNames(ctx.fxType)

  local rects = (mode == "compact") and COMPACT_RECTS or WIDE_RECTS

  Layout.applyScaledRect(queue, widgets.xy_pad, rects.xy_pad, scaleX, scaleY)
  Layout.applyScaledRect(queue, widgets.filter_graph, rects.filter_graph, scaleX, scaleY)
  Layout.applyScaledRect(queue, widgets.visual_mode_dots, rects.visual_mode_dots, scaleX, scaleY)

  if mode == "compact" then
    Layout.setVisibleQueued(queue, widgets.type_dropdown, false)
    Layout.setVisibleQueued(queue, widgets.xy_x_label, false)
    Layout.setVisibleQueued(queue, widgets.xy_x_dropdown, false)
    Layout.setVisibleQueued(queue, widgets.xy_y_label, false)
    Layout.setVisibleQueued(queue, widgets.xy_y_dropdown, false)
    Layout.setVisibleQueued(queue, widgets.mix_knob, false)
    Layout.setBoundsQueued(queue, widgets.type_dropdown, 0, 0, 1, 1)
    Layout.setBoundsQueued(queue, widgets.xy_x_label, 0, 0, 1, 1)
    Layout.setBoundsQueued(queue, widgets.xy_x_dropdown, 0, 0, 1, 1)
    Layout.setBoundsQueued(queue, widgets.xy_y_label, 0, 0, 1, 1)
    Layout.setBoundsQueued(queue, widgets.xy_y_dropdown, 0, 0, 1, 1)
    Layout.setBoundsQueued(queue, widgets.mix_knob, 0, 0, 1, 1)
    for i = 1, #paramWidgets do
      Layout.setVisibleQueued(queue, paramWidgets[i], false)
      Layout.setBoundsQueued(queue, paramWidgets[i], 0, 0, 1, 1)
    end
  else
    Layout.setVisibleQueued(queue, widgets.type_dropdown, true)
    Layout.setVisibleQueued(queue, widgets.xy_x_label, true)
    Layout.setVisibleQueued(queue, widgets.xy_x_dropdown, true)
    Layout.setVisibleQueued(queue, widgets.xy_y_label, true)
    Layout.setVisibleQueued(queue, widgets.xy_y_dropdown, true)
    Layout.setVisibleQueued(queue, widgets.mix_knob, true)

    Layout.applyScaledRect(queue, widgets.type_dropdown, WIDE_RECTS.type_dropdown, scaleX, scaleY)
    Layout.applyScaledRect(queue, widgets.xy_x_label, WIDE_RECTS.xy_x_label, scaleX, scaleY)
    Layout.applyScaledRect(queue, widgets.xy_x_dropdown, WIDE_RECTS.xy_x_dropdown, scaleX, scaleY)
    Layout.applyScaledRect(queue, widgets.xy_y_label, WIDE_RECTS.xy_y_label, scaleX, scaleY)
    Layout.applyScaledRect(queue, widgets.xy_y_dropdown, WIDE_RECTS.xy_y_dropdown, scaleX, scaleY)
    Layout.applyScaledRect(queue, widgets.mix_knob, WIDE_RECTS.mix_knob, scaleX, scaleY)

    local baseX, baseY, baseW, baseH = Layout.scaledRect(WIDE_PARAM_LAYOUT, scaleX, scaleY)
    local gap = math.max(2, math.floor(WIDE_PARAM_LAYOUT.gap * scaleY + 0.5))
    for i = 1, MAX_VISIBLE_PARAMS do
      local widget = paramWidgets[i]
      local visible = names[i] ~= nil
      Layout.setVisibleQueued(queue, widget, visible)
      if visible then
        local y = baseY + (i - 1) * (baseH + gap)
        Layout.setBoundsQueued(queue, widget, baseX, y, baseW, baseH)
      else
        Layout.setBoundsQueued(queue, widget, 0, 0, 1, 1)
      end
    end
  end

  Layout.flushWidgetRefreshes(queue)

  if widgets.visual_mode_dots and type(rects.visual_mode_dots) == "table" then
    local _, _, dotsW, dotsH = Layout.scaledRect(rects.visual_mode_dots, scaleX, scaleY)
    relayoutManagedSubtree(widgets.visual_mode_dots, dotsW, dotsH)
  end

  anchorDropdown(widgets.type_dropdown, ctx.root)
  anchorDropdown(widgets.xy_x_dropdown, ctx.root)
  anchorDropdown(widgets.xy_y_dropdown, ctx.root)
  bindVisualDots(ctx)
  syncVisualMode(ctx)
  refreshPad(ctx)
  refreshFilterGraph(ctx)
end

function FxSlotBehavior.update(ctx)
  if type(ctx) ~= "table" then
    return
  end
  local now = getTime and getTime() or 0
  if now == 0 or now - (ctx._lastSyncTime or 0) >= SYNC_INTERVAL then
    ctx._lastSyncTime = now
    if syncFromParams(ctx) then
      syncVisualMode(ctx)
      refreshPad(ctx)
      refreshFilterGraph(ctx)
    end
  end
end

function FxSlotBehavior.repaint(ctx)
  bindVisualDots(ctx)
  syncFromParams(ctx)
  syncVisualMode(ctx)
  refreshPad(ctx)
  refreshFilterGraph(ctx)
end

return FxSlotBehavior
