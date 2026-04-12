local VoiceTransform = require("export_midi_effects.voice_transform")

local M = {}

function M.create(deps)
  deps = deps or {}
  deps.specId = "velocity_mapper"
  deps.runtimeRequire = "velocity_mapper_runtime"
  return VoiceTransform.create(deps)
end

return M
