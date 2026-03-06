local W = require("ui_widgets")

local ui = {}
local current_state = {}
local recButtonLatched = false
local MAX_LAYERS = 4
local contentRoot = nil
local DSP_SLOT = "super"

local FX_EFFECTS = {
  { id = "bypass", label = "Bypass" },
  { id = "chorus", label = "Chorus" },
  { id = "phaser", label = "Phaser" },
  { id = "bitcrusher", label = "Bitcrusher" },
  { id = "waveshaper", label = "Waveshaper" },
  { id = "filter", label = "Filter" },
  { id = "svf", label = "SVF Filter" },
  { id = "reverb", label = "Reverb" },
  { id = "shimmer", label = "Shimmer" },
  { id = "stereodelay", label = "Stereo Delay" },
  { id = "reversedelay", label = "Reverse Delay" },
  { id = "multitap", label = "Multitap" },
  { id = "pitchshift", label = "Pitch Shift" },
  { id = "granulator", label = "Granulator" },
  { id = "ringmod", label = "Ring Mod" },
  { id = "formant", label = "Formant" },
  { id = "eq", label = "EQ" },
  { id = "compressor", label = "Compressor" },
  { id = "limiter", label = "Limiter" },
  { id = "transient", label = "Transient" },
  { id = "widener", label = "Widener" },
}

local FX_PRESET_LABELS = {}
for i = 1, #FX_EFFECTS do
  FX_PRESET_LABELS[i] = FX_EFFECTS[i].label
end

-- Each entry: { create = "...", params = { {path_suffix, register_opts, bind_method}, ... } }
-- create: Lua lines to create the node variable called "fx"
-- params: list of {suffix, {type,min,max,default}, bindMethod}
local FX_SCRIPT_DEFS = {
  bypass = {
    create = 'local fx = ctx.primitives.PassthroughNode.new(2)',
    params = {},
  },
  chorus = {
    create = [[local fx = ctx.primitives.ChorusNode.new()
  fx:setRate(0.7) fx:setDepth(0.5) fx:setVoices(3) fx:setSpread(0.8)
  fx:setFeedback(0.15) fx:setWaveform(0) fx:setMix(0.55)]],
    params = {
      {"rate",      'type="f",min=0.1,max=10.0,default=0.7',   "setRate"},
      {"depth",     'type="f",min=0.0,max=1.0,default=0.5',    "setDepth"},
      {"voices",    'type="f",min=1.0,max=4.0,default=3.0',    "setVoices"},
      {"spread",    'type="f",min=0.0,max=1.0,default=0.8',    "setSpread"},
      {"feedback",  'type="f",min=0.0,max=0.9,default=0.15',   "setFeedback"},
      {"waveform",  'type="f",min=0.0,max=1.0,default=0.0',    "setWaveform"},
      {"mix",       'type="f",min=0.0,max=1.0,default=0.55',   "setMix"},
    },
  },
  phaser = {
    create = [[local fx = ctx.primitives.PhaserNode.new()
  fx:setRate(0.35) fx:setDepth(0.8) fx:setStages(6) fx:setFeedback(0.25) fx:setSpread(120)]],
    params = {
      {"rate",     'type="f",min=0.1,max=10.0,default=0.35',  "setRate"},
      {"depth",    'type="f",min=0.0,max=1.0,default=0.8',    "setDepth"},
      {"stages",   'type="f",min=6.0,max=12.0,default=6.0',   "setStages"},
      {"feedback", 'type="f",min=-0.9,max=0.9,default=0.25',  "setFeedback"},
      {"spread",   'type="f",min=0.0,max=180.0,default=120.0',"setSpread"},
    },
  },
  bitcrusher = {
    create = [[local fx = ctx.primitives.BitCrusherNode.new()
  fx:setBits(6) fx:setRateReduction(8) fx:setMix(1.0) fx:setOutput(0.8)]],
    params = {
      {"bits",   'type="f",min=2,max=16,default=6',     "setBits"},
      {"rate",   'type="f",min=1,max=64,default=8',     "setRateReduction"},
      {"mix",    'type="f",min=0,max=1,default=1.0',    "setMix"},
      {"output", 'type="f",min=0,max=2,default=0.8',    "setOutput"},
    },
  },
  waveshaper = {
    create = [[local fx = ctx.primitives.WaveShaperNode.new()
  fx:setCurve(0) fx:setDrive(12.0) fx:setOutput(-3.0) fx:setPreFilter(0)
  fx:setPostFilter(0) fx:setBias(0.0) fx:setMix(1.0) fx:setOversample(2)]],
    params = {
      {"curve",      'type="f",min=0,max=6,default=0',          "setCurve"},
      {"drive",      'type="f",min=0,max=40,default=12',        "setDrive"},
      {"output",     'type="f",min=-20,max=20,default=-3',      "setOutput"},
      {"prefilter",  'type="f",min=0,max=10000,default=0',      "setPreFilter"},
      {"postfilter", 'type="f",min=0,max=10000,default=0',      "setPostFilter"},
      {"bias",       'type="f",min=-1,max=1,default=0',         "setBias"},
      {"mix",        'type="f",min=0,max=1,default=1',          "setMix"},
      {"oversample", 'type="f",min=1,max=4,default=2',          "setOversample"},
    },
  },
  filter = {
    create = [[local fx = ctx.primitives.FilterNode.new()
  fx:setCutoff(900.0) fx:setResonance(0.2) fx:setMix(1.0)]],
    params = {
      {"cutoff",    'type="f",min=80,max=8000,default=900',  "setCutoff"},
      {"resonance", 'type="f",min=0,max=1,default=0.2',      "setResonance"},
      {"mix",       'type="f",min=0,max=1,default=1.0',      "setMix"},
    },
  },
  svf = {
    create = [[local fx = ctx.primitives.SVFNode.new()
  fx:setCutoff(1000) fx:setResonance(0.5) fx:setMode(0) fx:setDrive(0) fx:setMix(1.0)]],
    params = {
      {"cutoff",    'type="f",min=40,max=10000,default=1000',  "setCutoff"},
      {"resonance", 'type="f",min=0.06,max=1,default=0.5',    "setResonance"},
      {"mode",      'type="i",min=0,max=4,default=0',         "setMode"},
      {"drive",     'type="f",min=0,max=10,default=0',        "setDrive"},
      {"mix",       'type="f",min=0,max=1,default=1.0',       "setMix"},
    },
  },
  reverb = {
    create = [[local fx = ctx.primitives.ReverbNode.new()
  fx:setRoomSize(0.65) fx:setDamping(0.4) fx:setWetLevel(0.35) fx:setDryLevel(0.85) fx:setWidth(1.0)]],
    params = {
      {"room",    'type="f",min=0,max=1,default=0.65',  "setRoomSize"},
      {"damping", 'type="f",min=0,max=1,default=0.4',   "setDamping"},
      {"wet",     'type="f",min=0,max=1,default=0.35',  "setWetLevel"},
      {"dry",     'type="f",min=0,max=1,default=0.85',  "setDryLevel"},
      {"width",   'type="f",min=0,max=1,default=1.0',   "setWidth"},
    },
  },
  shimmer = {
    create = [[local fx = ctx.primitives.ShimmerNode.new()
  fx:setSize(0.65) fx:setPitch(12) fx:setFeedback(0.7) fx:setMix(0.5) fx:setModulation(0.25) fx:setFilter(5500)]],
    params = {
      {"size",     'type="f",min=0,max=1,default=0.65',       "setSize"},
      {"pitch",    'type="f",min=-12,max=12,default=12',      "setPitch"},
      {"feedback", 'type="f",min=0,max=0.99,default=0.7',     "setFeedback"},
      {"mix",      'type="f",min=0,max=1,default=0.5',        "setMix"},
      {"mod",      'type="f",min=0,max=1,default=0.25',       "setModulation"},
      {"filter",   'type="f",min=100,max=12000,default=5500', "setFilter"},
    },
  },
  stereodelay = {
    create = [[local fx = ctx.primitives.StereoDelayNode.new()
  fx:setTempo(120) fx:setTimeMode(0) fx:setTimeL(250) fx:setTimeR(375)
  fx:setFeedback(0.3) fx:setPingPong(0) fx:setFilterEnabled(0)
  fx:setFilterCutoff(4000) fx:setMix(0.5) fx:setFreeze(0) fx:setWidth(1.0)]],
    params = {
      {"timemode",    'type="i",min=0,max=1,default=0',          "setTimeMode"},
      {"timel",       'type="f",min=10,max=2000,default=250',    "setTimeL"},
      {"timer",       'type="f",min=10,max=2000,default=375',    "setTimeR"},
      {"feedback",    'type="f",min=0,max=1.2,default=0.3',      "setFeedback"},
      {"pingpong",    'type="i",min=0,max=1,default=0',          "setPingPong"},
      {"filter",      'type="i",min=0,max=1,default=0',          "setFilterEnabled"},
      {"filtercutoff",'type="f",min=200,max=10000,default=4000',  "setFilterCutoff"},
      {"mix",         'type="f",min=0,max=1,default=0.5',        "setMix"},
      {"freeze",      'type="i",min=0,max=1,default=0',          "setFreeze"},
      {"width",       'type="f",min=0,max=2,default=1.0',        "setWidth"},
    },
  },
  reversedelay = {
    create = [[local fx = ctx.primitives.ReverseDelayNode.new()
  fx:setTime(420) fx:setWindow(120) fx:setFeedback(0.45) fx:setMix(0.65)]],
    params = {
      {"time",     'type="f",min=50,max=2000,default=420',  "setTime"},
      {"window",   'type="f",min=20,max=400,default=120',   "setWindow"},
      {"feedback", 'type="f",min=0,max=0.95,default=0.45',  "setFeedback"},
      {"mix",      'type="f",min=0,max=1,default=0.65',     "setMix"},
    },
  },
  multitap = {
    create = [[local fx = ctx.primitives.MultitapDelayNode.new()
  fx:setTapCount(4)
  fx:setTapTime(1,180) fx:setTapTime(2,320) fx:setTapTime(3,470) fx:setTapTime(4,620)
  fx:setTapGain(1,0.5) fx:setTapGain(2,0.35) fx:setTapGain(3,0.28) fx:setTapGain(4,0.2)
  fx:setTapPan(1,-0.8) fx:setTapPan(2,-0.25) fx:setTapPan(3,0.25) fx:setTapPan(4,0.8)
  fx:setFeedback(0.3) fx:setMix(0.55)]],
    params = {
      {"tapcount", 'type="f",min=1,max=8,default=4',     "setTapCount"},
      {"feedback", 'type="f",min=0,max=0.95,default=0.3', "setFeedback"},
      {"mix",      'type="f",min=0,max=1,default=0.55',   "setMix"},
    },
  },
  pitchshift = {
    create = [[local fx = ctx.primitives.PitchShifterNode.new()
  fx:setPitch(7) fx:setWindow(80) fx:setFeedback(0.15) fx:setMix(1.0)]],
    params = {
      {"pitch",    'type="f",min=-24,max=24,default=7',    "setPitch"},
      {"window",   'type="f",min=20,max=200,default=80',   "setWindow"},
      {"feedback", 'type="f",min=0,max=0.95,default=0.15', "setFeedback"},
      {"mix",      'type="f",min=0,max=1,default=1.0',     "setMix"},
    },
  },
  granulator = {
    create = [[local fx = ctx.primitives.GranulatorNode.new()
  fx:setGrainSize(90) fx:setDensity(24) fx:setPosition(0.6) fx:setPitch(0)
  fx:setSpray(0.25) fx:setFreeze(false) fx:setEnvelope(0) fx:setMix(1.0)]],
    params = {
      {"grainsize", 'type="f",min=1,max=500,default=90',   "setGrainSize"},
      {"density",   'type="f",min=1,max=100,default=24',   "setDensity"},
      {"position",  'type="f",min=0,max=1,default=0.6',    "setPosition"},
      {"pitch",     'type="f",min=-24,max=24,default=0',   "setPitch"},
      {"spray",     'type="f",min=0,max=1,default=0.25',   "setSpray"},
      {"freeze",    'type="f",min=0,max=1,default=0',      "setFreeze"},
      {"envelope",  'type="f",min=0,max=1,default=0',      "setEnvelope"},
      {"mix",       'type="f",min=0,max=1,default=1',      "setMix"},
    },
  },
  ringmod = {
    create = [[local fx = ctx.primitives.RingModulatorNode.new()
  fx:setFrequency(120) fx:setDepth(1.0) fx:setMix(1.0) fx:setSpread(30)]],
    params = {
      {"freq",   'type="f",min=0.1,max=2000,default=120', "setFrequency"},
      {"depth",  'type="f",min=0,max=1,default=1.0',      "setDepth"},
      {"mix",    'type="f",min=0,max=1,default=1.0',      "setMix"},
      {"spread", 'type="f",min=0,max=180,default=30',     "setSpread"},
    },
  },
  formant = {
    create = [[local fx = ctx.primitives.FormantFilterNode.new()
  fx:setVowel(0) fx:setShift(0) fx:setResonance(7) fx:setDrive(1.4) fx:setMix(1.0)]],
    params = {
      {"vowel",     'type="f",min=0,max=4,default=0',     "setVowel"},
      {"shift",     'type="f",min=-12,max=12,default=0',  "setShift"},
      {"resonance", 'type="f",min=1,max=20,default=7',    "setResonance"},
      {"drive",     'type="f",min=0.5,max=8,default=1.4', "setDrive"},
      {"mix",       'type="f",min=0,max=1,default=1.0',   "setMix"},
    },
  },
  eq = {
    create = [[local fx = ctx.primitives.EQNode.new()
  fx:setLowGain(6) fx:setLowFreq(120) fx:setMidGain(-4) fx:setMidFreq(900)
  fx:setMidQ(0.8) fx:setHighGain(4) fx:setHighFreq(8000) fx:setOutput(0) fx:setMix(1.0)]],
    params = {
      {"low_gain",  'type="f",min=-24,max=24,default=6',     "setLowGain"},
      {"low_freq",  'type="f",min=20,max=400,default=120',   "setLowFreq"},
      {"mid_gain",  'type="f",min=-24,max=24,default=-4',    "setMidGain"},
      {"mid_freq",  'type="f",min=120,max=8000,default=900', "setMidFreq"},
      {"mid_q",     'type="f",min=0.2,max=12,default=0.8',   "setMidQ"},
      {"high_gain", 'type="f",min=-24,max=24,default=4',     "setHighGain"},
      {"high_freq", 'type="f",min=2000,max=16000,default=8000',"setHighFreq"},
      {"output",    'type="f",min=-24,max=24,default=0',     "setOutput"},
      {"mix",       'type="f",min=0,max=1,default=1.0',      "setMix"},
    },
  },
  compressor = {
    create = [[local fx = ctx.primitives.CompressorNode.new()
  fx:setThreshold(-18) fx:setRatio(4) fx:setAttack(5) fx:setRelease(100)
  fx:setKnee(6) fx:setMakeup(0) fx:setAutoMakeup(true) fx:setMode(0)
  fx:setDetectorMode(0) fx:setSidechainHPF(100) fx:setMix(1.0)]],
    params = {
      {"threshold",    'type="f",min=-60,max=0,default=-18',     "setThreshold"},
      {"ratio",        'type="f",min=1,max=20,default=4',        "setRatio"},
      {"attack",       'type="f",min=0.1,max=100,default=5',     "setAttack"},
      {"release",      'type="f",min=1,max=1000,default=100',    "setRelease"},
      {"knee",         'type="f",min=0,max=20,default=6',        "setKnee"},
      {"makeup",       'type="f",min=0,max=40,default=0',        "setMakeup"},
      {"auto_makeup",  'type="f",min=0,max=1,default=1',         "setAutoMakeup"},
      {"mode",         'type="f",min=0,max=1,default=0',         "setMode"},
      {"detector",     'type="f",min=0,max=1,default=0',         "setDetectorMode"},
      {"sidechain_hpf",'type="f",min=20,max=1000,default=100',   "setSidechainHPF"},
      {"mix",          'type="f",min=0,max=1,default=1.0',       "setMix"},
    },
  },
  limiter = {
    create = [[local fx = ctx.primitives.LimiterNode.new()
  fx:setThreshold(-6) fx:setRelease(80) fx:setMakeup(0) fx:setSoftClip(0.4) fx:setMix(1.0)]],
    params = {
      {"threshold", 'type="f",min=-24,max=0,default=-6',   "setThreshold"},
      {"release",   'type="f",min=1,max=500,default=80',   "setRelease"},
      {"makeup",    'type="f",min=0,max=18,default=0',     "setMakeup"},
      {"soft",      'type="f",min=0,max=1,default=0.4',    "setSoftClip"},
      {"mix",       'type="f",min=0,max=1,default=1.0',    "setMix"},
    },
  },
  transient = {
    create = [[local fx = ctx.primitives.TransientShaperNode.new()
  fx:setAttack(0.6) fx:setSustain(-0.3) fx:setSensitivity(1.2) fx:setMix(1.0)]],
    params = {
      {"attack",      'type="f",min=-1,max=1,default=0.6',   "setAttack"},
      {"sustain",     'type="f",min=-1,max=1,default=-0.3',  "setSustain"},
      {"sensitivity", 'type="f",min=0.1,max=4,default=1.2',  "setSensitivity"},
      {"mix",         'type="f",min=0,max=1,default=1.0',    "setMix"},
    },
  },
  widener = {
    create = [[local fx = ctx.primitives.StereoWidenerNode.new()
  fx:setWidth(1.25) fx:setMonoLowFreq(140) fx:setMonoLowEnable(true)]],
    params = {
      {"width",          'type="f",min=0,max=2,default=1.25',     "setWidth"},
      {"monolowfreq",    'type="f",min=20,max=500,default=140',   "setMonoLowFreq"},
      {"monolowenable",  'type="f",min=0,max=1,default=1',        "setMonoLowEnable"},
    },
  },
}

local SEG_BARS = {0.0625, 0.125, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0}
local SEG_LABELS = {"1/16", "1/8", "1/4", "1/2", "1", "2", "4", "8", "16"}

local function clamp(v, lo, hi)
  if v < lo then return lo end
  if v > hi then return hi end
  return v
end

local function endpointExists(path)
  if type(hasEndpoint) == "function" then
    local ok, exists = pcall(hasEndpoint, path)
    return ok and exists == true
  end
  return true
end

local function setParamSafe(path, value)
  if type(path) ~= "string" or path == "" then return false end
  if not endpointExists(path) then return false end
  if type(setParam) == "function" then
    local ok, handled = pcall(setParam, path, value)
    return ok and handled == true
  end
  return false
end

local function getParamSafe(path, fallback)
  if type(path) ~= "string" or path == "" then return fallback end
  if type(getParam) == "function" and endpointExists(path) then
    local ok, value = pcall(getParam, path)
    if ok and value ~= nil then return value end
  end
  return fallback
end

local function triggerSafe(path) command("TRIGGER", path) end

local function readParam(params, path, fallback)
  if type(params) ~= "table" then return fallback end
  local v = params[path]
  if v == nil then return fallback end
  return v
end

local function liveParam(params, path, fallback)
  return getParamSafe(path, readParam(params, path, fallback))
end

local function readBoolParam(params, path, fallback)
  local raw = readParam(params, path, fallback and 1 or 0)
  return raw == true or raw == 1
end

local function layerPath(layerIndex, suffix)
  return string.format("/core/behavior/layer/%d/%s", layerIndex, suffix)
end

local function selectLayer(layerIndex)
  local idx = clamp(math.floor(tonumber(layerIndex) or 0), 0, MAX_LAYERS - 1)
  local ok1 = setParamSafe("/core/behavior/activeLayer", idx)
  local ok2 = setParamSafe("/core/behavior/layer", idx)
  return ok1 or ok2
end

-- Endpoint base paths — the slot host uses namespace /core/slots/super,
-- but the path mapping exposes them as /core/super/...
local function vocalFxBasePath()
  return "/core/super/vocal/slot"
end

local function layerFxBasePath(layerIndex)
  return string.format("/core/super/layer/%d/fx", layerIndex)
end

local function vocalFxPath(suffix)
  local base = vocalFxBasePath()
  if suffix == nil or suffix == "" then return base end
  return base .. "/" .. suffix
end

local function layerFxPath(layerIndex, suffix)
  local base = layerFxBasePath(layerIndex)
  if suffix == nil or suffix == "" then return base end
  return base .. "/" .. suffix
end

----------------------------------------------------------------------
-- DSP script generator
----------------------------------------------------------------------
-- Generates a small buildPlugin script that creates ONLY the selected
-- effect nodes — one for vocal, one per layer. Uses ctx.params.bind
-- exactly like every working test script.
----------------------------------------------------------------------

local function generateFxBlock(varName, basePath, effectId)
  local def = FX_SCRIPT_DEFS[effectId]
  if not def then
    def = FX_SCRIPT_DEFS["bypass"]
    effectId = "bypass"
  end

  local lines = {}
  -- create the node
  lines[#lines+1] = "  do"
  lines[#lines+1] = "  " .. def.create
  lines[#lines+1] = string.format('  ctx.graph.connect(%s_in, fx)', varName)
  lines[#lines+1] = string.format('  ctx.graph.connect(fx, %s_out)', varName)
  -- register + bind params
  for _, p in ipairs(def.params) do
    local path = basePath .. "/" .. effectId .. "/" .. p[1]
    lines[#lines+1] = string.format('  ctx.params.register("%s", {%s})', path, p[2])
    lines[#lines+1] = string.format('  ctx.params.bind("%s", fx, "%s")', path, p[3])
  end
  lines[#lines+1] = "  end"
  return table.concat(lines, "\n")
end

local function generateSuperDspCode(vocalId, layerIds)
  local lines = {}
  lines[#lines+1] = "function buildPlugin(ctx)"
  lines[#lines+1] = "  local hostInput = ctx.primitives.PassthroughNode.new(2)"
  lines[#lines+1] = "  local inputTrim = ctx.primitives.GainNode.new(2)"
  lines[#lines+1] = "  inputTrim:setGain(1.0)"
  lines[#lines+1] = "  ctx.graph.connect(hostInput, inputTrim)"
  lines[#lines+1] = ""

  -- Vocal FX: inputTrim -> vocal_in -> fx -> vocal_out
  lines[#lines+1] = "  local vocal_in = ctx.primitives.PassthroughNode.new(2)"
  lines[#lines+1] = "  local vocal_out = ctx.primitives.GainNode.new(2)"
  lines[#lines+1] = "  vocal_out:setGain(1.0)"
  lines[#lines+1] = "  ctx.graph.connect(inputTrim, vocal_in)"
  lines[#lines+1] = generateFxBlock("vocal", "/core/super/vocal/slot", vocalId)
  lines[#lines+1] = ""

  -- Layer mixer
  lines[#lines+1] = "  local layerMixer = ctx.primitives.MixerNode.new()"
  lines[#lines+1] = "  layerMixer:setInputCount(4)"
  lines[#lines+1] = "  layerMixer:setMaster(1.0)"
  for i = 1, 4 do
    lines[#lines+1] = string.format("  layerMixer:setGain(%d, 1.0)", i)
    lines[#lines+1] = string.format("  layerMixer:setPan(%d, 0.0)", i)
  end
  lines[#lines+1] = ""

  -- Helper to get host nodes
  lines[#lines+1] = "  local function hostNode(path)"
  lines[#lines+1] = "    if ctx.host and ctx.host.getGraphNodeByPath then"
  lines[#lines+1] = "      return ctx.host.getGraphNodeByPath(path)"
  lines[#lines+1] = "    end"
  lines[#lines+1] = "    return nil"
  lines[#lines+1] = "  end"
  lines[#lines+1] = ""

  -- Per-layer FX
  for i = 0, 3 do
    local lid = (layerIds and layerIds[i+1]) or "bypass"
    local lvar = "layer" .. tostring(i)
    local lbase = "/core/super/layer/" .. tostring(i) .. "/fx"
    lines[#lines+1] = string.format("  local %s_in = ctx.primitives.PassthroughNode.new(2)", lvar)
    lines[#lines+1] = string.format("  local %s_out = ctx.primitives.GainNode.new(2)", lvar)
    lines[#lines+1] = string.format("  %s_out:setGain(1.0)", lvar)

    lines[#lines+1] = generateFxBlock(lvar, lbase, lid)

    -- Connect layer output -> fx input, fx output -> mixer
    lines[#lines+1] = string.format('  local layerOut%d = hostNode("/core/behavior/layer/%d/output")', i, i)
    lines[#lines+1] = string.format('  if layerOut%d then ctx.graph.connect(layerOut%d, %s_in) end', i, i, lvar)
    lines[#lines+1] = string.format('  ctx.graph.connect(%s_out, layerMixer, 0, %d)', lvar, i)

    -- Connect vocal output -> layer input (for recording through vocal FX)
    lines[#lines+1] = string.format('  local layerIn%d = hostNode("/core/behavior/layer/%d/input")', i, i)
    lines[#lines+1] = string.format('  if layerIn%d then ctx.graph.connect(vocal_out, layerIn%d) end', i, i)
    lines[#lines+1] = ""
  end

  -- Main mixer: layer mix + vocal direct
  lines[#lines+1] = "  local mainMixer = ctx.primitives.MixerNode.new()"
  lines[#lines+1] = "  mainMixer:setInputCount(2)"
  lines[#lines+1] = "  mainMixer:setGain(1, 1.0) mainMixer:setPan(1, 0.0)"
  lines[#lines+1] = "  mainMixer:setGain(2, 1.0) mainMixer:setPan(2, 0.0)"
  lines[#lines+1] = "  mainMixer:setMaster(1.0)"
  lines[#lines+1] = "  local masterGain = ctx.primitives.GainNode.new(2)"
  lines[#lines+1] = "  masterGain:setGain(1.0)"
  lines[#lines+1] = "  ctx.graph.connect(layerMixer, mainMixer, 0, 0)"
  lines[#lines+1] = "  ctx.graph.connect(vocal_out, mainMixer, 0, 1)"
  lines[#lines+1] = "  ctx.graph.connect(mainMixer, masterGain)"
  lines[#lines+1] = ""
  lines[#lines+1] = "  return {}"
  lines[#lines+1] = "end"
  lines[#lines+1] = "return buildPlugin"

  return table.concat(lines, "\n")
end

-- Current selections (UI-side state, not endpoint-driven)
local selections = {
  vocal = "bypass",
  layers = { "bypass", "bypass", "bypass", "bypass" },
}

-- Track what's currently loaded to avoid redundant reloads (which crash sol::state)
local loadedSelectionKey = nil

local function selectionKey()
  return selections.vocal .. "|" ..
    (selections.layers[1] or "bypass") .. "|" ..
    (selections.layers[2] or "bypass") .. "|" ..
    (selections.layers[3] or "bypass") .. "|" ..
    (selections.layers[4] or "bypass")
end

local function loadSuperDsp(force)
  if type(loadDspScriptFromStringInSlot) ~= "function" then
    return false
  end
  if type(setDspSlotPersistOnUiSwitch) == "function" then
    pcall(setDspSlotPersistOnUiSwitch, DSP_SLOT, true)
  end

  -- Skip reload if already loaded with same selections
  local key = selectionKey()
  if not force and loadedSelectionKey == key then
    return true
  end

  local code = generateSuperDspCode(selections.vocal, selections.layers)
  local ok, result = pcall(loadDspScriptFromStringInSlot, code, "super_dsp_gen", DSP_SLOT)
  if ok and result then
    loadedSelectionKey = key
    -- Force scope catalog refresh
    if ui.vocalScope then ui.vocalScope.effectId = nil end
    for _, card in ipairs(ui.layers or {}) do
      if card and card.scope then card.scope.effectId = nil end
    end
  end
  return ok and result
end

local function onEffectSelected(slotType, slotIndex, fxIndex)
  local effectId = FX_EFFECTS[fxIndex] and FX_EFFECTS[fxIndex].id or "bypass"
  if slotType == "vocal" then
    selections.vocal = effectId
  else
    selections.layers[slotIndex + 1] = effectId
  end
  loadSuperDsp(true)
end

_G.donutSuperSelectEffect = function(slotType, slotIndex, fxIndex)
  onEffectSelected(slotType, tonumber(slotIndex) or 0, tonumber(fxIndex) or 1)
  return true
end

_G.donutSuperDebugState = function()
  return {
    vocal = selections.vocal,
    layers = selections.layers,
  }
end

----------------------------------------------------------------------
-- State normalization
----------------------------------------------------------------------

local function normalizeState(s)
  if type(s) ~= "table" then return {} end

  local params = s.params or {}
  local voices = s.voices or {}

  local out = {
    params = params,
    voices = voices,
    tempo = tonumber(liveParam(params, "/core/behavior/tempo", 120)) or 120,
    targetBPM = tonumber(liveParam(params, "/core/behavior/targetbpm", 120)) or 120,
    samplesPerBar = tonumber(readParam(params, "/core/behavior/samplesPerBar", 88200)) or 88200,
    captureSize = tonumber(readParam(params, "/core/behavior/captureSize", 0)) or 0,
    isRecording = (tonumber(liveParam(params, "/core/behavior/recording", 0)) or 0) > 0.5,
    overdubEnabled = (tonumber(liveParam(params, "/core/behavior/overdub", 0)) or 0) > 0.5,
    activeLayer = tonumber(liveParam(params, "/core/behavior/activeLayer", liveParam(params, "/core/behavior/layer", 0))) or 0,
    recordMode = liveParam(params, "/core/behavior/mode", "firstLoop"),
    forwardArmed = (tonumber(liveParam(params, "/core/behavior/forwardArmed", 0)) or 0) > 0.5,
    forwardBars = tonumber(liveParam(params, "/core/behavior/forwardBars", 0)) or 0,
    layers = {},
    vocalFx = {},
  }

  if type(out.recordMode) == "number" then
    local idx = clamp(math.floor(out.recordMode + 0.5), 0, 2)
    if idx == 0 then out.recordMode = "firstLoop"
    elseif idx == 1 then out.recordMode = "freeMode"
    else out.recordMode = "traditional" end
  end

  if #voices > 0 then
    for i, voice in pairs(voices) do
      if type(voice) == "table" then
        local layerIndex = tonumber(voice.id)
        if layerIndex == nil then
          layerIndex = (tonumber(i) or 1) - 1
        end
        layerIndex = clamp(math.floor(layerIndex + 0.5), 0, MAX_LAYERS - 1)
        local voicePositionNorm = tonumber(voice.positionNorm)
        if voicePositionNorm == nil and type(voice.params) == "table" then
          voicePositionNorm = tonumber(voice.params.position)
        end
        local voiceLength = tonumber(voice.length) or 0
        local voicePosition = tonumber(voice.position) or 0
        if voicePositionNorm == nil then
          voicePositionNorm = (voiceLength > 0) and (voicePosition / voiceLength) or 0.0
        end
        out.layers[layerIndex + 1] = {
          index = layerIndex,
          length = voiceLength,
          position = voicePosition,
          positionNorm = clamp(voicePositionNorm, 0.0, 1.0),
          speed = voice.speed or 1,
          reversed = voice.reversed or false,
          volume = voice.volume or 1,
          state = voice.state or "empty",
          muted = voice.muted or false,
        }
      end
    end

    for i = 0, MAX_LAYERS - 1 do
      if out.layers[i + 1] == nil then
        out.layers[i + 1] = {
          index = i,
          length = 0,
          position = 0,
          positionNorm = 0.0,
          speed = 1,
          reversed = false,
          volume = 1,
          state = "empty",
          muted = false,
        }
      end
    end
  else
    for i = 0, MAX_LAYERS - 1 do
      local length = tonumber(readParam(params, layerPath(i, "length"), 0)) or 0
      local pos = tonumber(readParam(params, layerPath(i, "position"), 0)) or 0
      local stateName = readParam(params, layerPath(i, "state"), nil)
      if type(stateName) ~= "string" then
        if out.isRecording and out.activeLayer == i then stateName = "recording"
        elseif length > 0 then stateName = "stopped"
        else stateName = "empty" end
      end

      out.layers[i + 1] = {
        index = i,
        length = length,
        position = math.floor(pos * math.max(1, length)),
        positionNorm = clamp(pos, 0.0, 1.0),
        speed = tonumber(readParam(params, layerPath(i, "speed"), 1.0)) or 1.0,
        reversed = readBoolParam(params, layerPath(i, "reverse"), false),
        volume = tonumber(readParam(params, layerPath(i, "volume"), 1.0)) or 1.0,
        muted = readBoolParam(params, layerPath(i, "mute"), false),
        state = stateName,
      }
    end
  end

  return out
end

local function easedLayerBounce(layerIdx, target)
  if type(ui.layerBounce) ~= "table" then ui.layerBounce = {} end
  local key = layerIdx + 1
  local prev = ui.layerBounce[key] or 0.0
  local nextV = prev * 0.84 + target * 0.16
  ui.layerBounce[key] = nextV
  return nextV
end

local function effectIdFromSelect(raw)
  local idx = clamp(math.floor((tonumber(raw) or 0) + 0.5), 0, #FX_EFFECTS - 1)
  return FX_EFFECTS[idx + 1].id, idx
end

local function effectLabelFromSelect(raw)
  local idx = clamp(math.floor((tonumber(raw) or 0) + 0.5), 0, #FX_EFFECTS - 1)
  return FX_EFFECTS[idx + 1].label, idx
end

local function effectIndexFromId(id)
  for i, fx in ipairs(FX_EFFECTS) do
    if fx.id == id then return i end
  end
  return 1
end

----------------------------------------------------------------------
-- Mapping system
----------------------------------------------------------------------

local function createMapping(path, label, rangeMin, rangeMax, typeTag)
  return {
    path = path,
    label = label,
    rangeMin = tonumber(rangeMin) or 0.0,
    rangeMax = tonumber(rangeMax) or 1.0,
    type = typeTag or "f",
  }
end

local function mappingRange(mapping)
  local lo = tonumber(mapping and mapping.rangeMin) or 0.0
  local hi = tonumber(mapping and mapping.rangeMax) or 1.0
  if hi < lo then lo, hi = hi, lo end
  if hi == lo then hi = lo + 1.0 end
  return lo, hi
end

local function mappingToNormalized(mapping, actual, fallbackNorm)
  if mapping == nil or type(mapping.path) ~= "string" or mapping.path == "" then
    return fallbackNorm or 0.5
  end
  local lo, hi = mappingRange(mapping)
  return clamp((actual - lo) / (hi - lo), 0.0, 1.0)
end

local function normalizedToMapping(mapping, norm)
  if mapping == nil or type(mapping.path) ~= "string" or mapping.path == "" then
    return 0.0
  end
  local lo, hi = mappingRange(mapping)
  return lo + clamp(norm, 0.0, 1.0) * (hi - lo)
end

local function knobStepForMapping(mapping)
  if mapping == nil then return 0.01 end
  if type(mapping.type) == "string" and mapping.type:find("i", 1, true) then
    return 1.0
  end
  local lo, hi = mappingRange(mapping)
  return math.max(0.001, (hi - lo) / 200.0)
end

local function applyMappedNormalized(mapping, norm)
  if mapping == nil or type(mapping.path) ~= "string" or mapping.path == "" then return false end
  return setParamSafe(mapping.path, normalizedToMapping(mapping, norm))
end

local function applyMappedActual(mapping, value)
  if mapping == nil or type(mapping.path) ~= "string" or mapping.path == "" then return false end
  return setParamSafe(mapping.path, value)
end

local function readMappedActual(mapping, fallback)
  if mapping == nil or type(mapping.path) ~= "string" or mapping.path == "" then return fallback end
  return tonumber(getParamSafe(mapping.path, fallback)) or fallback
end

local function readMappedNormalized(mapping, fallbackNorm)
  if mapping == nil or type(mapping.path) ~= "string" or mapping.path == "" then return fallbackNorm or 0.5 end
  return mappingToNormalized(mapping, getParamSafe(mapping.path, normalizedToMapping(mapping, fallbackNorm or 0.5)), fallbackNorm or 0.5)
end

local function updateKnobBinding(knob, mapping, fallbackLabel)
  if not knob then return end
  local lo, hi = mappingRange(mapping)
  knob._min = lo
  knob._max = hi
  knob._step = knobStepForMapping(mapping)
  knob._label = (mapping and mapping.label) or fallbackLabel or knob._label or ""
end

local function shortEndpointLabel(path, prefix)
  if type(path) ~= "string" then return "(unmapped)" end
  local p = path
  if type(prefix) == "string" and prefix ~= "" and p:sub(1, #prefix) == prefix then
    p = p:sub(#prefix + 1)
  end
  p = p:gsub("^/", "")
  p = p:gsub("_", " ")
  return p
end

-- Build scoped catalog from listEndpoints if available, else from FX_SCRIPT_DEFS
local function buildScopedCatalog(basePath, effectId)
  local out = { createMapping(nil, "(unmapped)", 0.0, 1.0, "f") }

  -- Try listEndpoints first (these are the real registered endpoints)
  local prefix = tostring(basePath or "") .. "/" .. tostring(effectId or "") .. "/"
  if type(listEndpoints) == "function" and effectId and effectId ~= "bypass" then
    local ok, endpoints = pcall(listEndpoints, prefix, true, true)
    if ok and type(endpoints) == "table" and #endpoints > 0 then
      for i = 1, #endpoints do
        local ep = endpoints[i]
        if type(ep) == "table" and type(ep.path) == "string" and ep.path ~= "" then
          out[#out + 1] = createMapping(
            ep.path,
            shortEndpointLabel(ep.path, prefix),
            ep.rangeMin,
            ep.rangeMax,
            ep.type
          )
        end
      end
      return out
    end
  end

  -- Fallback: build from FX_SCRIPT_DEFS
  local def = FX_SCRIPT_DEFS[effectId]
  if def then
    for _, p in ipairs(def.params) do
      local path = prefix .. p[1]
      -- parse min/max/type from the register opts string
      local ptype = p[2]:match('type="([^"]*)"') or "f"
      local pmin = tonumber(p[2]:match('min=([%-%d%.]+)')) or 0
      local pmax = tonumber(p[2]:match('max=([%-%d%.]+)')) or 1
      out[#out + 1] = createMapping(path, p[1]:gsub("_", " "), pmin, pmax, ptype)
    end
  end

  return out
end

local function createMappingScope(basePath)
  return {
    basePath = basePath,
    mappings = { x = nil, y = nil, k1 = nil, k2 = nil, mix = nil },
    catalog = { createMapping(nil, "(unmapped)", 0.0, 1.0, "f") },
    labels = { "(unmapped)" },
    effectId = nil,
  }
end

local function scopeCatalogIndex(scope, path)
  local catalog = scope and scope.catalog or {}
  for i = 1, #catalog do
    if catalog[i].path == path then return i end
  end
  return 1
end

local function assignScopeMappingByIndex(scope, key, idx)
  local catalog = scope and scope.catalog or {}
  local item = catalog[idx] or catalog[1]
  scope.mappings[key] = item and item.path and createMapping(item.path, item.label, item.rangeMin, item.rangeMax, item.type) or nil
end

local function preferredIndex(scope, patterns, used)
  local catalog = scope and scope.catalog or {}
  for _, pattern in ipairs(patterns or {}) do
    for i = 2, #catalog do
      if not used[i] then
        local label = string.lower(tostring(catalog[i].label or ""))
        local path = string.lower(tostring(catalog[i].path or ""))
        if label:find(pattern, 1, true) or path:find(pattern, 1, true) then
          used[i] = true
          return i
        end
      end
    end
  end
  for i = 2, #catalog do
    if not used[i] then
      used[i] = true
      return i
    end
  end
  return 1
end

local function assignDefaultScopeMappings(scope)
  local used = {}
  local xIdx = preferredIndex(scope, { "cutoff", "rate", "time", "timel", "pitch", "size", "freq", "grain", "width", "threshold" }, used)
  local yIdx = preferredIndex(scope, { "resonance", "feedback", "timer", "density", "damping", "depth", "release", "window", "shift", "high" }, used)
  local k1Idx = preferredIndex(scope, { "drive", "attack", "spread", "makeup", "vowel", "tapcount", "voices", "bits", "room", "low" }, used)
  local k2Idx = preferredIndex(scope, { "mix", "wet", "output", "soft", "freeze", "mode", "ratio", "mono", "feedback" }, used)
  local mixIdx = preferredIndex(scope, { "mix", "wet", "output", "dry", "level", "width" }, used)

  assignScopeMappingByIndex(scope, "x", xIdx)
  assignScopeMappingByIndex(scope, "y", yIdx)
  assignScopeMappingByIndex(scope, "k1", k1Idx)
  assignScopeMappingByIndex(scope, "k2", k2Idx)
  assignScopeMappingByIndex(scope, "mix", mixIdx)
end

local function ensureScopeCatalog(scope, effectId)
  if not scope then return end
  if scope.effectId == effectId and scope.catalog and #scope.catalog > 1 then
    return
  end

  scope.catalog = buildScopedCatalog(scope.basePath, effectId)
  scope.labels = {}
  for i = 1, #scope.catalog do
    scope.labels[i] = scope.catalog[i].label
  end

  local previous = scope.mappings or {}
  scope.effectId = effectId
  scope.mappings = { x = nil, y = nil, k1 = nil, k2 = nil, mix = nil }

  local validCount = 0
  for _, key in ipairs({ "x", "y", "k1", "k2", "mix" }) do
    local old = previous[key]
    if old and scopeCatalogIndex(scope, old.path) ~= 1 then
      assignScopeMappingByIndex(scope, key, scopeCatalogIndex(scope, old.path))
      validCount = validCount + 1
    end
  end

  if validCount == 0 then
    assignDefaultScopeMappings(scope)
  end
end

local function newMappingDropdown(parent, name, scope, key, colour)
  local dropdown = W.Dropdown.new(parent, name, {
    options = scope.labels,
    selected = 1,
    bg = 0xff0f172a,
    colour = colour or 0xff93c5fd,
    rootNode = contentRoot,
    max_visible_rows = 12,
    on_select = function(idx)
      assignScopeMappingByIndex(scope, key, idx)
    end,
  })
  return dropdown
end

local function syncScopeDropdown(dropdown, scope, key)
  if not dropdown or not scope then return end
  dropdown:setOptions(scope.labels or { "(unmapped)" })
  local mapping = scope.mappings[key]
  dropdown:setSelected(scopeCatalogIndex(scope, mapping and mapping.path or nil))
end

local function syncMappedKnob(knob, mapping, fallbackLabel, fallbackValue)
  if not knob then return end
  updateKnobBinding(knob, mapping, fallbackLabel)
  if not knob._dragging then
    knob:setValue(readMappedActual(mapping, fallbackValue))
  end
end

local function syncMappedXY(widget, mappingX, mappingY, fallbackX, fallbackY)
  if not widget then return end
  widget:setValues(
    readMappedNormalized(mappingX, fallbackX),
    readMappedNormalized(mappingY, fallbackY)
  )
end

----------------------------------------------------------------------
-- UI init
----------------------------------------------------------------------

local function initTransport(parent)
  ui.transport = W.Panel.new(parent, "transport", { bg = 0xff111827, radius = 8 })

  ui.title = W.Label.new(ui.transport.node, "title", {
    text = "Donut Super Looper",
    colour = 0xff93c5fd,
    fontSize = 13,
    fontStyle = FontStyle.bold,
  })

  ui.recBtn = W.Button.new(ui.transport.node, "rec", {
    label = "● REC",
    bg = 0xff7f1d1d,
    on_press = function()
      if recButtonLatched then
        triggerSafe("/core/behavior/stoprec")
        recButtonLatched = false
      else
        triggerSafe("/core/behavior/rec")
        recButtonLatched = true
      end
    end,
  })

  ui.playBtn = W.Button.new(ui.transport.node, "play", {
    label = "▶", bg = 0xff14532d,
    on_click = function() triggerSafe("/core/behavior/play") end,
  })

  ui.pauseBtn = W.Button.new(ui.transport.node, "pause", {
    label = "⏸", bg = 0xff78350f,
    on_click = function() triggerSafe("/core/behavior/pause") end,
  })

  ui.stopBtn = W.Button.new(ui.transport.node, "stop", {
    label = "⏹", bg = 0xff334155,
    on_click = function() triggerSafe("/core/behavior/stop") end,
  })

  ui.clearBtn = W.Button.new(ui.transport.node, "clear", {
    label = "Clear", bg = 0xff7f1d1d,
    on_click = function() triggerSafe("/core/behavior/clear") end,
  })

  ui.overdubToggle = W.Toggle.new(ui.transport.node, "overdub", {
    label = "Overdub",
    onColour = 0xfff59e0b,
    offColour = 0xff374151,
    on_change = function(on)
      setParamSafe("/core/behavior/overdub", on and 1 or 0)
    end,
  })

  ui.tempoBox = W.NumberBox.new(ui.transport.node, "tempo", {
    min = 20, max = 300, step = 1, value = 120,
    label = "BPM", format = "%d", colour = 0xff38bdf8,
    on_change = function(v) setParamSafe("/core/behavior/tempo", v) end,
  })

  ui.targetBox = W.NumberBox.new(ui.transport.node, "target", {
    min = 20, max = 300, step = 1, value = 120,
    label = "Target", format = "%d", colour = 0xff22d3ee,
    on_change = function(v) setParamSafe("/core/behavior/targetbpm", v) end,
  })
end

local function initCapture(parent)
  ui.capture = W.Panel.new(parent, "capture", { bg = 0xff101723, radius = 8 })

  ui.captureTitle = W.Label.new(ui.capture.node, "captureTitle", {
    text = "",
    colour = 0xff9ca3af,
    fontSize = 12.0,
  })

  ui.captureStrips = {}
  for slot = 1, #SEG_BARS do
    local barsIndex = #SEG_BARS + 1 - slot
    local stripBars = SEG_BARS[barsIndex]
    local stripLabel = SEG_LABELS[barsIndex]

    local strip = W.Panel.new(ui.capture.node, "strip_" .. slot, {
      bg = 0xff0f1b2d,
      interceptsMouse = false,
    })

    local prevBars = (barsIndex > 1) and SEG_BARS[barsIndex - 1] or 0

    strip.node:setOnDraw(function(self)
      local w = self:getWidth()
      local h = self:getHeight()

      gfx.setColour(0xff0f1b2d)
      gfx.fillRect(0, 0, w, h)
      gfx.setColour(0x22ffffff)
      gfx.drawHorizontalLine(math.floor(h / 2), 0, w)

      local spb = current_state.samplesPerBar or 88200
      local rangeStart = math.floor(prevBars * spb)
      local rangeEnd = math.floor(stripBars * spb)
      local captureSize = current_state.captureSize or 0
      local clippedStart = math.max(0, math.min(captureSize, rangeStart))
      local clippedEnd = math.max(0, math.min(captureSize, rangeEnd))

      if clippedEnd > clippedStart and w > 4 then
        local numBuckets = math.min(w - 4, 128)
        local peaks = getCapturePeaks(clippedStart, clippedEnd, numBuckets)
        if peaks and #peaks > 0 then
          local centerY = h / 2
          local gain = h * 0.45
          gfx.setColour(0xff22d3ee)
          for x = 1, #peaks do
            local peak = peaks[x]
            local ph = peak * gain
            local px = 2 + (x - 1) * ((w - 4) / #peaks)
            gfx.drawVerticalLine(math.floor(px), centerY - ph, centerY + ph)
          end
        end
      end

      gfx.setColour(0x40475569)
      gfx.drawRect(0, 0, w, h)
      gfx.setColour(0xffcbd5e1)
      gfx.setFont(10.0)
      gfx.drawText(stripLabel, 4, h - 16, w - 8, 14, Justify.bottomLeft)
    end)

    ui.captureStrips[#ui.captureStrips + 1] = { node = strip.node, barsIndex = barsIndex }
  end

  ui.captureSegments = {}
  for i = #SEG_BARS, 1, -1 do
    local bars = SEG_BARS[i]
    local label = SEG_LABELS[i]

    local seg = W.Panel.new(ui.capture.node, "segment_hit_" .. i, {
      bg = 0x00000000,
      interceptsMouse = true,
    })

    seg.node:setOnClick(function()
      if current_state.recordMode == "traditional" then
        setParamSafe("/core/behavior/forward", bars)
      else
        setParamSafe("/core/behavior/commit", bars)
      end
    end)

    seg.node:setOnDraw(function(self)
      local w = self:getWidth()
      local h = self:getHeight()
      local hovered = self:isMouseOver()
      local armed = current_state.forwardArmed and math.abs((current_state.forwardBars or 0) - bars) < 0.001

      if hovered then
        gfx.setColour(0x2a60a5fa)
        gfx.fillRect(0, 0, w, h)
        gfx.setColour(0xff60a5fa)
        gfx.drawRect(0, 0, w, h, 1)
      end

      if armed then
        gfx.setColour(0x3384cc16)
        gfx.fillRect(0, 0, w, h)
        gfx.setColour(0xff84cc16)
        gfx.drawRect(0, 0, w, h, 2)
      end

      if hovered or armed then
        local tc = armed and 0xffd9f99d or 0xffbfdbfe
        gfx.setColour(tc)
        gfx.setFont(12.0)
        gfx.drawText(label .. " bars", 6, 0, w - 12, 20, Justify.topRight)
      end
    end)

    ui.captureSegments[#ui.captureSegments + 1] = { node = seg.node, bars = bars, index = i }
  end
end

local function initVocalFx(parent)
  ui.vocalScope = createMappingScope(vocalFxBasePath())

  ui.vocal = W.Panel.new(parent, "vocal", {
    bg = 0xff111827,
    radius = 8,
    border = 0xff1f2937,
    borderWidth = 1,
  })

  ui.vocalTitle = W.Label.new(ui.vocal.node, "vocalTitle", {
    text = "Vocal Input FX",
    colour = 0xff93c5fd,
    fontSize = 12,
    fontStyle = FontStyle.bold,
  })

  ui.vocalPreset = W.Dropdown.new(ui.vocal.node, "vocalPreset", {
    options = FX_PRESET_LABELS,
    selected = 1,
    bg = 0xff1e293b,
    colour = 0xff38bdf8,
    rootNode = contentRoot,
    max_visible_rows = 12,
    on_select = function(idx)
      onEffectSelected("vocal", 0, idx)
    end,
  })

  ui.vocalXMap = newMappingDropdown(ui.vocal.node, "vocalXMap", ui.vocalScope, "x", 0xff38bdf8)
  ui.vocalYMap = newMappingDropdown(ui.vocal.node, "vocalYMap", ui.vocalScope, "y", 0xff22d3ee)
  ui.vocalK1Map = newMappingDropdown(ui.vocal.node, "vocalK1Map", ui.vocalScope, "k1", 0xff38bdf8)
  ui.vocalK2Map = newMappingDropdown(ui.vocal.node, "vocalK2Map", ui.vocalScope, "k2", 0xff22d3ee)
  ui.vocalMixMap = newMappingDropdown(ui.vocal.node, "vocalMixMap", ui.vocalScope, "mix", 0xffa78bfa)

  ui.vocalXY = W.XYPadWidget.new(ui.vocal.node, "vocalXY", {
    x = 0.5, y = 0.5,
    bgColour = 0xff0b1220,
    gridColour = 0x335b6b82,
    handleColour = 0xfff59e0b,
    on_change = function(x, y)
      applyMappedNormalized(ui.vocalScope.mappings.x, x)
      applyMappedNormalized(ui.vocalScope.mappings.y, y)
    end,
  })

  ui.vocalK1 = W.Knob.new(ui.vocal.node, "vocalK1", {
    min = 0, max = 1, step = 0.01, value = 0.5,
    label = "K1", colour = 0xff22d3ee,
    on_change = function(v) applyMappedActual(ui.vocalScope.mappings.k1, v) end,
  })

  ui.vocalK2 = W.Knob.new(ui.vocal.node, "vocalK2", {
    min = 0, max = 1, step = 0.01, value = 0.5,
    label = "K2", colour = 0xff22d3ee,
    on_change = function(v) applyMappedActual(ui.vocalScope.mappings.k2, v) end,
  })

  ui.vocalMix = W.Knob.new(ui.vocal.node, "vocalMix", {
    min = 0, max = 1, step = 0.01, value = 0.45,
    label = "Mix", colour = 0xffa78bfa,
    on_change = function(v) applyMappedActual(ui.vocalScope.mappings.mix, v) end,
  })
end

local function initLayerCards(parent)
  ui.layers = {}

  for i = 0, MAX_LAYERS - 1 do
    local card = {}
    card.scope = createMappingScope(layerFxBasePath(i))

    card.panel = W.Panel.new(parent, "layerCard" .. i, {
      bg = 0xff0b1220,
      border = 0xff1f2937,
      borderWidth = 1,
      radius = 8,
    })
    card.panel.node:setOnClick(function()
      selectLayer(i)
    end)

    card.title = W.Label.new(card.panel.node, "title" .. i, {
      text = "Layer " .. tostring(i),
      colour = 0xffcbd5e1,
      fontSize = 12,
    })

    card.donut = W.DonutWidget.new(card.panel.node, "donut" .. i, {
      layerIndex = i,
      on_seek = function(layerIdx, norm)
        selectLayer(layerIdx)
        setParamSafe(layerPath(layerIdx, "seek"), norm)
      end,
    })

    card.play = W.Button.new(card.panel.node, "play" .. i, {
      label = "Play",
      bg = 0xff14532d,
      on_click = function()
        selectLayer(i)
        triggerSafe(layerPath(i, "play"))
      end,
    })

    card.clear = W.Button.new(card.panel.node, "clear" .. i, {
      label = "Clear",
      bg = 0xff7f1d1d,
      on_click = function()
        selectLayer(i)
        triggerSafe(layerPath(i, "clear"))
      end,
    })

    card.mute = W.Button.new(card.panel.node, "mute" .. i, {
      label = "Mute",
      bg = 0xff475569,
      on_click = function()
        selectLayer(i)
        local layer = current_state.layers and current_state.layers[i + 1] or {}
        setParamSafe(layerPath(i, "mute"), layer.muted and 0 or 1)
      end,
    })

    card.vol = W.Knob.new(card.panel.node, "vol" .. i, {
      min = 0, max = 2, step = 0.01, value = 1.0,
      label = "Volume", colour = 0xff34d399,
      on_change = function(v)
        selectLayer(i)
        setParamSafe(layerPath(i, "volume"), v)
      end,
    })

    local layerIdx = i
    card.preset = W.Dropdown.new(card.panel.node, "preset" .. i, {
      options = FX_PRESET_LABELS,
      selected = 1,
      bg = 0xff1e293b,
      colour = 0xff38bdf8,
      rootNode = contentRoot,
      max_visible_rows = 12,
      on_select = function(idx)
        selectLayer(layerIdx)
        onEffectSelected("layer", layerIdx, idx)
      end,
    })

    card.xMap = newMappingDropdown(card.panel.node, "xMap" .. i, card.scope, "x", 0xff38bdf8)
    card.yMap = newMappingDropdown(card.panel.node, "yMap" .. i, card.scope, "y", 0xff22d3ee)
    card.k1Map = newMappingDropdown(card.panel.node, "k1Map" .. i, card.scope, "k1", 0xff38bdf8)
    card.k2Map = newMappingDropdown(card.panel.node, "k2Map" .. i, card.scope, "k2", 0xff22d3ee)
    card.mixMap = newMappingDropdown(card.panel.node, "mixMap" .. i, card.scope, "mix", 0xffa78bfa)

    card.xy = W.XYPadWidget.new(card.panel.node, "xy" .. i, {
      x = 0.5, y = 0.5,
      bgColour = 0xff0b1220,
      gridColour = 0x335b6b82,
      handleColour = 0xfff59e0b,
      on_change = function(x, y)
        selectLayer(i)
        applyMappedNormalized(card.scope.mappings.x, x)
        applyMappedNormalized(card.scope.mappings.y, y)
      end,
    })

    card.k1 = W.Knob.new(card.panel.node, "k1" .. i, {
      min = 0, max = 1, step = 0.01, value = 0.5,
      label = "K1", colour = 0xff22d3ee,
      on_change = function(v)
        selectLayer(i)
        applyMappedActual(card.scope.mappings.k1, v)
      end,
    })

    card.k2 = W.Knob.new(card.panel.node, "k2" .. i, {
      min = 0, max = 1, step = 0.01, value = 0.5,
      label = "K2", colour = 0xff22d3ee,
      on_change = function(v)
        selectLayer(i)
        applyMappedActual(card.scope.mappings.k2, v)
      end,
    })

    card.mix = W.Knob.new(card.panel.node, "mix" .. i, {
      min = 0, max = 1, step = 0.01, value = 0.35,
      label = "Mix", colour = 0xffa78bfa,
      on_change = function(v)
        selectLayer(i)
        applyMappedActual(card.scope.mappings.mix, v)
      end,
    })

    ui.layers[i + 1] = card
  end
end

function ui_init(root)
  contentRoot = root
  ui.layerBounce = {}
  ui.pendingDspLoadFrames = 3
  ui.root = W.Panel.new(root, "root", { bg = 0xff060b16 })

  initTransport(ui.root.node)
  initCapture(ui.root.node)
  initVocalFx(ui.root.node)
  initLayerCards(ui.root.node)
end

function ui_resized(w, h)
  if not ui.root then return end
  ui.root:setBounds(0, 0, w, h)

  local pad = 8
  local transportH = 62
  local captureH = 96
  local vocalH = (w < 920) and 186 or 170

  ui.transport:setBounds(pad, pad, w - pad * 2, transportH)
  ui.title:setBounds(8, 6, 220, 16)
  ui.recBtn:setBounds(8, 28, 92, 26)
  ui.playBtn:setBounds(104, 28, 42, 26)
  ui.pauseBtn:setBounds(150, 28, 42, 26)
  ui.stopBtn:setBounds(196, 28, 42, 26)
  ui.clearBtn:setBounds(242, 28, 70, 26)
  ui.overdubToggle:setBounds(318, 28, 110, 26)
  ui.tempoBox:setBounds(w - 180, 10, 84, 38)
  ui.targetBox:setBounds(w - 92, 10, 84, 38)

  local captureY = pad + transportH + pad
  local captureW = w - pad * 2
  ui.capture:setBounds(pad, captureY, captureW, captureH)
  ui.captureTitle:setText("")
  ui.captureTitle:setBounds(0, 0, 0, 0)

  local captureArea = { x = 0, y = 4, w = captureW, h = captureH - 8 }
  local slotCount = #SEG_BARS
  local slotWidth = math.max(1, math.floor(captureArea.w / slotCount))
  local totalStripW = slotWidth * slotCount
  local x0 = captureArea.x + captureArea.w - totalStripW

  for slot, strip in ipairs(ui.captureStrips) do
    strip.node:setBounds(x0 + (slot - 1) * slotWidth, captureArea.y, slotWidth, captureArea.h)
  end

  for _, seg in ipairs(ui.captureSegments) do
    local i = seg.index
    local sx = x0 + (slotCount - i) * slotWidth
    local sw = i * slotWidth
    seg.node:setBounds(sx, captureArea.y, sw, captureArea.h)
  end

  local vocalY = captureY + captureH + pad
  ui.vocal:setBounds(pad, vocalY, w - pad * 2, vocalH)
  ui.vocalTitle:setBounds(8, 6, 180, 16)

  local vocalW = w - pad * 2
  local innerW = vocalW - 16
  local presetW = math.min(180, math.max(132, math.floor(innerW * 0.22)))
  ui.vocalPreset:setBounds(vocalW - presetW - 8, 6, presetW, 24)
  ui.vocalPreset:setAbsolutePos(pad + vocalW - presetW - 8, vocalY + 6)

  local minVocalRightW = 168
  local leftW = clamp(math.floor(innerW * 0.58), 180, math.max(180, innerW - minVocalRightW))
  local rightX = 8 + leftW + 12
  local rightW = math.max(minVocalRightW, vocalW - rightX - 8)

  local mapW = math.floor((leftW - 4) / 2)
  ui.vocalXMap:setBounds(8, 34, mapW, 24)
  ui.vocalYMap:setBounds(12 + mapW, 34, leftW - mapW - 4, 24)
  ui.vocalXMap:setAbsolutePos(pad + 8, vocalY + 34)
  ui.vocalYMap:setAbsolutePos(pad + 12 + mapW, vocalY + 34)

  ui.vocalXY:setBounds(8, 62, leftW, vocalH - 70)

  local knobMapW = math.floor((rightW - 8) / 3)
  ui.vocalK1Map:setBounds(rightX, 34, knobMapW, 24)
  ui.vocalK2Map:setBounds(rightX + knobMapW + 4, 34, knobMapW, 24)
  ui.vocalMixMap:setBounds(rightX + (knobMapW + 4) * 2, 34, rightW - (knobMapW + 4) * 2, 24)
  ui.vocalK1Map:setAbsolutePos(pad + rightX, vocalY + 34)
  ui.vocalK2Map:setAbsolutePos(pad + rightX + knobMapW + 4, vocalY + 34)
  ui.vocalMixMap:setAbsolutePos(pad + rightX + (knobMapW + 4) * 2, vocalY + 34)

  local knobY = 62
  local knobH = vocalH - 70
  ui.vocalK1:setBounds(rightX, knobY, knobMapW, knobH)
  ui.vocalK2:setBounds(rightX + knobMapW + 4, knobY, knobMapW, knobH)
  ui.vocalMix:setBounds(rightX + (knobMapW + 4) * 2, knobY, rightW - (knobMapW + 4) * 2, knobH)

  local layerY = vocalY + vocalH + pad
  local availH = h - layerY - pad
  local gap = 8
  local cardW = math.floor((w - pad * 2 - gap) / 2)
  local cardH = math.floor((availH - gap) / 2)

  for idx, card in ipairs(ui.layers) do
    local i = idx - 1
    local col = i % 2
    local row = math.floor(i / 2)
    local x = pad + col * (cardW + gap)
    local y = layerY + row * (cardH + gap)

    card.panel:setBounds(x, y, cardW, cardH)
    card.title:setBounds(8, 6, 220, 16)

    local leftWCard = clamp(math.floor(cardW * 0.34), 104, math.max(104, cardW - 168))
    local donutSize = math.max(88, math.min(leftWCard, cardH - 118))
    local buttonsY = 24 + donutSize + 6
    local volY = buttonsY + 30
    local volH = math.max(42, cardH - volY - 8)

    card.donut:setBounds(8, 24, donutSize, donutSize)

    local btnGap = 4
    local btnW = math.floor((donutSize - btnGap * 2) / 3)
    card.play:setBounds(8, buttonsY, btnW, 24)
    card.clear:setBounds(8 + btnW + btnGap, buttonsY, btnW, 24)
    card.mute:setBounds(8 + (btnW + btnGap) * 2, buttonsY, donutSize - (btnW + btnGap) * 2, 24)
    card.vol:setBounds(8, volY, donutSize, volH)

    local rX = 8 + donutSize + 12
    local rW = math.max(160, cardW - rX - 8)

    card.preset:setBounds(rX, 24, rW, 24)
    card.preset:setAbsolutePos(x + rX, y + 24)

    local xyMapW = math.floor((rW - 4) / 2)
    card.xMap:setBounds(rX, 52, xyMapW, 24)
    card.yMap:setBounds(rX + xyMapW + 4, 52, rW - xyMapW - 4, 24)
    card.xMap:setAbsolutePos(x + rX, y + 52)
    card.yMap:setAbsolutePos(x + rX + xyMapW + 4, y + 52)

    local knobMapY = cardH - 82
    local kY = knobMapY + 26
    local kH = math.max(48, cardH - kY - 8)
    local xyY = 80
    local xyH = math.max(68, knobMapY - xyY - 6)
    card.xy:setBounds(rX, xyY, rW, xyH)

    local kmW = math.floor((rW - 8) / 3)
    card.k1Map:setBounds(rX, knobMapY, kmW, 24)
    card.k2Map:setBounds(rX + kmW + 4, knobMapY, kmW, 24)
    card.mixMap:setBounds(rX + (kmW + 4) * 2, knobMapY, rW - (kmW + 4) * 2, 24)
    card.k1Map:setAbsolutePos(x + rX, y + knobMapY)
    card.k2Map:setAbsolutePos(x + rX + kmW + 4, y + knobMapY)
    card.mixMap:setAbsolutePos(x + rX + (kmW + 4) * 2, y + knobMapY)

    card.k1:setBounds(rX, kY, kmW, kH)
    card.k2:setBounds(rX + kmW + 4, kY, kmW, kH)
    card.mix:setBounds(rX + (kmW + 4) * 2, kY, rW - (kmW + 4) * 2, kH)
  end
end

function ui_update(s)
  if type(ui.pendingDspLoadFrames) == "number" and ui.pendingDspLoadFrames > 0 then
    ui.pendingDspLoadFrames = ui.pendingDspLoadFrames - 1
    if ui.pendingDspLoadFrames == 0 then
      loadSuperDsp()
    end
  end

  current_state = normalizeState(s)
  recButtonLatched = current_state.isRecording or false

  for _, strip in ipairs(ui.captureStrips or {}) do
    if strip.node and strip.node.repaint then
      strip.node:repaint()
    end
  end
  for _, card in ipairs(ui.layers or {}) do
    if card and card.donut and card.donut.node and card.donut.node.repaint then
      card.donut.node:repaint()
    end
  end

  ui.tempoBox:setValue(current_state.tempo or 120)
  ui.targetBox:setValue(current_state.targetBPM or 120)
  ui.overdubToggle:setValue(current_state.overdubEnabled or false)

  if current_state.isRecording then
    ui.recBtn:setLabel("● REC*")
    ui.recBtn:setBg(0xffdc2626)
  else
    ui.recBtn:setLabel("● REC")
    ui.recBtn:setBg(0xff7f1d1d)
  end

  -- Vocal FX
  local vocalEffectId = selections.vocal or "bypass"
  local vocalLabel = FX_EFFECTS[effectIndexFromId(vocalEffectId)].label
  ui.vocalScope.basePath = vocalFxBasePath()
  ensureScopeCatalog(ui.vocalScope, vocalEffectId)
  ui.vocalPreset:setSelected(effectIndexFromId(vocalEffectId))
  syncScopeDropdown(ui.vocalXMap, ui.vocalScope, "x")
  syncScopeDropdown(ui.vocalYMap, ui.vocalScope, "y")
  syncScopeDropdown(ui.vocalK1Map, ui.vocalScope, "k1")
  syncScopeDropdown(ui.vocalK2Map, ui.vocalScope, "k2")
  syncScopeDropdown(ui.vocalMixMap, ui.vocalScope, "mix")
  syncMappedXY(ui.vocalXY, ui.vocalScope.mappings.x, ui.vocalScope.mappings.y, 0.5, 0.5)
  syncMappedKnob(ui.vocalK1, ui.vocalScope.mappings.k1, "K1", 0.5)
  syncMappedKnob(ui.vocalK2, ui.vocalScope.mappings.k2, "K2", 0.5)
  syncMappedKnob(ui.vocalMix, ui.vocalScope.mappings.mix, "Mix", 0.5)
  ui.vocalTitle:setText("Vocal Input FX  •  " .. vocalLabel)

  for idx, card in ipairs(ui.layers) do
    local layer = current_state.layers and current_state.layers[idx] or {}
    local active = (current_state.activeLayer or 0) == (idx - 1)
    local stateName = tostring(layer.state or "empty")

    card.panel:setStyle({
      bg = active and 0xff10243f or 0xff0b1220,
      border = active and 0xff38bdf8 or 0xff1f2937,
      borderWidth = active and 2 or 1,
    })

    local effectId = selections.layers[idx] or "bypass"
    local effectLabel = FX_EFFECTS[effectIndexFromId(effectId)].label
    card.scope.basePath = layerFxBasePath(idx - 1)
    ensureScopeCatalog(card.scope, effectId)
    card.preset:setSelected(effectIndexFromId(effectId))

    card.title:setText(string.format("Layer %d  •  %s  •  %s", idx - 1, stateName, effectLabel))
    card.title:setColour(active and 0xffdbeafe or 0xffcbd5e1)

    if stateName == "playing" then
      card.play:setLabel("Pause")
      card.play:setBg(0xffb45309)
      card.play._onClick = function()
        selectLayer(idx - 1)
        triggerSafe(layerPath(idx - 1, "pause"))
      end
    else
      card.play:setLabel("Play")
      card.play:setBg(0xff14532d)
      card.play._onClick = function()
        selectLayer(idx - 1)
        triggerSafe(layerPath(idx - 1, "play"))
      end
    end

    if layer.muted then
      card.mute:setLabel("Muted")
      card.mute:setBg(0xffef4444)
    else
      card.mute:setLabel("Mute")
      card.mute:setBg(0xff475569)
    end

    local peaks = nil
    if type(getLayerPeaks) == "function" then
      peaks = getLayerPeaks(idx - 1, 96)
    end

    local positionNorm = clamp(tonumber(layer.positionNorm) or 0.0, 0.0, 1.0)
    if positionNorm == 0.0 and (layer.length or 0) > 0 then
      positionNorm = clamp((tonumber(layer.position) or 0) / layer.length, 0.0, 1.0)
    end

    card.donut:setLayerData({
      length = layer.length or 0,
      positionNorm = positionNorm,
      volume = layer.volume or 1.0,
      muted = layer.muted,
      state = stateName,
    })
    card.donut:setPeaks(peaks)

    local bounceTarget = 0.0
    if peaks and #peaks > 0 then
      local playheadIdx = math.floor(positionNorm * #peaks) + 1
      if playheadIdx < 1 then playheadIdx = 1 end
      if playheadIdx > #peaks then playheadIdx = #peaks end

      local sum = 0.0
      local count = 0
      for k = -1, 1 do
        local j = playheadIdx + k
        if j >= 1 and j <= #peaks then
          sum = sum + clamp(peaks[j] or 0.0, 0.0, 1.0)
          count = count + 1
        end
      end
      local localLevel = count > 0 and (sum / count) or 0.0
      local vol = clamp(tonumber(layer.volume) or 1.0, 0.0, 1.5)
      local isActiveState = (stateName == "playing" or stateName == "recording" or stateName == "overdubbing")
      if isActiveState and not layer.muted then
        bounceTarget = localLevel * vol
      end
    end
    card.donut:setBounce(easedLayerBounce(idx - 1, bounceTarget))

    syncScopeDropdown(card.xMap, card.scope, "x")
    syncScopeDropdown(card.yMap, card.scope, "y")
    syncScopeDropdown(card.k1Map, card.scope, "k1")
    syncScopeDropdown(card.k2Map, card.scope, "k2")
    syncScopeDropdown(card.mixMap, card.scope, "mix")
    syncMappedXY(card.xy, card.scope.mappings.x, card.scope.mappings.y, 0.5, 0.5)
    syncMappedKnob(card.k1, card.scope.mappings.k1, "K1", 0.5)
    syncMappedKnob(card.k2, card.scope.mappings.k2, "K2", 0.5)
    syncMappedKnob(card.mix, card.scope.mappings.mix, "Mix", 0.5)

    if not card.vol._dragging then
      card.vol:setValue(layer.volume or 1.0)
    end
  end
end

function ui_cleanup()
  -- Do not poke widget canvases here.
  -- The whole UI tree is about to be destroyed by the engine, and trying to
  -- close overlays / resize canvases during teardown can explode on switch.
  for i = 1, #(ui.layers or {}) do
    local card = ui.layers[i]
    if card and card.scope then
      card.scope.catalog = nil
      card.scope.labels = nil
      card.scope.mappings = nil
      card.scope.effectId = nil
    end
  end

  if ui.vocalScope then
    ui.vocalScope.catalog = nil
    ui.vocalScope.labels = nil
    ui.vocalScope.mappings = nil
    ui.vocalScope.effectId = nil
  end

  loadedSelectionKey = nil

  if type(setDspSlotPersistOnUiSwitch) == "function" then
    pcall(setDspSlotPersistOnUiSwitch, DSP_SLOT, false)
  end
end
