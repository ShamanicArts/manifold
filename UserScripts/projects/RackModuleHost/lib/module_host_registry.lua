local ParameterBinder = require("parameter_binder")
local RackSpecs = require("behaviors.rack_midisynth_specs")

local M = {}

M.PRIMARY_SLOT_INDEX = 1
M.AUDITION_OSC_SLOT_INDEX = 2
M.VOICE_COUNT = 8
M.RACK_CELL_W = 236
M.RACK_CELL_H = 220

local MODULE_ORDER = {
  "rack_oscillator",
  "rack_sample",
  "blend_simple",
  "filter",
  "fx",
  "eq",
  "adsr",
  "arp",
  "transpose",
  "velocity_mapper",
  "scale_quantizer",
  "note_filter",
  "lfo",
  "slew",
  "sample_hold",
  "compare",
  "cv_mix",
  "attenuverter_bias",
  "range_mapper",
}

local function shallowCopyArray(values)
  local out = {}
  if type(values) ~= "table" then
    return out
  end
  for i = 1, #values do
    out[i] = values[i]
  end
  return out
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

local function toMainRelative(path)
  local text = tostring(path or "")
  if text == "" then
    return nil
  end
  if text:match("^%.%./Main/") then
    return text
  end
  return join("../Main", text)
end

function M.parseSizeKey(sizeKey)
  local rows, cols = tostring(sizeKey or "1x1"):match("^(%d+)x(%d+)$")
  rows = math.max(1, math.floor(tonumber(rows) or 1))
  cols = math.max(1, math.floor(tonumber(cols) or 1))
  return rows, cols
end

function M.sizePixels(sizeKey)
  local rows, cols = M.parseSizeKey(sizeKey)
  return {
    rows = rows,
    cols = cols,
    w = cols * M.RACK_CELL_W,
    h = rows * M.RACK_CELL_H,
  }
end

local DEFAULT_SIZE_BY_ID = {
  rack_oscillator = "1x2",
  rack_sample = "1x2",
}

local function defaultSizeForSpec(specId, spec)
  local forced = DEFAULT_SIZE_BY_ID[tostring(specId or "")]
  if type(forced) == "string" and forced ~= "" then
    return forced
  end
  local defaultSize = tostring(type(spec) == "table" and spec.defaultSize or "")
  if defaultSize == "1x2" or defaultSize == "1x1" then
    return defaultSize
  end
  return "1x1"
end

local function actualSizeModesForSpec(specId, spec)
  local id = tostring(specId or "")
  local modes = { "1x1", "1x2" }
  if id == "rack_oscillator" or id == "rack_sample" then
    return { "1x1", "1x2" }
  end
  if id == "blend_simple" then
    return { "1x1", "1x2" }
  end
  local validSizes = type(spec) == "table" and spec.validSizes or nil
  if type(validSizes) == "table" then
    local has1x2 = false
    for i = 1, #validSizes do
      local key = tostring(validSizes[i] or "")
      if key == "1x2" then
        has1x2 = true
        break
      end
    end
    if has1x2 then
      return modes
    end
  end
  return { "1x1", "1x2" }
end

local function moduleKindForSpec(specId, spec)
  local id = tostring(specId or "")
  if id == "rack_oscillator" or id == "rack_sample" then
    return "source"
  end
  local category = tostring(type(spec) == "table" and type(spec.meta) == "table" and spec.meta.category or "")
  if category == "voice" then
    return "voice"
  end
  if category == "mod" then
    return "scalar"
  end
  return "audio"
end

local function paramBaseForSpec(specId, slotIndex)
  local index = math.max(1, math.floor(tonumber(slotIndex) or 1))
  local id = tostring(specId or "")
  if id == "adsr" then return ParameterBinder.dynamicAdsrBasePath(index) end
  if id == "arp" then return ParameterBinder.dynamicArpBasePath(index) end
  if id == "transpose" then return ParameterBinder.dynamicTransposeBasePath(index) end
  if id == "velocity_mapper" then return ParameterBinder.dynamicVelocityMapperBasePath(index) end
  if id == "scale_quantizer" then return ParameterBinder.dynamicScaleQuantizerBasePath(index) end
  if id == "note_filter" then return ParameterBinder.dynamicNoteFilterBasePath(index) end
  if id == "attenuverter_bias" then return ParameterBinder.dynamicAttenuverterBiasBasePath(index) end
  if id == "range_mapper" then return ParameterBinder.dynamicRangeMapperBasePath(index) end
  if id == "lfo" then return ParameterBinder.dynamicLfoBasePath(index) end
  if id == "slew" then return ParameterBinder.dynamicSlewBasePath(index) end
  if id == "sample_hold" then return ParameterBinder.dynamicSampleHoldBasePath(index) end
  if id == "compare" then return ParameterBinder.dynamicCompareBasePath(index) end
  if id == "cv_mix" then return ParameterBinder.dynamicCvMixBasePath(index) end
  if id == "eq" then return ParameterBinder.dynamicEqBasePath(index) end
  if id == "fx" then return ParameterBinder.dynamicFxBasePath(index) end
  if id == "filter" then return ParameterBinder.dynamicFilterBasePath(index) end
  if id == "rack_oscillator" then return ParameterBinder.dynamicOscillatorBasePath(index) end
  if id == "rack_sample" then return ParameterBinder.dynamicSampleBasePath(index) end
  if id == "blend_simple" then return ParameterBinder.dynamicBlendSimpleBasePath(index) end
  return "/rack_host/unknown/" .. id .. "/" .. tostring(index)
end

local function chooseAuditionOutputPort(spec)
  local outputs = type(spec) == "table" and type(spec.ports) == "table" and spec.ports.outputs or nil
  if type(outputs) ~= "table" then
    return nil
  end
  local preferred = {
    voice = true,
    out = true,
    env = true,
    uni = true,
    gate = true,
    inv = true,
    eoc = true,
  }
  for i = 1, #outputs do
    local id = tostring(type(outputs[i]) == "table" and outputs[i].id or "")
    if preferred[id] then
      return id
    end
  end
  return tostring(type(outputs[1]) == "table" and outputs[1].id or "")
end

local function uniqueShellIds(moduleId, componentId)
  local prefix = tostring(moduleId or "module")
  return {
    displayId = prefix .. "Display",
    shellId = prefix .. "Shell",
    deleteButtonId = prefix .. "DeleteButton",
    resizeButtonId = prefix .. "ResizeButton",
    accentId = prefix .. "Accent",
    sizeBadgeId = prefix .. "SizeBadge",
    nodeNameLabelId = prefix .. "NodeNameLabel",
    patchbayPanelId = prefix .. "PatchbayPanel",
    componentId = prefix .. "_" .. tostring(componentId or "content"),
  }
end

function M.modules()
  local specById = RackSpecs.rackModuleSpecById()
  local out = {}
  for i = 1, #MODULE_ORDER do
    local specId = MODULE_ORDER[i]
    local spec = specById[specId]
    if type(spec) == "table" then
      local meta = type(spec.meta) == "table" and spec.meta or {}
      local palette = type(meta.palette) == "table" and meta.palette or {}
      local sizeKey = defaultSizeForSpec(specId, spec)
      local ids = uniqueShellIds(specId .. "_host", tostring(meta.componentId or "contentComponent"))
      out[#out + 1] = {
        id = tostring(spec.id or specId),
        label = tostring(palette.displayName or spec.name or specId),
        description = tostring(palette.description or meta.description or ""),
        portSummary = tostring(palette.portSummary or ""),
        category = tostring(meta.category or "utility"),
        kind = moduleKindForSpec(specId, spec),
        accentColor = spec.accentColor or 0xff64748b,
        validSizes = actualSizeModesForSpec(specId, spec),
        defaultSize = sizeKey,
        paramBase = paramBaseForSpec(specId, M.PRIMARY_SLOT_INDEX),
        auditionOutputPort = chooseAuditionOutputPort(spec),
        behaviorPath = toMainRelative(meta.behavior),
        componentPath = toMainRelative(meta.componentRef),
        componentId = ids.componentId,
        instanceNodeId = tostring(specId) .. "_host",
        displayId = ids.displayId,
        shellId = ids.shellId,
        deleteButtonId = ids.deleteButtonId,
        resizeButtonId = ids.resizeButtonId,
        accentId = ids.accentId,
        sizeBadgeId = ids.sizeBadgeId,
        nodeNameLabelId = ids.nodeNameLabelId,
        patchbayPanelId = ids.patchbayPanelId,
        spec = spec,
      }
    end
  end
  return out
end

function M.moduleIndexById()
  local out = {}
  local modules = M.modules()
  for i = 1, #modules do
    out[modules[i].id] = i
  end
  return out
end

function M.moduleById(id)
  local modules = M.modules()
  local target = tostring(id or "")
  for i = 1, #modules do
    if modules[i].id == target then
      return modules[i], i
    end
  end
  return nil, nil
end

function M.moduleInfoMap()
  local info = {}
  local modules = M.modules()
  for i = 1, #modules do
    local module = modules[i]
    info[module.instanceNodeId] = {
      moduleId = module.instanceNodeId,
      specId = module.id,
      slotIndex = M.PRIMARY_SLOT_INDEX,
      paramBase = module.paramBase,
      category = module.category,
      kind = module.kind,
      label = module.label,
    }
  end
  return info
end

function M.auditionOscParamBase()
  return ParameterBinder.dynamicOscillatorBasePath(M.AUDITION_OSC_SLOT_INDEX)
end

return M
