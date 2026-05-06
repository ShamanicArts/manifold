local U = require("behaviors.avsd.util")

local M = {}

local PROFILE_KEYS = {
  "updateShader", "updateGridThumbnails", "syncParamsFromHost", "runPose",
  "applyMapping", "syncClipModel", "ensureGridCells", "pollMidi",
  "bindInputSurfaces", "colBuildCellPipeline", "buildTapPipeline",
  "applyCaptureWindow", "segmentIngest", "playbackUi", "statusInterval",
  "updateCompositorThumbnails", "updateCompositorOutput",
}

function M.init(ctx)
  ctx._profile = {}
  for _, k in ipairs(PROFILE_KEYS) do
    ctx._profile[k] = { total = 0, count = 0, max = 0, last = 0, avg = 0 }
  end
end

function M.start(ctx, key)
  if not ctx._profile then return end
  local t = ctx._profile[key]
  if not t then return end
  t._start = U.nowSeconds()
end

function M.finish(ctx, key)
  if not ctx._profile then return end
  local t = ctx._profile[key]
  if not t or not t._start then return end
  local elapsed = (U.nowSeconds() - t._start) * 1000000
  t.last = elapsed
  t.total = t.total + elapsed
  t.count = t.count + 1
  if elapsed > t.max then t.max = elapsed end
  t.avg = t.count == 1 and elapsed or (t.avg * 0.95 + elapsed * 0.05)
  t._start = nil
end

return M
