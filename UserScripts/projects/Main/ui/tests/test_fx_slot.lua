package.path = "/home/shamanic/dev/my-plugin/UserScripts/projects/Main/ui/?.lua;"
  .. "/home/shamanic/dev/my-plugin/UserScripts/projects/Main/ui/?/init.lua;"
  .. "/home/shamanic/dev/my-plugin/UserScripts/projects/Main/lib/?.lua;"
  .. "/home/shamanic/dev/my-plugin/UserScripts/projects/Main/lib/?/init.lua;"
  .. package.path

local FxSlotBehavior = require("behaviors.fx_slot")

local function assertEqual(actual, expected, message)
  if actual ~= expected then
    error((message or "assertEqual failed") .. string.format(" (expected=%s actual=%s)", tostring(expected), tostring(actual)), 2)
  end
end

local function makeNode(width, height)
  local node = {
    width = width or 120,
    height = height or 80,
    displayList = nil,
  }
  function node:getWidth() return self.width end
  function node:getHeight() return self.height end
  function node:setDisplayList(display) self.displayList = display end
  function node:repaint() end
  function node:setInterceptsMouse() end
  function node:setOnMouseDown(fn) self.onMouseDown = fn end
  function node:setOnMouseDrag(fn) self.onMouseDrag = fn end
  function node:setOnMouseUp(fn) self.onMouseUp = fn end
  function node:setBounds() end
  return node
end

local function makeSlider(label)
  local widget = {
    _label = label,
    value = 0,
    visible = true,
    node = makeNode(120, 20),
  }
  function widget:setValue(v) self.value = v end
  function widget:getValue() return self.value end
  function widget:setLabel(labelText) self._label = labelText end
  function widget:getLabel() return self._label end
  function widget:setVisible(flag) self.visible = flag end
  function widget:setBounds() end
  return widget
end

local function makeDropdown()
  local widget = {
    options = {},
    selected = 1,
    visible = true,
    _open = false,
    node = makeNode(120, 18),
  }
  function widget:setOptions(opts) self.options = opts end
  function widget:setSelected(idx) self.selected = idx end
  function widget:getSelected() return self.selected end
  function widget:setVisible(flag) self.visible = flag end
  function widget:setBounds() end
  return widget
end

local function makeLabel()
  local widget = { node = makeNode(20, 12), visible = true }
  function widget:setVisible(flag) self.visible = flag end
  function widget:setBounds() end
  return widget
end

local function buildCtx()
  return {
    widgets = {
      xy_pad = { node = makeNode(120, 80) },
      type_dropdown = makeDropdown(),
      xy_x_label = makeLabel(),
      xy_x_dropdown = makeDropdown(),
      xy_y_label = makeLabel(),
      xy_y_dropdown = makeDropdown(),
      mix_knob = makeSlider("Mix"),
      param1 = makeSlider("P1"),
      param2 = makeSlider("P2"),
      param3 = makeSlider("P3"),
      param4 = makeSlider("P4"),
      param5 = makeSlider("P5"),
    },
    root = { node = makeNode(320, 220), _structuredRecord = { globalId = "root.fx1Component" } },
    instanceProps = { instanceNodeId = "fx1" },
  }
end

local function withMockGetParam(values, fn)
  local previous = _G.getParam
  _G.getParam = function(path)
    return values[path]
  end
  local ok, err = xpcall(fn, debug.traceback)
  _G.getParam = previous
  if not ok then error(err, 0) end
end

local function testInitLoadsEffectLabelsForCurrentType()
  withMockGetParam({
    ["/midi/synth/fx1/type"] = 0,
    ["/midi/synth/fx1/mix"] = 0.0,
    ["/midi/synth/fx1/p/0"] = 0.5,
    ["/midi/synth/fx1/p/1"] = 0.5,
    ["/midi/synth/fx1/p/2"] = 0.5,
    ["/midi/synth/fx1/p/3"] = 0.5,
    ["/midi/synth/fx1/p/4"] = 0.5,
  }, function()
    local ctx = buildCtx()
    FxSlotBehavior.init(ctx)
    assertEqual(ctx.widgets.param1:getLabel(), "Rate", "param1 label initialized from loaded fx type")
    assertEqual(ctx.widgets.param2:getLabel(), "Depth", "param2 label initialized from loaded fx type")
    assertEqual(ctx.widgets.param3:getLabel(), "Feedback", "param3 label initialized from loaded fx type")
  end)
end

local tests = {
  testInitLoadsEffectLabelsForCurrentType,
}

for i = 1, #tests do
  tests[i]()
end

print(string.format("OK fx_slot %d tests", #tests))
