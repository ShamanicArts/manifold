-- FX Definitions Module
-- Shared effect definitions for MidiSynth and future modules

local Utils = require("utils")

local M = {}

-- Effect names array (21 effects)
-- Index 0-based in DSP, 1-based in Lua table access
M.FX_OPTIONS = {
  "Chorus",
  "Phaser",
  "WaveShaper",
  "Compressor",
  "StereoWidener",
  "Filter",
  "SVF Filter",
  "Reverb",
  "Stereo Delay",
  "Multitap",
  "Pitch Shift",
  "Granulator",
  "Ring Mod",
  "Formant",
  "EQ",
  "Limiter",
  "Transient",
  "Bitcrusher",
  "Shimmer",
  "Reverse Delay",
  "Stutter",
}

-- Effect definitions factory
-- @param primitives - ctx.primitives from DSP context
-- @param graph - ctx.graph from DSP context (needed for Limiter)
-- @return Array of 17 effect definition tables
function M.buildFxDefs(primitives, graph)
  local P = primitives
  return {
    { -- 0: Chorus
      label = "Chorus",
      wetGain = 1.4,
      create = function()
        local node = P.ChorusNode.new()
        node:setRate(0.35); node:setDepth(0.3); node:setVoices(3)
        node:setSpread(0.6); node:setFeedback(0.08); node:setWaveform(0); node:setMix(1.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setRate(Utils.lerp(0.08, 2.4, v)) end, default = 0.5 },
        { setter = function(n, v) n:setDepth(Utils.lerp(0.05, 1.0, v)) end, default = 0.5 },
        { setter = function(n, v) n:setFeedback(Utils.lerp(0.0, 0.35, v)) end, default = 0.2 },
        { setter = function(n, v) n:setSpread(Utils.lerp(0.0, 1.0, v)) end, default = 0.6 },
        { setter = function(n, v) n:setVoices(math.floor(Utils.lerp(1, 6, v) + 0.5)) end, default = 0.4 },
      },
    },
    { -- 1: Phaser
      label = "Phaser",
      create = function()
        local node = P.PhaserNode.new()
        node:setRate(0.3); node:setDepth(0.45); node:setStages(6)
        node:setFeedback(0.35); node:setSpread(0.4)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setRate(Utils.lerp(0.05, 2.8, v)) end, default = 0.5 },
        { setter = function(n, v) n:setDepth(Utils.lerp(0.05, 1.0, v)) end, default = 0.5 },
        { setter = function(n, v) n:setFeedback(Utils.lerp(0.0, 0.8, v)) end, default = 0.4 },
        { setter = function(n, v) n:setSpread(Utils.lerp(0.0, 1.0, v)) end, default = 0.5 },
        { setter = function(n, v) n:setStages(math.floor(Utils.lerp(2, 12, v) + 0.5)) end, default = 0.4 },
      },
    },
    { -- 2: WaveShaper
      label = "WaveShaper",
      create = function()
        local node = P.WaveShaperNode.new()
        node:setCurve(0); node:setDrive(2.5); node:setOutput(0.8)
        node:setPreFilter(0.0); node:setPostFilter(0.0); node:setBias(0.0)
        node:setMix(1.0); node:setOversample(2)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setDrive(Utils.lerp(0.75, 18.0, v)) end, default = 0.3 },
        { setter = function(n, v) n:setCurve(math.floor(Utils.lerp(0, 6, v) + 0.5)) end, default = 0.0 },
        { setter = function(n, v) n:setOutput(Utils.lerp(0.25, 1.0, v)) end, default = 0.7 },
        { setter = function(n, v) n:setBias(Utils.lerp(-0.5, 0.5, v)) end, default = 0.5 },
      },
    },
    { -- 3: Compressor
      label = "Compressor",
      create = function()
        local node = P.CompressorNode.new()
        node:setThreshold(-18.0); node:setRatio(4.0); node:setAttack(5.0)
        node:setRelease(100.0); node:setKnee(6.0); node:setMakeup(0.0)
        node:setAutoMakeup(true); node:setMode(0); node:setDetectorMode(0)
        node:setSidechainHPF(100.0); node:setMix(1.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setThreshold(Utils.lerp(-40, -2, v)) end, default = 0.4 },
        { setter = function(n, v) n:setRatio(Utils.lerp(1.5, 20, v)) end, default = 0.3 },
        { setter = function(n, v) n:setAttack(Utils.lerp(1, 40, v)) end, default = 0.1 },
        { setter = function(n, v) n:setRelease(Utils.lerp(20, 250, v)) end, default = 0.3 },
        { setter = function(n, v) n:setKnee(Utils.lerp(0, 12, v)) end, default = 0.5 },
      },
    },
    { -- 4: StereoWidener
      label = "StereoWidener",
      wetGain = 1.1,
      create = function()
        local node = P.StereoWidenerNode.new()
        node:setWidth(1.25); node:setMonoLowFreq(140.0); node:setMonoLowEnable(true)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setWidth(Utils.lerp(0, 2, v)) end, default = 0.6 },
        { setter = function(n, v) n:setMonoLowFreq(Utils.lerp(40, 320, v)) end, default = 0.4 },
      },
    },
    { -- 5: Filter
      label = "Filter",
      create = function()
        local node = P.FilterNode.new()
        node:setCutoff(1000.0); node:setResonance(0.2); node:setMix(1.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setCutoff(Utils.expLerp(80, 12000, v)) end, default = 0.5 },
        { setter = function(n, v) n:setResonance(Utils.lerp(0, 1, v)) end, default = 0.2 },
      },
    },
    { -- 6: SVF Filter
      label = "SVF Filter",
      create = function()
        local node = P.SVFNode.new()
        node:setCutoff(1200); node:setResonance(0.35); node:setMode(0)
        node:setDrive(0.5); node:setMix(1.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setCutoff(Utils.expLerp(60, 10000, v)) end, default = 0.5 },
        { setter = function(n, v) n:setResonance(Utils.lerp(0.08, 1, v)) end, default = 0.4 },
        { setter = function(n, v) n:setDrive(Utils.lerp(0, 6, v)) end, default = 0.1 },
      },
    },
    { -- 7: Reverb
      label = "Reverb",
      create = function()
        local node = P.ReverbNode.new()
        node:setRoomSize(0.55); node:setDamping(0.4)
        node:setWetLevel(1.0); node:setDryLevel(0.0); node:setWidth(1.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setRoomSize(Utils.lerp(0.15, 0.95, v)) end, default = 0.5 },
        { setter = function(n, v) n:setDamping(Utils.lerp(0, 1, v)) end, default = 0.4 },
      },
    },
    { -- 8: Stereo Delay
      label = "Stereo Delay",
      wetGain = 1.1,
      create = function()
        local node = P.StereoDelayNode.new()
        node:setTempo(120); node:setTimeMode(0); node:setTimeL(250); node:setTimeR(375)
        node:setFeedback(0.3); node:setFeedbackCrossfeed(0.12); node:setFilterEnabled(false)
        node:setFilterCutoff(4200); node:setFilterResonance(0.5); node:setMix(1.0)
        node:setPingPong(true); node:setWidth(1.0); node:setFreeze(false); node:setDucking(0.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) local t = Utils.lerp(40, 780, v); n:setTimeL(t); n:setTimeR(t * 1.5) end, default = 0.3 },
        { setter = function(n, v) n:setFeedback(Utils.lerp(0, 0.92, v)) end, default = 0.3 },
      },
    },
    { -- 9: Multitap
      label = "Multitap",
      wetGain = 1.4,
      create = function()
        local node = P.MultitapDelayNode.new()
        node:setTapCount(4)
        node:setTapTime(1, 180); node:setTapTime(2, 320); node:setTapTime(3, 470); node:setTapTime(4, 620)
        node:setTapGain(1, 0.5); node:setTapGain(2, 0.35); node:setTapGain(3, 0.28); node:setTapGain(4, 0.2)
        node:setTapPan(1, -0.8); node:setTapPan(2, -0.25); node:setTapPan(3, 0.25); node:setTapPan(4, 0.8)
        node:setFeedback(0.3); node:setMix(1.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setTapCount(math.floor(Utils.lerp(2, 8, v) + 0.5)) end, default = 0.3 },
        { setter = function(n, v) n:setFeedback(Utils.lerp(0, 0.95, v)) end, default = 0.3 },
      },
    },
    { -- 10: Pitch Shift
      label = "Pitch Shift",
      create = function()
        local node = P.PitchShifterNode.new()
        node:setPitch(7.0); node:setWindow(80.0); node:setFeedback(0.15); node:setMix(1.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setPitch(Utils.lerp(-12, 12, v)) end, default = 0.5 },
        { setter = function(n, v) n:setWindow(Utils.lerp(30, 180, v)) end, default = 0.5 },
        { setter = function(n, v) n:setFeedback(Utils.lerp(0, 0.75, v)) end, default = 0.2 },
      },
    },
    { -- 11: Granulator
      label = "Granulator",
      create = function()
        local node = P.GranulatorNode.new()
        node:setGrainSize(90); node:setDensity(24); node:setPosition(0.6)
        node:setPitch(0.0); node:setSpray(0.25); node:setFreeze(false)
        node:setEnvelope(0); node:setMix(1.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setGrainSize(Utils.lerp(12, 280, v)) end, default = 0.3 },
        { setter = function(n, v) n:setDensity(Utils.lerp(2, 64, v)) end, default = 0.4 },
        { setter = function(n, v) n:setPosition(v) end, default = 0.6 },
        { setter = function(n, v) n:setSpray(v) end, default = 0.25 },
      },
    },
    { -- 12: Ring Mod
      label = "Ring Mod",
      create = function()
        local node = P.RingModulatorNode.new()
        node:setFrequency(120); node:setDepth(1.0); node:setMix(1.0); node:setSpread(30.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setFrequency(Utils.expLerp(20, 2000, v)) end, default = 0.3 },
        { setter = function(n, v) n:setDepth(v) end, default = 1.0 },
        { setter = function(n, v) n:setSpread(Utils.lerp(0, 180, v)) end, default = 0.2 },
      },
    },
    { -- 13: Formant
      label = "Formant",
      wetGain = 1.5,
      create = function()
        local node = P.FormantFilterNode.new()
        node:setVowel(0.0); node:setShift(0.0); node:setResonance(7.0)
        node:setDrive(1.4); node:setMix(1.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setVowel(Utils.lerp(0, 4, v)) end, default = 0.0 },
        { setter = function(n, v) n:setShift(Utils.lerp(-12, 12, v)) end, default = 0.5 },
        { setter = function(n, v) n:setResonance(Utils.lerp(2, 16, v)) end, default = 0.4 },
        { setter = function(n, v) n:setDrive(Utils.lerp(0.8, 4, v)) end, default = 0.3 },
      },
    },
    { -- 14: EQ
      label = "EQ",
      create = function()
        local node = P.EQNode.new()
        node:setLowGain(0.0); node:setLowFreq(120.0); node:setMidGain(0.0)
        node:setMidFreq(900.0); node:setMidQ(0.8); node:setHighGain(0.0)
        node:setHighFreq(8000.0); node:setOutput(0.0); node:setMix(1.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setLowGain(Utils.lerp(-12, 12, v)) end, default = 0.5 },
        { setter = function(n, v) n:setHighGain(Utils.lerp(-12, 12, v)) end, default = 0.5 },
        { setter = function(n, v) n:setMidGain(Utils.lerp(-6, 6, v)) end, default = 0.5 },
      },
    },
    { -- 15: Limiter
      label = "Limiter",
      create = function()
        local pre = P.GainNode.new(2)
        local node = P.LimiterNode.new()
        pre:setGain(1.0); node:setThreshold(-6.0); node:setRelease(80.0)
        node:setMakeup(0.0); node:setSoftClip(0.4); node:setMix(1.0)
        graph.connect(pre, node)
        return { input = pre, output = node, node = node, pre = pre }
      end,
      params = {
        { setter = function(n, v) n:setThreshold(Utils.lerp(-20, -1, v)) end, default = 0.5 },
        { setter = function(n, v, e) if e.pre then e.pre:setGain(Utils.lerp(0.6, 2, v)) end end, default = 0.3 },
        { setter = function(n, v) n:setRelease(Utils.lerp(10, 200, v)) end, default = 0.4 },
        { setter = function(n, v) n:setSoftClip(v) end, default = 0.4 },
      },
    },
    { -- 16: Transient
      label = "Transient",
      create = function()
        local node = P.TransientShaperNode.new()
        node:setAttack(0.6); node:setSustain(-0.3); node:setSensitivity(1.2); node:setMix(1.0)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setAttack(Utils.lerp(-1, 1, v)) end, default = 0.5 },
        { setter = function(n, v) n:setSustain(Utils.lerp(-1, 1, v)) end, default = 0.5 },
        { setter = function(n, v) n:setSensitivity(Utils.lerp(0.2, 4, v)) end, default = 0.5 },
      },
    },
    { -- 17: Bitcrusher
      label = "Bitcrusher",
      create = function()
        local node = P.BitCrusherNode.new()
        node:setBits(6)
        node:setRateReduction(8)
        node:setMix(1.0)
        node:setOutput(0.8)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setBits(math.floor(Utils.lerp(2, 16, v) + 0.5)) end, default = 0.3 },
        { setter = function(n, v) n:setRateReduction(math.floor(Utils.lerp(1, 64, v) + 0.5)) end, default = 0.12 },
        { setter = function(n, v) n:setOutput(Utils.lerp(0.25, 2, v)) end, default = 0.55 },
      },
    },
    { -- 18: Shimmer
      label = "Shimmer",
      wetGain = 1.4,
      create = function()
        local node = P.ShimmerNode.new()
        node:setSize(0.65)
        node:setPitch(12)
        node:setFeedback(0.7)
        node:setMix(0.5)
        node:setModulation(0.25)
        node:setFilter(5500)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setSize(Utils.lerp(0.1, 1.0, v)) end, default = 0.6 },
        { setter = function(n, v) n:setPitch(Utils.lerp(-12, 12, v)) end, default = 0.75 },
        { setter = function(n, v) n:setFeedback(Utils.lerp(0, 0.99, v)) end, default = 0.7 },
        { setter = function(n, v) n:setFilter(Utils.expLerp(100, 12000, v)) end, default = 0.5 },
      },
    },
    { -- 19: Reverse Delay
      label = "Reverse Delay",
      wetGain = 1.2,
      create = function()
        local node = P.ReverseDelayNode.new()
        node:setTime(420)
        node:setWindow(120)
        node:setFeedback(0.45)
        node:setMix(0.65)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setTime(Utils.lerp(50, 2000, v)) end, default = 0.2 },
        { setter = function(n, v) n:setWindow(Utils.lerp(20, 400, v)) end, default = 0.25 },
        { setter = function(n, v) n:setFeedback(Utils.lerp(0, 0.95, v)) end, default = 0.47 },
      },
    },
    { -- 20: Stutter
      label = "Stutter",
      create = function()
        local node = P.StutterNode.new()
        node:setLength(0.5)
        node:setGate(0.8)
        node:setProbability(0.8)
        node:setFilterDecay(0.25)
        return { input = node, output = node, node = node }
      end,
      params = {
        { setter = function(n, v) n:setLength(Utils.lerp(0.125, 8.0, v)) end, default = 0.05 },
        { setter = function(n, v) n:setGate(v) end, default = 0.8 },
        { setter = function(n, v) n:setProbability(v) end, default = 0.8 },
        { setter = function(n, v) n:setFilterDecay(v) end, default = 0.25 },
      },
    },
  }
end

return M
