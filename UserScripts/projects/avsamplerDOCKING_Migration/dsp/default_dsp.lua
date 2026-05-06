-- avsamplerDOCKING reuses the real AVSampler DSP authority.
-- The new project is about the UI/docking rewrite, not forking the audio engine yet.

local function dirname(path)
  return (tostring(path or ""):gsub("/+$", ""):match("^(.*)/[^/]+$") or ".")
end

local function join(...)
  local parts = { ... }
  local out = ""
  for i = 1, #parts do
    local part = tostring(parts[i] or "")
    if part ~= "" then
      out = out == "" and part or (out:gsub("/+$", "") .. "/" .. part:gsub("^/+", ""))
    end
  end
  return out
end

local scriptDir = tostring(__manifoldDspScriptDir or ".")
local projectRoot = dirname(scriptDir)
local sharedDsp = join(projectRoot, "../AVSampler/dsp/default_dsp.lua")

dofile(sharedDsp)
