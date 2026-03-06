local Shared = require("behaviors.shared_state")

local M = {}

function M.init(ctx)
end

function M.resized(ctx, w, h)
  local widgets = ctx.allWidgets or {}
  local gap = 6
  local transportH = 48
  local captureH = 130

  local transport = widgets["root.transport"]
  local capture = widgets["root.capture_plane"]
  local layers = {
    widgets["root.layer0"],
    widgets["root.layer1"],
    widgets["root.layer2"],
    widgets["root.layer3"],
  }

  if transport and transport.setBounds then
    transport:setBounds(0, 0, w, transportH)
  end

  local captureY = transportH + gap
  if capture and capture.setBounds then
    capture:setBounds(0, captureY, w, captureH)
  end

  local layerY = captureY + captureH + gap
  local layerH = h - layerY - gap
  local rowH = math.floor((layerH - gap * (Shared.MAX_LAYERS - 1)) / Shared.MAX_LAYERS)
  rowH = math.max(0, rowH)

  for i = 1, Shared.MAX_LAYERS do
    local layer = layers[i]
    if layer and layer.setBounds then
      local y = layerY + (i - 1) * (rowH + gap)
      layer:setBounds(0, y, w, rowH)
    end
  end
end

function M.update(ctx, state)
end

function M.cleanup(ctx)
end

return M
