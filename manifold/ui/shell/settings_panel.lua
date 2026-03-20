-- Shell-owned Settings Panel
-- Loads the existing Settings system project into a shell-owned panel node
-- using the project_loader Runtime. No switchScript, no overlay.

local W = require("ui_widgets")
local ProjectLoader = require("project_loader")

local M = {}

function M.create(shell)
    local parentNode = shell.parentNode
    local panel = {}
    panel.visible = false
    panel.initialized = false
    panel.runtime = nil

    -- Create container node
    panel.root = W.Panel.new(parentNode, "settingsPanel", {
        bg = 0xff0a0f1a,
    })
    panel.root:setBounds(0, 0, 0, 0) -- hidden initially

    function panel:init()
        if self.initialized then return true end

        -- Find the Settings system project from the script listing
        local settingsProjectRoot = ""
        if type(listUiScripts) == "function" then
            local scripts = listUiScripts()
            for i = 1, #scripts do
                local s = scripts[i]
                if type(s) == "table" and type(s.path) == "string" then
                    if s.path:find("Settings/manifold.project.json5", 1, true) then
                        settingsProjectRoot = s.path:match("(.+)/manifold%.project%.json5$") or ""
                        break
                    end
                end
            end
        end

        if settingsProjectRoot == "" then
            print("Settings panel: cannot find Settings system project")
            return false
        end
        print("Settings panel: using project root: " .. settingsProjectRoot)

        local manifestPath = settingsProjectRoot .. "/manifold.project.json5"
        local uiRoot = settingsProjectRoot .. "/ui/main.ui.lua"

        -- Create a Runtime for the Settings project
        self.runtime = ProjectLoader.Runtime.new({
            requestedPath = manifestPath,
            projectRoot = settingsProjectRoot,
            manifestPath = manifestPath,
            uiRoot = uiRoot,
            displayName = "Settings",
            userScriptsRoot = _G.__manifoldUserScriptsRoot or "",
            systemUiRoot = systemUiRoot,
            systemDspRoot = _G.__manifoldSystemDspRoot or "",
        })

        -- Initialize into our panel node
        local ok, err = pcall(function()
            self.runtime:init(self.root.node)
        end)

        if not ok then
            print("Settings panel init error: " .. tostring(err))
            return false
        end

        -- Rewire the close button to hide the panel (not closeOverlay)
        -- Runtime namespaces widget IDs as "root.close_btn"
        local closeBtn = self.runtime.widgets["root.close_btn"]
            or self.runtime.widgets["close_btn"]
        if closeBtn then
            closeBtn._onClick = function()
                self:hide()
                shell.settingsOpen = false
            end
        else
            print("Settings panel: close_btn not found, available widgets:")
            for k, _ in pairs(self.runtime.widgets) do
                print("  " .. k)
            end
        end

        self.initialized = true
        return true
    end

    function panel:show()
        self.visible = true
        if not self.initialized then
            if not self:init() then
                self.visible = false
                return
            end
        end
        -- Position will be set by shell:layout()
        local totalW = shell.parentNode:getWidth()
        local totalH = shell.parentNode:getHeight()
        shell:layout(totalW, totalH)
    end

    function panel:hide()
        self.visible = false
        self.root:setBounds(0, 0, 0, 0)
    end

    function panel:toggle()
        if self.visible then
            self:hide()
        else
            self:show()
        end
    end

    function panel:update()
        if not self.visible or not self.runtime then return end
        self.runtime:update(nil)
    end

    function panel:resized(w, h)
        if not self.runtime then return end
        self.runtime:resized(w, h)
    end

    return panel
end

return M
