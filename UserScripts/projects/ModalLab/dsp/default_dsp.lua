-- Modal Synthesis Lab
-- Polyphonic modal synthesis using parallel ResonatorNodes
-- Excitation: Noise burst → SVF(tone) → individual resonators per mode → mix → filter → out

local function clamp(value, lo, hi)
  local n = tonumber(value) or 0.0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function noteToFreq(note)
  return 440.0 * math.pow(2.0, (note - 69) / 12.0)
end

local function resetEnvelope(env)
  env.stage = "off"
  env.value = 0.0
  env.time = 0.0
  env.gate = false
end

local function triggerEnvelope(env)
  env.stage = "attack"
  env.value = 0.0
  env.time = 0.0
  env.gate = true
end

local function stepEnvelope(env, dt, attack, decay)
  local a = math.max(0.00001, attack)
  local d = math.max(0.00001, decay)

  if env.stage == "off" then
    env.value = 0.0
    if env.gate then
      env.stage = "attack"
      env.time = 0.0
    end
  elseif env.stage == "attack" then
    env.time = env.time + dt
    local t = math.min(env.time / a, 1.0)
    env.value = t
    if t >= 1.0 then
      env.stage = "decay"
      env.time = 0.0
      env.value = 1.0
    end
  elseif env.stage == "decay" then
    env.time = env.time + dt
    local t = math.min(env.time / d, 1.0)
    env.value = 1.0 - t
    if t >= 1.0 then
      env.value = 0.0
      env.stage = "off"
      env.time = 0.0
      env.gate = false
    end
  end
  return env.value
end

-- Preset modal profiles: used as defaults, user can override per mode
local PRESETS = {
  {
    name = "bell",
    ratios  = {1.0, 2.7, 5.4, 8.9, 13.5, 18.8},
    decays  = {4.0, 3.2, 2.0, 1.1, 0.6, 0.3},
    qValues = {90, 75, 60, 45, 35, 25},
    gains   = {3.0, 2.5, 1.9, 1.5, 1.1, 0.85},
  },
  {
    name = "marimba",
    ratios  = {1.0, 3.0, 5.0, 7.0, 9.0, 11.0},
    decays  = {1.5, 0.7, 0.4, 0.22, 0.12, 0.07},
    qValues = {70, 55, 42, 32, 24, 18},
    gains   = {3.0, 1.35, 0.75, 0.45, 0.3, 0.18},
  },
  {
    name = "glass",
    ratios  = {1.0, 2.3, 4.8, 7.2, 10.5, 14.0},
    decays  = {3.0, 2.2, 1.4, 0.85, 0.5, 0.28},
    qValues = {80, 65, 50, 38, 28, 20},
    gains   = {3.0, 2.25, 1.65, 1.25, 0.9, 0.6},
  },
  {
    name = "steel",
    ratios  = {1.0, 2.4, 3.5, 4.8, 6.2, 7.8},
    decays  = {2.5, 1.7, 1.1, 0.7, 0.42, 0.25},
    qValues = {75, 58, 44, 34, 26, 20},
    gains   = {3.0, 2.35, 1.8, 1.45, 1.1, 0.8},
  },
  {
    name = "wood",
    ratios  = {1.0, 2.8, 5.2, 8.0, 11.5, 15.0},
    decays  = {0.4, 0.18, 0.08, 0.04, 0.02, 0.01},
    qValues = {35, 25, 18, 13, 10, 8},
    gains   = {3.0, 1.65, 0.9, 0.5, 0.3, 0.18},
  },
}

function buildPlugin(ctx)
  local maxVoices = 8
  local numModes = 6
  local sampleRate = 44100.0

  local params = {
    excitationAttackMs = 2.0,
    excitationDecayMs  = 15.0,
    excitationLevel    = 1.0,
    toneMode           = 0,
    toneCutoff         = 6000.0,
    toneResonance      = 0.3,
    decayScale         = 1.0,
    brightness         = 1.0,
    resonatorGain      = 3.0,
    filterCutoff       = 8000.0,
    filterResonance    = 0.2,
    masterGain         = 1.0,
    presetIndex        = 0,
    modeRatios  = {1.0, 2.7, 5.4, 8.9, 13.5, 18.8},
    modeGains   = {3.0, 2.5, 1.9, 1.5, 1.1, 0.85},
    modeQs      = {90, 75, 60, 45, 35, 25},
  }

  local masterMixer = ctx.primitives.MixerNode.new()
  masterMixer:setInputCount(maxVoices)
  for i = 1, maxVoices do
    masterMixer:setGain(i, 1.0)
    masterMixer:setPan(i, 0.0)
  end

  local masterGainNode = ctx.primitives.GainNode.new(2)
  masterGainNode:setGain(params.masterGain)

  ctx.graph.connect(masterMixer, masterGainNode)

  if ctx.graph.markMonitor then
    ctx.graph.markMonitor(masterGainNode)
  end
  if ctx.graph.markOutput then
    ctx.graph.markOutput(masterGainNode)
  end

  local voices = {}
  local voiceStamps = {}
  local stamp = 0

  for i = 1, maxVoices do
    local noise = ctx.primitives.NoiseGeneratorNode.new()
    noise:setLevel(1.0)
    noise:setColor(0.0)

    local envGain = ctx.primitives.GainNode.new(2)
    envGain:setGain(0.0)

    local exciteFilter = ctx.primitives.SVFNode.new()
    exciteFilter:setMode(params.toneMode)
    exciteFilter:setCutoff(params.toneCutoff)
    exciteFilter:setResonance(params.toneResonance)
    exciteFilter:setDrive(0.0)
    exciteFilter:setMix(1.0)

    local modeMixer = ctx.primitives.MixerNode.new()
    modeMixer:setInputCount(numModes)
    for m = 1, numModes do
      modeMixer:setGain(m, 1.0)
      modeMixer:setPan(m, 0.0)
    end

    local outFilter = ctx.primitives.FilterNode.new()
    outFilter:setCutoff(params.filterCutoff)
    outFilter:setResonance(params.filterResonance)
    outFilter:setMix(1.0)

    local resonators = {}
    for m = 1, numModes do
      local r = ctx.primitives.ResonatorNode.new()
      r:setFrequency(440.0)
      r:setQ(50.0)
      r:setGain(0.5)
      resonators[m] = r
    end

    ctx.graph.connect(noise, envGain)
    ctx.graph.connect(envGain, exciteFilter)
    for m = 1, numModes do
      ctx.graph.connect(exciteFilter, resonators[m])
      ctx.graph.connect(resonators[m], modeMixer, 0, (m - 1) * 2)
    end
    ctx.graph.connect(modeMixer, outFilter)
    ctx.graph.connect(outFilter, masterMixer, 0, (i - 1) * 2)

    voices[i] = {
      noise        = noise,
      envGain      = envGain,
      exciteFilter = exciteFilter,
      resonators   = resonators,
      modeMixer    = modeMixer,
      outFilter    = outFilter,
      env          = { stage = "off", value = 0.0, time = 0.0, gate = false },
      note         = nil,
      velocity     = 0,
      active       = false,
    }
    voiceStamps[i] = 0

    if ctx.graph.nameNode then
      ctx.graph.nameNode(noise, "/modal/voice/" .. i .. "/noise")
      ctx.graph.nameNode(envGain, "/modal/voice/" .. i .. "/envGain")
      ctx.graph.nameNode(exciteFilter, "/modal/voice/" .. i .. "/exciteFilter")
      ctx.graph.nameNode(modeMixer, "/modal/voice/" .. i .. "/modeMixer")
      ctx.graph.nameNode(outFilter, "/modal/voice/" .. i .. "/outFilter")
      for m = 1, numModes do
        ctx.graph.nameNode(resonators[m], "/modal/voice/" .. i .. "/resonator/" .. m)
      end
    end
  end

  local function allocateVoice()
    for i = 1, maxVoices do
      if not voices[i].active and voices[i].env.stage == "off" then
        return i
      end
    end
    for i = 1, maxVoices do
      if voices[i].env.stage == "off" then
        return i
      end
    end
    local oldest = 1
    for i = 2, maxVoices do
      if voiceStamps[i] < voiceStamps[oldest] then
        oldest = i
      end
    end
    return oldest
  end

  local function applyResonatorParams(voice)
    local fund = voice.note and noteToFreq(voice.note) or 440.0
    local dScale = params.decayScale
    local bright = clamp(params.brightness, 0.0, 1.0)

    for m = 1, numModes do
      local r = voice.resonators[m]
      local freq = fund * params.modeRatios[m]
      local q = params.modeQs[m] * dScale
      local gain = params.modeGains[m] * math.pow(bright, m - 1) * params.resonatorGain

      r:setFrequency(freq)
      r:setQ(clamp(q, 1.0, 200.0))
      r:setGain(clamp(gain, 0.0, 20.0))
    end
  end

  local function triggerVoice(index, note, velocity)
    local v = voices[index]

    v.exciteFilter:reset()
    v.exciteFilter:setMode(params.toneMode)
    v.exciteFilter:setCutoff(params.toneCutoff)
    v.exciteFilter:setResonance(params.toneResonance)

    for m = 1, numModes do
      v.resonators[m]:reset()
    end

    v.outFilter:setCutoff(params.filterCutoff)
    v.outFilter:setResonance(params.filterResonance)

    v.note = note
    v.velocity = math.max(1, math.min(127, velocity))
    v.active = true
    triggerEnvelope(v.env)

    applyResonatorParams(v)

    stamp = stamp + 1
    voiceStamps[index] = stamp
  end

  local function releaseVoice(index)
    local v = voices[index]
    v.note = nil
    v.active = false
  end

  local function stopAll()
    for i = 1, maxVoices do
      local v = voices[i]
      for m = 1, numModes do
        v.resonators[m]:reset()
      end
      v.exciteFilter:reset()
      resetEnvelope(v.env)
      v.envGain:setGain(0.0)
      v.active = false
      v.note = nil
      v.velocity = 0
    end
  end

  -- Register existing params
  ctx.params.register('/modal/excitation/attack',      { type = 'f', min = 0.1,   max = 50.0,    default = 2.0 })
  ctx.params.register('/modal/excitation/decay',       { type = 'f', min = 1.0,   max = 100.0,   default = 15.0 })
  ctx.params.register('/modal/excitation/level',       { type = 'f', min = 0.0,   max = 1.0,     default = 1.0 })
  ctx.params.register('/modal/excitation/tone_mode',   { type = 'f', min = 0,     max = 3,       default = 0 })
  ctx.params.register('/modal/excitation/tone_cutoff', { type = 'f', min = 100.0, max = 12000.0, default = 6000.0 })
  ctx.params.register('/modal/excitation/tone_reson',  { type = 'f', min = 0.0,   max = 1.0,     default = 0.3 })
  ctx.params.register('/modal/modes/decay_scale',      { type = 'f', min = 0.2,   max = 3.0,     default = 1.0 })
  ctx.params.register('/modal/modes/brightness',       { type = 'f', min = 0.0,   max = 1.0,     default = 1.0 })
  ctx.params.register('/modal/modes/resonator_gain',   { type = 'f', min = 0.0,   max = 10.0,    default = 3.0 })
  ctx.params.register('/modal/filter/cutoff',          { type = 'f', min = 100.0, max = 16000.0, default = 8000.0 })
  ctx.params.register('/modal/filter/resonance',       { type = 'f', min = 0.0,   max = 1.0,     default = 0.2 })
  ctx.params.register('/modal/master/gain',            { type = 'f', min = 0.0,   max = 2.0,     default = 1.0 })
  ctx.params.register('/modal/preset_index',           { type = 'f', min = 0,     max = 4,       default = 0 })
  ctx.params.register('/modal/manual_trigger',         { type = 'f', min = 0,     max = 1000000, default = 0 })
  ctx.params.register('/modal/panic',                  { type = 'f', min = 0,     max = 1000000, default = 0 })

  -- Register per-mode params
  for m = 1, numModes do
    ctx.params.register('/modal/mode/' .. m .. '/ratio', { type = 'f', min = 0.5, max = 30.0, default = params.modeRatios[m] })
    ctx.params.register('/modal/mode/' .. m .. '/gain',  { type = 'f', min = 0.0, max = 10.0, default = params.modeGains[m] })
    ctx.params.register('/modal/mode/' .. m .. '/q',     { type = 'f', min = 1.0, max = 200.0, default = params.modeQs[m] })
  end

  local manualTriggerCounter = 0
  local panicCounter = 0

  local function onParamChange(path, value)
    if path == '/modal/excitation/attack' then
      params.excitationAttackMs = value
    elseif path == '/modal/excitation/decay' then
      params.excitationDecayMs = value
    elseif path == '/modal/excitation/level' then
      params.excitationLevel = value
    elseif path == '/modal/excitation/tone_mode' then
      params.toneMode = math.floor(value + 0.5)
      for i = 1, maxVoices do
        voices[i].exciteFilter:setMode(params.toneMode)
      end
    elseif path == '/modal/excitation/tone_cutoff' then
      params.toneCutoff = value
      for i = 1, maxVoices do
        voices[i].exciteFilter:setCutoff(value)
      end
    elseif path == '/modal/excitation/tone_reson' then
      params.toneResonance = value
      for i = 1, maxVoices do
        voices[i].exciteFilter:setResonance(value)
      end
    elseif path == '/modal/modes/decay_scale' then
      params.decayScale = value
    elseif path == '/modal/modes/brightness' then
      params.brightness = value
    elseif path == '/modal/modes/resonator_gain' then
      params.resonatorGain = value
    elseif path == '/modal/filter/cutoff' then
      params.filterCutoff = value
      for i = 1, maxVoices do
        voices[i].outFilter:setCutoff(value)
      end
    elseif path == '/modal/filter/resonance' then
      params.filterResonance = value
      for i = 1, maxVoices do
        voices[i].outFilter:setResonance(value)
      end
    elseif path == '/modal/master/gain' then
      params.masterGain = value
      masterGainNode:setGain(value)
    elseif path == '/modal/preset_index' then
      params.presetIndex = math.floor(value + 0.5)
    elseif path == '/modal/manual_trigger' then
      local nextVal = math.floor(value + 0.5)
      if nextVal ~= manualTriggerCounter then
        manualTriggerCounter = nextVal
        triggerVoice(allocateVoice(), 60, 100)
      end
    elseif path == '/modal/panic' then
      local nextVal = math.floor(value + 0.5)
      if nextVal ~= panicCounter then
        panicCounter = nextVal
        stopAll()
      end
    else
      -- Per-mode params
      for m = 1, numModes do
        if path == '/modal/mode/' .. m .. '/ratio' then
          params.modeRatios[m] = value
          break
        elseif path == '/modal/mode/' .. m .. '/gain' then
          params.modeGains[m] = value
          break
        elseif path == '/modal/mode/' .. m .. '/q' then
          params.modeQs[m] = value
          break
        end
      end
    end
  end

  local function process(blockSize, sr)
    sampleRate = sr
    local dt = blockSize / math.max(1.0, sampleRate)

    for i = 1, maxVoices do
      local v = voices[i]
      local envValue = stepEnvelope(v.env, dt, params.excitationAttackMs / 1000.0, params.excitationDecayMs / 1000.0)
      local velAmp = v.velocity / 127.0
      local gain = envValue * velAmp * params.excitationLevel
      v.envGain:setGain(gain)
    end

    if Midi and Midi.pollInputEvent then
      while true do
        local event = Midi.pollInputEvent()
        if event == nil then break end

        local eventType = tonumber(event.type or 0) or 0
        local data1 = tonumber(event.data1 or 0) or 0
        local data2 = tonumber(event.data2 or 0) or 0

        if Midi.NOTE_ON and eventType == Midi.NOTE_ON and data2 > 0 then
          triggerVoice(allocateVoice(), data1, data2)
        elseif (Midi.NOTE_OFF and eventType == Midi.NOTE_OFF)
            or (Midi.NOTE_ON and eventType == Midi.NOTE_ON and data2 <= 0) then
          for i = 1, maxVoices do
            if voices[i].note == data1 then
              releaseVoice(i)
            end
          end
        elseif Midi.CONTROL_CHANGE and eventType == Midi.CONTROL_CHANGE and data1 == 123 then
          stopAll()
        end
      end
    end
  end

  return {
    description = 'Modal Synthesis Lab - polyphonic resonator instrument',
    output = masterGainNode,
    onParamChange = onParamChange,
    process = process,
  }
end
