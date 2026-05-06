local C = require("behaviors.avsd.constants")
local U = require("behaviors.avsd.util")

local M = {}

function M.currentMidiLabel()
  if Midi and Midi.currentInputDeviceName then
    local n = Midi.currentInputDeviceName()
    if type(n) == "string" and n ~= "" then return n end
  end
  return nil
end

function M.refresh(ctx)
  local devices = (Midi and Midi.inputDevices and Midi.inputDevices()) or {}
  ctx._midiDevices = devices
  local opts = { "None (Disabled)" }
  for i = 1, #devices do opts[#opts + 1] = tostring(devices[i]) end
  U.setOptions(ctx.widgets.midiInput, opts)
  local active = M.currentMidiLabel()
  local selected = 1
  if active then
    for i = 1, #opts do
      if opts[i] == active then selected = i end
    end
  end
  U.setSelectedSilently(ctx.widgets.midiInput, selected)
  U.setText(ctx.widgets.midiStatus, string.format("MIDI: %s (%s)", active or "none", (Midi and Midi.isInputOpen and Midi.isInputOpen()) and "open" or "closed"))
end

function M.openPreferred(ctx)
  if not (Midi and Midi.openInput) then return end
  for i = 1, #(ctx._midiDevices or {}) do
    if not tostring(ctx._midiDevices[i]):lower():find("through", 1, true) then
      Midi.openInput(i - 1)
      M.refresh(ctx)
      return
    end
  end
end

local function encodedMidi(ctx, note, velocity)
  ctx._midiCounter = ((ctx._midiCounter or 0) + 1) % 512
  return ctx._midiCounter * 16384 + U.round(U.clamp(note, 0, 127)) * 128 + U.round(U.clamp(velocity, 0, 127))
end

function M.noteToSlice(note, root)
  for i = 1, #C.MAJOR_OFFSETS do
    if U.round(note) == U.round(root) + C.MAJOR_OFFSETS[i] then return i end
  end
  return nil
end

function M.triggerNote(ctx, note, velocity)
  U.writeParam(C.NS .. "/midi_note", note)
  U.writeParam(C.NS .. "/midi_velocity", velocity)
  U.writeParam(C.NS .. "/midi_note_on_trigger", encodedMidi(ctx, note, velocity))
  ctx._lastMidi = string.format("NOTE ON %d vel %d", note, velocity)
end

function M.releaseNote(ctx, note)
  U.writeParam(C.NS .. "/midi_note", note)
  U.writeParam(C.NS .. "/midi_note_off_trigger", encodedMidi(ctx, note, 0))
  ctx._lastMidi = string.format("NOTE OFF %d", note)
end

function M.poll(ctx, hooks)
  local profileStart = hooks and hooks.profileStart or nil
  local profileEnd = hooks and hooks.profileEnd or nil
  if profileStart then profileStart(ctx, "pollMidi") end
  local consumed = 0
  local queue = ctx._testSeams and ctx._testSeams.midiQueue or nil
  while type(queue) == "table" and #queue > 0 and consumed < 64 do
    local e = table.remove(queue, 1)
    consumed = consumed + 1
    local kind = tostring(e.kind or "")
    local d1 = tonumber(e.data1 or 0) or 0
    local d2 = tonumber(e.data2 or 0) or 0
    if kind == "note_on" then
      M.triggerNote(ctx, d1, d2)
    elseif kind == "note_off" then
      M.releaseNote(ctx, d1)
    elseif kind == "cc_all_notes_off" then
      U.bump(C.NS .. "/stop_trigger")
      ctx._lastMidi = "CC 123"
    end
  end
  if not (Midi and Midi.pollInputEvent) then
    if profileEnd then profileEnd(ctx, "pollMidi") end
    return
  end
  while consumed < 64 do
    local e = Midi.pollInputEvent()
    if not e then break end
    consumed = consumed + 1
    local t = tonumber(e.type or 0) or 0
    local d1 = tonumber(e.data1 or 0) or 0
    local d2 = tonumber(e.data2 or 0) or 0
    if Midi.NOTE_ON and t == Midi.NOTE_ON and d2 > 0 then
      M.triggerNote(ctx, d1, d2)
    elseif (Midi.NOTE_OFF and t == Midi.NOTE_OFF) or (Midi.NOTE_ON and t == Midi.NOTE_ON and d2 <= 0) then
      M.releaseNote(ctx, d1)
    elseif Midi.CONTROL_CHANGE and t == Midi.CONTROL_CHANGE and d1 == 123 then
      U.bump(C.NS .. "/stop_trigger")
    end
  end
  if profileEnd then profileEnd(ctx, "pollMidi") end
end

return M
