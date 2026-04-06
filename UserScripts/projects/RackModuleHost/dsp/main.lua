local function dirname(path)
  return (tostring(path or ""):gsub("/+$", ""):match("^(.*)/[^/]+$") or ".")
end

local function join(...)
  local parts = { ... }
  local out = ""
  for i = 1, #parts do
    local part = tostring(parts[i] or "")
    if part ~= "" then
      if out == "" then
        out = part
      else
        out = out:gsub("/+$", "") .. "/" .. part:gsub("^/+", "")
      end
    end
  end
  return out
end

local function appendPackageRoot(root)
  if type(root) ~= "string" or root == "" then
    return
  end
  local entry = root .. "/?.lua;" .. root .. "/?/init.lua"
  local current = tostring(package.path or "")
  if not current:find(entry, 1, true) then
    package.path = current == "" and entry or (current .. ";" .. entry)
  end
end

local scriptDir = tostring(__manifoldDspScriptDir or ".")
local projectRoot = dirname(scriptDir)
local mainRoot = join(projectRoot, "../Main")
appendPackageRoot(join(projectRoot, "lib"))
appendPackageRoot(join(mainRoot, "ui"))
appendPackageRoot(join(mainRoot, "lib"))
appendPackageRoot(join(mainRoot, "dsp"))

local Registry = require("module_host_registry")
local Utils = require("utils")
local ParameterBinder = require("parameter_binder")
local FxDefs = require("fx_definitions")
local FxSlot = require("fx_slot")
local SampleSynth = require("sample_synth")

local RackEqModule = require("rack_modules.eq")
local RackFxModule = require("rack_modules.fx")
local RackFilterModule = require("rack_modules.filter")
local RackOscillatorModule = require("rack_modules.oscillator")
local RackSampleModule = require("rack_modules.sample")
local RackBlendSimpleModule = require("rack_modules.blend_simple")

local MODULES = Registry.modules()
local VOICE_COUNT = Registry.VOICE_COUNT
local FX_MAX_PARAMS = ParameterBinder.MAX_FX_PARAMS
local AUDITION_SLOT_INDEX = Registry.AUDITION_OSC_SLOT_INDEX
local PRIMARY_SLOT_INDEX = Registry.PRIMARY_SLOT_INDEX

local HOST_PATHS = {
  moduleIndex = "/rack_host/module/index",
  viewMode = "/rack_host/view/mode",
  inputAMode = "/rack_host/input_a/mode",
  inputAPitch = "/rack_host/input_a/pitch",
  inputALevel = "/rack_host/input_a/level",
  inputBMode = "/rack_host/input_b/mode",
  inputBPitch = "/rack_host/input_b/pitch",
  inputBLevel = "/rack_host/input_b/level",
}

local EQ8_DEFAULT_FREQS = { 60, 120, 250, 500, 1000, 2500, 6000, 12000 }
local DYNAMIC_OSC_OUTPUT_TRIM = 0.25
local DYNAMIC_OSC_DEFAULT_OUTPUT = 0.8
local DYNAMIC_OSC_MAX_LEVEL = 0.40
local DYNAMIC_SAMPLE_OUTPUT_TRIM = 0.25
local SAMPLE_PITCH_MODE_CLASSIC = 0
local SAMPLE_PITCH_MODE_PHASE_VOCODER = 1
local SAMPLE_PITCH_MODE_PHASE_VOCODER_HQ = 2
local OSC_RENDER_STANDARD = 0

local function noteToFrequency(note)
  return 440.0 * (2.0 ^ ((tonumber(note) - 69.0) / 12.0))
end

local function clamp(value, lo, hi)
  local n = tonumber(value) or 0.0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function clamp01(value)
  return clamp(value, 0.0, 1.0)
end

local function round(value)
  return math.floor((tonumber(value) or 0.0) + 0.5)
end

function buildPlugin(ctx)
  local function connectMixerInput(mixer, inputIndex, source)
    mixer:setInputCount(inputIndex)
    mixer:setGain(inputIndex, 1.0)
    mixer:setPan(inputIndex, 0.0)
    ctx.graph.connect(source, mixer, 0, (inputIndex - 1) * 2)
  end

  local function registerSchemaEntry(path, spec)
    if ctx.params and ctx.params.register then
      ctx.params.register(path, spec)
    end
  end

  local function registerSchema(schema)
    if type(schema) ~= "table" then
      return
    end
    if schema.path and schema.spec then
      registerSchemaEntry(schema.path, schema.spec)
      return
    end
    for i = 1, #schema do
      local entry = schema[i]
      if type(entry) == "table" and entry.path and entry.spec then
        registerSchemaEntry(entry.path, entry.spec)
      end
    end
  end

  local function applyFilterDefaults(node)
    node:setMode(0)
    node:setCutoff(3200.0)
    node:setResonance(0.75)
    if node.setDrive then node:setDrive(1.0) end
    if node.setMix then node:setMix(1.0) end
  end

  local function applyEqDefaults(node)
    node:setOutput(0.0)
    node:setMix(1.0)
    for bandIndex = 1, 8 do
      node:setBandEnabled(bandIndex, false)
      node:setBandType(bandIndex, bandIndex == 1 and 1 or (bandIndex == 8 and 2 or 0))
      node:setBandFreq(bandIndex, EQ8_DEFAULT_FREQS[bandIndex])
      node:setBandGain(bandIndex, 0.0)
      node:setBandQ(bandIndex, (bandIndex == 1 or bandIndex == 8) and 0.8 or 1.0)
    end
  end

  local input = ctx.primitives.PassthroughNode.new(2, 0)
  local output = ctx.primitives.PassthroughNode.new(2)
  if ctx.graph.markInput then
    ctx.graph.markInput(input)
  end
  if ctx.graph.markMonitor then
    ctx.graph.markMonitor(output)
  end

  local publishDspDebug

  local function createInputSource(defaultMode, defaultPitch, defaultLevel)
    local source = {
      mode = defaultMode,
      pitch = defaultPitch,
      level = defaultLevel,
      external = ctx.primitives.GainNode.new(2),
      osc = ctx.primitives.OscillatorNode.new(),
      noise = ctx.primitives.NoiseGeneratorNode.new(),
      mix = ctx.primitives.MixerNode.new(),
    }

    source.external:setGain(0.0)
    source.osc:setWaveform(0)
    source.osc:setFrequency(noteToFrequency(defaultPitch))
    source.osc:setAmplitude(0.0)
    source.osc:setPulseWidth(0.25)
    source.osc:setUnison(1)
    source.osc:setDetune(0.0)
    source.osc:setSpread(0.0)
    source.noise:setLevel(0.0)
    source.noise:setColor(0.1)
    source.mix:setInputCount(3)

    ctx.graph.connect(input, source.external)
    connectMixerInput(source.mix, 1, source.external)
    connectMixerInput(source.mix, 2, source.osc)
    connectMixerInput(source.mix, 3, source.noise)
    return source
  end

  local function applyInputSourceState(source, mode, pitch, level)
    local selected = math.max(1, math.min(7, round(mode)))
    local note = clamp(round(pitch), 24, 84)
    local gain = clamp01(level)
    source.mode = selected
    source.pitch = note
    source.level = gain

    source.external:setGain(selected == 1 and gain or 0.0)
    source.osc:setFrequency(noteToFrequency(note))
    source.osc:setPulseWidth(selected == 6 and 0.25 or 0.5)
    source.noise:setLevel(selected == 7 and gain or 0.0)

    if selected == 3 then
      source.osc:setWaveform(0)
      source.osc:setAmplitude(gain)
    elseif selected == 4 then
      source.osc:setWaveform(1)
      source.osc:setAmplitude(gain)
    elseif selected == 5 then
      source.osc:setWaveform(2)
      source.osc:setAmplitude(gain)
    elseif selected == 6 then
      source.osc:setWaveform(6)
      source.osc:setAmplitude(gain)
    else
      source.osc:setAmplitude(0.0)
    end

    if type(publishDspDebug) == "function" then
      publishDspDebug()
    end
  end

  local inputA = createInputSource(3, 60, 0.65)
  local inputB = createInputSource(4, 67, 0.5)

  local outputMixer = ctx.primitives.MixerNode.new()
  outputMixer:setInputCount(7)
  ctx.graph.connect(outputMixer, output)

  local moduleOutputGains = {
    rack_oscillator = ctx.primitives.GainNode.new(2),
    rack_sample = ctx.primitives.GainNode.new(2),
    blend_simple = ctx.primitives.GainNode.new(2),
    filter = ctx.primitives.GainNode.new(2),
    fx = ctx.primitives.GainNode.new(2),
    eq = ctx.primitives.GainNode.new(2),
    audition = ctx.primitives.GainNode.new(2),
  }

  local mixerBus = 1
  local busIndexByOutputId = {}
  for key, node in pairs(moduleOutputGains) do
    node:setGain(0.0)
    busIndexByOutputId[key] = mixerBus
    connectMixerInput(outputMixer, mixerBus, node)
    mixerBus = mixerBus + 1
  end

  local fxDefs = FxDefs.buildFxDefs(ctx.primitives, ctx.graph)
  local fxCtx = {
    primitives = ctx.primitives,
    graph = ctx.graph,
    connectMixerInput = connectMixerInput,
  }

  local filterSlots = {}
  local eqSlots = {}
  local fxSlots = {}
  local oscillatorSlots = {}
  local sampleSlots = {}
  local blendSlots = {}

  local rackFilterModule = RackFilterModule.create({
    ctx = ctx,
    slots = filterSlots,
    Utils = Utils,
    ParameterBinder = ParameterBinder,
    applyDefaults = applyFilterDefaults,
  })
  local filterSlot = rackFilterModule.createSlot(PRIMARY_SLOT_INDEX)
  ctx.graph.connect(inputA.mix, filterSlot.node)
  ctx.graph.connect(filterSlot.node, moduleOutputGains.filter)

  local rackEqModule = RackEqModule.create({
    ctx = ctx,
    slots = eqSlots,
    applyDefaults = applyEqDefaults,
    ParameterBinder = ParameterBinder,
  })
  local eqSlot = rackEqModule.createSlot(PRIMARY_SLOT_INDEX)
  ctx.graph.connect(inputA.mix, eqSlot.node)
  ctx.graph.connect(eqSlot.node, moduleOutputGains.eq)

  local rackFxModule = RackFxModule.create({
    slots = fxSlots,
    FxSlot = FxSlot,
    ParameterBinder = ParameterBinder,
    fxCtx = fxCtx,
    fxDefs = fxDefs,
    maxFxParams = FX_MAX_PARAMS,
  })
  local fxSlot = rackFxModule.createSlot(PRIMARY_SLOT_INDEX)
  fxSlot.connectSource(inputA.mix)
  ctx.graph.connect(fxSlot.output, moduleOutputGains.fx)

  local rackOscillatorModule = RackOscillatorModule.create({
    ctx = ctx,
    slots = oscillatorSlots,
    Utils = Utils,
    ParameterBinder = ParameterBinder,
    noteToFrequency = noteToFrequency,
    connectMixerInput = connectMixerInput,
    voiceCount = VOICE_COUNT,
    outputTrim = DYNAMIC_OSC_OUTPUT_TRIM,
    defaultOutput = DYNAMIC_OSC_DEFAULT_OUTPUT,
    maxLevel = DYNAMIC_OSC_MAX_LEVEL,
    oscRenderStandard = OSC_RENDER_STANDARD,
  })
  local oscSlot = rackOscillatorModule.createSlot(PRIMARY_SLOT_INDEX)
  local auditionOscSlot = rackOscillatorModule.createSlot(AUDITION_SLOT_INDEX)
  ctx.graph.connect(oscSlot.output, moduleOutputGains.rack_oscillator)
  ctx.graph.connect(auditionOscSlot.output, moduleOutputGains.audition)

  local function buildSampleSourceSpecs(captureInput)
    return {
      { id = 0, name = "input", node = captureInput, kind = "input" },
      { id = 1, name = "live", node = inputA.mix, kind = "live" },
      { id = 2, name = "aux", node = inputB.mix, kind = "aux" },
      { id = 3, name = "input_a", node = inputA.mix, kind = "input_a" },
      { id = 4, name = "input_b", node = inputB.mix, kind = "input_b" },
      { id = 5, name = "external", node = input, kind = "external" },
    }
  end

  local rackSampleModule = RackSampleModule.create({
    ctx = ctx,
    slots = sampleSlots,
    Utils = Utils,
    SampleSynth = SampleSynth,
    ParameterBinder = ParameterBinder,
    noteToFrequency = noteToFrequency,
    connectMixerInput = connectMixerInput,
    voiceCount = VOICE_COUNT,
    outputTrim = DYNAMIC_SAMPLE_OUTPUT_TRIM,
    samplePitchModeClassic = SAMPLE_PITCH_MODE_CLASSIC,
    samplePitchModePhaseVocoder = SAMPLE_PITCH_MODE_PHASE_VOCODER,
    samplePitchModePhaseVocoderHQ = SAMPLE_PITCH_MODE_PHASE_VOCODER_HQ,
    buildSourceSpecs = buildSampleSourceSpecs,
  })
  local sampleSlot = rackSampleModule.createSlot(PRIMARY_SLOT_INDEX)
  ctx.graph.connect(inputA.mix, sampleSlot.captureInput)
  ctx.graph.connect(sampleSlot.output, moduleOutputGains.rack_sample)

  local rackBlendModule = RackBlendSimpleModule.create({
    ctx = ctx,
    slots = blendSlots,
    Utils = Utils,
    ParameterBinder = ParameterBinder,
    connectMixerInput = connectMixerInput,
  })
  local blendSlot = rackBlendModule.createSlot(PRIMARY_SLOT_INDEX)
  ctx.graph.connect(inputA.mix, blendSlot.inputA)
  ctx.graph.connect(inputB.mix, blendSlot.inputB)
  ctx.graph.connect(blendSlot.output, moduleOutputGains.blend_simple)

  local function getSampleRegionPlaybackPeaks(playbackNode, numBuckets)
    if not playbackNode or not playbackNode.computePeaks then
      return nil
    end
    local ok, peaks = pcall(function()
      return playbackNode:computePeaks(numBuckets)
    end)
    if ok and type(peaks) == "table" and #peaks > 0 then
      return peaks
    end
    return nil
  end

  local function resamplePeaks(peaks, numBuckets)
    if type(peaks) ~= "table" or #peaks == 0 or numBuckets <= 0 then
      return {}
    end
    if #peaks == numBuckets then
      return peaks
    end
    local result = {}
    local srcLen = #peaks
    for i = 1, numBuckets do
      local srcIndex = math.floor((i - 1) * srcLen / numBuckets) + 1
      result[i] = peaks[srcIndex] or 0.5
    end
    return result
  end



  registerSchemaEntry(HOST_PATHS.moduleIndex, { type = "f", min = 1, max = #MODULES, default = 1, description = "Rack module host selected module" })
  registerSchemaEntry(HOST_PATHS.viewMode, { type = "f", min = 1, max = 2, default = 1, description = "Rack module host view mode (1=performance, 2=patch)" })
  registerSchemaEntry(HOST_PATHS.inputAMode, { type = "f", min = 1, max = 7, default = 3, description = "Rack host input A mode" })
  registerSchemaEntry(HOST_PATHS.inputAPitch, { type = "f", min = 24, max = 84, default = 60, description = "Rack host input A pitch" })
  registerSchemaEntry(HOST_PATHS.inputALevel, { type = "f", min = 0, max = 1, default = 0.65, description = "Rack host input A level" })
  registerSchemaEntry(HOST_PATHS.inputBMode, { type = "f", min = 1, max = 7, default = 4, description = "Rack host input B mode" })
  registerSchemaEntry(HOST_PATHS.inputBPitch, { type = "f", min = 24, max = 84, default = 67, description = "Rack host input B pitch" })
  registerSchemaEntry(HOST_PATHS.inputBLevel, { type = "f", min = 0, max = 1, default = 0.5, description = "Rack host input B level" })

  for i = 1, #MODULES do
    registerSchema(ParameterBinder.buildDynamicSlotSchema(MODULES[i].id, PRIMARY_SLOT_INDEX, {
      voiceCount = VOICE_COUNT,
      fxOptionCount = #FxDefs.FX_OPTIONS,
      maxFxParams = FX_MAX_PARAMS,
      oscRenderStandard = OSC_RENDER_STANDARD,
    }))
  end

  registerSchema(ParameterBinder.buildDynamicSlotSchema("rack_oscillator", AUDITION_SLOT_INDEX, {
    voiceCount = VOICE_COUNT,
    fxOptionCount = #FxDefs.FX_OPTIONS,
    maxFxParams = FX_MAX_PARAMS,
    oscRenderStandard = OSC_RENDER_STANDARD,
  }))

  local selectedModuleIndex = 1
  publishDspDebug = function()
    local module = MODULES[selectedModuleIndex]
    _G.__rackModuleHostDspDebug = {
      selectedModuleId = module and module.id or "",
      selectedModuleKind = module and module.kind or "",
      inputA = {
        mode = inputA.mode,
        pitch = inputA.pitch,
        level = inputA.level,
      },
      inputB = {
        mode = inputB.mode,
        pitch = inputB.pitch,
        level = inputB.level,
      },
      gains = {
        rack_oscillator = moduleOutputGains.rack_oscillator.getGain and moduleOutputGains.rack_oscillator:getGain() or nil,
        rack_sample = moduleOutputGains.rack_sample.getGain and moduleOutputGains.rack_sample:getGain() or nil,
        blend_simple = moduleOutputGains.blend_simple.getGain and moduleOutputGains.blend_simple:getGain() or nil,
        filter = moduleOutputGains.filter.getGain and moduleOutputGains.filter:getGain() or nil,
        fx = moduleOutputGains.fx.getGain and moduleOutputGains.fx:getGain() or nil,
        eq = moduleOutputGains.eq.getGain and moduleOutputGains.eq:getGain() or nil,
        audition = moduleOutputGains.audition.getGain and moduleOutputGains.audition:getGain() or nil,
      },
    }
  end

  local function applyModuleSelection(index)
    selectedModuleIndex = math.max(1, math.min(#MODULES, round(index)))
    local module = MODULES[selectedModuleIndex]
    local selectedId = module and module.id or ""
    moduleOutputGains.rack_oscillator:setGain(selectedId == "rack_oscillator" and 1.0 or 0.0)
    moduleOutputGains.rack_sample:setGain(selectedId == "rack_sample" and 1.0 or 0.0)
    moduleOutputGains.blend_simple:setGain(selectedId == "blend_simple" and 1.0 or 0.0)
    moduleOutputGains.filter:setGain(selectedId == "filter" and 1.0 or 0.0)
    moduleOutputGains.fx:setGain(selectedId == "fx" and 1.0 or 0.0)
    moduleOutputGains.eq:setGain(selectedId == "eq" and 1.0 or 0.0)
    moduleOutputGains.audition:setGain((module and (module.kind == "voice" or module.kind == "scalar")) and 1.0 or 0.0)
    publishDspDebug()
  end

  local function applyHostParam(path, value)
    if path == HOST_PATHS.moduleIndex then
      applyModuleSelection(value)
      return true
    elseif path == HOST_PATHS.viewMode then
      publishDspDebug()
      return true
    elseif path == HOST_PATHS.inputAMode then
      applyInputSourceState(inputA, value, inputA.pitch, inputA.level)
      return true
    elseif path == HOST_PATHS.inputAPitch then
      applyInputSourceState(inputA, inputA.mode, value, inputA.level)
      return true
    elseif path == HOST_PATHS.inputALevel then
      applyInputSourceState(inputA, inputA.mode, inputA.pitch, value)
      return true
    elseif path == HOST_PATHS.inputBMode then
      applyInputSourceState(inputB, value, inputB.pitch, inputB.level)
      return true
    elseif path == HOST_PATHS.inputBPitch then
      applyInputSourceState(inputB, inputB.mode, value, inputB.level)
      return true
    elseif path == HOST_PATHS.inputBLevel then
      applyInputSourceState(inputB, inputB.mode, inputB.pitch, value)
      return true
    end
    return false
  end

  applyInputSourceState(inputA, 3, 60, 0.65)
  applyInputSourceState(inputB, 4, 67, 0.5)
  applyModuleSelection(1)

  return {
    description = "Rack Module Host - aspect-ratio-correct standalone rack sandbox",
    params = {},
    input = input,
    output = output,
    onParamChange = function(path, value)
      if applyHostParam(path, value) then
        return
      end
      if rackFilterModule.applyPath(path, value) then return end
      if rackEqModule.applyPath(path, value) then return end
      if rackFxModule.applyPath(path, value) then return end
      if rackOscillatorModule.applyPath(path, value) then return end
      if rackSampleModule.applyPath(path, value) then return end
      if rackBlendModule.applyPath(path, value) then return end
    end,
    process = function(blockSize, sampleRate)
      if rackSampleModule.pollAnalysis then
        rackSampleModule.pollAnalysis(PRIMARY_SLOT_INDEX)
      end
      if rackSampleModule.updateReadbacks then
        rackSampleModule.updateReadbacks(PRIMARY_SLOT_INDEX)
      end
    end,
    getDynamicSampleSlotPeaks = function(slotIndex, numBuckets)
      local slot = sampleSlots[math.max(1, math.floor(tonumber(slotIndex) or 1))]
      if not slot then return {} end
      local bucketCount = math.max(32, math.floor(tonumber(numBuckets) or 128))
      if type(slot.cachedSamplePeaks) == "table" and #slot.cachedSamplePeaks > 0 then
        return resamplePeaks(slot.cachedSamplePeaks, bucketCount)
      end
      local voice = slot.voices and slot.voices[1] or nil
      local playbackNode = voice and voice.samplePlayback and voice.samplePlayback.__node or nil
      if playbackNode then
        local peaks = getSampleRegionPlaybackPeaks(playbackNode, bucketCount)
        if peaks and #peaks > 0 then
          slot.cachedSamplePeaks = peaks
          slot.cachedSamplePeakBuckets = #peaks
          return resamplePeaks(peaks, bucketCount)
        end
      end
      return {}
    end,
    getDynamicSampleSlotVoicePositions = function(slotIndex)
      local slot = sampleSlots[math.max(1, math.floor(tonumber(slotIndex) or 1))]
      local out = {}
      local voices = slot and slot.voices or {}
      for i = 1, #voices do
        local voice = voices[i]
        out[i] = (voice and voice.samplePlayback and voice.samplePlayback.getNormalizedPosition and voice.samplePlayback:getNormalizedPosition()) or 0.0
      end
      return out
    end,
  }
end
