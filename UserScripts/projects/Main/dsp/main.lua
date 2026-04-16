-- Main DSP - Integrated Looper + MidiSynth
-- MidiSynth output routes to both host output and all looper layer inputs for recording.

local looperBaseline = loadDspModule("./looper_baseline.lua")
local midisynthModule = loadDspModule("./midisynth_integration.lua")

function buildPlugin(ctx)
  local looper = looperBaseline.attach(ctx)

  local layerInputNodes = {}
  local layerSourceNodes = {}
  if looper.layers then
    for i = 1, #looper.layers do
      local layer = looper.layers[i]
      local parts = layer and layer["parts"] or nil

      if parts and parts["input"] then
        layerInputNodes[i] = parts["input"]["__node"]
      end

      local sourceNode = nil
      if parts and parts["gate"] then
        sourceNode = parts["gate"]["__node"]
      elseif parts and parts["playback"] then
        sourceNode = parts["playback"]["__node"]
      end
      layerSourceNodes[i] = sourceNode
    end
  end

  local synth = midisynthModule.buildSynth(ctx, {
    layerInputNodes = layerInputNodes,
    layerSourceNodes = layerSourceNodes,
  })

  return {
    description = "Main - 4-layer looper with 8-voice polysynth",
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
