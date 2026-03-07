-- MIDI Synthesizer DSP Script
-- Full-featured polyphonic synthesizer with multiple waveforms, filters, and effects

local synth = {
  nodes = {},
  midiInput = nil,
  voiceNode = nil,
  effectsChain = {},
  params = {}
}

-- Default parameter values
local defaultParams = {
  -- Oscillator
  waveform = 0,        -- 0=sine, 1=saw, 2=square, 3=triangle, 4=noise, 5=pulse, 6=supersaw
  polyphony = 8,       -- Number of voices
  unison = 1,          -- Unison voices
  detune = 0.0,        -- Unison detune in cents
  spread = 0.5,        -- Stereo spread
  glide = 0.0,         -- Portamento time in seconds
  
  -- Envelope (ADSR)
  attack = 0.01,       -- Attack time in seconds
  decay = 0.1,         -- Decay time in seconds
  sustain = 0.7,       -- Sustain level (0-1)
  release = 0.3,       -- Release time in seconds
  
  -- Filter
  filterCutoff = 20000.0,  -- Filter cutoff frequency
  filterResonance = 0.707, -- Filter Q
  filterEnvAmount = 0.0,   -- Filter envelope amount
  
  -- Output
  volume = 0.7,        -- Master volume
  
  -- Effects
  reverbMix = 0.0,
  reverbSize = 0.5,
  reverbDamping = 0.5,
  delayMix = 0.0,
  delayTime = 0.25,
  delayFeedback = 0.3,
  chorusMix = 0.0,
  chorusRate = 0.5,
  chorusDepth = 0.5,
}

function synth.initParams(ctx)
  local p = ctx.params
  
  -- Register all parameters with defaults
  for key, value in pairs(defaultParams) do
    p[key] = value
    synth.params[key] = value
  end
  
  -- Create parameter change handlers
  p.onChange("waveform", function(v) 
    synth.params.waveform = v
    if synth.voiceNode then
      synth.voiceNode:setWaveform(math.floor(v))
    end
  end)
  
  p.onChange("polyphony", function(v)
    synth.params.polyphony = v
    if synth.voiceNode then
      synth.voiceNode:setPolyphony(math.floor(v))
    end
  end)
  
  p.onChange("unison", function(v)
    synth.params.unison = v
    if synth.voiceNode then
      synth.voiceNode:setUnison(math.floor(v))
    end
  end)
  
  p.onChange("detune", function(v)
    synth.params.detune = v
    if synth.voiceNode then
      synth.voiceNode:setDetune(v)
    end
  end)
  
  p.onChange("spread", function(v)
    synth.params.spread = v
    if synth.voiceNode then
      synth.voiceNode:setSpread(v)
    end
  end)
  
  p.onChange("glide", function(v)
    synth.params.glide = v
    if synth.midiInput then
      synth.midiInput:setPortamento(v)
    end
  end)
  
  p.onChange("attack", function(v)
    synth.params.attack = v
    if synth.voiceNode then
      synth.voiceNode:setAttack(v)
    end
  end)
  
  p.onChange("decay", function(v)
    synth.params.decay = v
    if synth.voiceNode then
      synth.voiceNode:setDecay(v)
    end
  end)
  
  p.onChange("sustain", function(v)
    synth.params.sustain = v
    if synth.voiceNode then
      synth.voiceNode:setSustain(v)
    end
  end)
  
  p.onChange("release", function(v)
    synth.params.release = v
    if synth.voiceNode then
      synth.voiceNode:setRelease(v)
    end
  end)
  
  p.onChange("filterCutoff", function(v)
    synth.params.filterCutoff = v
    if synth.voiceNode then
      synth.voiceNode:setFilterCutoff(v)
    end
  end)
  
  p.onChange("filterResonance", function(v)
    synth.params.filterResonance = v
    if synth.voiceNode then
      synth.voiceNode:setFilterResonance(v)
    end
  end)
  
  p.onChange("filterEnvAmount", function(v)
    synth.params.filterEnvAmount = v
    if synth.voiceNode then
      synth.voiceNode:setFilterEnvAmount(v)
    end
  end)
  
  p.onChange("volume", function(v)
    synth.params.volume = v
    if synth.nodes.masterGain then
      synth.nodes.masterGain:setGain(v)
    end
  end)
  
  p.onChange("reverbMix", function(v)
    synth.params.reverbMix = v
    if synth.effectsChain.reverb then
      synth.effectsChain.reverb:setMix(v)
    end
  end)
  
  p.onChange("reverbSize", function(v)
    synth.params.reverbSize = v
    if synth.effectsChain.reverb then
      synth.effectsChain.reverb:setRoomSize(v)
    end
  end)
  
  p.onChange("reverbDamping", function(v)
    synth.params.reverbDamping = v
    if synth.effectsChain.reverb then
      synth.effectsChain.reverb:setDamping(v)
    end
  end)
  
  p.onChange("delayMix", function(v)
    synth.params.delayMix = v
    if synth.effectsChain.delay then
      synth.effectsChain.delay:setMix(v)
    end
  end)
  
  p.onChange("delayTime", function(v)
    synth.params.delayTime = v
    if synth.effectsChain.delay then
      synth.effectsChain.delay:setDelayTime(v)
    end
  end)
  
  p.onChange("delayFeedback", function(v)
    synth.params.delayFeedback = v
    if synth.effectsChain.delay then
      synth.effectsChain.delay:setFeedback(v)
    end
  end)
  
  p.onChange("chorusMix", function(v)
    synth.params.chorusMix = v
    if synth.effectsChain.chorus then
      synth.effectsChain.chorus:setMix(v)
    end
  end)
  
  p.onChange("chorusRate", function(v)
    synth.params.chorusRate = v
    if synth.effectsChain.chorus then
      synth.effectsChain.chorus:setRate(v)
    end
  end)
  
  p.onChange("chorusDepth", function(v)
    synth.params.chorusDepth = v
    if synth.effectsChain.chorus then
      synth.effectsChain.chorus:setDepth(v)
    end
  end)
end

function buildPlugin(ctx)
  -- Initialize parameters
  synth.initParams(ctx)
  
  local graph = ctx.graph
  local nodes = {}
  
  -- MIDI Input Node (receives MIDI from host)
  local midiInput = graph:addNode("MidiInput", "midi_input")
  midiInput:setChannelFilter(-1)  -- All channels
  midiInput:setOmniMode(true)
  midiInput:setMonophonic(false)
  midiInput:setPortamento(synth.params.glide)
  nodes.midiInput = midiInput
  synth.midiInput = midiInput
  
  -- Polyphonic Voice Node
  local voiceNode = graph:addNode("MidiVoice", "voice")
  voiceNode:setWaveform(synth.params.waveform)
  voiceNode:setPolyphony(synth.params.polyphony)
  voiceNode:setAttack(synth.params.attack)
  voiceNode:setDecay(synth.params.decay)
  voiceNode:setSustain(synth.params.sustain)
  voiceNode:setRelease(synth.params.release)
  voiceNode:setFilterCutoff(synth.params.filterCutoff)
  voiceNode:setFilterResonance(synth.params.filterResonance)
  voiceNode:setFilterEnvAmount(synth.params.filterEnvAmount)
  voiceNode:setEnabled(true)
  voiceNode:setUnison(synth.params.unison)
  voiceNode:setDetune(synth.params.detune)
  voiceNode:setSpread(synth.params.spread)
  nodes.voice = voiceNode
  synth.voiceNode = voiceNode
  
  -- Connect MIDI input to voice node
  midiInput:connectToVoiceNode(voiceNode)
  
  -- Effects Chain
  local currentOutput = voiceNode
  
  -- Chorus
  local chorus = graph:addNode("Chorus", "chorus")
  chorus:setMix(synth.params.chorusMix)
  chorus:setRate(synth.params.chorusRate)
  chorus:setDepth(synth.params.chorusDepth)
  graph:connect(currentOutput, 0, chorus, 0)
  currentOutput = chorus
  nodes.chorus = chorus
  synth.effectsChain.chorus = chorus
  
  -- Delay
  local delay = graph:addNode("StereoDelay", "delay")
  delay:setMix(synth.params.delayMix)
  delay:setDelayTime(synth.params.delayTime)
  delay:setFeedback(synth.params.delayFeedback)
  graph:connect(currentOutput, 0, delay, 0)
  currentOutput = delay
  nodes.delay = delay
  synth.effectsChain.delay = delay
  
  -- Reverb
  local reverb = graph:addNode("Reverb", "reverb")
  reverb:setMix(synth.params.reverbMix)
  reverb:setRoomSize(synth.params.reverbSize)
  reverb:setDamping(synth.params.reverbDamping)
  graph:connect(currentOutput, 0, reverb, 0)
  currentOutput = reverb
  nodes.reverb = reverb
  synth.effectsChain.reverb = reverb
  
  -- Filter (post-effects)
  local filter = graph:addNode("Filter", "filter")
  filter:setType(0)  -- Lowpass
  filter:setCutoff(20000.0)
  filter:setResonance(0.707)
  graph:connect(currentOutput, 0, filter, 0)
  currentOutput = filter
  nodes.filter = filter
  
  -- Compressor
  local compressor = graph:addNode("Compressor", "compressor")
  compressor:setThreshold(-12.0)
  compressor:setRatio(4.0)
  compressor:setAttack(0.01)
  compressor:setRelease(0.1)
  compressor:setMakeupGain(0.0)
  graph:connect(currentOutput, 0, compressor, 0)
  currentOutput = compressor
  nodes.compressor = compressor
  
  -- Limiter
  local limiter = graph:addNode("Limiter", "limiter")
  limiter:setThreshold(-1.0)
  limiter:setRelease(0.1)
  graph:connect(currentOutput, 0, limiter, 0)
  currentOutput = limiter
  nodes.limiter = limiter
  
  -- Master Gain
  local masterGain = graph:addNode("Gain", "master_gain")
  masterGain:setGain(synth.params.volume)
  graph:connect(currentOutput, 0, masterGain, 0)
  currentOutput = masterGain
  nodes.masterGain = masterGain
  
  -- Spectrum Analyzer (for visualization)
  local spectrum = graph:addNode("SpectrumAnalyzer", "spectrum")
  spectrum:setNumBins(32)
  graph:connect(masterGain, 0, spectrum, 0)
  nodes.spectrum = spectrum
  
  -- Meter (for output level)
  local meter = graph:addNode("Meter", "meter")
  graph:connect(masterGain, 0, meter, 0)
  nodes.meter = meter
  
  -- Connect to output
  graph:connectToOutput(masterGain, 0)
  
  synth.nodes = nodes
  
  -- Register MIDI callbacks for monitoring
  if Midi and Midi.onNoteOn then
    Midi.onNoteOn(function(channel, note, velocity, timestamp)
      -- Broadcast to UI via OSC or state
      ctx.state.lastNote = note
      ctx.state.lastVelocity = velocity
      ctx.state.lastNoteTime = timestamp
    end)
    
    Midi.onNoteOff(function(channel, note, timestamp)
      ctx.state.lastNoteOff = note
      ctx.state.lastNoteOffTime = timestamp
    end)
    
    Midi.onControlChange(function(channel, cc, value, timestamp)
      ctx.state.lastCC = {channel = channel, cc = cc, value = value, time = timestamp}
    end)
  end
  
  return {
    -- Expose parameters for automation
    params = {
      "/midi/synth/waveform" = { min = 0, max = 6, default = defaultParams.waveform },
      "/midi/synth/polyphony" = { min = 1, max = 16, default = defaultParams.polyphony },
      "/midi/synth/attack" = { min = 0.001, max = 10.0, default = defaultParams.attack },
      "/midi/synth/decay" = { min = 0.001, max = 10.0, default = defaultParams.decay },
      "/midi/synth/sustain" = { min = 0.0, max = 1.0, default = defaultParams.sustain },
      "/midi/synth/release" = { min = 0.001, max = 10.0, default = defaultParams.release },
      "/midi/synth/filterCutoff" = { min = 20.0, max = 20000.0, default = defaultParams.filterCutoff },
      "/midi/synth/filterResonance" = { min = 0.1, max = 10.0, default = defaultParams.filterResonance },
      "/midi/synth/volume" = { min = 0.0, max = 1.0, default = defaultParams.volume },
      "/midi/synth/reverbMix" = { min = 0.0, max = 1.0, default = defaultParams.reverbMix },
      "/midi/synth/delayMix" = { min = 0.0, max = 1.0, default = defaultParams.delayMix },
      "/midi/synth/chorusMix" = { min = 0.0, max = 1.0, default = defaultParams.chorusMix },
    },
    
    -- Expose state for UI
    state = {
      activeVoices = function() 
        return synth.voiceNode and synth.voiceNode:getNumActiveVoices() or 0 
      end,
      spectrumData = function()
        return nodes.spectrum and nodes.spectrum:getSpectrum() or {}
      end,
      outputLevel = function()
        return nodes.meter and nodes.meter:getLevel() or 0.0
      end,
    }
  }
end
