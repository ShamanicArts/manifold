-- ProjectTabHost - A TabHost variant for project switching.
--
-- Extends TabHost but treats pages as project metadata rather than widgets.
-- On tab selection, calls switchUiScript() to load the project instead of
-- toggling widget visibility.
--
-- Future enhancement: Support for 'overlay' system projects that don't
-- destroy the underlying user project.

local TabHost = require("widgets.tabhost")
local Utils = require("widgets.utils")
local Schema = require("widgets.schema")

local ProjectTabHost = TabHost:extend()

local function clampIndex(idx, count)
    if count <= 0 then
        return 0
    end
    return Utils.clamp(math.floor(tonumber(idx) or 1), 1, count)
end

function ProjectTabHost.new(parent, name, config)
    local self = setmetatable(TabHost.new(parent, name, config), ProjectTabHost)
    
    -- Override pages to store project metadata instead of widgets
    self._pages = {}
    self._onBeforeSwitch = config.on_before_switch or config.onBeforeSwitch
    
    self:_storeEditorMeta("ProjectTabHost", {
        on_before_switch = self._onBeforeSwitch,
    }, Schema.buildEditorSchema("ProjectTabHost", config))
    
    return self
end

function ProjectTabHost:isProjectTabHost()
    return true
end

-- Add a project tab with metadata instead of a widget.
-- projectInfo should contain: {id, title, path, isSystem, isOverlay}
function ProjectTabHost:addProjectTab(projectInfo)
    if type(projectInfo) ~= "table" then
        return
    end
    
    local id = projectInfo.id or ("project_" .. tostring(#self._pages + 1))
    local title = projectInfo.title or projectInfo.name or id
    
    self._pages[#self._pages + 1] = {
        id = id,
        title = title,
        path = projectInfo.path,
        isSystem = projectInfo.isSystem == true,
        isOverlay = projectInfo.isOverlay == true,  -- Overlay projects don't destroy base
    }
    
    self._layoutDirty = true
    self:_syncRetained()
end

-- Clear all project tabs.
function ProjectTabHost:clearProjectTabs()
    self._pages = {}
    self._activeIndex = 0
    self._layoutDirty = true
    self:_syncRetained()
end

-- Replace all tabs from a list of project info tables.
-- projectList: array of {id, title, path, isSystem}
function ProjectTabHost:setProjectTabs(projectList)
    self:clearProjectTabs()
    
    if type(projectList) ~= "table" then
        return
    end
    
    for i = 1, #projectList do
        self:addProjectTab(projectList[i])
    end
end

-- Override: Instead of toggling widget visibility, call switchUiScript.
function ProjectTabHost:setActiveIndex(idx)
    local nextIndex = clampIndex(idx, #self._pages)
    if nextIndex == self._activeIndex then
        return
    end
    
    local page = self._pages[nextIndex]
    if not page then
        return
    end
    
    local currentPath = (self.getCurrentScriptPath and self:getCurrentScriptPath()) or ""
    if currentPath == "" and type(getCurrentScriptPath) == "function" then
        currentPath = getCurrentScriptPath() or ""
    end
    local targetPath = page.path
    
    -- Don't switch if already on this project
    if targetPath and targetPath ~= "" and targetPath == currentPath then
        self._activeIndex = nextIndex
        self._layoutDirty = true
        self:_syncRetained()
        return
    end
    
    -- Call onBeforeSwitch hook if provided
    if self._onBeforeSwitch and targetPath then
        self._onBeforeSwitch(targetPath, currentPath, page.isSystem)
    end
    
    -- Perform the switch via C++ binding
    if targetPath and targetPath ~= "" and switchUiScript then
        -- If an overlay is active and we're switching to a non-overlay tab,
        -- close the overlay first so we restore base project cleanly.
        if page.isOverlay ~= true
           and type(isOverlayActive) == "function" and isOverlayActive()
           and type(closeOverlay) == "function" then
            closeOverlay()
            -- Check if we're already on the target after overlay close
            local afterPath = type(getCurrentScriptPath) == "function"
                              and (getCurrentScriptPath() or "") or ""
            if afterPath == targetPath then
                self._activeIndex = nextIndex
                self._layoutDirty = true
                self:_syncRetained()
                return
            end
        end

        -- Stash shell state if available
        local shell = (type(_G) == "table") and _G.shell or nil
        if shell and type(shell.stashRestoreStateForScriptSwitch) == "function" then
            shell:stashRestoreStateForScriptSwitch()
        end
        
        switchUiScript(targetPath)
    end
    
    -- Note: We don't update _activeIndex here because the project switch
    -- will trigger a reload, and the shell will call refreshProjectTabs()
    -- to sync the active tab. This prevents UI flicker during the switch.
end

-- Override: Skip visibility toggling - projects aren't widgets.
function ProjectTabHost:_layoutPages(force)
    local w = math.floor(self.node:getWidth() or 0)
    local h = math.floor(self.node:getHeight() or 0)
    local pageCount = #self._pages
    local activeIndex = clampIndex(self._activeIndex, pageCount)
    
    if not force and
        not self._layoutDirty and
        self._lastLayoutW == w and
        self._lastLayoutH == h and
        self._lastLayoutActiveIndex == activeIndex and
        self._lastLayoutPageCount == pageCount then
        return
    end
    
    self._activeIndex = activeIndex
    self._tabRects = self:_computeTabRects(w)
    
    -- Don't toggle widget visibility - projects aren't widgets
    -- Future: Handle overlay visibility here for system projects
    
    self._layoutDirty = false
    self._lastLayoutW = w
    self._lastLayoutH = h
    self._lastLayoutActiveIndex = self._activeIndex
    self._lastLayoutPageCount = pageCount
end

-- Override: Projects aren't structured children, they're metadata.
function ProjectTabHost:addStructuredChild(childRecord)
    -- Projects are added via addProjectTab(), not as structured children.
    -- This prevents the runtime from trying to instantiate them as widgets.
end

-- Get the project info for a tab.
function ProjectTabHost:getProjectInfo(index)
    local page = self._pages[index]
    if not page then
        return nil
    end
    return {
        id = page.id,
        title = page.title,
        path = page.path,
        isSystem = page.isSystem,
        isOverlay = page.isOverlay,
    }
end

-- Check if a tab is a system project.
function ProjectTabHost:isSystemProject(index)
    local page = self._pages[index]
    return page and page.isSystem == true
end

-- Set the active tab by path (for syncing with external state).
function ProjectTabHost:setActiveByPath(path)
    if not path or path == "" then
        return
    end
    
    for i = 1, #self._pages do
        if self._pages[i].path == path then
            -- Just update the index without triggering a switch
            self._activeIndex = i
            self._layoutDirty = true
            self:_syncRetained()
            return
        end
    end
end

-- Get the path of the currently active project.
function ProjectTabHost:getActivePath()
    local page = self._pages[self._activeIndex]
    return page and page.path or nil
end

return ProjectTabHost
