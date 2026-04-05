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

local function pathFor(ctx, suffix)
  return Ui.pathFor(ctx, TEMPLATE_BASE, FALLBACK_MODULE_ID, suffix)
end

local function syncView(ctx)
  local modeValue = math.floor(Ui.clamp(Ui.readParam(pathFor(ctx, "mode"), ctx.values.mode or 0), 0, 3) + 0.5)
  local amountBase, amountEffective, amountState = ModWidgetSync.resolveValues(pathFor(ctx, "amount"), ctx.values.amount or 0.5, Ui.readParam)
  local mixBase, mixEffective, mixState = ModWidgetSync.resolveValues(pathFor(ctx, "mix"), ctx.values.mix or 0.5, Ui.readParam)
  local outputBase, outputEffective, outputState = ModWidgetSync.resolveValues(pathFor(ctx, "output"), ctx.values.output or 1.0, Ui.readParam)

  ctx.values.mode = modeValue
  ctx.values.amount = Ui.clamp(amountBase, 0.0, 1.0)
  ctx.values.mix = Ui.clamp(mixBase, 0.0, 1.0)
  ctx.values.output = Ui.clamp(outputBase, 0.0, 1.0)

  Ui.setOptions(ctx.widgets and ctx.widgets.mode_dropdown or nil, MODE_NAMES, modeValue + 1)
  ModWidgetSync.syncWidget(ctx.widgets and ctx.widgets.amount_slider or nil, ctx.values.amount, Ui.clamp(amountEffective, 0.0, 1.0), amountState)
  ModWidgetSync.syncWidget(ctx.widgets and ctx.widgets.mix_slider or nil, ctx.values.mix, Ui.clamp(mixEffective, 0.0, 1.0), mixState)
  ModWidgetSync.syncWidget(ctx.widgets and ctx.widgets.output_slider or nil, ctx.values.output, Ui.clamp(outputEffective, 0.0, 1.0), outputState)

  Ui.setText(ctx.widgets and ctx.widgets.status_label or nil, string.format("%s  •  %.0f%% amt / %.0f%% mix", MODE_NAMES[modeValue + 1], ctx.values.amount * 100.0, ctx.values.mix * 100.0))
  Ui.setText(ctx.widgets and ctx.widgets.detail_label or nil, MODE_DESCRIPTIONS[modeValue + 1] or "")
end

local function bindControls(ctx)
  if ctx.widgets and ctx.widgets.mode_dropdown then
    ctx.widgets.mode_dropdown._onSelect = function(value)
      Ui.writeParam(pathFor(ctx, "mode"), math.floor(Ui.clamp((tonumber(value) or 1) - 1, 0, 3) + 0.5))
      syncView(ctx)
    end
  end
  if ctx.widgets and ctx.widgets.amount_slider then
    ctx.widgets.amount_slider._onChange = function(value)
      Ui.writeParam(pathFor(ctx, "amount"), Ui.clamp(value, 0.0, 1.0))
      syncView(ctx)
    end
  end
  if ctx.widgets and ctx.widgets.mix_slider then
    ctx.widgets.mix_slider._onChange = function(value)
      Ui.writeParam(pathFor(ctx, "mix"), Ui.clamp(value, 0.0, 1.0))
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
  ctx.values = { mode = 0, amount = 0.5, mix = 0.5, output = 1.0 }
  bindControls(ctx)
  syncView(ctx)
end

function RackBlendSimpleBehavior.update(ctx)
  local now = type(getTime) == "function" and getTime() or 0
  if now == 0 or now - (ctx._lastSyncTime or 0) >= SYNC_INTERVAL then
    ctx._lastSyncTime = now
    syncView(ctx)
  end
end

return RackBlendSimpleBehavior
