local ParameterBinder = require("parameter_binder")
local RackSpecs = require("behaviors.rack_midisynth_specs")

local M = {}

local function cloneArray(values)
  local out = {}
  for i = 1, #(values or {}) do
    out[i] = values[i]
  end
  return out
end

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

local function isIntegerLike(value)
  local n = tonumber(value)
  return n ~= nil and math.abs(n - math.floor(n + 0.5)) <= 0.0001
end

local function inferSignalKind(param)
  local format = tostring(param and param.format or "")
  local minValue = tonumber(param and param.min)
  local maxValue = tonumber(param and param.max)
  local step = tonumber(param and param.step)
  local hasOptions = type(param and param.options) == "table" and #(param.options or {}) > 0

  if hasOptions or format == "enum" then
    return "stepped", "enum_index"
  end

  if format == "freq" then
    return "scalar", "freq"
  end
  if format == "db" then
    return "scalar", "gain_db"
  end

  if format == "int"
    or ((step ~= nil and step >= 1.0)
      and isIntegerLike(minValue)
      and isIntegerLike(maxValue)) then
    if minValue ~= nil and maxValue ~= nil and minValue < 0 then
      return "scalar_bipolar", "normalized"
    end
    return "stepped", "enum_index"
  end

  if minValue ~= nil and maxValue ~= nil and minValue < 0 then
    return "scalar_bipolar", "normalized"
  end
  return "scalar", "normalized"
end

local function collectRackTargets()
  local specs = RackSpecs.rackModuleSpecById and RackSpecs.rackModuleSpecById() or {}
  local out = {}
  local seen = {}

  for moduleId, spec in pairs(specs) do
    local params = type(spec and spec.ports and spec.ports.params) == "table" and spec.ports.params or {}
    for i = 1, #params do
      local param = params[i]
      local path = tostring(param and param.path or "")
      if path ~= "" and param.input == true and seen[path] ~= true then
        local signalKind, domain = inferSignalKind(param)
        out[#out + 1] = {
          id = path,
          direction = "target",
          scope = "global",
          signalKind = signalKind,
          domain = domain,
          provider = "rack-module-specs",
          owner = tostring(moduleId or ""),
          displayName = string.format("%s %s", tostring(spec and spec.name or moduleId), tostring(param.label or param.id or path)),
          available = true,
          min = tonumber(param.min),
          max = tonumber(param.max),
          default = tonumber(param.default),
          enumOptions = cloneArray(param.options),
          meta = {
            moduleId = tostring(moduleId or ""),
            portId = tostring(param.id or ""),
            format = tostring(param.format or ""),
            step = tonumber(param.step),
            sourcePath = path,
            spec = copyTable(param),
          },
        }
        seen[path] = true
      end
    end
  end

  table.sort(out, function(a, b)
    return tostring(a.id or "") < tostring(b.id or "")
  end)

  return out, seen
end

function M.collect(ctx, options)
  local rackTargets, seen = collectRackTargets()
  local fallback = ParameterBinder.buildModulationTargetDescriptors(options) or {}

  for i = 1, #fallback do
    local entry = fallback[i]
    local id = tostring(entry and entry.id or "")
    if id ~= "" and seen[id] ~= true then
      rackTargets[#rackTargets + 1] = entry
      seen[id] = true
    end
  end

  return rackTargets
end

return M
