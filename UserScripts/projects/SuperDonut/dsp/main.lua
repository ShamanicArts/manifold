-- Project DSP entry for SuperDonut.
--
-- This project follows the same project-owned DSP entry pattern as
-- Looper_uiproject. For now it boots from the stable looper baseline while the
-- legacy Super Donut DSP is being split into reusable extension modules.

local looper = loadDspModule("system:lib/looper_primitives.lua")

function buildPlugin(ctx)
  return looper.buildPlugin(ctx)
end
