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
  id = "rack_host_root",
  type = "Panel",
  x = 0,
  y = 0,
  w = 1280,
  h = 720,
  style = {
    bg = 0xff07111d,
  },
  behavior = "ui/behaviors/main.lua",
  children = {
    {
      id = "sidebar",
      type = "Panel",
      x = 0,
      y = 0,
      w = 320,
      h = 720,
      layout = { mode = "hybrid", left = 0, top = 0, bottom = 0, width = 320 },
      style = { bg = 0xff0d1726, border = 0xff1f2b3d, borderWidth = 1, radius = 0 },
      children = {
        { id = "title", type = "Label", x = 20, y = 18, w = 220, h = 22, props = { text = "Rack Module Host" }, style = { colour = 0xfff8fafc, fontSize = 18 } },
        { id = "subtitle", type = "Label", x = 20, y = 44, w = 270, h = 28, props = { text = "Loads Main audio rack modules in a lightweight standalone wrapper.", wordWrap = true }, style = { colour = 0xff94a3b8, fontSize = 10 } },
        { id = "module_label", type = "Label", x = 20, y = 92, w = 120, h = 14, props = { text = "Module" }, style = { colour = 0xffcbd5e1, fontSize = 10 } },
        { id = "module_selector", type = "Dropdown", x = 20, y = 112, w = 280, h = 28, props = { options = { "Oscillator", "Sample", "Filter", "FX", "EQ", "Blend" }, selected = 1, max_visible_rows = 6 }, style = { bg = 0xff162235, colour = 0xffe2e8f0, radius = 0, fontSize = 10 } },
        { id = "module_status", type = "Label", x = 20, y = 148, w = 280, h = 28, props = { text = "Rack oscillator source, routed directly to output.", wordWrap = true }, style = { colour = 0xff60a5fa, fontSize = 10 } },

        { id = "input_a_title", type = "Label", x = 20, y = 202, w = 120, h = 14, props = { text = "Input A / Capture" }, style = { colour = 0xfff8fafc, fontSize = 11 } },
        { id = "input_a_mode", type = "Dropdown", x = 20, y = 224, w = 280, h = 26, props = { options = { "Silence", "Sine", "Saw", "Square", "Pulse", "Noise" }, selected = 2, max_visible_rows = 6 }, style = { bg = 0xff162235, colour = 0xffe2e8f0, radius = 0, fontSize = 10 } },
        { id = "input_a_pitch", type = "Slider", x = 20, y = 260, w = 280, h = 22, props = { min = 24, max = 84, step = 1, value = 60, label = "Pitch", compact = true, showValue = true }, style = { colour = 0xff38bdf8, bg = 0xff122033, fontSize = 9 } },
        { id = "input_a_level", type = "Slider", x = 20, y = 288, w = 280, h = 22, props = { min = 0, max = 1, step = 0.01, value = 0.65, label = "Level", compact = true, showValue = true }, style = { colour = 0xff22d3ee, bg = 0xff0d1b28, fontSize = 9 } },

        {
          id = "input_b_group",
          type = "Panel",
          x = 20,
          y = 336,
          w = 280,
          h = 112,
          style = { bg = 0x00000000 },
          children = {
            { id = "input_b_title", type = "Label", x = 0, y = 0, w = 160, h = 14, props = { text = "Input B / Aux" }, style = { colour = 0xfff8fafc, fontSize = 11 } },
            { id = "input_b_mode", type = "Dropdown", x = 0, y = 22, w = 280, h = 26, props = { options = { "Silence", "Sine", "Saw", "Square", "Pulse", "Noise" }, selected = 3, max_visible_rows = 6 }, style = { bg = 0xff2a180f, colour = 0xffffd3b0, radius = 0, fontSize = 10 } },
            { id = "input_b_pitch", type = "Slider", x = 0, y = 58, w = 280, h = 22, props = { min = 24, max = 84, step = 1, value = 67, label = "Pitch", compact = true, showValue = true }, style = { colour = 0xfffb923c, bg = 0xff2b160d, fontSize = 9 } },
            { id = "input_b_level", type = "Slider", x = 0, y = 86, w = 280, h = 22, props = { min = 0, max = 1, step = 0.01, value = 0.5, label = "Level", compact = true, showValue = true }, style = { colour = 0xffff9a62, bg = 0xff2a150d, fontSize = 9 } },
          },
        },

        { id = "routing_hint", type = "Label", x = 20, y = 474, w = 280, h = 78, props = { text = "Input A feeds filter, FX, and EQ. Blend uses Input A as serial input and Input B as its auxiliary source. Sample uses Input A when its Source control is set to Input.", wordWrap = true }, style = { colour = 0xff94a3b8, fontSize = 10 } },
        { id = "module_note", type = "Label", x = 20, y = 564, w = 280, h = 96, props = { text = "This wrapper reuses the existing Main rack module UIs and DSP slots so you can inspect module behavior without opening the full Main project.", wordWrap = true }, style = { colour = 0xff64748b, fontSize = 10 } },
      },
    },
    {
      id = "viewport",
      type = "Panel",
      x = 332,
      y = 0,
      w = 948,
      h = 720,
      layout = { mode = "hybrid", left = 332, top = 0, right = 0, bottom = 0 },
      style = { bg = 0xff0a1220 },
      children = {
        { id = "viewport_title", type = "Label", x = 24, y = 18, w = 300, h = 22, props = { text = "Module View" }, style = { colour = 0xfff8fafc, fontSize = 18 } },
        { id = "viewport_subtitle", type = "Label", x = 24, y = 44, w = 520, h = 18, props = { text = "Selected rack module rendered with its existing Main project component." }, style = { colour = 0xff94a3b8, fontSize = 10 } },
        {
          id = "module_surface",
          type = "Panel",
          x = 24,
          y = 78,
          w = 900,
          h = 618,
          layout = { mode = "hybrid", left = 24, top = 78, right = 24, bottom = 24 },
          style = { bg = 0xff0f1726, border = 0xff1f2937, borderWidth = 1, radius = 0 },
          children = {
            {
              id = "oscillator_host",
              type = "Panel",
              x = 12,
              y = 12,
              w = 876,
              h = 594,
              layout = { mode = "hybrid", left = 12, top = 12, right = 12, bottom = 12 },
              style = { bg = 0xff0b1220 },
              components = {
                {
                  id = "rack_oscillator_component",
                  x = 0,
                  y = 0,
                  w = 876,
                  h = 594,
                  layout = { mode = "hybrid", left = 0, top = 0, right = 0, bottom = 0 },
                  behavior = "../Main/ui/behaviors/rack_oscillator.lua",
                  ref = "../Main/ui/components/rack_oscillator.ui.lua",
                  props = {
                    instanceNodeId = "rack_oscillator_host",
                    paramBase = "/midi/synth/rack/osc/1",
                    specId = "rack_oscillator",
                  },
                },
              },
            },
            {
              id = "sample_host",
              type = "Panel",
              x = 12,
              y = 12,
              w = 876,
              h = 594,
              layout = { mode = "hybrid", left = 12, top = 12, right = 12, bottom = 12 },
              style = { bg = 0xff0b1220 },
              components = {
                {
                  id = "rack_sample_component",
                  x = 0,
                  y = 0,
                  w = 876,
                  h = 594,
                  layout = { mode = "hybrid", left = 0, top = 0, right = 0, bottom = 0 },
                  behavior = "../Main/ui/behaviors/rack_sample.lua",
                  ref = "../Main/ui/components/rack_sample.ui.lua",
                  props = {
                    instanceNodeId = "rack_sample_host",
                    paramBase = "/midi/synth/rack/sample/1",
                    specId = "rack_sample",
                  },
                },
              },
            },
            {
              id = "filter_host",
              type = "Panel",
              x = 12,
              y = 12,
              w = 876,
              h = 594,
              layout = { mode = "hybrid", left = 12, top = 12, right = 12, bottom = 12 },
              style = { bg = 0xff0b1220 },
              components = {
                {
                  id = "filter_component",
                  x = 0,
                  y = 0,
                  w = 876,
                  h = 594,
                  layout = { mode = "hybrid", left = 0, top = 0, right = 0, bottom = 0 },
                  behavior = "../Main/ui/behaviors/filter.lua",
                  ref = "../Main/ui/components/filter.ui.lua",
                  props = {
                    instanceNodeId = "filter_host",
                    paramBase = "/midi/synth/rack/filter/1",
                    specId = "filter",
                  },
                },
              },
            },
            {
              id = "fx_host",
              type = "Panel",
              x = 12,
              y = 12,
              w = 876,
              h = 594,
              layout = { mode = "hybrid", left = 12, top = 12, right = 12, bottom = 12 },
              style = { bg = 0xff0b1220 },
              components = {
                {
                  id = "fx_component",
                  x = 0,
                  y = 0,
                  w = 876,
                  h = 594,
                  layout = { mode = "hybrid", left = 0, top = 0, right = 0, bottom = 0 },
                  behavior = "../Main/ui/behaviors/fx_slot.lua",
                  ref = "../Main/ui/components/fx_slot.ui.lua",
                  props = {
                    instanceNodeId = "fx_host",
                    paramBase = "/midi/synth/rack/fx/1",
                    specId = "fx",
                  },
                },
              },
            },
            {
              id = "eq_host",
              type = "Panel",
              x = 12,
              y = 12,
              w = 876,
              h = 594,
              layout = { mode = "hybrid", left = 12, top = 12, right = 12, bottom = 12 },
              style = { bg = 0xff0b1220 },
              components = {
                {
                  id = "eq_component",
                  x = 0,
                  y = 0,
                  w = 876,
                  h = 594,
                  layout = { mode = "hybrid", left = 0, top = 0, right = 0, bottom = 0 },
                  behavior = "../Main/ui/behaviors/eq.lua",
                  ref = "../Main/ui/components/eq.ui.lua",
                  props = {
                    instanceNodeId = "eq_host",
                    paramBase = "/midi/synth/rack/eq/1",
                    specId = "eq",
                  },
                },
              },
            },
            {
              id = "blend_host",
              type = "Panel",
              x = 12,
              y = 12,
              w = 876,
              h = 594,
              layout = { mode = "hybrid", left = 12, top = 12, right = 12, bottom = 12 },
              style = { bg = 0xff0b1220 },
              components = {
                {
                  id = "blend_component",
                  x = 0,
                  y = 0,
                  w = 876,
                  h = 594,
                  layout = { mode = "hybrid", left = 0, top = 0, right = 0, bottom = 0 },
                  behavior = "../Main/ui/behaviors/rack_blend_simple.lua",
                  ref = "../Main/ui/components/rack_blend_simple.ui.lua",
                  props = {
                    instanceNodeId = "blend_host",
                    paramBase = "/midi/synth/rack/blend_simple/1",
                    specId = "blend_simple",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}
