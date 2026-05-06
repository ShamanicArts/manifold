-- VectorSynth - 8 voice polyphonic vector synthesis with per-note vector envelopes
-- Per voice: OscA + NoiseB + AdditiveOscC + OscD -> Mixer(4) -> Filter -> Lua ADSR Gain -> Master

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0.0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function noteToFreq(note)
  return 440.0 * math.pow(2.0, (note - 69) / 12.0)
end

local function ratioFromOctSemi(oct, semi)
  return math.pow(2.0, ((tonumber(oct) or 0) * 12.0 + (tonumber(semi) or 0)) / 12.0)
end

local VECTOR_PATHS = {
  -- 0: Circle-ish / corner orbit
  {
    {t=0.00, x=0.50, y=0.50}, {t=0.40, x=1.00, y=0.10}, {t=0.90, x=1.00, y=0.95},
    {t=1.35, x=0.05, y=1.00}, {t=1.80, x=0.05, y=0.05}, {t=2.30, x=0.50, y=0.50},
  },
  -- 1: A -> B -> D -> C -> A
  {
    {t=0.00, x=0.00, y=0.00}, {t=0.55, x=1.00, y=0.00}, {t=1.15, x=1.00, y=1.00},
    {t=1.75, x=0.00, y=1.00}, {t=2.35, x=0.00, y=0.00},
  },
  -- 2: Horizontal sweep
  {
    {t=0.00, x=0.00, y=0.25}, {t=0.80, x=1.00, y=0.25}, {t=1.60, x=0.00, y=0.75}, {t=2.40, x=1.00, y=0.75},
  },
  -- 3: Vertical sweep
  {
    {t=0.00, x=0.25, y=0.00}, {t=0.80, x=0.25, y=1.00}, {t=1.60, x=0.75, y=0.00}, {t=2.40, x=0.75, y=1.00},
  },
  -- 4: Random-ish walk
  {
    {t=0.00, x=0.45, y=0.45}, {t=0.25, x=0.15, y=0.85}, {t=0.55, x=0.85, y=0.70},
    {t=0.90, x=0.35, y=0.20}, {t=1.30, x=0.95, y=0.35}, {t=1.75, x=0.20, y=0.95}, {t=2.20, x=0.55, y=0.50},
  },
}

local function samplePath(pathIndex, timeSeconds, shouldLoop)
  local path = VECTOR_PATHS[(math.floor(pathIndex or 0) % #VECTOR_PATHS) + 1] or VECTOR_PATHS[1]
  local duration = path[#path].t
  local t = timeSeconds
  if shouldLoop and duration > 0.001 then
    t = t % duration
  elseif t >= duration then
    return path[#path].x, path[#path].y
  end
  if t <= path[1].t then return path[1].x, path[1].y end
  for i = 1, #path - 1 do
    local a, b = path[i], path[i + 1]
    if t >= a.t and t <= b.t then
      local span = math.max(0.0001, b.t - a.t)
      local u = clamp((t - a.t) / span, 0.0, 1.0)
      return a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u
    end
  end
  return path[#path].x, path[#path].y
end

local function resetAmpEnv(env)
  env.stage = "off"; env.value = 0.0; env.time = 0.0; env.gate = false
end

local function noteOnAmpEnv(env)
  env.stage = "attack"; env.value = 0.0; env.time = 0.0; env.gate = true
end

local function noteOffAmpEnv(env)
  if env.stage ~= "off" then env.stage = "release"; env.time = 0.0; env.startValue = env.value end
  env.gate = false
end

local function stepAmpEnv(env, dt, attack, decay, sustain, release)
  local a = math.max(0.00001, attack)
  local d = math.max(0.00001, decay)
  local r = math.max(0.00001, release)
  local s = clamp(sustain, 0.0, 1.0)
  if env.stage == "off" then
    env.value = 0.0
  elseif env.stage == "attack" then
    env.time = env.time + dt
    local t = math.min(env.time / a, 1.0)
    env.value = t
    if t >= 1.0 then env.stage = "decay"; env.time = 0.0; env.value = 1.0 end
  elseif env.stage == "decay" then
    env.time = env.time + dt
    local t = math.min(env.time / d, 1.0)
    env.value = 1.0 + (s - 1.0) * t
    if t >= 1.0 then env.stage = "sustain"; env.time = 0.0; env.value = s end
  elseif env.stage == "sustain" then
    env.value = s
    if not env.gate then env.stage = "release"; env.time = 0.0; env.startValue = env.value end
  elseif env.stage == "release" then
    env.time = env.time + dt
    local t = math.min(env.time / r, 1.0)
    env.value = (env.startValue or env.value) * (1.0 - t)
    if t >= 1.0 then resetAmpEnv(env) end
  end
  return env.value
end

local function vectorWeights(x, y)
  x = clamp(x, 0.0, 1.0); y = clamp(y, 0.0, 1.0)
  return (1.0 - x) * (1.0 - y), x * (1.0 - y), (1.0 - x) * y, x * y
end

function buildPlugin(ctx)
  local maxVoices = 8
  local params = {
    vectorX = 0.5, vectorY = 0.5, envAmount = 0.75, envSpeed = 1.0, envPath = 0, envLoop = 0,
    attackMs = 20.0, decayMs = 300.0, sustain = 0.7, releaseMs = 900.0,
    filterCutoff = 9000.0, filterResonance = 0.15,
    glideMs = 0.0, masterGain = 0.75,
    aWave = 1, aOct = 0, aSemi = 0, aDetune = 12.0, aSpread = 0.4, aUnison = 3,
    bColor = 0.35,
    cWave = 0, cPartials = 12, cTilt = 0.25, cDrift = 0.05, cOct = 1, cSemi = 0,
    dWave = 6, dOct = -1, dSemi = 0, dPulse = 0.35, dDetune = 5.0,
  }

  local masterMixer = ctx.primitives.MixerNode.new()
  masterMixer:setInputCount(maxVoices)
  for i = 1, maxVoices do masterMixer:setGain(i, 1.0); masterMixer:setPan(i, 0.0) end
  local masterGain = ctx.primitives.GainNode.new(2)
  masterGain:setGain(params.masterGain)
  ctx.graph.connect(masterMixer, masterGain)
  if ctx.graph.markMonitor then ctx.graph.markMonitor(masterGain) end
  if ctx.graph.markOutput then ctx.graph.markOutput(masterGain) end

  local voices, voiceStamps, stamp = {}, {}, 0

  local function applyStaticSourceParams(v)
    v.oscA:setWaveform(params.aWave); v.oscA:setRenderMode(0); v.oscA:setUnison(params.aUnison); v.oscA:setDetune(params.aDetune); v.oscA:setSpread(params.aSpread); v.oscA:setAmplitude(0.75)
    v.noiseB:setColor(params.bColor); v.noiseB:setLevel(0.65)
    v.oscC:setWaveform(params.cWave); v.oscC:setRenderMode(1); v.oscC:setAdditivePartials(params.cPartials); v.oscC:setAdditiveTilt(params.cTilt); v.oscC:setAdditiveDrift(params.cDrift); v.oscC:setAmplitude(0.65)
    v.oscD:setWaveform(params.dWave); v.oscD:setRenderMode(0); v.oscD:setPulseWidth(params.dPulse); v.oscD:setUnison(1); v.oscD:setDetune(params.dDetune); v.oscD:setSpread(0.15); v.oscD:setAmplitude(0.8)
    v.filter:setCutoff(params.filterCutoff); v.filter:setResonance(params.filterResonance); v.filter:setMix(1.0)
  end

  local function setVoiceFrequency(v, freq)
    v.currentFreq = freq
    v.oscA:setFrequency(freq * ratioFromOctSemi(params.aOct, params.aSemi))
    v.oscC:setFrequency(freq * ratioFromOctSemi(params.cOct, params.cSemi))
    v.oscD:setFrequency(freq * ratioFromOctSemi(params.dOct, params.dSemi))
  end

  for i = 1, maxVoices do
    local oscA = ctx.primitives.OscillatorNode.new()
    local noiseB = ctx.primitives.NoiseGeneratorNode.new()
    local oscC = ctx.primitives.OscillatorNode.new()
    local oscD = ctx.primitives.OscillatorNode.new()
    local mix = ctx.primitives.MixerNode.new(); mix:setInputCount(4)
    for s = 1, 4 do mix:setGain(s, 0.25); mix:setPan(s, 0.0) end
    local filter = ctx.primitives.FilterNode.new()
    local envGain = ctx.primitives.GainNode.new(2); envGain:setGain(0.0)

    ctx.graph.connect(oscA, mix, 0, 0)
    ctx.graph.connect(noiseB, mix, 0, 2)
    ctx.graph.connect(oscC, mix, 0, 4)
    ctx.graph.connect(oscD, mix, 0, 6)
    ctx.graph.connect(mix, filter)
    ctx.graph.connect(filter, envGain)
    ctx.graph.connect(envGain, masterMixer, 0, (i - 1) * 2)

    voices[i] = {
      oscA=oscA, noiseB=noiseB, oscC=oscC, oscD=oscD, mixer=mix, filter=filter, envGain=envGain,
      ampEnv={stage="off", value=0.0, time=0.0, gate=false}, note=nil, velocity=0, active=false,
      vectorTime=0.0, targetFreq=440.0, currentFreq=440.0,
    }
    applyStaticSourceParams(voices[i])
    voiceStamps[i] = 0
    if ctx.graph.nameNode then
      ctx.graph.nameNode(oscA, "/vector/voice/"..i.."/oscA")
      ctx.graph.nameNode(noiseB, "/vector/voice/"..i.."/noiseB")
      ctx.graph.nameNode(oscC, "/vector/voice/"..i.."/oscC")
      ctx.graph.nameNode(oscD, "/vector/voice/"..i.."/oscD")
      ctx.graph.nameNode(mix, "/vector/voice/"..i.."/mixer")
      ctx.graph.nameNode(filter, "/vector/voice/"..i.."/filter")
      ctx.graph.nameNode(envGain, "/vector/voice/"..i.."/envGain")
    end
  end

  local function allocateVoice()
    for i = 1, maxVoices do if voices[i].ampEnv.stage == "off" then return i end end
    local oldest = 1
    for i = 2, maxVoices do if voiceStamps[i] < voiceStamps[oldest] then oldest = i end end
    return oldest
  end

  local function triggerVoice(index, note, vel)
    local v = voices[index]
    v.note = note; v.velocity = clamp(vel or 100, 1, 127); v.active = true; v.vectorTime = 0.0
    v.targetFreq = noteToFreq(note)
    if params.glideMs <= 0.01 or v.ampEnv.stage == "off" then setVoiceFrequency(v, v.targetFreq) end
    applyStaticSourceParams(v)
    noteOnAmpEnv(v.ampEnv)
    stamp = stamp + 1; voiceStamps[index] = stamp
  end

  local function releaseNote(note)
    for i = 1, maxVoices do
      if voices[i].note == note then voices[i].active = false; voices[i].note = nil; noteOffAmpEnv(voices[i].ampEnv) end
    end
  end

  local function stopAll()
    for i = 1, maxVoices do
      resetAmpEnv(voices[i].ampEnv); voices[i].envGain:setGain(0.0); voices[i].active = false; voices[i].note = nil
      -- Reset methods are not exposed for all nodes in this build; envelope kill is enough for panic.
    end
  end

  local regs = {
    {'/vector/x', 0.0, 1.0, params.vectorX}, {'/vector/y', 0.0, 1.0, params.vectorY},
    {'/vector/env_amount', 0.0, 1.0, params.envAmount}, {'/vector/env_speed', 0.05, 8.0, params.envSpeed},
    {'/vector/env_path', 0, 4, params.envPath}, {'/vector/env_loop', 0, 1, params.envLoop},
    {'/env/attack', 0.1, 5000.0, params.attackMs}, {'/env/decay', 1.0, 5000.0, params.decayMs},
    {'/env/sustain', 0.0, 1.0, params.sustain}, {'/env/release', 1.0, 8000.0, params.releaseMs},
    {'/filter/cutoff', 40.0, 16000.0, params.filterCutoff}, {'/filter/resonance', 0.0, 1.0, params.filterResonance},
    {'/glide', 0.0, 5000.0, params.glideMs}, {'/master/gain', 0.0, 2.0, params.masterGain},
    {'/source/a/waveform', 0, 7, params.aWave}, {'/source/a/octave', -2, 2, params.aOct}, {'/source/a/semitone', -12, 12, params.aSemi},
    {'/source/a/detune', 0.0, 100.0, params.aDetune}, {'/source/a/spread', 0.0, 1.0, params.aSpread}, {'/source/a/unison', 1, 8, params.aUnison},
    {'/source/b/color', 0.0, 1.0, params.bColor},
    {'/source/c/partials', 1, 32, params.cPartials}, {'/source/c/tilt', -1.0, 1.0, params.cTilt}, {'/source/c/drift', 0.0, 1.0, params.cDrift},
    {'/source/c/octave', -2, 2, params.cOct}, {'/source/c/semitone', -12, 12, params.cSemi},
    {'/source/d/waveform', 0, 7, params.dWave}, {'/source/d/octave', -2, 2, params.dOct}, {'/source/d/semitone', -12, 12, params.dSemi},
    {'/source/d/pulse_width', 0.01, 0.99, params.dPulse}, {'/source/d/detune', 0.0, 100.0, params.dDetune},
    {'/vector/manual_trigger', 0, 1000000, 0}, {'/vector/panic', 0, 1000000, 0},
  }
  for _, r in ipairs(regs) do ctx.params.register(r[1], { type='f', min=r[2], max=r[3], default=r[4] }) end

  local trigCounter, panicCounter = 0, 0
  local function refreshAllStatic()
    for i = 1, maxVoices do applyStaticSourceParams(voices[i]); if voices[i].note then setVoiceFrequency(voices[i], voices[i].currentFreq) end end
  end

  local function onParamChange(path, value)
    if path == '/vector/x' then params.vectorX = value
    elseif path == '/vector/y' then params.vectorY = value
    elseif path == '/vector/env_amount' then params.envAmount = value
    elseif path == '/vector/env_speed' then params.envSpeed = value
    elseif path == '/vector/env_path' then params.envPath = math.floor(value + 0.5)
    elseif path == '/vector/env_loop' then params.envLoop = math.floor(value + 0.5)
    elseif path == '/env/attack' then params.attackMs = value
    elseif path == '/env/decay' then params.decayMs = value
    elseif path == '/env/sustain' then params.sustain = value
    elseif path == '/env/release' then params.releaseMs = value
    elseif path == '/filter/cutoff' then params.filterCutoff = value; for i=1,maxVoices do voices[i].filter:setCutoff(value) end
    elseif path == '/filter/resonance' then params.filterResonance = value; for i=1,maxVoices do voices[i].filter:setResonance(value) end
    elseif path == '/glide' then params.glideMs = value
    elseif path == '/master/gain' then params.masterGain = value; masterGain:setGain(value)
    elseif path == '/source/a/waveform' then params.aWave = math.floor(value + 0.5); refreshAllStatic()
    elseif path == '/source/a/octave' then params.aOct = math.floor(value + 0.5); refreshAllStatic()
    elseif path == '/source/a/semitone' then params.aSemi = value; refreshAllStatic()
    elseif path == '/source/a/detune' then params.aDetune = value; refreshAllStatic()
    elseif path == '/source/a/spread' then params.aSpread = value; refreshAllStatic()
    elseif path == '/source/a/unison' then params.aUnison = math.floor(value + 0.5); refreshAllStatic()
    elseif path == '/source/b/color' then params.bColor = value; refreshAllStatic()
    elseif path == '/source/c/partials' then params.cPartials = math.floor(value + 0.5); refreshAllStatic()
    elseif path == '/source/c/tilt' then params.cTilt = value; refreshAllStatic()
    elseif path == '/source/c/drift' then params.cDrift = value; refreshAllStatic()
    elseif path == '/source/c/octave' then params.cOct = math.floor(value + 0.5); refreshAllStatic()
    elseif path == '/source/c/semitone' then params.cSemi = value; refreshAllStatic()
    elseif path == '/source/d/waveform' then params.dWave = math.floor(value + 0.5); refreshAllStatic()
    elseif path == '/source/d/octave' then params.dOct = math.floor(value + 0.5); refreshAllStatic()
    elseif path == '/source/d/semitone' then params.dSemi = value; refreshAllStatic()
    elseif path == '/source/d/pulse_width' then params.dPulse = value; refreshAllStatic()
    elseif path == '/source/d/detune' then params.dDetune = value; refreshAllStatic()
    elseif path == '/vector/manual_trigger' then local n=math.floor(value+0.5); if n ~= trigCounter then trigCounter=n; triggerVoice(allocateVoice(), 60, 100) end
    elseif path == '/vector/panic' then local n=math.floor(value+0.5); if n ~= panicCounter then panicCounter=n; stopAll() end
    end
  end

  local function process(blockSize, sr)
    local dt = blockSize / math.max(1.0, sr or 44100.0)
    local shouldLoop = params.envLoop > 0.5
    for i = 1, maxVoices do
      local v = voices[i]
      if v.ampEnv.stage ~= "off" then
        v.vectorTime = v.vectorTime + dt * params.envSpeed
        local ex, ey = samplePath(params.envPath, v.vectorTime, shouldLoop)
        local amt = clamp(params.envAmount, 0.0, 1.0)
        local x = params.vectorX * (1.0 - amt) + ex * amt
        local y = params.vectorY * (1.0 - amt) + ey * amt
        local ga, gb, gc, gd = vectorWeights(x, y)
        v.mixer:setGain(1, ga); v.mixer:setGain(2, gb); v.mixer:setGain(3, gc); v.mixer:setGain(4, gd)

        if params.glideMs > 0.01 and v.targetFreq then
          local coeff = clamp(dt / (params.glideMs / 1000.0), 0.001, 1.0)
          v.currentFreq = v.currentFreq + (v.targetFreq - v.currentFreq) * coeff
          setVoiceFrequency(v, v.currentFreq)
        end

        local env = stepAmpEnv(v.ampEnv, dt, params.attackMs / 1000.0, params.decayMs / 1000.0, params.sustain, params.releaseMs / 1000.0)
        v.envGain:setGain(env * (v.velocity / 127.0))
      else
        v.envGain:setGain(0.0)
      end
    end

    if Midi and Midi.pollInputEvent then
      while true do
        local ev = Midi.pollInputEvent(); if ev == nil then break end
        local typ = tonumber(ev.type or 0) or 0; local d1 = tonumber(ev.data1 or 0) or 0; local d2 = tonumber(ev.data2 or 0) or 0
        if Midi.NOTE_ON and typ == Midi.NOTE_ON and d2 > 0 then triggerVoice(allocateVoice(), d1, d2)
        elseif (Midi.NOTE_OFF and typ == Midi.NOTE_OFF) or (Midi.NOTE_ON and typ == Midi.NOTE_ON and d2 <= 0) then releaseNote(d1)
        elseif Midi.CONTROL_CHANGE and typ == Midi.CONTROL_CHANGE then
          if d1 == 1 then onParamChange('/vector/x', clamp(d2 / 127.0, 0, 1)); if ctx.params.set then ctx.params.set('/vector/x', params.vectorX) end
          elseif d1 == 74 then onParamChange('/vector/y', clamp(d2 / 127.0, 0, 1)); if ctx.params.set then ctx.params.set('/vector/y', params.vectorY) end
          elseif d1 == 123 then stopAll() end
        end
      end
    end
  end

  return { description='VectorSynth - polyphonic vector synthesis with per-note vector envelopes', output=masterGain, onParamChange=onParamChange, process=process }
end
