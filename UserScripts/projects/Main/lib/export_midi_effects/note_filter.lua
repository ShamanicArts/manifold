local VoiceTransform = require("export_midi_effects.voice_transform")

local M = {}

function M.create(deps)
  deps = deps or {}
  deps.specId = "note_filter"
  deps.runtimeRequire = "note_filter_runtime"
  return VoiceTransform.create(deps)
end

return M
