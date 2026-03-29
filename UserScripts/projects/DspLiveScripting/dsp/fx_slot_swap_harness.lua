local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function roundIndex(v, maxIndex)
  local n = math.floor((tonumber(v) or 0) + 0.5)
  if n < 0 then return 0 end
  if n > maxIndex then return maxIndex end
  return n
end

local function connectMixerInput(ctx, mixer, inputIndex, source)
  mixer:setInputCount(inputIndex)
  mixer:setGain(inputIndex, 1.0)
  mixer:setPan(inputIndex, 0.0)
  ctx.graph.connect(source, mixer, 0, inputIndex - 1)
end

local function applyEffectParam(param, effect, value)
  if not param or type(param.apply) ~= "function" or not effect then
    return false
  end

  local ok = pcall(param.apply, effect, value)
  if ok then
    return true
  end

  if type(value) == "number" then
    local rounded = math.floor(value + 0.5)
    ok = pcall(param.apply, effect, rounded)
    if ok then
      return true
    end
    ok = pcall(param.apply, effect, rounded ~= 0)
    if ok then
      return true
    end
  end

  if type(value) == "boolean" then
    ok = pcall(param.apply, effect, value and 1 or 0)
    if ok then
      return true
    end
  end

  return false
end

local function buildEffectDefs(P)
  return {
    {
      id = "gain",
      label = "Gain",
      create = function()
        local node = P.GainNode.new(2)
        node:setGain(0.8)
        return { input = node, output = node, node = node }
      end,
      params = {
        {
          name = "amount",
          type = "f",
          min = 0.0,
          max = 2.0,
          default = 0.8,
          apply = function(effect, value)
            effect.node:setGain(clamp(value, 0.0, 2.0))
          end,
        },
      },
    },
    {
      id = "width",
      label = "Width",
      create = function()
        local node = P.StereoWidenerNode.new()
        node:setWidth(1.6)
        node:setMonoLowFreq(160.0)
        node:setMonoLowEnable(true)
        return { input = node, output = node, node = node }
      end,
      params = {
        {
          name = "amount",
          type = "f",
          min = 0.0,
          max = 2.0,
          default = 1.6,
          apply = function(effect, value)
            effect.node:setWidth(clamp(value, 0.0, 2.0))
          end,
        },
      },
    },
  }
end

local function createLazySwapSlot(ctx, basePath, effectDefs)
  ctx.params.register(basePath .. "/select", {
    type = "f",
    min = 0.0,
    max = #effectDefs - 1,
    default = 0.0,
    deferGraphMutation = true,
  })

  local slot = {
    select = 0,
    effectDefs = effectDefs,
    effectState = {},
    instancesByIndex = {},
    input = ctx.primitives.PassthroughNode.new(2),
    output = ctx.primitives.MixerNode.new(),
    instantiateCount = 0,
  }

  for idx, def in ipairs(effectDefs) do
    local stateForDef = {}
    for _, param in ipairs(def.params or {}) do
      local path = basePath .. "/" .. def.id .. "/" .. param.name
      ctx.params.register(path, {
        type = param.type or "f",
        min = param.min,
        max = param.max,
        default = param.default,
      })
      stateForDef[param.name] = param.default
    end
    slot.effectState[idx] = stateForDef
  end

  function slot:applyStoredParams(effectIndex)
    local effect = self.instancesByIndex[effectIndex]
    local def = self.effectDefs[effectIndex]
    local values = self.effectState[effectIndex] or {}
    if not effect or not def then
      return
    end

    for _, param in ipairs(def.params or {}) do
      local value = values[param.name]
      if value == nil then
        value = param.default
        values[param.name] = value
      end
      applyEffectParam(param, effect, value)
    end
  end

  function slot:ensureInstance(effectIndex)
    local existing = self.instancesByIndex[effectIndex]
    if existing then
      return existing
    end

    local def = self.effectDefs[effectIndex]
    if not def or type(def.create) ~= "function" then
      return nil
    end

    print(string.format("[fxslot-harness] ensureInstance begin slot=%s effectIndex=%d id=%s", basePath, effectIndex, tostring(def.id)))
    local effect = def.create()
    print(string.format("[fxslot-harness] create done slot=%s effectIndex=%d", basePath, effectIndex))
    if type(effect) ~= "table" then
      return nil
    end

    effect.def = def
    effect.gate = ctx.primitives.GainNode.new(2)
    effect.gate:setGain(0.0)
    ctx.graph.connect(self.input, effect.input)
    ctx.graph.connect(effect.output, effect.gate)
    connectMixerInput(ctx, self.output, effectIndex, effect.gate)

    self.instancesByIndex[effectIndex] = effect
    self.instantiateCount = self.instantiateCount + 1
    self:applyStoredParams(effectIndex)
    print(string.format("[fxslot-harness] ensureInstance done slot=%s effectIndex=%d", basePath, effectIndex))
    return effect
  end

  function slot:applySelection(value)
    local selected = roundIndex(value or self.select, #self.effectDefs - 1)
    local effectIndex = selected + 1
    print(string.format("[fxslot-harness] applySelection begin slot=%s selected=%d", basePath, selected))
    local effect = self:ensureInstance(effectIndex)
    if not effect then
      return false
    end

    self.select = selected
    for idx = 1, #self.effectDefs do
      local instance = self.instancesByIndex[idx]
      if instance and instance.gate then
        instance.gate:setGain(idx == effectIndex and 1.0 or 0.0)
      end
    end
    print(string.format("[fxslot-harness] applySelection done slot=%s selected=%d", basePath, selected))
    return true
  end

  function slot:applyParam(path, value)
    if path == basePath .. "/select" then
      self.select = value
      return self:applySelection(value)
    end

    for idx, def in ipairs(self.effectDefs) do
      for _, param in ipairs(def.params or {}) do
        local paramPath = basePath .. "/" .. def.id .. "/" .. param.name
        if path == paramPath then
          local values = self.effectState[idx] or {}
          values[param.name] = value
          self.effectState[idx] = values
          if self.instancesByIndex[idx] then
            applyEffectParam(param, self.instancesByIndex[idx], value)
          end
          return true
        end
      end
    end

    return false
  end

  function slot:connectSource(source)
    if source then
      ctx.graph.connect(source, self.input)
    end
  end

  slot:ensureInstance(1)
  slot:applySelection(0)
  return slot
end

function buildPlugin(ctx)
  local effectDefs = buildEffectDefs(ctx.primitives)

  local hostInput = ctx.primitives.PassthroughNode.new(2, 0)
  local inputTrim = ctx.primitives.GainNode.new(2)
  inputTrim:setGain(1.0)
  ctx.graph.connect(hostInput, inputTrim)

  local slotA = createLazySwapSlot(ctx, "/test/fxslot/slotA", effectDefs)
  local slotB = createLazySwapSlot(ctx, "/test/fxslot/slotB", effectDefs)
  slotA:connectSource(inputTrim)
  slotB:connectSource(slotA.output)

  local master = ctx.primitives.GainNode.new(2)
  master:setGain(1.0)
  ctx.graph.connect(slotB.output, master)

  ctx.graph.markInput(hostInput)
  ctx.graph.markInput(inputTrim)
  ctx.graph.markMonitor(master)
  ctx.graph.markOutput(master)

  ctx.params.register("/test/fxslot/input_gain", {
    type = "f",
    min = 0.0,
    max = 2.0,
    default = 1.0,
  })

  return {
    description = "FX slot additive swap harness",
    onParamChange = function(path, value)
      if path == "/test/fxslot/input_gain" then
        inputTrim:setGain(clamp(value, 0.0, 2.0))
        return
      end
      if slotA:applyParam(path, value) then
        return
      end
      if slotB:applyParam(path, value) then
        return
      end
    end,
  }
end
