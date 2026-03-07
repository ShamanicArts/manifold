-- MIDI Synthesizer Main Behavior
-- Coordinates all synth components and handles global state

local MainBehavior = {}

function MainBehavior.onInit(ctx)
  print("[MidiSynth] Initializing...")
  
  -- Store references to child components
  ctx.components = {
    header = ctx:getChild("header"),
    oscillator = ctx:getChild("oscillator_panel"),
    envelope = ctx:getChild("envelope_panel"),
    filter = ctx:getChild("filter_panel"),
    effects = ctx:getChild("effects_panel"),
    keyboard = ctx:getChild("keyboard"),
    spectrum = ctx:getChild("spectrum"),
    midiMonitor = ctx:getChild("midi_monitor"),
    presets = ctx:getChild("preset_panel"),
  }
  
  -- Global synth state
  ctx.state = {
    isPlaying = false,
    lastNote = nil,
    lastVelocity = 0,
    activeVoices = 0,
    selectedPreset = "Init",
    midiActivity = false,
    midiActivityTimer = 0,
  }
  
  -- Parameter state (synced with DSP)
  ctx.params = {
    waveform = 0,
    polyphony = 8,
    attack = 0.01,
    decay = 0.1,
    sustain = 0.7,
    release = 0.3,
    filterCutoff = 20000.0,
    filterResonance = 0.707,
    volume = 0.7,
    reverbMix = 0.0,
    delayMix = 0.0,
    chorusMix = 0.0,
  }
  
  -- Set up MIDI input monitoring
  if Midi then
    Midi.onNoteOn(function(channel, note, velocity, timestamp)
      ctx.state.lastNote = note
      ctx.state.lastVelocity = velocity
      ctx.state.midiActivity = true
      ctx.state.midiActivityTimer = 30  -- frames
      
      -- Notify keyboard component
      if ctx.components.keyboard and ctx.components.keyboard.onMidiNoteOn then
        ctx.components.keyboard:onMidiNoteOn(note, velocity)
      end
      
      -- Update MIDI monitor
      if ctx.components.midiMonitor and ctx.components.midiMonitor.onMidiEvent then
        ctx.components.midiMonitor:onMidiEvent("NOTE_ON", channel, note, velocity)
      end
    end)
    
    Midi.onNoteOff(function(channel, note, timestamp)
      ctx.state.midiActivity = true
      ctx.state.midiActivityTimer = 30
      
      -- Notify keyboard component
      if ctx.components.keyboard and ctx.components.keyboard.onMidiNoteOff then
        ctx.components.keyboard:onMidiNoteOff(note)
      end
      
      -- Update MIDI monitor
      if ctx.components.midiMonitor and ctx.components.midiMonitor.onMidiEvent then
        ctx.components.midiMonitor:onMidiEvent("NOTE_OFF", channel, note, 0)
      end
    end)
    
    Midi.onControlChange(function(channel, cc, value, timestamp)
      ctx.state.midiActivity = true
      ctx.state.midiActivityTimer = 30
      
      if ctx.components.midiMonitor and ctx.components.midiMonitor.onMidiEvent then
        ctx.components.midiMonitor:onMidiEvent("CC", channel, cc, value)
      end
      
      -- Map common CCs to parameters
      if cc == Midi.CC_CUTOFF then
        local cutoff = 20.0 + (value / 127.0) * 19980.0
        ctx:setParam("filterCutoff", cutoff)
      elseif cc == Midi.CC_RESONANCE then
        local resonance = 0.1 + (value / 127.0) * 9.9
        ctx:setParam("filterResonance", resonance)
      elseif cc == Midi.CC_ATTACK then
        local attack = 0.001 + (value / 127.0) * 9.999
        ctx:setParam("attack", attack)
      elseif cc == Midi.CC_RELEASE then
        local release = 0.001 + (value / 127.0) * 9.999
        ctx:setParam("release", release)
      end
    end)
  end
  
  print("[MidiSynth] Initialized successfully")
end

function MainBehavior.onUpdate(ctx)
  -- Update MIDI activity indicator
  if ctx.state.midiActivityTimer > 0 then
    ctx.state.midiActivityTimer = ctx.state.midiActivityTimer - 1
    if ctx.state.midiActivityTimer <= 0 then
      ctx.state.midiActivity = false
    end
  end
  
  -- Poll DSP for active voice count
  if ctx.getDSPState then
    local dspState = ctx:getDSPState()
    if dspState and dspState.activeVoices then
      ctx.state.activeVoices = dspState.activeVoices()
    end
  end
end

function MainBehavior.onDestroy(ctx)
  print("[MidiSynth] Shutting down...")
  
  -- Send all notes off
  if Midi then
    for ch = 1, 16 do
      Midi.sendAllNotesOff(ch)
    end
  end
end

-- Parameter setters that sync with DSP
function MainBehavior.setParam(ctx, name, value)
  ctx.params[name] = value
  
  -- Send to DSP via OSC
  local path = "/midi/synth/" .. name
  if Control and Control.set then
    Control.set(path, value)
  end
  
  -- Notify relevant component
  for _, component in pairs(ctx.components) do
    if component and component.onParamChange then
      component:onParamChange(name, value)
    end
  end
end

function MainBehavior.getParam(ctx, name)
  return ctx.params[name]
end

-- Preset management
function MainBehavior.loadPreset(ctx, presetName)
  print("[MidiSynth] Loading preset: " .. tostring(presetName))
  ctx.state.selectedPreset = presetName
  
  -- TODO: Load preset from storage
  -- For now, just notify components
  for _, component in pairs(ctx.components) do
    if component and component.onPresetLoad then
      component:onPresetLoad(presetName)
    end
  end
end

function MainBehavior.savePreset(ctx, presetName)
  print("[MidiSynth] Saving preset: " .. tostring(presetName))
  
  -- TODO: Save preset to storage
  local preset = {
    name = presetName,
    params = ctx.params,
  }
  
  -- Save to file or storage
  print("[MidiSynth] Preset saved (mock)")
end

return MainBehavior
