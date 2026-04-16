-- Main DSP - Integrated Looper + MidiSynth
-- Dry host input feeds all looper layers for capture while the synth routes to
-- both the host output and looper layer inputs.

local looperBaseline = loadDspModule("./looper_baseline.lua")
local midisynthModule = loadDspModule("./midisynth_integration.lua")

local function partNode(parts, key)
  local part = parts and parts[key] or nil
  return part and part["__node"] or nil
end

local function connectMixerInput(ctx, mixer, inputIndex, source)
  if not (ctx and mixer and source) then
    return false
  end
  mixer:setInputCount(inputIndex)
  mixer:setGain(inputIndex, 1.0)
  mixer:setPan(inputIndex, 0.0)
  ctx.graph.connect(source, mixer, 0, (inputIndex - 1) * 2)
  return true
end

function buildPlugin(ctx)
  local looper = looperBaseline.attach(ctx)

  local layerInputNodes = {}
  local layerSourceNodes = {}
  local layerOutputNodes = {}
  if looper.layers then
    for i = 1, #looper.layers do
      local layer = looper.layers[i]
      local parts = layer and layer["parts"] or nil

      layerInputNodes[i] = partNode(parts, "input")

      local sourceNode = partNode(parts, "gate") or partNode(parts, "playback")
      layerSourceNodes[i] = sourceNode
      layerOutputNodes[i] = partNode(parts, "gain") or sourceNode
    end
  end

  local synth = midisynthModule.buildSynth(ctx, {
    layerInputNodes = layerInputNodes,
    layerSourceNodes = layerSourceNodes,
  })

  local hostInput = ctx.primitives.PassthroughNode.new(2, 0)
  local inputTrim = ctx.primitives.GainNode.new(2)
  inputTrim:setGain(1.0)
  local inputMonitor = ctx.primitives.GainNode.new(2)
  inputMonitor:setGain(1.0)

  ctx.graph.connect(hostInput, inputTrim)
  ctx.graph.connect(inputTrim, inputMonitor)

  if ctx.graph.markInput then
    ctx.graph.markInput(hostInput)
    ctx.graph.markInput(inputTrim)
  end

  for i = 1, #layerInputNodes do
    local layerInput = layerInputNodes[i]
    if layerInput then
      ctx.graph.connect(inputTrim, layerInput)
    end
  end

  local layerMixer = ctx.primitives.MixerNode.new()
  local layerBusCount = 0
  for i = 1, #layerOutputNodes do
    local layerOutput = layerOutputNodes[i]
    if layerOutput then
      layerBusCount = layerBusCount + 1
      connectMixerInput(ctx, layerMixer, layerBusCount, layerOutput)
    end
  end

  local mainMixer = ctx.primitives.MixerNode.new()
  local mainBusCount = 0
  if synth.output then
    mainBusCount = mainBusCount + 1
    connectMixerInput(ctx, mainMixer, mainBusCount, synth.output)
  end
  if layerBusCount > 0 then
    mainBusCount = mainBusCount + 1
    connectMixerInput(ctx, mainMixer, mainBusCount, layerMixer)
  end
  mainBusCount = mainBusCount + 1
  connectMixerInput(ctx, mainMixer, mainBusCount, inputMonitor)

  local masterGain = ctx.primitives.GainNode.new(2)
  masterGain:setGain(1.0)
  ctx.graph.connect(mainMixer, masterGain)

  if ctx.graph.markMonitor then
    ctx.graph.markMonitor(masterGain)
  end
  if ctx.graph.markOutput then
    ctx.graph.markOutput(masterGain)
  end

  return {
    description = "Main - 4-layer looper with 8-voice polysynth",
    input = hostInput,
    output = masterGain,
    params = synth.params,
    onParamChange = function(path, value)
      if path:match("^/midi/synth/") then
        if synth.onParamChange then
          synth.onParamChange(path, value)
        end
        return
      end

      if looper.applyParam then
        looper.applyParam(path, value)
      end
    end,

    getSamplePeaks = function(numBuckets)
      if synth.getSamplePeaks then
        return synth.getSamplePeaks(numBuckets)
      end
      return nil
    end,

    getSampleLoopLength = function()
      if synth.getSampleLoopLength then
        return synth.getSampleLoopLength()
      end
      return 0
    end,

    getVoiceSamplePositions = function()
      if synth.getVoiceSamplePositions then
        return synth.getVoiceSamplePositions()
      end
      return {}
    end,

    getDynamicSampleSlotPeaks = function(slotIndex, numBuckets)
      if synth.getDynamicSampleSlotPeaks then
        return synth.getDynamicSampleSlotPeaks(slotIndex, numBuckets)
      end
      return {}
    end,

    getDynamicSampleSlotVoicePositions = function(slotIndex)
      if synth.getDynamicSampleSlotVoicePositions then
        return synth.getDynamicSampleSlotVoicePositions(slotIndex)
      end
      return {}
    end,

    ensureDynamicModuleSlot = function(specId, slotIndex)
      if synth.ensureDynamicModuleSlot then
        return synth.ensureDynamicModuleSlot(specId, slotIndex)
      end
      return false
    end,

    refreshSampleDerivedAdditive = function()
      if synth.refreshSampleDerivedAdditive then
        return synth.refreshSampleDerivedAdditive()
      end
      return {}
    end,

    getSampleDerivedAddDebug = function(voiceIndex)
      if synth.getSampleDerivedAddDebug then
        return synth.getSampleDerivedAddDebug(voiceIndex)
      end
      return {}
    end,

    getRackAudioRouteDebug = function()
      if synth.getRackAudioRouteDebug then
        return synth.getRackAudioRouteDebug()
      end
      return {}
    end,

    process = function(blockSize, sampleRate)
      if synth.process then
        synth.process(blockSize, sampleRate)
      end
    end,
  }
end
