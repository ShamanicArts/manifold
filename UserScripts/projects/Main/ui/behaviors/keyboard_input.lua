-- Keyboard Input Module for Midisynth
-- Handles on-screen MIDI keyboard display and input

local M = {}

-- Dependencies (these will be set by the parent module)
local _triggerVoice = nil
local _releaseVoice = nil
local _ensureUtilityDockState = nil
local _refreshManagedLayoutState = nil
local _noteName = nil
local _repaint = nil

function M.init(deps)
  _triggerVoice = deps.triggerVoice
  _releaseVoice = deps.releaseVoice
  _ensureUtilityDockState = deps.ensureUtilityDockState
  _refreshManagedLayoutState = deps.refreshManagedLayoutState
  _noteName = deps.noteName
  _repaint = deps.repaint or repaint
end

-- isUtilityDockVisible is redefined in computeKeyboardPanelHeight to use the injected dependency at call time

local function syncKeyboardCollapsedFromUtilityDock(ctx)
  local dock = _ensureUtilityDockState(ctx)
  ctx._keyboardCollapsed = dock.heightMode == "collapsed"
end

local function syncUtilityDockFromKeyboardCollapsed(ctx)
  local dock = _ensureUtilityDockState(ctx)
  dock.visible = true
  if dock.mode == "hidden" then
    dock.mode = "keyboard"
  end
  dock.layoutMode = "split"
  dock.secondary = { kind = "utility", variant = "compact" }
  dock.primary = dock.primary or { kind = "keyboard", variant = "full" }
  dock.primary.kind = "keyboard"

  if ctx._keyboardCollapsed then
    dock.heightMode = "collapsed"
    dock.primary.variant = "compact"
  else
    local mode = ctx._dockMode or "compact_split"
    if mode == "compact_split" then
      dock.heightMode = "compact"
      dock.primary.variant = "compact"
    else
      dock.heightMode = "full"
      dock.primary.variant = "full"
    end
  end
end

local function syncDockModeDots(ctx)
  local mode = ctx._dockMode or "compact_collapsed"
  local dots = ctx._dockDots
  if not dots then return end
  for _, entry in ipairs(dots) do
    local color = (entry.mode == mode) and 0xffffffff or 0xff475569
    if entry.widget and entry.widget._colour ~= color then
      entry.widget._colour = color
      if entry.widget._syncRetained then entry.widget:_syncRetained() end
      if entry.widget.node and entry.widget.node.repaint then entry.widget.node:repaint() end
    end
  end
end

function M.syncKeyboardCollapseButton(ctx)
  local widgets = ctx.widgets or {}
  if widgets.keyboardCollapse and widgets.keyboardCollapse.setLabel then
    widgets.keyboardCollapse:setLabel(ctx._keyboardCollapsed and "▶" or "▼")
    _repaint(widgets.keyboardCollapse)
  end
  syncDockModeDots(ctx)
end

-- Compute keyboard panel height based on dock state
function M.computeKeyboardPanelHeight(ctx, totalH)
  local dock = _ensureUtilityDockState(ctx)
  if not (dock and dock.visible ~= false and dock.mode ~= "hidden") then
    return 0
  end

  local h = math.max(0, tonumber(totalH) or 0)
  local topPad = 0
  local bottomPad = 0
  local gap = 0
  local captureH = 0
  local captureGap = 0
  local contentTop = topPad + captureH + captureGap
  local availableBelow = math.max(220, h - contentTop - bottomPad)
  local keyboardExpandedH = math.max(148, availableBelow - math.max(180, math.floor(availableBelow * 0.45)) - gap - 6)
  local compactH = math.max(220, math.min(420, math.floor(keyboardExpandedH * 0.5) + 56))

  if dock.heightMode == "collapsed" then
    return compactH
  end
  if dock.heightMode == "compact" or dock.mode == "compact_keyboard" then
    return compactH
  end
  return keyboardExpandedH
end

function M.setKeyboardCollapsed(ctx, collapsed)
  ctx._keyboardCollapsed = collapsed == true
  if ctx._keyboardCollapsed then
    ctx._dockMode = "compact_collapsed"
  elseif ctx._dockMode ~= "full" then
    ctx._dockMode = "compact_split"
  end
  syncUtilityDockFromKeyboardCollapsed(ctx)
  if ctx._rackState then
    ctx._rackState.utilityDock = _ensureUtilityDockState(ctx)
  end
  M.syncKeyboardCollapseButton(ctx)
  MidiParamRack.invalidate(ctx)
  if ctx._lastW and ctx._lastH then
    _refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
  end
end

function M.syncKeyboardCollapsedFromUtilityDock(ctx)
  syncKeyboardCollapsedFromUtilityDock(ctx)
end

function M.syncUtilityDockFromKeyboardCollapsed(ctx)
  syncUtilityDockFromKeyboardCollapsed(ctx)
end

local function generateKeyboardKeys(whiteKeyCount)
  whiteKeyCount = whiteKeyCount or 14
  local whiteKeys = {}
  local blackKeys = {}
  local blackPositions = {}
  
  local whitePattern = {0, 2, 4, 5, 7, 9, 11}  -- C, D, E, F, G, A, B
  local blackPattern = {1, 3, 6, 8, 10}  -- C#, D#, F#, G#, A#
  local blackPosPattern = {0.5, 1.5, 3.5, 4.5, 5.5}  -- position between white keys
  
  for i = 1, whiteKeyCount do
    local octave = math.floor((i - 1) / 7)
    local noteInOctave = ((i - 1) % 7) + 1
    whiteKeys[i] = octave * 12 + whitePattern[noteInOctave]
  end
  
  local blackIndex = 1
  for i = 1, whiteKeyCount - 1 do
    local octave = math.floor((i - 1) / 7)
    local noteInOctave = ((i - 1) % 7) + 1
    if noteInOctave == 1 or noteInOctave == 2 or noteInOctave == 4 or noteInOctave == 5 or noteInOctave == 6 then
      local blackOffset = blackPattern[noteInOctave == 1 and 1 or noteInOctave == 2 and 2 or noteInOctave == 4 and 3 or noteInOctave == 5 and 4 or 5]
      blackKeys[blackIndex] = octave * 12 + blackOffset
      blackPositions[blackIndex] = i + blackPosPattern[noteInOctave == 1 and 1 or noteInOctave == 2 and 2 or noteInOctave == 4 and 3 or noteInOctave == 5 and 4 or 5]
      blackIndex = blackIndex + 1
    end
  end
  
  return whiteKeys, blackKeys, blackPositions
end

local function getKeyCountForCtx(ctx)
  return ctx._keyboardKeyCount or 14
end

local function isKeyboardNoteActive(ctx, note)
  local midiVoices = ctx._midiVoices or ctx._voices or {}
  local VOICE_COUNT = ctx._voiceCount or 8
  for j = 1, VOICE_COUNT do
    local voice = midiVoices[j]
    if voice and voice.active and voice.note == note and voice.gate > 0.5 then
      return true
    end
  end
  return false
end

function M.buildKeyboardDisplayList(ctx, w, h)
  local display = {}
  if w <= 0 or h <= 0 then
    return display
  end

  local keyCount = getKeyCountForCtx(ctx)
  local whiteKeys, blackKeys, blackPositions = generateKeyboardKeys(keyCount)
  local whiteKeyWidth = w / keyCount
  local blackKeyWidth = whiteKeyWidth * 0.6
  local baseNote = ctx._keyboardOctave * 12

  for i, offset in ipairs(whiteKeys) do
    local note = baseNote + offset
    local x = (i - 1) * whiteKeyWidth
    local isActive = isKeyboardNoteActive(ctx, note)
    local keyX = math.floor(x + 2)
    local keyY = 2
    local keyW = math.max(1, math.floor(whiteKeyWidth - 4))
    local keyH = math.max(1, math.floor(h - 4))

    display[#display + 1] = {
      cmd = "fillRoundedRect",
      x = keyX,
      y = keyY,
      w = keyW,
      h = keyH,
      radius = 4,
      color = isActive and 0xff4ade80 or 0xfff1f5f9,
    }
    display[#display + 1] = {
      cmd = "drawRoundedRect",
      x = keyX,
      y = keyY,
      w = keyW,
      h = keyH,
      radius = 4,
      thickness = 1,
      color = 0xff64748b,
    }
  end

  for i, offset in ipairs(blackKeys) do
    local note = baseNote + offset
    local pos = blackPositions[i]
    local x = pos * whiteKeyWidth - blackKeyWidth / 2
    local isActive = isKeyboardNoteActive(ctx, note)
    local keyX = math.floor(x)
    local keyY = 2
    local keyW = math.max(1, math.floor(blackKeyWidth))
    local keyH = math.max(1, math.floor(h * 0.6))

    display[#display + 1] = {
      cmd = "fillRoundedRect",
      x = keyX,
      y = keyY,
      w = keyW,
      h = keyH,
      radius = 3,
      color = isActive and 0xff22d3ee or 0xff1e293b,
    }
    display[#display + 1] = {
      cmd = "drawRoundedRect",
      x = keyX,
      y = keyY,
      w = keyW,
      h = keyH,
      radius = 3,
      thickness = 1,
      color = 0xff0f172a,
    }
  end

  return display
end

function M.syncKeyboardDisplay(ctx)
  local widgets = ctx.widgets or {}
  local canvas = widgets.keyboardCanvas
  if not (canvas and canvas.node and canvas.node.setDisplayList) then
    return
  end

  local w = canvas.node:getWidth()
  local h = canvas.node:getHeight()
  canvas.node:setDisplayList(M.buildKeyboardDisplayList(ctx, w, h))
  _repaint(canvas)
end

function M.handleKeyboardClick(ctx, x, y, isDown)
  local widgets = ctx.widgets or {}
  local canvas = widgets.keyboardCanvas
  if not canvas or not canvas.node then return end
  
  local w = canvas.node:getWidth()
  local h = canvas.node:getHeight()
  local keyCount = getKeyCountForCtx(ctx)
  local whiteKeys, blackKeys, blackPositions = generateKeyboardKeys(keyCount)
  local whiteKeyWidth = w / keyCount
  local baseNote = ctx._keyboardOctave * 12
  
  local blackKeyWidth = whiteKeyWidth * 0.6
  local blackKeyHeight = h * 0.6
  local hitNote = nil

  -- Check black keys first (they're on top)
  if y <= blackKeyHeight then
    for i, offset in ipairs(blackKeys) do
      local pos = blackPositions[i]
      local kx = pos * whiteKeyWidth - blackKeyWidth / 2
      if x >= kx and x <= kx + blackKeyWidth then
        hitNote = baseNote + offset
        break
      end
    end
  end

  -- Fall through to white keys if no black key hit
  if not hitNote then
    local keyIndex = math.floor(x / whiteKeyWidth) + 1
    if keyIndex >= 1 and keyIndex <= #whiteKeys then
      hitNote = baseNote + whiteKeys[keyIndex]
    end
  end

  if hitNote then
    if isDown then
      local voiceIndex = _triggerVoice(ctx, hitNote, 100)
      ctx._keyboardNote = hitNote
      ctx._currentNote = hitNote
      if voiceIndex ~= nil then
        ctx._lastEvent = string.format("Note: %s vel 100", _noteName(hitNote))
      else
        ctx._lastEvent = string.format("Blocked: %s", tostring(ctx._triggerBlockedReason or "missing trigger path"))
      end
    else
      _releaseVoice(ctx, hitNote)
      if ctx._keyboardNote == hitNote then
        ctx._keyboardNote = nil
      end
      if ctx._currentNote == hitNote then
        ctx._currentNote = nil
      end
    end
  end
  
  M.syncKeyboardDisplay(ctx)
end

return M