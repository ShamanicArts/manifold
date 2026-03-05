-- shell/runtime_script_utils.lua
-- Runtime/script helpers used by ui_shell.

local W = require("ui_widgets")
local Base = require("shell.base_utils")
local clamp = Base.clamp
local fileStem = Base.fileStem

local M = {}

local RuntimeParamSlider = W.Slider:extend()

function RuntimeParamSlider.new(parent, name, config)
    local self = setmetatable(W.Slider.new(parent, name, config), RuntimeParamSlider)
    self._showValue = false
    self._displayText = config.displayText or ""
    self._editing = false
    self._onCtrlClick = config.on_ctrl_click or config.onCtrlClick
    self._onDragState = config.on_drag_state or config.onDragState
    return self
end

function RuntimeParamSlider:setDisplayText(text)
    self._displayText = text or ""
end

function RuntimeParamSlider:setEditing(editing)
    self._editing = editing == true
end

function RuntimeParamSlider:setVisualRange(minV, maxV, stepV)
    self._min = tonumber(minV) or 0
    self._max = tonumber(maxV) or 1
    if self._max <= self._min then
        self._max = self._min + 1
    end
    self._step = tonumber(stepV) or 0
    self._value = clamp(self._value or self._min, self._min, self._max)
end

function RuntimeParamSlider:onMouseDown(mx, my, shift, ctrl, alt)
    local _ = shift
    _ = alt
    if ctrl and self._onCtrlClick then
        self._onCtrlClick(self._value)
        return
    end
    self._dragging = true
    if self._onDragState then
        self._onDragState(true)
    end
    self:valueFromMouse(mx)
end

function RuntimeParamSlider:onMouseUp(mx, my, shift, ctrl, alt)
    local _ = mx
    _ = my
    _ = shift
    _ = ctrl
    _ = alt
    self._dragging = false
    if self._onDragState then
        self._onDragState(false)
    end
end

function RuntimeParamSlider:onDraw(w, h)
    local t = (self._value - self._min) / math.max(0.0001, self._max - self._min)
    t = clamp(t, 0, 1)

    local bg = self:isEnabled() and 0xff0b1220 or 0xff111827
    local border = self._editing and 0xff38bdf8 or (self:isEnabled() and 0xff334155 or 0xff1f2937)

    gfx.setColour(bg)
    gfx.fillRoundedRect(0, 0, w, h, 3)
    gfx.setColour(border)
    gfx.drawRoundedRect(0, 0, w, h, 3, 1)

    local fillW = math.floor((w - 2) * t)
    if fillW > 0 then
        gfx.setColour(self:isEnabled() and 0xff38bdf8 or 0xff334155)
        gfx.fillRoundedRect(1, 1, fillW, h - 2, 2)
    end

    gfx.setColour(self:isEnabled() and 0xffe2e8f0 or 0xff64748b)
    gfx.setFont(8.5)
    gfx.drawText(self._displayText or "", 2, 0, w - 4, h, Justify.centred)
end

M.RuntimeParamSlider = RuntimeParamSlider

function M.scriptLooksSettings(name, path)
    local n = string.lower(name or "")
    local p = string.lower(path or "")
    return n:find("settings", 1, true) ~= nil or p:find("settings", 1, true) ~= nil
end

function M.scriptLooksGlobal(name, path)
    local n = string.lower(name or "")
    local p = string.lower(path or "")
    if n:find("global", 1, true) or p:find("global", 1, true) then
        return true
    end
    if n:find("shared", 1, true) or p:find("shared", 1, true) then
        return true
    end
    if n:find("system", 1, true) or p:find("system", 1, true) then
        return true
    end
    return false
end

function M.scriptLooksDemo(name, path)
    local n = string.lower(name or "")
    local p = string.lower(path or "")
    if n:find("demo", 1, true) or p:find("demo", 1, true) then
        return true
    end
    if n:find("example", 1, true) or p:find("example", 1, true) then
        return true
    end
    if n:find("test", 1, true) or p:find("test", 1, true) then
        return true
    end
    return false
end

function M.collectActiveSlotHints(params)
    local hints = {}
    if type(params) ~= "table" then
        return hints
    end

    for key, _ in pairs(params) do
        if type(key) == "string" then
            local slot = key:match("^/core/slots/([^/]+)/")
            if type(slot) == "string" and slot ~= "" then
                hints[string.lower(slot)] = true
            end

            local dspNs = key:match("^/dsp/([^/]+)/")
            if type(dspNs) == "string" and dspNs ~= "" then
                hints[string.lower(dspNs)] = true
            end
        end
    end

    if params["/core/behavior/volume"] ~= nil then
        hints["behavior"] = true
        hints["looper"] = true
    end

    return hints
end

function M.scriptMatchesActiveSlot(scriptName, slotHints)
    if type(scriptName) ~= "string" then
        return false
    end

    local s = string.lower(scriptName)
    for slot, _ in pairs(slotHints or {}) do
        if slot == s then
            return true
        end
        if s:find(slot, 1, true) or slot:find(s, 1, true) then
            return true
        end
    end

    return false
end

function M.collectUiContextHints(currentUiPath)
    local hints = {}
    local stem = string.lower(fileStem(currentUiPath or ""))
    if stem == "" then
        return hints
    end

    stem = stem:gsub("_ui$", "")
    for token in stem:gmatch("[a-z0-9]+") do
        if #token >= 3 then
            hints[token] = true
        end
    end

    if next(hints) == nil and #stem >= 3 then
        hints[stem] = true
    end

    return hints
end

function M.scriptMatchesUiContext(name, path, uiContextHints)
    if type(uiContextHints) ~= "table" or next(uiContextHints) == nil then
        return false
    end

    local n = string.lower(name or "")
    local p = string.lower(path or "")
    for token, _ in pairs(uiContextHints) do
        if n == token or n:find(token, 1, true) or p:find(token, 1, true) then
            return true
        end
    end

    return false
end

local function parseNumberOr(text, fallback)
    local n = tonumber(text)
    if n == nil then
        return fallback
    end
    return n
end

function M.parseDspParamDefsFromCode(code)
    local defs = {}
    local src = code or ""
    local byPath = {}

    -- Pass 1: robust path extraction (works with single/double quotes and multiline bodies)
    for path in src:gmatch("ctx%.params%.register%s*%(%s*['\"]([^'\"]+)['\"]") do
        if byPath[path] == nil then
            local d = {
                path = path,
                min = nil,
                max = nil,
                default = nil,
            }
            byPath[path] = d
            defs[#defs + 1] = d
        end
    end

    -- Pass 2: enrich with numeric metadata where easy to parse inline
    for path, body in src:gmatch('ctx%.params%.register%s*%(%s*["\']([^"\']+)["\']%s*,%s*%{(.-)%}%s*%)') do
        local d = byPath[path]
        if d then
            d.min = parseNumberOr(body:match("min%s*=%s*([%-%d%.]+)"), d.min)
            d.max = parseNumberOr(body:match("max%s*=%s*([%-%d%.]+)"), d.max)
            d.default = parseNumberOr(body:match("default%s*=%s*([%-%d%.]+)"), d.default)
        end
    end

    table.sort(defs, function(a, b)
        return (a.path or "") < (b.path or "")
    end)

    return defs
end

function M.parseDspGraphFromCode(code)
    local graph = { nodes = {}, edges = {} }
    local varToIndex = {}
    local src = code or ""

    for varName, primType in src:gmatch("local%s+([%w_]+)%s*=%s*ctx%.primitives%.([%w_]+)%.new") do
        if varToIndex[varName] == nil then
            local idx = #graph.nodes + 1
            varToIndex[varName] = idx
            graph.nodes[idx] = {
                var = varName,
                prim = primType,
            }
        end
    end

    for fromVar, toVar in src:gmatch("ctx%.graph%.connect%s*%(%s*([%w_]+)%s*,%s*([%w_]+)") do
        local fromIdx = varToIndex[fromVar]
        local toIdx = varToIndex[toVar]
        if fromIdx ~= nil and toIdx ~= nil then
            graph.edges[#graph.edges + 1] = {
                from = fromIdx,
                to = toIdx,
            }
        end
    end

    return graph
end

function M.pointInRect(mx, my, rect)
    if type(rect) ~= "table" then
        return false
    end
    return mx >= rect.x and mx <= (rect.x + rect.w) and my >= rect.y and my <= (rect.y + rect.h)
end

function M.formatRuntimeValue(v)
    local t = type(v)
    if t == "number" then
        if math.floor(v) == v then
            return tostring(math.floor(v))
        end
        return string.format("%.4f", v)
    elseif t == "boolean" then
        return v and "true" or "false"
    elseif t == "string" then
        return v
    end
    return ""
end

function M.mapBehaviorPathToSlotPath(path, slotName)
    local p = path or ""
    local slot = slotName or ""
    if slot == "" then
        return p
    end
    if p:sub(1, 15) == "/core/behavior/" then
        return "/core/slots/" .. slot .. p:sub(15)
    end
    return p
end

function M.collectRuntimeParamsForScript(row, params, declaredParams, slotName)
    local out = {}
    if type(row) ~= "table" then
        return out
    end

    local hasEndpointFn = (type(hasEndpoint) == "function") and hasEndpoint or nil
    local getParamFn = (type(getParam) == "function") and getParam or nil

    -- Prefer exact declared paths so scripts loaded by the editor still show
    -- intended params even when context heuristics are imperfect.
    if type(declaredParams) == "table" and #declaredParams > 0 then
        for i = 1, #declaredParams do
            local d = declaredParams[i]
            local p = d and d.path or ""
            if p ~= "" then
                local endpoint = p
                local active = false
                local raw = nil

                if hasEndpointFn then
                    active = hasEndpointFn(endpoint)
                elseif type(params) == "table" then
                    local t = type(params[endpoint])
                    active = (t == "number" or t == "boolean" or t == "string")
                end

                if (not active) and slotName and slotName ~= "" then
                    local mapped = M.mapBehaviorPathToSlotPath(endpoint, slotName)
                    if mapped ~= endpoint then
                        if hasEndpointFn then
                            active = hasEndpointFn(mapped)
                        elseif type(params) == "table" then
                            local t2 = type(params[mapped])
                            active = (t2 == "number" or t2 == "boolean" or t2 == "string")
                        end
                        if active then
                            endpoint = mapped
                        end
                    end
                end

                local numericValue = nil
                if active then
                    if getParamFn then
                        raw = getParamFn(endpoint)
                    elseif type(params) == "table" then
                        raw = params[endpoint]
                    end
                    if type(raw) == "number" then
                        numericValue = raw
                    end
                end

                out[#out + 1] = {
                    path = p,
                    endpointPath = endpoint,
                    value = active and M.formatRuntimeValue(raw) or "<inactive>",
                    active = active,
                    numericValue = numericValue,
                    min = d.min,
                    max = d.max,
                    step = d.step,
                }
            end
        end
        return out
    end

    if type(params) ~= "table" then
        return out
    end

    local name = string.lower(row.name or fileStem(row.path or "") or "")
    local tokens = {}
    for t in name:gmatch("[a-z0-9]+") do
        if #t >= 3 and t ~= "dsp" and t ~= "script" and t ~= "primitives" then
            tokens[t] = true
        end
    end

    local prefixes = {}
    local function addPrefix(p)
        if type(p) == "string" and p ~= "" then
            prefixes[#prefixes + 1] = p
        end
    end

    if tokens["looper"] then
        addPrefix("/core/behavior/")
        addPrefix("/dsp/looper/")
    end

    for token, _ in pairs(tokens) do
        addPrefix("/core/slots/" .. token .. "/")
        addPrefix("/dsp/" .. token .. "/")
    end

    if #prefixes == 0 then
        addPrefix("/dsp/")
    end

    local seen = {}
    local keys = {}
    for k, _ in pairs(params) do
        if type(k) == "string" then
            keys[#keys + 1] = k
        end
    end
    table.sort(keys)

    for i = 1, #keys do
        local key = keys[i]
        local raw = params[key]
        local t = type(raw)
        if t == "number" or t == "boolean" or t == "string" then
            local include = false
            for p = 1, #prefixes do
                local pref = prefixes[p]
                if key:sub(1, #pref) == pref then
                    include = true
                    break
                end
            end
            if include and not seen[key] then
                seen[key] = true
                out[#out + 1] = {
                    path = key,
                    endpointPath = key,
                    value = M.formatRuntimeValue(raw),
                    active = true,
                    numericValue = (type(raw) == "number") and raw or nil,
                }
            end
        end
    end

    return out
end

return M
