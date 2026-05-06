-- VideoSamplerLab — minimal audio sampler authority for video sampler verification.
--
-- Audio capture/playback lives in DSP. Video pixels do not. The UI commits the
-- video capture ring with the exact same samplesBack used here for audio.

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0.0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v)
  return math.floor((tonumber(v) or 0) + 0.5)
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
  }

  local input = ctx.primitives.PassthroughNode.new(2)
  local capture = ctx.primitives.RetrospectiveCaptureNode.new(2)
  capture:setCaptureSeconds(30.0)

  -- Sink the capture node so it is processed even when the sample output is idle.
  local captureSink = ctx.primitives.GainNode.new(2)
  captureSink:setGain(0.0)

  local sample = ctx.primitives.SampleRegionPlaybackNode.new(2)
  sample:setSpeed(params.speed)
  sample:setOneShot(false)
  sample:setPlayStart(params.playStart)
  sample:setLoopStart(params.loopStart)
  sample:setLoopEnd(params.loopEnd)
  sample:setCrossfade(params.crossfade)

  local outputGain = ctx.primitives.GainNode.new(2)
  outputGain:setGain(params.output)

  ctx.graph.connect(input, capture)
  ctx.graph.connect(capture, captureSink)
  ctx.graph.connect(sample, outputGain)

  if ctx.graph.markMonitor then ctx.graph.markMonitor(outputGain) end
  if ctx.graph.markOutput then ctx.graph.markOutput(outputGain) end

  if ctx.graph.nameNode then
    ctx.graph.nameNode(input, "/video_sampler_lab/input")
    ctx.graph.nameNode(capture, "/video_sampler_lab/capture")
    ctx.graph.nameNode(captureSink, "/video_sampler_lab/capture_sink")
    ctx.graph.nameNode(sample, "/video_sampler_lab/sample")
    ctx.graph.nameNode(outputGain, "/video_sampler_lab/output")
  end

  local regs = {
    { "/video_sampler_lab/capture_seconds", 0.25, 6.0, params.captureSeconds },
    { "/video_sampler_lab/capture_trigger", 0, 1000000, 0 },
    { "/video_sampler_lab/play_trigger", 0, 1000000, 0 },
    { "/video_sampler_lab/stop_trigger", 0, 1000000, 0 },
    { "/video_sampler_lab/seek", 0, 1, 0 },
    { "/video_sampler_lab/speed", 0, 8, params.speed },
    { "/video_sampler_lab/play_start", 0, 1, params.playStart },
    { "/video_sampler_lab/loop_start", 0, 1, params.loopStart },
    { "/video_sampler_lab/loop_end", 0, 1, params.loopEnd },
    { "/video_sampler_lab/crossfade", 0, 0.5, params.crossfade },
    { "/video_sampler_lab/one_shot", 0, 1, params.oneShot },
    { "/video_sampler_lab/output", 0, 2, params.output },
    { "/video_sampler_lab/root_note", 0, 127, params.rootNote },
    { "/video_sampler_lab/pitch_tracking", 0, 1, params.pitchTracking },
    { "/video_sampler_lab/midi_note", 0, 127, params.midiNote },
    { "/video_sampler_lab/midi_velocity", 0, 127, params.midiVelocity },
    { "/video_sampler_lab/midi_note_on_trigger", 0, 9000000, 0 },
    { "/video_sampler_lab/midi_note_off_trigger", 0, 9000000, 0 },
  }
  for _, r in ipairs(regs) do
    ctx.params.register(r[1], { type = "f", min = r[2], max = r[3], default = r[4] })
  end

  local captureCounter = 0
  local playCounter = 0
  local stopCounter = 0
  local midiNoteOnCounter = 0
  local midiNoteOffCounter = 0
  local activeNote = nil
  local applyWindow

  local function decodeMidiTrigger(value)
    local code = round(value)
    local payload = code % 16384
    local note = math.floor(payload / 128)
    local velocity = payload % 128
    return note, velocity, code
  end

  local function noteSpeedRatio(note)
    if params.pitchTracking <= 0.5 then return 1.0 end
    return math.pow(2.0, ((tonumber(note) or params.rootNote) - params.rootNote) / 12.0)
  end

  local function setSampleSpeedForNote(note)
    sample:setSpeed(clamp(params.speed * noteSpeedRatio(note), 0.0, 8.0))
  end

  local function noteOn(note, velocity)
    if (tonumber(velocity) or 0) <= 0 then return end
    activeNote = round(note)
    setSampleSpeedForNote(activeNote)
    applyWindow()
    sample:trigger()
  end

  local function noteOff(note)
    local n = round(note)
    if activeNote ~= n then return end
    activeNote = nil
    if params.oneShot <= 0.5 then
      sample:stop()
    end
    setSampleSpeedForNote(params.rootNote)
  end

  function applyWindow()
    local loopStart = clamp(params.loopStart, 0.0, 0.98)
    local loopEnd = clamp(params.loopEnd, loopStart + 0.001, 1.0)
    local playStart = clamp(params.playStart, loopStart, loopEnd)
    sample:setPlayStart(playStart)
    sample:setLoopStart(loopStart)
    sample:setLoopEnd(loopEnd)
    sample:setCrossfade(params.crossfade)
  end

  local function copyAudioCaptureToSample()
    local sampleRate = (ctx.host and ctx.host.getSampleRate and tonumber(ctx.host.getSampleRate())) or 44100.0
    local samplesBack = math.max(1, math.floor(params.captureSeconds * sampleRate))
    local captureNode = capture.__node or capture
    local sampleNode = sample.__node or sample
    local ok = false
    if captureNode and captureNode.copyRecentToLoop then
      ok = captureNode:copyRecentToLoop(sampleNode, samplesBack, false)
    end
    if ok then
      sample:seek(0)
      applyWindow()
    end
  end

  local function onParamChange(path, value)
    if path == "/video_sampler_lab/capture_seconds" then
      params.captureSeconds = clamp(value, 0.25, 6.0)
    elseif path == "/video_sampler_lab/capture_trigger" then
      local n = round(value)
      if n ~= captureCounter then
        captureCounter = n
        copyAudioCaptureToSample()
      end
    elseif path == "/video_sampler_lab/play_trigger" then
      local n = round(value)
      if n ~= playCounter then
        playCounter = n
        activeNote = nil
        setSampleSpeedForNote(params.rootNote)
        sample:trigger()
      end
    elseif path == "/video_sampler_lab/stop_trigger" then
      local n = round(value)
      if n ~= stopCounter then
        stopCounter = n
        activeNote = nil
        sample:stop()
        setSampleSpeedForNote(params.rootNote)
      end
    elseif path == "/video_sampler_lab/seek" then
      sample:seek(clamp(value, 0.0, 1.0))
    elseif path == "/video_sampler_lab/speed" then
      params.speed = clamp(value, 0.0, 8.0)
      setSampleSpeedForNote(activeNote or params.rootNote)
    elseif path == "/video_sampler_lab/play_start" then
      params.playStart = clamp(value, 0.0, 1.0)
      applyWindow()
    elseif path == "/video_sampler_lab/loop_start" then
      params.loopStart = clamp(value, 0.0, 1.0)
      applyWindow()
    elseif path == "/video_sampler_lab/loop_end" then
      params.loopEnd = clamp(value, 0.0, 1.0)
      applyWindow()
    elseif path == "/video_sampler_lab/crossfade" then
      params.crossfade = clamp(value, 0.0, 0.5)
      applyWindow()
    elseif path == "/video_sampler_lab/one_shot" then
      params.oneShot = round(value)
      sample:setOneShot(params.oneShot > 0.5)
    elseif path == "/video_sampler_lab/output" then
      params.output = clamp(value, 0.0, 2.0)
      outputGain:setGain(params.output)
    elseif path == "/video_sampler_lab/root_note" then
      params.rootNote = round(clamp(value, 0, 127))
      setSampleSpeedForNote(activeNote or params.rootNote)
    elseif path == "/video_sampler_lab/pitch_tracking" then
      params.pitchTracking = round(value)
      setSampleSpeedForNote(activeNote or params.rootNote)
    elseif path == "/video_sampler_lab/midi_note" then
      params.midiNote = round(clamp(value, 0, 127))
    elseif path == "/video_sampler_lab/midi_velocity" then
      params.midiVelocity = round(clamp(value, 0, 127))
    elseif path == "/video_sampler_lab/midi_note_on_trigger" then
      local note, velocity, n = decodeMidiTrigger(value)
      if n ~= midiNoteOnCounter then
        midiNoteOnCounter = n
        params.midiNote = note
        params.midiVelocity = velocity
        noteOn(note, velocity)
      end
    elseif path == "/video_sampler_lab/midi_note_off_trigger" then
      local note, _, n = decodeMidiTrigger(value)
      if n ~= midiNoteOffCounter then
        midiNoteOffCounter = n
        params.midiNote = note
        noteOff(note)
      end
    end
  end

  return {
    description = "VideoSamplerLab DSP authority",
    output = outputGain,
    onParamChange = onParamChange,
    process = function() end,
  }
end
