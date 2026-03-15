-- shell/inspector_utils.lua
-- Hierarchy, inspector/config, geometry, and history helpers for ui_shell.

local Base = require("shell.base_utils")
local deriveNodeName = Base.deriveNodeName
local clamp = Base.clamp

local M = {}

local function structuredSourceMatches(canvas, documentPath)
    if canvas == nil or type(canvas.getUserData) ~= "function" then
        return false
    end

    local function matches(meta)
        return type(meta) == "table"
            and type(meta.documentPath) == "string"
            and type(meta.nodeId) == "string"
            and (documentPath == nil or documentPath == "" or meta.documentPath == documentPath)
    end

    local instanceMeta = canvas:getUserData("_structuredInstanceSource")
    if matches(instanceMeta) then
        return true
    end

    local sourceMeta = canvas:getUserData("_structuredSource")
    if matches(sourceMeta) then
        return true
    end

    return false
end

function M.walkHierarchy(canvas, depth, flatOut, parentAbsX, parentAbsY, parentPath, childIndex, opts)
    if not canvas then
        return nil
    end

    opts = opts or {}

    if depth > 0 and type(canvas.isVisible) == "function" and canvas:isVisible() == false then
        return nil
    end

    local bx, by, bw, bh = canvas:getBounds()
    local absX = (parentAbsX or 0) + (bx or 0)
    local absY = (parentAbsY or 0) + (by or 0)

    local meta = canvas:getUserData("_editorMeta")
    local nodeType = "Canvas"
    if type(meta) == "table" and type(meta.type) == "string" and #meta.type > 0 then
        nodeType = meta.type
    end

    local fallbackName = depth == 0 and "ContentRoot" or nodeType
    local nodeName = deriveNodeName(meta, fallbackName)

    local includeNode = true
    if opts.structuredOnly == true and depth > 0 then
        includeNode = structuredSourceMatches(canvas, opts.structuredDocumentPath)
    end

    local basePath = parentPath or ""
    local indexPart = tostring(childIndex or 0)
    local thisPath = basePath == "" and (indexPart .. ":" .. nodeName) or (basePath .. "/" .. indexPart .. ":" .. nodeName)

    local node = nil
    local nextParentPath = basePath
    if includeNode then
        node = {
            name = nodeName,
            type = nodeType,
            children = {},
            canvas = canvas,
            depth = depth,
            x = absX,
            y = absY,
            w = bw or 0,
            h = bh or 0,
            path = thisPath,
        }
        flatOut[#flatOut + 1] = node
        nextParentPath = thisPath
    end

    local numChildren = canvas:getNumChildren() or 0
    for i = 0, numChildren - 1 do
        local child = canvas:getChild(i)
        if child ~= nil then
            local childDepth = includeNode and (depth + 1) or depth
            local childNode = M.walkHierarchy(child, childDepth, flatOut, absX, absY, nextParentPath, i, opts)
            if childNode ~= nil and node ~= nil then
                node.children[#node.children + 1] = childNode
            end
        end
    end

    return node
end

function M.walkStructuredRecords(record, depth, flatOut, parentAbsX, parentAbsY, parentPath, childIndex, runtime)
    if type(record) ~= "table" then
        return nil
    end

    if runtime and type(runtime.isRecordActive) == "function" and runtime:isRecordActive(record) ~= true then
        return nil
    end

    local widget = record.widget
    local canvas = widget and widget.node or nil
    if canvas == nil then
        return nil
    end

    local bx, by, bw, bh = canvas:getBounds()
    local absX = (parentAbsX or 0) + (bx or 0)
    local absY = (parentAbsY or 0) + (by or 0)

    local meta = canvas:getUserData("_editorMeta")
    local nodeType = "Canvas"
    if type(meta) == "table" and type(meta.type) == "string" and #meta.type > 0 then
        nodeType = meta.type
    end

    local fallbackName = depth == 0 and "ContentRoot" or nodeType
    local nodeName = deriveNodeName(meta, fallbackName)

    local basePath = parentPath or ""
    local indexPart = tostring(childIndex or 0)
    local thisPath = basePath == "" and (indexPart .. ":" .. nodeName) or (basePath .. "/" .. indexPart .. ":" .. nodeName)

    local node = {
        name = nodeName,
        type = nodeType,
        children = {},
        canvas = canvas,
        depth = depth,
        x = absX,
        y = absY,
        w = bw or 0,
        h = bh or 0,
        path = thisPath,
        record = record,
    }

    flatOut[#flatOut + 1] = node

    for i, childRecord in ipairs(record.children or {}) do
        local childNode = M.walkStructuredRecords(childRecord, depth + 1, flatOut, absX, absY, thisPath, i - 1, runtime)
        if childNode ~= nil then
            node.children[#node.children + 1] = childNode
        end
    end

    return node
end

function M.valueToText(v)
    local tv = type(v)
    if tv == "number" then
        if math.floor(v) == v then
            return string.format("%d", v)
        end
        return string.format("%.4f", v)
    end
    if tv == "boolean" then
        return v and "true" or "false"
    end
    if tv == "string" then
        return v
    end
    if tv == "function" then
        return "<function>"
    end
    if tv == "table" then
        return "<table>"
    end
    return "<" .. tv .. ">"
end

function M.upperFirst(text)
    if type(text) ~= "string" or #text == 0 then
        return text
    end
    return text:sub(1, 1):upper() .. text:sub(2)
end

function M.splitPath(path)
    local parts = {}
    if type(path) ~= "string" then
        return parts
    end
    for part in string.gmatch(path, "[^%.]+") do
        parts[#parts + 1] = part
    end
    return parts
end

function M.normalizeConfigPath(path)
    if type(path) ~= "string" then
        return ""
    end
    if path:sub(1, 7) == "config." then
        return path:sub(8)
    end
    if path == "config" then
        return ""
    end
    return path
end

function M.getPathTail(path)
    local parts = M.splitPath(path)
    if #parts == 0 then
        return ""
    end
    return parts[#parts]
end

function M.getConfigValueByPath(root, path)
    if type(root) ~= "table" then
        return nil
    end

    local normalized = M.normalizeConfigPath(path)
    if normalized == "" then
        return root
    end

    local parts = M.splitPath(normalized)
    local current = root
    for i = 1, #parts do
        if type(current) ~= "table" then
            return nil
        end
        current = current[parts[i]]
    end
    return current
end

function M.setConfigValueByPath(root, path, value)
    if type(root) ~= "table" then
        return false
    end

    local normalized = M.normalizeConfigPath(path)
    if normalized == "" then
        return false
    end

    local parts = M.splitPath(normalized)
    if #parts == 0 then
        return false
    end

    local current = root
    for i = 1, #parts - 1 do
        local part = parts[i]
        if type(current[part]) ~= "table" then
            return false
        end
        current = current[part]
    end

    current[parts[#parts]] = value
    return true
end

function M.isPathExposed(widget, path)
    if type(widget) ~= "table" or type(widget.getExposedParams) ~= "function" then
        return false
    end
    local exposed = widget:getExposedParams()
    if type(exposed) ~= "table" then
        return false
    end
    for i = 1, #exposed do
        local item = exposed[i]
        if type(item) == "table" and item.path == path then
            return true
        end
    end
    return false
end

function M.getInspectorValue(widget, meta, path)
    -- First check if this is an exposed param on the widget
    if M.isPathExposed(widget, path) then
        if type(widget._getExposed) == "function" then
            local v = widget:_getExposed(path)
            if v ~= nil then
                return v
            end
        end
    end

    -- Fallback to config table
    if type(meta) == "table" and type(meta.config) == "table" then
        return M.getConfigValueByPath(meta.config, path)
    end

    return nil
end

function M.guessEnumOptions(path, value)
    local key = string.lower(M.getPathTail(path) or "")

    if key == "justification" and Justify then
        return {
            { label = "centred", value = Justify.centred },
            { label = "centredLeft", value = Justify.centredLeft },
            { label = "centredRight", value = Justify.centredRight },
            { label = "topLeft", value = Justify.topLeft },
            { label = "topRight", value = Justify.topRight },
            { label = "bottomLeft", value = Justify.bottomLeft },
            { label = "bottomRight", value = Justify.bottomRight },
        }
    end

    if key == "fontstyle" and FontStyle then
        return {
            { label = "plain", value = FontStyle.plain },
            { label = "bold", value = FontStyle.bold },
            { label = "italic", value = FontStyle.italic },
            { label = "boldItalic", value = FontStyle.boldItalic },
        }
    end

    if key == "orientation" then
        return {
            { label = "vertical", value = "vertical" },
            { label = "horizontal", value = "horizontal" },
        }
    end

    if key == "mode" then
        return {
            { label = "layer", value = "layer" },
            { label = "capture", value = "capture" },
            { label = "firstLoop", value = "firstLoop" },
            { label = "freeMode", value = "freeMode" },
            { label = "traditional", value = "traditional" },
        }
    end

    if type(value) == "string" and (value == "left" or value == "right" or value == "center" or value == "centre") then
        return {
            { label = "left", value = "left" },
            { label = "center", value = "center" },
            { label = "right", value = "right" },
        }
    end

    return nil
end

function M.inferEditorType(path, value)
    local t = type(value)
    local key = string.lower(path or "")
    local enumOptions = M.guessEnumOptions(path, value)

    if enumOptions then
        return "enum", enumOptions
    end

    if t == "boolean" then
        return "bool", nil
    end

    if t == "number" then
        if key:find("colour", 1, true) or key:find("color", 1, true) or key:find("bg", 1, true) then
            return "color", nil
        end
        return "number", nil
    end

    if t == "string" then
        return "text", nil
    end

    return nil, nil
end

local CONFIG_KEY_PRIORITY = {
    id = 1,
    name = 2,
    label = 3,
    text = 4,
    value = 5,
    min = 6,
    max = 7,
    step = 8,
    x = 10,
    y = 11,
    w = 12,
    h = 13,
    bg = 20,
    colour = 21,
    color = 21,
    textcolour = 22,
    fontsize = 23,
    fontstyle = 24,
    radius = 25,
    border = 26,
    borderwidth = 27,
    enabled = 30,
}

function M.appendConfigRows(tbl, outRows, prefix, depth, visited)
    if type(tbl) ~= "table" then
        return
    end
    if visited[tbl] then
        return
    end
    visited[tbl] = true

    local keys = {}
    for k, _ in pairs(tbl) do
        keys[#keys + 1] = k
    end

    table.sort(keys, function(a, b)
        local sa = string.lower(tostring(a))
        local sb = string.lower(tostring(b))
        local pa = CONFIG_KEY_PRIORITY[sa] or 999
        local pb = CONFIG_KEY_PRIORITY[sb] or 999
        if pa ~= pb then
            return pa < pb
        end
        return sa < sb
    end)

    for i = 1, #keys do
        local key = keys[i]
        local value = tbl[key]
        local valueType = type(value)
        local keyName = tostring(key)
        local keyText = prefix ~= "" and (prefix .. "." .. keyName) or keyName

        if M.shouldSkipFallbackConfigKey(keyName) then
            goto continue
        end

        if valueType == "string" or valueType == "number" or valueType == "boolean" then
            local editorType, enumOptions = M.inferEditorType(keyText, value)
            outRows[#outRows + 1] = {
                key = keyText,
                value = M.valueToText(value),
                rawValue = value,
                path = keyText,
                isConfig = true,
                editorType = editorType,
                enumOptions = enumOptions,
            }
        elseif valueType == "table" and depth < 1 then
            outRows[#outRows + 1] = {
                key = keyText,
                value = "",
                isConfig = false,
                editorType = nil,
            }
            M.appendConfigRows(value, outRows, keyText, depth + 1, visited)
        elseif valueType ~= "function" then
            outRows[#outRows + 1] = {
                key = keyText,
                value = M.valueToText(value),
                rawValue = value,
                path = keyText,
                isConfig = true,
                editorType = nil,
            }
        end

        ::continue::
    end
end

function M.appendSchemaRows(schema, config, outRows, widget, meta)
    if type(schema) ~= "table" then
        return false
    end

    local hasRows = false
    local currentGroup = nil

    for i = 1, #schema do
        local item = schema[i]
        if type(item) == "table" and type(item.path) == "string" then
            local path = item.path
            local value = M.getInspectorValue(widget, meta, path)
            if value == nil then
                value = M.getConfigValueByPath(config, path)
            end
            if value ~= nil then
                local group = item.group or "Config"
                if group ~= currentGroup then
                    currentGroup = group
                    outRows[#outRows + 1] = {
                        key = group,
                        value = "",
                        isConfig = false,
                        editorType = nil,
                    }
                end

                local editorType = item.type
                local enumOptions = item.options
                if editorType == nil then
                    editorType, enumOptions = M.inferEditorType(path, value)
                end

                outRows[#outRows + 1] = {
                    key = item.label or path,
                    value = M.valueToText(value),
                    rawValue = value,
                    path = "config." .. path,
                    isConfig = true,
                    editorType = editorType,
                    enumOptions = enumOptions,
                    min = item.min,
                    max = item.max,
                    step = item.step,
                    format = item.format,
                }
                hasRows = true
            end
        end
    end

    return hasRows
end

function M.rectsIntersect(ax, ay, aw, ah, bx, by, bw, bh)
    return ax <= bx + bw and ax + aw >= bx and ay <= by + bh and ay + ah >= by
end

function M.rectContainsRect(outerX, outerY, outerW, outerH, innerX, innerY, innerW, innerH)
    return innerX >= outerX and innerY >= outerY
        and (innerX + innerW) <= (outerX + outerW)
        and (innerY + innerH) <= (outerY + outerH)
end

function M.computeGridStep(scale)
    local safeScale = math.max(0.0001, scale or 1.0)
    local targetDesignStep = 18.0 / safeScale
    local step = 1
    while step < targetDesignStep do
        step = step * 2
    end
    return step
end

function M.normalizeArgbNumber(v)
    local n = math.floor((tonumber(v) or 0) + 0.5)
    if n < 0 then
        n = n + 4294967296
    end
    if n < 0 then
        n = 0
    end
    if n > 4294967295 then
        n = 4294967295
    end
    return n
end

function M.argbToRgba(v)
    local n = M.normalizeArgbNumber(v)
    local a = math.floor(n / 16777216) % 256
    local r = math.floor(n / 65536) % 256
    local g = math.floor(n / 256) % 256
    local b = n % 256
    return r, g, b, a
end

function M.rgbaToArgb(r, g, b, a)
    local rr = clamp(math.floor((tonumber(r) or 0) + 0.5), 0, 255)
    local gg = clamp(math.floor((tonumber(g) or 0) + 0.5), 0, 255)
    local bb = clamp(math.floor((tonumber(b) or 0) + 0.5), 0, 255)
    local aa = clamp(math.floor((tonumber(a) or 255) + 0.5), 0, 255)
    return aa * 16777216 + rr * 65536 + gg * 256 + bb
end

function M.shouldSkipFallbackConfigKey(keyText)
    local k = string.lower(keyText or "")
    if k == "" then
        return true
    end
    if string.sub(k, 1, 1) == "_" then
        return true
    end
    if string.sub(k, 1, 3) == "on_" then
        return true
    end
    if k == "rootnode" or k == "callbacks" or k == "schema" then
        return true
    end
    return false
end

function M.deepCopyTable(value, seen)
    if type(value) ~= "table" then
        return value
    end
    seen = seen or {}
    if seen[value] then
        return seen[value]
    end

    local out = {}
    seen[value] = out
    for k, v in pairs(value) do
        out[M.deepCopyTable(k, seen)] = M.deepCopyTable(v, seen)
    end
    return out
end

function M.deepEqual(a, b, visited)
    if a == b then
        return true
    end
    if type(a) ~= type(b) then
        return false
    end
    if type(a) ~= "table" then
        return false
    end

    visited = visited or {}
    local mapA = visited[a]
    if mapA and mapA[b] then
        return true
    end
    if mapA == nil then
        mapA = {}
        visited[a] = mapA
    end
    mapA[b] = true

    for k, v in pairs(a) do
        if not M.deepEqual(v, b[k], visited) then
            return false
        end
    end
    for k, _ in pairs(b) do
        if a[k] == nil then
            return false
        end
    end
    return true
end

function M.collectConfigLeaves(tbl, prefix, out, visited)
    if type(tbl) ~= "table" then
        return
    end
    visited = visited or {}
    if visited[tbl] then
        return
    end
    visited[tbl] = true

    local keys = {}
    for k, _ in pairs(tbl) do
        keys[#keys + 1] = k
    end
    table.sort(keys, function(a, b)
        return tostring(a) < tostring(b)
    end)

    for i = 1, #keys do
        local k = keys[i]
        local v = tbl[k]
        local t = type(v)
        local keyText = prefix == "" and tostring(k) or (prefix .. "." .. tostring(k))
        if t == "table" then
            M.collectConfigLeaves(v, keyText, out, visited)
        elseif t == "number" or t == "string" or t == "boolean" then
            out[#out + 1] = { path = keyText, value = v }
        end
    end
end

return M
