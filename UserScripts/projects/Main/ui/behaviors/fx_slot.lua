-- FX Slot component behavior
-- XY pad + 2 knobs, each independently assignable to any effect parameter via dropdowns
local FxSlotBehavior = {}

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
}

local function getParamNames(fxType)
  return FX_PARAMS[fxType or 0] or { "Param 1", "Param 2" }
end

local function buildXYDisplay(ctx, w, h)
  local display = {}
  local xVal = ctx.xyX or 0.5
  local yVal = ctx.xyY or 0.5
  local dragging = ctx.dragging
  local col = ctx.accentColor or 0xff22d3ee
  local colDim = (0x18 << 24) | (col & 0x00ffffff)
  local colMid = (0x44 << 24) | (col & 0x00ffffff)

  -- Title inside graph (top-left)
  display[#display + 1] = {
    cmd = "drawText", x = 4, y = 2, w = w - 8, h = 16,
    text = "FX", color = col, fontSize = 11, align = "left", valign = "top",
  }

  -- Grid
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

local function populateDropdown(dropdown, names, selectedIdx)
  if not dropdown then return end
  if dropdown.setOptions then dropdown:setOptions(names) end
  local sel = math.min(selectedIdx or 1, #names)
  if sel < 1 then sel = 1 end
  if dropdown.setSelected then dropdown:setSelected(sel) end
  return sel
end

local function syncAllDropdowns(ctx)
  local names = getParamNames(ctx.fxType)

  ctx.xyXIdx = populateDropdown(ctx.widgets.xy_x_dropdown, names, ctx.xyXIdx or 1)
  ctx.xyYIdx = populateDropdown(ctx.widgets.xy_y_dropdown, names, ctx.xyYIdx or 2)
  ctx.knob1Idx = populateDropdown(ctx.widgets.knob1_dropdown, names, ctx.knob1Idx or 1)
  ctx.knob2Idx = populateDropdown(ctx.widgets.knob2_dropdown, names, ctx.knob2Idx or 2)

  ctx.xyXName = names[ctx.xyXIdx] or "X"
  ctx.xyYName = names[ctx.xyYIdx] or "Y"

  local function setKnobLabel(knob, label)
    if not knob then return end
    knob._label = label
    if knob._syncRetained then knob:_syncRetained() end
  end
  setKnobLabel(ctx.widgets.knob1, names[ctx.knob1Idx] or "P1")
  setKnobLabel(ctx.widgets.knob2, names[ctx.knob2Idx] or "P2")
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
    end

    if pad.node.setOnMouseDown then
      pad.node:setOnMouseDown(function(mx, my) ctx.dragging = true; applyXY(mx, my) end)
    end
    if pad.node.setOnMouseDrag then
      pad.node:setOnMouseDrag(function(mx, my) if ctx.dragging then applyXY(mx, my) end end)
    end
    if pad.node.setOnMouseUp then
      pad.node:setOnMouseUp(function(mx, my) ctx.dragging = false; refreshPad(ctx) end)
    end
  end

  local xyXDrop = ctx.widgets.xy_x_dropdown
  if xyXDrop then
    xyXDrop._onSelect = function(idx)
      ctx.xyXIdx = idx
      local names = getParamNames(ctx.fxType)
      ctx.xyXName = names[idx] or "X"
      refreshPad(ctx)
    end
  end
  local xyYDrop = ctx.widgets.xy_y_dropdown
  if xyYDrop then
    xyYDrop._onSelect = function(idx)
      ctx.xyYIdx = idx
      local names = getParamNames(ctx.fxType)
      ctx.xyYName = names[idx] or "Y"
      refreshPad(ctx)
    end
  end

  local k1Drop = ctx.widgets.knob1_dropdown
  if k1Drop then
    k1Drop._onSelect = function(idx)
      ctx.knob1Idx = idx
      local names = getParamNames(ctx.fxType)
      local k1 = ctx.widgets.knob1
      if k1 then k1._label = names[idx] or "P1"; if k1._syncRetained then k1:_syncRetained() end end
    end
  end
  local k2Drop = ctx.widgets.knob2_dropdown
  if k2Drop then
    k2Drop._onSelect = function(idx)
      ctx.knob2Idx = idx
      local names = getParamNames(ctx.fxType)
      local k2 = ctx.widgets.knob2
      if k2 then k2._label = names[idx] or "P2"; if k2._syncRetained then k2:_syncRetained() end end
    end
  end
end

function FxSlotBehavior.init(ctx)
  ctx.fxType = 0
  ctx.xyX = 0.5
  ctx.xyY = 0.5
  ctx.xyXIdx = 1
  ctx.xyYIdx = 2
  ctx.xyXName = "Rate"
  ctx.xyYName = "Depth"
  ctx.knob1Idx = 1
  ctx.knob2Idx = 2
  ctx.dragging = false
  ctx.accentColor = 0xff22d3ee
  setupInteraction(ctx)
  syncAllDropdowns(ctx)
  ctx._refreshPad = function() refreshPad(ctx) end
  refreshPad(ctx)
end

function FxSlotBehavior.onTypeChanged(ctx)
  syncAllDropdowns(ctx)
  refreshPad(ctx)
end

function FxSlotBehavior.resized(ctx, w, h)
  if (not w or w <= 0) and ctx.root and ctx.root.node then
    w = ctx.root.node:getWidth()
    h = ctx.root.node:getHeight()
  end
  if not w or w <= 0 then return end

  local widgets = ctx.widgets
  local pad = 10
  local gap = 6

  -- 50/50 split: XY on left, controls on right
  local split = math.floor(w / 2)
  local leftW = split - pad
  local rightX = split + gap
  local rightW = w - rightX - pad

  -- LEFT: Just the XY pad (fills entire left half, title drawn inside)
  local xyPad = widgets.xy_pad
  if xyPad then
    if xyPad.setBounds then xyPad:setBounds(pad, pad, leftW, h - pad * 2)
    elseif xyPad.node then xyPad.node:setBounds(pad, pad, leftW, h - pad * 2) end
  end

  -- RIGHT: ALL controls (type, XY dropdowns, knobs, knob dropdowns - title now inside XY pad)
  local dd = widgets.type_dropdown
  if dd then
    if dd.setBounds then dd:setBounds(rightX, pad, rightW, 18)
    elseif dd.node then dd.node:setBounds(rightX, pad, rightW, 18) end
  end

  -- XY X/Y dropdowns below type
  local xyX = widgets.xy_x_dropdown
  if xyX then
    if xyX.setBounds then xyX:setBounds(rightX, pad + 18 + gap, math.floor(rightW/2) - 2, 16)
    elseif xyX.node then xyX.node:setBounds(rightX, pad + 18 + gap, math.floor(rightW/2) - 2, 16) end
  end
  local xyY = widgets.xy_y_dropdown
  if xyY then
    if xyY.setBounds then xyY:setBounds(rightX + math.floor(rightW/2) + 2, pad + 18 + gap, math.floor(rightW/2) - 2, 16)
    elseif xyY.node then xyY.node:setBounds(rightX + math.floor(rightW/2) + 2, pad + 18 + gap, math.floor(rightW/2) - 2, 16) end
  end

  -- Knobs below XY dropdowns (Mix, P1, P2)
  local knobDdH = 14
  local knobY = pad + 18 + gap + 16 + gap
  local knobH = h - knobY - pad - knobDdH - gap
  local knobW = math.floor((rightW - 16) / 3)

  local mk = widgets.mix_knob
  if mk then
    if mk.setBounds then mk:setBounds(rightX, knobY, knobW, knobH)
    elseif mk.node then mk.node:setBounds(rightX, knobY, knobW, knobH) end
  end
  local k1 = widgets.knob1
  if k1 then
    if k1.setBounds then k1:setBounds(rightX + knobW + 8, knobY, knobW, knobH)
    elseif k1.node then k1.node:setBounds(rightX + knobW + 8, knobY, knobW, knobH) end
  end
  local k2 = widgets.knob2
  if k2 then
    if k2.setBounds then k2:setBounds(rightX + (knobW + 8) * 2, knobY, knobW, knobH)
    elseif k2.node then k2.node:setBounds(rightX + (knobW + 8) * 2, knobY, knobW, knobH) end
  end

  -- Knob parameter dropdowns at bottom (only for P1 and P2)
  local k1Drop = widgets.knob1_dropdown
  if k1Drop then
    if k1Drop.setBounds then k1Drop:setBounds(rightX + knobW + 8, h - pad - knobDdH, knobW, knobDdH)
    elseif k1Drop.node then k1Drop.node:setBounds(rightX + knobW + 8, h - pad - knobDdH, knobW, knobDdH) end
  end
  local k2Drop = widgets.knob2_dropdown
  if k2Drop then
    if k2Drop.setBounds then k2Drop:setBounds(rightX + (knobW + 8) * 2, h - pad - knobDdH, knobW, knobDdH)
    elseif k2Drop.node then k2Drop.node:setBounds(rightX + (knobW + 8) * 2, h - pad - knobDdH, knobW, knobDdH) end
  end

  refreshPad(ctx)
end

return FxSlotBehavior
