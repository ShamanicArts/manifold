local ModWidgetSync = require("ui.modulation_widget_sync")
local Ui = require("ui.dynamic_module_ui")

local RackBlendSimpleBehavior = {}

local SYNC_INTERVAL = 0.08
local TEMPLATE_BASE = "/midi/synth/rack/blend_simple/1"
local FALLBACK_MODULE_ID = "blend_simple_inst_1"
local MODE_NAMES = { "Mix", "Ring", "FM", "Sync" }
local MODE_DESCRIPTIONS = {
  "Crossfade between serial input A and auxiliary input B.",
  "Ring-modulate A with B, then blend dry and wet.",
  "Audio-rate FM-style delay modulation using B on A.",
  "Reset-style sync slicing driven by zero-crossings from B.",
}

local function setBounds(widget, x, y, w, h)
  x = math.floor(x)
  y = math.floor(y)
  w = math.max(1, math.floor(w))
  h = math.max(1, math.floor(h))
  if widget and widget.setBounds then
    widget:setBounds(x, y, w, h)
  elseif widget and widget.node and widget.node.setBounds then
    widget.node:setBounds(x, y, w, h)
  end
end

local function setWidgetVisible(widget, visible)
  if widget and widget.setVisible then
    widget:setVisible(visible == true)
  elseif widget and widget.node and widget.node.setVisible then
    widget.node:setVisible(visible == true)
  end
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

local function pathFor(ctx, suffix)
  return Ui.pathFor(ctx, TEMPLATE_BASE, FALLBACK_MODULE_ID, suffix)
end

local function syncView(ctx)
  local modeValue = math.floor(Ui.clamp(Ui.readParam(pathFor(ctx, "mode"), ctx.values.mode or 0), 0, 3) + 0.5)
  local blendAmountBase, blendAmountEffective, blendAmountState = ModWidgetSync.resolveValues(pathFor(ctx, "blendAmount"), ctx.values.blendAmount or 0.5, Ui.readParam)
  local blendModAmountBase, blendModAmountEffective, blendModAmountState = ModWidgetSync.resolveValues(pathFor(ctx, "blendModAmount"), ctx.values.blendModAmount or 0.5, Ui.readParam)
  local outputBase, outputEffective, outputState = ModWidgetSync.resolveValues(pathFor(ctx, "output"), ctx.values.output or 1.0, Ui.readParam)

  ctx.values.mode = modeValue
  ctx.values.blendAmount = Ui.clamp(blendAmountBase, 0.0, 1.0)
  ctx.values.blendModAmount = Ui.clamp(blendModAmountBase, 0.0, 1.0)
  ctx.values.output = Ui.clamp(outputBase, 0.0, 1.0)

  Ui.setOptions(ctx.widgets and ctx.widgets.mode_dropdown or nil, MODE_NAMES, modeValue + 1)
  ModWidgetSync.syncWidget(ctx.widgets and ctx.widgets.blendAmount_slider or nil, ctx.values.blendAmount, Ui.clamp(blendAmountEffective, 0.0, 1.0), blendAmountState)
  ModWidgetSync.syncWidget(ctx.widgets and ctx.widgets.blendModAmount_slider or nil, ctx.values.blendModAmount, Ui.clamp(blendModAmountEffective, 0.0, 1.0), blendModAmountState)
  ModWidgetSync.syncWidget(ctx.widgets and ctx.widgets.output_slider or nil, ctx.values.output, Ui.clamp(outputEffective, 0.0, 1.0), outputState)

  Ui.setText(ctx.widgets and ctx.widgets.status_label or nil, string.format("%s  •  %.0f%% blend / %.0f%% depth", MODE_NAMES[modeValue + 1], ctx.values.blendAmount * 100.0, ctx.values.blendModAmount * 100.0))
  Ui.setText(ctx.widgets and ctx.widgets.detail_label or nil, MODE_DESCRIPTIONS[modeValue + 1] or "")
end

local function bindControls(ctx)
  if ctx.widgets and ctx.widgets.mode_dropdown then
    ctx.widgets.mode_dropdown._onSelect = function(value)
      Ui.writeParam(pathFor(ctx, "mode"), math.floor(Ui.clamp((tonumber(value) or 1) - 1, 0, 3) + 0.5))
      syncView(ctx)
    end
  end
  if ctx.widgets and ctx.widgets.blendAmount_slider then
    ctx.widgets.blendAmount_slider._onChange = function(value)
      Ui.writeParam(pathFor(ctx, "blendAmount"), Ui.clamp(value, 0.0, 1.0))
      syncView(ctx)
    end
  end
  if ctx.widgets and ctx.widgets.blendModAmount_slider then
    ctx.widgets.blendModAmount_slider._onChange = function(value)
      Ui.writeParam(pathFor(ctx, "blendModAmount"), Ui.clamp(value, 0.0, 1.0))
      syncView(ctx)
    end
  end
  if ctx.widgets and ctx.widgets.output_slider then
    ctx.widgets.output_slider._onChange = function(value)
      Ui.writeParam(pathFor(ctx, "output"), Ui.clamp(value, 0.0, 1.0))
      syncView(ctx)
    end
  end
end

function RackBlendSimpleBehavior.init(ctx)
  ctx.values = { mode = 0, blendAmount = 0.5, blendModAmount = 0.5, output = 1.0 }
  bindControls(ctx)
  syncView(ctx)
end

function RackBlendSimpleBehavior.resized(ctx, w, h)
  if (not w or w <= 0) and ctx.root and ctx.root.node then
    w = ctx.root.node:getWidth()
    h = ctx.root.node:getHeight()
  end
  if not w or w <= 0 then
    return
  end

  local widgets = ctx.widgets or {}
  local pad = 12
  local rowGap = 6
  local titleH = 14
  local statusH = 12
  local controlH = 20
  local detailH = 22
  local contentW = math.max(96, w - pad * 2)

  local titleY = 10
  local statusY = titleY + titleH + 4
  local dropdownY = statusY + statusH + 8
  local slider1Y = dropdownY + controlH + 14
  local slider2Y = slider1Y + controlH + rowGap
  local slider3Y = slider2Y + controlH + rowGap
  local detailY = math.min(h - detailH - 12, slider3Y + controlH + 8)

  local compact = w < 300
  local ioWidget = widgets.io_label
  local dropdownW = compact and contentW or math.max(88, math.floor(contentW * 0.36))
  local ioX = pad + dropdownW + 8
  local ioW = math.max(1, (pad + contentW) - ioX)

  setBounds(widgets.title, pad, titleY, math.min(contentW, 120), titleH)
  setBounds(widgets.status_label, pad, statusY, contentW, statusH)
  setBounds(widgets.mode_dropdown, pad, dropdownY, dropdownW, controlH)
  setBounds(widgets.blendAmount_slider, pad, slider1Y, contentW, controlH)
  setBounds(widgets.blendModAmount_slider, pad, slider2Y, contentW, controlH)
  setBounds(widgets.output_slider, pad, slider3Y, contentW, controlH)
  setBounds(widgets.detail_label, pad, detailY, contentW, detailH)

  if ioWidget then
    setWidgetVisible(ioWidget, not compact)
    if not compact then
      setBounds(ioWidget, ioX, dropdownY + 4, ioW, 12)
    else
      setBounds(ioWidget, 0, 0, 1, 1)
    end
  end

  anchorDropdown(widgets.mode_dropdown, ctx.root)
end

function RackBlendSimpleBehavior.update(ctx)
  local now = type(getTime) == "function" and getTime() or 0
  if now == 0 or now - (ctx._lastSyncTime or 0) >= SYNC_INTERVAL then
    ctx._lastSyncTime = now
    syncView(ctx)
  end
end

return RackBlendSimpleBehavior
