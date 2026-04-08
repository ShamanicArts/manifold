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
appendPackageRoot(join(mainRoot, "ui"))
appendPackageRoot(join(mainRoot, "lib"))

return {
  id = "standalone_filter_root",
  type = "Panel",
  x = 0,
  y = 0,
  w = 472,
  h = 220,
  behavior = "ui/behaviors/main.lua",
  style = {
    bg = 0xff0b1220,
    border = 0xff1f2b4d,
    borderWidth = 1,
    radius = 0,
  },
  children = {
    {
      id = "header_bg",
      type = "Panel",
      x = 0,
      y = 0,
      w = 472,
      h = 12,
      style = { bg = 0xff111827, radius = 0 },
    },
    {
      id = "header_accent",
      type = "Panel",
      x = 0,
      y = 0,
      w = 18,
      h = 12,
      style = { bg = 0xffa78bfa, radius = 0 },
    },
    {
      id = "title",
      type = "Label",
      x = 24,
      y = 0,
      w = 320,
      h = 12,
      props = { text = "Filter" },
      style = { colour = 0xffffffff, fontSize = 9, bg = 0x00000000 },
    },
    {
      id = "dev_button",
      type = "Toggle",
      x = 412,
      y = 0,
      w = 60,
      h = 12,
      props = { value = false, onLabel = "DEV", offLabel = "DEV" },
      style = { onColour = 0xff475569, offColour = 0x20ffffff, textColour = 0xffffffff, fontSize = 8, radius = 0 },
    },
    {
      id = "content_bg",
      type = "Panel",
      x = 0,
      y = 12,
      w = 472,
      h = 208,
      style = { bg = 0xff0b1220, radius = 0 },
    },
  },
  components = {
    {
      id = "filter_component",
      x = 0,
      y = 12,
      w = 472,
      h = 208,
      behavior = "../Main/ui/behaviors/filter.lua",
      ref = "../Main/ui/components/filter.ui.lua",
      props = {
        instanceNodeId = "standalone_filter_1",
        paramBase = "/plugin/params",
      },
    },
    {
      id = "settings_overlay",
      x = 0,
      y = 12,
      w = 472,
      h = 208,
      behavior = "ui/behaviors/settings_panel.lua",
      ref = "ui/components/settings_panel.ui.lua",
      props = {},
    },
    {
      id = "perf_overlay",
      x = 0,
      y = 12,
      w = 472,
      h = 208,
      behavior = "ui/behaviors/perf_overlay.lua",
      ref = "ui/components/perf_overlay.ui.lua",
      props = {},
    },
  },
}
