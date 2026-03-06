-- Project DSP entry for Looper_uiproject.
--
-- The project owns this entry file. For first pass it explicitly imports the
-- reusable system looper baseline through the DSP module loader infrastructure.
-- This keeps the dependency visible and editable without path-joining goblin
-- code in the project itself.

local looper = loadDspModule("system:lib/looper_primitives.lua")

function buildPlugin(ctx)
  return looper.buildPlugin(ctx)
end
