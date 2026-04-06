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
appendPackageRoot(join(mainRoot, "lib"))
appendPackageRoot(join(mainRoot, "dsp"))

local ParameterBinder = require("parameter_binder")
local RackAudioRouter = require("rack_audio_router")
local midisynthModule = loadDspModule("../../Main/dsp/midisynth_integration.lua")

local HOST_PATHS = {
  moduleIndex = "/rack_host/module/index",
  inputAMode = "/rack_host/input_a/mode",
  inputAPitch = "/rack_host/input_a/pitch",
  inputALevel = "/rack_host/input_a/level",
  inputBMode = "/rack_host/input_b/mode",
  inputBPitch = "/rack_host/input_b/pitch",
  inputBLevel = "/rack_host/input_b/level",
}

local MODULE_IDS = {
  [1] = "rack_oscillator",
  [2] = "rack_sample",
  [3] = "filter",
  [4] = "fx",
  [5] = "eq",
  [6] = "blend_simple",
}

local UTILITY_INPUT_A_SLOT = 31
local UTILITY_INPUT_B_SLOT = 32

local UTILITY_WAVEFORMS = {
  [1] = { waveform = 0, pulseWidth = 0.5 },
  [2] = { waveform = 0, pulseWidth = 0.5 },
  [3] = { waveform = 1, pulseWidth = 0.5 },
  [4] = { waveform = 2, pulseWidth = 0.5 },
  [5] = { waveform = 6, pulseWidth = 0.25 },
  [6] = { waveform = 5, pulseWidth = 0.5 },
}

local function clamp(value, lo, hi)
  local n = tonumber(value) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(value)
  return math.floor((tonumber(value) or 0) + 0.5)
end

local function appendParam(params, path, spec)
  params[#params + 1] = path
  return {
    path = path,
    spec = spec,
  }
end

local function utilitySourceCode(slotIndex, modeIndex)
  local mode = math.max(1, math.min(6, round(modeIndex)))
  if mode == 1 then
    return 0
  end
  return (ParameterBinder.AUX_AUDIO_SOURCE_CODES.DYNAMIC_OSC_BASE or 100) + math.max(1, round(slotIndex))
end

local function moduleIdFromIndex(index)
  return MODULE_IDS[math.max(1, math.min(#MODULE_IDS, round(index)))] or MODULE_IDS[1]
end

function buildPlugin(ctx)
  local synth = midisynthModule.buildSynth(ctx, {})
  local params = {}
  for i = 1, #(synth.params or {}) do
    params[i] = synth.params[i]
  end

  local state = {
    moduleIndex = 1,
    inputAMode = 2,
    inputAPitch = 60,
    inputALevel = 0.65,
    inputBMode = 3,
    inputBPitch = 67,
    inputBLevel = 0.50,
  }

  local hostParamEntries = {
    appendParam(params, HOST_PATHS.moduleIndex, { type = "f", min = 1, max = #MODULE_IDS, default = 1, description = "Selected rack host module" }),
    appendParam(params, HOST_PATHS.inputAMode, { type = "f", min = 1, max = 6, default = 2, description = "Input A generator mode" }),
    appendParam(params, HOST_PATHS.inputAPitch, { type = "f", min = 24, max = 84, default = 60, description = "Input A generator pitch" }),
    appendParam(params, HOST_PATHS.inputALevel, { type = "f", min = 0, max = 1, default = 0.65, description = "Input A generator level" }),
    appendParam(params, HOST_PATHS.inputBMode, { type = "f", min = 1, max = 6, default = 3, description = "Input B generator mode" }),
    appendParam(params, HOST_PATHS.inputBPitch, { type = "f", min = 24, max = 84, default = 67, description = "Input B generator pitch" }),
    appendParam(params, HOST_PATHS.inputBLevel, { type = "f", min = 0, max = 1, default = 0.50, description = "Input B generator level" }),
  }

  for i = 1, #hostParamEntries do
    local entry = hostParamEntries[i]
    ctx.params.register(entry.path, entry.spec)
  end

  local function forward(path, value)
    local numeric = tonumber(value) or 0
    if ctx.host and ctx.host.setParam then
      ctx.host.setParam(path, numeric)
      return
    end
    if synth.onParamChange then
      synth.onParamChange(path, numeric)
    end
  end

  local function ensureSlots()
    if synth.ensureDynamicModuleSlot then
      synth.ensureDynamicModuleSlot("rack_oscillator", UTILITY_INPUT_A_SLOT)
      synth.ensureDynamicModuleSlot("rack_oscillator", UTILITY_INPUT_B_SLOT)
      synth.ensureDynamicModuleSlot("rack_oscillator", 1)
      synth.ensureDynamicModuleSlot("rack_sample", 1)
      synth.ensureDynamicModuleSlot("filter", 1)
      synth.ensureDynamicModuleSlot("fx", 1)
      synth.ensureDynamicModuleSlot("eq", 1)
      synth.ensureDynamicModuleSlot("blend_simple", 1)
    end
  end

  local function applyUtilityOscillator(slotIndex, modeIndex, pitch, level)
    local mode = math.max(1, math.min(6, round(modeIndex)))
    local config = UTILITY_WAVEFORMS[mode] or UTILITY_WAVEFORMS[2]
    local manualLevel = mode == 1 and 0 or clamp(level, 0, 1)
    local manualPitch = clamp(round(pitch), 24, 84)
    local base = ParameterBinder.dynamicOscillatorBasePath(slotIndex)
    forward(base .. "/renderMode", 0)
    forward(base .. "/waveform", config.waveform)
    forward(base .. "/pulseWidth", config.pulseWidth)
    forward(base .. "/manualPitch", manualPitch)
    forward(base .. "/manualLevel", manualLevel)
    forward(base .. "/output", 1.0)
    forward(base .. "/drive", 0.0)
    forward(base .. "/unison", 1)
    forward(base .. "/detune", 0.0)
    forward(base .. "/spread", 0.0)
  end

  local function selectedStageCode(moduleId)
    if moduleId == "filter" then
      return (RackAudioRouter.DYNAMIC_FILTER_STAGE_BASE or 300) + 1
    elseif moduleId == "fx" then
      return (RackAudioRouter.DYNAMIC_FX_STAGE_BASE or 200) + 1
    elseif moduleId == "eq" then
      return (RackAudioRouter.DYNAMIC_EQ_STAGE_BASE or 100) + 1
    elseif moduleId == "blend_simple" then
      return (RackAudioRouter.DYNAMIC_BLEND_SIMPLE_STAGE_BASE or 400) + 1
    end
    return 0
  end

  local function applyRouting()
    local moduleId = moduleIdFromIndex(state.moduleIndex)
    local inputACode = utilitySourceCode(UTILITY_INPUT_A_SLOT, state.inputAMode)
    local inputBCode = utilitySourceCode(UTILITY_INPUT_B_SLOT, state.inputBMode)

    applyUtilityOscillator(UTILITY_INPUT_A_SLOT, state.inputAMode, state.inputAPitch, state.inputALevel)
    applyUtilityOscillator(UTILITY_INPUT_B_SLOT, state.inputBMode, state.inputBPitch, state.inputBLevel)

    forward(ParameterBinder.dynamicBlendSimpleBSourcePath(1), inputBCode)
    forward(ParameterBinder.dynamicSampleInputSourcePath(1), inputACode)

    if moduleId == "rack_oscillator" then
      forward(ParameterBinder.rackAudioSourcePath(1), (ParameterBinder.AUX_AUDIO_SOURCE_CODES.DYNAMIC_OSC_BASE or 100) + 1)
      forward(ParameterBinder.PATHS.rackAudioSourceCount, 1)
      forward(ParameterBinder.PATHS.rackAudioStageCount, 0)
      forward(ParameterBinder.PATHS.rackAudioOutputEnabled, 1)
      return
    end

    if moduleId == "rack_sample" then
      forward(ParameterBinder.rackAudioSourcePath(1), (ParameterBinder.AUX_AUDIO_SOURCE_CODES.DYNAMIC_SAMPLE_BASE or 200) + 1)
      forward(ParameterBinder.PATHS.rackAudioSourceCount, 1)
      forward(ParameterBinder.PATHS.rackAudioStageCount, 0)
      forward(ParameterBinder.PATHS.rackAudioOutputEnabled, 1)
      return
    end

    forward(ParameterBinder.rackAudioSourcePath(1), inputACode)
    forward(ParameterBinder.PATHS.rackAudioSourceCount, 1)
    forward(ParameterBinder.rackAudioStagePath(1), selectedStageCode(moduleId))
    forward(ParameterBinder.PATHS.rackAudioStageCount, 1)
    forward(ParameterBinder.PATHS.rackAudioOutputEnabled, 1)
  end

  local function applyHostParam(path, value)
    if path == HOST_PATHS.moduleIndex then
      state.moduleIndex = clamp(round(value), 1, #MODULE_IDS)
      applyRouting()
      return true
    elseif path == HOST_PATHS.inputAMode then
      state.inputAMode = clamp(round(value), 1, 6)
      applyRouting()
      return true
    elseif path == HOST_PATHS.inputAPitch then
      state.inputAPitch = clamp(round(value), 24, 84)
      applyRouting()
      return true
    elseif path == HOST_PATHS.inputALevel then
      state.inputALevel = clamp(value, 0, 1)
      applyRouting()
      return true
    elseif path == HOST_PATHS.inputBMode then
      state.inputBMode = clamp(round(value), 1, 6)
      applyRouting()
      return true
    elseif path == HOST_PATHS.inputBPitch then
      state.inputBPitch = clamp(round(value), 24, 84)
      applyRouting()
      return true
    elseif path == HOST_PATHS.inputBLevel then
      state.inputBLevel = clamp(value, 0, 1)
      applyRouting()
      return true
    end
    return false
  end

  ensureSlots()
  applyRouting()

  return {
    description = "Rack Module Host - standalone Main rack module wrapper",
    params = params,
    onParamChange = function(path, value)
      if applyHostParam(path, value) then
        return
      end
      if synth.onParamChange then
        synth.onParamChange(path, value)
      end
    end,
    ensureDynamicModuleSlot = function(specId, slotIndex)
      if synth.ensureDynamicModuleSlot then
        return synth.ensureDynamicModuleSlot(specId, slotIndex)
      end
      return false
    end,
    getDynamicSampleSlotPeaks = synth.getDynamicSampleSlotPeaks,
    getDynamicSampleSlotVoicePositions = synth.getDynamicSampleSlotVoicePositions,
    getSamplePeaks = synth.getSamplePeaks,
    getSampleLoopLength = synth.getSampleLoopLength,
    getVoiceSamplePositions = synth.getVoiceSamplePositions,
    refreshSampleDerivedAdditive = synth.refreshSampleDerivedAdditive,
    getSampleDerivedAddDebug = synth.getSampleDerivedAddDebug,
    getRackAudioRouteDebug = synth.getRackAudioRouteDebug,
    process = function(blockSize, sampleRate)
      if synth.process then
        synth.process(blockSize, sampleRate)
      end
    end,
  }
end
