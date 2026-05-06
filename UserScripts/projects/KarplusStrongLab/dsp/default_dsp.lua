-- Karplus-Strong Lab - polyphonic string synthesis
-- Enhanced chain: Noise → SVF(tone) → EnvGain → Comb(string) → Allpass(stiffness) → Filter → Resonator(body) → Out

local function clamp(value, lo, hi)
  local n = tonumber(value) or 0.0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function noteToFreq(note)
  return 440.0 * math.pow(2.0, (note - 69) / 12.0)
end

local function decayToFeedback(decaySeconds, freq)
  local delaySecs = 1.0 / math.max(1.0, freq)
  local fb = math.exp(-6.907755 * delaySecs / math.max(0.01, decaySeconds))
  return clamp(fb, 0.88, 0.9995)
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

function buildPlugin(ctx)
  local maxVoices = 8
  local sampleRate = 44100.0

  local params = {
    noiseColor      = 0.0,
    excitationAttackMs = 5.0,
    excitationDecayMs  = 20.0,
    excitationLevel = 0.8,
    toneMode        = 0,
    toneCutoff      = 4000.0,
    toneResonance   = 0.3,
    stringDecay     = 2.0,
    stiffness       = 0.0,
    filterCutoff    = 4000.0,
    filterResonance = 0.2,
    bodyFreq        = 200.0,
    bodyQ           = 12.0,
    bodyGain        = 0.8,
    bodyMix         = 0.35,
    masterGain      = 0.7,
  }

  local mixer = ctx.primitives.MixerNode.new()
  mixer:setInputCount(maxVoices)
  for i = 1, maxVoices do
    mixer:setGain(i, 1.0)
    mixer:setPan(i, 0.0)
  end

  local masterGainNode = ctx.primitives.GainNode.new(2)
  masterGainNode:setGain(params.masterGain)

  ctx.graph.connect(mixer, masterGainNode)

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
    -- Excitation
    local noise = ctx.primitives.NoiseGeneratorNode.new()
    noise:setLevel(1.0)
    noise:setColor(params.noiseColor)

    local tone = ctx.primitives.SVFNode.new()
    tone:setMode(params.toneMode)
    tone:setCutoff(params.toneCutoff)
    tone:setResonance(params.toneResonance)
    tone:setDrive(0.0)
    tone:setMix(1.0)

    local envGain = ctx.primitives.GainNode.new(2)
    envGain:setGain(0.0)

    -- String
    local comb = ctx.primitives.CombNode.new(50.0)
    comb:setMaxDelay(50.0)
    comb:setDelay(2.27)
    comb:setGain(1.0)
    comb:setFeedforward(0.0)
    comb:setFeedback(0.995)

    local stiff = ctx.primitives.AllpassNode.new(10.0)
    stiff:setMaxDelay(10.0)
    stiff:setDelay(0.0)
    stiff:setFeedback(0.0)

    -- Tone + body
    local filter = ctx.primitives.FilterNode.new()
    filter:setCutoff(params.filterCutoff)
    filter:setResonance(params.filterResonance)
    filter:setMix(1.0)

    local dryGain = ctx.primitives.GainNode.new(2)
    dryGain:setGain(1.0 - params.bodyMix)

    local body = ctx.primitives.ResonatorNode.new()
    body:setFrequency(params.bodyFreq)
    body:setQ(params.bodyQ)
    body:setGain(params.bodyGain)

    local wetGain = ctx.primitives.GainNode.new(2)
    wetGain:setGain(params.bodyMix)

    local bodyMix = ctx.primitives.MixerNode.new()
    bodyMix:setInputCount(2)
    bodyMix:setGain(1, 1.0)
    bodyMix:setGain(2, 1.0)
    bodyMix:setPan(1, 0.0)
    bodyMix:setPan(2, 0.0)

    ctx.graph.connect(noise, tone)
    ctx.graph.connect(tone, envGain)
    ctx.graph.connect(envGain, comb)
    ctx.graph.connect(comb, stiff)
    ctx.graph.connect(stiff, filter)
    ctx.graph.connect(filter, dryGain)
    ctx.graph.connect(filter, body)
    ctx.graph.connect(body, wetGain)
    ctx.graph.connect(dryGain, bodyMix, 0, 0)
    ctx.graph.connect(wetGain, bodyMix, 0, 2)
    ctx.graph.connect(bodyMix, mixer, 0, (i - 1) * 2)

    voices[i] = {
      noise      = noise,
      tone       = tone,
      envGain    = envGain,
      comb       = comb,
      stiff      = stiff,
      filter     = filter,
      dryGain    = dryGain,
      body       = body,
      wetGain    = wetGain,
      bodyMix    = bodyMix,
      env        = { stage = "off", value = 0.0, time = 0.0, gate = false },
      note       = nil,
      velocity   = 0,
      active     = false,
    }
    voiceStamps[i] = 0

    if ctx.graph.nameNode then
      ctx.graph.nameNode(noise,    "/ks/voice/" .. i .. "/noise")
      ctx.graph.nameNode(tone,     "/ks/voice/" .. i .. "/tone")
      ctx.graph.nameNode(envGain,  "/ks/voice/" .. i .. "/envGain")
      ctx.graph.nameNode(comb,     "/ks/voice/" .. i .. "/comb")
      ctx.graph.nameNode(stiff,    "/ks/voice/" .. i .. "/stiff")
      ctx.graph.nameNode(filter,   "/ks/voice/" .. i .. "/filter")
      ctx.graph.nameNode(body,     "/ks/voice/" .. i .. "/body")
      ctx.graph.nameNode(bodyMix,  "/ks/voice/" .. i .. "/bodyMix")
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

  local function applyStiffness(voice)
    local s = params.stiffness
    local delayMs = s * 2.0
    local gain = s * 0.5
    voice.stiff:setDelay(delayMs)
    voice.stiff:setFeedback(gain)
  end

  local function applyBodyMix(voice)
    local m = clamp(params.bodyMix, 0.0, 1.0)
    voice.dryGain:setGain(1.0 - m)
    voice.wetGain:setGain(m)
  end

  local function triggerVoice(index, note, velocity)
    local v = voices[index]
    local freq = noteToFreq(note)
    local delayMs = 1000.0 / freq

    v.comb:reset()
    v.comb:setDelay(delayMs)
    v.comb:setFeedback(decayToFeedback(params.stringDecay, freq))

    v.tone:reset()
    v.tone:setMode(params.toneMode)
    v.tone:setCutoff(params.toneCutoff)
    v.tone:setResonance(params.toneResonance)

    v.stiff:reset()
    applyStiffness(v)

    v.filter:setCutoff(params.filterCutoff)
    v.filter:setResonance(params.filterResonance)

    v.body:reset()
    v.body:setFrequency(params.bodyFreq)
    v.body:setQ(params.bodyQ)
    v.body:setGain(params.bodyGain)
    applyBodyMix(v)

    v.note = note
    v.velocity = math.max(1, math.min(127, velocity))
    v.active = true
    triggerEnvelope(v.env)

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
      v.comb:reset()
      v.tone:reset()
      v.stiff:reset()
      v.body:reset()
      resetEnvelope(v.env)
      v.envGain:setGain(0.0)
      v.active = false
      v.note = nil
      v.velocity = 0
    end
  end

  -- Parameter registration
  ctx.params.register('/ks/noise/color',          { type = 'f', min = 0.0,    max = 1.0,     default = 0.0 })
  ctx.params.register('/ks/excitation/attack',      { type = 'f', min = 0.1,    max = 50.0,    default = 5.0 })
  ctx.params.register('/ks/excitation/decay',       { type = 'f', min = 1.0,    max = 100.0,   default = 20.0 })
  ctx.params.register('/ks/excitation/level',       { type = 'f', min = 0.0,    max = 1.0,     default = 0.8 })
  ctx.params.register('/ks/excitation/tone_mode',   { type = 'f', min = 0,      max = 3,       default = 0 })
  ctx.params.register('/ks/excitation/tone_cutoff', { type = 'f', min = 100.0,  max = 10000.0, default = 4000.0 })
  ctx.params.register('/ks/excitation/tone_reson',  { type = 'f', min = 0.0,    max = 1.0,     default = 0.3 })
  ctx.params.register('/ks/string/decay',           { type = 'f', min = 0.1,    max = 10.0,    default = 2.0 })
  ctx.params.register('/ks/string/stiffness',       { type = 'f', min = 0.0,    max = 1.0,     default = 0.0 })
  ctx.params.register('/ks/filter/cutoff',          { type = 'f', min = 100.0,  max = 12000.0, default = 4000.0 })
  ctx.params.register('/ks/filter/resonance',       { type = 'f', min = 0.0,    max = 1.0,     default = 0.2 })
  ctx.params.register('/ks/body/freq',              { type = 'f', min = 20.0,   max = 5000.0,  default = 200.0 })
  ctx.params.register('/ks/body/q',                 { type = 'f', min = 1.0,    max = 100.0,   default = 12.0 })
  ctx.params.register('/ks/body/gain',              { type = 'f', min = 0.0,    max = 2.0,     default = 0.8 })
  ctx.params.register('/ks/body/mix',               { type = 'f', min = 0.0,    max = 1.0,     default = 0.35 })
  ctx.params.register('/ks/master/gain',            { type = 'f', min = 0.0,    max = 2.0,     default = 0.7 })
  ctx.params.register('/ks/manual_trigger',         { type = 'f', min = 0,      max = 1000000, default = 0 })
  ctx.params.register('/ks/panic',                  { type = 'f', min = 0,      max = 1000000, default = 0 })

  local manualTriggerCounter = 0
  local panicCounter = 0

  local function onParamChange(path, value)
    if path == '/ks/noise/color' then
      params.noiseColor = value
      for i = 1, maxVoices do
        voices[i].noise:setColor(value)
      end
    elseif path == '/ks/excitation/attack' then
      params.excitationAttackMs = value
    elseif path == '/ks/excitation/decay' then
      params.excitationDecayMs = value
    elseif path == '/ks/excitation/level' then
      params.excitationLevel = value
    elseif path == '/ks/excitation/tone_mode' then
      params.toneMode = math.floor(value + 0.5)
      for i = 1, maxVoices do
        voices[i].tone:setMode(params.toneMode)
      end
    elseif path == '/ks/excitation/tone_cutoff' then
      params.toneCutoff = value
      for i = 1, maxVoices do
        voices[i].tone:setCutoff(value)
      end
    elseif path == '/ks/excitation/tone_reson' then
      params.toneResonance = value
      for i = 1, maxVoices do
        voices[i].tone:setResonance(value)
      end
    elseif path == '/ks/string/decay' then
      params.stringDecay = value
    elseif path == '/ks/string/stiffness' then
      params.stiffness = value
      for i = 1, maxVoices do
        applyStiffness(voices[i])
      end
    elseif path == '/ks/filter/cutoff' then
      params.filterCutoff = value
      for i = 1, maxVoices do
        voices[i].filter:setCutoff(value)
      end
    elseif path == '/ks/filter/resonance' then
      params.filterResonance = value
      for i = 1, maxVoices do
        voices[i].filter:setResonance(value)
      end
    elseif path == '/ks/body/freq' then
      params.bodyFreq = value
      for i = 1, maxVoices do
        voices[i].body:setFrequency(value)
      end
    elseif path == '/ks/body/q' then
      params.bodyQ = value
      for i = 1, maxVoices do
        voices[i].body:setQ(value)
      end
    elseif path == '/ks/body/gain' then
      params.bodyGain = value
      for i = 1, maxVoices do
        voices[i].body:setGain(value)
      end
    elseif path == '/ks/body/mix' then
      params.bodyMix = value
      for i = 1, maxVoices do
        applyBodyMix(voices[i])
      end
    elseif path == '/ks/master/gain' then
      params.masterGain = value
      masterGainNode:setGain(value)
    elseif path == '/ks/manual_trigger' then
      local nextVal = math.floor(value + 0.5)
      if nextVal ~= manualTriggerCounter then
        manualTriggerCounter = nextVal
        triggerVoice(allocateVoice(), 60, 100)
      end
    elseif path == '/ks/panic' then
      local nextVal = math.floor(value + 0.5)
      if nextVal ~= panicCounter then
        panicCounter = nextVal
        stopAll()
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
    description = 'Karplus-Strong Lab - enhanced polyphonic string synthesis',
    output = masterGainNode,
    onParamChange = onParamChange,
    process = process,
  }
end
