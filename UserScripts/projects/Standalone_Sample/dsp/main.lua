local function dirname(path)
  return (tostring(path or ""):gsub("/+$", ""):match("^(.*)/[^/]+$") or ".")
end

local function join(...)
  local parts = { ... }
  local out = ""
  for i = 1, #parts do
    local part = tostring(parts[i] or "")
    if part ~= "" then
      if out == "" then
        out = part
      else
        out = out:gsub("/+$", "") .. "/" .. part:gsub("^/+", "")
      end
    end
  end
  return out
end

local function appendPackageRoot(root)
  if type(root) ~= "string" or root == "" then
    return
  end
  local entry = root .. "/?.lua;" .. root .. "/?/init.lua"
  local current = tostring(package.path or "")
  if not current:find(entry, 1, true) then
    package.path = current == "" and entry or (current .. ";" .. entry)
  end
end

local scriptDir = tostring(__manifoldDspScriptDir or ".")
local projectRoot = dirname(scriptDir)
local mainRoot = join(projectRoot, "../Main")
appendPackageRoot(join(mainRoot, "lib"))
appendPackageRoot(join(mainRoot, "ui"))
appendPackageRoot(join(mainRoot, "dsp"))

local Utils = require("utils")
local SampleSynth = require("sample_synth")
local ParameterBinder = require("parameter_binder")
local RackSampleModule = require("rack_modules.sample")

local VOICE_COUNT = 8
local SAMPLE_SLOT_INDEX = 1
local DYNAMIC_SAMPLE_OUTPUT_TRIM = 0.25
local SAMPLE_PITCH_MODE_CLASSIC = 0
local SAMPLE_PITCH_MODE_PHASE_VOCODER = 1
local SAMPLE_PITCH_MODE_PHASE_VOCODER_HQ = 2

local function clamp(value, lo, hi)
  local n = tonumber(value) or 0.0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function noteToFrequency(note)
  return 440.0 * (2.0 ^ ((tonumber(note or 69.0) - 69.0) / 12.0))
end

local function velocityToAmp(velocity)
  return clamp((tonumber(velocity) or 0.0) / 127.0, 0.0, 1.0)
end

local function connectMixerInput(ctx)
  return function(mixer, inputIndex, source)
    mixer:setInputCount(inputIndex)
    mixer:setGain(inputIndex, 1.0)
    mixer:setPan(inputIndex, 0.0)
    ctx.graph.connect(source, mixer, 0, (inputIndex - 1) * 2)
  end
end

local function registerSchema(ctx, schema)
  if type(schema) ~= "table" or not (ctx and ctx.params and ctx.params.register) then
    return
  end
  for i = 1, #schema do
    local entry = schema[i]
    if type(entry) == "table" and entry.path and entry.spec then
      ctx.params.register(entry.path, entry.spec)
    end
  end
end

local function createNoteRouter(maxVoices)
  local slots = {}
  local byKey = {}
  local stamp = 0
  local voiceCount = math.max(1, math.floor(tonumber(maxVoices) or 8))

  local function keyFor(channel, note)
    return tostring(math.max(1, math.floor(tonumber(channel) or 1))) .. ":" .. tostring(math.max(0, math.min(127, math.floor(tonumber(note) or 0))))
  end

  for i = 1, voiceCount do
    slots[i] = {
      index = i,
      active = false,
      channel = 1,
      note = 60,
      velocity = 100,
      stamp = 0,
      key = nil,
    }
  end

  local router = {}

  function router.noteOn(channel, note, velocity)
    local key = keyFor(channel, note)
    local existing = byKey[key]
    if existing then
      stamp = stamp + 1
      existing.channel = math.max(1, math.floor(tonumber(channel) or 1))
      existing.note = math.max(0, math.min(127, math.floor(tonumber(note) or 0)))
      existing.velocity = math.max(0, math.min(127, math.floor(tonumber(velocity) or 0)))
      existing.stamp = stamp
      return existing, nil, true
    end

    local chosen = nil
    for i = 1, #slots do
      if slots[i].active ~= true then
        chosen = slots[i]
        break
      end
    end

    local evicted = nil
    if chosen == nil then
      chosen = slots[1]
      for i = 2, #slots do
        if (tonumber(slots[i].stamp) or 0) < (tonumber(chosen.stamp) or 0) then
          chosen = slots[i]
        end
      end
      evicted = {
        index = chosen.index,
        note = chosen.note,
        velocity = chosen.velocity,
        channel = chosen.channel,
      }
      if type(chosen.key) == "string" then
        byKey[chosen.key] = nil
      end
    end

    stamp = stamp + 1
    chosen.active = true
    chosen.channel = math.max(1, math.floor(tonumber(channel) or 1))
    chosen.note = math.max(0, math.min(127, math.floor(tonumber(note) or 0)))
    chosen.velocity = math.max(0, math.min(127, math.floor(tonumber(velocity) or 0)))
    chosen.stamp = stamp
    chosen.key = key
    byKey[key] = chosen
    return chosen, evicted, false
  end

  function router.noteOff(channel, note)
    local key = keyFor(channel, note)
    local slot = byKey[key]
    if slot == nil then
      return nil
    end
    byKey[key] = nil
    slot.active = false
    slot.key = nil
    return {
      index = slot.index,
      note = slot.note,
      velocity = slot.velocity,
      channel = slot.channel,
    }
  end

  function router.clear()
    local out = {}
    for i = 1, #slots do
      if slots[i].active == true then
        out[#out + 1] = {
          index = slots[i].index,
          note = slots[i].note,
          velocity = slots[i].velocity,
          channel = slots[i].channel,
        }
      end
      slots[i].active = false
      slots[i].key = nil
    end
    byKey = {}
    return out
  end

  return router
end

function buildPlugin(ctx)
  local hostInput = ctx.primitives.PassthroughNode.new(2, 0)
  local inputTrim = ctx.primitives.GainNode.new(2)
  inputTrim:setGain(1.0)

  local sidechainInput = ctx.primitives.PassthroughNode.new(2, 0)
  local sidechainTrim = ctx.primitives.GainNode.new(2)
  sidechainTrim:setGain(1.0)
  local sidechainCaptureInput = ctx.primitives.PassthroughNode.new(2, 0)

  local hostOutput = ctx.primitives.GainNode.new(2)
  hostOutput:setGain(1.0)

  ctx.graph.connect(hostInput, inputTrim)
  ctx.graph.connect(sidechainInput, sidechainTrim)
  ctx.graph.connect(sidechainTrim, sidechainCaptureInput)

  if ctx.graph.markInput then
    ctx.graph.markInput(hostInput)
    ctx.graph.markInput(inputTrim)
  end
  if ctx.graph.markSidechainInput then
    ctx.graph.markSidechainInput(sidechainInput)
    ctx.graph.markSidechainInput(sidechainTrim)
  end
  if ctx.graph.markMonitor then
    ctx.graph.markMonitor(hostOutput)
  end
  if ctx.graph.markOutput then
    ctx.graph.markOutput(hostOutput)
  end

  local function buildDynamicSampleSourceSpecs(slotInput)
    local sourceSpecs = {}
    if slotInput then
      sourceSpecs[#sourceSpecs + 1] = {
        id = 0,
        name = "Audio Input",
        node = slotInput,
        kind = "input",
      }
    end
    sourceSpecs[#sourceSpecs + 1] = {
      id = 1,
      name = "Sidechain",
      node = sidechainCaptureInput,
      kind = "sidechain",
    }
    return sourceSpecs
  end

  local sampleSlots = {}
  local sampleModule = RackSampleModule.create({
    ctx = ctx,
    slots = sampleSlots,
    Utils = Utils,
    SampleSynth = SampleSynth,
    ParameterBinder = ParameterBinder,
    noteToFrequency = noteToFrequency,
    connectMixerInput = connectMixerInput(ctx),
    voiceCount = VOICE_COUNT,
    outputTrim = DYNAMIC_SAMPLE_OUTPUT_TRIM,
    samplePitchModeClassic = SAMPLE_PITCH_MODE_CLASSIC,
    samplePitchModePhaseVocoder = SAMPLE_PITCH_MODE_PHASE_VOCODER,
    samplePitchModePhaseVocoderHQ = SAMPLE_PITCH_MODE_PHASE_VOCODER_HQ,
    buildSourceSpecs = buildDynamicSampleSourceSpecs,
    defaultSourceId = 0,
  })

  local sampleSlot = sampleModule.createSlot(SAMPLE_SLOT_INDEX)
  if sampleSlot.captureInput then
    ctx.graph.connect(inputTrim, sampleSlot.captureInput)
  end
  ctx.graph.connect(sampleSlot.output, hostOutput)

  registerSchema(ctx, ParameterBinder.buildDynamicSlotSchema("rack_sample", SAMPLE_SLOT_INDEX, {
    voiceCount = VOICE_COUNT,
    sampleSourceDefault = 0,
  }))

  local noteRouter = createNoteRouter(VOICE_COUNT)

  local function sampleGatePath(index)
    return ParameterBinder.dynamicSampleVoiceGatePath(SAMPLE_SLOT_INDEX, index)
  end

  local function sampleNotePath(index)
    return ParameterBinder.dynamicSampleVoiceVOctPath(SAMPLE_SLOT_INDEX, index)
  end

  local function hardStopVoice(index)
    sampleModule.applyPath(sampleGatePath(index), 0.0)
  end

  local function startVoice(index, note, velocity)
    hardStopVoice(index)
    sampleModule.applyPath(sampleNotePath(index), note)
    sampleModule.applyPath(sampleGatePath(index), velocityToAmp(velocity))
  end

  local function releaseVoice(index)
    sampleModule.applyPath(sampleGatePath(index), 0.0)
  end

  local function getDynamicSampleSlotPeaks(slotIndex, numBuckets)
    if math.max(1, math.floor(tonumber(slotIndex) or 1)) ~= SAMPLE_SLOT_INDEX then
      return {}
    end
    local buckets = math.max(32, math.floor(tonumber(numBuckets) or 128))
    local voice = sampleSlot.voices and sampleSlot.voices[1] or nil
    if voice and voice.samplePlayback and voice.samplePlayback.getPeaks then
      local ok, peaks = pcall(function()
        return voice.samplePlayback:getPeaks(buckets)
      end)
      if ok and type(peaks) == "table" and #peaks > 0 then
        return peaks
      end
    end
    local peaks = sampleSlot.cachedSamplePeaks or {}
    if #peaks == 0 then
      return {}
    end
    return SampleSynth.resamplePeaks(peaks, buckets)
  end

  local function getDynamicSampleSlotVoicePositions(slotIndex)
    if math.max(1, math.floor(tonumber(slotIndex) or 1)) ~= SAMPLE_SLOT_INDEX then
      return {}
    end
    local out = {}
    for i = 1, #(sampleSlot.voices or {}) do
      local voice = sampleSlot.voices[i]
      out[i] = (voice and voice.samplePlayback and voice.samplePlayback.getNormalizedPosition and voice.samplePlayback:getNormalizedPosition()) or 0.0
    end
    return out
  end

  local function getDynamicSampleSlotWriteOffset(slotIndex)
    if math.max(1, math.floor(tonumber(slotIndex) or 1)) ~= SAMPLE_SLOT_INDEX then
      return 0
    end
    if sampleSlot.sampleSynth and sampleSlot.sampleSynth.getSelectedSourceWriteOffset then
      return sampleSlot.sampleSynth.getSelectedSourceWriteOffset() or 0
    end
    return 0
  end

  local function getDynamicSampleSlotSelectedSourceName(slotIndex)
    if math.max(1, math.floor(tonumber(slotIndex) or 1)) ~= SAMPLE_SLOT_INDEX then
      return ""
    end
    local entry = sampleSlot.sampleSynth and sampleSlot.sampleSynth.getSelectedSourceEntry and sampleSlot.sampleSynth.getSelectedSourceEntry() or nil
    return tostring(entry and entry.name or "")
  end

  local function publishSampleUiHooks()
    _G.__midiSynthGetDynamicSampleSlotPeaks = getDynamicSampleSlotPeaks
    _G.__midiSynthGetDynamicSampleSlotVoicePositions = getDynamicSampleSlotVoicePositions
    _G.__midiSynthGetDynamicSampleSlotWriteOffset = getDynamicSampleSlotWriteOffset
    _G.__midiSynthGetDynamicSampleSlotSelectedSourceName = getDynamicSampleSlotSelectedSourceName
  end

  publishSampleUiHooks()

  return {
    description = "Manifold Sample",
    input = hostInput,
    output = hostOutput,
    onParamChange = function(path, value)
      if sampleModule.applyPath(path, value) then
        return
      end
    end,
    getDynamicSampleSlotPeaks = getDynamicSampleSlotPeaks,
    getDynamicSampleSlotVoicePositions = getDynamicSampleSlotVoicePositions,
    getDynamicSampleSlotWriteOffset = getDynamicSampleSlotWriteOffset,
    getDynamicSampleSlotSelectedSourceName = getDynamicSampleSlotSelectedSourceName,
    process = function(blockSize, sampleRate)
      if Midi and Midi.pollInputEvent then
        while true do
          local event = Midi.pollInputEvent()
          if event == nil then
            break
          end

          local eventType = tonumber(event.type or 0) or 0
          local channel = tonumber(event.channel or 1) or 1
          local data1 = tonumber(event.data1 or 0) or 0
          local data2 = tonumber(event.data2 or 0) or 0

          if Midi.NOTE_ON and eventType == Midi.NOTE_ON and data2 > 0 then
            local chosen, evicted = noteRouter.noteOn(channel, data1, data2)
            if evicted then
              hardStopVoice(evicted.index)
            end
            if chosen then
              startVoice(chosen.index, data1, data2)
            end
          elseif (Midi.NOTE_OFF and eventType == Midi.NOTE_OFF) or (Midi.NOTE_ON and eventType == Midi.NOTE_ON and data2 <= 0) then
            local released = noteRouter.noteOff(channel, data1)
            if released then
              releaseVoice(released.index)
            end
          elseif Midi.CONTROL_CHANGE and eventType == Midi.CONTROL_CHANGE and data1 == 123 then
            local released = noteRouter.clear()
            for i = 1, #released do
              releaseVoice(released[i].index)
            end
          end
        end
      end

      sampleModule.pollAnalysis(SAMPLE_SLOT_INDEX)
      sampleModule.updateReadbacks(SAMPLE_SLOT_INDEX)
      publishSampleUiHooks()
    end,
  }
end
