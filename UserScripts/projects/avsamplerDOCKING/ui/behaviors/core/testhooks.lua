local C = require("behaviors.core.constants")
local U = require("behaviors.core.util")
local ML = require("behaviors.core.ml")
local Midi = require("behaviors.core.midi")
local Mapping = require("behaviors.core.mapping")

local M = {}

local function bool01(v)
  return v == true or tonumber(v) == 1
end

local function num(v)
  return tonumber(v) or 0
end

local function scalar(v)
  local tv = type(v)
  if tv == "boolean" or tv == "string" or tv == "number" then return v end
  return num(v)
end

local function copyNumArray(values)
  local out = {}
  for i = 1, #(values or {}) do out[i] = num(values[i]) end
  return out
end

local function copyStringArray(values)
  local out = {}
  for i = 1, #(values or {}) do out[i] = tostring(values[i] or "") end
  return out
end

local function copyKeySortedTable(t)
  if type(t) ~= "table" then return nil end
  local out, keys = {}, {}
  for k in pairs(t) do keys[#keys + 1] = tostring(k) end
  table.sort(keys)
  for i = 1, #keys do out[keys[i]] = scalar(t[keys[i]]) end
  return out
end

local function cleanSourceSpec(spec)
  if type(spec) ~= "table" then return nil end
  return {
    kind = spec.kind,
    sourceIndex = spec.sourceIndex,
    sourceId = spec.sourceId,
    mlType = spec.mlType,
    sourceCol = spec.sourceCol,
    tapIndex = spec.tapIndex,
    params = copyKeySortedTable(spec.params),
  }
end

local function esc(s)
  s = tostring(s or "")
  s = s:gsub("\\", "\\\\")
  s = s:gsub("\"", "\\\"")
  s = s:gsub("\n", "\\n")
  s = s:gsub("\r", "\\r")
  return s
end

local function isArray(t)
  if type(t) ~= "table" then return false end
  local n = #t
  for k in pairs(t) do
    if type(k) ~= "number" or k < 1 or k > n or k % 1 ~= 0 then return false end
  end
  return true
end

local function encode(v)
  local tv = type(v)
  if tv == "nil" then return "null" end
  if tv == "boolean" then return v and "true" or "false" end
  if tv == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "0" end
    return tostring(v)
  end
  if tv == "string" then return "\"" .. esc(v) .. "\"" end
  if tv ~= "table" then return "\"" .. esc(tostring(v)) .. "\"" end
  if isArray(v) then
    local out = {}
    for i = 1, #v do out[i] = encode(v[i]) end
    return "[" .. table.concat(out, ",") .. "]"
  end
  local keys, out = {}, {}
  for k in pairs(v) do keys[#keys + 1] = tostring(k) end
  table.sort(keys)
  for i = 1, #keys do
    local key = keys[i]
    out[i] = "\"" .. esc(key) .. "\":" .. encode(v[key])
  end
  return "{" .. table.concat(out, ",") .. "}"
end

function M.register(ctx, deps)
  _G.__avsdExportContract = function(path)
    local function frameInfo()
      local seams = ctx._testSeams or nil
      return (type(seams) == "table" and type(seams.frameInfo) == "table" and seams.frameInfo) or ((capture and capture.getFrameInfo and capture.getFrameInfo()) or { valid = false })
    end
    local function webcamOpen()
      local seams = ctx._testSeams or nil
      if type(seams) == "table" and seams.webcamOpen ~= nil then return seams.webcamOpen == true end
      return (capture and capture.isOpen and capture.isOpen()) and true or false
    end
    local function clock()
      local seams = ctx._testSeams or nil
      return (type(seams) == "table" and type(seams.clock) == "table" and seams.clock) or U.clockInfo()
    end
    local function samplerState()
      local seams = ctx._testSeams or nil
      if type(seams) == "table" and type(seams.sampler) == "table" then
        return {
          frameCount = U.round(seams.sampler.frameCount or 0),
          durationSeconds = num(seams.sampler.durationSeconds),
          estimatedBytes = num(seams.sampler.estimatedBytes),
          position = num(seams.sampler.position),
          playing = bool01(seams.sampler.playing),
          playStart = num(seams.sampler.playStart),
          loopStart = num(seams.sampler.loopStart),
          loopEnd = num(seams.sampler.loopEnd),
          crossfade = num(seams.sampler.crossfade),
          oneShot = bool01(seams.sampler.oneShot),
        }
      end
      return {
        frameCount = ctx.video and ctx.video.getFrameCount and ctx.video:getFrameCount() or 0,
        durationSeconds = ctx.video and ctx.video.getDurationSeconds and ctx.video:getDurationSeconds() or 0,
        estimatedBytes = ctx.video and ctx.video.getEstimatedBytes and ctx.video:getEstimatedBytes() or 0,
        position = ctx.video and ctx.video.getNormalizedPosition and ctx.video:getNormalizedPosition() or 0,
        playing = ctx.video and ctx.video.isPlaying and ctx.video:isPlaying() or false,
        playStart = ctx.video and ctx.video.getPlayStart and ctx.video:getPlayStart() or 0,
        loopStart = ctx.video and ctx.video.getLoopStart and ctx.video:getLoopStart() or 0,
        loopEnd = ctx.video and ctx.video.getLoopEnd and ctx.video:getLoopEnd() or 1,
        crossfade = ctx.video and ctx.video.getCrossfade and ctx.video:getCrossfade() or 0,
        oneShot = ctx.video and ctx.video.isOneShot and ctx.video:isOneShot() or false,
      }
    end
    local function captureState()
      local seams = ctx._testSeams or nil
      if type(seams) == "table" and type(seams.capture) == "table" then
        return {
          frameCount = U.round(seams.capture.frameCount or 0),
          lockedWidth = U.round(seams.capture.lockedWidth or 0),
          lockedHeight = U.round(seams.capture.lockedHeight or 0),
          estimatedBytes = num(seams.capture.estimatedBytes),
          captureSeconds = num(seams.capture.captureSeconds or U.readParam(C.NS .. "/capture_seconds", 4)),
          lastSequence = seams.capture.lastSequence,
        }
      end
      return {
        frameCount = ctx.videoCap and ctx.videoCap.getFrameCount and ctx.videoCap:getFrameCount() or 0,
        lockedWidth = ctx.videoCap and ctx.videoCap.getLockedWidth and ctx.videoCap:getLockedWidth() or 0,
        lockedHeight = ctx.videoCap and ctx.videoCap.getLockedHeight and ctx.videoCap:getLockedHeight() or 0,
        estimatedBytes = ctx.videoCap and ctx.videoCap.getEstimatedBytes and ctx.videoCap:getEstimatedBytes() or 0,
        captureSeconds = ctx.videoCap and ctx.videoCap.getCaptureSeconds and ctx.videoCap:getCaptureSeconds() or num(U.readParam(C.NS .. "/capture_seconds", 4)),
        lastSequence = nil,
      }
    end
    local function sourceParamState(col)
      local spec = deps.sourceSpecForColumn(ctx, col)
      local out = { spec = cleanSourceSpec(spec), params = {} }
      if type(spec) ~= "table" then return out end
      if spec.kind == "generator" then
        for _, g in ipairs(ctx.sources or {}) do
          if g.kind == "generator" and g.id == spec.sourceId then
            for i = 1, #(g.params or {}) do
              local pspec = g.params[i]
              local norm = spec.params and spec.params[pspec.id]
              local pmin = tonumber(pspec.min) or 0
              local pmax = tonumber(pspec.max) or 1
              local default = tonumber(pspec.default) or pmin
              if norm == nil then norm = (default - pmin) / math.max(0.001, pmax - pmin) end
              out.params[i] = {
                id = pspec.id,
                name = pspec.name,
                normalized = num(norm),
                value = pmin + U.clamp(norm, 0, 1) * (pmax - pmin),
              }
            end
            break
          end
        end
      elseif spec.kind == "ml" then
        for i = 1, #C.ML_SOURCE_PARAM_SPECS do
          local pspec = C.ML_SOURCE_PARAM_SPECS[i]
          out.params[i] = {
            id = pspec.id,
            name = pspec.name,
            value = spec.params and scalar(spec.params[pspec.id]) or scalar(pspec.default),
          }
        end
      end
      return out
    end
    local function waveformState()
      local mode = U.round(U.readParam(C.NS .. "/mode", 0))
      local starts = {}
      for i = 1, C.MAX do starts[i] = num(U.readParam(deps.pathForSlice(i), (i - 1) / C.MAX)) end
      local polyPlayheads, slicePlayheads = {}, {}
      for i = 1, C.MAX do
        polyPlayheads[i] = (ctx._polyPlaying[i] and num(ctx._polyPos[i])) or -1
        slicePlayheads[i] = (ctx._slicePlaying[i] and num(ctx._slicePos[i])) or -1
      end
      local sel = math.max(1, math.min(C.MAX, U.round(ctx._selectedSlice or 1)))
      local start = starts[sel] or 0
      local finish = 1.0
      for i = 1, C.MAX do if (starts[i] or 0) > start + 0.002 and starts[i] < finish then finish = starts[i] end end
      return {
        mode = mode,
        selectedSlice = sel,
        sliceStarts = starts,
        polyPlayheads = polyPlayheads,
        slicePlayheads = slicePlayheads,
        playStart = num(U.readParam(C.NS .. "/play_start", 0)),
        loopStart = num(U.readParam(C.NS .. "/loop_start", 0)),
        loopEnd = num(U.readParam(C.NS .. "/loop_end", 1)),
        crossfade = num(U.readParam(C.NS .. "/crossfade", 0.03)),
        regionStart = mode == 0 and num(U.readParam(C.NS .. "/loop_start", 0)) or start,
        regionEnd = mode == 0 and num(U.readParam(C.NS .. "/loop_end", 1)) or finish,
      }
    end
    local function previewState()
      local mode = U.round(U.readParam(C.NS .. "/mode", 0))
      local pos = 0
      if mode == 0 then
        for i = 1, C.MAX do if ctx._polyPlaying[i] then pos = ctx._polyPos[i] or 0 break end end
        if pos <= 0 then pos = U.clamp(U.readParam(C.NS .. "/play_start", 0), 0, 1) end
      else
        local sel = math.max(1, math.min(C.MAX, U.round(ctx._selectedSlice or 1)))
        pos = ctx._slicePos[sel] or U.clamp(U.readParam(deps.pathForSlice(sel), (sel - 1) / C.MAX), 0, 0.999)
      end
      return { mode = mode, position = num(pos) }
    end

    deps.ensureGridCells(ctx)
    deps.updateGridThumbnails(ctx)
    deps.updateCompositorThumbnails(ctx)
    deps.updateCompositorOutput(ctx)

    local frame = frameInfo()
    local clk = clock()
    local sampler = samplerState()
    local captureInfo = captureState()
    local graph = deps.buildCompositorGraph(ctx)
    local contract = {
      projectPath = (type(getCurrentScriptPath) == "function" and getCurrentScriptPath()) or "",
      rendererMode = (type(getUIRendererMode) == "function" and getUIRendererMode()) or "unknown",
      layoutPreset = ctx._layoutPreset,
      gridAlignment = ctx.gridAlignment,
      selectedView = ctx.selectedView,
      selection = ctx.selection and { col = ctx.selection.col, row = ctx.selection.row } or nil,
      selectionSummary = deps.selectionSummary(ctx),
      selectedGridClip = deps.selectedGridClip(ctx),
      sourceSelectionCol = ctx.sourceSelectionCol,
      selectedSlice = ctx._selectedSlice,
      aspectMode = ctx.aspectMode,
      output = { w = ctx.outputW, h = ctx.outputH },
      resizeMode = bool01(ctx._resizeMode),
      captureMode = ctx.captureMode,
      captureRecording = bool01(ctx.captureRecording),
      poseConf = num(ctx.poseConf),
      showSkeleton = bool01(ctx.showSkeleton),
      webcamOpen = webcamOpen(),
      frameInfo = { valid = bool01(frame.valid), width = U.round(frame.width or 0), height = U.round(frame.height or 0), sequence = frame.sequence },
      clock = { sampleRate = num(clk.sampleRate), playTimeSamples = num(clk.playTimeSamples), tempo = num(clk.tempo) },
      seg = {
        gain = num(ctx.seg and ctx.seg.gain),
        threshold = num(ctx.seg and ctx.seg.threshold),
        feather = num(ctx.seg and ctx.seg.feather),
        invert = bool01(ctx.seg and ctx.seg.invert),
      },
      sampler = sampler,
      capture = captureInfo,
      waveform = waveformState(),
      preview = previewState(),
      visible = copyNumArray({}),
      midi = {
        currentLabel = Midi.currentMidiLabel() or "none",
        lastMidi = tostring(ctx._lastMidi or "--"),
        devices = copyStringArray(ctx._midiDevices or {}),
        selectedInput = deps.selectedDeviceIndex(ctx),
        isOpen = Midi and Midi.isInputOpen and Midi.isInputOpen() or false,
        note = U.round(U.readParam(C.NS .. "/midi_note", 0)),
        velocity = U.round(U.readParam(C.NS .. "/midi_velocity", 0)),
        noteOnTrigger = U.round(U.readParam(C.NS .. "/midi_note_on_trigger", 0)),
        noteOffTrigger = U.round(U.readParam(C.NS .. "/midi_note_off_trigger", 0)),
      },
      fx = {
        slot = ctx.fxSlot,
        type = U.round(U.readParam(deps.rackFxTypePath(ctx.fxSlot), 0)),
        mix = num(U.readParam(deps.rackFxMixPath(ctx.fxSlot), 0)),
        params = {},
      },
      hostParams = {
        mode = U.round(U.readParam(C.NS .. "/mode", 0)),
        speed = num(U.readParam(C.NS .. "/speed", 1)),
        output = num(U.readParam(C.NS .. "/output", 0.8)),
        rootNote = U.round(U.readParam(C.NS .. "/root_note", 60)),
        voiceCount = U.round(U.readParam(C.NS .. "/voice_count", 8)),
        pitchTracking = bool01(U.readParam(C.NS .. "/pitch_tracking", 1)),
        playStart = num(U.readParam(C.NS .. "/play_start", 0)),
        loopStart = num(U.readParam(C.NS .. "/loop_start", 0)),
        loopEnd = num(U.readParam(C.NS .. "/loop_end", 1)),
        crossfade = num(U.readParam(C.NS .. "/crossfade", 0.03)),
        oneShot = bool01(U.readParam(C.NS .. "/one_shot", 0)),
        captureSeconds = num(U.readParam(C.NS .. "/capture_seconds", 4)),
        shaderSource = U.round(U.readParam(C.NS .. "/shader/source", 1)),
        activeLayer = U.round(U.readParam(C.NS .. "/shader/active_layer", 1)),
      },
      slices = {},
      shader = {
        sourceIndex = ctx.shader and ctx.shader.sourceIndex or 1,
        activeLayer = ctx.shader and ctx.shader.activeLayer or 1,
        layers = {},
        sourceParams = copyKeySortedTable(ctx.shaderSourceParams or {}),
      },
      sourceInspector = sourceParamState(tonumber(ctx.sourceSelectionCol) or 1),
      mappings = {},
      pose = { values = copyKeySortedTable(ctx.pose and ctx.pose.values or {}), keypoints = {} },
      sources = {},
      effects = {},
      gridThumbSigs = copyKeySortedTable(ctx._gridThumbSigs or {}),
      columns = {},
      compositor = nil,
      compositorThumbSigs = copyKeySortedTable(ctx._compoThumbSigs or {}),
      profile = {},
      testSeams = nil,
    }

    for i = 1, C.MAX do contract.visible[i] = type(ctx._visible) == "table" and ctx._visible[i] or nil end
    for i = 1, 5 do contract.fx.params[i] = num(U.readParam(deps.rackFxParamPath(ctx.fxSlot, i - 1), 0.5)) end
    for i = 1, C.MAX do
      contract.slices[i] = {
        start = num(U.readParam(deps.pathForSlice(i), (i - 1) / C.MAX)),
        polyPlaying = bool01(ctx._polyPlaying[i]),
        polyPos = num(ctx._polyPos[i]),
        slicePlaying = bool01(ctx._slicePlaying[i]),
        slicePos = num(ctx._slicePos[i]),
      }
    end
    for i = 1, #(ctx.shader and ctx.shader.layers or {}) do
      local layer = ctx.shader.layers[i]
      contract.shader.layers[i] = {
        enabled = bool01(layer.enabled),
        effectIndex = layer.effectIndex,
        effectName = ((ctx.effects or {})[layer.effectIndex] or {}).name,
        params = copyNumArray(layer.params),
      }
    end
    for i = 1, #(ctx.mappings or {}) do
      local mapping = ctx.mappings[i]
      local target = Mapping.targetSpec(mapping.target or 1)
      contract.mappings[i] = {
        enabled = bool01(mapping.enabled),
        source = mapping.source,
        sourceLabel = (ML.POSE_SOURCES[mapping.source or 1] or {}).label,
        target = mapping.target,
        targetLabel = target and target.label or nil,
        min = num(mapping.min),
        max = num(mapping.max),
        invert = bool01(mapping.invert),
      }
    end
    for i = 1, #(ctx.pose and ctx.pose.keypoints or {}) do
      local kp = ctx.pose.keypoints[i] or {}
      contract.pose.keypoints[i] = { x = num(kp.x), y = num(kp.y), conf = num(kp.conf) }
    end
    for i = 1, #(ctx.sources or {}) do
      local source = ctx.sources[i] or {}
      contract.sources[i] = {
        id = source.id,
        name = source.name,
        kind = source.kind,
        params = copyStringArray((function()
          local out = {}
          for j = 1, #(source.params or {}) do out[j] = (source.params[j] or {}).id or tostring(j) end
          return out
        end)()),
      }
    end
    for i = 1, #(ctx.effects or {}) do
      local effect = ctx.effects[i] or {}
      contract.effects[i] = {
        id = effect.id,
        name = effect.name or effect.id or tostring(i),
        params = copyStringArray((function()
          local out = {}
          for j = 1, #(effect.params or {}) do out[j] = (effect.params[j] or {}).id or tostring(j) end
          return out
        end)()),
      }
    end
    for col = 1, #(ctx._colData or {}) do
      local data = ctx._colData[col] or {}
      local fxRows = {}
      for row = 1, #(data.fx or {}) do
        local fx = data.fx[row] or {}
        fxRows[row] = {
          effectIndex = fx.effectIndex,
          effectName = ((ctx.effects or {})[fx.effectIndex] or {}).name,
          enabled = bool01(fx.enabled),
          params = copyNumArray(fx.params),
        }
      end
      local tapSignatures = {}
      for row = 1, 1 + #fxRows do tapSignatures[row] = deps.stackTapSignature(ctx, col, row) end
      contract.columns[col] = {
        id = data.id,
        label = deps.colSourceLabel(ctx, col),
        source = cleanSourceSpec(deps.sourceSpecForColumn(ctx, col) or data.sourceSpec),
        sourceParamState = sourceParamState(col),
        sourceSignature = deps.sourceSpecSignature(ctx, col),
        fx = fxRows,
        tapSignatures = tapSignatures,
      }
    end
    if ctx.compositor and ctx.compositor.layers then
      contract.compositor = {
        selection = ctx.compositorSelection and ctx.compositorSelection.layerIndex or nil,
        finalKey = graph and graph.finalKey or nil,
        accumulatedKeyByLayer = graph and copyNumArray({}) or {},
        layers = {},
      }
      if graph and type(graph.accumulatedKeyByLayer) == "table" then
        for i = 1, #graph.accumulatedKeyByLayer do contract.compositor.accumulatedKeyByLayer[i] = graph.accumulatedKeyByLayer[i] end
      end
      for i = 1, #ctx.compositor.layers do
        local layer = ctx.compositor.layers[i] or {}
        contract.compositor.layers[i] = {
          sourceColumn = layer.sourceColumn,
          tapIndex = layer.tapIndex,
          blendMode = layer.blendMode,
          opacity = num(layer.opacity),
          visible = bool01(layer.visible),
          name = layer.name,
          signature = deps.compositorLayerCellPipeline(ctx, ctx.compositor.layers[i]),
        }
      end
    end
    if type(ctx._profile) == "table" then
      local keys = {}
      for k in pairs(ctx._profile) do keys[#keys + 1] = tostring(k) end
      table.sort(keys)
      for i = 1, #keys do
        local key = keys[i]
        local t = ctx._profile[key] or {}
        contract.profile[key] = {
          total = num(t.total),
          count = U.round(t.count or 0),
          max = num(t.max),
          last = num(t.last),
          avg = num(t.avg),
        }
      end
    end
    if type(ctx._testSeams) == "table" then
      contract.testSeams = {
        webcamOpen = ctx._testSeams.webcamOpen,
        frameInfo = copyKeySortedTable(ctx._testSeams.frameInfo),
        capture = copyKeySortedTable(ctx._testSeams.capture),
        sampler = copyKeySortedTable(ctx._testSeams.sampler),
        clock = copyKeySortedTable(ctx._testSeams.clock),
        poseSequence = ctx._testSeams.poseSequence,
        midiQueueDepth = type(ctx._testSeams.midiQueue) == "table" and #ctx._testSeams.midiQueue or 0,
        playbackKeys = (function()
          local keys = {}
          for k in pairs(ctx._testSeams.playback or {}) do keys[#keys + 1] = tostring(k) end
          table.sort(keys)
          return keys
        end)(),
      }
    end

    local json = encode(contract)
    if type(path) == "string" and path ~= "" and type(writeTextFile) == "function" then
      writeTextFile(path, json)
      return path
    end
    return json
  end

  _G.__avsdAction = function(action, a, b, c, d)
    local function resolveWidget(id)
      return (ctx.widgets and ctx.widgets[id]) or (ctx.allWidgets and ctx.allWidgets[id]) or nil
    end
    local function forceRefresh()
      deps.syncParamsFromHost(ctx)
      ML.bindInputSurfaces(ctx)
      deps.applyVideoWindow(ctx)
      deps.updateOutputAspect(ctx)
      deps.refreshWaveform(ctx)
      deps.updatePreviewSurface(ctx)
      deps.layoutOutputRow(ctx)
      deps.ensureGridCells(ctx)
      deps.updateGridThumbnails(ctx)
      deps.updateCompositorThumbnails(ctx)
      deps.updateCompositorOutput(ctx)
      return true
    end
    action = tostring(action or "")
    if action == "force_refresh" then
      return forceRefresh()
    elseif action == "set_param" then
      U.writeParam(tostring(a or ""), type(b) == "boolean" and (b and 1 or 0) or num(b))
      return true
    elseif action == "widget_click" then
      local w = resolveWidget(tostring(a or ""))
      if w and w._onClick then w._onClick() end
      return true
    elseif action == "widget_change" then
      local w = resolveWidget(tostring(a or ""))
      if w and w._onChange then w._onChange(c ~= nil and c or b) end
      return true
    elseif action == "widget_select" then
      local w = resolveWidget(tostring(a or ""))
      if w and w._onSelect then w._onSelect(U.round(b)) end
      return true
    elseif action == "set_layout_preset" then
      deps.setLayoutPreset(ctx, tostring(a or "deck"))
      return true
    elseif action == "set_selected_slice" then
      local w = resolveWidget("selectedSlice")
      if w and w._onSelect then w._onSelect(U.round(a)) end
      return ctx._selectedSlice or 1
    elseif action == "set_source_select" then
      local w = resolveWidget("sourceSelect")
      if w and w._onSelect then w._onSelect(U.round(a)) end
      return ctx.shader and ctx.shader.sourceIndex or 1
    elseif action == "set_aspect_select" then
      local w = resolveWidget("aspectSelect")
      if w and w._onSelect then w._onSelect(U.round(a)) end
      return ctx.aspectMode
    elseif action == "set_source_selection_col" then
      ctx.sourceSelectionCol = U.round(a)
      deps.syncShaderSourceParams(ctx)
      return ctx.sourceSelectionCol
    elseif action == "set_source_param" then
      local w = resolveWidget("sourceParam" .. tostring(U.round(a)))
      if w and w._onChange then w._onChange(num(b)) end
      return true
    elseif action == "set_shader_layer" then
      local w = resolveWidget("shaderLayer")
      if w and w._onSelect then w._onSelect(U.round(a)) end
      return ctx.shader and ctx.shader.activeLayer or 1
    elseif action == "set_shader_enabled" then
      local w = resolveWidget("shaderEnabled")
      if w and w._onChange then w._onChange(bool01(a)) end
      return true
    elseif action == "set_effect_select" then
      local w = resolveWidget("effectSelect")
      if w and w._onSelect then w._onSelect(U.round(a)) end
      return true
    elseif action == "set_shader_param" then
      local widget = resolveWidget("shaderParam" .. tostring(U.round(a)))
      if widget and widget._onChange then widget._onChange(num(b)) end
      return true
    elseif action == "set_mapping_field" then
      local track = U.round(a)
      local field = tostring(b or "")
      if field == "enable" then
        local w = resolveWidget("mapping" .. track .. "Enable")
        if w and w._onChange then w._onChange(bool01(c)) end
      elseif field == "source" then
        local w = resolveWidget("mapping" .. track .. "Source")
        if w and w._onSelect then w._onSelect(U.round(c)) end
      elseif field == "target" then
        local w = resolveWidget("mapping" .. track .. "Target")
        if w and w._onSelect then w._onSelect(U.round(c)) end
      elseif field == "min" then
        local w = resolveWidget("mapping" .. track .. "Min")
        if w and w._onChange then w._onChange(num(c)) end
      elseif field == "max" then
        local w = resolveWidget("mapping" .. track .. "Max")
        if w and w._onChange then w._onChange(num(c)) end
      elseif field == "invert" then
        local w = resolveWidget("mapping" .. track .. "Invert")
        if w and w._onChange then w._onChange(bool01(c)) end
      end
      return true
    elseif action == "set_fx_slot" then
      local w = resolveWidget("fxSlot")
      if w and w._onSelect then w._onSelect(U.round(a)) end
      return ctx.fxSlot
    elseif action == "set_fx_type" then
      local w = resolveWidget("fxType")
      if w and w._onSelect then w._onSelect(U.round(a)) end
      return true
    elseif action == "set_fx_mix" then
      local w = resolveWidget("fxMix")
      if w and w._onChange then w._onChange(num(a)) end
      return true
    elseif action == "set_fx_param" then
      local w = resolveWidget("fxParam" .. tostring(U.round(a)))
      if w and w._onChange then w._onChange(num(b)) end
      return true
    elseif action == "add_column" then
      local kind = tostring(a or "ml")
      if kind == "ml" then
        deps.addColumn(ctx, { kind = "ml", mlType = tostring(b or "segmented"), params = { gain = 1.0, threshold = 0.5, feather = 0.15, background = 0.02, useSigmoid = true, invert = false } })
      elseif kind == "generator" then
        deps.addColumn(ctx, { kind = "generator", sourceIndex = U.round(b or 1), sourceId = (((ctx.sources or {})[U.round(b or 1)] or {}).id), params = {} })
      elseif kind == "columntap" then
        deps.addColumn(ctx, { kind = "columntap", sourceCol = U.round(b or 1), tapIndex = U.round(c or 0) })
      else
        deps.addColumn(ctx, { kind = "webcam", sourceIndex = 1 })
      end
      return #(ctx._colData or {})
    elseif action == "remove_column" then
      deps.removeColumn(ctx, U.round(a))
      return #(ctx._colData or {})
    elseif action == "col_add_fx" then
      deps.colAddFx(ctx, U.round(a), U.round(b))
      return true
    elseif action == "col_remove_fx" then
      deps.colRemoveFx(ctx, U.round(a), U.round(b))
      return true
    elseif action == "set_column_source_ml" then
      deps.setSourceSpecForColumn(ctx, U.round(a), { kind = "ml", mlType = tostring(b or "segmented"), params = { gain = 1.0, threshold = 0.5, feather = 0.15, background = 0.02, useSigmoid = true, invert = false } })
      return true
    elseif action == "set_column_source_generator" then
      local idx = U.round(b or 1)
      deps.setSourceSpecForColumn(ctx, U.round(a), { kind = "generator", sourceIndex = idx, sourceId = (((ctx.sources or {})[idx] or {}).id), params = {} })
      return true
    elseif action == "set_column_source_webcam" then
      deps.setSourceSpecForColumn(ctx, U.round(a), { kind = "webcam", sourceIndex = 1 })
      return true
    elseif action == "set_column_source_columntap" then
      deps.setSourceSpecForColumn(ctx, U.round(a), { kind = "columntap", sourceCol = U.round(b or 1), tapIndex = U.round(c or 0) })
      return true
    elseif action == "select_grid_cell" then
      deps.selectGridCell(ctx, U.round(a), U.round(b))
      return true
    elseif action == "set_compositor_layer" then
      local idx = U.round(a)
      local field = tostring(b or "")
      local layer = ctx.compositor and ctx.compositor.layers and ctx.compositor.layers[idx]
      if not layer then return false end
      if field == "sourceColumn" then layer.sourceColumn = U.round(c)
      elseif field == "tapIndex" then layer.tapIndex = (c == nil or c == false or tostring(c) == "nil") and nil or U.round(c)
      elseif field == "blendMode" then layer.blendMode = tostring(c or "normal")
      elseif field == "opacity" then layer.opacity = U.clamp(c, 0, 1)
      elseif field == "visible" then layer.visible = bool01(c)
      elseif field == "select" then ctx.compositorSelection = { layerIndex = idx } end
      deps.updateCompositorThumbnails(ctx)
      deps.updateCompositorOutput(ctx)
      return true
    elseif action == "seam_reset" then
      ctx._testSeams = { playback = {}, midiQueue = {} }
      ctx.pose = nil
      ctx._lastPoseFrameSeq = nil
      ctx._lastSegmentFrameSeq = nil
      return true
    elseif action == "seam_set_frame_info" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.frameInfo = { valid = bool01(a), sequence = U.round(b), width = U.round(c), height = U.round(d) }
      return true
    elseif action == "seam_set_webcam_open" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.webcamOpen = bool01(a)
      return true
    elseif action == "seam_set_clock" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.clock = { sampleRate = num(a), playTimeSamples = num(b), tempo = num(c) }
      return true
    elseif action == "seam_set_playback" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.playback = ctx._testSeams.playback or {}
      local kind = tostring(a or "poly")
      local index = U.round(b or 1)
      local key = kind == "slice" and deps.slicePaths[index] or deps.polyPaths[index]
      if key then ctx._testSeams.playback[key] = { playing = bool01(c), pos = num(d) } end
      return true
    elseif action == "seam_clear_playback" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      local kind = tostring(a or "all")
      if kind == "all" then
        ctx._testSeams.playback = {}
      else
        local paths = kind == "slice" and deps.slicePaths or deps.polyPaths
        for i = 1, #paths do ctx._testSeams.playback[paths[i]] = nil end
      end
      return true
    elseif action == "seam_queue_midi" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.midiQueue = ctx._testSeams.midiQueue or {}
      ctx._testSeams.midiQueue[#ctx._testSeams.midiQueue + 1] = { kind = tostring(a or "note_on"), data1 = U.round(b or 0), data2 = U.round(c or 0) }
      return #ctx._testSeams.midiQueue
    elseif action == "seam_set_pose_keypoint" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.poseKeypoints = ctx._testSeams.poseKeypoints or {}
      local idx = U.round(a or 1)
      ctx._testSeams.poseKeypoints[idx] = { x = num(b), y = num(c), conf = num(d) }
      ctx._testSeams.poseSequence = U.round((ctx._testSeams.poseSequence or 0) + 1)
      return true
    elseif action == "seam_set_pose_preset" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      local preset = tostring(a or "neutral")
      ctx._testSeams.poseKeypoints = {}
      for i = 1, 17 do ctx._testSeams.poseKeypoints[i] = { x = 0.5, y = 0.5, conf = 0.9 } end
      if preset == "hands_up" then
        ctx._testSeams.poseKeypoints[6] = { x = 0.42, y = 0.48, conf = 0.95 }
        ctx._testSeams.poseKeypoints[7] = { x = 0.58, y = 0.48, conf = 0.95 }
        ctx._testSeams.poseKeypoints[10] = { x = 0.35, y = 0.16, conf = 0.97 }
        ctx._testSeams.poseKeypoints[11] = { x = 0.65, y = 0.16, conf = 0.97 }
      elseif preset == "spread" then
        ctx._testSeams.poseKeypoints[6] = { x = 0.45, y = 0.45, conf = 0.95 }
        ctx._testSeams.poseKeypoints[7] = { x = 0.55, y = 0.45, conf = 0.95 }
        ctx._testSeams.poseKeypoints[10] = { x = 0.12, y = 0.42, conf = 0.98 }
        ctx._testSeams.poseKeypoints[11] = { x = 0.88, y = 0.42, conf = 0.98 }
      elseif preset == "left_reach" then
        ctx._testSeams.poseKeypoints[6] = { x = 0.45, y = 0.45, conf = 0.95 }
        ctx._testSeams.poseKeypoints[10] = { x = 0.08, y = 0.18, conf = 0.98 }
      end
      ctx._testSeams.poseSequence = U.round((ctx._testSeams.poseSequence or 0) + 1)
      return true
    elseif action == "seam_clear_pose" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.poseKeypoints = nil
      ctx._testSeams.poseSequence = U.round((ctx._testSeams.poseSequence or 0) + 1)
      ctx.pose = nil
      return true
    elseif action == "seam_set_capture_metrics" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.capture = {
        frameCount = U.round(a or 0),
        lockedWidth = U.round(b or 0),
        lockedHeight = U.round(c or 0),
        estimatedBytes = num(d),
        captureSeconds = num(U.readParam(C.NS .. "/capture_seconds", 4)),
      }
      return true
    elseif action == "seam_set_sampler_metrics" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.sampler = {
        frameCount = U.round(a or 0),
        durationSeconds = num(b),
        estimatedBytes = num(c),
        position = num(d),
      }
      return true
    elseif action == "seam_trigger_capture" then
      deps.doRetroCapture(ctx, a ~= nil and num(a) or nil)
      return ctx._lastVideoCommitOk == true
    elseif action == "midi_note_on" then
      Midi.triggerNote(ctx, U.round(a or 0), U.round(b or 0))
      return true
    elseif action == "midi_note_off" then
      Midi.releaseNote(ctx, U.round(a or 0))
      return true
    end
    return false
  end

  _G.__avsdSetPreset = function(preset)
    local p = tostring(preset or "deck")
    if p ~= "stage" and p ~= "inspector" then p = "deck" end
    deps.setLayoutPreset(ctx, p)
    return true
  end

  _G.__avsdProfile = function()
    local out = {}
    local p = ctx._profile
    if not p then return "no profile data" end
    local keys = {"updateShader","updateGridThumbnails","syncParamsFromHost","runPose","applyMapping","syncClipModel","ensureGridCells","pollMidi","bindInputSurfaces","colBuildCellPipeline","buildTapPipeline","applyCaptureWindow","segmentIngest","playbackUi","statusInterval"}
    for _, k in ipairs(keys) do
      local t = p[k]
      if t and t.count > 0 then
        table.insert(out, string.format("%-24s last=%8.0fus avg=%8.0fus max=%8.0fus count=%d", k, t.last, t.avg, t.max, t.count))
      end
    end
    return table.concat(out, "\n")
  end
end

function M.unregister(ctx)
  if _G.__avsdCtx == ctx then _G.__avsdCtx = nil end
  if _G.__avsdSetPreset then _G.__avsdSetPreset = nil end
  if _G.__avsdExportContract then _G.__avsdExportContract = nil end
  if _G.__avsdAction then _G.__avsdAction = nil end
  if _G.__avsdProfile then _G.__avsdProfile = nil end
end

return M
