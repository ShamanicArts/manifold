-- VideoPolySamplerLab — polyphonic audio authority for video sampler verification.
--
-- Audio capture/playback lives in DSP. Video pixels do not. The UI commits the
-- video capture ring with the exact same samplesBack used here for audio, then
-- renders one sampler surface per active audio voice using each voice sample
-- node's loop-aware playback position.

local MAX_VOICES = 8

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0.0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v)
  return math.floor((tonumber(v) or 0) + 0.5)
end

local function velocityToGain(velocity)
  return clamp((tonumber(velocity) or 0) / 127.0, 0.0, 1.0)
end

function buildPlugin(ctx)
  local params = {
    captureSeconds = 4.0,
    speed = 1.0,
    playStart = 0.0,
    loopStart = 0.0,
    loopEnd = 1.0,
    crossfade = 0.03,
    oneShot = 0,
    output = 0.75,
    rootNote = 60,
    pitchTracking = 1,
    midiNote = 60,
    midiVelocity = 100,
    polyphony = 1,
    voiceCount = MAX_VOICES,
  }

  local input = ctx.primitives.PassthroughNode.new(2)
  local capture = ctx.primitives.RetrospectiveCaptureNode.new(2)
  capture:setCaptureSeconds(30.0)

  -- Sink the capture node so it is processed even when all sample voices are idle.
  local captureSink = ctx.primitives.GainNode.new(2)
  captureSink:setGain(0.0)

  local mixer = ctx.primitives.MixerNode.new()
  mixer:setInputCount(MAX_VOICES)

  local outputGain = ctx.primitives.GainNode.new(2)
  outputGain:setGain(params.output)

  ctx.graph.connect(input, capture)
  ctx.graph.connect(capture, captureSink)
  ctx.graph.connect(mixer, outputGain)

  if ctx.graph.markMonitor then ctx.graph.markMonitor(outputGain) end
  if ctx.graph.markOutput then ctx.graph.markOutput(outputGain) end

  local voices = {}
  local noteToVoice = {}
  local stamp = 0

  local function activeVoiceLimit()
    return math.max(1, math.min(MAX_VOICES, round(params.voiceCount)))
  end

  local function noteSpeedRatio(note)
    if params.pitchTracking <= 0.5 then return 1.0 end
    return math.pow(2.0, ((tonumber(note) or params.rootNote) - params.rootNote) / 12.0)
  end

  local function speedForNote(note)
    return clamp(params.speed * noteSpeedRatio(note), -8.0, 8.0)
  end

  local function applyWindowToVoice(v)
    local loopStart = clamp(params.loopStart, 0.0, 0.98)
    local loopEnd = clamp(params.loopEnd, loopStart + 0.001, 1.0)
    local playStart = clamp(params.playStart, loopStart, loopEnd)
    v.sample:setPlayStart(playStart)
    v.sample:setLoopStart(loopStart)
    v.sample:setLoopEnd(loopEnd)
    v.sample:setCrossfade(params.crossfade)
    v.sample:setOneShot(params.oneShot > 0.5)
  end

  local function applyWindow()
    for i = 1, MAX_VOICES do applyWindowToVoice(voices[i]) end
  end

  local function setVoiceSpeed(v)
    v.sample:setSpeed(speedForNote(v.note or params.rootNote))
  end

  local function refreshVoiceSpeeds()
    for i = 1, MAX_VOICES do setVoiceSpeed(voices[i]) end
  end

  local function clearNoteMappingForVoice(index)
    local old = voices[index] and voices[index].note or nil
    if old ~= nil and noteToVoice[old] == index then
      noteToVoice[old] = nil
    end
  end

  local function stopVoice(index)
    local v = voices[index]
    if not v then return end
    clearNoteMappingForVoice(index)
    v.active = false
    v.note = nil
    v.velocity = 0.0
    mixer:setGain(index, 0.0)
    v.sample:stop()
    setVoiceSpeed(v)
  end

  local function stopAll()
    for i = 1, MAX_VOICES do stopVoice(i) end
  end

  local function allocateVoice(note)
    local limit = activeVoiceLimit()
    if params.polyphony <= 0.5 then
      return 1
    end
    if noteToVoice[note] then return noteToVoice[note] end
    for i = 1, limit do
      if not voices[i].active then return i end
    end
    local oldest = 1
    for i = 2, limit do
      if (voices[i].stamp or 0) < (voices[oldest].stamp or 0) then oldest = i end
    end
    return oldest
  end

  local function triggerVoice(index, note, velocity)
    local v = voices[index]
    if not v then return end
    if params.polyphony <= 0.5 then stopAll() else clearNoteMappingForVoice(index) end
    note = round(clamp(note, 0, 127))
    velocity = round(clamp(velocity, 1, 127))
    stamp = stamp + 1
    v.stamp = stamp
    v.note = note
    v.velocity = velocity
    v.active = true
    noteToVoice[note] = index
    mixer:setGain(index, velocityToGain(velocity))
    applyWindowToVoice(v)
    setVoiceSpeed(v)
    v.sample:trigger()
  end

  local function noteOn(note, velocity)
    if (tonumber(velocity) or 0) <= 0 then return end
    local safeNote = round(clamp(note, 0, 127))
    triggerVoice(allocateVoice(safeNote), safeNote, velocity)
  end

  local function noteOff(note)
    local safeNote = round(clamp(note, 0, 127))
    local index = noteToVoice[safeNote]
    if not index then return end
    if params.oneShot <= 0.5 then
      stopVoice(index)
    else
      voices[index].active = false
      voices[index].note = nil
      voices[index].velocity = 0.0
      noteToVoice[safeNote] = nil
    end
  end

  for i = 1, MAX_VOICES do
    local sample = ctx.primitives.SampleRegionPlaybackNode.new(2)
    sample:setSpeed(params.speed)
    sample:setOneShot(false)
    sample:setPlayStart(params.playStart)
    sample:setLoopStart(params.loopStart)
    sample:setLoopEnd(params.loopEnd)
    sample:setCrossfade(params.crossfade)

    voices[i] = {
      sample = sample,
      active = false,
      note = nil,
      velocity = 0.0,
      stamp = 0,
    }

    mixer:setGain(i, 0.0)
    mixer:setPan(i, 0.0)
    ctx.graph.connect(sample, mixer, 0, (i - 1) * 2)
  end

  if ctx.graph.nameNode then
    ctx.graph.nameNode(input, "/video_poly_sampler_lab/input")
    ctx.graph.nameNode(capture, "/video_poly_sampler_lab/capture")
    ctx.graph.nameNode(captureSink, "/video_poly_sampler_lab/capture_sink")
    ctx.graph.nameNode(mixer, "/video_poly_sampler_lab/mixer")
    ctx.graph.nameNode(outputGain, "/video_poly_sampler_lab/output")
    for i = 1, MAX_VOICES do
      ctx.graph.nameNode(voices[i].sample, "/video_poly_sampler_lab/voice/" .. i .. "/sample")
    end
  end

  local regs = {
    { "/video_poly_sampler_lab/capture_seconds", 0.25, 6.0, params.captureSeconds },
    { "/video_poly_sampler_lab/capture_trigger", 0, 1000000, 0 },
    { "/video_poly_sampler_lab/play_trigger", 0, 1000000, 0 },
    { "/video_poly_sampler_lab/stop_trigger", 0, 1000000, 0 },
    { "/video_poly_sampler_lab/seek", 0, 1, 0 },
    { "/video_poly_sampler_lab/speed", -2, 4, params.speed },
    { "/video_poly_sampler_lab/play_start", 0, 1, params.playStart },
    { "/video_poly_sampler_lab/loop_start", 0, 1, params.loopStart },
    { "/video_poly_sampler_lab/loop_end", 0, 1, params.loopEnd },
    { "/video_poly_sampler_lab/crossfade", 0, 0.5, params.crossfade },
    { "/video_poly_sampler_lab/one_shot", 0, 1, params.oneShot },
    { "/video_poly_sampler_lab/output", 0, 2, params.output },
    { "/video_poly_sampler_lab/root_note", 0, 127, params.rootNote },
    { "/video_poly_sampler_lab/pitch_tracking", 0, 1, params.pitchTracking },
    { "/video_poly_sampler_lab/polyphony", 0, 1, params.polyphony },
    { "/video_poly_sampler_lab/voice_count", 1, MAX_VOICES, params.voiceCount },
    { "/video_poly_sampler_lab/midi_note", 0, 127, params.midiNote },
    { "/video_poly_sampler_lab/midi_velocity", 0, 127, params.midiVelocity },
    { "/video_poly_sampler_lab/midi_note_on_trigger", 0, 9000000, 0 },
    { "/video_poly_sampler_lab/midi_note_off_trigger", 0, 9000000, 0 },
  }
  for _, r in ipairs(regs) do
    ctx.params.register(r[1], { type = "f", min = r[2], max = r[3], default = r[4] })
  end

  local captureCounter = 0
  local playCounter = 0
  local stopCounter = 0
  local midiNoteOnCounter = 0
  local midiNoteOffCounter = 0

  local function decodeMidiTrigger(value)
    local code = round(value)
    local payload = code % 16384
    local note = math.floor(payload / 128)
    local velocity = payload % 128
    return note, velocity, code
  end

  local function copyAudioCaptureToSamples()
    local sampleRate = (ctx.host and ctx.host.getSampleRate and tonumber(ctx.host.getSampleRate())) or 44100.0
    local samplesBack = math.max(1, math.floor(params.captureSeconds * sampleRate))
    local captureNode = capture.__node or capture
    local copied = false
    if captureNode and captureNode.copyRecentToLoop then
      for i = 1, MAX_VOICES do
        local sampleNode = voices[i].sample.__node or voices[i].sample
        local ok = captureNode:copyRecentToLoop(sampleNode, samplesBack, false)
        copied = copied or ok == true
      end
    end
    if copied then
      for i = 1, MAX_VOICES do
        voices[i].sample:seek(0)
        applyWindowToVoice(voices[i])
        setVoiceSpeed(voices[i])
      end
    end
  end

  local function onParamChange(path, value)
    if path == "/video_poly_sampler_lab/capture_seconds" then
      params.captureSeconds = clamp(value, 0.25, 6.0)
    elseif path == "/video_poly_sampler_lab/capture_trigger" then
      local n = round(value)
      if n ~= captureCounter then
        captureCounter = n
        copyAudioCaptureToSamples()
      end
    elseif path == "/video_poly_sampler_lab/play_trigger" then
      local n = round(value)
      if n ~= playCounter then
        playCounter = n
        triggerVoice(1, params.rootNote, 127)
      end
    elseif path == "/video_poly_sampler_lab/stop_trigger" then
      local n = round(value)
      if n ~= stopCounter then
        stopCounter = n
        stopAll()
      end
    elseif path == "/video_poly_sampler_lab/seek" then
      local pos = clamp(value, 0.0, 1.0)
      for i = 1, MAX_VOICES do voices[i].sample:seek(pos) end
    elseif path == "/video_poly_sampler_lab/speed" then
      params.speed = clamp(value, -2.0, 4.0)
      refreshVoiceSpeeds()
    elseif path == "/video_poly_sampler_lab/play_start" then
      params.playStart = clamp(value, 0.0, 1.0)
      applyWindow()
    elseif path == "/video_poly_sampler_lab/loop_start" then
      params.loopStart = clamp(value, 0.0, 1.0)
      applyWindow()
    elseif path == "/video_poly_sampler_lab/loop_end" then
      params.loopEnd = clamp(value, 0.0, 1.0)
      applyWindow()
    elseif path == "/video_poly_sampler_lab/crossfade" then
      params.crossfade = clamp(value, 0.0, 0.5)
      applyWindow()
    elseif path == "/video_poly_sampler_lab/one_shot" then
      params.oneShot = round(value)
      applyWindow()
    elseif path == "/video_poly_sampler_lab/output" then
      params.output = clamp(value, 0.0, 2.0)
      outputGain:setGain(params.output)
    elseif path == "/video_poly_sampler_lab/root_note" then
      params.rootNote = round(clamp(value, 0, 127))
      refreshVoiceSpeeds()
    elseif path == "/video_poly_sampler_lab/pitch_tracking" then
      params.pitchTracking = round(value)
      refreshVoiceSpeeds()
    elseif path == "/video_poly_sampler_lab/polyphony" then
      params.polyphony = round(value)
      if params.polyphony <= 0.5 then
        for i = 2, MAX_VOICES do stopVoice(i) end
      end
    elseif path == "/video_poly_sampler_lab/voice_count" then
      params.voiceCount = round(clamp(value, 1, MAX_VOICES))
      for i = params.voiceCount + 1, MAX_VOICES do stopVoice(i) end
    elseif path == "/video_poly_sampler_lab/midi_note" then
      params.midiNote = round(clamp(value, 0, 127))
    elseif path == "/video_poly_sampler_lab/midi_velocity" then
      params.midiVelocity = round(clamp(value, 0, 127))
    elseif path == "/video_poly_sampler_lab/midi_note_on_trigger" then
      local note, velocity, n = decodeMidiTrigger(value)
      if n ~= midiNoteOnCounter then
        midiNoteOnCounter = n
        params.midiNote = note
        params.midiVelocity = velocity
        noteOn(note, velocity)
      end
    elseif path == "/video_poly_sampler_lab/midi_note_off_trigger" then
      local note, _, n = decodeMidiTrigger(value)
      if n ~= midiNoteOffCounter then
        midiNoteOffCounter = n
        params.midiNote = note
        noteOff(note)
      end
    end
  end

  return {
    description = "VideoPolySamplerLab DSP authority",
    output = outputGain,
    onParamChange = onParamChange,
    process = function() end,
  }
end
