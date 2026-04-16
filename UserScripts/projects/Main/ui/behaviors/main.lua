local M = {}

function M.init(ctx)
  ctx._tabs = ctx.widgets and ctx.widgets.tabs or nil
  _G.__looperTabsWidget = ctx._tabs
end

function M.resized(ctx, w, h)
  local tabs = ctx.widgets and ctx.widgets.tabs or nil
  if tabs and tabs.setBounds then
    local top = 182
    tabs:setBounds(0, top, w, math.max(0, h - top))
  end
end

function M.shouldUpdate(ctx, changedPaths, changedSet)
  return true
end

function M.update(ctx)
  -- Drive MidiSynth MIDI polling + envelope updates once per timer frame.
  -- Rate-limit to ~60Hz so cascading setParam calls from envelopes
  -- don't re-trigger this on every onStateChanged.
  local now = getTime and getTime() or 0
  if now - (ctx._lastBgTick or 0) < (1.0 / 60.0) then
    return
  end
  ctx._lastBgTick = now

  local tick = _G.__midiSynthBackgroundTick
  if type(tick) == "function" then
    tick()
  end
end

function M.cleanup(ctx)
  if _G.__looperTabsWidget == ctx._tabs then
    _G.__looperTabsWidget = nil
  end
end

return M
