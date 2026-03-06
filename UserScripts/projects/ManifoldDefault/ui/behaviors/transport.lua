local Shared = require("behaviors.shared_state")

local M = {}

function M.init(ctx)
  local widgets = ctx.widgets or {}
  local recBtn = widgets.rec
  local playPauseBtn = widgets.playpause
  local stopBtn = widgets.stop
  local overdub = widgets.overdub
  local clearAll = widgets.clearall
  local tempo = widgets.tempo
  local target = widgets.targetBpm
  local mode = widgets.mode

  ctx._recButtonLatched = false

  if recBtn then
    recBtn._onPress = function()
      if ctx._recButtonLatched then
        Shared.commandTrigger("/core/behavior/stoprec")
        ctx._recButtonLatched = false
      else
        Shared.commandTrigger("/core/behavior/rec")
        ctx._recButtonLatched = true
      end
    end
  end

  if playPauseBtn then
    playPauseBtn._onClick = function()
      local state = ctx._state or {}
      if Shared.anyLayerPlaying(state) then
        Shared.commandTrigger("/core/behavior/pause")
      else
        Shared.commandTrigger("/core/behavior/play")
      end
    end
  end

  if stopBtn then
    stopBtn._onClick = function()
      Shared.commandTrigger("/core/behavior/stop")
    end
  end

  if overdub then
    overdub._onChange = function(on)
      Shared.commandSet("/core/behavior/overdub", on and 1 or 0)
    end
  end

  if clearAll then
    clearAll._onClick = function()
      Shared.commandTrigger("/core/behavior/clear")
    end
  end

  if tempo then
    tempo._onChange = function(v)
      Shared.commandSet("/core/behavior/tempo", v)
    end
  end

  if target then
    target._onChange = function(v)
      Shared.commandSet("/core/behavior/targetbpm", v)
    end
  end

  if mode then
    mode._onSelect = function(idx)
      Shared.commandSet("/core/behavior/mode", Shared.kModeKeys[idx] or "firstLoop")
    end
  end
end

function M.resized(ctx, w, h)
  local widgets = ctx.widgets or {}
  local root = ctx.root
  if not root then return end

  local pad = 6
  local tx = pad
  local tH = h - pad * 2

  if widgets.mode then
    widgets.mode:setBounds(tx, pad, 130, tH)
    if widgets.mode.setAbsolutePos and root.node and root.node.getBounds then
      local rx, ry = root.node:getBounds()
      widgets.mode:setAbsolutePos(rx + tx, ry + pad)
    end
    tx = tx + 130 + 8
  end

  local btnW = 80
  if widgets.rec then widgets.rec:setBounds(tx, pad, btnW, tH) end
  tx = tx + btnW + 6
  if widgets.playpause then widgets.playpause:setBounds(tx, pad, btnW, tH) end
  tx = tx + btnW + 6
  if widgets.stop then widgets.stop:setBounds(tx, pad, btnW, tH) end
  tx = tx + btnW + 12
  if widgets.overdub then widgets.overdub:setBounds(tx, pad, 110, tH) end
  tx = tx + 110 + 12
  if widgets.clearall then widgets.clearall:setBounds(tx, pad, 70, tH) end

  local tRight = w - pad
  local boxW = 96
  local boxGap = 8
  if widgets.targetBpm then widgets.targetBpm:setBounds(tRight - boxW, pad, boxW, tH) end
  tRight = tRight - boxW - boxGap
  if widgets.tempo then widgets.tempo:setBounds(tRight - boxW, pad, boxW, tH) end
  tRight = tRight - boxW - boxGap - 4
  if widgets.linkIndicator and widgets.linkIndicator.node then
    widgets.linkIndicator.node:setBounds(tRight - 50, pad, 50, tH)
  end
end

function M.update(ctx, rawState)
  local widgets = ctx.widgets or {}
  local state = Shared.normalizeState(rawState)
  ctx._state = state
  ctx._recButtonLatched = state.isRecording or false

  if widgets.tempo then widgets.tempo:setValue(state.tempo or 120) end
  if widgets.targetBpm then widgets.targetBpm:setValue(state.targetBPM or 120) end

  if widgets.linkIndicator then
    local linkState = state.link
    if linkState and linkState.enabled then
      local peers = linkState.peers or 0
      if peers > 0 then
        widgets.linkIndicator:setText("● LINK " .. peers)
        widgets.linkIndicator:setColour(0xff4ade80)
      else
        widgets.linkIndicator:setText("● LINK")
        widgets.linkIndicator:setColour(0xfff59e0b)
      end
    else
      widgets.linkIndicator:setText("○ link")
      widgets.linkIndicator:setColour(0xff4b5563)
    end
  end

  if widgets.mode then
    widgets.mode:setSelected(math.max(1, math.min(3, (state.recordModeInt or 0) + 1)))
  end

  if widgets.rec then
    if state.isRecording then
      widgets.rec:setBg(0xffdc2626)
      widgets.rec:setLabel("● REC*")
    else
      widgets.rec:setBg(0xff7f1d1d)
      widgets.rec:setLabel("● REC")
    end
  end

  if widgets.playpause then
    if Shared.anyLayerPlaying(state) then
      widgets.playpause:setLabel("⏸ PAUSE")
      widgets.playpause:setBg(0xffb45309)
    else
      widgets.playpause:setLabel("▶ PLAY")
      widgets.playpause:setBg(0xff1f7a3a)
    end
  end

  if widgets.overdub then
    widgets.overdub:setValue(state.overdubEnabled or false)
  end
end

function M.cleanup(ctx)
end

return M
