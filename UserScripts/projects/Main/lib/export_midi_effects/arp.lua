local Runtime = require("arp_runtime")

local M = {}

function M.create(deps)
  local ctx = deps.ctx
  local moduleId = tostring(deps.moduleId or "standalone_arp_1")
  local voiceCount = math.max(1, math.floor(tonumber(deps.voiceCount) or 8))
  local readParam = deps.readParam
  local clamp = deps.clamp
  local round = deps.round
  local noteRouter = deps.noteRouter
  local makeVoiceBundle = deps.makeVoiceBundle
  local paramBase = tostring(deps.paramBase or "")

  Runtime.ensureDynamicRuntime(ctx)
  local state = Runtime.resolveModuleState(ctx, moduleId, voiceCount)
  local previousOutputs = {}

  local function refreshRuntime(dt)
    Runtime.updateDynamicModules(ctx, tonumber(dt) or 0.0, readParam, voiceCount)
    state = Runtime.resolveModuleState(ctx, moduleId, voiceCount)
  end

  local function applySlot(slot, active)
    if type(slot) ~= "table" then
      return
    end
    if active then
      Runtime.applyInputVoice(ctx, moduleId, "voice_in", nil, {
        voiceIndex = slot.index,
        action = "apply",
        bundleSample = makeVoiceBundle(slot),
      }, voiceCount, clamp)
    else
      Runtime.applyInputVoice(ctx, moduleId, "voice_in", nil, {
        voiceIndex = slot.index,
        action = "restore",
      }, voiceCount, clamp)
    end
  end

  local function sourceSlotForVoice(voice)
    local sourceIndex = math.max(1, math.floor(tonumber(type(voice) == "table" and voice.sourceVoiceIndex or 1) or 1))
    return noteRouter.slotByIndex(sourceIndex)
  end

  local function snapshotOutputs()
    local out = {}
    local outputs = type(state) == "table" and state.outputs or {}
    for i = 1, voiceCount do
      local voice = outputs[i]
      local slot = sourceSlotForVoice(voice)
      out[i] = {
        gate = type(voice) == "table" and (tonumber(voice.gate) or 0.0) > 0.5 or false,
        note = type(voice) == "table" and math.max(0, math.min(127, round(voice.note or 60))) or nil,
        stepStamp = type(voice) == "table" and math.max(0, math.floor(tonumber(voice.lastStepStamp) or 0)) or 0,
        channel = math.max(1, math.floor(tonumber(slot and slot.channel or 1) or 1)),
        velocity = math.max(1, math.min(127, math.floor(tonumber(slot and slot.velocity or 100) or 100))),
      }
    end
    return out
  end

  local function syncOutputs(emit)
    local current = snapshotOutputs()
    for i = 1, voiceCount do
      local prev = previousOutputs[i] or { gate = false, note = nil, stepStamp = 0, channel = 1, velocity = 100 }
      local now = current[i] or { gate = false, note = nil, stepStamp = 0, channel = 1, velocity = 100 }
      local retrigger = now.gate and prev.gate and now.note == prev.note and now.stepStamp ~= prev.stepStamp
      local noteChanged = prev.note ~= now.note
      local gateChanged = prev.gate ~= now.gate

      if prev.gate and (gateChanged or noteChanged or retrigger) and prev.note ~= nil then
        emit.noteOff(prev.channel, prev.note)
      end
      if now.gate and (gateChanged or noteChanged or retrigger) and now.note ~= nil then
        emit.noteOn(now.channel, now.note, now.velocity)
      end
    end
    previousOutputs = current
  end

  local function releaseAll(emit)
    local released = noteRouter.clear()
    for i = 1, #released do
      applySlot(released[i], false)
    end
    for i = 1, #previousOutputs do
      local prev = previousOutputs[i]
      if type(prev) == "table" and prev.gate and prev.note ~= nil then
        emit.noteOff(prev.channel, prev.note)
      end
    end
    previousOutputs = {}
    refreshRuntime(0.0)
  end

  return {
    onParamChange = function(path, _value, emit)
      local text = tostring(path or "")
      if paramBase ~= "" and text:find(paramBase, 1, true) == 1 then
        refreshRuntime(0.0)
        syncOutputs(emit)
      end
    end,

    handleMidiEvent = function(event, emit)
      local eventType = tonumber(type(event) == "table" and event.type or 0) or 0
      local channel = tonumber(type(event) == "table" and event.channel or 1) or 1
      local note = tonumber(type(event) == "table" and event.data1 or 0) or 0
      local velocity = tonumber(type(event) == "table" and event.data2 or 0) or 0

      if Midi and eventType == Midi.NOTE_ON and velocity > 0 then
        local slot, evicted = noteRouter.noteOn(channel, note, velocity)
        if evicted then
          applySlot(evicted, false)
        end
        applySlot(slot, true)
        refreshRuntime(0.0)
        syncOutputs(emit)
        return
      end

      if Midi and (eventType == Midi.NOTE_OFF or (eventType == Midi.NOTE_ON and velocity <= 0)) then
        local released = noteRouter.noteOff(channel, note)
        if released ~= nil then
          applySlot(released, false)
          refreshRuntime(0.0)
          syncOutputs(emit)
        end
        return
      end

      if Midi and eventType == Midi.CONTROL_CHANGE and note == 123 then
        releaseAll(emit)
        return
      end

      emit.forwardEvent(event)
    end,

    process = function(dt, emit)
      refreshRuntime(dt)
      syncOutputs(emit)
    end,
  }
end

return M
