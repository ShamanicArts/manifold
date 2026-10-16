-- Run in the dedicated review profile, with audiodev=0 (Dummy Audio).
-- The control file allows repeatable host operations without UI automation.
local root = '/Users/shamanic/Developer/Manifold-v2/review/'
local available, mode = reaper.GetAudioDeviceInfo('MODE')
assert(available and mode == 'Dummy Audio', 'Review requires Dummy Audio')
local routing = assert(io.open(root .. 'audio-mode.txt', 'w'))
routing:write(mode)
routing:close()
reaper.InsertTrackAtIndex(0, true)
local track = reaper.GetTrack(0, 0)
local clap = reaper.TrackFX_AddByName(track, 'CLAP: Manifold Three Tone', false, -1)
local vst = reaper.TrackFX_AddByName(track, 'VST3: Manifold Three Tone', false, -1)
local file = assert(io.open(root .. 'loaded.txt', 'w'))
file:write('CLAP=', clap, ' VST3=', vst)
file:close()
if clap >= 0 then reaper.TrackFX_Show(track, clap, 3) end
local function step()
  local control = io.open(root .. 'control.lua', 'r')
  if control then
    local code = control:read('*a')
    control:close()
    os.remove(root .. 'control.lua')
    local ok, err = pcall(function() assert(load(code))() end)
    local reply = assert(io.open(root .. 'done.txt', 'w'))
    reply:write(ok and 'ok' or tostring(err))
    reply:close()
  end
  reaper.defer(step)
end
reaper.defer(step)
