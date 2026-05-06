local M = {}

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v)
  return math.floor((tonumber(v) or 0) + 0.5)
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


local function doLoadModel(ctx, path)
  if type(ml) ~= "table" or type(ml.load) ~= "function" then
    setText(ctx.widgets and ctx.widgets.modelPathLabel, "ML bindings not available (TFLite disabled)")
    return false
  end

  local ok, pipe = pcall(ml.load, path)
  if not ok or pipe == nil then
    setText(ctx.widgets and ctx.widgets.modelPathLabel, "Failed to load: " .. tostring(ok and "(nil)" or tostring(ok)))
    return false
  end

  ctx._pipeline = pipe
  setText(ctx.widgets and ctx.widgets.modelPathLabel, "Model loaded: " .. tostring(path))
  setText(ctx.widgets and ctx.widgets.modelInfo,
    string.format("Input: %dx%dx%d  Output: %d elements",
      pipe:inputWidth(), pipe:inputHeight(), pipe:inputChannels(), pipe:outputElements()))
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
  -- Bind live surface
  local vp = ctx.widgets and ctx.widgets.liveViewport
  if vp and vp.node and vp.node.setCustomSurface then
    vp.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "live" })
  end
end

local function closeWebcam(ctx)
  if capture and capture.close then capture.close() end
  setText(ctx.widgets and ctx.widgets.webcamStatus, "Webcam: closed")
end

-- Resolve project root: getCurrentScriptPath returns the manifest path,
-- strip the filename to get the project directory.
local function projectRoot()
  local fp = (type(getCurrentScriptPath) == "function") and getCurrentScriptPath() or ""
  -- Strip everything after the last / to get the project directory
  local dir = fp:match("^(.*)/[^/]+$")
  if dir then return dir .. "/" end
  return nil
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
      doLoadModel(ctx, chosen)
    end)
    return
  end

  doLoadModel(ctx, modelPath)
end

-- Auto-load the bundled model from the project directory
local function autoLoadModel(ctx)
  local root = projectRoot()
  if not root then
    setText(ctx.widgets and ctx.widgets.modelPathLabel, "Can\'t resolve project root for model")
    return false
  end
  local modelPath = root .. "selfie_segmentation.onnx"
  setText(ctx.widgets and ctx.widgets.modelPathLabel, "Auto-loading: " .. modelPath)
  doLoadModel(ctx, modelPath)
end

local function runInference(ctx)
  local pipe = ctx._pipeline
  if not pipe then
    setText(ctx.widgets and ctx.widgets.outputText, "No model loaded. Click Load Model first.")
    return
  end

  -- If webcam is open, try convenience infer
  local result = nil
  local ok = false

  if ml.infer then
    ok, result = pcall(ml.infer, pipe)
  end

  if not ok or result == nil then
    -- Try explicit frame as fallback
    local frameInfo = (capture and capture.getFrameInfo and capture.getFrameInfo()) or nil
    if frameInfo and frameInfo.valid then
      setText(ctx.widgets and ctx.widgets.outputText,
        "ml.infer() returned nil. This is expected without webcam or if model needs explicit frame data.\n" ..
        "Frame available: " .. tostring(frameInfo.width) .. "x" .. tostring(frameInfo.height) .. "\n" ..
        "ml.inferFrame() requires Lua-side pixel data copy. Working on it.")
    else
      setText(ctx.widgets and ctx.widgets.outputText,
        "ml.infer() returned nil. Ensure webcam is open and model is loaded correctly.\n" ..
        "Model info: " .. (pipe and tostring(pipe:inputWidth()) or "?") .. "x" .. tostring(pipe:inputHeight() or "?") .. "\n" ..
        "Webcam open: " .. tostring(capture and capture.isOpen and capture.isOpen() or false))
    end
    return
  end

  ctx._lastResult = result
  local outputText = string.format(
    "Inference OK\n  Output: %dx%d  total=%d elements\n  First 16 floats:",
    result.width, result.height, result.size)

  if type(result.data) == "table" then
    local preview = {}
    for i = 1, math.min(16, #result.data) do
      preview[#preview + 1] = string.format("%.4f", result.data[i])
    end
    if #preview > 0 then
      outputText = outputText .. "\n  [" .. table.concat(preview, ", ") .. ", ...]"
    end
  end

  setText(ctx.widgets and ctx.widgets.outputText, outputText)
end

function M.init(ctx)
  ctx._pipeline = nil
  ctx._devices = {}

  -- Wire up callbacks
  local refresh = ctx.widgets and ctx.widgets.refreshBtn
  if refresh then refresh._onClick = function() refreshDevices(ctx) end end

  local open = ctx.widgets and ctx.widgets.openBtn
  if open then open._onClick = function() openWebcam(ctx) end end

  local close = ctx.widgets and ctx.widgets.closeBtn
  if close then close._onClick = function() closeWebcam(ctx) end end

  local loadBtn = ctx.widgets and ctx.widgets.loadModelBtn
  if loadBtn then loadBtn._onClick = function() loadModel(ctx) end end

  local inferBtn = ctx.widgets and ctx.widgets.inferBtn
  if inferBtn then inferBtn._onClick = function() runInference(ctx) end end

  refreshDevices(ctx)
  setText(ctx.widgets and ctx.widgets.modelInfo, "ML available: " .. tostring(type(ml) == "table" and type(ml.load) == "function"))

  -- Auto-load the bundled selfie segmentation model
  autoLoadModel(ctx)
end

function M.update(ctx)
  -- Poll webcam frame info for display
  local info = (capture and capture.getFrameInfo and capture.getFrameInfo()) or { valid = false }
  local open = (capture and capture.isOpen and capture.isOpen()) or false
  setText(ctx.widgets and ctx.widgets.webcamStatus,
    string.format("Webcam: %s  frame=%s  %dx%d  seq=%s",
      open and "open" or "closed",
      info.valid and "yes" or "no",
      tonumber(info.width) or 0,
      tonumber(info.height) or 0,
      tostring(info.sequence or "--")))
end

function M.cleanup(ctx)
  if capture and capture.close then pcall(capture.close) end
end

return M
