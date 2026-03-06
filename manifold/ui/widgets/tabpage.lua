local Panel = require("widgets.panel")
local Schema = require("widgets.schema")

local TabPage = Panel:extend()

function TabPage.new(parent, name, config)
    local self = setmetatable(Panel.new(parent, name, config), TabPage)
    self._title = config.title or config.tabTitle or config.label or name

    self:_storeEditorMeta("TabPage", {}, Schema.buildEditorSchema("TabPage", config))

    return self
end

function TabPage:isTabPage()
    return true
end

function TabPage:getTabTitle()
    return self._title
end

function TabPage:setTitle(value)
    self._title = tostring(value or "")
    self.node:repaint()
end

function TabPage:setLabel(value)
    self:setTitle(value)
end

return TabPage
