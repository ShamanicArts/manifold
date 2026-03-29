local MidiDevices = require("ui.midi_devices")

local M = {}

local SEMANTIC_SOURCES = {
  {
    id = "midi.note",
    direction = "source",
    scope = "voice",
    signalKind = "scalar",
    domain = "midi_note",
    provider = "midi-performance",
    owner = "keyboard",
    displayName = "MIDI Note",
    available = true,
    min = 0,
    max = 127,
    default = 60,
  },
  {
    id = "midi.gate",
    direction = "source",
    scope = "voice",
    signalKind = "gate",
    domain = "event",
    provider = "midi-performance",
    owner = "keyboard",
    displayName = "MIDI Gate",
    available = true,
    min = 0,
    max = 1,
    default = 0,
  },
  {
    id = "midi.velocity",
    direction = "source",
    scope = "voice",
    signalKind = "scalar_unipolar",
    domain = "normalized",
    provider = "midi-performance",
    owner = "keyboard",
    displayName = "MIDI Velocity",
    available = true,
    min = 0,
    max = 1,
    default = 0,
  },
  {
    id = "midi.voice",
    direction = "source",
    scope = "voice",
    signalKind = "voice_bundle",
    domain = "voice",
    provider = "midi-performance",
    owner = "keyboard",
    displayName = "MIDI Voice",
    available = true,
    min = 0,
    max = 1,
    default = 0,
  },
  {
    id = "midi.pitch_bend",
    direction = "source",
    scope = "global",
    signalKind = "scalar_bipolar",
    domain = "pitch_bend",
    provider = "midi-performance",
    owner = "keyboard",
    displayName = "Pitch Bend",
    available = true,
    min = -1,
    max = 1,
    default = 0,
  },
  {
    id = "midi.channel_pressure",
    direction = "source",
    scope = "global",
    signalKind = "scalar_unipolar",
    domain = "pressure",
    provider = "midi-performance",
    owner = "keyboard",
    displayName = "Channel Pressure",
    available = true,
    min = 0,
    max = 1,
    default = 0,
  },
  {
    id = "midi.mod_wheel",
    direction = "source",
    scope = "global",
    signalKind = "scalar_unipolar",
    domain = "normalized",
    provider = "midi-performance",
    owner = "keyboard",
    displayName = "Mod Wheel",
    available = true,
    min = 0,
    max = 1,
    default = 0,
    meta = {
      cc = 1,
    },
  },
}

local function copyTable(value)
  if type(value) ~= "table" then
    return value
  end
  local out = {}
  for key, entry in pairs(value) do
    out[key] = copyTable(entry)
  end
  return out
end

local function copyArray(values)
  local out = {}
  for i = 1, #(values or {}) do
    out[i] = copyTable(values[i])
  end
  return out
end

local function rememberKnownDevice(ctx, label)
  if type(ctx) ~= "table" then
    return nil
  end
  local normalizedKey = MidiDevices.normalizeDeviceKey(label)
  if normalizedKey == nil then
    return nil
  end

  ctx._modKnownMidiDevices = ctx._modKnownMidiDevices or {}
  local existing = ctx._modKnownMidiDevices[normalizedKey] or {}
  existing.key = normalizedKey
  existing.label = tostring(label or existing.label or normalizedKey)
  ctx._modKnownMidiDevices[normalizedKey] = existing
  return existing
end

local function availableDeviceKeys(ctx)
  local keys = {}
  local devices = type(ctx) == "table" and ctx._midiDevices or nil
  if type(devices) == "table" then
    for i = 1, #devices do
      local key = MidiDevices.normalizeDeviceKey(devices[i])
      if key ~= nil then
        keys[key] = true
        rememberKnownDevice(ctx, devices[i])
      end
    end
  end

  local activeLabel = MidiDevices.getCurrentMidiInputLabel(ctx)
  if type(activeLabel) == "string" and activeLabel ~= "" then
    local activeKey = MidiDevices.normalizeDeviceKey(activeLabel)
    if activeKey ~= nil then
      keys[activeKey] = true
      rememberKnownDevice(ctx, activeLabel)
    end
  end

  return keys
end

local function sortedKnownDevices(ctx)
  local known = {}
  local source = type(ctx) == "table" and ctx._modKnownMidiDevices or nil
  if type(source) == "table" then
    for _, device in pairs(source) do
      known[#known + 1] = {
        key = device.key,
        label = device.label,
      }
    end
  end
  table.sort(known, function(a, b)
    return tostring(a.key or "") < tostring(b.key or "")
  end)
  return known
end

local function makeDeviceEndpoint(device, suffix, displayName, signalKind, domain, meta, available)
  return {
    id = string.format("midi.device.%s.%s", tostring(device.key), tostring(suffix)),
    direction = "source",
    scope = "global",
    signalKind = signalKind,
    domain = domain,
    provider = "midi-device",
    owner = tostring(device.key),
    displayName = string.format("%s — %s", tostring(device.label or device.key), tostring(displayName)),
    available = available,
    min = signalKind == "scalar_bipolar" and -1 or 0,
    max = 1,
    default = 0,
    meta = meta,
  }
end

function M.collect(ctx, options)
  local out = copyArray(SEMANTIC_SOURCES)
  local availableKeys = availableDeviceKeys(ctx)
  local knownDevices = sortedKnownDevices(ctx)

  for i = 1, #knownDevices do
    local device = knownDevices[i]
    local available = availableKeys[device.key] == true

    out[#out + 1] = makeDeviceEndpoint(device, "pitch_bend", "Pitch Bend", "scalar_bipolar", "pitch_bend", {
      deviceKey = device.key,
      deviceLabel = device.label,
      endpointKey = "pitch_bend",
    }, available)

    out[#out + 1] = makeDeviceEndpoint(device, "channel_pressure", "Channel Pressure", "scalar_unipolar", "pressure", {
      deviceKey = device.key,
      deviceLabel = device.label,
      endpointKey = "channel_pressure",
    }, available)

    for cc = 0, 127 do
      out[#out + 1] = makeDeviceEndpoint(device, string.format("cc.%d", cc), string.format("CC %d", cc), "scalar_unipolar", "midi_cc", {
        deviceKey = device.key,
        deviceLabel = device.label,
        endpointKey = string.format("cc.%d", cc),
        cc = cc,
      }, available)
    end
  end

  return out
end

return M
