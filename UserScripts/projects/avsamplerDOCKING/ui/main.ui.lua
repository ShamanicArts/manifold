-- avsamplerDOCKING main UI.
-- Minimal root panel; all rendering happens in onImGuiFrame via the behavior.

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

local function appendPackageRoot(root)
  if type(root) ~= "string" or root == "" then return end
  local entry = root .. "/?.lua;" .. root .. "/?/init.lua"
  local current = tostring(package.path or "")
  if not current:find(entry, 1, true) then package.path = current == "" and entry or (current .. ";" .. entry) end
end

local projectRoot = tostring(__manifoldProjectRoot or dirname(__manifoldProjectManifest or ""))
local mainRoot = join(projectRoot, "../Main")
appendPackageRoot(join(mainRoot, "ui"))
appendPackageRoot(join(mainRoot, "lib"))

return {
  id="root",
  type="Panel",
  behavior="ui/behaviors/main.lua",
  x=0, y=0, w=1, h=1,
  shellLayout={ mode="fill" },
  style={ bg=0xff050816 },
  children={}
}
