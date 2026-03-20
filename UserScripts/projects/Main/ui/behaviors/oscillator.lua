-- Oscillator component behavior - waveform preview + voice playthrough
local OscBehavior = {}

local WAVEFORM_COLORS = {
  [0] = 0xff7dd3fc,  -- sine
  [1] = 0xff38bdf8,  -- saw
  [2] = 0xff22d3ee,  -- square
  [3] = 0xff2dd4bf,  -- triangle
  [4] = 0xffa78bfa,  -- blend
  [5] = 0xff94a3b8,  -- noise (gray)
  [6] = 0xfff472b6,  -- pulse (pink)
  [7] = 0xfffbbf24,  -- supersaw (amber)
}

local VOICE_COLORS = {
  0xff4ade80, 0xff38bdf8, 0xfffbbf24, 0xfff87171,
  0xffa78bfa, 0xff2dd4bf, 0xfffb923c, 0xfff472b6,
}

local function waveformSample(waveType, phase)
  local p = phase % 1.0
  if waveType == 0 then
    return math.sin(p * 2 * math.pi)
  elseif waveType == 1 then
    return 2 * p - 1
  elseif waveType == 2 then
    return p < 0.5 and 1 or -1
  elseif waveType == 3 then
    return p < 0.5 and (4 * p - 1) or (3 - 4 * p)
  elseif waveType == 4 then
    return ((2 * p - 1) + math.sin(p * 2 * math.pi)) * 0.5
  elseif waveType == 5 then
    -- Noise: return random-ish value based on phase (deterministic for preview)
    local pseudoRandom = math.sin(p * 43758.5453) % 1.0
    return (pseudoRandom * 2 - 1) * 0.5
  elseif waveType == 6 then
    -- Pulse: default 25% width (narrow pulse)
    return p < 0.25 and 1 or -1
  elseif waveType == 7 then
    -- SuperSaw: 3 detuned saws
    local s1 = 2 * p - 1
    local s2 = 2 * ((p * 1.01) % 1.0) - 1
    local s3 = 2 * ((p * 0.99) % 1.0) - 1
    return (s1 + s2 * 0.5 + s3 * 0.5) * 0.5
  end
  return 0
end

local function softClip(s, drive)
  s = s * drive
  if s > 1 then return 1 - 1 / (1 + s)
  elseif s < -1 then return -1 + 1 / (1 - s) end
  return s
end

local SAMPLE_COLOR = 0xff22d3ee
local SAMPLE_DIM = 0x6022d3ee

local function buildSampleWaveform(ctx, w, h, display)
  -- Reserve bottom space for 2 bars:
  -- 1) play start
  -- 2) loop start + loop end + crossfade visualization
  local barH = 16
  local barGap = 4
  local barsHeight = barH * 2 + barGap
  local waveH = h - barsHeight - 4  -- waveform area above bars

  local centerY = waveH / 2
  local maxAmp = (waveH / 2) * 0.75
  local numPoints = math.max(48, math.min(w, 200))
  local loopStart = ctx.sampleLoopStart or 0.0
  local loopLen = ctx.sampleLoopLen or 1.0

  local peaks = ctx._cachedPeaks
  if not peaks and type(getSynthSamplePeaks) == "function" then
    peaks = getSynthSamplePeaks(numPoints)
    if peaks and #peaks > 0 then
      ctx._cachedPeaks = peaks
    end
  end

  -- Waveform background (only in wave area)
  display[#display + 1] = {
    cmd = "fillRect", x = 0, y = 0, w = w, h = waveH,
    color = 0x20ffffff,
  }

  if peaks and #peaks > 0 then
    local prevX, prevY
    for i = 0, numPoints do
      local t = i / numPoints
      local peakIdx = math.floor(t * (#peaks - 1)) + 1
      local peak = peaks[peakIdx] or 0
      local s = peak * 2 - 1

      local x = math.floor(t * w)
      local y = math.floor(centerY - s * maxAmp)
      if prevX then
        display[#display + 1] = {
          cmd = "drawLine", x1 = prevX, y1 = prevY, x2 = x, y2 = y,
          thickness = 1, color = SAMPLE_COLOR,
        }
      end
      prevX, prevY = x, y
    end

    local samplePositions = {}
    if type(getVoiceSamplePositions) == "function" then
      samplePositions = getVoiceSamplePositions() or {}
    end

    local voiceLoops = ctx.voiceLoops or {}
    local activeVoices = ctx.activeVoices or {}
    local voiceLookup = {}
    for _, v in ipairs(activeVoices) do
      local idx = v.voiceIndex
      if idx then voiceLookup[idx] = v end
    end

    for voiceIndex = 1, 8 do
      local voice = voiceLookup[voiceIndex]
      if not voice then goto continue end

      local vcol = VOICE_COLORS[voiceIndex]
      local pos = samplePositions[voiceIndex] or 0

      -- NOTE: pos from getVoiceSamplePositions() is ALREADY ABSOLUTE (0-1 across full sample).
      local handleCenterOffset = math.floor(8 / 2)
      local playheadX = math.floor(pos * w) - handleCenterOffset

      local waveY = centerY
      if peaks and #peaks > 0 then
        local peakIdx = math.floor(pos * (#peaks - 1)) + 1
        local peak = peaks[peakIdx] or 0.5
        local s = peak * 2 - 1
        waveY = math.floor(centerY - s * maxAmp)
      end

      -- Playhead line stops at waveform bottom
      display[#display + 1] = {
        cmd = "drawLine", x1 = playheadX, y1 = waveH - 2, x2 = playheadX, y2 = waveY,
        thickness = 3, color = vcol,
      }
      ::continue::
    end
  end

  -- 2 HANDLE BARS - simple square handles, no labels
  local handleW = 8
  local handleH = barH - 4
  local playStart = ctx.samplePlayStart or 0.0
  local loopStartPos = loopStart
  local loopEndPos = loopStart + loopLen
  local xfadeNorm = math.max(0.0, math.min(0.5, ctx.sampleCrossfade or 0.1))

  local function drawBarBackground(y)
    display[#display + 1] = {
      cmd = "fillRect", x = 0, y = y, w = w, h = barH,
      color = 0xff0d1420,
    }
    display[#display + 1] = {
      cmd = "drawLine", x1 = 0, y1 = y + barH, x2 = w, y2 = y + barH,
      thickness = 1, color = 0xff334155,
    }
  end

  local function drawHandle(y, pos, color)
    local hx = math.floor(pos * w) - math.floor(handleW / 2)
    local hy = y + 2
    display[#display + 1] = {
      cmd = "fillRect", x = hx, y = hy, w = handleW, h = handleH,
      color = color,
    }
    display[#display + 1] = {
      cmd = "drawRect", x = hx, y = hy, w = handleW, h = handleH,
      thickness = 1, color = 0xffffffff,
    }
  end

  -- Bar 1: Play Start (yellow)
  local bar1Y = waveH + 2
  drawBarBackground(bar1Y)
  drawHandle(bar1Y, playStart, 0xffe5e509)

  -- Bar 2: Loop Start + Loop End + explicit crossfade mapping
  local bar2Y = bar1Y + barH + barGap
  drawBarBackground(bar2Y)

  -- Main loop span guide
  display[#display + 1] = {
    cmd = "drawLine",
    x1 = math.floor(loopStartPos * w), y1 = bar2Y + math.floor(barH / 2),
    x2 = math.floor(loopEndPos * w), y2 = bar2Y + math.floor(barH / 2),
    thickness = 2, color = 0x80cbd5e1,
  }

  local xfadeLen = xfadeNorm * loopLen
  local xfadeStart = math.max(loopStartPos, loopEndPos - xfadeLen)
  local headXfadeEnd = math.min(loopEndPos, loopStartPos + xfadeLen)
  if xfadeLen > 0.0001 then
    -- Head fade-in window near loop start
    display[#display + 1] = {
      cmd = "fillRect",
      x = math.floor(loopStartPos * w),
      y = bar2Y + 2,
      w = math.max(1, math.floor(headXfadeEnd * w) - math.floor(loopStartPos * w)),
      h = barH - 4,
      color = 0x504ade80,
    }

    -- Tail fade-out window near loop end
    display[#display + 1] = {
      cmd = "fillRect",
      x = math.floor(xfadeStart * w),
      y = bar2Y + 2,
      w = math.max(1, math.floor(loopEndPos * w) - math.floor(xfadeStart * w)),
      h = barH - 4,
      color = 0x50f87171,
    }

    -- Explicit seam mapping: head window crossfades into tail window
    local seamLines = 6
    for i = 0, seamLines do
      local t = i / seamLines
      local srcX = math.floor((loopStartPos + xfadeLen * t) * w)
      local dstX = math.floor((xfadeStart + xfadeLen * t) * w)
      display[#display + 1] = {
        cmd = "drawLine",
        x1 = srcX, y1 = bar2Y + 3,
        x2 = dstX, y2 = bar2Y + barH - 3,
        thickness = 1, color = 0xa0f472b6,
      }
    end
  end

  drawHandle(bar2Y, loopStartPos, 0xff4ade80)
  drawHandle(bar2Y, loopEndPos, 0xfff87171)

  -- "No sample" message if no peaks
  if not peaks or #peaks == 0 then
    display[#display + 1] = {
      cmd = "drawText", x = 0, y = math.floor(waveH / 2) - 8, w = w, h = 16,
      text = "No sample captured", color = 0xff94a3b8, fontSize = 11, align = "center", valign = "middle",
    }
  end

  display[#display + 1] = {
    cmd = "drawText", x = 4, y = 2, w = w - 8, h = 16,
    text = "SAMPLE MODE", color = 0xffa78bfa, fontSize = 10, align = "left", valign = "top",
  }

  return display
end

local function sampleAtPeaks(peaks, t)
  if type(peaks) ~= "table" or #peaks == 0 then
    return 0.0
  end
  local idx = math.floor(math.max(0, math.min(1, t)) * (#peaks - 1)) + 1
  local peak = peaks[idx] or 0.5
  return peak * 2.0 - 1.0
end

local function xorBlendSample(a, b, crush)
  local bits = math.max(2, math.floor(16 - crush * 14 + 0.5))
  local levels = 2 ^ (bits - 1)
  local qa = math.floor((math.max(-1, math.min(1, a)) * levels) + 128)
  local qb = math.floor((math.max(-1, math.min(1, b)) * levels) + 128)
  local xv = bit32 and bit32.bxor(qa, qb) or ((qa + qb) % 256)
  return (xv / 127.5) - 1.0
end

local function buildBlendDisplay(ctx, w, h, display)
  local waveType = ctx.waveformType or 1
  local drive = math.max(0.1, ctx.driveAmount or 1.8)
  local blendMode = ctx.blendMode or 0
  local blendAmount = math.max(0.0, math.min(1.0, ctx.blendAmount or 0.5))
  local waveToSample = math.max(0.0, math.min(1.0, ctx.waveToSample or 0.5))
  local sampleToWave = math.max(0.0, math.min(1.0, ctx.sampleToWave or 0.0))
  local blendModAmount = math.max(0.0, math.min(1.0, ctx.blendModAmount or 0.5))
  local samplePitch = ctx.blendSamplePitch or 0.0
  local voices = ctx.activeVoices or {}
  local time = ctx.animTime or 0
  local peaks = ctx._cachedPeaks
  local numPoints = math.max(64, math.min(w, tonumber(ctx.maxPoints) or 200))
  local centerY = h / 2
  local maxAmp = (h / 2) * 0.82
  local modeNames = { [0] = "MIX", [1] = "RING", [2] = "FM", [3] = "SYNC", [4] = "XOR" }
  local modeColors = { [0] = 0xffa78bfa, [1] = 0xff22d3ee, [2] = 0xfff472b6, [3] = 0xff4ade80, [4] = 0xfffbbf24 }

  -- Background grid (like Wave mode)
  for i = 1, 3 do
    display[#display + 1] = {
      cmd = "drawLine", x1 = 0, y1 = math.floor(h * i / 4), x2 = w, y2 = math.floor(h * i / 4),
      thickness = 1, color = 0xff1a1a3a,
    }
  end
  display[#display + 1] = {
    cmd = "drawLine", x1 = 0, y1 = math.floor(h / 2), x2 = w, y2 = math.floor(h / 2),
    thickness = 1, color = 0xff1f2b4d,
  }

  if not peaks and type(getSynthSamplePeaks) == "function" then
    peaks = getSynthSamplePeaks(numPoints)
    if peaks and #peaks > 0 then
      ctx._cachedPeaks = peaks
    end
  end

  local hasSample = peaks and #peaks > 0
  local waveCol = WAVEFORM_COLORS[waveType] or 0xff7dd3fc
  local sampleCol = 0xff22d3ee
  local resultCol = modeColors[blendMode] or 0xffa78bfa

  -- Draw source waveforms dimmed in background
  local prevWaveX, prevWaveY
  local prevSampleX, prevSampleY

  for i = 0, numPoints do
    local t = i / numPoints
    local wave = softClip(waveformSample(waveType, t * 2.0), drive)
    local sampleT = t * (2.0 ^ (samplePitch / 12.0))
    local sample = hasSample and sampleAtPeaks(peaks, sampleT % 1.0) or 0

    local x = math.floor(t * w)
    local waveY = math.floor(centerY - wave * maxAmp * 0.5)
    local sampleY = math.floor(centerY - sample * maxAmp * 0.5)

    if prevWaveX then
      -- Dimmed wave and sample in background
      display[#display + 1] = {
        cmd = "drawLine", x1 = prevWaveX, y1 = prevWaveY, x2 = x, y2 = waveY,
        thickness = 1, color = (waveCol & 0x00ffffff) | 0x30000000,
      }
      if hasSample then
        display[#display + 1] = {
          cmd = "drawLine", x1 = prevSampleX, y1 = prevSampleY, x2 = x, y2 = sampleY,
          thickness = 1, color = (sampleCol & 0x00ffffff) | 0x30000000,
        }
      end
    end

    prevWaveX, prevWaveY = x, waveY
    prevSampleX, prevSampleY = x, sampleY
  end

  -- Animated result waveform (main focus)
  if #voices > 0 then
    for vi, voice in ipairs(voices) do
      local vcol = VOICE_COLORS[((vi - 1) % #VOICE_COLORS) + 1]
      local freq = voice.freq or 220
      local amp = voice.amp or 0
      if amp < 0.001 then goto continue end

      local cyclesInView = 2
      local phaseOffset = time * freq
      local vPrevX, vPrevY

      for i = 0, numPoints do
        local t = i / numPoints
        local phase = phaseOffset + t * cyclesInView
        local wave = softClip(waveformSample(waveType, phase), drive)
        local sampleT = t * (2.0 ^ (samplePitch / 12.0))
        local sample = hasSample and sampleAtPeaks(peaks, sampleT % 1.0) or 0

        local result = 0.0
        if blendMode == 0 then
          result = wave * (1.0 - blendAmount) + sample * blendAmount
        elseif blendMode == 1 then
          local ring = wave * sample
          result = (wave * (1.0 - blendAmount)) + (ring * blendAmount * math.max(0.2, blendModAmount))
        elseif blendMode == 2 then
          local fmSample = hasSample and sampleAtPeaks(peaks, (sampleT + wave * waveToSample * blendModAmount * 0.12) % 1.0) or 0
          result = wave * (1.0 - blendAmount) + fmSample * blendAmount + sample * sampleToWave * 0.15
        elseif blendMode == 3 then
          local syncT = ((t * (1.0 + waveToSample * 3.0)) % 1.0)
          local syncSample = hasSample and sampleAtPeaks(peaks, syncT) or 0
          result = wave * (1.0 - blendAmount) + syncSample * blendAmount
        else
          local x = xorBlendSample(wave, sample, math.max(waveToSample, blendModAmount))
          result = wave * (1.0 - blendAmount) + x * blendAmount
        end

        result = result * (amp / 0.5)
        local x = math.floor(t * w)
        local y = math.floor(centerY - result * maxAmp)

        if vPrevX then
          display[#display + 1] = {
            cmd = "drawLine", x1 = vPrevX, y1 = vPrevY, x2 = x, y2 = y,
            thickness = 2, color = vcol,
          }
        end
        vPrevX, vPrevY = x, y
      end
      ::continue::
    end
  else
    -- Static result preview when no voices active
    local prevResultX, prevResultY
    for i = 0, numPoints do
      local t = i / numPoints
      local wave = softClip(waveformSample(waveType, t * 2.0), drive)
      local sampleT = t * (2.0 ^ (samplePitch / 12.0))
      local sample = hasSample and sampleAtPeaks(peaks, sampleT % 1.0) or 0

      local result = 0.0
      if blendMode == 0 then
        result = wave * (1.0 - blendAmount) + sample * blendAmount
      elseif blendMode == 1 then
        local ring = wave * sample
        result = (wave * (1.0 - blendAmount)) + (ring * blendAmount * math.max(0.2, blendModAmount))
      elseif blendMode == 2 then
        local fmSample = hasSample and sampleAtPeaks(peaks, (sampleT + wave * waveToSample * blendModAmount * 0.12) % 1.0) or 0
        result = wave * (1.0 - blendAmount) + fmSample * blendAmount
      elseif blendMode == 3 then
        local syncT = ((t * (1.0 + waveToSample * 3.0)) % 1.0)
        local syncSample = hasSample and sampleAtPeaks(peaks, syncT) or 0
        result = wave * (1.0 - blendAmount) + syncSample * blendAmount
      else
        local x = xorBlendSample(wave, sample, math.max(waveToSample, blendModAmount))
        result = wave * (1.0 - blendAmount) + x * blendAmount
      end

      local x = math.floor(t * w)
      local y = math.floor(centerY - result * maxAmp)

      if prevResultX then
        display[#display + 1] = {
          cmd = "drawLine", x1 = prevResultX, y1 = prevResultY, x2 = x, y2 = y,
          thickness = 2, color = resultCol,
        }
      end
      prevResultX, prevResultY = x, y
    end
  end

  -- Mode indicator bar at bottom
  local modeName = modeNames[blendMode] or "MIX"
  local barWidth = math.floor(w * blendAmount)
  display[#display + 1] = {
    cmd = "fillRect", x = 0, y = h - 4, w = barWidth, h = 4,
    color = resultCol,
  }
  display[#display + 1] = {
    cmd = "drawRect", x = 0, y = h - 4, w = w, h = 4,
    thickness = 1, color = 0xff334155,
  }

  -- Clean mode label
  display[#display + 1] = {
    cmd = "drawText", x = 4, y = 2, w = w - 8, h = 16,
    text = modeName .. " MODE",
    color = resultCol, fontSize = 11, align = "left", valign = "top",
  }

  -- Sample status
  if not hasSample then
    display[#display + 1] = {
      cmd = "drawText", x = 0, y = h - 22, w = w, h = 16,
      text = "No sample - capture in Sample tab", color = 0xff64748b, fontSize = 9, align = "center", valign = "middle",
    }
  end

  return display
end

local function buildOscDisplay(ctx, w, h)
  local display = {}
  local waveType = ctx.waveformType or 1
  local drive = math.max(0.1, ctx.driveAmount or 1.8)
  local voices = ctx.activeVoices or {}
  local time = ctx.animTime or 0
  local oscMode = ctx.oscMode or 0

  for i = 1, 3 do
    display[#display + 1] = {
      cmd = "drawLine", x1 = 0, y1 = math.floor(h * i / 4), x2 = w, y2 = math.floor(h * i / 4),
      thickness = 1, color = 0xff1a1a3a,
    }
  end
  display[#display + 1] = {
    cmd = "drawLine", x1 = 0, y1 = math.floor(h / 2), x2 = w, y2 = math.floor(h / 2),
    thickness = 1, color = 0xff1f2b4d,
  }

  if oscMode == 1 then
    return buildSampleWaveform(ctx, w, h, display)
  elseif oscMode == 2 then
    return buildBlendDisplay(ctx, w, h, display)
  end

  -- Wave mode title (top-left like Sample/Blend)
  local waveNames = { [0] = "SINE", [1] = "SAW", [2] = "SQUARE", [3] = "TRIANGLE", [4] = "BLEND", [5] = "NOISE", [6] = "PULSE", [7] = "SUPERSAW" }
  local waveName = waveNames[waveType] or "WAVE"
  local col = WAVEFORM_COLORS[waveType] or 0xff7dd3fc
  display[#display + 1] = {
    cmd = "drawText", x = 4, y = 2, w = w - 8, h = 16,
    text = waveName .. " MODE", color = col, fontSize = 11, align = "left", valign = "top",
  }
  local colDim = (0x40 << 24) | (col & 0x00ffffff)
  local centerY = h / 2
  local maxAmp = (h / 2) * 0.85
  local pointCap = math.max(48, tonumber(ctx.maxPoints) or 200)
  local numPoints = math.max(48, math.min(w, pointCap))

  local colStatic = (0x40 << 24) | (col & 0x00ffffff)
  local prevX, prevY
  for i = 0, numPoints do
    local t = i / numPoints
    local s = waveformSample(waveType, t)
    s = softClip(s, drive)

    local x = math.floor(t * w)
    local y = math.floor(centerY - s * maxAmp)
    if prevX then
      display[#display + 1] = {
        cmd = "drawLine", x1 = prevX, y1 = prevY, x2 = x, y2 = y,
        thickness = 1, color = colStatic,
      }
    end
    prevX, prevY = x, y
  end

  if #voices > 0 then
    local drawFill = (#voices <= 1)
    for vi, voice in ipairs(voices) do
      local vcol = VOICE_COLORS[((vi - 1) % #VOICE_COLORS) + 1]
      local vcolDim = (0x20 << 24) | (vcol & 0x00ffffff)
      local freq = voice.freq or 220
      local amp = voice.amp or 0
      if amp < 0.001 then goto continue end

      local cyclesInView = 2
      local phaseOffset = time * freq
      local vPrevX, vPrevY

      for i = 0, numPoints do
        local t = i / numPoints
        local phase = phaseOffset + t * cyclesInView
        local s = waveformSample(waveType, phase)
        s = softClip(s, drive)

        s = s * (amp / 0.5)
        local x = math.floor(t * w)
        local y = math.floor(centerY - s * maxAmp)

        if drawFill and i > 0 then
          display[#display + 1] = {
            cmd = "drawLine", x1 = x, y1 = y, x2 = x, y2 = math.floor(centerY),
            thickness = math.max(1, math.ceil(w / numPoints)), color = vcolDim,
          }
        end

        if vPrevX then
          display[#display + 1] = {
            cmd = "drawLine", x1 = vPrevX, y1 = vPrevY, x2 = x, y2 = y,
            thickness = 2, color = vcol,
          }
        end
        vPrevX, vPrevY = x, y
      end

      ::continue::
    end
  end

  return display
end

local function refreshGraph(ctx)
  local graph = ctx.widgets.osc_graph
  if not graph or not graph.node then
    return
  end
  local w = graph.node:getWidth()
  local h = graph.node:getHeight()
  if w <= 0 or h <= 0 then return end
  if type(getVoiceLoopData) == "function" then
    ctx.voiceLoops = getVoiceLoopData()
  end
  graph.node:setDisplayList(buildOscDisplay(ctx, w, h))
  graph.node:repaint()
end

function OscBehavior.init(ctx)
  ctx.waveformType = 1
  ctx.driveAmount = 1.8
  ctx.outputLevel = 0.8
  ctx.activeVoices = {}
  ctx.animTime = 0
  ctx.oscMode = 0
  ctx.sampleLoopStart = 0.0
  ctx.sampleLoopLen = 1.0
  ctx.samplePlayStart = 0.0  -- Yellow flag: where playback starts
  ctx.sampleCrossfade = 0.1  -- 0-0.5 crossfade amount
  ctx.blendMode = 0
  ctx.blendAmount = 0.5
  ctx.waveToSample = 0.5
  ctx.sampleToWave = 0.0
  ctx.blendKeyTrack = true
  ctx.blendSamplePitch = 0.0
  ctx.blendModAmount = 0.5
  ctx.rangeView = "global"  -- FORCED: only global windowing works
  ctx.rangeViewIndex = 2    -- "global" is index 2 in the views table
  ctx.voiceLoops = {}

  ctx._rangeDrag = {
    active = false,
    dragging = nil,
    voiceIndex = nil,
    grabOffset = 0,
  }
  ctx._flagDrag = {
    active = false,
    which = nil,
    grabOffset = 0,
  }

  refreshGraph(ctx)
end

function OscBehavior.resized(ctx, w, h)
  if (not w or w <= 0) and ctx.root and ctx.root.node then
    w = ctx.root.node:getWidth()
    h = ctx.root.node:getHeight()
  end
  if not w or w <= 0 then return end

  local widgets = ctx.widgets
  local pad = 10
  local gap = 6

  -- 50/50 split: Graph on left, TabHost + knobs on right
  local split = math.floor(w / 2)
  local leftW = split - pad
  local rightX = split + gap
  local rightW = w - rightX - pad

  -- LEFT: Oscillator graph fills entire left half
  local graph = widgets.osc_graph
  if graph then
    if graph.setBounds then graph:setBounds(pad, pad, leftW, h - pad * 2)
    elseif graph.node then graph.node:setBounds(pad, pad, leftW, h - pad * 2) end

    -- Set up mouse handlers for range bar (once)
    if graph.node and not ctx._rangeMouseSetup then
      ctx._rangeMouseSetup = true
      graph.node:setInterceptsMouse(true, false)

      graph.node:setOnMouseDown(function(mx, my)
        if ctx.oscMode ~= 1 then return end
        local gw = graph.node:getWidth()
        local gh = graph.node:getHeight()
        if gw <= 0 or gh <= 0 then return end

        -- 2 HANDLE BARS - must match buildSampleWaveform() layout exactly
        local barH = 16
        local barGap = 4
        local barsHeight = barH * 2 + barGap
        local waveH = gh - barsHeight - 4
        local handleW = 8

        local loopStart = ctx.sampleLoopStart or 0.0
        local loopLen = ctx.sampleLoopLen or 1.0
        local playStart = ctx.samplePlayStart or 0.0

        -- Bar 1: Play Start
        local bar1Y = waveH + 2
        if my >= bar1Y and my <= bar1Y + barH then
          local playHandleX = math.floor(playStart * gw) - math.floor(handleW / 2)
          if mx >= playHandleX - 2 and mx <= playHandleX + handleW + 2 then
            ctx._flagDrag = { active = true, which = "play", grabOffset = mx - (playHandleX + handleW / 2) }
            return
          end
        end

        -- Bar 2: Loop Start + Loop End on same bar
        local bar2Y = bar1Y + barH + barGap
        if my >= bar2Y and my <= bar2Y + barH then
          local loopHandleX = math.floor(loopStart * gw) - math.floor(handleW / 2)
          local endHandleX = math.floor((loopStart + loopLen) * gw) - math.floor(handleW / 2)
          if mx >= loopHandleX - 2 and mx <= loopHandleX + handleW + 2 then
            ctx._flagDrag = { active = true, which = "loop", grabOffset = mx - (loopHandleX + handleW / 2) }
            return
          end
          if mx >= endHandleX - 2 and mx <= endHandleX + handleW + 2 then
            ctx._flagDrag = { active = true, which = "end", grabOffset = mx - (endHandleX + handleW / 2) }
            return
          end
        end
      end)

      graph.node:setOnMouseDrag(function(mx, my)
        if not ctx._flagDrag or not ctx._flagDrag.active then return end
        local gw = graph.node:getWidth()
        if gw <= 4 then return end

        local grabOffset = ctx._flagDrag.grabOffset or 0
        local adjustedMx = mx - grabOffset
        local pos = math.max(0, math.min(1, adjustedMx / gw))

        local loopStart = ctx.sampleLoopStart or 0.0
        local loopLen = ctx.sampleLoopLen or 1.0
        local loopEnd = loopStart + loopLen

        if ctx._flagDrag.which == "play" then
          -- Yellow play flag: can be anywhere 0-1
          ctx.samplePlayStart = pos
          if ctx._onPlayStartChange then ctx._onPlayStartChange(pos) end
        elseif ctx._flagDrag.which == "loop" then
          -- Green loop start: must be before loop end
          pos = math.min(pos, loopEnd - 0.05)
          local newLen = loopEnd - pos
          ctx.sampleLoopStart = pos
          ctx.sampleLoopLen = newLen
          if ctx._onRangeChange then
            ctx._onRangeChange("start", pos)
            ctx._onRangeChange("len", newLen)
          end
        elseif ctx._flagDrag.which == "end" then
          -- Red loop end: must be after loop start
          pos = math.max(pos, loopStart + 0.05)
          local newLen = pos - loopStart
          ctx.sampleLoopLen = newLen
          if ctx._onRangeChange then ctx._onRangeChange("len", newLen) end
        end
        refreshGraph(ctx)
      end)

      graph.node:setOnMouseUp(function()
        if ctx._flagDrag then
          ctx._flagDrag.active = false
          ctx._flagDrag.which = nil
          ctx._flagDrag.grabOffset = nil
        end
      end)
    end
  end

  -- RIGHT: TabHost positioned at top, knobs at bottom
  local tabHost = widgets.mode_tabs
  local knobHeight = 70
  local tabH = h - pad * 2 - knobHeight - gap

  if tabHost then
    if tabHost.setBounds then tabHost:setBounds(rightX, pad, rightW, tabH)
    elseif tabHost.node then tabHost.node:setBounds(rightX, pad, rightW, tabH) end

    -- Wire up tab switching to change oscMode and refresh graph
    if not ctx._tabHandlerSet then
      ctx._tabHandlerSet = true
      tabHost:setOnSelect(function(idx, id, title)
        local newMode = 0
        if idx == 2 then
          newMode = 1
        elseif idx == 3 then
          newMode = 2
        end
        ctx.oscMode = newMode
        -- Update DSP parameter so sync doesn't snap it back
        if type(setParam) == "function" then
          setParam("/midi/synth/osc/mode", newMode)
        elseif type(command) == "function" then
          command("SET", "/midi/synth/osc/mode", tostring(newMode))
        end
        refreshGraph(ctx)
      end)
    end

    -- Fix dropdown positions for TabHost children (account for tab bar offset)

  end

  -- Output knob always visible at bottom
  local knobY = pad + tabH + gap
  local knobW = math.floor((rightW - 16) / 3)

  local outK = widgets.output_knob
  if outK then
    if outK.setBounds then outK:setBounds(rightX + knobW + 8, knobY, knobW, knobHeight)
    elseif outK.node then outK.node:setBounds(rightX + knobW + 8, knobY, knobW, knobHeight) end
  end

  refreshGraph(ctx)
end

function OscBehavior.repaint(ctx)
  refreshGraph(ctx)
end

-- Update knob visibility and layout based on waveform selection
-- Pulse (6) shows Width knob, others hide it and center remaining 3
function OscBehavior.updateKnobLayout(ctx)
  local widgets = ctx.widgets
  if not widgets then return end

  local widthKnob = widgets.pulse_width_knob
  local unisonKnob = widgets.unison_knob
  local detuneKnob = widgets.detune_knob
  local spreadKnob = widgets.spread_knob

  local isPulse = (ctx.waveformType == 6)

  if widthKnob and widthKnob.node then
    widthKnob.node:setVisible(isPulse)
  end

  -- Bottom row: 44px knobs, 52px spacing, 10px left margin
  -- 4 knobs: 10, 62, 114, 166 → last ends at 210 (50px right margin, very safe)
  if isPulse then
    if widthKnob and widthKnob.node then widthKnob.node:setBounds(10, 58, 44, 44) end
    if unisonKnob and unisonKnob.node then unisonKnob.node:setBounds(62, 58, 44, 44) end
    if detuneKnob and detuneKnob.node then detuneKnob.node:setBounds(114, 58, 44, 44) end
    if spreadKnob and spreadKnob.node then spreadKnob.node:setBounds(166, 58, 44, 44) end
  else
    -- Hide Width, center 3 knobs: 34, 98, 162 → last ends at 206 (54px margin)
    if unisonKnob and unisonKnob.node then unisonKnob.node:setBounds(34, 58, 44, 44) end
    if detuneKnob and detuneKnob.node then detuneKnob.node:setBounds(98, 58, 44, 44) end
    if spreadKnob and spreadKnob.node then spreadKnob.node:setBounds(162, 58, 44, 44) end
  end
end

return OscBehavior
