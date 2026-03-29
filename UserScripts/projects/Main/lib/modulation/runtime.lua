local Runtime = {}
Runtime.__index = Runtime

local EPSILON = 1.0e-6
local smoothTowards

local function copyTable(value)
  if type(value) ~= "table" then
    return value
  end
  local out = {}
  for key, entry in pairs(value) do
    out[key] = copyTable(entry)
  end
  return out
end

local function copyArray(values)
  local out = {}
  for i = 1, #(values or {}) do
    out[i] = copyTable(values[i])
  end
  return out
end

local function clamp(value, minValue, maxValue)
  if minValue ~= nil and value < minValue then
    value = minValue
  end
  if maxValue ~= nil and value > maxValue then
    value = maxValue
  end
  return value
end

local function numbersClose(a, b)
  return math.abs((tonumber(a) or 0) - (tonumber(b) or 0)) <= EPSILON
end

local function safeReadParam(readParam, path, fallback)
  if type(readParam) ~= "function" then
    return fallback
  end
  local value = readParam(path, fallback)
  if value == nil then
    return fallback
  end
  return tonumber(value) or fallback
end

local function signalNeutral(compiled)
  local coercion = compiled and compiled.coercionKind or "identity"
  if coercion == "bipolar_to_unipolar" or coercion == "bipolar_to_unipolar_then_stepped" then
    return 0.5
  end
  return 0.0
end

local function normalizeSourceInput(sourceEndpoint, rawValue)
  local value = tonumber(rawValue) or 0.0
  local signalKind = tostring(sourceEndpoint and sourceEndpoint.signalKind or "scalar")
  local minValue = tonumber(sourceEndpoint and sourceEndpoint.min)
  local maxValue = tonumber(sourceEndpoint and sourceEndpoint.max)

  if signalKind == "voice_bundle" then
    return value > 0.5 and 1.0 or 0.0
  end

  if signalKind == "trigger" or signalKind == "gate" then
    return value > 0.5 and 1.0 or 0.0
  end

  if signalKind == "scalar_bipolar" then
    if minValue ~= nil and maxValue ~= nil and maxValue > minValue then
      local normalized = ((value - minValue) / (maxValue - minValue)) * 2.0 - 1.0
      return clamp(normalized, -1.0, 1.0)
    end
    return clamp(value, -1.0, 1.0)
  end

  if minValue ~= nil and maxValue ~= nil and maxValue > minValue then
    value = (value - minValue) / (maxValue - minValue)
  end
  return clamp(value, 0.0, 1.0)
end

local function coerceSourceValue(compiled, rawValue)
  local value = tonumber(rawValue) or 0.0
  local coercion = compiled and compiled.coercionKind or "identity"

  if coercion == "identity" or coercion == "identity_bundle" or coercion == "scalar_to_stepped" then
    return value
  end
  if coercion == "bipolar_to_unipolar" or coercion == "bipolar_to_unipolar_then_stepped" then
    return (value + 1.0) * 0.5
  end
  if coercion == "unipolar_to_bipolar" then
    return value * 2.0 - 1.0
  end
  if coercion == "trigger_to_gate" or coercion == "threshold_gate" then
    return value > 0.5 and 1.0 or 0.0
  end
  if coercion == "bipolar_threshold_gate" then
    return value > 0.0 and 1.0 or 0.0
  end
  return value
end

local function mapAbsoluteValue(compiled, target, normalized)
  local amount = tonumber(compiled.amount) or 1.0
  local bias = tonumber(compiled.bias) or 0.0
  local mappingKind = tostring(compiled.mappingKind or "linear")
  local minValue = tonumber(target.min)
  local maxValue = tonumber(target.max)
  local value = normalized * amount + bias

  if mappingKind == "gate_threshold" then
    return value > 0.5 and 1.0 or 0.0
  end

  if mappingKind == "stepped_select" then
    local minIndex = minValue or 0
    local maxIndex = maxValue or minIndex
    local t = clamp(value, 0.0, 1.0)
    local index = minIndex + math.floor(t * ((maxIndex - minIndex) + 0.999999))
    return clamp(index, minIndex, maxIndex)
  end

  local t = clamp(value, 0.0, 1.0)
  if minValue == nil or maxValue == nil then
    return t
  end

  if mappingKind == "freq_exp" and minValue > 0 and maxValue > minValue then
    return minValue * ((maxValue / minValue) ^ t)
  end

  return minValue + t * (maxValue - minValue)
end

local function mapAddContribution(compiled, target, normalized)
  local amount = tonumber(compiled.amount) or 1.0
  local bias = tonumber(compiled.bias) or 0.0
  local mappingKind = tostring(compiled.mappingKind or "linear")
  local minValue = tonumber(target.min)
  local maxValue = tonumber(target.max)
  local neutral = signalNeutral(compiled)
  local centered = (normalized + bias) - neutral

  if mappingKind == "stepped_select" or mappingKind == "gate_threshold" then
    return 0.0
  end

  if minValue ~= nil and maxValue ~= nil then
    return centered * (maxValue - minValue) * amount
  end
  return centered * amount
end

local function sanitizeSourceValue(id, value)
  local numeric = tonumber(value) or 0.0
  local sourceId = tostring(id or "")
  if sourceId == "midi.pitch_bend" or sourceId:match("%.pitch_bend$") then
    return clamp(numeric, -1.0, 1.0)
  end
  if sourceId == "midi.note" then
    return clamp(numeric, 0.0, 127.0)
  end
  return clamp(numeric, 0.0, 1.0)
end

local function contextVoiceCount(ctx)
  local voices = ctx and ctx._voices or nil
  local count = type(voices) == "table" and #voices or 0
  if count <= 0 then
    return 1
  end
  return count
end

local function resolveVoiceScopedSamples(active, ctx, readParam, sourceValues)
  local compiled = active.compiled or {}
  local source = active.source or {}
  local sourceId = tostring(compiled.sourceHandle or "")
  local values = {}
  local voices = ctx and ctx._voices or {}
  local midiVoices = ctx and ctx._midiVoices or voices
  local voiceCount = contextVoiceCount(ctx)

  local customResolver = ctx and ctx._resolveVoiceModulationSource or nil
  if type(customResolver) == "function" then
    local customValues = customResolver(ctx, sourceId, source, voiceCount)
    if type(customValues) == "table" then
      return customValues
    end
  end

  local function append(voiceIndex, rawValue, extras)
    local entry = {
      voiceIndex = math.max(1, math.floor(tonumber(voiceIndex) or 1)),
      rawSourceValue = tonumber(rawValue) or 0.0,
    }
    if type(extras) == "table" then
      for key, value in pairs(extras) do
        entry[key] = copyTable(value)
      end
    end
    values[#values + 1] = entry
  end

  if sourceId == "adsr.voice" then
    for i = 1, voiceCount do
      local voice = voices[i]
      local active = voice and voice.active == true and tostring(voice.envelopeStage or "idle") ~= "idle"
      append(i, active and 1.0 or 0.0)
    end
    return values
  end

  if sourceId == "adsr.env" then
    for i = 1, voiceCount do
      local voice = voices[i]
      append(i, voice and voice.envelopeLevel or 0.0)
    end
    return values
  end

  if sourceId == "adsr.inv" then
    for i = 1, voiceCount do
      local voice = voices[i]
      append(i, 1.0 - (tonumber(voice and voice.envelopeLevel) or 0.0))
    end
    return values
  end

  if sourceId == "adsr.eoc" then
    for i = 1, voiceCount do
      append(i, 0.0)
    end
    return values
  end

  if sourceId == "midi.note" then
    for i = 1, voiceCount do
      local voice = midiVoices[i]
      append(i, voice and voice.note or tonumber(source.default) or 60.0)
    end
    return values
  end

  if sourceId == "midi.gate" then
    for i = 1, voiceCount do
      local voice = midiVoices[i]
      append(i, voice and voice.gate or 0.0)
    end
    return values
  end

  if sourceId == "midi.velocity" then
    for i = 1, voiceCount do
      local voice = midiVoices[i]
      append(i, voice and voice.targetAmp or 0.0)
    end
    return values
  end

  if sourceId == "midi.voice" then
    for i = 1, voiceCount do
      local voice = midiVoices[i]
      append(i, ((tonumber(voice and voice.gate) or 0.0) > 0.5) and 1.0 or 0.0, {
        bundleSnapshot = {
          note = tonumber(voice and voice.note) or 60.0,
          gate = ((tonumber(voice and voice.gate) or 0.0) > 0.5) and 1.0 or 0.0,
          noteGate = ((tonumber(voice and voice.gate) or 0.0) > 0.5) and 1.0 or 0.0,
          amp = math.max(0.0, tonumber(voice and voice.targetAmp) or 0.0),
          targetAmp = math.max(0.0, tonumber(voice and voice.targetAmp) or 0.0),
          currentAmp = math.max(0.0, tonumber(voice and voice.currentAmp) or tonumber(voice and voice.targetAmp) or 0.0),
          envelopeLevel = math.max(0.0, tonumber(voice and voice.envelopeLevel) or 0.0),
          envelopeStage = tostring(voice and voice.envelopeStage or (((tonumber(voice and voice.gate) or 0.0) > 0.5) and "sustain" or "idle")),
          active = type(voice) == "table" and (voice.active == true or ((tonumber(voice and voice.gate) or 0.0) > 0.5)),
          sourceVoiceIndex = i,
        },
      })
    end
    return values
  end

  if sourceId:match("^param_out:") then
    local path = type(source.meta) == "table" and tostring(source.meta.path or "") or sourceId:gsub("^param_out:", "")
    local value = path ~= "" and safeReadParam(readParam, path, tonumber(source.default) or 0.0) or tonumber(source.default) or 0.0
    for i = 1, voiceCount do
      append(i, value)
    end
    return values
  end

  local stored = tonumber(sourceValues and sourceValues[sourceId]) or 0.0
  for i = 1, voiceCount do
    append(i, stored)
  end
  return values
end

local function resolveVoiceSourceValues(active, ctx, readParam, sourceValues)
  local scoped = resolveVoiceScopedSamples(active, ctx, readParam, sourceValues)
  local compiled = active.compiled or {}
  local source = active.source or {}
  local sourceId = tostring(compiled.sourceHandle or "")
  local values = {}

  if sourceId == "adsr.env" or sourceId == "adsr.inv" then
    for i = 1, #scoped do
      local sample = scoped[i]
      local raw = tonumber(sample and sample.rawSourceValue) or 0.0
      if raw > 0.0 then
        values[#values + 1] = normalizeSourceInput(source, raw)
      end
    end
    if #values == 0 then
      values[1] = 0.0
    end
    return values
  end

  if #scoped == 0 then
    values[1] = 0.0
    return values
  end

  for i = 1, #scoped do
    local sample = scoped[i]
    values[i] = normalizeSourceInput(source, tonumber(sample and sample.rawSourceValue) or 0.0)
  end
  return values
end

local function resolveGlobalSourceValue(active, ctx, readParam, sourceValues)
  local compiled = active.compiled or {}
  local source = active.source or {}
  local sourceId = tostring(compiled.sourceHandle or "")

  if sourceId:match("^param_out:") then
    local path = type(source.meta) == "table" and tostring(source.meta.path or "") or sourceId:gsub("^param_out:", "")
    return normalizeSourceInput(source, safeReadParam(readParam, path, tonumber(source.default) or 0.0))
  end

  local customResolver = ctx and ctx._resolveControlModulationSource or nil
  if type(customResolver) == "function" then
    local resolved = customResolver(ctx, sourceId, source)
    if resolved ~= nil then
      return normalizeSourceInput(source, tonumber(resolved) or 0.0)
    end
  end

  return normalizeSourceInput(source, tonumber(sourceValues[sourceId]) or 0.0)
end

local function applyVoiceTarget(ctx, targetId, target, value, meta)
  local applier = ctx and ctx._applyVoiceModulationTarget or nil
  if type(applier) ~= "function" then
    return false
  end
  return applier(ctx, targetId, target, value, meta) == true
end

local function applySequentialVoiceBundleRoute(self, active, ctx, routeAmountAlpha, appliedTargets)
  local compiled = active.compiled or {}
  local target = active.target or {}
  local targetId = tostring(compiled.targetHandle or "")
  local sourceSamples = resolveVoiceScopedSamples(active, ctx, nil, self.sourceValues)

  for sampleIndex = 1, #sourceSamples do
    local sample = sourceSamples[sampleIndex]
    local rawSource = tonumber(sample and sample.rawSourceValue) or 0.0
    local normalized = coerceSourceValue(compiled, normalizeSourceInput(active.source or {}, rawSource))
    local voiceIndex = math.max(1, math.floor(tonumber(sample and sample.voiceIndex) or sampleIndex))
    local stateKey = string.format("%s#%d", targetId, voiceIndex)
    local state = self.targetStates[stateKey]
    local baseValue = tonumber((state and state.baseValue) or tonumber(target.default) or 0.0) or 0.0
    local routeId = tostring(compiled.routeId or "")
    local targetAmount = tonumber(compiled.amount) or 1.0
    local smoothedAmount = smoothTowards(self.routeAmountStates[routeId], targetAmount, routeAmountAlpha)
    self.routeAmountStates[routeId] = smoothedAmount
    local effectiveCompiled = copyTable(compiled)
    effectiveCompiled.amount = smoothedAmount
    local absoluteValue = mapAbsoluteValue(effectiveCompiled, target, normalized)
    local effective = effectiveCompiled.applyKind == "replace"
      and absoluteValue
      or (baseValue + mapAddContribution(effectiveCompiled, target, normalized))
    local addContribution = mapAddContribution(effectiveCompiled, target, normalized)
    local hasActiveInfluence = tostring(effectiveCompiled.applyKind or "") ~= "add"
      or math.abs(addContribution) > EPSILON

    effective = clamp(effective, tonumber(target.min), tonumber(target.max))
    local applied = applyVoiceTarget(ctx, targetId, target, effective, {
      source = "modulation_runtime",
      action = "apply",
      voiceIndex = voiceIndex,
      stateKey = stateKey,
      bundleSource = copyTable(active.source),
      bundleSourceId = compiled.sourceHandle,
      bundleSample = sample and copyTable(sample.bundleSnapshot) or nil,
    })

    if applied then
      state = state or {
        targetId = targetId,
        target = copyTable(target),
        voiceIndex = voiceIndex,
      }
      state.baseValue = baseValue
      state.modulationValue = effective - baseValue
      state.effectiveValue = effective
      state.currentValue = baseValue
      state.lastAppliedValue = effective
      state.pendingRestore = false
      state.lastHadInfluence = hasActiveInfluence
      state.contributors = { compiled.routeId }
      self.targetStates[stateKey] = state

      appliedTargets[#appliedTargets + 1] = {
        target = targetId,
        stateKey = stateKey,
        voiceIndex = voiceIndex,
        baseValue = baseValue,
        modulationValue = state.modulationValue,
        effectiveValue = effective,
        routes = {
          {
            routeId = compiled.routeId,
            source = compiled.sourceHandle,
            evalScope = compiled.evalScope,
            rawSourceValue = rawSource,
            normalizedSourceValue = normalized,
            sampleIndex = sampleIndex,
            voiceIndex = voiceIndex,
            applyKind = effectiveCompiled.applyKind,
            amount = smoothedAmount,
            absoluteValue = absoluteValue,
            resultingValue = effective,
          },
        },
      }
    end
  end
end

local function applyControlTarget(ctx, targetId, target, value, meta)
  local applier = ctx and ctx._applyControlModulationTarget or nil
  if type(applier) ~= "function" then
    return false
  end
  return applier(ctx, targetId, target, value, meta) == true
end

local function routeHandleModuleId(handle)
  local text = tostring(handle or "")
  if text == "" or text:match("^param_out:") then
    return nil
  end
  return text:match("^([^.]+)%.")
end

local function isVoiceBundleRoute(active)
  return tostring(active and active.compiled and active.compiled.evalScope or "") == "voice"
    and tostring(active and active.target and active.target.signalKind or "") == "voice_bundle"
end

local function orderActiveRoutes(activeRoutes)
  local orderedVoiceRoutes = {}
  local voiceRouteIndices = {}
  local voiceRoutes = {}

  for i = 1, #(activeRoutes or {}) do
    local active = activeRoutes[i]
    if isVoiceBundleRoute(active) then
      voiceRouteIndices[#voiceRouteIndices + 1] = i
      voiceRoutes[#voiceRoutes + 1] = active
    end
  end

  if #voiceRoutes <= 1 then
    return activeRoutes
  end

  local indegree = {}
  local edges = {}
  for i = 1, #voiceRoutes do
    indegree[i] = 0
    edges[i] = {}
  end

  for i = 1, #voiceRoutes do
    local upstreamTargetModule = routeHandleModuleId(voiceRoutes[i].compiled and voiceRoutes[i].compiled.targetHandle or voiceRoutes[i].route and voiceRoutes[i].route.target)
    for j = 1, #voiceRoutes do
      if i ~= j then
        local downstreamSourceModule = routeHandleModuleId(voiceRoutes[j].compiled and voiceRoutes[j].compiled.sourceHandle or voiceRoutes[j].route and voiceRoutes[j].route.source)
        if upstreamTargetModule ~= nil and upstreamTargetModule ~= "" and upstreamTargetModule == downstreamSourceModule then
          edges[i][#edges[i] + 1] = j
          indegree[j] = indegree[j] + 1
        end
      end
    end
  end

  local queue = {}
  for i = 1, #voiceRoutes do
    if indegree[i] == 0 then
      queue[#queue + 1] = i
    end
  end
  table.sort(queue)

  while #queue > 0 do
    local nextIndex = table.remove(queue, 1)
    orderedVoiceRoutes[#orderedVoiceRoutes + 1] = voiceRoutes[nextIndex]
    for edgeIndex = 1, #edges[nextIndex] do
      local downstreamIndex = edges[nextIndex][edgeIndex]
      indegree[downstreamIndex] = indegree[downstreamIndex] - 1
      if indegree[downstreamIndex] == 0 then
        queue[#queue + 1] = downstreamIndex
        table.sort(queue)
      end
    end
  end

  if #orderedVoiceRoutes ~= #voiceRoutes then
    return activeRoutes
  end

  local out = copyArray(activeRoutes)
  local orderedIndex = 1
  for i = 1, #voiceRouteIndices do
    out[voiceRouteIndices[i]] = orderedVoiceRoutes[orderedIndex]
    orderedIndex = orderedIndex + 1
  end
  return out
end

function Runtime.new(options)
  options = options or {}
  local self = setmetatable({}, Runtime)
  self.routes = {}
  self.activeRoutes = {}
  self.rejectedRoutes = {}
  self.targetStates = {}
  self.authoredValues = {}
  self.routeAmountStates = {}
  self.routeAmountSmoothing = tonumber(options.routeAmountSmoothing) or 0.15
  self.routeAmountTimeConstant = tonumber(options.routeAmountTimeConstant) or 0.10
  self.lastEvaluateTime = nil
  self.sourceValues = {
    ["midi.mod_wheel"] = 0.0,
    ["midi.pitch_bend"] = 0.0,
    ["midi.channel_pressure"] = 0.0,
    ["midi.note"] = 60.0,
    ["midi.velocity"] = 0.0,
  }
  self.lastActivation = nil
  self.lastEvaluation = nil
  return self
end

smoothTowards = function(current, target, alpha)
  local c = tonumber(current) or tonumber(target) or 0.0
  local t = tonumber(target) or c
  local a = clamp(tonumber(alpha) or 1.0, 0.0, 1.0)
  return c + (t - c) * a
end

local function resolveRouteAmountAlpha(self)
  local fallback = clamp(tonumber(self.routeAmountSmoothing) or 1.0, 0.0, 1.0)
  if type(_G.getTime) ~= "function" then
    return fallback
  end

  local now = tonumber(_G.getTime()) or 0.0
  local previous = tonumber(self.lastEvaluateTime)
  self.lastEvaluateTime = now
  if previous == nil then
    return fallback
  end

  local dt = clamp(now - previous, 0.0, 0.1)
  if dt <= 0.0 then
    return fallback
  end

  local tau = math.max(0.001, tonumber(self.routeAmountTimeConstant) or 0.10)
  return clamp(1.0 - math.exp(-dt / tau), 0.0, 1.0)
end

function Runtime:setRoutes(routes, compiler, endpointRegistry)
  local requestedRoutes = type(routes) == "table" and routes or {}
  local batch = compiler and compiler.compileRoutes and compiler:compileRoutes(requestedRoutes, endpointRegistry) or {
    totalCount = #requestedRoutes,
    okCount = 0,
    errorCount = #requestedRoutes,
    routes = {},
  }

  local activeRoutes = {}
  local rejected = {}
  local desiredTargets = {}
  local nextRouteAmountStates = {}

  for i = 1, #(batch.routes or {}) do
    local result = batch.routes[i]
    if result.ok ~= true then
      rejected[#rejected + 1] = {
        route = copyTable(result.route),
        errors = copyArray(result.errors),
        reason = "compile_failed",
      }
    elseif not result.compiled or (result.compiled.evalScope ~= "global" and result.compiled.evalScope ~= "voice_aggregate" and result.compiled.evalScope ~= "voice") then
      rejected[#rejected + 1] = {
        route = copyTable(result.route),
        compiled = copyTable(result.compiled),
        errors = {
          {
            code = "runtime_scope_unsupported",
            message = "runtime only supports evalScope='global', evalScope='voice_aggregate', or evalScope='voice'",
          },
        },
        reason = "runtime_scope_unsupported",
      }
    else
      local routeId = tostring(result.compiled.routeId or result.route.id or "")
      local targetAmount = tonumber(result.compiled.amount) or tonumber(result.route.amount) or 1.0
      local previousAmount = self.routeAmountStates[routeId]
      local active = {
        route = copyTable(result.route),
        compiled = copyTable(result.compiled),
        source = copyTable(result.source),
        target = copyTable(result.target),
        smoothedAmount = previousAmount ~= nil and tonumber(previousAmount) or targetAmount,
      }
      nextRouteAmountStates[routeId] = active.smoothedAmount
      activeRoutes[#activeRoutes + 1] = active
      desiredTargets[active.compiled.targetHandle] = true
    end
  end

  for targetId, state in pairs(self.targetStates) do
    local baseTargetId = tostring(state and state.targetId or targetId or "")
    local normalizedTargetId = baseTargetId:match("^(.-)#%d+$") or baseTargetId
    if desiredTargets[normalizedTargetId] ~= true then
      state.pendingRestore = true
    end
  end

  activeRoutes = orderActiveRoutes(activeRoutes)

  self.routes = copyArray(requestedRoutes)
  self.activeRoutes = activeRoutes
  self.rejectedRoutes = rejected
  self.routeAmountStates = nextRouteAmountStates
  self.lastActivation = {
    requestedCount = #requestedRoutes,
    compiledCount = batch.okCount or 0,
    activeCount = #activeRoutes,
    rejectedCount = #rejected,
    batch = copyTable(batch),
    rejectedRoutes = copyArray(rejected),
  }

  return copyTable(self.lastActivation)
end

function Runtime:clearRoutes()
  return self:setRoutes({}, nil, nil)
end

function Runtime:recordAuthoredValue(id, value, meta)
  local targetId = tostring(id or "")
  local numeric = tonumber(value)
  if targetId == "" or numeric == nil then
    return false
  end

  self.authoredValues[targetId] = numeric
  local state = self.targetStates[targetId]
  if state ~= nil then
    state.baseValue = numeric
  end

  self.lastAuthoredUpdate = {
    target = targetId,
    value = numeric,
    meta = copyTable(meta or {}),
  }
  return true
end

function Runtime:setSourceValue(id, value, meta)
  local sourceId = tostring(id or "")
  if sourceId == "" then
    return false
  end
  local sanitized = sanitizeSourceValue(sourceId, value)
  self.sourceValues[sourceId] = sanitized
  self.lastSourceUpdate = {
    id = sourceId,
    value = sanitized,
    meta = copyTable(meta or {}),
  }
  return true
end

function Runtime:updateRouteAmount(routeId, amount)
  local key = tostring(routeId or "")
  local nextAmount = tonumber(amount)
  if key == "" or nextAmount == nil then
    return false
  end

  local updated = false

  for i = 1, #self.routes do
    local route = self.routes[i]
    if tostring(route and route.id or "") == key then
      route.amount = nextAmount
      route.meta = type(route.meta) == "table" and route.meta or {}
      route.meta.modAmount = nextAmount
      updated = true
    end
  end

  for i = 1, #self.activeRoutes do
    local active = self.activeRoutes[i]
    if tostring(active and active.route and active.route.id or "") == key then
      if type(active.route) == "table" then
        active.route.amount = nextAmount
        active.route.meta = type(active.route.meta) == "table" and active.route.meta or {}
        active.route.meta.modAmount = nextAmount
      end
      if type(active.compiled) == "table" then
        active.compiled.amount = nextAmount
      end
      updated = true
      break
    end
  end

  return updated
end

function Runtime:onMidiEvent(event)
  if type(event) ~= "table" or event.type == nil then
    return
  end

  if Midi and event.type == Midi.NOTE_ON and (tonumber(event.data2) or 0) > 0 then
    self:setSourceValue("midi.note", tonumber(event.data1) or 0, { event = "note_on" })
    self:setSourceValue("midi.gate", 1.0, { event = "note_on" })
    self:setSourceValue("midi.velocity", (tonumber(event.data2) or 0) / 127.0, { event = "note_on" })
    return
  end

  if Midi and (event.type == Midi.NOTE_OFF or (event.type == Midi.NOTE_ON and (tonumber(event.data2) or 0) == 0)) then
    self:setSourceValue("midi.gate", 0.0, { event = "note_off" })
    self:setSourceValue("midi.velocity", 0.0, { event = "note_off" })
    return
  end

  if Midi and event.type == Midi.CONTROL_CHANGE then
    local cc = tonumber(event.data1) or -1
    local value = (tonumber(event.data2) or 0) / 127.0
    if cc == 1 then
      self:setSourceValue("midi.mod_wheel", value, { event = "cc", cc = cc })
    end
    return
  end

  if Midi and event.type == Midi.PITCH_BEND then
    local bend = (tonumber(event.data1) or 0) | (((tonumber(event.data2) or 0) << 7))
    local normalized = (bend - 8192.0) / 8192.0
    self:setSourceValue("midi.pitch_bend", normalized, { event = "pitch_bend" })
    return
  end

  if Midi and Midi.CHANNEL_PRESSURE and event.type == Midi.CHANNEL_PRESSURE then
    self:setSourceValue("midi.channel_pressure", (tonumber(event.data1) or 0) / 127.0, { event = "channel_pressure" })
    return
  end
end

function Runtime:evaluateAndApply(ctx, readParam, setPath)
  local evaluatedTargets = {}
  local evaluatedVoiceTargets = {}
  local appliedTargets = {}
  local restoredTargets = {}
  local routeAmountAlpha = resolveRouteAmountAlpha(self)

  for stateKey, state in pairs(self.targetStates) do
    if state.pendingRestore == true then
      local restoreValue = tonumber(self.authoredValues[stateKey]) or tonumber(state.baseValue)
      local restored = false
      if state.voiceIndex ~= nil then
        restored = applyVoiceTarget(ctx, state.targetId or stateKey, state.target or { id = state.targetId or stateKey }, restoreValue or 0.0, {
          source = "modulation_runtime",
          action = "restore",
          voiceIndex = state.voiceIndex,
          stateKey = stateKey,
        })
      elseif type(state.target) == "table" and type(state.target.meta) == "table" and tostring(state.target.meta.kind or "") == "control-target" then
        restored = applyControlTarget(ctx, state.targetId or stateKey, state.target or { id = state.targetId or stateKey }, restoreValue or tonumber(state.target and state.target.default) or 0.0, {
          source = "modulation_runtime",
          action = "restore",
          stateKey = stateKey,
        })
      elseif restoreValue ~= nil and type(setPath) == "function" then
        setPath(stateKey, restoreValue, {
          source = "modulation_runtime",
          action = "restore",
        })
        restored = true
      end
      if restored then
        restoredTargets[#restoredTargets + 1] = {
          target = state.targetId or stateKey,
          voiceIndex = state.voiceIndex,
          restoredValue = restoreValue,
        }
      end
      self.targetStates[stateKey] = nil
    end
  end

  for i = 1, #self.activeRoutes do
    local active = self.activeRoutes[i]
    local compiled = active.compiled
    local target = active.target or {}
    local targetId = compiled.targetHandle

    if compiled.evalScope == "voice" then
      if tostring(target.signalKind or "") == "voice_bundle" then
        applySequentialVoiceBundleRoute(self, active, ctx, routeAmountAlpha, appliedTargets)
      else
        local sourceSamples = resolveVoiceScopedSamples(active, ctx, readParam, self.sourceValues)
        for sampleIndex = 1, #sourceSamples do
          local sample = sourceSamples[sampleIndex]
          local rawSource = tonumber(sample and sample.rawSourceValue) or 0.0
          local normalized = coerceSourceValue(compiled, normalizeSourceInput(active.source or {}, rawSource))
          local voiceIndex = math.max(1, math.floor(tonumber(sample and sample.voiceIndex) or sampleIndex))
          local bucket = evaluatedVoiceTargets[targetId]
          if bucket == nil then
            bucket = {
              target = copyTable(target),
              byVoice = {},
            }
            evaluatedVoiceTargets[targetId] = bucket
          end
          local voiceBucket = bucket.byVoice[voiceIndex]
          if voiceBucket == nil then
            voiceBucket = { compiledRoutes = {} }
            bucket.byVoice[voiceIndex] = voiceBucket
          end
          voiceBucket.compiledRoutes[#voiceBucket.compiledRoutes + 1] = {
            routeId = compiled.routeId,
            source = compiled.sourceHandle,
            sourceEndpoint = copyTable(active.source),
            bundleSnapshot = sample and copyTable(sample.bundleSnapshot) or nil,
            evalScope = compiled.evalScope,
            rawSourceValue = rawSource,
            normalizedSourceValue = normalized,
            sampleIndex = sampleIndex,
            voiceIndex = voiceIndex,
            compiled = copyTable(compiled),
          }
        end
      end
    else
      local sourceSamples = {}
      if compiled.evalScope == "voice_aggregate" then
        sourceSamples = resolveVoiceSourceValues(active, ctx, readParam, self.sourceValues)
      else
        sourceSamples[1] = resolveGlobalSourceValue(active, ctx, readParam, self.sourceValues)
      end

      local bestSample = nil
      for sampleIndex = 1, #sourceSamples do
        local rawSource = tonumber(sourceSamples[sampleIndex]) or 0.0
        local normalized = coerceSourceValue(compiled, rawSource)
        if bestSample == nil or normalized > bestSample.normalizedSourceValue then
          bestSample = {
            rawSourceValue = rawSource,
            normalizedSourceValue = normalized,
            sampleIndex = sampleIndex,
          }
        end
      end

      if bestSample ~= nil then
        local bucket = evaluatedTargets[targetId]
        if bucket == nil then
          bucket = {
            target = copyTable(target),
            compiledRoutes = {},
          }
          evaluatedTargets[targetId] = bucket
        end

        bucket.compiledRoutes[#bucket.compiledRoutes + 1] = {
          routeId = compiled.routeId,
          source = compiled.sourceHandle,
          evalScope = compiled.evalScope,
          rawSourceValue = bestSample.rawSourceValue,
          normalizedSourceValue = bestSample.normalizedSourceValue,
          sampleIndex = bestSample.sampleIndex,
          compiled = copyTable(compiled),
        }
      end
    end
  end

  for targetId, bucket in pairs(evaluatedTargets) do
    local target = bucket.target
    local isControlTarget = type(target) == "table" and type(target.meta) == "table" and tostring(target.meta.kind or "") == "control-target"
    local currentValue = isControlTarget and (tonumber((self.targetStates[targetId] or {}).currentValue) or tonumber(target.default) or 0.0)
      or safeReadParam(readParam, targetId, tonumber(target.default) or 0.0)
    local authoredBaseValue = tonumber(self.authoredValues[targetId])
    local state = self.targetStates[targetId]
    if state == nil then
      state = {
        targetId = targetId,
        target = copyTable(target),
        baseValue = authoredBaseValue or currentValue,
        modulationValue = 0.0,
        effectiveValue = currentValue,
        currentValue = currentValue,
        lastAppliedValue = nil,
        pendingRestore = false,
        lastHadInfluence = false,
        contributors = {},
      }
      self.targetStates[targetId] = state
    elseif authoredBaseValue ~= nil then
      state.baseValue = authoredBaseValue
    end

    local hasActiveInfluence = false
    for influenceIndex = 1, #bucket.compiledRoutes do
      local influenceRoute = bucket.compiledRoutes[influenceIndex]
      local influenceCompiled = influenceRoute.compiled
      if tostring(influenceCompiled.applyKind or "") ~= "add"
        or math.abs(mapAddContribution(influenceCompiled, target, influenceRoute.normalizedSourceValue)) > EPSILON then
        hasActiveInfluence = true
        break
      end
    end

    if authoredBaseValue == nil
      and state.lastAppliedValue ~= nil
      and not numbersClose(currentValue, state.lastAppliedValue)
      and hasActiveInfluence == false
      and state.lastHadInfluence == false then
      state.baseValue = currentValue
    end

    local baseValue = tonumber(state.baseValue)
    if baseValue == nil then
      baseValue = currentValue
      state.baseValue = baseValue
    end

    local effective = baseValue
    local routeOutputs = {}
    local contributors = {}

    for routeIndex = 1, #bucket.compiledRoutes do
      local routeEval = bucket.compiledRoutes[routeIndex]
      local routeCompiled = routeEval.compiled
      local routeId = tostring(routeCompiled.routeId or "")
      local targetAmount = tonumber(routeCompiled.amount) or 1.0
      local smoothedAmount = smoothTowards(self.routeAmountStates[routeId], targetAmount, routeAmountAlpha)
      self.routeAmountStates[routeId] = smoothedAmount
      local effectiveCompiled = copyTable(routeCompiled)
      effectiveCompiled.amount = smoothedAmount
      local absoluteValue = mapAbsoluteValue(effectiveCompiled, target, routeEval.normalizedSourceValue)
      local nextEffective = effective
      if effectiveCompiled.applyKind == "replace" then
        nextEffective = absoluteValue
      else
        nextEffective = effective + mapAddContribution(effectiveCompiled, target, routeEval.normalizedSourceValue)
      end

      routeOutputs[#routeOutputs + 1] = {
        routeId = routeCompiled.routeId,
        source = routeCompiled.sourceHandle,
        evalScope = routeCompiled.evalScope,
        rawSourceValue = routeEval.rawSourceValue,
        normalizedSourceValue = routeEval.normalizedSourceValue,
        sampleIndex = routeEval.sampleIndex,
        applyKind = effectiveCompiled.applyKind,
        amount = smoothedAmount,
        absoluteValue = absoluteValue,
        resultingValue = nextEffective,
      }
      contributors[#contributors + 1] = routeCompiled.routeId
      effective = nextEffective
    end

    effective = clamp(effective, tonumber(target.min), tonumber(target.max))
    if isControlTarget then
      applyControlTarget(ctx, targetId, target, effective, {
        source = "modulation_runtime",
        action = "apply",
      })
    elseif type(setPath) == "function" then
      setPath(targetId, effective, {
        source = "modulation_runtime",
        action = "apply",
      })
    end

    state.modulationValue = effective - baseValue
    state.effectiveValue = effective
    state.currentValue = currentValue
    state.lastAppliedValue = effective
    state.pendingRestore = false
    state.lastHadInfluence = hasActiveInfluence
    state.contributors = contributors

    appliedTargets[#appliedTargets + 1] = {
      target = targetId,
      baseValue = baseValue,
      modulationValue = state.modulationValue,
      effectiveValue = effective,
      routes = routeOutputs,
    }
  end

  for targetId, bucket in pairs(evaluatedVoiceTargets) do
    local target = bucket.target
    for voiceIndex, voiceBucket in pairs(bucket.byVoice) do
      local stateKey = string.format("%s#%d", tostring(targetId or ""), math.max(1, math.floor(tonumber(voiceIndex) or 1)))
      local state = self.targetStates[stateKey]
      local baseValue = tonumber((state and state.baseValue) or tonumber(target.default) or 0.0) or 0.0
      local effective = baseValue
      local routeOutputs = {}
      local contributors = {}
      local hasActiveInfluence = false

      for routeIndex = 1, #voiceBucket.compiledRoutes do
        local routeEval = voiceBucket.compiledRoutes[routeIndex]
        local routeCompiled = routeEval.compiled
        local routeId = tostring(routeCompiled.routeId or "")
        local targetAmount = tonumber(routeCompiled.amount) or 1.0
        local smoothedAmount = smoothTowards(self.routeAmountStates[routeId], targetAmount, routeAmountAlpha)
        self.routeAmountStates[routeId] = smoothedAmount
        local effectiveCompiled = copyTable(routeCompiled)
        effectiveCompiled.amount = smoothedAmount
        local absoluteValue = mapAbsoluteValue(effectiveCompiled, target, routeEval.normalizedSourceValue)
        local nextEffective = effective
        if effectiveCompiled.applyKind == "replace" then
          nextEffective = absoluteValue
        else
          nextEffective = effective + mapAddContribution(effectiveCompiled, target, routeEval.normalizedSourceValue)
        end
        if tostring(effectiveCompiled.applyKind or "") ~= "add"
          or math.abs(mapAddContribution(effectiveCompiled, target, routeEval.normalizedSourceValue)) > EPSILON then
          hasActiveInfluence = true
        end

        routeOutputs[#routeOutputs + 1] = {
          routeId = routeCompiled.routeId,
          source = routeCompiled.sourceHandle,
          evalScope = routeCompiled.evalScope,
          rawSourceValue = routeEval.rawSourceValue,
          normalizedSourceValue = routeEval.normalizedSourceValue,
          sampleIndex = routeEval.sampleIndex,
          voiceIndex = routeEval.voiceIndex,
          applyKind = effectiveCompiled.applyKind,
          amount = smoothedAmount,
          absoluteValue = absoluteValue,
          resultingValue = nextEffective,
        }
        contributors[#contributors + 1] = routeCompiled.routeId
        effective = nextEffective
      end

      effective = clamp(effective, tonumber(target.min), tonumber(target.max))
      local bundleRoute = (#voiceBucket.compiledRoutes > 0) and voiceBucket.compiledRoutes[#voiceBucket.compiledRoutes] or nil
      local applied = applyVoiceTarget(ctx, targetId, target, effective, {
        source = "modulation_runtime",
        action = "apply",
        voiceIndex = math.max(1, math.floor(tonumber(voiceIndex) or 1)),
        stateKey = stateKey,
        bundleSource = bundleRoute and copyTable(bundleRoute.sourceEndpoint) or nil,
        bundleSourceId = bundleRoute and bundleRoute.source or nil,
        bundleSample = bundleRoute and copyTable(bundleRoute.bundleSnapshot) or nil,
      })
      if applied then
        state = state or {
          targetId = targetId,
          target = copyTable(target),
          voiceIndex = math.max(1, math.floor(tonumber(voiceIndex) or 1)),
        }
        state.baseValue = baseValue
        state.modulationValue = effective - baseValue
        state.effectiveValue = effective
        state.currentValue = baseValue
        state.lastAppliedValue = effective
        state.pendingRestore = false
        state.lastHadInfluence = hasActiveInfluence
        state.contributors = contributors
        self.targetStates[stateKey] = state

        appliedTargets[#appliedTargets + 1] = {
          target = targetId,
          stateKey = stateKey,
          voiceIndex = math.max(1, math.floor(tonumber(voiceIndex) or 1)),
          baseValue = baseValue,
          modulationValue = state.modulationValue,
          effectiveValue = effective,
          routes = routeOutputs,
        }
      end
    end
  end

  self.lastEvaluation = {
    activeRouteCount = #self.activeRoutes,
    appliedTargetCount = #appliedTargets,
    restoredTargetCount = #restoredTargets,
    appliedTargets = appliedTargets,
    restoredTargets = restoredTargets,
  }

  return copyTable(self.lastEvaluation)
end

function Runtime:debugSnapshot(readParam)
  local targetStates = {}
  for targetId, state in pairs(self.targetStates) do
    targetStates[#targetStates + 1] = {
      target = targetId,
      baseValue = state.baseValue,
      modulationValue = state.modulationValue,
      effectiveValue = state.effectiveValue,
      lastAppliedValue = state.lastAppliedValue,
      currentValue = safeReadParam(readParam, targetId, state.lastAppliedValue or state.baseValue or 0.0),
      pendingRestore = state.pendingRestore == true,
      lastHadInfluence = state.lastHadInfluence == true,
      contributors = copyArray(state.contributors),
    }
  end
  table.sort(targetStates, function(a, b)
    return tostring(a.target or "") < tostring(b.target or "")
  end)

  local activeRoutes = {}
  for i = 1, #self.activeRoutes do
    activeRoutes[i] = {
      route = copyTable(self.activeRoutes[i].route),
      compiled = copyTable(self.activeRoutes[i].compiled),
      source = copyTable(self.activeRoutes[i].source),
      target = copyTable(self.activeRoutes[i].target),
    }
  end

  return {
    activeRouteCount = #self.activeRoutes,
    sourceValues = copyTable(self.sourceValues),
    authoredValues = copyTable(self.authoredValues),
    activeRoutes = activeRoutes,
    rejectedRoutes = copyArray(self.rejectedRoutes),
    targetStates = targetStates,
    lastActivation = copyTable(self.lastActivation),
    lastEvaluation = copyTable(self.lastEvaluation),
    lastSourceUpdate = copyTable(self.lastSourceUpdate),
    lastAuthoredUpdate = copyTable(self.lastAuthoredUpdate),
  }
end

function Runtime:getTargetState(targetId, readParam)
  local key = tostring(targetId or "")
  local state = self.targetStates[key]
  if state == nil then
    return nil
  end
  return {
    target = key,
    baseValue = state.baseValue,
    modulationValue = state.modulationValue,
    effectiveValue = state.effectiveValue,
    currentValue = safeReadParam(readParam, key, state.effectiveValue or state.baseValue or 0.0),
    pendingRestore = state.pendingRestore == true,
    lastHadInfluence = state.lastHadInfluence == true,
    contributors = copyArray(state.contributors),
  }
end

return Runtime
