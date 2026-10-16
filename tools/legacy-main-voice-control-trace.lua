-- Execute the actual old allocation and ADSR modules. Only path I/O is mocked.
local root = assert(arg[1])
package.path = root .. '/lib/?.lua;' .. root .. '/ui/behaviors/?.lua;' .. package.path
local manager = require('voice_manager')
local runtime = require('adsr_runtime')
local pushes = {}
manager.init({ setPath = function(path, value) pushes[#pushes + 1] = { path, value } end,
  ParameterBinder = {}, adsr_runtime = runtime,
  applyImplicitRackOscillatorKeyboardPitch = function(_, index, note)
    pushes[#pushes + 1] = { '/midi/synth/voice/' .. index .. '/freq', math.max(20, math.min(8000, manager.noteToFreq(note))) }
  end })
manager.attach({ _hasAnyOscillatorGateRoute = function() return true end,
  _isLegacyOscillatorGateRouteConnected = function() return true end,
  _hasCanonicalOscillatorGateRoute = function() return false end,
  _dynamicRackOscAdsrGateSlots = function() return {} end })
local voices = {}
for i = 1, 8 do voices[i] = { active=false, gate=0, envelopeStage='idle', envelopeLevel=0,
  envelopeTime=0, envelopeStartLevel=0, targetAmp=0, currentAmp=0, sentAmp=0, lastAmpPushTime=0, stamp=0 } end
local ctx = { _voices=voices, _midiVoices=voices, _adsr={attack=.05,decay=.2,sustain=.7,release=.4} }
for line in io.lines(assert(arg[2])) do
  local action, a, b = line:match('([^,]+),([^,]+),([^,]+)')
  pushes = {}
  if action == 'on' then manager.triggerVoice(ctx, tonumber(a), tonumber(b))
  elseif action == 'off' then manager.releaseVoice(ctx, tonumber(a))
  elseif action == 'tick' then manager.updateEnvelopes(ctx, tonumber(a), tonumber(b))
  elseif action == 'panic' then manager.panicVoices(ctx)
  else error('unknown action') end
  io.write('action|' .. action .. '\n')
  for _, entry in ipairs(pushes) do io.write(string.format('push|%s|%.17g\n', entry[1], entry[2])) end
  for i, voice in ipairs(voices) do
    io.write(string.format('voice|%d|%s|%d|%.17g|%.17g|%s|%.17g|%.17g\n', i,
      voice.active and 'true' or 'false', voice.note or -1, voice.gate or 0,
      voice.targetAmp or 0, voice.envelopeStage, voice.envelopeLevel or 0, voice.currentAmp or 0))
  end
end
