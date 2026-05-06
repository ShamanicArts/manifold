-- GranularLab — granular sampler / live-capture instrument
--
-- Architecture:
--   Live input capture is always available for recording into the sample voices.
--   Each polyphonic voice owns its own SampleRegionPlaybackNode and GranulatorNode:
--     voice sample playback OR live input -> granulator -> voice gain -> voice mixer
--   This makes MIDI note-on actually trigger a granular sampler voice instead of
--   merely opening a gain on top of a monophonic live effect.

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0.0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v)
  return math.floor((tonumber(v) or 0) + 0.5)
end

local function noteToPitchSemitones(note, baseNote)
  return (tonumber(note) or 60) - (tonumber(baseNote) or 60)
end

function buildPlugin(ctx)
  local maxVoices = 6

  local params = {
    mode = 1,              -- 0 = Live input, 1 = Sample buffer
    freeze = 1,            -- in sample mode this holds the granulator buffer stable after seeding
    voiceCount = 6,
    captureSeconds = 12.0,
    grainSize = 90.0,
    density = 24.0,
    position = 0.0,
    pitch = 0.0,
    spray = 0.18,
    envelope = 0,          -- 0 Hann, 1 Triangle, 2 Blackman, 3 Tukey-ish, 4 Rect
    mix = 1.0,
    sampleSpeed = 1.0,
    sampleLoop = 1,
    playStart = 0.0,
    loopStart = 0.0,
    loopEnd = 1.0,
    crossfade = 0.03,
    sampleLevel = 0.0,     -- dry sample audition, post source
    grainLevel = 1.0,
    filterCutoff = 10000.0,
    filterResonance = 0.15,
    reverbSize = 0.55,
    reverbWet = 0.25,
    masterGain = 0.8,
    baseNote = 60,
    glideMs = 15.0,
    midiMode = 1,          -- 0 = drone/manual, 1 = gated MIDI voices
  }

  local passthrough = ctx.primitives.PassthroughNode.new(2)
  local capture = ctx.primitives.RetrospectiveCaptureNode.new(2)
  capture:setCaptureSeconds(params.captureSeconds)
  local captureMute = ctx.primitives.GainNode.new(2)
  captureMute:setGain(0.0)
  ctx.graph.connect(passthrough, capture)
  ctx.graph.connect(capture, captureMute)

  local voiceMixer = ctx.primitives.MixerNode.new()
  voiceMixer:setInputCount(maxVoices)

  local drySampleMixer = ctx.primitives.MixerNode.new()
  drySampleMixer:setInputCount(maxVoices)

  local preFxMixer = ctx.primitives.MixerNode.new()
  preFxMixer:setInputCount(2)
  preFxMixer:setGain(1, params.grainLevel)
  preFxMixer:setPan(1, 0.0)
  preFxMixer:setGain(2, params.sampleLevel)
  preFxMixer:setPan(2, 0.0)

  local filter = ctx.primitives.FilterNode.new()
  filter:setCutoff(params.filterCutoff)
  filter:setResonance(params.filterResonance)
  filter:setMix(1.0)

  local reverb = ctx.primitives.ReverbNode.new()
  reverb:setRoomSize(params.reverbSize)
  reverb:setWetLevel(params.reverbWet)
  reverb:setDryLevel(1.0 - params.reverbWet)

  local masterGain = ctx.primitives.GainNode.new(2)
  masterGain:setGain(params.masterGain)

  ctx.graph.connect(voiceMixer, preFxMixer, 0, 0)
  ctx.graph.connect(drySampleMixer, preFxMixer, 0, 2)
  ctx.graph.connect(preFxMixer, filter)
  ctx.graph.connect(filter, reverb)
  ctx.graph.connect(reverb, masterGain)

  if ctx.graph.markMonitor then ctx.graph.markMonitor(masterGain) end
  if ctx.graph.markOutput then ctx.graph.markOutput(masterGain) end

  local voices = {}
  local noteToVoice = {}
  local stamp = 0

  local function loopStartEnd()
    local loopStart = clamp(params.loopStart, 0.0, 0.98)
    local loopEnd = clamp(params.loopEnd, loopStart + 0.01, 1.0)
    return loopStart, loopEnd
  end

  local function absoluteGrainPosition()
    local loopStart, loopEnd = loopStartEnd()
    return clamp(loopStart + clamp(params.position, 0.0, 1.0) * (loopEnd - loopStart), 0.0, 1.0)
  end

  local function absoluteToRegionRelative(absPos)
    local loopStart, loopEnd = loopStartEnd()
    if loopEnd <= loopStart then return 0.0 end
    return clamp((absPos - loopStart) / (loopEnd - loopStart), 0.0, 1.0)
  end

  local function applySampleWindow(v)
    local loopStart, loopEnd = loopStartEnd()
    local playStart = clamp(params.playStart, loopStart, loopEnd)
    v.sample:setPlayStart(playStart)
    v.sample:setLoopStart(loopStart)
    v.sample:setLoopEnd(loopEnd)
    v.sample:setCrossfade(params.crossfade)
    if v.granulator.setSourceRegion then v.granulator:setSourceRegion(loopStart, loopEnd) end
    v.granulator:setPosition(params.position)
  end

  local function setupGranulator(g, pitch)
    if g.setBufferSeconds then g:setBufferSeconds(params.captureSeconds) end
    g:setGrainSize(params.grainSize)
    g:setDensity(params.density)
    if g.setSourceRegion then
      local loopStart, loopEnd = loopStartEnd()
      g:setSourceRegion(loopStart, loopEnd)
    end
    g:setPosition(params.position)
    g:setPitch(pitch or params.pitch)
    g:setSpray(params.spray)
    g:setFreeze(params.freeze > 0.5)
    g:setEnvelope(params.envelope)
    g:setMix(params.mix)
  end

  for i = 1, maxVoices do
    local sample = ctx.primitives.SampleRegionPlaybackNode.new(2)
    sample:setSpeed(params.sampleSpeed)
    sample:setOneShot(false)
    sample:setPlayStart(params.playStart)
    sample:setLoopStart(params.loopStart)
    sample:setLoopEnd(params.loopEnd)
    sample:setCrossfade(params.crossfade)

    local sourceMixer = ctx.primitives.MixerNode.new()
    sourceMixer:setInputCount(2)
    sourceMixer:setGain(1, 0.0) -- live source
    sourceMixer:setPan(1, 0.0)
    sourceMixer:setGain(2, 1.0) -- sample source
    sourceMixer:setPan(2, 0.0)

    local granulator = ctx.primitives.GranulatorNode.new()
    setupGranulator(granulator, params.pitch)
    if granulator.setEnabled then granulator:setEnabled(i == 1 and params.midiMode < 0.5) end

    ctx.graph.connect(passthrough, sourceMixer, 0, 0)
    ctx.graph.connect(sample, sourceMixer, 0, 2)
    ctx.graph.connect(sourceMixer, granulator)
    ctx.graph.connect(granulator, voiceMixer, 0, (i - 1) * 2)
    ctx.graph.connect(sample, drySampleMixer, 0, (i - 1) * 2)

    voices[i] = {
      sample = sample,
      sourceMixer = sourceMixer,
      granulator = granulator,
      note = nil,
      active = false,
      velocity = 0.0,
      currentGain = 0.0,
      targetGain = (i == 1 and 1.0 or 0.0),
      targetPitch = params.pitch,
      currentPitch = params.pitch,
      stamp = 0,
      seedBlocks = 0,
    }

    voiceMixer:setGain(i, voices[i].targetGain)
    voiceMixer:setPan(i, 0.0)
    drySampleMixer:setGain(i, 0.0)
    drySampleMixer:setPan(i, 0.0)

    if ctx.graph.nameNode then
      ctx.graph.nameNode(sample, "/granular/voice/" .. i .. "/sample")
      ctx.graph.nameNode(sourceMixer, "/granular/voice/" .. i .. "/source")
      ctx.graph.nameNode(granulator, "/granular/voice/" .. i .. "/granulator")
    end
  end

  if ctx.graph.nameNode then
    ctx.graph.nameNode(passthrough, "/granular/source/live")
    ctx.graph.nameNode(capture, "/granular/source/capture")
    ctx.graph.nameNode(captureMute, "/granular/source/capture_mute")
    ctx.graph.nameNode(voiceMixer, "/granular/voice_mixer")
    ctx.graph.nameNode(drySampleMixer, "/granular/dry_sample_mixer")
    ctx.graph.nameNode(preFxMixer, "/granular/pre_fx_mixer")
    ctx.graph.nameNode(filter, "/granular/filter")
    ctx.graph.nameNode(reverb, "/granular/reverb")
    ctx.graph.nameNode(masterGain, "/granular/master")
  end

  local regs = {
    {'/granular/mode',             0,   1,     params.mode},
    {'/granular/freeze',           0,   1,     params.freeze},
    {'/granular/voice_count',      1,   maxVoices, params.voiceCount},
    {'/granular/capture_seconds',  1,   30,    params.captureSeconds},
    {'/granular/grain_size',       1,   500,   params.grainSize},
    {'/granular/density',          1,   100,   params.density},
    {'/granular/position',         0,   1,     params.position},
    {'/granular/pitch',            -24, 24,    params.pitch},
    {'/granular/spray',            0,   1,     params.spray},
    {'/granular/envelope',         0,   4,     params.envelope},
    {'/granular/mix',              0,   1,     params.mix},
    {'/granular/grain_level',      0,   2,     params.grainLevel},
    {'/sample/level',              0,   2,     params.sampleLevel},
    {'/sample/speed',              0.25,4.0,   params.sampleSpeed},
    {'/sample/loop',               0,   1,     params.sampleLoop},
    {'/sample/play_start',         0,   1,     params.playStart},
    {'/sample/loop_start',         0,   1,     params.loopStart},
    {'/sample/loop_end',           0,   1,     params.loopEnd},
    {'/sample/crossfade',          0,   0.5,   params.crossfade},
    {'/sample/play_trigger',       0,   1000000, 0},
    {'/sample/stop_trigger',       0,   1000000, 0},
    {'/sample/seek',               0,   1,     0},
    {'/filter/cutoff',             20,  16000, params.filterCutoff},
    {'/filter/resonance',          0,   1,     params.filterResonance},
    {'/reverb/size',               0,   1,     params.reverbSize},
    {'/reverb/wet',                0,   1,     params.reverbWet},
    {'/master/gain',               0,   2,     params.masterGain},
    {'/granular/base_note',        36,  96,    params.baseNote},
    {'/granular/glide',            0,   1000,  params.glideMs},
    {'/granular/midi_mode',        0,   1,     params.midiMode},
    {'/granular/capture_trigger',  0,   1000000, 0},
    {'/granular/panic',            0,   1000000, 0},
  }
  for _, r in ipairs(regs) do
    ctx.params.register(r[1], { type='f', min=r[2], max=r[3], default=r[4] })
  end

  local playCounter, stopCounter, panicCounter, captureCounter = 0, 0, 0, 0

  local function activeMidiVoiceCount()
    local n = 0
    for i = 1, maxVoices do if voices[i].active then n = n + 1 end end
    return n
  end

  local function refreshSources()
    for i = 1, maxVoices do
      voices[i].sourceMixer:setGain(1, params.mode == 0 and 1.0 or 0.0)
      voices[i].sourceMixer:setGain(2, params.mode == 1 and 1.0 or 0.0)
    end
  end

  local function refreshVoiceTargets()
    local hasMidi = activeMidiVoiceCount() > 0
    for i = 1, maxVoices do
      local enabled = i <= params.voiceCount
      local target = 0.0
      if enabled then
        if params.midiMode > 0.5 and hasMidi then
          target = voices[i].active and voices[i].velocity or 0.0
        elseif params.midiMode > 0.5 then
          target = 0.0
        else
          target = (i == 1) and 1.0 or 0.0
        end
      end
      voices[i].targetGain = target
      if voices[i].granulator.setEnabled then
        voices[i].granulator:setEnabled(target > 0.0005)
      end
      if target <= 0.0005 then
        voices[i].granulator:reset()
      end
    end
  end

  local function forEachVoice(fn)
    for i = 1, maxVoices do fn(voices[i], i) end
  end

  local function allocateVoice(note)
    local limited = math.max(1, math.min(maxVoices, params.voiceCount))
    if noteToVoice[note] then return noteToVoice[note] end
    for i = 1, limited do if not voices[i].active then return i end end
    local oldest = 1
    for i = 2, limited do if voices[i].stamp < voices[oldest].stamp then oldest = i end end
    return oldest
  end

  local function triggerVoice(v, note, velocity)
    v.note = note
    v.active = true
    v.velocity = clamp((velocity or 100) / 127.0, 0.04, 1.0)
    v.targetPitch = params.pitch + noteToPitchSemitones(note, params.baseNote)
    if params.glideMs <= 0.5 then v.currentPitch = v.targetPitch end
    v.granulator:setPitch(v.currentPitch)
    v.granulator:reset()
    if v.granulator.setEnabled then v.granulator:setEnabled(true) end
    v.granulator:setFreeze(false)
    v.sample:setSpeed(params.sampleSpeed)
    applySampleWindow(v)
    v.sample:trigger()
    v.seedBlocks = 24
  end

  local function noteOn(note, velocity)
    local idx = allocateVoice(note)
    local v = voices[idx]
    if v.note and noteToVoice[v.note] == idx then noteToVoice[v.note] = nil end
    stamp = stamp + 1
    v.stamp = stamp
    triggerVoice(v, note, velocity)
    noteToVoice[note] = idx
    refreshVoiceTargets()
  end

  local function noteOff(note)
    local idx = noteToVoice[note]
    if not idx then return end
    local v = voices[idx]
    v.active = false
    v.note = nil
    v.velocity = 0.0
    noteToVoice[note] = nil
    v.sample:stop()
    v.granulator:reset()
    if v.granulator.setEnabled then v.granulator:setEnabled(false) end
    refreshVoiceTargets()
  end

  local function panic()
    noteToVoice = {}
    forEachVoice(function(v)
      v.active = false
      v.note = nil
      v.velocity = 0.0
      v.targetGain = 0.0
      v.currentGain = 0.0
      v.sample:stop()
      v.granulator:reset()
      if v.granulator.setEnabled then v.granulator:setEnabled(false) end
    end)
    if params.midiMode < 0.5 then voices[1].targetGain = 1.0 end
  end

  local function playManual()
    params.mode = 1
    refreshSources()
    params.midiMode = 0
    voices[1].active = false
    voices[1].velocity = 1.0
    voices[1].targetPitch = params.pitch
    voices[1].currentPitch = params.pitch
    voices[1].granulator:reset()
    if voices[1].granulator.setEnabled then voices[1].granulator:setEnabled(true) end
    voices[1].granulator:setFreeze(false)
    voices[1].sample:setSpeed(params.sampleSpeed)
    applySampleWindow(voices[1])
    voices[1].sample:trigger()
    voices[1].seedBlocks = 24
    refreshVoiceTargets()
  end

  local function stopAllSamples()
    forEachVoice(function(v)
      v.sample:stop()
      v.granulator:reset()
      if v.granulator.setEnabled then v.granulator:setEnabled(false) end
    end)
  end

  local function copyCaptureToSamples()
    local sampleRate = (ctx.host and ctx.host.getSampleRate and tonumber(ctx.host.getSampleRate())) or 48000.0
    local samplesBack = math.max(1, math.floor(params.captureSeconds * sampleRate))
    local copied = false
    local captureNode = capture.__node or capture
    forEachVoice(function(v)
      local playbackNode = v.sample.__node or v.sample
      local ok = false
      if captureNode and captureNode.copyRecentToLoop then
        ok = captureNode:copyRecentToLoop(playbackNode, samplesBack, false)
      end
      if ok and captureNode and captureNode.copyRecentToGranulator then
        local granNode = v.granulator.__node or v.granulator
        captureNode:copyRecentToGranulator(granNode, samplesBack)
      end
      if ok then
        copied = true
        v.sample:seek(0)
        applySampleWindow(v)
      end
    end)
    if copied then
      params.mode = 1
      params.freeze = 1
      refreshSources()
      forEachVoice(function(v) v.granulator:reset(); v.granulator:setFreeze(false) end)
    end
  end

  refreshSources()
  refreshVoiceTargets()

  local function onParamChange(path, value)
    if path == '/granular/mode' then
      params.mode = round(value)
      refreshSources()
    elseif path == '/granular/freeze' then
      params.freeze = round(value)
      forEachVoice(function(v) v.granulator:setFreeze(params.freeze > 0.5) end)
    elseif path == '/granular/voice_count' then
      params.voiceCount = math.max(1, math.min(maxVoices, round(value)))
      refreshVoiceTargets()
    elseif path == '/granular/capture_seconds' then
      params.captureSeconds = clamp(value, 1, 30)
      capture:setCaptureSeconds(params.captureSeconds)
      forEachVoice(function(v) if v.granulator.setBufferSeconds then v.granulator:setBufferSeconds(params.captureSeconds) end end)
    elseif path == '/granular/grain_size' then
      params.grainSize = value; forEachVoice(function(v) v.granulator:setGrainSize(value) end)
    elseif path == '/granular/density' then
      params.density = value; forEachVoice(function(v) v.granulator:setDensity(value) end)
    elseif path == '/granular/position' then
      params.position = clamp(value, 0.0, 1.0); forEachVoice(function(v) v.granulator:setPosition(params.position) end)
    elseif path == '/granular/pitch' then
      local delta = value - params.pitch
      params.pitch = value
      forEachVoice(function(v) v.targetPitch = v.targetPitch + delta end)
    elseif path == '/granular/spray' then
      params.spray = value; forEachVoice(function(v) v.granulator:setSpray(value) end)
    elseif path == '/granular/envelope' then
      params.envelope = round(value); forEachVoice(function(v) v.granulator:setEnvelope(params.envelope) end)
    elseif path == '/granular/mix' then
      params.mix = value; forEachVoice(function(v) v.granulator:setMix(value) end)
    elseif path == '/granular/grain_level' then
      params.grainLevel = value; preFxMixer:setGain(1, value)
    elseif path == '/sample/level' then
      params.sampleLevel = value; preFxMixer:setGain(2, value)
    elseif path == '/sample/speed' then
      params.sampleSpeed = value; forEachVoice(function(v) v.sample:setSpeed(value) end)
    elseif path == '/sample/loop' then
      params.sampleLoop = 1; forEachVoice(function(v) v.sample:setOneShot(false) end)
    elseif path == '/sample/play_start' then
      params.playStart = clamp(value, 0, 1); forEachVoice(applySampleWindow)
    elseif path == '/sample/loop_start' then
      params.loopStart = clamp(value, 0, 1); forEachVoice(applySampleWindow)
    elseif path == '/sample/loop_end' then
      params.loopEnd = clamp(value, 0, 1); forEachVoice(applySampleWindow)
    elseif path == '/sample/crossfade' then
      params.crossfade = clamp(value, 0, 0.5); forEachVoice(applySampleWindow)
    elseif path == '/sample/play_trigger' then
      local n = round(value); if n ~= playCounter then playCounter = n; playManual() end
    elseif path == '/sample/stop_trigger' then
      local n = round(value); if n ~= stopCounter then stopCounter = n; stopAllSamples(); params.midiMode = 1; refreshVoiceTargets() end
    elseif path == '/sample/seek' then
      forEachVoice(function(v) v.sample:seek(value) end)
      local loopStart, loopEnd = loopStartEnd()
      if loopEnd > loopStart then
        params.position = clamp((value - loopStart) / (loopEnd - loopStart), 0.0, 1.0)
      else
        params.position = clamp(value, 0.0, 1.0)
      end
      forEachVoice(function(v) v.granulator:setPosition(params.position) end)
    elseif path == '/filter/cutoff' then
      params.filterCutoff = value; filter:setCutoff(value)
    elseif path == '/filter/resonance' then
      params.filterResonance = value; filter:setResonance(value)
    elseif path == '/reverb/size' then
      params.reverbSize = value; reverb:setRoomSize(value)
    elseif path == '/reverb/wet' then
      params.reverbWet = value; reverb:setWetLevel(value); reverb:setDryLevel(1.0 - value)
    elseif path == '/master/gain' then
      params.masterGain = value; masterGain:setGain(value)
    elseif path == '/granular/base_note' then
      params.baseNote = round(value)
    elseif path == '/granular/glide' then
      params.glideMs = value
    elseif path == '/granular/midi_mode' then
      params.midiMode = round(value); refreshVoiceTargets()
    elseif path == '/granular/capture_trigger' then
      local n = round(value); if n ~= captureCounter then captureCounter = n; copyCaptureToSamples() end
    elseif path == '/granular/panic' then
      local n = round(value); if n ~= panicCounter then panicCounter = n; panic() end
    end
  end

  local function process(blockSize, sr)
    local dt = blockSize / math.max(1.0, sr)
    local hasMidi = activeMidiVoiceCount() > 0
    for i = 1, maxVoices do
      local v = voices[i]
      if params.midiMode < 0.5 and i == 1 and not hasMidi then v.targetPitch = params.pitch end
      if params.glideMs > 0.5 then
        local coeff = clamp(dt / (params.glideMs / 1000.0), 0.001, 1.0)
        v.currentPitch = v.currentPitch + (v.targetPitch - v.currentPitch) * coeff
      else
        v.currentPitch = v.targetPitch
      end
      v.granulator:setPitch(v.currentPitch)
      if params.mode == 1 and v.sample and v.sample.getLoopAwarePosition then
        v.granulator:setPosition(absoluteToRegionRelative(v.sample:getLoopAwarePosition()))
      elseif params.mode == 0 then
        v.granulator:setPosition(params.position)
      end

      -- Smooth voice gain in Lua at block rate. Fast enough to avoid ugly hard cuts.
      local gainCoeff = clamp(dt / 0.025, 0.05, 1.0)
      v.currentGain = v.currentGain + (v.targetGain - v.currentGain) * gainCoeff
      voiceMixer:setGain(i, v.currentGain)
      drySampleMixer:setGain(i, v.currentGain)

      -- In sample mode, after a short seeding period, honor the requested freeze state.
      if v.seedBlocks and v.seedBlocks > 0 then
        v.seedBlocks = v.seedBlocks - 1
        v.granulator:setFreeze(false)
      elseif params.mode == 1 and params.freeze > 0.5 then
        v.granulator:setFreeze(true)
      else
        v.granulator:setFreeze(params.freeze > 0.5)
      end
    end

    if Midi and Midi.pollInputEvent then
      while true do
        local ev = Midi.pollInputEvent()
        if ev == nil then break end
        local typ = tonumber(ev.type or 0) or 0
        local d1 = tonumber(ev.data1 or 0) or 0
        local d2 = tonumber(ev.data2 or 0) or 0

        if Midi.NOTE_ON and typ == Midi.NOTE_ON and d2 > 0 then
          params.midiMode = 1
          noteOn(d1, d2)
        elseif (Midi.NOTE_OFF and typ == Midi.NOTE_OFF) or (Midi.NOTE_ON and typ == Midi.NOTE_ON and d2 <= 0) then
          noteOff(d1)
        elseif Midi.CONTROL_CHANGE and typ == Midi.CONTROL_CHANGE then
          if d1 == 1 then
            onParamChange('/granular/position', clamp(d2 / 127.0, 0, 1))
          elseif d1 == 74 then
            onParamChange('/granular/spray', clamp(d2 / 127.0, 0, 1))
          elseif d1 == 11 then
            onParamChange('/granular/mix', clamp(d2 / 127.0, 0, 1))
          elseif d1 == 123 then
            panic()
          end
        end
      end
    end
  end

  return {
    description = 'GranularLab — polyphonic granular sampler with live recording and MIDI triggering',
    output = masterGain,
    onParamChange = onParamChange,
    process = process,
  }
end
