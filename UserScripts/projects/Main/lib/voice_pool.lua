-- VoicePool Module
-- Manages voice state and parameter dispatch for polyphonic synthesis
-- Extracted from midisynth_integration.lua

local VoicePool = {}

-- ============================================================================
-- Utility Functions
-- ============================================================================

local function clamp(value, lo, hi)
  local n = tonumber(value) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function clamp01(value)
  return clamp(value, 0.0, 1.0)
end

local function noteToFrequency(note)
  return 440.0 * (2.0 ^ ((tonumber(note) - 69.0) / 12.0))
end

-- ============================================================================
-- VoicePool Public API
-- ============================================================================

--- Creates a new VoicePool instance
-- @param ctx DSP context with primitives and graph
-- @param options Configuration table:
--   - count: number of voices (default 8)
--   - onVoiceCreated: callback(voice, index, ctx) for custom voice setup
--   - basePath: base parameter path (default "/midi/synth")
-- @return VoicePool instance
function VoicePool.new(ctx, options)
  options = options or {}
  local count = options.count or 8
  local basePath = options.basePath or "/midi/synth"
  
  local self = {
    -- Core
    ctx = ctx,
    count = count,
    basePath = basePath,
    
    -- Voice storage (populated by caller or onVoiceCreated)
    voices = {},
    
    -- Parameter path mappings
    freqPathToIndex = {},
    ampPathToIndex = {},
    gatePathToIndex = {},
    
    -- State tracking
    lastAmp = {},
    
    -- Callbacks
    onFrequencySet = options.onFrequencySet,
    onGateSet = options.onGateSet,
    onGateOn = options.onGateOn,
    onAmplitudeSet = options.onAmplitudeSet,
  }
  
  -- Initialize lastAmp array
  for i = 1, count do
    self.lastAmp[i] = 0.0
  end
  
  -- ==========================================================================
  -- Parameter Setters
  -- ==========================================================================
  
  --- Set voice frequency
  -- @param voiceIndex 1-based voice index
  -- @param frequency Frequency in Hz
  -- @param opts Additional options:
  --   - blendKeyTrack: 0=wave tracks, 1=sample tracks, 2=both
  --   - sampleRootNote: root note for non-tracking mode
  function self.setFrequency(voiceIndex, frequency, opts)
    opts = opts or {}
    local voice = self.voices[voiceIndex]
    if not voice then return end
    
    local f = clamp(tonumber(frequency) or 220.0, 20.0, 8000.0)
    voice.freq = f
    
    -- Calculate wave frequency based on keytracking
    local waveFreq = f
    if opts.blendKeyTrack == 1 then
      -- Mode 1: Wave stays at root note frequency
      local rootFreq = noteToFrequency(opts.sampleRootNote or 60)
      waveFreq = (rootFreq > 0) and rootFreq or 220.0
    end
    
    voice.osc:setFrequency(waveFreq)
    if voice.blendAddOsc then
      voice.blendAddOsc:setFrequency(waveFreq)
    end
    
    -- Notify callback for additional processing
    if self.onFrequencySet then
      self.onFrequencySet(voice, voiceIndex, f, waveFreq)
    end
  end
  
  --- Set voice gate
  -- @param voiceIndex 1-based voice index
  -- @param gateValue Gate value (0-1, >0.5 = on)
  -- @param opts Additional options:
  --   - stopOnGateOff: whether to stop sample playback on gate off
  function self.setGate(voiceIndex, gateValue, opts)
    opts = opts or {}
    local voice = self.voices[voiceIndex]
    if not voice then return end
    
    local g = (tonumber(gateValue) or 0.0) > 0.5 and 1.0 or 0.0
    voice.gate = g
    
    if g <= 0.5 then
      voice.syncPhase = 0.0
      
      -- Ramp down additive oscillators
      if voice.blendAddOsc then
        voice.blendAddOsc:setAmplitude(0.0)
      end
      if voice.sampleAdditive then
        voice.sampleAdditive:setAmplitude(0.0)
      end
      if voice.morphWaveAdditive then
        voice.morphWaveAdditive:setAmplitude(0.0)
      end
      
      -- Stop sample playback in additive/morph modes
      if opts.stopOnGateOff and voice.samplePlayback then
        voice.samplePlayback:stop()
      end
      
      voice.lastSampleAdditiveMix = 0.0
      voice.lastSampleAdditiveFreq = 0.0
    end
    
    -- Trigger ADSR if present
    if voice.adsr then
      voice.adsr:setGate(g > 0.5)
    end
    
    -- Handle gate on
    if g > 0.5 then
      if self.onGateOn then
        self.onGateOn(voice, voiceIndex, opts)
      end
      if voice.sampleAdditive and voice.sampleAdditive.resetPhases then
        voice.sampleAdditive:resetPhases()
      end
      if voice.morphWaveAdditive and voice.morphWaveAdditive.resetPhases then
        voice.morphWaveAdditive:resetPhases()
      end
    end
    
    if self.onGateSet then
      self.onGateSet(voice, voiceIndex, g)
    end
  end
  
  --- Set voice amplitude
  -- @param voiceIndex 1-based voice index
  -- @param amplitude Amplitude value (typically 0-0.5)
  function self.setAmplitude(voiceIndex, amplitude)
    local voice = self.voices[voiceIndex]
    if not voice then return end
    
    local amp = clamp(tonumber(amplitude) or 0, 0, 0.5)
    self.lastAmp[voiceIndex] = amp
    voice.amp = amp
    
    if self.onAmplitudeSet then
      self.onAmplitudeSet(voice, voiceIndex, amp)
    end
  end
  
  -- ==========================================================================
  -- Bulk Operations
  -- ==========================================================================
  
  --- Iterate over all voices
  function self.forEach(fn)
    for i = 1, self.count do
      fn(self.voices[i], i)
    end
  end
  
  --- Set additive parameters for all voices
  function self.setGlobalAdditive(partials, tilt, drift)
    for i = 1, self.count do
      local voice = self.voices[i]
      voice.additivePartials = partials
      voice.additiveTilt = tilt
      voice.additiveDrift = drift
      voice.osc:setAdditivePartials(partials)
      voice.osc:setAdditiveTilt(tilt)
      voice.osc:setAdditiveDrift(drift)
      if voice.blendAddOsc then
        voice.blendAddOsc:setAdditivePartials(partials)
        voice.blendAddOsc:setAdditiveTilt(tilt)
        voice.blendAddOsc:setAdditiveDrift(drift)
      end
    end
  end
  
  --- Set oscillator render mode for all voices
  function self.setGlobalOscMode(mode)
    for i = 1, self.count do
      self.voices[i].osc:setRenderMode(mode)
    end
  end
  
  --- Set waveform for all voices
  function self.setGlobalWaveform(waveform)
    for i = 1, self.count do
      local voice = self.voices[i]
      voice.waveform = waveform
      voice.osc:setWaveform(waveform)
      if voice.blendAddOsc then
        voice.blendAddOsc:setWaveform(waveform)
      end
    end
  end
  
  --- Set pulse width for all voices
  function self.setGlobalPulseWidth(pw)
    for i = 1, self.count do
      local voice = self.voices[i]
      voice.pulseWidth = pw
      voice.osc:setPulseWidth(pw)
      if voice.blendAddOsc then
        voice.blendAddOsc:setPulseWidth(pw)
      end
    end
  end
  
  --- Set drive parameters for all voices
  function self.setGlobalDrive(drive, shape, bias, mix)
    for i = 1, self.count do
      local voice = self.voices[i]
      voice.osc:setDrive(drive)
      voice.osc:setDriveShape(shape)
      voice.osc:setDriveBias(bias)
      voice.osc:setDriveMix(mix)
      if voice.blendAddOsc then
        voice.blendAddOsc:setDrive(drive)
        voice.blendAddOsc:setDriveShape(shape)
        voice.blendAddOsc:setDriveBias(bias)
        voice.blendAddOsc:setDriveMix(mix)
      end
    end
  end
  
  --- Set unison parameters for all voices
  function self.setGlobalUnison(unison, detune, spread)
    for i = 1, self.count do
      local voice = self.voices[i]
      voice.osc:setUnison(unison)
      voice.osc:setDetune(detune)
      voice.osc:setSpread(spread)
      if voice.blendAddOsc then
        voice.blendAddOsc:setUnison(unison)
        voice.blendAddOsc:setDetune(detune)
        voice.blendAddOsc:setSpread(spread)
      end
    end
  end
  
  -- ==========================================================================
  -- Path Registration
  -- ==========================================================================
  
  --- Register voice parameter paths
  -- @param registerParamFn Optional function(path, spec) to register parameters
  function self.registerVoicePaths(registerParamFn)
    for i = 1, self.count do
      local freqP = self.basePath .. "/voice/" .. i .. "/freq"
      local ampP = self.basePath .. "/voice/" .. i .. "/amp"
      local gateP = self.basePath .. "/voice/" .. i .. "/gate"
      
      self.freqPathToIndex[freqP] = i
      self.ampPathToIndex[ampP] = i
      self.gatePathToIndex[gateP] = i
      
      if registerParamFn then
        registerParamFn(freqP, { type = "f", min = 20, max = 8000, default = 220, description = "Voice frequency " .. i })
        registerParamFn(ampP, { type = "f", min = 0, max = 0.5, default = 0, description = "Voice amplitude " .. i })
        registerParamFn(gateP, { type = "f", min = 0, max = 1, default = 0, description = "Voice gate " .. i })
      end
    end
  end
  
  --- Resolve a parameter path to voice action
  -- @return action type ("freq", "gate", "amp") and voice index, or nil
  function self.resolvePath(path)
    local freqIdx = self.freqPathToIndex[path]
    if freqIdx then return "freq", freqIdx end
    
    local gateIdx = self.gatePathToIndex[path]
    if gateIdx then return "gate", gateIdx end
    
    local ampIdx = self.ampPathToIndex[path]
    if ampIdx then return "amp", ampIdx end
    
    return nil, nil
  end
  
  -- ==========================================================================
  -- State Queries
  -- ==========================================================================
  
  --- Get voice state
  function self.getVoiceState(voiceIndex)
    local voice = self.voices[voiceIndex]
    if not voice then return nil end
    return {
      gate = voice.gate,
      freq = voice.freq,
      amp = voice.amp,
      index = voice.index or voiceIndex,
    }
  end
  
  --- Get list of active (gated) voice indices
  function self.getActiveVoices()
    local active = {}
    for i = 1, self.count do
      if self.voices[i].gate > 0.5 then
        table.insert(active, i)
      end
    end
    return active
  end
  
  --- Get last amplitude for a voice
  function self.getLastAmp(voiceIndex)
    return self.lastAmp[voiceIndex] or 0.0
  end
  
  -- ==========================================================================
  -- Connections
  -- ==========================================================================
  
  --- Connect all voiceMix outputs to a mixer node
  function self.connectToMixer(mixNode)
    for i = 1, self.count do
      self.ctx.graph.connect(self.voices[i].voiceMix, mixNode, 0, (i - 1) * 2)
    end
  end
  
  --- Connect a noise source to all voice noise gains
  function self.connectNoiseSource(noiseGen)
    for i = 1, self.count do
      self.ctx.graph.connect(noiseGen, self.voices[i].noiseGain)
    end
  end
  
  -- ==========================================================================
  -- Cleanup
  -- ==========================================================================
  
  function self.cleanup()
    self.voices = {}
    self.freqPathToIndex = {}
    self.ampPathToIndex = {}
    self.gatePathToIndex = {}
    self.lastAmp = {}
  end
  
  return self
end

return VoicePool
