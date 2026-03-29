local Compiler = {}
Compiler.__index = Compiler

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

local function addError(errors, code, message)
  errors[#errors + 1] = {
    code = tostring(code or "error"),
    message = tostring(message or "unknown error"),
  }
end

local function normalizeRoute(route)
  route = type(route) == "table" and route or {}
  local source = tostring(route.source or "")
  local target = tostring(route.target or "")
  local id = tostring(route.id or "")

  if id == "" and source ~= "" and target ~= "" then
    id = string.format("route:%s->%s", source, target)
  elseif id == "" then
    id = "route:invalid"
  end

  local mode = route.mode ~= nil and tostring(route.mode) or nil
  local scope = route.scope ~= nil and tostring(route.scope) or nil

  return {
    id = id,
    source = source,
    target = target,
    scope = scope,
    amount = tonumber(route.amount) or 1.0,
    bias = tonumber(route.bias) or 0.0,
    mode = mode,
    enabled = route.enabled ~= false,
    meta = copyTable(route.meta or {}),
  }
end

local function endpointSummary(endpoint)
  if endpoint == nil then
    return nil
  end
  return {
    id = endpoint.id,
    direction = endpoint.direction,
    scope = endpoint.scope,
    signalKind = endpoint.signalKind,
    domain = endpoint.domain,
    provider = endpoint.provider,
    owner = endpoint.owner,
    displayName = endpoint.displayName,
    available = endpoint.available,
    min = endpoint.min,
    max = endpoint.max,
    default = endpoint.default,
    enumOptions = copyTable(endpoint.enumOptions),
    meta = copyTable(endpoint.meta),
  }
end

local function inferEvalScope(sourceEndpoint, targetEndpoint)
  local sourceScope = tostring(sourceEndpoint.scope or "global")
  local targetScope = tostring(targetEndpoint.scope or "global")

  if targetScope == "voice" then
    if sourceScope == "voice" or sourceScope == "global" then
      return "voice"
    end
    return nil, string.format("unsupported source scope '%s' for voice target", sourceScope)
  end

  if targetScope == "global" then
    if sourceScope == "global" then
      return "global"
    end
    if sourceScope == "voice" then
      return "voice_aggregate"
    end
    return nil, string.format("cannot compile %s source into global target", sourceScope)
  end

  if sourceScope == targetScope then
    return sourceScope
  end

  return nil, string.format("unsupported scope combination %s -> %s", sourceScope, targetScope)
end

local function resolveCoercion(sourceEndpoint, targetEndpoint)
  local sourceKind = tostring(sourceEndpoint.signalKind or "")
  local targetKind = tostring(targetEndpoint.signalKind or "")

  if targetKind == "voice_bundle" then
    if sourceKind == "voice_bundle" then
      return "identity_bundle"
    end
    return nil, string.format("no implicit coercion from %s to %s", sourceKind, targetKind)
  end

  if targetKind == "scalar" or targetKind == "scalar_unipolar" then
    if sourceKind == "scalar" or sourceKind == "scalar_unipolar" or sourceKind == "gate" or sourceKind == "trigger" then
      return "identity"
    end
    if sourceKind == "scalar_bipolar" then
      return "bipolar_to_unipolar"
    end
    return nil, string.format("no implicit coercion from %s to %s", sourceKind, targetKind)
  end

  if targetKind == "scalar_bipolar" then
    if sourceKind == "scalar_bipolar" then
      return "identity"
    end
    if sourceKind == "scalar" or sourceKind == "scalar_unipolar" then
      return "unipolar_to_bipolar"
    end
    return nil, string.format("no implicit coercion from %s to %s", sourceKind, targetKind)
  end

  if targetKind == "stepped" then
    if sourceKind == "scalar" or sourceKind == "scalar_unipolar" then
      return "scalar_to_stepped"
    end
    if sourceKind == "scalar_bipolar" then
      return "bipolar_to_unipolar_then_stepped"
    end
    return nil, string.format("no implicit coercion from %s to %s", sourceKind, targetKind)
  end

  if targetKind == "gate" then
    if sourceKind == "gate" then
      return "identity"
    end
    if sourceKind == "trigger" then
      return "trigger_to_gate"
    end
    if sourceKind == "scalar" or sourceKind == "scalar_unipolar" then
      return "threshold_gate"
    end
    if sourceKind == "scalar_bipolar" then
      return "bipolar_threshold_gate"
    end
    return nil, string.format("no implicit coercion from %s to %s", sourceKind, targetKind)
  end

  if targetKind == "trigger" then
    if sourceKind == "trigger" or sourceKind == "gate" then
      return "identity"
    end
    if sourceKind == "scalar" or sourceKind == "scalar_unipolar" then
      return "threshold_gate"
    end
    if sourceKind == "scalar_bipolar" then
      return "bipolar_threshold_gate"
    end
    return nil, string.format("no implicit coercion from %s to %s", sourceKind, targetKind)
  end

  return nil, string.format("unsupported target signal kind '%s'", targetKind)
end

local function resolveMapping(targetEndpoint)
  local targetKind = tostring(targetEndpoint.signalKind or "")
  local domain = tostring(targetEndpoint.domain or "normalized")

  if targetKind == "voice_bundle" then
    return "bundle_passthrough"
  end
  if targetKind == "gate" or targetKind == "trigger" then
    return "gate_threshold"
  end
  if targetKind == "stepped" then
    return "stepped_select"
  end
  if domain == "freq" then
    return "freq_exp"
  end
  if domain == "gain_db" then
    return "db_linear"
  end
  if domain == "q" then
    return "linear"
  end
  if domain == "normalized" then
    return "linear"
  end
  return "linear"
end

local function allowedApplyModes(targetEndpoint)
  local targetKind = tostring(targetEndpoint.signalKind or "")
  if targetKind == "voice_bundle" or targetKind == "stepped" or targetKind == "gate" or targetKind == "trigger" then
    return { "replace" }, "replace"
  end
  return { "add", "replace" }, "add"
end

local function modeAllowed(mode, allowedModes)
  for i = 1, #allowedModes do
    if allowedModes[i] == mode then
      return true
    end
  end
  return false
end

function Compiler.new(options)
  options = options or {}
  local self = setmetatable({}, Compiler)
  self.lastCompiled = nil
  self.lastBatch = nil
  return self
end

function Compiler:compileRoute(route, endpointRegistry)
  local canonicalRoute = normalizeRoute(route)
  local errors = {}
  local warnings = {}

  if canonicalRoute.source == "" then
    addError(errors, "missing_source", "route is missing source")
  end
  if canonicalRoute.target == "" then
    addError(errors, "missing_target", "route is missing target")
  end

  local sourceEndpoint = endpointRegistry and endpointRegistry.findById and endpointRegistry:findById(canonicalRoute.source) or nil
  local targetEndpoint = endpointRegistry and endpointRegistry.findById and endpointRegistry:findById(canonicalRoute.target) or nil

  if canonicalRoute.source ~= "" and sourceEndpoint == nil then
    addError(errors, "unknown_source", string.format("unknown source endpoint '%s'", canonicalRoute.source))
  end
  if canonicalRoute.target ~= "" and targetEndpoint == nil then
    addError(errors, "unknown_target", string.format("unknown target endpoint '%s'", canonicalRoute.target))
  end

  if sourceEndpoint ~= nil and sourceEndpoint.direction ~= "source" then
    addError(errors, "wrong_source_direction", string.format("endpoint '%s' is not a source", sourceEndpoint.id))
  end
  if targetEndpoint ~= nil and targetEndpoint.direction ~= "target" then
    addError(errors, "wrong_target_direction", string.format("endpoint '%s' is not a target", targetEndpoint.id))
  end

  if sourceEndpoint ~= nil and sourceEndpoint.available == false then
    addError(errors, "source_unavailable", string.format("source endpoint '%s' is unavailable", sourceEndpoint.id))
  end
  if targetEndpoint ~= nil and targetEndpoint.available == false then
    addError(errors, "target_unavailable", string.format("target endpoint '%s' is unavailable", targetEndpoint.id))
  end

  local evalScope = nil
  local coercionKind = nil
  local mappingKind = nil
  local applyKind = nil
  local allowedModes = {}

  if #errors == 0 then
    local scopeError = nil
    evalScope, scopeError = inferEvalScope(sourceEndpoint, targetEndpoint)
    if evalScope == nil then
      addError(errors, "scope_mismatch", scopeError)
    end
  end

  if #errors == 0 and canonicalRoute.scope ~= nil and canonicalRoute.scope ~= evalScope then
    addError(errors, "explicit_scope_mismatch", string.format("route scope '%s' does not match resolved scope '%s'", canonicalRoute.scope, evalScope))
  end

  if #errors == 0 then
    local coercionError = nil
    coercionKind, coercionError = resolveCoercion(sourceEndpoint, targetEndpoint)
    if coercionKind == nil then
      addError(errors, "unsupported_coercion", coercionError)
    else
      mappingKind = resolveMapping(targetEndpoint)
    end
  end

  if #errors == 0 then
    allowedModes, applyKind = allowedApplyModes(targetEndpoint)
    if canonicalRoute.mode ~= nil then
      if modeAllowed(canonicalRoute.mode, allowedModes) then
        applyKind = canonicalRoute.mode
      else
        addError(errors, "invalid_apply_mode", string.format("mode '%s' is not valid for target '%s'", canonicalRoute.mode, targetEndpoint.id))
      end
    end
  end

  local result = {
    ok = #errors == 0,
    route = canonicalRoute,
    source = endpointSummary(sourceEndpoint),
    target = endpointSummary(targetEndpoint),
    errors = errors,
    warnings = warnings,
    compiled = nil,
  }

  if result.ok then
    result.compiled = {
      routeId = canonicalRoute.id,
      sourceHandle = canonicalRoute.source,
      targetHandle = canonicalRoute.target,
      evalScope = evalScope,
      coercionKind = coercionKind,
      mappingKind = mappingKind,
      applyKind = applyKind,
      amount = canonicalRoute.amount,
      bias = canonicalRoute.bias,
      enabled = canonicalRoute.enabled,
      sourceKind = sourceEndpoint.signalKind,
      targetKind = targetEndpoint.signalKind,
      sourceDomain = sourceEndpoint.domain,
      targetDomain = targetEndpoint.domain,
      allowedApplyModes = copyTable(allowedModes),
    }
  end

  self.lastCompiled = copyTable(result)
  return result
end

function Compiler:compileRoutes(routes, endpointRegistry)
  local sourceRoutes = type(routes) == "table" and routes or {}
  local results = {}
  local okCount = 0
  local errorCount = 0

  for i = 1, #sourceRoutes do
    local compiled = self:compileRoute(sourceRoutes[i], endpointRegistry)
    results[#results + 1] = compiled
    if compiled.ok then
      okCount = okCount + 1
    else
      errorCount = errorCount + 1
    end
  end

  local batch = {
    totalCount = #results,
    okCount = okCount,
    errorCount = errorCount,
    routes = results,
  }
  self.lastBatch = copyTable(batch)
  return batch
end

function Compiler:debugSnapshot()
  return {
    lastCompiled = copyTable(self.lastCompiled),
    lastBatch = copyTable(self.lastBatch),
  }
end

return Compiler
