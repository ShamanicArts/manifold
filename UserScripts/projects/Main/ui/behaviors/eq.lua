local EqBehavior = {}

local MIN_FREQ = 20.0
local MAX_FREQ = 20000.0
local MIN_GAIN = -24.0
local MAX_GAIN = 24.0
local MIN_Q = 0.1
local MAX_Q = 24.0
local LOG_MIN = math.log(MIN_FREQ)
local LOG_MAX = math.log(MAX_FREQ)
local NUM_BANDS = 8

-- Get actual sample rate from the engine, fallback to 48000
local function getSR()
  if type(_G.sampleRate) == "number" and _G.sampleRate > 0 then return _G.sampleRate end
  if type(_G.getParam) == "function" then
    local ok, sr = pcall(_G.getParam, "/core/sampleRate")
    if ok and type(sr) == "number" and sr > 0 then return sr end
  end
  return 48000.0
end
local POINT_RADIUS = 5
local HIT_RADIUS = 12

local BAND_TYPE = {
  Peak = 0,
  LowShelf = 1,
  HighShelf = 2,
  LowPass = 3,
  HighPass = 4,
  Notch = 5,
  BandPass = 6,
}

local TYPE_NAMES = {
  [BAND_TYPE.Peak] = "Bell",
  [BAND_TYPE.LowShelf] = "Low Shelf",
  [BAND_TYPE.HighShelf] = "High Shelf",
  [BAND_TYPE.LowPass] = "Low Pass",
  [BAND_TYPE.HighPass] = "High Pass",
  [BAND_TYPE.Notch] = "Notch",
  [BAND_TYPE.BandPass] = "Band Pass",
}

local DEFAULT_FREQS = { 60, 120, 250, 500, 1000, 2500, 6000, 12000 }
local DEFAULT_TYPES = {
  BAND_TYPE.LowShelf,
  BAND_TYPE.Peak,
  BAND_TYPE.Peak,
  BAND_TYPE.Peak,
  BAND_TYPE.Peak,
  BAND_TYPE.Peak,
  BAND_TYPE.Peak,
  BAND_TYPE.HighShelf,
}
local DEFAULT_QS = { 0.8, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.8 }

local BAND_COLORS = {
  0xfff87171,
  0xfffb923c,
  0xfffbbf24,
  0xff4ade80,
  0xff2dd4bf,
  0xff38bdf8,
  0xffa78bfa,
  0xfff472b6,
}

local GRID_COLOR = 0xff1a1a3a
local AXIS_COLOR = 0xff334155
local CURVE_COLOR = 0xff22d3ee
local CURVE_GLOW = 0x4422d3ee
local LABEL_COLOR = 0xff64748b

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v)
  return math.floor((tonumber(v) or 0) + 0.5)
end

local function readParam(path, fallback)
  if type(_G.getParam) == "function" then
    local ok, value = pcall(_G.getParam, path)
    if ok and value ~= nil then
      return value
    end
  end
  return fallback
end

local function writeParam(path, value)
  if type(_G.setParam) == "function" then
    return _G.setParam(path, tonumber(value) or 0)
  end
  if command then
    command("SET", path, tostring(value))
    return true
  end
  return false
end

local function setBounds(widget, x, y, w, h)
  x = math.floor(x)
  y = math.floor(y)
  w = math.max(1, math.floor(w))
  h = math.max(1, math.floor(h))
  if widget and widget.setBounds then
    widget:setBounds(x, y, w, h)
  elseif widget and widget.node and widget.node.setBounds then
    widget.node:setBounds(x, y, w, h)
  end
end

local function anchorDropdown(dropdown, root)
  if not dropdown or not dropdown.setAbsolutePos or not dropdown.node or not root or not root.node then return end
  local ax, ay = 0, 0
  local node = dropdown.node
  local depth = 0
  while node and depth < 20 do
    local bx, by = node:getBounds()
    ax = ax + (bx or 0)
    ay = ay + (by or 0)
    local ok, parent = pcall(function() return node:getParent() end)
    if ok and parent and parent ~= node then
      node = parent
    else
      break
    end
    depth = depth + 1
  end
  dropdown:setAbsolutePos(ax, ay)
end

local function bandEnabledPath(index)
  return string.format("/midi/synth/eq8/band/%d/enabled", index)
end

local function bandTypePath(index)
  return string.format("/midi/synth/eq8/band/%d/type", index)
end

local function bandFreqPath(index)
  return string.format("/midi/synth/eq8/band/%d/freq", index)
end

local function bandGainPath(index)
  return string.format("/midi/synth/eq8/band/%d/gain", index)
end

local function bandQPath(index)
  return string.format("/midi/synth/eq8/band/%d/q", index)
end

local function outputPath()
  return "/midi/synth/eq8/output"
end

local function mixPath()
  return "/midi/synth/eq8/mix"
end

local function freqToX(freq, w)
  local f = clamp(freq, MIN_FREQ, MAX_FREQ)
  return math.floor((math.log(f) - LOG_MIN) / (LOG_MAX - LOG_MIN) * w)
end

local function xToFreq(x, w)
  local norm = clamp(x / math.max(1, w), 0, 1)
  return math.exp(LOG_MIN + norm * (LOG_MAX - LOG_MIN))
end

local function gainToY(gain, h)
  local norm = (clamp(gain, MIN_GAIN, MAX_GAIN) - MIN_GAIN) / (MAX_GAIN - MIN_GAIN)
  return math.floor((1.0 - norm) * h)
end

local function yToGain(y, h)
  local norm = 1.0 - clamp(y / math.max(1, h), 0, 1)
  return MIN_GAIN + norm * (MAX_GAIN - MIN_GAIN)
end

local function qToY(q, h)
  local lmin = math.log(MIN_Q)
  local lmax = math.log(MAX_Q)
  local norm = (math.log(clamp(q, MIN_Q, MAX_Q)) - lmin) / (lmax - lmin)
  return math.floor((1.0 - norm) * h)
end

local function yToQ(y, h)
  local lmin = math.log(MIN_Q)
  local lmax = math.log(MAX_Q)
  local norm = 1.0 - clamp(y / math.max(1, h), 0, 1)
  return math.exp(lmin + norm * (lmax - lmin))
end

local function bandUsesGain(bandType)
  return bandType == BAND_TYPE.Peak or bandType == BAND_TYPE.LowShelf or bandType == BAND_TYPE.HighShelf
end

local function bandUsesQ(bandType)
  return bandType == BAND_TYPE.Peak or bandType == BAND_TYPE.Notch or bandType == BAND_TYPE.LowPass or bandType == BAND_TYPE.HighPass or bandType == BAND_TYPE.BandPass
end

local function makePeak(freq, q, gainDb)
  local A = 10 ^ (gainDb / 40.0)
  local w0 = 2.0 * math.pi * freq / getSR()
  local cosw0 = math.cos(w0)
  local alpha = math.sin(w0) / (2.0 * q)
  local b0 = 1.0 + alpha * A
  local b1 = -2.0 * cosw0
  local b2 = 1.0 - alpha * A
  local a0 = 1.0 + alpha / A
  local a1 = -2.0 * cosw0
  local a2 = 1.0 - alpha / A
  return { b0 = b0 / a0, b1 = b1 / a0, b2 = b2 / a0, a1 = a1 / a0, a2 = a2 / a0 }
end

local function makeLowShelf(freq, gainDb)
  local A = 10 ^ (gainDb / 40.0)
  local w0 = 2.0 * math.pi * freq / getSR()
  local cosw0 = math.cos(w0)
  local sinw0 = math.sin(w0)
  local alpha = sinw0 / 2.0 * math.sqrt(A)
  local b0 = A * ((A + 1.0) - (A - 1.0) * cosw0 + 2.0 * alpha)
  local b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cosw0)
  local b2 = A * ((A + 1.0) - (A - 1.0) * cosw0 - 2.0 * alpha)
  local a0 = (A + 1.0) + (A - 1.0) * cosw0 + 2.0 * alpha
  local a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cosw0)
  local a2 = (A + 1.0) + (A - 1.0) * cosw0 - 2.0 * alpha
  return { b0 = b0 / a0, b1 = b1 / a0, b2 = b2 / a0, a1 = a1 / a0, a2 = a2 / a0 }
end

local function makeHighShelf(freq, gainDb)
  local A = 10 ^ (gainDb / 40.0)
  local w0 = 2.0 * math.pi * freq / getSR()
  local cosw0 = math.cos(w0)
  local sinw0 = math.sin(w0)
  local alpha = sinw0 / 2.0 * math.sqrt(A)
  local b0 = A * ((A + 1.0) + (A - 1.0) * cosw0 + 2.0 * alpha)
  local b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosw0)
  local b2 = A * ((A + 1.0) + (A - 1.0) * cosw0 - 2.0 * alpha)
  local a0 = (A + 1.0) - (A - 1.0) * cosw0 + 2.0 * alpha
  local a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cosw0)
  local a2 = (A + 1.0) - (A - 1.0) * cosw0 - 2.0 * alpha
  return { b0 = b0 / a0, b1 = b1 / a0, b2 = b2 / a0, a1 = a1 / a0, a2 = a2 / a0 }
end

local function makeLowPass(freq, q)
  local w0 = 2.0 * math.pi * freq / getSR()
  local cosw0 = math.cos(w0)
  local alpha = math.sin(w0) / (2.0 * q)
  local b0 = (1.0 - cosw0) * 0.5
  local b1 = 1.0 - cosw0
  local b2 = (1.0 - cosw0) * 0.5
  local a0 = 1.0 + alpha
  local a1 = -2.0 * cosw0
  local a2 = 1.0 - alpha
  return { b0 = b0 / a0, b1 = b1 / a0, b2 = b2 / a0, a1 = a1 / a0, a2 = a2 / a0 }
end

local function makeHighPass(freq, q)
  local w0 = 2.0 * math.pi * freq / getSR()
  local cosw0 = math.cos(w0)
  local alpha = math.sin(w0) / (2.0 * q)
  local b0 = (1.0 + cosw0) * 0.5
  local b1 = -(1.0 + cosw0)
  local b2 = (1.0 + cosw0) * 0.5
  local a0 = 1.0 + alpha
  local a1 = -2.0 * cosw0
  local a2 = 1.0 - alpha
  return { b0 = b0 / a0, b1 = b1 / a0, b2 = b2 / a0, a1 = a1 / a0, a2 = a2 / a0 }
end

local function makeNotch(freq, q)
  local w0 = 2.0 * math.pi * freq / getSR()
  local cosw0 = math.cos(w0)
  local alpha = math.sin(w0) / (2.0 * q)
  local b0 = 1.0
  local b1 = -2.0 * cosw0
  local b2 = 1.0
  local a0 = 1.0 + alpha
  local a1 = -2.0 * cosw0
  local a2 = 1.0 - alpha
  return { b0 = b0 / a0, b1 = b1 / a0, b2 = b2 / a0, a1 = a1 / a0, a2 = a2 / a0 }
end

local function makeBandPass(freq, q)
  local w0 = 2.0 * math.pi * freq / getSR()
  local cosw0 = math.cos(w0)
  local alpha = math.sin(w0) / (2.0 * q)
  local b0 = alpha
  local b1 = 0.0
  local b2 = -alpha
  local a0 = 1.0 + alpha
  local a1 = -2.0 * cosw0
  local a2 = 1.0 - alpha
  return { b0 = b0 / a0, b1 = b1 / a0, b2 = b2 / a0, a1 = a1 / a0, a2 = a2 / a0 }
end

local function makeCoeffs(band)
  local freq = clamp(band.freq, MIN_FREQ, MAX_FREQ)
  local q = clamp(band.q, MIN_Q, MAX_Q)
  if band.type == BAND_TYPE.LowShelf then return makeLowShelf(freq, band.gain) end
  if band.type == BAND_TYPE.HighShelf then return makeHighShelf(freq, band.gain) end
  if band.type == BAND_TYPE.LowPass then return makeLowPass(freq, q) end
  if band.type == BAND_TYPE.HighPass then return makeHighPass(freq, q) end
  if band.type == BAND_TYPE.Notch then return makeNotch(freq, q) end
  if band.type == BAND_TYPE.BandPass then return makeBandPass(freq, q) end
  return makePeak(freq, q, band.gain)
end

local function magnitudeForCoeffs(coeffs, freq)
  local w = 2.0 * math.pi * freq / getSR()
  local cos1 = math.cos(w)
  local sin1 = math.sin(w)
  local cos2 = math.cos(2.0 * w)
  local sin2 = math.sin(2.0 * w)

  local nr = coeffs.b0 + coeffs.b1 * cos1 + coeffs.b2 * cos2
  local ni = -(coeffs.b1 * sin1 + coeffs.b2 * sin2)
  local dr = 1.0 + coeffs.a1 * cos1 + coeffs.a2 * cos2
  local di = -(coeffs.a1 * sin1 + coeffs.a2 * sin2)

  local num = math.sqrt(nr * nr + ni * ni)
  local den = math.sqrt(dr * dr + di * di)
  if den <= 1.0e-9 then return 1.0 end
  return num / den
end

local function syncBandInfo(ctx)
  local label = ctx.widgets and ctx.widgets.band_info
  if not label then return end

  if ctx.selectedBand and ctx.bands[ctx.selectedBand] and ctx.bands[ctx.selectedBand].enabled then
    local band = ctx.bands[ctx.selectedBand]
    local typeName = TYPE_NAMES[band.type] or "Bell"
    local parts = { string.format("Band %d", ctx.selectedBand), typeName, string.format("%d Hz", round(band.freq)) }
    if bandUsesGain(band.type) then
      local gainText = band.gain >= 0 and string.format("+%.1f dB", band.gain) or string.format("%.1f dB", band.gain)
      parts[#parts + 1] = gainText
    end
    if bandUsesQ(band.type) then
      parts[#parts + 1] = string.format("Q %.2f", band.q)
    end
    if label.setText then
      label:setText(table.concat(parts, " · "))
    end
    if label.setColour then
      label:setColour(BAND_COLORS[ctx.selectedBand])
    end
  else
    if label.setText then
      label:setText("Click graph to add · drag point to edit · wheel adjusts Q · double-click removes")
    end
    if label.setColour then
      label:setColour(LABEL_COLOR)
    end
  end
end

local function activeBandCount(ctx)
  local count = 0
  for i = 1, NUM_BANDS do
    if ctx.bands[i].enabled then count = count + 1 end
  end
  return count
end

local function buildDisplay(ctx, w, h)
  local display = {}

  -- Title inside graph (top-left)
  display[#display + 1] = {
    cmd = "drawText", x = 4, y = 2, w = w - 8, h = 16,
    text = "EQ", color = CURVE_COLOR, fontSize = 11, align = "left", valign = "top",
  }

  local freqMarks = { 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000 }
  for _, f in ipairs(freqMarks) do
    local x = freqToX(f, w)
    display[#display + 1] = { cmd = "drawLine", x1 = x, y1 = 0, x2 = x, y2 = h, thickness = 1, color = GRID_COLOR }
  end

  for _, db in ipairs({ -18, -12, -6, 0, 6, 12, 18 }) do
    local y = gainToY(db, h)
    display[#display + 1] = {
      cmd = "drawLine",
      x1 = 0, y1 = y, x2 = w, y2 = y,
      thickness = db == 0 and 1 or 1,
      color = db == 0 and AXIS_COLOR or GRID_COLOR,
    }
  end

  local outGainDb = readParam(outputPath(), 0.0)
  local lastX, lastY = nil, nil
  for x = 0, w - 1 do
    local freq = xToFreq(x, w)
    local mag = 1.0
    for i = 1, NUM_BANDS do
      local band = ctx.bands[i]
      if band.enabled then
        mag = mag * magnitudeForCoeffs(makeCoeffs(band), freq)
      end
    end
    local db = 20.0 * math.log(math.max(mag, 1.0e-9), 10) + outGainDb
    local y = gainToY(db, h)
    if lastX then
      display[#display + 1] = { cmd = "drawLine", x1 = lastX, y1 = lastY, x2 = x, y2 = y, thickness = 4, color = CURVE_GLOW }
      display[#display + 1] = { cmd = "drawLine", x1 = lastX, y1 = lastY, x2 = x, y2 = y, thickness = 2, color = CURVE_COLOR }
    end
    lastX, lastY = x, y
  end

  for i = 1, NUM_BANDS do
    local band = ctx.bands[i]
    if band.enabled then
      local x = freqToX(band.freq, w)
      local y = bandUsesGain(band.type) and gainToY(band.gain, h) or qToY(band.q, h)
      local selected = ctx.selectedBand == i
      local hover = ctx.hoverBand == i
      local pointR = selected and (POINT_RADIUS + 2) or POINT_RADIUS
      if selected or hover then
        local glowR = pointR + 5
        display[#display + 1] = {
          cmd = "fillRoundedRect",
          x = x - glowR,
          y = y - glowR,
          w = glowR * 2,
          h = glowR * 2,
          radius = glowR,
          color = selected and 0x44ffffff or 0x22ffffff,
        }
      end
      display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = x - pointR,
        y = y - pointR,
        w = pointR * 2,
        h = pointR * 2,
        radius = pointR,
        color = BAND_COLORS[i],
      }
      display[#display + 1] = {
        cmd = "drawRoundedRect",
        x = x - pointR,
        y = y - pointR,
        w = pointR * 2,
        h = pointR * 2,
        radius = pointR,
        thickness = selected and 2 or 1,
        color = selected and 0xffffffff or 0xff0f172a,
      }
      display[#display + 1] = {
        cmd = "drawText",
        x = x - pointR,
        y = y - pointR,
        w = pointR * 2,
        h = pointR * 2,
        text = tostring(i),
        color = 0xffffffff,
        fontSize = selected and 10 or 9,
        align = "center",
        valign = "middle",
      }
    end
  end

  return display
end

local function refreshGraph(ctx)
  local graph = ctx.widgets and ctx.widgets.eq_graph
  if not graph or not graph.node then return end
  local w = graph.node:getWidth()
  local h = graph.node:getHeight()
  if w <= 0 or h <= 0 then return end
  graph.node:setDisplayList(buildDisplay(ctx, w, h))
  graph.node:repaint()
end

local DROPDOWN_TYPES = { "Bell", "Low Shelf", "High Shelf", "Low Pass", "High Pass", "Notch" }

local function typeIndexFromBandType(bandType)
  if bandType == BAND_TYPE.Peak then return 1 end
  if bandType == BAND_TYPE.LowShelf then return 2 end
  if bandType == BAND_TYPE.HighShelf then return 3 end
  if bandType == BAND_TYPE.LowPass then return 4 end
  if bandType == BAND_TYPE.HighPass then return 5 end
  if bandType == BAND_TYPE.Notch then return 6 end
  return 1
end

local function bandTypeFromTypeIndex(index)
  if index == 1 then return BAND_TYPE.Peak end
  if index == 2 then return BAND_TYPE.LowShelf end
  if index == 3 then return BAND_TYPE.HighShelf end
  if index == 4 then return BAND_TYPE.LowPass end
  if index == 5 then return BAND_TYPE.HighPass end
  if index == 6 then return BAND_TYPE.Notch end
  return BAND_TYPE.Peak
end

local syncControlsToBand
local commitBand

local function updateControlsVisibility(ctx)
  local hasSelection = not not (ctx.selectedBand and ctx.bands[ctx.selectedBand] and ctx.bands[ctx.selectedBand].enabled)
  local band = hasSelection and ctx.bands[ctx.selectedBand] or nil
  local showGain = band and bandUsesGain(band.type)
  local showQ = band and bandUsesQ(band.type)

  local controls = {
    ctx.widgets.type_label,
    ctx.widgets.type_selector,
    ctx.widgets.freq_value,
  }

  for _, widget in ipairs(controls) do
    if widget and widget.node and widget.node.setVisible then
      widget.node:setVisible(hasSelection)
    end
  end

  if ctx.widgets.gain_value and ctx.widgets.gain_value.node and ctx.widgets.gain_value.node.setVisible then
    ctx.widgets.gain_value.node:setVisible(hasSelection and showGain)
  end
  if ctx.widgets.q_value and ctx.widgets.q_value.node and ctx.widgets.q_value.node.setVisible then
    ctx.widgets.q_value.node:setVisible(hasSelection and showQ)
  end

  if hasSelection then
    syncControlsToBand(ctx)
  end
end

local function setupTypeSelector(ctx)
  local selector = ctx.widgets and ctx.widgets.type_selector
  if not selector then return end
  selector._onSelect = function(idx)
    ctx.insertType = bandTypeFromTypeIndex(idx)
    if ctx.selectedBand and ctx.bands[ctx.selectedBand] and ctx.bands[ctx.selectedBand].enabled then
      ctx.bands[ctx.selectedBand].type = ctx.insertType
      commitBand(ctx, ctx.selectedBand)
      syncControlsToBand(ctx)
      updateControlsVisibility(ctx)
      syncBandInfo(ctx)
      refreshGraph(ctx)
    end
  end
end

local function setupNumberBoxes(ctx)
  local freqBox = ctx.widgets and ctx.widgets.freq_value
  local gainBox = ctx.widgets and ctx.widgets.gain_value
  local qBox = ctx.widgets and ctx.widgets.q_value

  if freqBox then
    freqBox._onChange = function(value)
      if ctx.selectedBand and ctx.bands[ctx.selectedBand] and ctx.bands[ctx.selectedBand].enabled then
        ctx.bands[ctx.selectedBand].freq = clamp(value, MIN_FREQ, MAX_FREQ)
        commitBand(ctx, ctx.selectedBand)
        syncControlsToBand(ctx)
        syncBandInfo(ctx)
        refreshGraph(ctx)
      end
    end
  end

  if gainBox then
    gainBox._onChange = function(value)
      if ctx.selectedBand and ctx.bands[ctx.selectedBand] and ctx.bands[ctx.selectedBand].enabled then
        ctx.bands[ctx.selectedBand].gain = clamp(value, MIN_GAIN, MAX_GAIN)
        commitBand(ctx, ctx.selectedBand)
        syncControlsToBand(ctx)
        syncBandInfo(ctx)
        refreshGraph(ctx)
      end
    end
  end

  if qBox then
    qBox._onChange = function(value)
      if ctx.selectedBand and ctx.bands[ctx.selectedBand] and ctx.bands[ctx.selectedBand].enabled then
        ctx.bands[ctx.selectedBand].q = clamp(value, MIN_Q, MAX_Q)
        commitBand(ctx, ctx.selectedBand)
        syncControlsToBand(ctx)
        syncBandInfo(ctx)
        refreshGraph(ctx)
      end
    end
  end
end

syncControlsToBand = function(ctx)
  if not ctx.selectedBand or not ctx.bands[ctx.selectedBand] or not ctx.bands[ctx.selectedBand].enabled then
    return
  end
  local band = ctx.bands[ctx.selectedBand]
  ctx.insertType = band.type

  local selector = ctx.widgets and ctx.widgets.type_selector
  if selector and selector.setSelected then
    selector:setSelected(typeIndexFromBandType(band.type))
  end

  local freqBox = ctx.widgets and ctx.widgets.freq_value
  local gainBox = ctx.widgets and ctx.widgets.gain_value
  local qBox = ctx.widgets and ctx.widgets.q_value

  if freqBox and freqBox.setValue then
    freqBox:setValue(band.freq)
  end
  if gainBox and gainBox.setValue then
    gainBox:setValue(band.gain)
  end
  if qBox and qBox.setValue then
    qBox:setValue(band.q)
  end
end

local function syncFromParams(ctx)
  local changed = false
  for i = 1, NUM_BANDS do
    local band = ctx.bands[i]
    local enabledRaw = readParam(bandEnabledPath(i), 0)
    local typeRaw = readParam(bandTypePath(i), DEFAULT_TYPES[i])
    local freqRaw = readParam(bandFreqPath(i), DEFAULT_FREQS[i])
    local gainRaw = readParam(bandGainPath(i), 0.0)
    local qRaw = readParam(bandQPath(i), DEFAULT_QS[i])
    local enabled = (enabledRaw or 0) > 0.5
    local bandType = round(typeRaw)
    local freq = clamp(freqRaw, MIN_FREQ, MAX_FREQ)
    local gain = clamp(gainRaw, MIN_GAIN, MAX_GAIN)
    local q = clamp(qRaw, MIN_Q, MAX_Q)
    if band.enabled ~= enabled or band.type ~= bandType or math.abs(band.freq - freq) > 0.01 or math.abs(band.gain - gain) > 0.01 or math.abs(band.q - q) > 0.001 then
      band.enabled = enabled
      band.type = bandType
      band.freq = freq
      band.gain = gain
      band.q = q
      changed = true
    end
  end
  return changed
end

commitBand = function(ctx, index)
  local band = ctx.bands[index]
  writeParam(bandEnabledPath(index), band.enabled and 1 or 0)
  writeParam(bandTypePath(index), band.type)
  writeParam(bandFreqPath(index), band.freq)
  writeParam(bandGainPath(index), band.gain)
  writeParam(bandQPath(index), band.q)
end

local function graphPointForBand(band, w, h)
  local y = bandUsesGain(band.type) and gainToY(band.gain, h) or qToY(band.q, h)
  return freqToX(band.freq, w), y
end

local function hitTestBand(ctx, mx, my)
  local graph = ctx.widgets and ctx.widgets.eq_graph
  if not graph or not graph.node then return nil end
  local w = graph.node:getWidth()
  local h = graph.node:getHeight()
  if w <= 0 or h <= 0 then return nil end

  local bestIdx = nil
  local bestDist = HIT_RADIUS * HIT_RADIUS
  for i = 1, NUM_BANDS do
    local band = ctx.bands[i]
    if band.enabled then
      local px, py = graphPointForBand(band, w, h)
      local dx = mx - px
      local dy = my - py
      local d2 = dx * dx + dy * dy
      if d2 <= bestDist then
        bestDist = d2
        bestIdx = i
      end
    end
  end
  return bestIdx
end

local function firstFreeBand(ctx)
  for i = 1, NUM_BANDS do
    if not ctx.bands[i].enabled then return i end
  end
  return nil
end

local function updateBandFromPosition(ctx, index, mx, my)
  local graph = ctx.widgets and ctx.widgets.eq_graph
  if not graph or not graph.node then return end
  local w = graph.node:getWidth()
  local h = graph.node:getHeight()
  if w <= 0 or h <= 0 then return end
  local band = ctx.bands[index]
  band.freq = clamp(xToFreq(mx, w), MIN_FREQ, MAX_FREQ)
  if bandUsesGain(band.type) then
    band.gain = clamp(yToGain(my, h), MIN_GAIN, MAX_GAIN)
  elseif bandUsesQ(band.type) then
    band.q = clamp(yToQ(my, h), MIN_Q, MAX_Q)
  end
  commitBand(ctx, index)
  syncControlsToBand(ctx)
  updateControlsVisibility(ctx)
  syncBandInfo(ctx)
  refreshGraph(ctx)
end

local function setupGraphInteraction(ctx)
  local graph = ctx.widgets and ctx.widgets.eq_graph
  if not graph or not graph.node then return end

  if graph.node.setInterceptsMouse then
    graph.node:setInterceptsMouse(true, true)
  end

  if graph.node.setOnMouseDown then
    graph.node:setOnMouseDown(function(mx, my)
      local hit = hitTestBand(ctx, mx, my)
      if hit then
        ctx.selectedBand = hit
        ctx.insertType = ctx.bands[hit].type
        ctx.dragging = true
        updateControlsVisibility(ctx)
        updateBandFromPosition(ctx, hit, mx, my)
      else
        local free = firstFreeBand(ctx)
        if free then
          local band = ctx.bands[free]
          band.enabled = true
          band.type = ctx.insertType or BAND_TYPE.Peak
          band.q = 1.0
          ctx.selectedBand = free
          ctx.dragging = true
          updateControlsVisibility(ctx)
          updateBandFromPosition(ctx, free, mx, my)
        else
          ctx.selectedBand = nil
          updateControlsVisibility(ctx)
          syncBandInfo(ctx)
          refreshGraph(ctx)
        end
      end
    end)
  end

  if graph.node.setOnMouseDrag then
    graph.node:setOnMouseDrag(function(mx, my)
      if ctx.dragging and ctx.selectedBand then
        updateBandFromPosition(ctx, ctx.selectedBand, mx, my)
      end
    end)
  end

  if graph.node.setOnMouseUp then
    graph.node:setOnMouseUp(function()
      ctx.dragging = false
    end)
  end

  if graph.node.setOnMouseWheel then
    graph.node:setOnMouseWheel(function(mx, my, deltaY)
      local hit = hitTestBand(ctx, mx, my) or ctx.selectedBand
      if not hit then return end
      local band = ctx.bands[hit]
      if not band or not band.enabled then return end
      ctx.selectedBand = hit
      local step = deltaY > 0 and 0.1 or -0.1
      band.q = clamp(band.q + step, MIN_Q, MAX_Q)
      commitBand(ctx, hit)
      syncControlsToBand(ctx)
      syncBandInfo(ctx)
      refreshGraph(ctx)
    end)
  end

  if graph.node.setOnDoubleClick then
    graph.node:setOnDoubleClick(function()
      if ctx.selectedBand and ctx.bands[ctx.selectedBand] and ctx.bands[ctx.selectedBand].enabled then
        ctx.bands[ctx.selectedBand].enabled = false
        commitBand(ctx, ctx.selectedBand)
        ctx.selectedBand = nil
        updateControlsVisibility(ctx)
        syncBandInfo(ctx)
        refreshGraph(ctx)
      end
    end)
  end
end

function EqBehavior.init(ctx)
  ctx.bands = {}
  for i = 1, NUM_BANDS do
    ctx.bands[i] = {
      enabled = false,
      type = DEFAULT_TYPES[i],
      freq = DEFAULT_FREQS[i],
      gain = 0.0,
      q = DEFAULT_QS[i],
    }
  end
  ctx.selectedBand = nil
  ctx.hoverBand = nil
  ctx.dragging = false
  ctx.insertType = BAND_TYPE.Peak
  ctx._lastSyncTime = 0

  syncFromParams(ctx)
  setupGraphInteraction(ctx)
  setupTypeSelector(ctx)
  setupNumberBoxes(ctx)
  updateControlsVisibility(ctx)
  syncBandInfo(ctx)
  refreshGraph(ctx)
end

function EqBehavior.resized(ctx, w, h)
  if (not w or w <= 0) and ctx.root and ctx.root.node then
    w = ctx.root.node:getWidth()
    h = ctx.root.node:getHeight()
  end
  if not w or w <= 0 then return end

  local widgets = ctx.widgets or {}
  local pad = 10
  local rowH = 22
  local boxH = 24
  local gap = 4

  -- EQ graph at top (title drawn inside, no helper text)
  local controlsY = h - pad - boxH
  local typeY = controlsY - rowH - gap
  local graphH = math.max(40, typeY - pad - 6)
  setBounds(widgets.eq_graph, pad, pad, w - pad * 2, graphH)

  setBounds(widgets.type_label, pad, typeY + 2, 38, 18)
  setBounds(widgets.type_selector, pad + 40, typeY, 112, rowH)
  anchorDropdown(widgets.type_selector, ctx.root)

  local boxGap = 4
  local boxW = math.floor((w - pad * 2 - boxGap * 2) / 3)
  setBounds(widgets.freq_value, pad, controlsY, boxW, boxH)
  setBounds(widgets.gain_value, pad + boxW + boxGap, controlsY, boxW, boxH)
  setBounds(widgets.q_value, pad + (boxW + boxGap) * 2, controlsY, boxW, boxH)

  updateControlsVisibility(ctx)
  syncBandInfo(ctx)
  refreshGraph(ctx)
end

function EqBehavior.update(ctx)
  local now = getTime and getTime() or 0
  if now == 0 or now - (ctx._lastSyncTime or 0) >= 0.12 then
    ctx._lastSyncTime = now
    if syncFromParams(ctx) then
      if ctx.selectedBand and not ctx.bands[ctx.selectedBand].enabled then
        ctx.selectedBand = nil
      end
      updateControlsVisibility(ctx)
      syncBandInfo(ctx)
      refreshGraph(ctx)
    end
  end
end

function EqBehavior.repaint(ctx)
  syncBandInfo(ctx)
  refreshGraph(ctx)
end

return EqBehavior
