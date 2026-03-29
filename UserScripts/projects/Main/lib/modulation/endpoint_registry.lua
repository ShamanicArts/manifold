local ParameterTargets = require("modulation.providers.parameter_targets")
local RackSources = require("modulation.providers.rack_sources")
local MidiSources = require("modulation.providers.midi_sources")

local Registry = {}
Registry.__index = Registry

local DEFAULT_PROVIDERS = {
  ParameterTargets,
  RackSources,
  MidiSources,
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

local function normalizeEndpoint(source)
  if type(source) ~= "table" then
    return nil, "endpoint descriptor must be a table"
  end

  local id = tostring(source.id or "")
  if id == "" then
    return nil, "endpoint descriptor is missing id"
  end

  local direction = tostring(source.direction or "")
  if direction ~= "source" and direction ~= "target" then
    return nil, string.format("endpoint '%s' has invalid direction '%s'", id, direction)
  end

  local endpoint = {
    id = id,
    direction = direction,
    scope = tostring(source.scope or "global"),
    signalKind = tostring(source.signalKind or "scalar"),
    domain = tostring(source.domain or "normalized"),
    provider = tostring(source.provider or "unknown"),
    owner = source.owner ~= nil and tostring(source.owner) or nil,
    displayName = tostring(source.displayName or id),
    available = source.available ~= false,
    min = source.min,
    max = source.max,
    default = source.default,
    enumOptions = copyArray(source.enumOptions),
    meta = copyTable(source.meta or {}),
  }

  return endpoint
end

local function sortEndpoints(a, b)
  if a.direction ~= b.direction then
    return a.direction < b.direction
  end
  if a.id ~= b.id then
    return a.id < b.id
  end
  return tostring(a.provider or "") < tostring(b.provider or "")
end

function Registry.new(options)
  options = options or {}
  local self = setmetatable({}, Registry)
  self.providers = options.providers or DEFAULT_PROVIDERS
  self.endpoints = {}
  self.sources = {}
  self.targets = {}
  self.byId = {}
  self.providerCounts = {}
  self.scopeCounts = {}
  self.duplicateIds = {}
  self.lastReason = nil
  return self
end

function Registry:rebuild(ctx, options)
  options = options or {}

  local collected = {}
  local byId = {}
  local duplicateIds = {}
  local providerCounts = {}
  local scopeCounts = {}

  for i = 1, #self.providers do
    local provider = self.providers[i]
    local items = {}
    if type(provider) == "table" and type(provider.collect) == "function" then
      items = provider.collect(ctx, options) or {}
    end

    for itemIndex = 1, #items do
      local endpoint, err = normalizeEndpoint(items[itemIndex])
      if endpoint == nil then
        error(err)
      end

      if byId[endpoint.id] ~= nil then
        duplicateIds[#duplicateIds + 1] = endpoint.id
      else
        collected[#collected + 1] = endpoint
        byId[endpoint.id] = endpoint
        providerCounts[endpoint.provider] = (providerCounts[endpoint.provider] or 0) + 1
        scopeCounts[endpoint.scope] = (scopeCounts[endpoint.scope] or 0) + 1
      end
    end
  end

  table.sort(collected, sortEndpoints)

  local sources = {}
  local targets = {}
  for i = 1, #collected do
    local endpoint = collected[i]
    if endpoint.direction == "source" then
      sources[#sources + 1] = endpoint
    else
      targets[#targets + 1] = endpoint
    end
  end

  self.endpoints = collected
  self.sources = sources
  self.targets = targets
  self.byId = byId
  self.providerCounts = providerCounts
  self.scopeCounts = scopeCounts
  self.duplicateIds = duplicateIds
  self.lastReason = options.reason or self.lastReason

  return self:debugSnapshot()
end

function Registry:getAll()
  return copyArray(self.endpoints)
end

function Registry:getSources()
  return copyArray(self.sources)
end

function Registry:getTargets()
  return copyArray(self.targets)
end

function Registry:findById(id)
  local endpoint = self.byId[tostring(id or "")]
  if endpoint == nil then
    return nil
  end
  return copyTable(endpoint)
end

function Registry:debugSnapshot()
  return {
    totalCount = #self.endpoints,
    sourceCount = #self.sources,
    targetCount = #self.targets,
    providerCounts = copyTable(self.providerCounts),
    scopeCounts = copyTable(self.scopeCounts),
    duplicateIds = copyArray(self.duplicateIds),
    lastReason = self.lastReason,
    endpoints = copyArray(self.endpoints),
  }
end

return Registry
