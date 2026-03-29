-- Compatibility shim.
--
-- The legacy "oscillator" behavior grew into the full source panel
-- (wave/sample/blend), so the real implementation now lives in
-- `ui/behaviors/source_panel.lua`.
return require("behaviors.source_panel")
