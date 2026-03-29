-- FX Slot Module
-- A swappable effects slot with dry/wet mixing.
-- This is a specific pattern, NOT generic container infrastructure.

local Utils = require("utils")

local M = {}

local function safeCreateEffect(def)
  if not def or type(def.create) ~= "function" then
    return nil
  end

  local ok, effect = pcall(def.create)
  if not ok or type(effect) ~= "table" then
    return nil
  end

  return effect
end

-- Create an FX slot with dry/wet mixing and lazy effect selection.
-- Only the selected effect is instantiated on demand.
-- @param ctx - DSP context with {primitives=..., graph=..., connectMixerInput=fn}
-- @param fxDefs - Effect definitions array from fx_definitions.buildFxDefs()
-- @param options - {defaultMix = 0.0, maxFxParams = 5}
-- @return FX slot table with methods and node references
function M.create(ctx, fxDefs, options)
  options = options or {}
  local defaultMix = Utils.clamp01(options.defaultMix or 0.0)
  local maxFxParams = options.maxFxParams or 5

  local slot = {
    select = 0,
    mix = defaultMix,
    input = ctx.primitives.PassthroughNode.new(2),
    dry = ctx.primitives.GainNode.new(2),
    wetMixer = ctx.primitives.MixerNode.new(),
    wetTrim = ctx.primitives.GainNode.new(2),
    output = ctx.primitives.MixerNode.new(),
    effects = {},
    effectParamValues = {},
    paramValues = {},
  }

  for effectIndex = 1, #fxDefs do
    local def = fxDefs[effectIndex]
    local values = {}
    for paramIdx = 1, maxFxParams do
      local param = def and def.params and def.params[paramIdx] or nil
      values[paramIdx] = (param and param.default) or 0.5
    end
    slot.effectParamValues[effectIndex] = values
  end

  for i = 1, maxFxParams do
    slot.paramValues[i] = 0.5
  end

  ctx.graph.connect(slot.input, slot.dry)
  ctx.connectMixerInput(slot.output, 1, slot.dry)
  ctx.connectMixerInput(slot.output, 2, slot.wetTrim)
  ctx.graph.connect(slot.wetMixer, slot.wetTrim)

  function slot.ensureInstance(effectIndex)
    local existing = slot.effects[effectIndex]
    if existing then
      return existing
    end

    local def = fxDefs[effectIndex]
    local effect = safeCreateEffect(def)
    if not effect then
      return nil
    end

    effect.def = def
    effect.gate = ctx.primitives.GainNode.new(2)
    effect.gate:setGain(0.0)

    ctx.graph.connect(slot.input, effect.input)
    ctx.graph.connect(effect.output, effect.gate)
    ctx.connectMixerInput(slot.wetMixer, effectIndex, effect.gate)

    slot.effects[effectIndex] = effect
    slot.applyAllParamsForEffect(effectIndex)
    return effect
  end

  function slot.applyAllParamsForEffect(effectIndex)
    local effect = slot.effects[effectIndex]
    local def = fxDefs[effectIndex]
    local values = slot.effectParamValues[effectIndex] or {}
    if not effect or not def or not def.params then
      return
    end

    for paramIdx, param in ipairs(def.params) do
      local value = values[paramIdx]
      if value == nil then
        value = param.default or 0.5
        values[paramIdx] = value
      end
      if param.setter then
        param.setter(effect.node, value, effect)
      end
    end
  end

  function slot.connectSource(source)
    if not source then return end
    ctx.graph.connect(source, slot.input)
  end

  function slot.applySelection(value)
    local selected = Utils.roundIndex(value or slot.select, #fxDefs - 1)
    local effectIndex = selected + 1
    local effect = slot.ensureInstance(effectIndex)
    if not effect then
      return false
    end

    slot.select = selected
    for i = 1, #fxDefs do
      local instance = slot.effects[i]
      if instance and instance.gate then
        instance.gate:setGain(i == effectIndex and 1.0 or 0.0)
      end
    end

    local values = slot.effectParamValues[effectIndex] or {}
    for paramIdx = 1, maxFxParams do
      slot.paramValues[paramIdx] = values[paramIdx] or 0.5
    end

    slot.applyAllParamsForEffect(effectIndex)
    return true
  end

  function slot.applyParam(paramIdx, value)
    local normalized = Utils.clamp01(tonumber(value) or 0.5)
    local effectIndex = slot.select + 1
    local values = slot.effectParamValues[effectIndex] or {}
    values[paramIdx] = normalized
    slot.effectParamValues[effectIndex] = values
    slot.paramValues[paramIdx] = normalized

    local effect = slot.effects[effectIndex]
    local def = fxDefs[effectIndex]
    local param = def and def.params and def.params[paramIdx] or nil
    if effect and param and param.setter then
      param.setter(effect.node, normalized, effect)
    end
    return true
  end

  function slot.applyAllParams()
    return slot.applyAllParamsForEffect(slot.select + 1)
  end

  function slot.applyMix(value)
    slot.mix = Utils.clamp01(tonumber(value) or slot.mix)
    slot.dry:setGain(1.0 - slot.mix)
    slot.wetTrim:setGain(slot.mix)
  end

  slot.applySelection(0)
  slot.applyMix(slot.mix)
  return slot
end

return M
