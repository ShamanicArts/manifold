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
      w = 200,
      h = 12,
      props = { text = "Filter" },
      style = { colour = 0xffffffff, fontSize = 9, bg = 0x00000000 },
    },
    {
      id = "view_mode_toggle",
      type = "Button",
      x = 408,
      y = 0,
      w = 40,
      h = 12,
      props = { text = "1x2", interceptsMouse = true },
      style = { bg = 0xff334155, textColour = 0xffffffff, fontSize = 8, radius = 0 },
    },
    {
      id = "settings_button",
      type = "Button",
      x = 448,
      y = 0,
      w = 24,
      h = 12,
      props = { text = "S", interceptsMouse = true },
      style = { bg = 0x20ffffff, textColour = 0xffffffff, fontSize = 8, radius = 0 },
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
    {
      id = "settings_panel",
      type = "Panel",
      x = 292,
      y = 16,
      w = 172,
      h = 84,
      props = { visible = false, interceptsMouse = true },
      style = {
        bg = 0xee0f172a,
        border = 0xff334155,
        borderWidth = 1,
        radius = 6,
      },
      children = {
        {
          id = "settings_title",
          type = "Label",
          x = 8,
          y = 6,
          w = 80,
          h = 12,
          props = { text = "Settings" },
          style = { colour = 0xffffffff, fontSize = 9, bg = 0x00000000 },
        },
        {
          id = "osc_label",
          type = "Label",
          x = 8,
          y = 24,
          w = 42,
          h = 16,
          props = { text = "OSC" },
          style = { colour = 0xffcbd5e1, fontSize = 9, bg = 0x00000000 },
        },
        {
          id = "osc_enabled_toggle",
          type = "Toggle",
          x = 54,
          y = 22,
          w = 44,
          h = 18,
          props = { value = false, onLabel = "ON", offLabel = "OFF" },
          style = { onColour = 0xff7c3aed, offColour = 0xff334155, textColour = 0xffffffff, fontSize = 8, radius = 4 },
        },
        {
          id = "query_label",
          type = "Label",
          x = 106,
          y = 24,
          w = 26,
          h = 16,
          props = { text = "Q" },
          style = { colour = 0xffcbd5e1, fontSize = 9, bg = 0x00000000 },
        },
        {
          id = "osc_query_toggle",
          type = "Toggle",
          x = 126,
          y = 22,
          w = 38,
          h = 18,
          props = { value = false, onLabel = "ON", offLabel = "OFF" },
          style = { onColour = 0xff2563eb, offColour = 0xff334155, textColour = 0xffffffff, fontSize = 7, radius = 4 },
        },
        {
          id = "osc_port_label",
          type = "Label",
          x = 8,
          y = 50,
          w = 38,
          h = 12,
          props = { text = "OSC" },
          style = { colour = 0xff94a3b8, fontSize = 8, bg = 0x00000000 },
        },
        {
          id = "osc_port_value",
          type = "Label",
          x = 46,
          y = 50,
          w = 52,
          h = 12,
          props = { text = "9010" },
          style = { colour = 0xffffffff, fontSize = 8, bg = 0x00000000 },
        },
        {
          id = "query_port_label",
          type = "Label",
          x = 106,
          y = 50,
          w = 24,
          h = 12,
          props = { text = "Q" },
          style = { colour = 0xff94a3b8, fontSize = 8, bg = 0x00000000 },
        },
        {
          id = "query_port_value",
          type = "Label",
          x = 126,
          y = 50,
          w = 38,
          h = 12,
          props = { text = "9011" },
          style = { colour = 0xffffffff, fontSize = 8, bg = 0x00000000 },
        },
        {
          id = "settings_hint",
          type = "Label",
          x = 8,
          y = 66,
          w = 156,
          h = 12,
          props = { text = "Mode scales; drag only resizes." },
          style = { colour = 0xff64748b, fontSize = 7, bg = 0x00000000 },
        },
      },
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
  },
}
