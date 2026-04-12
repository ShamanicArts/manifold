local VoiceTransform = require("export_midi_effects.voice_transform")

local M = {}

function M.create(deps)
  deps = deps or {}
  deps.specId = "transpose"
  deps.runtimeRequire = "transpose_runtime"
  return VoiceTransform.create(deps)
end

return M
