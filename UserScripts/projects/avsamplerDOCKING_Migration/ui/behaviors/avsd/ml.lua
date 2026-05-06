local C = require("behaviors.avsd.constants")
local U = require("behaviors.avsd.util")
local P = require("behaviors.avsd.profiler")

local M = {}

local function buildPoseSources()
  local out = {}
  for _, name in ipairs(C.KEYPOINTS) do
    out[#out + 1] = { label = name .. ".x", keypoint = name, property = "x" }
    out[#out + 1] = { label = name .. ".y", keypoint = name, property = "y" }
    out[#out + 1] = { label = name .. ".confidence", keypoint = name, property = "confidence" }
  end
  out[#out + 1] = { label = "both_hands.spread", derived = "both_hands_spread" }
  out[#out + 1] = { label = "left_arm.reach", derived = "left_arm_reach" }
  out[#out + 1] = { label = "right_arm.reach", derived = "right_arm_reach" }
  return out
end

M.POSE_SOURCES = buildPoseSources()
M.SKELETON = { {1,2},{1,3},{2,4},{3,5},{6,8},{8,10},{7,9},{9,11},{6,7},{6,12},{7,13},{12,13},{12,14},{14,16},{13,15},{15,17} }
local SKELETON = M.SKELETON

function M.segPayload(ctx)
  return {
    version = 1,
    fitMode = "contain",
    modelPath = ctx._segModelPath or "",
    gain = ctx.seg.gain,
    useSigmoid = ctx.seg.useSigmoid,
    threshold = ctx.seg.threshold,
    feather = ctx.seg.feather,
    invert = ctx.seg.invert,
    background = 0.0,
  }
end

function M.bindInputSurfaces(ctx)
  P.start(ctx, "bindInputSurfaces")
  if ctx.widgets.liveViewport and ctx.widgets.liveViewport.node then
    ctx.widgets.liveViewport.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "live" })
  end

  local hasModel = ctx._segModelPath ~= nil

  local function ensureMLSourceNode(nodeId)
    if ctx["_mlSrcNode_" .. nodeId] then return ctx["_mlSrcNode_" .. nodeId] end
    local parent = ctx.widgets and ctx.widgets.inputsEmbed and ctx.widgets.inputsEmbed.node
    if not (parent and parent.createChild) then return nil end
    local node = parent:createChild(nodeId .. "_src")
    if node then
      node:setNodeId(nodeId)
      node:setBounds(0, 0, 4, 4)
      node:setVisible(true)
      node:setInterceptsMouse(false, false)
      ctx["_mlSrcNode_" .. nodeId] = node
    end
    return node
  end

  local segNode = ensureMLSourceNode("avsd_ml_seg")
  local poseNode = ensureMLSourceNode("avsd_ml_pose")

  if segNode and hasModel then
    segNode:setCustomSurface("ml_composite", M.segPayload(ctx))
  end
  if poseNode and hasModel then
    poseNode:setCustomSurface("ml_composite", M.segPayload(ctx))
  end

  if ctx.widgets.segViewport and ctx.widgets.segViewport.node and hasModel then
    ctx.widgets.segViewport.node:setCustomSurface("ml_composite", M.segPayload(ctx))
  end
  if ctx.widgets.poseViewport and ctx.widgets.poseViewport.node and hasModel then
    ctx.widgets.poseViewport.node:setCustomSurface("ml_composite", M.segPayload(ctx))
  end
  P.finish(ctx, "bindInputSurfaces")
end

function M.tryLoad(paths)
  if not (ml and ml.load) then return nil, nil end
  for _, p in ipairs(paths) do
    local ok, pipe = pcall(ml.load, p)
    if ok and pipe then return pipe, p end
  end
  return nil, nil
end

function M.loadModels(ctx)
  local projectDir = U.projectRootDir()
  local scriptsProjects = U.parentDir(projectDir)
  ctx._segPipeline, ctx._segModelPath = M.tryLoad({
    U.join(projectDir, "selfie_segmentation.onnx"),
    U.join(scriptsProjects, "AVSampler/selfie_segmentation.onnx"),
    U.join(scriptsProjects, "AVSamplerLab/selfie_segmentation.onnx"),
    U.join(scriptsProjects, "MLLab/selfie_segmentation.onnx"),
    U.join(scriptsProjects, "WebcamViewer/selfie_segmentation.onnx"),
  })
  ctx._posePipeline, ctx._poseModelPath = M.tryLoad({
    U.join(projectDir, "movenet_singlepose_lightning.onnx"),
    U.join(scriptsProjects, "AVSampler/movenet_singlepose_lightning.onnx"),
    U.join(scriptsProjects, "AVSamplerLab/movenet_singlepose_lightning.onnx"),
    U.join(scriptsProjects, "MLLab/movenet_singlepose_lightning.onnx"),
  })
  if ctx._posePipeline and ctx._posePipeline.setNormalization then ctx._posePipeline:setNormalization(1.0, 0.0) end
  M.bindInputSurfaces(ctx)
  U.setText(ctx.widgets.poseStatus, string.format("Models: seg=%s pose=%s", ctx._segModelPath and "OK" or "missing", ctx._poseModelPath and "OK" or "missing"))
end

function M.buildPoseDisplay(kps, conf, show, w, h, vidW, vidH)
  local d = {}
  if not kps then return d end
  local ox, oy, dw, dh = U.letterbox(w, h, vidW or 640, vidH or 480)
  local function mx(x) return math.floor(ox + U.clamp(x, 0, 1) * dw) end
  local function my(y) return math.floor(oy + U.clamp(y, 0, 1) * dh) end
  if show then
    for _, c in ipairs(SKELETON) do
      local a, b = kps[c[1]], kps[c[2]]
      if a and b and a.conf > conf and b.conf > conf then
        d[#d + 1] = { cmd = "drawLine", x1 = mx(a.x), y1 = my(a.y), x2 = mx(b.x), y2 = my(b.y), thickness = 2, color = 0xff00ffff }
      end
    end
  end
  for i, k in ipairs(kps) do
    if k.conf > conf then
      local x, y = mx(k.x), my(k.y)
      d[#d + 1] = { cmd = "fillRoundedRect", x = x - 3, y = y - 3, w = 6, h = 6, radius = 3, color = (i == 10 or i == 11) and 0xffff5c8a or 0xff22c55e }
    end
  end
  return d
end

function M.ensurePoseOverlay(ctx)
  local vp = ctx.widgets.poseViewport
  if not (vp and vp.node) then return end
  if not ctx._poseOverlay and vp.node.addChild then
    local o = vp.node:addChild("avSamplerPoseOverlay")
    if o then
      o:setInterceptsMouse(false, false)
      o:setDisplayList({})
      ctx._poseOverlay = o
    end
  end
  if ctx._poseOverlay then
    local pw = ctx._poseVpW or math.max(1, math.floor(vp.node:getWidth() or 1))
    local ph = ctx._poseVpH or math.max(1, math.floor(vp.node:getHeight() or 1))
    ctx._poseOverlay:setBounds(0, 0, pw, ph)
  end
end

function M.runPose(ctx, frameInfo)
  P.start(ctx, "runPose")
  local seams = ctx._testSeams or nil
  local usingSeam = type(seams) == "table" and type(seams.poseKeypoints) == "table"
  if not usingSeam and not (ctx._posePipeline and capture and capture.isOpen and capture.isOpen()) then P.finish(ctx, "runPose"); return false end
  if not U.shouldRunInterval(ctx, "pose", C.POSE_INTERVAL) then P.finish(ctx, "runPose"); return false end
  local seq = tonumber((usingSeam and (seams.poseSequence or (frameInfo and frameInfo.sequence))) or (frameInfo and frameInfo.sequence))
  if seq ~= nil and ctx._lastPoseFrameSeq == seq then P.finish(ctx, "runPose"); return false end
  local kps = {}
  if usingSeam then
    for i = 1, 17 do
      local src = seams.poseKeypoints[i] or {}
      kps[i] = { x = U.clamp(src.x or 0, 0, 1), y = U.clamp(src.y or 0, 0, 1), conf = tonumber(src.conf or 0) or 0 }
    end
  else
    local ok, result = pcall(ml.infer, ctx._posePipeline)
    if not ok or not result or type(result.data) ~= "table" or #result.data < 51 then P.finish(ctx, "runPose"); return false end
    local inputW, inputH = ctx._posePipeline:inputWidth(), ctx._posePipeline:inputHeight()
    for i = 0, 16 do
      local y, x, c = tonumber(result.data[i * 3 + 1]) or 0, tonumber(result.data[i * 3 + 2]) or 0, tonumber(result.data[i * 3 + 3]) or 0
      if x > 1.5 then x = x / inputW end
      if y > 1.5 then y = y / inputH end
      kps[i + 1] = { x = U.clamp(x, 0, 1), y = U.clamp(y, 0, 1), conf = c }
    end
  end
  if seq ~= nil then ctx._lastPoseFrameSeq = seq end

  ctx.pose = { keypoints = kps, byName = {} }
  for i, name in ipairs(C.KEYPOINTS) do ctx.pose.byName[name] = kps[i] end
  local lw, rw, nose = ctx.pose.byName.left_wrist, ctx.pose.byName.right_wrist, ctx.pose.byName.nose
  local ls, rs = ctx.pose.byName.left_shoulder, ctx.pose.byName.right_shoulder
  local spread = (lw and rw) and math.sqrt((lw.x - rw.x)^2 + (lw.y - rw.y)^2) or 0
  local leftReach = (lw and ls) and math.sqrt((lw.x - ls.x)^2 + (lw.y - ls.y)^2) or 0
  local rightReach = (rw and rs) and math.sqrt((rw.x - rs.x)^2 + (rw.y - rs.y)^2) or 0
  ctx.pose.values = {}
  for _, name in ipairs(C.KEYPOINTS) do
    local kp = ctx.pose.byName[name]
    ctx.pose.values[C.NS .. "/pose/" .. name .. "/x"] = kp and kp.x or 0
    ctx.pose.values[C.NS .. "/pose/" .. name .. "/y"] = kp and kp.y or 0
    ctx.pose.values[C.NS .. "/pose/" .. name .. "/confidence"] = kp and kp.conf or 0
  end
  ctx.pose.values[C.NS .. "/pose/both_hands/spread"] = U.clamp(spread, 0, 1)
  ctx.pose.values[C.NS .. "/pose/left_arm/reach"] = U.clamp(leftReach, 0, 1)
  ctx.pose.values[C.NS .. "/pose/right_arm/reach"] = U.clamp(rightReach, 0, 1)

  if ctx._poseOverlay then
    M.ensurePoseOverlay(ctx)
    local frame = frameInfo or ((capture and capture.getFrameInfo and capture.getFrameInfo()) or {})
    ctx._poseOverlay:setDisplayList(M.buildPoseDisplay(kps, ctx.poseConf, ctx.showSkeleton, ctx._poseOverlay:getWidth(), ctx._poseOverlay:getHeight(), frame.width or 640, frame.height or 480))
  end
  local visible = 0
  for _, kp in ipairs(kps) do if kp.conf > ctx.poseConf then visible = visible + 1 end end
  U.setText(ctx.widgets.poseStatus, string.format("Pose: %d/17 visible | nose %.2f %.2f | wrists spread %.2f", visible, nose and nose.x or 0, nose and nose.y or 0, spread))
  P.finish(ctx, "runPose")
  return true
end

function M.poseSourceValue(ctx, track)
  local mapping = ctx.mappings[track]
  local idx = math.max(1, math.min(#M.POSE_SOURCES, U.round(mapping.source or 1)))
  local source = M.POSE_SOURCES[idx]
  local pose = ctx.pose and ctx.pose.byName or {}
  if source and source.keypoint then
    local kp = pose[source.keypoint]
    if not kp then return 0 end
    if source.property == "x" then return kp.x or 0 end
    if source.property == "y" then return kp.y or 0 end
    return kp.conf or 0
  end
  local values = ctx.pose and ctx.pose.values or {}
  if source and source.derived == "both_hands_spread" then return values[C.NS .. "/pose/both_hands/spread"] or 0 end
  if source and source.derived == "left_arm_reach" then return values[C.NS .. "/pose/left_arm/reach"] or 0 end
  if source and source.derived == "right_arm_reach" then return values[C.NS .. "/pose/right_arm/reach"] or 0 end
  return 0
end

return M
