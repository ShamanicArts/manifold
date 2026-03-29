-- FX Slot Panel Module
-- Owns MidiSynth-side FX slot UI wiring and pad refresh helpers.

local M = {}

function M.refreshPad(fxCtx)
  if not fxCtx then return end
  local pad = fxCtx.widgets and fxCtx.widgets.xy_pad
  if not pad or not pad.node then return end
  local w = pad.node:getWidth()
  local h = pad.node:getHeight()
  if w <= 0 or h <= 0 then return end
  if fxCtx._refreshPad then
    fxCtx._refreshPad()
  else
    pad.node:repaint()
  end
end

function M.bindSlot(ctx, slotNum, prefix, deps)
  deps = deps or {}
  local getScopedWidget = deps.getScopedWidget
  local getScopedBehavior = deps.getScopedBehavior
  local setPath = deps.setPath
  local fxParamPath = deps.fxParamPath
  local PATHS = deps.PATHS or {}

  local behavior = getScopedBehavior(ctx, prefix)
  local fxCtx = behavior and behavior.ctx or nil
  local fxModule = behavior and behavior.module or nil
  ctx["_fx" .. slotNum .. "Ctx"] = fxCtx
  ctx["_fx" .. slotNum .. "Module"] = fxModule

  local typeDrop = getScopedWidget(ctx, prefix .. ".type_dropdown")
  local mixKnob = getScopedWidget(ctx, prefix .. ".mix_knob")
  local paramWidgets = {
    getScopedWidget(ctx, prefix .. ".param1"),
    getScopedWidget(ctx, prefix .. ".param2"),
    getScopedWidget(ctx, prefix .. ".param3"),
    getScopedWidget(ctx, prefix .. ".param4"),
    getScopedWidget(ctx, prefix .. ".param5"),
  }

  local typePath = slotNum == 1 and PATHS.fx1Type or PATHS.fx2Type
  local mixPath = slotNum == 1 and PATHS.fx1Mix or PATHS.fx2Mix

  if typeDrop then
    typeDrop._onSelect = function(idx)
      setPath(typePath, idx - 1)
      if fxCtx then
        fxCtx.fxType = idx - 1
        if fxModule and fxModule.onTypeChanged then
          fxModule.onTypeChanged(fxCtx)
        end
      end
    end
  end

  if mixKnob then
    mixKnob._onChange = function(v)
      setPath(mixPath, v)
    end
  end

  for pi = 1, #paramWidgets do
    local widget = paramWidgets[pi]
    if widget then
      widget._onChange = function(v)
        setPath(fxParamPath(slotNum, pi), v)
      end
    end
  end

  if fxCtx then
    fxCtx._onXYChanged = function(xVal, yVal)
      setPath(fxParamPath(slotNum, fxCtx.xyXIdx or 1), xVal)
      setPath(fxParamPath(slotNum, fxCtx.xyYIdx or 2), yVal)
    end
  end
end

function M.bindSlots(ctx, deps)
  M.bindSlot(ctx, 1, ".fx1Component", deps)
  M.bindSlot(ctx, 2, ".fx2Component", deps)
end

return M
