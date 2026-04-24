-- Standalone oscillator: uses RackModuleHost infrastructure but shows only oscillator

local function dirname(path)
  return (tostring(path or ""):gsub("/+$", ""):match("^(.*)/[^/]+$") or ".")
end

local function join(...)
  local parts = { ... }
  local out = ""
  for i = 1, #parts do
    local part = tostring(parts[i] or "")
    if part ~= "" then
      if out == "" then
        out = part
      else
        out = out:gsub("/+$", "") .. "/" .. part:gsub("^/+", "")
      end
    end
  end
  return out
end

local function appendPackageRoot(root)
  if type(root) ~= "string" or root == "" then
    return
  end
  local entry = root .. "/?.lua;" .. root .. "/?/init.lua"
  local current = tostring(package.path or "")
  if not current:find(entry, 1, true) then
    package.path = current == "" and entry or (current .. ";" .. entry)
  end
end

local projectRoot = tostring(__manifoldProjectRoot or dirname(__manifoldProjectManifest or ""))
local mainRoot = join(projectRoot, "../Main")
local rackHostRoot = join(projectRoot, "../RackModuleHost")

appendPackageRoot(join(projectRoot, "lib"))
appendPackageRoot(join(mainRoot, "ui"))
appendPackageRoot(join(mainRoot, "lib"))
appendPackageRoot(join(rackHostRoot, "lib"))

local RackModuleShell = require("components.rack_module_shell")
local Registry = require("module_host_registry")

local module = Registry.moduleById("rack_oscillator")
local size = Registry.sizePixels(module.defaultSize)

local shell = RackModuleShell({
  id = module.shellId,
  layout = false,
  x = 0, y = 0,
  w = size.w, h = size.h,
  sizeKey = module.defaultSize,
  accentColor = module.accentColor,
  nodeName = module.label,
  componentRef = module.componentPath,
  componentId = module.componentId,
  componentBehavior = module.behaviorPath,
  componentProps = {
    instanceNodeId = module.instanceNodeId,
    paramBase = module.paramBase,
    specId = module.id,
    sizeKey = module.defaultSize,
  },
})

shell.props = shell.props or {}
shell.props.visible = true

return {
  id = "standalone_osc_root",
  type = "Panel",
  x = 0, y = 0, w = size.w, h = size.h,
  style = { bg = 0xff07111d },
  children = {
    {
      id = module.displayId,
      type = "Panel",
      x = 0, y = 0, w = size.w, h = size.h,
      style = { bg = 0x00000000, border = 0x00000000, borderWidth = 0, radius = 0 },
      props = { interceptsMouse = false, visible = true },
      children = { shell },
    }
  }
}
