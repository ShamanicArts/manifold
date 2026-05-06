-- AVSampler — audio authority for segmented A/V sampler.
-- Uses the same FxSlot/FxDefs stack as Standalone_FX / FX rack modules.

local NS = "/avsampler"
local MAX = 8
local MAX_MAPPINGS = 8
local MAX_MAPPING_TARGETS = 128
local MAJOR_OFFSETS = { 0, 2, 4, 5, 7, 9, 11, 12 }

local function dirname(path)
  return (tostring(path or ""):gsub("/+$", ""):match("^(.*)/[^/]+$") or ".")
end

local function join(...)
  local parts = { ... }
  local out = ""
  for i = 1, #parts do
    local part = tostring(parts[i] or "")
    if part ~= "" then
      out = out == "" and part or (out:gsub("/+$", "") .. "/" .. part:gsub("^/+", ""))
    end
  end
  return out
end

local function appendPackageRoot(root)
  if type(root) ~= "string" or root == "" then return end
  local entry = root .. "/?.lua;" .. root .. "/?/init.lua"
  local current = tostring(package.path or "")
  if not current:find(entry, 1, true) then package.path = current == "" and entry or (current .. ";" .. entry) end
end

local scriptDir = tostring(__manifoldDspScriptDir or ".")
local projectRoot = dirname(scriptDir)
local mainRoot = join(projectRoot, "../Main")
appendPackageRoot(join(mainRoot, "lib"))
appendPackageRoot(join(mainRoot, "ui"))
appendPackageRoot(join(mainRoot, "dsp"))

local ParameterBinder = require("parameter_binder")
local FxDefs = require("fx_definitions")
local FxSlot = require("fx_slot")
local FxRackModule = require("rack_modules.fx")

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0.0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v) return math.floor((tonumber(v) or 0) + 0.5) end
local function velocityToGain(v) return clamp((tonumber(v) or 0) / 127.0, 0.0, 1.0) end

local function noteToSlice(note, rootNote)
  local n = round(note)
  local root = round(rootNote)
  for i = 1, #MAJOR_OFFSETS do if n == root + MAJOR_OFFSETS[i] then return i end end
  return nil
end

local function connectMixerInput(ctx, mixer, inputIndex, source)
  mixer:setInputCount(inputIndex)
  mixer:setGain(inputIndex, 1.0)
  mixer:setPan(inputIndex, 0.0)
  ctx.graph.connect(source, mixer, 0, (inputIndex - 1) * 2)
end

function buildPlugin(ctx)
  local maxFxParams = 5
  local fxDefs = FxDefs.buildFxDefs(ctx.primitives, ctx.graph)
  local params = {
    captureSeconds = 4.0, mode = 0, captureMode = 0,
    speed = 1.0, output = 0.8, rootNote = 60, pitchTracking = 1, voiceCount = MAX,
    playStart = 0.0, loopStart = 0.0, loopEnd = 1.0, crossfade = 0.03, oneShot = 0,
    selectedSlice = 1,
  }
  local sliceStarts, sliceVelocities = {}, {}
  for i = 1, MAX do sliceStarts[i] = (i - 1) / MAX; sliceVelocities[i] = 127 end

  local P = ctx.primitives
  local input = P.PassthroughNode.new(2)
  local capture = P.RetrospectiveCaptureNode.new(2)
  capture:setCaptureSeconds(30.0)
  local captureSink = P.GainNode.new(2); captureSink:setGain(0.0)
  local polyMixer = P.MixerNode.new(); polyMixer:setInputCount(MAX)
  local sliceMixer = P.MixerNode.new(); sliceMixer:setInputCount(MAX)
  local polyGain = P.GainNode.new(2)
  local sliceGain = P.GainNode.new(2)
  local modeMix = P.MixerNode.new(); modeMix:setInputCount(2)

  local fxCtx = { primitives = P, graph = ctx.graph, connectMixerInput = function(mixer, inputIndex, source) connectMixerInput(ctx, mixer, inputIndex, source) end }
  local fxSlots = {}
  local fxRack = FxRackModule.create({
    ctx = ctx,
    slots = fxSlots,
    FxSlot = FxSlot,
    ParameterBinder = ParameterBinder,
    fxCtx = fxCtx,
    fxDefs = fxDefs,
    maxFxParams = maxFxParams,
  })
  local fx1 = fxRack.createSlot(1)
  local fx2 = fxRack.createSlot(2)
  local outputGain = P.GainNode.new(2); outputGain:setGain(params.output)

  ctx.graph.connect(input, capture)
  ctx.graph.connect(capture, captureSink)
  ctx.graph.connect(polyMixer, polyGain)
  ctx.graph.connect(sliceMixer, sliceGain)
  connectMixerInput(ctx, modeMix, 1, polyGain)
  connectMixerInput(ctx, modeMix, 2, sliceGain)
  ctx.graph.connect(modeMix, fx1.input)
  ctx.graph.connect(fx1.output, fx2.input)
  ctx.graph.connect(fx2.output, outputGain)

  if ctx.graph.markInput then ctx.graph.markInput(input) end
  if ctx.graph.markMonitor then ctx.graph.markMonitor(outputGain) end
  if ctx.graph.markOutput then ctx.graph.markOutput(outputGain) end

  local voices, slices, noteToVoice = {}, {}, {}
  local heldNotes = {}
  local loopNotes = {}
  local loopNoteLookup = {}
  local stamp = 0

  local function applyModeGains()
    polyGain:setGain(params.mode < 0.5 and 1.0 or 0.0)
    sliceGain:setGain(params.mode >= 0.5 and 1.0 or 0.0)
  end

  local function activeVoiceLimit() return math.max(1, math.min(MAX, round(params.voiceCount))) end
  local function noteSpeedRatio(note) return params.pitchTracking <= 0.5 and 1.0 or math.pow(2.0, ((tonumber(note) or params.rootNote) - params.rootNote) / 12.0) end
  local function speedForNote(note) return clamp(params.speed * noteSpeedRatio(note), -8.0, 8.0) end

  local function applyPolyWindow(v)
    local loopStart = clamp(params.loopStart, 0.0, 0.98)
    local loopEnd = clamp(params.loopEnd, loopStart + 0.001, 1.0)
    local playStart = clamp(params.playStart, loopStart, loopEnd)
    v.sample:setPlayStart(playStart); v.sample:setLoopStart(loopStart); v.sample:setLoopEnd(loopEnd)
    v.sample:setCrossfade(params.crossfade); v.sample:setOneShot(params.oneShot > 0.5)
  end

  local function applyPolyAll()
    for i = 1, MAX do applyPolyWindow(voices[i]); voices[i].sample:setSpeed(speedForNote(voices[i].note or params.rootNote)) end
  end

  local function clearVoiceMapping(index)
    local old = voices[index] and voices[index].note or nil
    if old ~= nil and noteToVoice[old] == index then noteToVoice[old] = nil end
  end

  local function stopVoice(index)
    local v = voices[index]
    if not v then return end
    clearVoiceMapping(index)
    v.active = false; v.note = nil; v.velocity = 0
    polyMixer:setGain(index, 0.0); v.sample:stop()
  end

  local function clearLoopNotes()
    loopNotes = {}
    loopNoteLookup = {}
  end

  local function stopAll()
    clearLoopNotes()
    for i = 1, MAX do stopVoice(i); slices[i].sample:stop(); sliceMixer:setGain(i, 0.0) end
  end

  local function allocateVoice(note)
    local limit = activeVoiceLimit()
    if noteToVoice[note] then return noteToVoice[note] end
    for i = 1, limit do if not voices[i].active then return i end end
    local oldest = 1
    for i = 2, limit do if (voices[i].stamp or 0) < (voices[oldest].stamp or 0) then oldest = i end end
    return oldest
  end

  local function triggerVoice(index, note, velocity)
    local v = voices[index]
    if not v then return end
    clearVoiceMapping(index)
    note = round(clamp(note, 0, 127)); velocity = round(clamp(velocity, 1, 127))
    stamp = stamp + 1
    v.stamp = stamp; v.note = note; v.velocity = velocity; v.active = true; noteToVoice[note] = index
    polyMixer:setGain(index, velocityToGain(velocity)); applyPolyWindow(v); v.sample:setSpeed(speedForNote(note)); v.sample:trigger()
  end

  local function snapshotLoopNotesFromHeld()
    local captured = {}
    for note, velocity in pairs(heldNotes) do
      captured[#captured + 1] = { note = round(clamp(note, 0, 127)), velocity = round(clamp(velocity, 1, 127)) }
    end
    table.sort(captured, function(a, b) return a.note < b.note end)
    loopNotes = captured
    loopNoteLookup = {}
    for i = 1, #captured do loopNoteLookup[captured[i].note] = true end
    return captured
  end

  local function snapshotLoopNotesFromActiveVoices()
    local captured = {}
    for i = 1, MAX do
      local v = voices[i]
      if v and v.active and v.note ~= nil then
        captured[#captured + 1] = { note = v.note, velocity = round(clamp(v.velocity or 127, 1, 127)) }
      end
    end
    table.sort(captured, function(a, b) return a.note < b.note end)
    loopNotes = captured
    loopNoteLookup = {}
    for i = 1, #captured do loopNoteLookup[captured[i].note] = true end
    return captured
  end

  local function triggerLoopNotes()
    local heldCount = 0
    for _ in pairs(heldNotes) do heldCount = heldCount + 1 end

    local captured = nil
    if heldCount > 0 then
      captured = snapshotLoopNotesFromHeld()
    elseif #loopNotes > 0 then
      captured = loopNotes
    else
      captured = snapshotLoopNotesFromActiveVoices()
    end

    if #captured <= 0 then return false end
    for i = 1, #captured do
      local entry = captured[i]
      triggerVoice(allocateVoice(entry.note), entry.note, entry.velocity)
    end
    return true
  end

  local function noteOff(note)
    note = round(clamp(note, 0, 127))
    heldNotes[note] = nil
    if loopNoteLookup[note] then return end
    local index = noteToVoice[note]
    if index and params.oneShot <= 0.5 then stopVoice(index) end
  end

  local function sliceEnd(index)
    local start = clamp(sliceStarts[index] or 0, 0, 0.999)
    local best = 1.0
    for i = 1, MAX do
      local other = clamp(sliceStarts[i] or 0, 0, 1)
      if other > start + 0.002 and other < best then best = other end
    end
    return clamp(best, start + 0.002, 1.0)
  end

  local function applySliceWindow(index)
    local sample = slices[index].sample
    local start = clamp(sliceStarts[index] or 0, 0, 0.999)
    local finish = sliceEnd(index)
    sample:setLoopStart(start); sample:setLoopEnd(finish); sample:setCrossfade(0.002); sample:setOneShot(true); sample:setSpeed(params.speed)
    sample:setPlayStart(params.speed < 0 and clamp(finish - 0.0001, start, finish) or start)
  end

  local function applySliceAll() for i = 1, MAX do applySliceWindow(i) end end

  local function triggerSlice(index, velocity)
    index = math.max(1, math.min(MAX, round(index)))
    velocity = round(clamp(velocity or sliceVelocities[index] or 127, 1, 127))
    params.selectedSlice = index; sliceVelocities[index] = velocity
    applySliceWindow(index)
    local start = sliceStarts[index] or 0
    slices[index].sample:seek(params.speed < 0 and clamp(sliceEnd(index) - 0.0001, start, 1) or start)
    sliceMixer:setGain(index, velocityToGain(velocity)); slices[index].sample:trigger()
  end

  for i = 1, MAX do
    local sample = P.SampleRegionPlaybackNode.new(2)
    sample:setSpeed(params.speed); sample:setOneShot(false); sample:setCrossfade(params.crossfade)
    voices[i] = { sample = sample, active = false, note = nil, velocity = 0, stamp = 0 }
    polyMixer:setGain(i, 0.0); polyMixer:setPan(i, 0.0); ctx.graph.connect(sample, polyMixer, 0, (i - 1) * 2)

    local sl = P.SampleRegionPlaybackNode.new(2)
    sl:setOneShot(true); sl:setSpeed(params.speed); sl:setCrossfade(0.002)
    slices[i] = { sample = sl }
    sliceMixer:setGain(i, 0.0); sliceMixer:setPan(i, 0.0); ctx.graph.connect(sl, sliceMixer, 0, (i - 1) * 2)
  end
  applyModeGains(); applyPolyAll(); applySliceAll()

  if ctx.graph.nameNode then
    ctx.graph.nameNode(input, NS .. "/input"); ctx.graph.nameNode(capture, NS .. "/capture"); ctx.graph.nameNode(captureSink, NS .. "/capture_sink")
    ctx.graph.nameNode(polyMixer, NS .. "/poly/mixer"); ctx.graph.nameNode(sliceMixer, NS .. "/slice/mixer"); ctx.graph.nameNode(outputGain, NS .. "/output")
    for i = 1, MAX do ctx.graph.nameNode(voices[i].sample, NS .. "/poly/voice/" .. i .. "/sample"); ctx.graph.nameNode(slices[i].sample, NS .. "/slice/" .. i .. "/sample") end
  end

  local function reg(path, min, max, default, extra)
    local spec = { type = "f", min = min, max = max, default = default }
    if type(extra) == "table" then
      for key, value in pairs(extra) do
        spec[key] = value
      end
    end
    ctx.params.register(path, spec)
  end
  local regs = {
    { "/loaded", 0, 1, 1 }, { "/mode", 0, 1, params.mode }, { "/capture_mode", 0, 1, params.captureMode },
    { "/capture_seconds", 0.25, 6.0, params.captureSeconds }, { "/capture_trigger", 0, 1000000, 0 },
    { "/play_trigger", 0, 1000000, 0 }, { "/stop_trigger", 0, 1000000, 0 }, { "/seek", 0, 1, 0 },
    { "/speed", -2, 4, params.speed }, { "/output", 0, 2, params.output }, { "/root_note", 0, 127, params.rootNote },
    { "/pitch_tracking", 0, 1, params.pitchTracking }, { "/voice_count", 1, MAX, params.voiceCount },
    { "/play_start", 0, 1, params.playStart }, { "/loop_start", 0, 1, params.loopStart }, { "/loop_end", 0, 1, params.loopEnd },
    { "/crossfade", 0, 0.5, params.crossfade }, { "/one_shot", 0, 1, params.oneShot }, { "/selected_slice", 1, MAX, params.selectedSlice },
    { "/midi_note", 0, 127, 60 }, { "/midi_velocity", 0, 127, 100 }, { "/midi_note_on_trigger", 0, 9000000, 0 }, { "/midi_note_off_trigger", 0, 9000000, 0 },
    { "/seg/gain", 0.25, 4, 1 }, { "/seg/threshold", 0, 1, 0.5 }, { "/seg/feather", 0, 1, 0.15 }, { "/seg/invert", 0, 1, 0 }, { "/pose/confidence", 0, 1, 0.3 },
    { "/shader/source", 1, 128, 1 }, { "/shader/active_layer", 1, 8, 1 },
  }
  for _, r in ipairs(regs) do reg(NS .. r[1], r[2], r[3], r[4]) end
  for mappingIndex = 1, MAX_MAPPINGS do
    local defaultEnabled = mappingIndex <= 2 and 1 or 0
    local defaultSource = mappingIndex == 1 and 29 or (mappingIndex == 2 and 32 or 1)
    reg(NS .. "/mapping/" .. mappingIndex .. "/enabled", 0, 1, defaultEnabled)
    reg(NS .. "/mapping/" .. mappingIndex .. "/source", 1, 64, defaultSource)
    reg(NS .. "/mapping/" .. mappingIndex .. "/target", 1, MAX_MAPPING_TARGETS, 1)
    reg(NS .. "/mapping/" .. mappingIndex .. "/min", 0, 1, 0)
    reg(NS .. "/mapping/" .. mappingIndex .. "/max", 0, 1, 1)
    reg(NS .. "/mapping/" .. mappingIndex .. "/invert", 0, 1, 0)
  end
  for i = 1, MAX do reg(NS .. "/slice/" .. i .. "/start", 0, 0.999, sliceStarts[i]); reg(NS .. "/slice/" .. i .. "/trigger", 0, 1000000, 0); reg(NS .. "/slice/" .. i .. "/velocity", 0, 127, 127) end
  for s = 1, 2 do
    reg(ParameterBinder.dynamicFxTypePath(s), 0, math.max(0, #fxDefs - 1), 0, { deferGraphMutation = true })
    reg(ParameterBinder.dynamicFxMixPath(s), 0, 1, 0)
    for p = 1, maxFxParams do
      reg(ParameterBinder.dynamicFxParamPath(s, p - 1), 0, 1, 0.5)
    end
  end
  for l = 1, 8 do
    reg(NS .. "/shader/layer/" .. l .. "/enabled", 0, 1, l == 1 and 1 or 0)
    reg(NS .. "/shader/layer/" .. l .. "/effect", 1, 128, 1)
    for p = 1, 9 do reg(NS .. "/shader/layer/" .. l .. "/param/" .. p, 0, 1, 0.5) end
  end

  local counters = { capture = 0, play = 0, stop = 0, noteOn = 0, noteOff = 0, slice = {} }
  for i = 1, MAX do counters.slice[i] = 0 end

  local function decodeMidiTrigger(value)
    local code = round(value); local payload = code % 16384
    return math.floor(payload / 128), payload % 128, code
  end

  local function copyAudioCaptureToPlayers()
    local sr = (ctx.host and ctx.host.getSampleRate and tonumber(ctx.host.getSampleRate())) or 44100.0
    local samplesBack = math.max(1, math.floor(params.captureSeconds * sr))
    local captureNode = capture.__node or capture
    if captureNode and captureNode.copyRecentToLoop then
      for i = 1, MAX do captureNode:copyRecentToLoop(voices[i].sample.__node or voices[i].sample, samplesBack, false); captureNode:copyRecentToLoop(slices[i].sample.__node or slices[i].sample, samplesBack, false) end
      for i = 1, MAX do voices[i].sample:seek(0); applyPolyWindow(voices[i]); applySliceWindow(i) end
    end
  end

  local function onParamChange(path, value)
    if path == NS .. "/mode" then params.mode = round(clamp(value, 0, 1)); applyModeGains()
    elseif path == NS .. "/capture_mode" then params.captureMode = round(clamp(value, 0, 1))
    elseif path == NS .. "/capture_seconds" then params.captureSeconds = clamp(value, 0.25, 6.0)
    elseif path == NS .. "/capture_trigger" then local n=round(value); if n~=counters.capture then counters.capture=n; copyAudioCaptureToPlayers() end
    elseif path == NS .. "/play_trigger" then local n=round(value); if n~=counters.play then counters.play=n; if params.mode < 0.5 then triggerLoopNotes() else triggerSlice(params.selectedSlice, 127) end end
    elseif path == NS .. "/stop_trigger" then local n=round(value); if n~=counters.stop then counters.stop=n; stopAll() end
    elseif path == NS .. "/seek" then local pos=clamp(value,0,1); for i=1,MAX do voices[i].sample:seek(pos); slices[i].sample:seek(pos) end
    elseif path == NS .. "/speed" then params.speed = clamp(value, -2, 4); applyPolyAll(); applySliceAll()
    elseif path == NS .. "/output" then params.output = clamp(value, 0, 2); outputGain:setGain(params.output)
    elseif path == NS .. "/root_note" then params.rootNote = round(clamp(value, 0, 127)); applyPolyAll()
    elseif path == NS .. "/pitch_tracking" then params.pitchTracking = round(value); applyPolyAll()
    elseif path == NS .. "/voice_count" then params.voiceCount = round(clamp(value, 1, MAX)); for i=params.voiceCount+1,MAX do stopVoice(i) end
    elseif path == NS .. "/play_start" then params.playStart = clamp(value,0,1); applyPolyAll()
    elseif path == NS .. "/loop_start" then params.loopStart = clamp(value,0,1); applyPolyAll()
    elseif path == NS .. "/loop_end" then params.loopEnd = clamp(value,0,1); applyPolyAll()
    elseif path == NS .. "/crossfade" then params.crossfade = clamp(value,0,0.5); applyPolyAll()
    elseif path == NS .. "/one_shot" then params.oneShot = round(value); applyPolyAll()
    elseif path == NS .. "/selected_slice" then params.selectedSlice = math.max(1, math.min(MAX, round(value)))
    elseif path == NS .. "/midi_note_on_trigger" then local note, velocity, n = decodeMidiTrigger(value); if n ~= counters.noteOn then counters.noteOn = n; heldNotes[round(clamp(note, 0, 127))] = round(clamp(velocity, 1, 127)); if params.mode < 0.5 then triggerVoice(allocateVoice(note), note, velocity) else local s=noteToSlice(note, params.rootNote); if s then triggerSlice(s, velocity) end end end
    elseif path == NS .. "/midi_note_off_trigger" then local note, _, n = decodeMidiTrigger(value); if n ~= counters.noteOff then counters.noteOff = n; if params.mode < 0.5 then noteOff(note) end end
    else
      for i = 1, MAX do
        if path == NS .. "/slice/" .. i .. "/start" then sliceStarts[i] = clamp(value, 0, 0.999); applySliceAll(); return
        elseif path == NS .. "/slice/" .. i .. "/velocity" then sliceVelocities[i] = round(clamp(value, 0, 127)); return
        elseif path == NS .. "/slice/" .. i .. "/trigger" then local n=round(value); if n ~= counters.slice[i] then counters.slice[i] = n; triggerSlice(i, sliceVelocities[i]) end; return end
      end
      if fxRack.applyPath(path, value) then return end
      -- Visual/control-only params are registered here so OSC/IPC automation is smooth;
      -- the UI polls and applies them to ML/shader/mapping state.
    end
  end

  return { description = "AVSampler DSP authority", input = input, output = outputGain, onParamChange = onParamChange }
end
