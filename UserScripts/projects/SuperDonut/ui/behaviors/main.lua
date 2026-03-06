local Shared = require("behaviors.super_shared_state")

local M = {}

function M.init(ctx)
end

function M.resized(ctx, w, h)
  local widgets = ctx.allWidgets or {}
  local designW, designH = Shared.getDesignSize(ctx, w, h)
  local componentIds = {
    "transport",
    "capture_plane",
    "vocal_fx",
    "layer0",
    "layer1",
    "layer2",
    "layer3",
  }

  for _, id in ipairs(componentIds) do
    local widget = widgets["root." .. id]
    local spec = Shared.getComponentSpec(ctx, id)
    Shared.applySpecRect(widget, spec, w, h, designW, designH)
  end
end

function M.update(ctx, state)
end

function M.cleanup(ctx)
end

return M
