-- Voice Manager Module
-- Extracted from midisynth.lua
-- Handles voice allocation, triggering, and envelope processing

local M = {}

-- Dependencies (provided via init)
local deps = {}
local VOICE_COUNT = 8
local VOICE_AMP_SEND_EPSILON = 0.0015
local VOICE_AMP_SEND_INTERVAL = 1.0 / 60.0

local function voiceFreqPath(index)
  return string.format("/midi/synth/voice/%d/freq", index)
end

local function voiceAmpPath(index)
  return string.format("/midi/synth/voice/%d/amp", index)
end

local function voiceGatePath(index)
  return string.format("/midi/synth/voice/%d/gate", index)
end

local function noteToFreq(note)
  return 440.0 * (2.0 ^ (((tonumber(note) or 69.0) - 69.0) / 12.0))
end

local function freqToNote(freq)
  if freq <= 0 then return 0 end
  return math.floor(69 + 12 * math.log(freq / 440.0) / math.log(2) + 0.5)
end

local function noteName(note)
  if not note then return "--" end
  local names = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }
  local name = names[(note % 12) + 1] or "?"
  local octave = math.floor(note / 12) - 1
  return name .. octave
end

local function clamp(value, minVal, maxVal)
  return math.max(minVal or 0, math.min(maxVal or 1, tonumber(value) or 0))
end

local function velocityToAmp(velocity)
  return clamp(0.03 + ((tonumber(velocity) or 0) / 127.0) * 0.37, 0.0, 0.40)
end

-- Calculate envelope for a single voice
local function calculateEnvelope(ctx, voiceIndex, dt)
  local voice = ctx._voices[voiceIndex]
  if not voice then return 0 end
  return deps.adsr_runtime and deps.adsr_runtime.advanceVoice(voice, ctx._adsr, dt) or 0
end

-- Update all voice envelopes
function M.updateEnvelopes(ctx, dt, now)
  local legacyGateConnected = deps.midiSynth._isLegacyOscillatorGateRouteConnected(ctx)
  local canonicalOscillatorConnected = deps.midiSynth._hasCanonicalOscillatorGateRoute(ctx)
  local rackOscAdsrSlots = deps.midiSynth._dynamicRackOscAdsrGateSlots(ctx)
  
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    if voice then
      local amp = calculateEnvelope(ctx, i, dt)
      voice.currentAmp = amp

      local sentAmp = voice.sentAmp or 0
      local elapsed = now - (voice.lastAmpPushTime or 0)
      local changedEnough = math.abs(amp - sentAmp) >= VOICE_AMP_SEND_EPSILON
      local atRestEdge = (amp <= VOICE_AMP_SEND_EPSILON and sentAmp > VOICE_AMP_SEND_EPSILON)

      if legacyGateConnected then
        if changedEnough and (elapsed >= VOICE_AMP_SEND_INTERVAL or atRestEdge) then
          voice.sentAmp = amp
          voice.lastAmpPushTime = now
          deps.setPath(voiceAmpPath(i), amp)
        end
      elseif canonicalOscillatorConnected then
        voice.sentAmp = 0
        voice.lastAmpPushTime = now
      else
        voice.sentAmp = 0
        voice.lastAmpPushTime = now
        deps.setPath(voiceAmpPath(i), 0)
        deps.setPath(voiceGatePath(i), 0)
      end

      for slotIndex = 1, #rackOscAdsrSlots do
        local slot = rackOscAdsrSlots[slotIndex]
        local gatePath = nil
        if slot.specId == "rack_sample" then
          gatePath = deps.ParameterBinder.dynamicSampleVoiceGatePath(slot.slotIndex, i)
        else
          gatePath = deps.ParameterBinder.dynamicOscillatorVoiceGatePath(slot.slotIndex, i)
        end
        deps.setPath(gatePath, amp, {
          source = "adsr_rackosc_parity",
          action = "implicit_env",
          moduleId = slot.moduleId,
          voiceIndex = i,
        })
      end
    end
  end
end

-- Choose which voice to use for a new note
function M.chooseVoice(ctx, note, velocity)
  local midiVoices = ctx._midiVoices or ctx._voices or {}
  
  -- First, try to find an inactive voice
  for i = 1, VOICE_COUNT do
    local voice = midiVoices[i]
    if not voice.active or voice.envelopeStage == "idle" then
      return i
    end
  end
  
  -- All voices active - use smart stealing
  -- Option 1: Steal voice in release stage with lowest level
  local bestReleaseIndex = nil
  local bestReleaseLevel = 999
  for i = 1, VOICE_COUNT do
    local voice = midiVoices[i]
    if voice.envelopeStage == "release" then
      if voice.envelopeLevel < bestReleaseLevel then
        bestReleaseLevel = voice.envelopeLevel
        bestReleaseIndex = i
      end
    end
  end
  if bestReleaseIndex then
    return bestReleaseIndex
  end
  
  -- Option 2: Steal oldest voice (highest stamp)
  local oldestIndex = 1
  local oldestStamp = midiVoices[1].stamp or 0
  for i = 2, VOICE_COUNT do
    local stamp = midiVoices[i].stamp or 0
    if stamp < oldestStamp then
      oldestStamp = stamp
      oldestIndex = i
    end
  end
  return oldestIndex
end

-- Trigger a voice
function M.triggerVoice(ctx, note, velocity)
  local gateConnected = deps.midiSynth._hasAnyOscillatorGateRoute(ctx)
  if not gateConnected then
    ctx._keyboardDirty = true
    ctx._triggerBlockedReason = "ADSR → source control missing"
    ctx._lastEvent = "Trigger blocked: ADSR → source control missing"
    return nil
  end

  ctx._triggerBlockedReason = nil

  local index = M.chooseVoice(ctx, note, velocity)
  local midiVoices = ctx._midiVoices or ctx._voices or {}
  local voice = midiVoices[index]
  
  ctx._voiceStamp = (ctx._voiceStamp or 0) + 1
  
  voice.active = true
  voice.note = note
  voice.stamp = ctx._voiceStamp
  voice.targetAmp = velocityToAmp(velocity)
  voice.currentAmp = 0
  voice.gate = 1
  voice.envelopeStage = "attack"
  voice.envelopeTime = 0
  voice.envelopeStartLevel = 0
  voice.envelopeLevel = 0
  voice.currentAmp = 0
  voice.sentAmp = -1
  voice.lastAmpPushTime = 0
  voice.freq = noteToFreq(note)
  
  deps.applyImplicitRackOscillatorKeyboardPitch(ctx, index, note)
  ctx._keyboardDirty = true
  
  return index
end

-- Release a voice
function M.releaseVoice(ctx, note)
  local midiVoices = ctx._midiVoices or ctx._voices or {}
  for i = 1, VOICE_COUNT do
    local voice = midiVoices[i]
    if voice.active and voice.note == note then
      voice.gate = 0
      voice.envelopeStage = "release"
      voice.envelopeTime = 0
      voice.envelopeStartLevel = voice.envelopeLevel or voice.targetAmp
      voice.lastAmpPushTime = 0
      ctx._keyboardDirty = true
    end
  end
end

-- Panic - stop all voices
function M.panicVoices(ctx)
  local midiVoices = ctx._midiVoices or {}
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    voice.active = false
    voice.note = nil
    voice.stamp = 0
    voice.gate = 0
    voice.targetAmp = 0
    voice.currentAmp = 0
    voice.sentAmp = 0
    voice.lastAmpPushTime = 0
    voice.envelopeStage = "idle"
    voice.envelopeLevel = 0
    voice.freq = 220
    deps.setPath(voiceAmpPath(i), 0)
    deps.setPath(voiceGatePath(i), 0)
    local midiVoice = midiVoices[i]
    if midiVoice then
      midiVoice.active = false
      midiVoice.note = nil
      midiVoice.stamp = 0
      midiVoice.gate = 0
      midiVoice.targetAmp = 0
      midiVoice.currentAmp = 0
      midiVoice.sentAmp = 0
      midiVoice.lastAmpPushTime = 0
      midiVoice.envelopeStage = "idle"
      midiVoice.envelopeLevel = 0
      midiVoice.freq = 220
    end
  end
  ctx._keyboardDirty = true
end

-- Get active voice count
function M.activeVoiceCount(ctx)
  local count = 0
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    if voice.active and voice.envelopeStage ~= "idle" then
      count = count + 1
    end
  end
  return count
end

-- Get voice summary for display
function M.voiceSummary(ctx)
  local notes = {}
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    if voice.active and voice.note and voice.envelopeStage ~= "idle" then
      notes[#notes + 1] = noteName(voice.note)
    end
  end
  if #notes == 0 then
    return "Voices: idle"
  end
  return "Voices: " .. table.concat(notes, "  ")
end

-- Utility functions
M.noteToFreq = noteToFreq
M.freqToNote = freqToNote
M.velocityToAmp = velocityToAmp
M.noteName = noteName

function M.attach(midiSynth)
  deps.midiSynth = midiSynth
  -- Expose utility functions to the host module
  midiSynth.noteToFreq = noteToFreq
  midiSynth.freqToNote = freqToNote
  midiSynth.velocityToAmp = velocityToAmp
  midiSynth.noteName = noteName
end

function M.init(options)
  options = options or {}
  deps.setPath = options.setPath
  deps.readParam = options.readParam
  deps.ParameterBinder = options.ParameterBinder or require("parameter_binder")
  deps.adsr_runtime = options.adsr_runtime or require("adsr_runtime")
  deps.applyImplicitRackOscillatorKeyboardPitch = options.applyImplicitRackOscillatorKeyboardPitch
end

return M