local M = {}

local PARAM_SPECS = {
  { id = "gain", label = "Mask Gain", min = 0.25, max = 4.0, step = 0.05, default = 1.0, unit = "x" },
  { id = "threshold", label = "Threshold", min = 0.0, max = 1.0, step = 0.01, default = 0.50, unit = "" },
  { id = "feather", label = "Feather", min = 0.0, max = 1.0, step = 0.01, default = 0.15, unit = "" },
  { id = "background", label = "Background", min = 0.0, max = 1.0, step = 0.01, default = 0.10, unit = "" },
}

local POSE_PARAM_SPECS = {
  { id = "poseConf", label = "Pose Conf", min = 0.0, max = 1.0, step = 0.01, default = 0.30, unit = "" },
}

local POSE_TOGGLE_SPECS = {
  { id = "showSkeleton", label = "Skeleton", onLabel = "Skel On", offLabel = "Skel Off", default = true },
  { id = "showInspector", label = "Inspector", onLabel = "Inspect On", offLabel = "Inspect Off", default = false },
}

local TOGGLE_SPECS = {
  { id = "useSigmoid", label = "Sigmoid", onLabel = "Sigmoid On", offLabel = "Sigmoid Off", default = true },
  { id = "invert", label = "Invert", onLabel = "Invert On", offLabel = "Invert Off", default = false },
}

-- Pose tracking constants
local POSE_KEYPOINTS = {
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle"
}

local POSE_SKELETON = {
  -- face
  {1,2}, {1,3}, {2,4}, {3,5},
  -- arms
  {6,8}, {8,10}, {7,9}, {9,11},
  -- torso
  {6,7}, {6,12}, {7,13}, {12,13},
  -- legs
  {12,14}, {14,16}, {13,15}, {15,17}
}

local POSE_COLORS = {
  left = 0xff00ff00,   -- green
  right = 0xffff0000,  -- red
  center = 0xff00ffff, -- cyan
}

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function setText(widget, text)
  if widget and widget.setText then widget:setText(tostring(text or "")) end
end

local function setOptions(widget, options)
  if widget and widget.setOptions then widget:setOptions(options or {}) end
end

local function setSelected(widget, index)
  if widget and widget.setSelected then widget:setSelected(index or 1) end
end

local function clearSurface(widget)
  if widget and widget.node and widget.node.clearCustomRenderPayload then
    widget.node:clearCustomRenderPayload()
  end
end

local function projectRoot()
  local fp = (type(getCurrentScriptPath) == "function") and getCurrentScriptPath() or ""
  local dir = fp:match("^(.*)/[^/]+$")
  if dir then return dir .. "/" end
  return nil
end

local function buildSurfacePayload(ctx)
  return {
    version = 1,
    fitMode = "contain",
    modelPath = ctx._modelPath,
    gain = ctx._params.gain,
    useSigmoid = ctx._params.useSigmoid,
    threshold = ctx._params.threshold,
    feather = ctx._params.feather,
    invert = ctx._params.invert,
    background = ctx._params.background,
  }
end

local function clearMlSurfaces(ctx)
  clearSurface(ctx.widgets and ctx.widgets.maskViewport)
  clearSurface(ctx.widgets and ctx.widgets.compositeViewport)
end

local function refreshMlSurfaces(ctx)
  if not ctx._modelPath then
    clearMlSurfaces(ctx)
    return
  end
  if not (capture and capture.isOpen and capture.isOpen()) then
    clearMlSurfaces(ctx)
    return
  end

  local payload = buildSurfacePayload(ctx)

  local maskVp = ctx.widgets and ctx.widgets.maskViewport
  if maskVp and maskVp.node and maskVp.node.setCustomSurface then
    maskVp.node:setCustomSurface("ml_mask", payload)
  end

  local compositeVp = ctx.widgets and ctx.widgets.compositeViewport
  if compositeVp and compositeVp.node and compositeVp.node.setCustomSurface then
    compositeVp.node:setCustomSurface("ml_composite", payload)
  end
end

local function updateParamSummary(ctx)
  local status = string.format(
    "Seg: gain %.2fx  thr %.2f  fea %.2f  bg %.2f  sig %s  inv %s  |  Pose: conf %.2f  skel %s",
    ctx._params.gain,
    ctx._params.threshold,
    ctx._params.feather,
    ctx._params.background,
    tostring(ctx._params.useSigmoid),
    tostring(ctx._params.invert),
    ctx._params.poseConf,
    tostring(ctx._params.showSkeleton)
  )
  setText(ctx.widgets and ctx.widgets.paramStatus, status)
end

local function syncParamControls(ctx)
  ctx._syncingParamControls = true

  for i, spec in ipairs(PARAM_SPECS) do
    local slider = ctx.widgets and ctx.widgets["param" .. tostring(i)]
    if slider then
      slider._min = spec.min
      slider._max = spec.max
      slider._step = spec.step
      slider._defaultValue = spec.default
      if slider.setLabel then slider:setLabel(spec.label) end
      if slider.setValueFormatter then
        slider:setValueFormatter(function(value)
          local num = tonumber(value) or 0
          if spec.id == "gain" then
            return string.format("%.2fx", num)
          end
          return string.format("%.2f%s", num, spec.unit or "")
        end)
      end
      if slider.setValue then slider:setValue(ctx._params[spec.id]) end
    end
  end

  for i, spec in ipairs(POSE_PARAM_SPECS) do
    local slider = ctx.widgets and ctx.widgets["poseParam" .. tostring(i)]
    if slider then
      slider._min = spec.min
      slider._max = spec.max
      slider._step = spec.step
      slider._defaultValue = spec.default
      if slider.setLabel then slider:setLabel(spec.label) end
      if slider.setValue then slider:setValue(ctx._params[spec.id]) end
    end
  end

  for i, spec in ipairs(TOGGLE_SPECS) do
    local toggle = ctx.widgets and ctx.widgets["toggle" .. tostring(i)]
    if toggle and toggle.setValue then
      if toggle.setOnLabel then toggle:setOnLabel(spec.onLabel) end
      if toggle.setOffLabel then toggle:setOffLabel(spec.offLabel) end
      toggle:setValue(ctx._params[spec.id])
    end
  end

  for i, spec in ipairs(POSE_TOGGLE_SPECS) do
    local toggle = ctx.widgets and ctx.widgets["poseToggle" .. tostring(i)]
    if toggle and toggle.setValue then
      if toggle.setOnLabel then toggle:setOnLabel(spec.onLabel) end
      if toggle.setOffLabel then toggle:setOffLabel(spec.offLabel) end
      toggle:setValue(ctx._params[spec.id])
    end
  end

  ctx._syncingParamControls = false
  updateParamSummary(ctx)
end

local function bindParamControls(ctx)
  for i, spec in ipairs(PARAM_SPECS) do
    local slider = ctx.widgets and ctx.widgets["param" .. tostring(i)]
    if slider then
      slider._onChange = function(value)
        if ctx._syncingParamControls then return end
        ctx._params[spec.id] = clamp(value, spec.min, spec.max)
        updateParamSummary(ctx)
        refreshMlSurfaces(ctx)
      end
    end
  end

  for i, spec in ipairs(POSE_PARAM_SPECS) do
    local slider = ctx.widgets and ctx.widgets["poseParam" .. tostring(i)]
    if slider then
      slider._onChange = function(value)
        if ctx._syncingParamControls then return end
        ctx._params[spec.id] = clamp(value, spec.min, spec.max)
        ctx._poseConfThreshold = ctx._params.poseConf
        updateParamSummary(ctx)
      end
    end
  end

  for i, spec in ipairs(TOGGLE_SPECS) do
    local toggle = ctx.widgets and ctx.widgets["toggle" .. tostring(i)]
    if toggle then
      toggle._onChange = function(value)
        if ctx._syncingParamControls then return end
        ctx._params[spec.id] = value == true
        updateParamSummary(ctx)
        refreshMlSurfaces(ctx)
      end
    end
  end

  for i, spec in ipairs(POSE_TOGGLE_SPECS) do
    local toggle = ctx.widgets and ctx.widgets["poseToggle" .. tostring(i)]
    if toggle then
      toggle._onChange = function(value)
        if ctx._syncingParamControls then return end
        ctx._params[spec.id] = value == true
        updateParamSummary(ctx)
      end
    end
  end
end

-- ============================================================================
-- Pose overlay: retained display list
-- ============================================================================

local function getVideoLetterbox(vpW, vpH, vidW, vidH)
  if vidW <= 0 or vidH <= 0 then return 0, 0, vpW, vpH end
  local vidAspect = vidW / vidH
  local vpAspect = vpW / vpH
  local drawW, drawH, offX, offY
  if vidAspect > vpAspect then
    drawW = vpW
    drawH = vpW / vidAspect
    offX = 0
    offY = (vpH - drawH) / 2
  else
    drawH = vpH
    drawW = vpH * vidAspect
    offX = (vpW - drawW) / 2
    offY = 0
  end
  return math.floor(offX), math.floor(offY), math.floor(drawW), math.floor(drawH)
end

local function buildPoseDisplayList(keypoints, confThreshold, showSkeleton, vpW, vpH, vidW, vidH)
  local display = {}
  if not keypoints then return display end

  local offX, offY, drawW, drawH = getVideoLetterbox(vpW, vpH, vidW, vidH)

  local function mapX(kx) return math.floor(offX + kx * drawW) end
  local function mapY(ky) return math.floor(offY + ky * drawH) end

  if showSkeleton then
    for _, conn in ipairs(POSE_SKELETON) do
      local a = keypoints[conn[1]]
      local b = keypoints[conn[2]]
      if a and b and a.conf > confThreshold and b.conf > confThreshold then
        display[#display + 1] = {
          cmd = "drawLine", x1 = mapX(a.x), y1 = mapY(a.y),
          x2 = mapX(b.x), y2 = mapY(b.y),
          thickness = 2, color = POSE_COLORS.center,
        }
      end
    end
  end

  for i, kp in ipairs(keypoints) do
    if kp.conf > confThreshold then
      local x = mapX(kp.x)
      local y = mapY(kp.y)
      local color = POSE_COLORS.center
      if i == 5 or i == 7 or i == 9 or i == 11 or i == 13 or i == 15 then
        color = POSE_COLORS.left
      elseif i == 6 or i == 8 or i == 10 or i == 12 or i == 14 or i == 16 then
        color = POSE_COLORS.right
      end
      display[#display + 1] = {
        cmd = "fillRoundedRect", x = x - 3, y = y - 3, w = 6, h = 6,
        radius = 3, color = color,
      }
      display[#display + 1] = {
        cmd = "drawRoundedRect", x = x - 3, y = y - 3, w = 6, h = 6,
        radius = 3, thickness = 1, color = 0xffffffff,
      }
    end
  end

  return display
end

local function createPoseOverlay(ctx)
  local vp = ctx.widgets and ctx.widgets.compositeViewport
  if not vp or not vp.node then return end
  if ctx._poseOverlay then return end

  local overlay = vp.node:addChild("poseOverlay")
  if not overlay then return end

  overlay:setInterceptsMouse(false, false)
  overlay:setBounds(0, 0, vp.node:getWidth(), vp.node:getHeight())
  overlay:setDisplayList({})

  ctx._poseOverlay = overlay
end

local function updatePoseOverlayBounds(ctx)
  if not ctx._poseOverlay then return end
  local vp = ctx.widgets and ctx.widgets.compositeViewport
  if not vp or not vp.node then return end
  ctx._poseOverlay:setBounds(0, 0, vp.node:getWidth(), vp.node:getHeight())
end

local function formatKeypointInspector(keypoints, confThreshold)
  if not keypoints then return "No keypoints" end
  local lines = {}
  lines[1] = "IDX  NAME                X      Y      CONF   VIS"
  lines[2] = "---  ------------------  -----  -----  -----  ---"
  for i, kp in ipairs(keypoints) do
    local name = POSE_KEYPOINTS[i]
    local vis = kp.conf > confThreshold and "YES" or "no"
    lines[i + 2] = string.format("%-3d  %-18s  %5.2f  %5.2f  %5.2f  %s", i, name, kp.x, kp.y, kp.conf, vis)
  end
  return table.concat(lines, "\n")
end

local function runPoseInference(ctx)
  local pipe = ctx._posePipeline
  if not pipe then return end
  if not (capture and capture.isOpen and capture.isOpen()) then return end

  local ok, result = pcall(ml.infer, pipe)
  if not ok or not result then
    if not ok then
      setText(ctx.widgets and ctx.widgets.outputText, "Pose infer error: " .. tostring(result))
    end
    return
  end

  ctx._lastPoseResult = result
  local data = result.data
  if type(data) ~= "table" then
    setText(ctx.widgets and ctx.widgets.outputText, "Pose: data is not a table")
    return
  end
  if #data < 51 then
    setText(ctx.widgets and ctx.widgets.outputText,
      "Pose: expected 51 elements, got " .. tostring(#data))
    return
  end

  local inputW = pipe:inputWidth()
  local inputH = pipe:inputHeight()
  local keypoints = {}

  for i = 0, 16 do
    local y = tonumber(data[i * 3 + 1]) or 0
    local x = tonumber(data[i * 3 + 2]) or 0
    local conf = tonumber(data[i * 3 + 3]) or 0
    if x > 1.5 then x = x / inputW end
    if y > 1.5 then y = y / inputH end
    keypoints[i + 1] = { x = math.max(0, math.min(1, x)), y = math.max(0, math.min(1, y)), conf = conf }
  end

  ctx._lastPoseKeypoints = keypoints

  if ctx._poseOverlay then
    local w = ctx._poseOverlay:getWidth()
    local h = ctx._poseOverlay:getHeight()
    local frameInfo = (capture and capture.getFrameInfo and capture.getFrameInfo()) or { width = 640, height = 480 }
    ctx._poseOverlay:setDisplayList(buildPoseDisplayList(keypoints, ctx._poseConfThreshold, ctx._params.showSkeleton, w, h, frameInfo.width or 640, frameInfo.height or 480))
  end

  local visibleKps = 0
  for _, kp in ipairs(keypoints) do
    if kp.conf > ctx._poseConfThreshold then visibleKps = visibleKps + 1 end
  end

  if ctx._params.showInspector then
    setText(ctx.widgets and ctx.widgets.outputText, formatKeypointInspector(keypoints, ctx._poseConfThreshold))
  else
    local debugTxt = string.format("Pose OK: %d floats, %d/%d keypoints visible (conf>%.2f)", #data, visibleKps, #keypoints, ctx._poseConfThreshold)
    for i = 1, math.min(3, #keypoints) do
      local kp = keypoints[i]
      debugTxt = debugTxt .. string.format(" | %s(%.2f,%.2f,c=%.2f)", POSE_KEYPOINTS[i], kp.x, kp.y, kp.conf)
    end
    setText(ctx.widgets and ctx.widgets.outputText, debugTxt)
  end
end

-- ============================================================================
-- Model loading
-- ============================================================================

local function doLoadModel(ctx, path, isPose)
  if type(ml) ~= "table" or type(ml.load) ~= "function" then
    setText(ctx.widgets and ctx.widgets.modelPathLabel, "ML bindings not available (ML disabled)")
    return false
  end

  local ok, pipe = pcall(ml.load, path)
  if not ok or pipe == nil then
    if isPose then
      ctx._posePipeline = nil
      ctx._poseModelPath = nil
    else
      ctx._pipeline = nil
      ctx._modelPath = nil
      clearMlSurfaces(ctx)
    end
    setText(ctx.widgets and ctx.widgets.modelPathLabel, "Failed to load model: " .. tostring(path))
    return false
  end

  if isPose then
    pipe:setNormalization(1.0, 0.0)
    ctx._posePipeline = pipe
    ctx._poseModelPath = path
    setText(ctx.widgets and ctx.widgets.modelPathLabel, "Pose model loaded: " .. tostring(path))
    setText(ctx.widgets and ctx.widgets.modelInfo,
      string.format("Pose: %dx%dx%d  Output: %d elements  17 keypoints",
        pipe:inputWidth(), pipe:inputHeight(), pipe:inputChannels(), pipe:outputElements()))
    createPoseOverlay(ctx)
  else
    ctx._pipeline = pipe
    ctx._modelPath = path
    setText(ctx.widgets and ctx.widgets.modelPathLabel, "Seg model loaded: " .. tostring(path))
    setText(ctx.widgets and ctx.widgets.modelInfo,
      string.format("Seg: %dx%dx%d  Output: %d elements  Live: mask + composite",
        pipe:inputWidth(), pipe:inputHeight(), pipe:inputChannels(), pipe:outputElements()))
    refreshMlSurfaces(ctx)
  end
  return true
end

local function refreshDevices(ctx)
  local devices = {}
  if capture and capture.listDevices then
    local ok, result = pcall(capture.listDevices)
    if ok and type(result) == "table" then devices = result end
  end
  ctx._devices = devices
  local labels = {}
  for i = 1, #devices do
    labels[i] = tostring(devices[i].label or devices[i].name or ("Device " .. tostring(i - 1)))
  end
  if #labels == 0 then labels[1] = "No devices" end
  setOptions(ctx.widgets and ctx.widgets.deviceSelect, labels)
  setSelected(ctx.widgets and ctx.widgets.deviceSelect, 1)
end

local function openWebcam(ctx)
  local idx = 1
  local dd = ctx.widgets and ctx.widgets.deviceSelect
  if dd and dd.getSelected then idx = dd:getSelected() end
  local entry = ctx._devices and ctx._devices[math.max(1, idx)]
  local deviceIdx = (entry and tonumber(entry.index)) or 0
  local ok = false
  if capture and capture.open then
    ok = capture.open(deviceIdx, 640, 480, 30)
  end
  setText(ctx.widgets and ctx.widgets.webcamStatus,
    ok and "Webcam: open device " .. tostring(deviceIdx) .. " @ 640x480" or "Webcam: open failed")

  local vp = ctx.widgets and ctx.widgets.liveViewport
  if vp and vp.node and vp.node.setCustomSurface then
    vp.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "live" })
  end

  refreshMlSurfaces(ctx)
end

local function closeWebcam(ctx)
  if capture and capture.close then capture.close() end
  clearMlSurfaces(ctx)
  setText(ctx.widgets and ctx.widgets.webcamStatus, "Webcam: closed")
end

local function loadModel(ctx)
  local root = projectRoot()
  if not root then root = "/tmp/" end
  local modelPath = root .. "selfie_segmentation.onnx"

  if type(showFileChooser) == "function" then
    showFileChooser("Load ONNX model", root, "*.onnx", function(chosen)
      if type(chosen) ~= "string" or chosen == "" then
        setText(ctx.widgets and ctx.widgets.modelPathLabel, "Model load cancelled")
        return
      end
      doLoadModel(ctx, chosen, false)
    end)
    return
  end

  doLoadModel(ctx, modelPath, false)
end

local function loadPoseModel(ctx)
  local root = projectRoot()
  if not root then root = "/tmp/" end
  local modelPath = root .. "movenet_singlepose_lightning.onnx"

  if type(showFileChooser) == "function" then
    showFileChooser("Load Pose ONNX model", root, "*.onnx", function(chosen)
      if type(chosen) ~= "string" or chosen == "" then
        setText(ctx.widgets and ctx.widgets.modelPathLabel, "Pose model load cancelled")
        return
      end
      doLoadModel(ctx, chosen, true)
    end)
    return
  end

  doLoadModel(ctx, modelPath, true)
end

local function autoLoadModel(ctx)
  local root = projectRoot()
  if not root then
    setText(ctx.widgets and ctx.widgets.modelPathLabel, "Can't resolve project root for model")
    return false
  end
  local modelPath = root .. "selfie_segmentation.onnx"
  setText(ctx.widgets and ctx.widgets.modelPathLabel, "Auto-loading seg: " .. modelPath)
  return doLoadModel(ctx, modelPath, false)
end

local function autoLoadPoseModel(ctx)
  local root = projectRoot()
  if not root then
    setText(ctx.widgets and ctx.widgets.modelPathLabel, "Can't resolve project root for pose model")
    return false
  end
  local modelPath = root .. "movenet_singlepose_lightning.onnx"
  setText(ctx.widgets and ctx.widgets.modelPathLabel, "Auto-loading pose: " .. modelPath)
  return doLoadModel(ctx, modelPath, true)
end

local function runInference(ctx)
  local pipe = ctx._pipeline
  if not pipe then
    setText(ctx.widgets and ctx.widgets.outputText, "No model loaded. Click Load Model first.")
    return
  end

  local result = nil
  local ok = false
  if ml.infer then
    ok, result = pcall(ml.infer, pipe)
  end

  if not ok or result == nil then
    local frameInfo = (capture and capture.getFrameInfo and capture.getFrameInfo()) or nil
    if frameInfo and frameInfo.valid then
      setText(ctx.widgets and ctx.widgets.outputText,
        "Snapshot inference returned nil even though a frame exists.\n" ..
        "Frame: " .. tostring(frameInfo.width) .. "x" .. tostring(frameInfo.height) .. " seq=" .. tostring(frameInfo.sequence))
    else
      setText(ctx.widgets and ctx.widgets.outputText,
        "Snapshot inference returned nil. Ensure webcam is open and model is loaded correctly.")
    end
    return
  end

  ctx._lastResult = result
  local outputText = string.format(
    "Snapshot inference OK\n  Output: %dx%d  total=%d elements",
    result.width, result.height, result.size)

  if type(result.data) == "table" then
    local preview = {}
    local minv = 1e9
    local maxv = -1e9
    local sum = 0
    local hot = 0
    for i = 1, #result.data do
      local v = tonumber(result.data[i]) or 0
      if v < minv then minv = v end
      if v > maxv then maxv = v end
      if v > ctx._params.threshold then hot = hot + 1 end
      sum = sum + v
      if i <= 16 then
        preview[#preview + 1] = string.format("%.4f", v)
      end
    end
    outputText = outputText
      .. string.format("\n  min=%.4f max=%.4f mean=%.4f hot(>threshold)=%d", minv, maxv, sum / math.max(1, #result.data), hot)
    if #preview > 0 then
      outputText = outputText .. "\n  First 16: [" .. table.concat(preview, ", ") .. ", ...]"
    end
  end

  outputText = outputText
    .. "\n  Right panels run continuously: grayscale mask + composited foreground preview."
  setText(ctx.widgets and ctx.widgets.outputText, outputText)
end

-- ============================================================================
-- Lifecycle
-- ============================================================================

function M.init(ctx)
  ctx._pipeline = nil
  ctx._modelPath = nil
  ctx._posePipeline = nil
  ctx._poseModelPath = nil
  ctx._poseOverlay = nil
  ctx._lastPoseKeypoints = nil
  ctx._poseConfThreshold = 0.3
  ctx._devices = {}
  ctx._params = {}
  for _, spec in ipairs(PARAM_SPECS) do
    ctx._params[spec.id] = spec.default
  end
  for _, spec in ipairs(POSE_PARAM_SPECS) do
    ctx._params[spec.id] = spec.default
  end
  for _, spec in ipairs(TOGGLE_SPECS) do
    ctx._params[spec.id] = spec.default
  end
  for _, spec in ipairs(POSE_TOGGLE_SPECS) do
    ctx._params[spec.id] = spec.default
  end

  local refresh = ctx.widgets and ctx.widgets.refreshBtn
  if refresh then refresh._onClick = function() refreshDevices(ctx) end end

  local open = ctx.widgets and ctx.widgets.openBtn
  if open then open._onClick = function() openWebcam(ctx) end end

  local close = ctx.widgets and ctx.widgets.closeBtn
  if close then close._onClick = function() closeWebcam(ctx) end end

  local loadBtn = ctx.widgets and ctx.widgets.loadModelBtn
  if loadBtn then loadBtn._onClick = function() loadModel(ctx) end end

  local poseBtn = ctx.widgets and ctx.widgets.loadPoseModelBtn
  if poseBtn then poseBtn._onClick = function() loadPoseModel(ctx) end end

  local inferBtn = ctx.widgets and ctx.widgets.inferBtn
  if inferBtn then inferBtn._onClick = function() runInference(ctx) end end

  bindParamControls(ctx)
  syncParamControls(ctx)
  refreshDevices(ctx)

  setText(ctx.widgets and ctx.widgets.modelInfo,
    "ML available: " .. tostring(type(ml) == "table" and type(ml.load) == "function"))
  setText(ctx.widgets and ctx.widgets.outputText,
    "Open webcam to start continuous live segmentation. Snapshot dumps a one-shot debug summary. The lab auto-builds postprocess controls from the ML param spec.")

  autoLoadModel(ctx)
  autoLoadPoseModel(ctx)
end

function M.update(ctx)
  local info = (capture and capture.getFrameInfo and capture.getFrameInfo()) or { valid = false }
  local open = (capture and capture.isOpen and capture.isOpen()) or false
  setText(ctx.widgets and ctx.widgets.webcamStatus,
    string.format("Webcam: %s  frame=%s  %dx%d  seq=%s",
      open and "open" or "closed",
      info.valid and "yes" or "no",
      tonumber(info.width) or 0,
      tonumber(info.height) or 0,
      tostring(info.sequence or "--")))

  if ctx._posePipeline and open then
    runPoseInference(ctx)
  end
  updatePoseOverlayBounds(ctx)
end

function M.cleanup(ctx)
  clearMlSurfaces(ctx)
  if capture and capture.close then pcall(capture.close) end
  if ctx._poseOverlay and ctx._poseOverlay.clearDisplayList then
    ctx._poseOverlay:clearDisplayList()
  end
end

return M
