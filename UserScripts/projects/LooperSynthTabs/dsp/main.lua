-- LooperSynthTabs DSP - Integrated Looper + MidiSynth
-- MidiSynth output routes to both host output and looper layer 0 input for recording.

local looperBaseline = loadDspModule("./looper_baseline.lua")
local midisynthModule = loadDspModule("./midisynth_integration.lua")

function buildPlugin(ctx)
  -- Step 1: Build looper baseline (creates 4 layers with capture/playback)
  local looper = looperBaseline.attach(ctx)

  -- Step 2: Get layer 0's input node directly from the looper state.
  -- The LoopLayer bundle exposes parts.input which wraps the PassthroughNode.
  -- When we connect the synth output to it, it receives synth audio instead
  -- of host input (PassthroughNode only uses host input when unconnected).
  local layer0InputNode = nil
  if looper.layers and looper.layers[1] then
    local parts = looper.layers[1]["parts"]
    if parts and parts["input"] then
      layer0InputNode = parts["input"]["__node"]
    end
  end

  -- Step 3: Build MidiSynth with routing to looper layer 0
  local synth = midisynthModule.buildSynth(ctx, {
    targetLayerInput = layer0InputNode,
  })

  -- Step 4: Return combined plugin descriptor
  return {
    description = "LooperSynthTabs - 4-layer looper with 8-voice polysynth",
    params = synth.params,   -- looper params are registered via ctx.params.register in baseline
    onParamChange = function(path, value)
      -- Route synth params to synth
      if path:match("^/midi/synth/") then
        if synth.onParamChange then
          synth.onParamChange(path, value)
        end
        return
      end

      -- Route everything else to looper
      if looper.applyParam then
        looper.applyParam(path, value)
      end
    end,
  }
end
