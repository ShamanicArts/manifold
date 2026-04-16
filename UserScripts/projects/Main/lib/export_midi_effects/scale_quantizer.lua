local Runtime = require("scale_quantizer_runtime")

local M = {}

function M.create(deps)
  local ctx = deps.ctx
  local moduleId = tostring(deps.moduleId or "standalone_scale_quantizer_1")
  local voiceCount = math.max(1, math.floor(tonumber(deps.voiceCount) or 8))
  local readParam = deps.readParam
  local clamp = deps.clamp
  local round = deps.round
  local noteRouter = deps.noteRouter
  local makeVoiceBundle = deps.makeVoiceBundle
  local paramBase = tostring(deps.paramBase or "")

  Runtime.ensureDynamicRuntime(ctx)
  Runtime.resolveModuleState(ctx, moduleId, voiceCount)

  local sourceEndpoint = {
    meta = {
      specId = "scale_quantizer",
      portId = "voice",
      moduleId = moduleId,
    }
  }

  local function refreshRuntime(dt)
    Runtime.updateDynamicModules(ctx, tonumber(dt) or 0.0, readParam, voiceCount)
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

  local function resolveOutput(slot)
    local bundle = Runtime.resolveVoiceBundleSample(ctx, "scale_quantizer.voice", sourceEndpoint, slot.index, clamp)
    if type(bundle) ~= "table" then
      return nil
    end
    return math.max(0, math.min(127, round(bundle.note or slot.note or 60)))
  end

  local function remapHeldNotes(emit)
    local active = noteRouter.activeEntries()
    for i = 1, #active do
      local slot = active[i]
      if slot.outputNote ~= nil then
        emit.noteOff(slot.channel, slot.outputNote)
      end
    end

    refreshRuntime(0.0)

    for i = 1, #active do
      local slot = active[i]
      local nextNote = resolveOutput(slot)
      slot.outputNote = nextNote
      if nextNote ~= nil then
        emit.noteOn(slot.channel, nextNote, slot.velocity or 100)
      end
    end
  end

  local function releaseAll(emit)
    local released = noteRouter.clear()
    for i = 1, #released do
      local slot = released[i]
      if slot.outputNote ~= nil then
        emit.noteOff(slot.channel, slot.outputNote)
      end
      applySlot(slot, false)
    end
    refreshRuntime(0.0)
  end

  return {
    onParamChange = function(path, _value, emit)
      local text = tostring(path or "")
      if paramBase ~= "" and text:find(paramBase, 1, true) == 1 then
        remapHeldNotes(emit)
      else
        refreshRuntime(0.0)
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
          if evicted.outputNote ~= nil then
            emit.noteOff(evicted.channel, evicted.outputNote)
          end
          applySlot(evicted, false)
        end
        applySlot(slot, true)
        refreshRuntime(0.0)
        slot.outputNote = resolveOutput(slot)
        if slot.outputNote ~= nil then
          emit.noteOn(channel, slot.outputNote, velocity)
        end
        return
      end

      if Midi and (eventType == Midi.NOTE_OFF or (eventType == Midi.NOTE_ON and velocity <= 0)) then
        local released = noteRouter.noteOff(channel, note)
        if released ~= nil then
          if released.outputNote ~= nil then
            emit.noteOff(channel, released.outputNote)
          end
          applySlot(released, false)
          refreshRuntime(0.0)
        end
        return
      end

      if Midi and eventType == Midi.CONTROL_CHANGE and note == 123 then
        releaseAll(emit)
        return
      end

      emit.forwardEvent(event)
    end,

    process = function(dt, _emit)
      refreshRuntime(dt)
    end,
  }
end

return M
