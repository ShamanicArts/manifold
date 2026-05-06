local C = require("behaviors.avsd.constants")
local U = require("behaviors.avsd.util")
local ML = require("behaviors.avsd.ml")
local Mapping = require("behaviors.avsd.mapping")

local M = {}

function M.defaultMLSourceSpec(mlType)
  local params = { gain = 1.0, threshold = 0.5, feather = 0.15, background = 0.02, useSigmoid = true, invert = false }
  return { kind = "ml", mlType = mlType or "segmented", params = params }
end

function M.materializeGeneratorParams(ctx, sourceId, normalizedParams)
  local choice = nil
  for _, s in ipairs(ctx.sources or {}) do
    if s.kind == "generator" and s.id == sourceId then
      choice = s
      break
    end
  end
  if not choice then return U.cloneTable(normalizedParams or {}) end
  local out = {}
  local specParams = choice.params or {}
  local values = normalizedParams or {}
  for _, pspec in ipairs(specParams) do
    local pmin = tonumber(pspec.min) or 0
    local pmax = tonumber(pspec.max) or 1
    local norm = values[pspec.id]
    if norm == nil then
      out[pspec.id] = tonumber(pspec.default) or pmin
    else
      out[pspec.id] = pmin + U.clamp(norm, 0, 1) * (pmax - pmin)
    end
  end
  return out
end

function M.currentCol1SourceSpec(ctx)
  if ctx._col1SourceSpec and type(ctx._col1SourceSpec) == "table" then
    return ctx._col1SourceSpec
  end
  local choice = ctx.sources and ctx.sources[ctx.shader.sourceIndex]
  if choice and choice.kind == "generator" then
    local params = {}
    local specParams = choice.params or {}
    local stored = ctx.shaderSourceParams or {}
    for _, pspec in ipairs(specParams) do
      local norm = stored[pspec.id]
      if norm == nil then
        local pmin = tonumber(pspec.min) or 0
        local pmax = tonumber(pspec.max) or 1
        norm = ((tonumber(pspec.default) or pmin) - pmin) / math.max(0.001, pmax - pmin)
      end
      params[pspec.id] = U.clamp(norm, 0, 1)
    end
    ctx._col1SourceSpec = { kind = "generator", sourceIndex = ctx.shader.sourceIndex, sourceId = choice.id, params = params }
  else
    ctx._col1SourceSpec = { kind = "webcam", sourceIndex = 1 }
  end
  return ctx._col1SourceSpec
end

function M.sourceSpecForColumn(ctx, col)
  if tonumber(col) == 1 then return M.currentCol1SourceSpec(ctx) end
  local cd = ctx._colData and ctx._colData[col]
  return cd and cd.source or nil
end

function M.setSourceSpecForColumn(ctx, col, spec, deps)
  col = tonumber(col) or 1
  ctx.sourceSelectionCol = col
  if col == 1 then
    ctx._col1SourceSpec = U.cloneTable(spec)
    if spec.kind == "generator" then
      local idx = 1
      for i, s in ipairs(ctx.sources or {}) do
        if s.kind == "generator" and s.id == spec.sourceId then idx = i break end
      end
      ctx.shader.sourceIndex = idx
      deps.writeParam(C.NS .. "/shader/source", idx)
      ctx.shaderSourceParams = U.cloneTable(spec.params or {})
    else
      ctx.shader.sourceIndex = 1
      if spec.kind == "webcam" then
        deps.writeParam(C.NS .. "/shader/source", 1)
      end
    end
    deps.setSelectedSilently(ctx.widgets.sourceSelect, math.max(1, ctx.shader.sourceIndex or 1))
    deps.syncShaderSourceParams(ctx)
    deps.updateOutputAspect(ctx)
    deps.updateShader(ctx)
    return
  end
  ctx._colData = ctx._colData or {}
  ctx._colData[col] = ctx._colData[col] or deps.colInit(col)
  ctx._colData[col].source = U.cloneTable(spec)
  deps.syncShaderSourceParams(ctx)
  deps.updateGridThumbnails(ctx)
end

function M.ensureAuxSourceNode(ctx, key, nodeId, deps)
  ctx._auxSourceNodes = ctx._auxSourceNodes or {}
  local existing = ctx._auxSourceNodes[key]
  local cw, ch = deps.canonicalAspectSize(ctx)
  if existing and existing.node then
    if existing.node.setBounds then existing.node:setBounds(0, 0, cw, ch) end
    return existing
  end
  local rootNode = ctx.root and ctx.root.node
  if not (rootNode and rootNode.createChild) then return nil end
  local node = rootNode:createChild(nodeId)
  if not node then return nil end
  local entry = { id = nodeId, node = node }
  node:setNodeId(nodeId)
  node:setBounds(0, 0, cw, ch)
  node:setVisible(false)
  ctx._auxSourceNodes[key] = entry
  return entry
end

function M.buildPoseSourcePayload(ctx, baseSourceId, spec)
  ctx._poseSourceFragment = ctx._poseSourceFragment or (function()
    local lines = {}
    lines[#lines + 1] = "#version 150"
    lines[#lines + 1] = "in vec2 vUv;"
    lines[#lines + 1] = "out vec4 fragColor;"
    lines[#lines + 1] = "uniform sampler2D uInputTex;"
    lines[#lines + 1] = "uniform float uPoseConf;"
    for i = 0, 16 do lines[#lines + 1] = string.format("uniform vec3 uKp%d;", i) end
    lines[#lines + 1] = [[
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
  return length(pa - ba * h);
}
float lineMask(vec2 p, vec2 a, vec2 b, float r) {
  float d = segDist(p, a, b);
  return 1.0 - smoothstep(r, r * 1.8, d);
}
float pointMask(vec2 p, vec2 a, float r) {
  float d = length(p - a);
  return 1.0 - smoothstep(r, r * 1.8, d);
}
void addLine(inout vec3 rgb, vec3 a, vec3 b, vec3 col) {
  if (a.z < uPoseConf || b.z < uPoseConf) return;
  vec2 pa = vec2(a.x, 1.0 - a.y);
  vec2 pb = vec2(b.x, 1.0 - b.y);
  float m = lineMask(vUv, pa, pb, 0.008);
  rgb = mix(rgb, col, m);
}
void addPoint(inout vec3 rgb, vec3 k, vec3 col) {
  if (k.z < uPoseConf) return;
  vec2 p = vec2(k.x, 1.0 - k.y);
  float m = pointMask(vUv, p, 0.015);
  rgb = mix(rgb, col, m);
}
void main() {
  vec4 base = texture(uInputTex, vUv);
  vec3 rgb = base.rgb;
]]
    for _, pair in ipairs(ML.SKELETON) do
      lines[#lines + 1] = string.format("  addLine(rgb, uKp%d, uKp%d, vec3(0.0, 1.0, 1.0));", pair[1] - 1, pair[2] - 1)
    end
    for i = 0, 16 do
      local col = (i == 9 or i == 10) and "vec3(1.0, 0.36, 0.54)" or "vec3(0.13, 0.78, 0.37)"
      lines[#lines + 1] = string.format("  addPoint(rgb, uKp%d, %s);", i, col)
    end
    lines[#lines + 1] = "  fragColor = vec4(rgb, 1.0);"
    lines[#lines + 1] = "}"
    return table.concat(lines, "\n")
  end)()

  local uniforms = { uPoseConf = ctx.poseConf or 0.3 }
  local byName = ctx.pose and ctx.pose.byName or {}
  for i, name in ipairs(C.KEYPOINTS) do
    local kp = byName[name] or { x = 0.0, y = 0.0, conf = 0.0 }
    uniforms["uKp" .. tostring(i - 1)] = { kp.x or 0.0, kp.y or 0.0, kp.conf or 0.0 }
  end

  return {
    version = 1,
    kind = "shaderQuad",
    shaderLanguage = "glsl",
    sourceType = "node_surface",
    sourceId = baseSourceId,
    fitMode = "contain",
    passes = {
      {
        vertexShader = [[#version 150
in vec2 aPos;
in vec2 aUv;
out vec2 vUv;
void main(){ vUv = aUv; gl_Position = vec4(aPos, 0.0, 1.0); }
]],
        fragmentShader = ctx._poseSourceFragment,
        inputTextureUniform = "uInputTex",
        uniforms = uniforms,
      }
    }
  }
end

function M.applySourceSpecToHiddenNode(ctx, spec, key, deps)
  local kind = spec and spec.kind or "webcam"
  if kind == "webcam" then
    local entry = M.ensureAuxSourceNode(ctx, key .. "_webcam", "__" .. key .. "_webcam", deps)
    if entry and entry.node then
      entry.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "live" })
      return { type = "node", sourceId = entry.id }, nil
    end
    return { type = "webcam" }, nil
  end
  if kind == "generator" then
    local entry = M.ensureAuxSourceNode(ctx, key .. "_gen", "__" .. key .. "_gen", deps)
    if entry and entry.node and shaders then
      local params = M.materializeGeneratorParams(ctx, spec.sourceId, spec.params or {})
      local ok, payload = pcall(shaders.buildPipeline, {}, "contain", { type = "generator", sourceId = spec.sourceId, params = params })
      if ok and payload then
        entry.node:setCustomSurface("gpu_shader", payload)
        return { type = "node", sourceId = entry.id }, nil
      end
    end
    return { type = "webcam" }, nil
  end
  if kind == "ml" then
    local opaque = M.ensureAuxSourceNode(ctx, key .. "_ml_base", "__" .. key .. "_ml_base", deps)
    if opaque and opaque.node then
      local mlp = {
        version = 1,
        fitMode = "contain",
        modelPath = ctx._segModelPath or "",
        gain = tonumber((spec.params or {}).gain) or 1.0,
        useSigmoid = ((spec.params or {}).useSigmoid ~= false),
        threshold = tonumber((spec.params or {}).threshold) or 0.5,
        feather = tonumber((spec.params or {}).feather) or 0.15,
        invert = ((spec.params or {}).invert == true),
        background = math.max(0.001, tonumber((spec.params or {}).background) or 0.02),
      }
      opaque.node:setCustomSurface("ml_composite", mlp)
      if spec.mlType == "pose" then
        local overlay = M.ensureAuxSourceNode(ctx, key .. "_ml_pose", "__" .. key .. "_ml_pose", deps)
        if overlay and overlay.node then
          overlay.node:setCustomSurface("gpu_shader", M.buildPoseSourcePayload(ctx, opaque.id, spec))
          return { type = "node", sourceId = overlay.id }, nil
        end
      end
      return { type = "node", sourceId = opaque.id }, nil
    end
    return { type = "webcam" }, nil
  end
  if kind == "columntap" then
    local sourceId = deps.stackNodeIdForTap(spec.sourceCol or 1, spec.tapIndex)
    return { type = "node", sourceId = sourceId }, nil
  end
  return { type = "webcam" }, nil
end

function M.ensureShaderSourceNode(ctx, deps)
  local cw, ch = deps.canonicalAspectSize(ctx)
  if ctx._shaderSourceNode and ctx._shaderSourceNode.node then
    if ctx._shaderSourceNode.node.setBounds then ctx._shaderSourceNode.node:setBounds(0, 0, cw, ch) end
    return ctx._shaderSourceNode
  end
  local rootNode = ctx.root and ctx.root.node
  if not (rootNode and rootNode.createChild) then return nil end
  local node = rootNode:createChild("avsd_shader_source")
  if not node then return nil end
  local entry = { id = "__avsd_shader_source", node = node }
  if node.setNodeId then node:setNodeId(entry.id) end
  if node.setBounds then node:setBounds(0, 0, cw, ch) end
  if node.setVisible then node:setVisible(false) end
  ctx._shaderSourceNode = entry
  return entry
end

function M.buildShaderSourceDescriptor(ctx, deps)
  local spec = deps.currentCol1SourceSpec(ctx)
  local descriptor, choice = deps.applySourceSpecToHiddenNode(ctx, spec, "col1_source")
  return descriptor, choice
end

function M.refreshShaderLists(ctx)
  ctx.effects = (shaders and shaders.listEffects and shaders.listEffects()) or {}
  if #ctx.effects == 0 then ctx.effects = { { id = "none", name = "Passthrough", params = {} } } end
  ctx.sources = { { kind = "webcam", id = "webcam", name = "Webcam", params = {} } }
  local gens = (sources and sources.list and sources.list()) or {}
  for i = 1, #gens do
    local gen = gens[i]
    local genParams = gen.params or {}
    local newParams = {}
    for pi = 1, #genParams do
      local pspec = genParams[pi]
      if pspec then
        newParams[pi] = {
          id = pspec.id,
          name = pspec.name,
          unit = pspec.unit,
          min = pspec.min,
          max = pspec.max,
          default = pspec.default,
          step = pspec.step,
        }
      end
    end
    ctx.sources[#ctx.sources + 1] = { kind = "generator", id = gen.id, name = gen.name or gen.id, params = newParams }
  end
  local effectNames, sourceNames, poseNames = {}, {}, {}
  for i, source in ipairs(ML.POSE_SOURCES) do poseNames[i] = source.label end
  for i, e in ipairs(ctx.effects) do effectNames[i] = tostring(e.name or e.id or "Effect") end
  for i, s in ipairs(ctx.sources) do sourceNames[i] = tostring(s.name or s.id or "Source") end
  U.setOptions(ctx.widgets.effectSelect, effectNames)
  U.setOptions(ctx.widgets.sourceSelect, sourceNames)
  for track = 1, C.MAX_MAPPINGS do
    U.setOptions(ctx.widgets["mapping" .. track .. "Source"], poseNames)
    U.setOptions(ctx.widgets["mapping" .. track .. "Target"], Mapping.TARGET_LABELS)
  end
end

return M
