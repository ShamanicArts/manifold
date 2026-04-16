-- shell/base_utils.lua
-- Shared basic helpers for ui_shell.

local M = {}

function M.readParam(params, path, fallback)
    if type(params) ~= "table" then
        return fallback
    end
    local v = params[path]
    if v == nil then
        return fallback
    end
    return v
end

function M.readBoolParam(params, path, fallback)
    local raw = M.readParam(params, path, fallback and 1 or 0)
    if raw == nil then
        return fallback
    end
    return raw == true or raw == 1
end

function M.getVisibleUiScripts(currentPath)
    local _ = currentPath
    local listed = listUiScripts() or {}
    local visible = {}
    for i = 1, #listed do
        local s = listed[i]
        if type(s) == "table" and type(s.path) == "string" then
            local name = string.lower(s.name or "")
            local path = string.lower(s.path or "")
            if name:find("settings", 1, true) or path:find("settings", 1, true) then
                visible[#visible + 1] = s
            end
        end
    end
    return visible
end

function M.clamp(v, lo, hi)
    return math.max(lo, math.min(hi, v))
end

function M.nowSeconds()
    if getTime then
        return getTime()
    end
    if os and os.clock then
        return os.clock()
    end
    return 0
end

function M.deriveNodeName(meta, fallback)
    if type(meta) ~= "table" then
        return fallback
    end

    if type(meta.name) == "string" and #meta.name > 0 then
        return meta.name
    end

    local cfg = meta.config
    if type(cfg) == "table" then
        if type(cfg.id) == "string" and #cfg.id > 0 then
            return cfg.id
        end
        if type(cfg.label) == "string" and #cfg.label > 0 then
            return cfg.label
        end
        if type(cfg.text) == "string" and #cfg.text > 0 then
            return cfg.text
        end
    end

    return fallback
end

function M.fileStem(path)
    if type(path) ~= "string" or path == "" then
        return ""
    end
    local name = path:match("([^/\\]+)$") or path
    return name:gsub("%.lua$", "")
end

function M.isShellLauncherPath(path)
    if type(path) ~= "string" or path == "" then
        return false
    end
    local name = string.lower(path:match("([^/\\]+)$") or path)
    return name == "empty_launcher.lua"
end

-- Safe wrappers for Canvas-only APIs that may not exist on RuntimeNode
function M.safeToFront(node)
    if node ~= nil and type(node.toFront) == "function" then
        node:toFront(false)
    end
end

function M.safeGrabKeyboardFocus(node)
    if node ~= nil and type(node.grabKeyboardFocus) == "function" then
        node:grabKeyboardFocus()
    end
end

return M
