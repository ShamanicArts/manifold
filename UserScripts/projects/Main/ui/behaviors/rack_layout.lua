local M = {}

local function shallowCopyArray(values)
  local out = {}
  if type(values) ~= "table" then
    return out
  end
  for i = 1, #values do
    out[i] = values[i]
  end
  return out
end

local function deepCopy(value)
  if type(value) ~= "table" then
    return value
  end
  local out = {}
  for k, v in pairs(value) do
    out[k] = deepCopy(v)
  end
  return out
end

local function clampInt(value, fallback, minimum)
  local n = math.floor(tonumber(value) or fallback or 0)
  if minimum ~= nil and n < minimum then
    return minimum
  end
  return n
end

local function compareNodeOrder(a, b)
  local ac = tonumber(a.col) or 0
  local bc = tonumber(b.col) or 0
  if ac ~= bc then
    return ac < bc
  end
  return tostring(a.id or "") < tostring(b.id or "")
end

local function sanitizeUtilitySlot(slot, fallbackKind, fallbackVariant)
  local value = type(slot) == "table" and deepCopy(slot) or {}
  local kind = type(value.kind) == "string" and value.kind ~= "" and value.kind or (fallbackKind or "keyboard")
  local variant = type(value.variant) == "string" and value.variant ~= "" and value.variant or (fallbackVariant or "full")
  return {
    kind = kind,
    variant = variant,
  }
end

function M.defaultUtilityDock()
  return {
    visible = true,
    mode = "full_keyboard",
    heightMode = "full",
    layoutMode = "single",
    primary = { kind = "keyboard", variant = "full" },
    secondary = nil,
  }
end

function M.defaultRackState()
  return {
    viewMode = "perf",
    densityMode = "normal",
    utilityDock = M.defaultUtilityDock(),
    rowCount = 3,
    modules = {},
  }
end

function M.sanitizeUtilityDock(dock)
  local defaults = M.defaultUtilityDock()
  local value = type(dock) == "table" and deepCopy(dock) or {}

  if value.visible == nil then value.visible = defaults.visible end
  if type(value.mode) ~= "string" or value.mode == "" then value.mode = defaults.mode end
  if type(value.heightMode) ~= "string" or value.heightMode == "" then value.heightMode = defaults.heightMode end
  if type(value.layoutMode) ~= "string" or value.layoutMode == "" then value.layoutMode = defaults.layoutMode end

  local visible = value.visible ~= false
  local mode = value.mode
  local heightMode = value.heightMode
  local layoutMode = value.layoutMode

  if heightMode ~= "collapsed" and heightMode ~= "compact" and heightMode ~= "full" then
    heightMode = defaults.heightMode
  end
  if layoutMode ~= "single" and layoutMode ~= "split" then
    layoutMode = defaults.layoutMode
  end

  local primary = value.primary
  local secondary = value.secondary

  if mode == "hidden" then
    visible = false
  elseif mode == "compact_keyboard" then
    primary = { kind = "keyboard", variant = "compact" }
    if heightMode == "full" then heightMode = "compact" end
    mode = "keyboard"
  elseif mode == "full_keyboard" then
    primary = { kind = "keyboard", variant = "full" }
    mode = "keyboard"
  elseif mode == "keyboard" then
    primary = primary or { kind = "keyboard", variant = (heightMode == "compact" and "compact" or "full") }
  end

  primary = sanitizeUtilitySlot(primary, defaults.primary.kind, (heightMode == "compact" and "compact" or defaults.primary.variant))
  if primary.kind == "keyboard" and (primary.variant ~= "compact" and primary.variant ~= "full") then
    primary.variant = heightMode == "compact" and "compact" or "full"
  end

  local normalizedSecondary = nil
  if type(secondary) == "table" then
    normalizedSecondary = sanitizeUtilitySlot(secondary, "utility", "compact")
  end

  if layoutMode == "single" then
    normalizedSecondary = nil
  end

  return {
    visible = visible,
    mode = mode,
    heightMode = heightMode,
    layoutMode = layoutMode,
    primary = primary,
    secondary = normalizedSecondary,
  }
end

function M.sanitizeRackState(state)
  local defaults = M.defaultRackState()
  local source = type(state) == "table" and state or {}
  local modules = {}
  for i = 1, #(source.modules or {}) do
    modules[i] = M.makeRackModuleInstance(source.modules[i])
  end
  local maxRow = -1
  for i = 1, #modules do
    local row = math.max(0, tonumber(modules[i] and modules[i].row or 0) or 0)
    if row > maxRow then
      maxRow = row
    end
  end
  local derivedRowCount = math.max(1, maxRow + 1)
  local requestedRowCount = math.max(0, clampInt(source.rowCount, defaults.rowCount, 0))

  return {
    viewMode = type(source.viewMode) == "string" and source.viewMode or defaults.viewMode,
    densityMode = type(source.densityMode) == "string" and source.densityMode or defaults.densityMode,
    utilityDock = M.sanitizeUtilityDock(source.utilityDock),
    rowCount = math.max(defaults.rowCount, requestedRowCount, derivedRowCount),
    modules = modules,
  }
end

function M.makeRackModuleSpec(spec)
  assert(type(spec) == "table", "module spec must be a table")
  assert(type(spec.id) == "string" and spec.id ~= "", "module spec id required")

  return {
    id = spec.id,
    name = type(spec.name) == "string" and spec.name or spec.id,
    validSizes = shallowCopyArray(spec.validSizes or { "1x1" }),
    ports = deepCopy(spec.ports or { inputs = {}, outputs = {}, params = {} }),
    renderers = deepCopy(spec.renderers or {}),
    accentColor = spec.accentColor,
    meta = deepCopy(spec.meta or {}),
  }
end

function M.makeRackModuleInstance(module)
  assert(type(module) == "table", "module instance must be a table")
  assert(type(module.id) == "string" and module.id ~= "", "module instance id required")

  return {
    id = module.id,
    row = clampInt(module.row, 0, 0),
    col = clampInt(module.col, 0, 0),
    w = clampInt(module.w, 1, 1),
    h = clampInt(module.h, 1, 1),
    sizeKey = type(module.sizeKey) == "string" and module.sizeKey or nil,
    meta = deepCopy(module.meta or {}),
  }
end

function M.makeRackConnection(connection)
  assert(type(connection) == "table", "connection must be a table")
  assert(type(connection.id) == "string" and connection.id ~= "", "connection id required")
  assert(type(connection.from) == "table", "connection.from required")
  assert(type(connection.to) == "table", "connection.to required")
  assert(type(connection.from.moduleId) == "string" and connection.from.moduleId ~= "", "connection.from.moduleId required")
  assert(type(connection.to.moduleId) == "string" and connection.to.moduleId ~= "", "connection.to.moduleId required")

  return {
    id = connection.id,
    kind = type(connection.kind) == "string" and connection.kind or "audio",
    from = {
      moduleId = connection.from.moduleId,
      portId = connection.from.portId,
    },
    to = {
      moduleId = connection.to.moduleId,
      portId = connection.to.portId,
    },
    meta = deepCopy(connection.meta or {}),
  }
end

function M.cloneRackModules(modules)
  local out = {}
  if type(modules) ~= "table" then
    return out
  end
  for i = 1, #modules do
    out[i] = M.makeRackModuleInstance(modules[i])
  end
  return out
end

function M.cloneConnections(connections)
  local out = {}
  if type(connections) ~= "table" then
    return out
  end
  for i = 1, #connections do
    out[i] = M.makeRackConnection(connections[i])
  end
  return out
end

function M.findRackModuleIndex(modules, moduleId)
  if type(modules) ~= "table" then
    return nil
  end
  for i = 1, #modules do
    if modules[i] and modules[i].id == moduleId then
      return i
    end
  end
  return nil
end

function M.cellsForRackModule(module)
  local item = M.makeRackModuleInstance(module)
  local cells = {}
  for row = item.row, item.row + item.h - 1 do
    for col = item.col, item.col + item.w - 1 do
      cells[#cells + 1] = {
        row = row,
        col = col,
        moduleId = item.id,
      }
    end
  end
  return cells
end

function M.buildOccupancy(modules, ignoredModuleId)
  local occupancy = {
    cells = {},
    collisions = {},
  }

  if type(modules) ~= "table" then
    return occupancy
  end

  for i = 1, #modules do
    local module = modules[i]
    if module and module.id ~= ignoredModuleId then
      local cells = M.cellsForRackModule(module)
      for j = 1, #cells do
        local cell = cells[j]
        local key = tostring(cell.row) .. ":" .. tostring(cell.col)
        local existing = occupancy.cells[key]
        if existing then
          occupancy.collisions[#occupancy.collisions + 1] = {
            key = key,
            row = cell.row,
            col = cell.col,
            existingModuleId = existing,
            moduleId = cell.moduleId,
          }
        else
          occupancy.cells[key] = cell.moduleId
        end
      end
    end
  end

  return occupancy
end

function M.isAreaFree(modules, row, col, w, h, ignoredModuleId)
  local occupancy = M.buildOccupancy(modules, ignoredModuleId)
  local rr = clampInt(row, 0, 0)
  local cc = clampInt(col, 0, 0)
  local ww = clampInt(w, 1, 1)
  local hh = clampInt(h, 1, 1)

  for r = rr, rr + hh - 1 do
    for c = cc, cc + ww - 1 do
      local key = tostring(r) .. ":" .. tostring(c)
      if occupancy.cells[key] ~= nil then
        return false
      end
    end
  end

  return true
end

function M.getRowModules(modules, row)
  local out = {}
  if type(modules) ~= "table" then
    return out
  end
  local targetRow = clampInt(row, 0, 0)
  for i = 1, #modules do
    local module = modules[i]
    if module and clampInt(module.row, 0, 0) == targetRow then
      out[#out + 1] = M.makeRackModuleInstance(module)
    end
  end
  table.sort(out, compareNodeOrder)
  return out
end

local function replaceRowNodes(allModules, row, rowModules)
  local targetRow = clampInt(row, 0, 0)
  local out = {}
  if type(allModules) == "table" then
    for i = 1, #allModules do
      local module = allModules[i]
      if module and clampInt(module.row, 0, 0) ~= targetRow then
        out[#out + 1] = M.makeRackModuleInstance(module)
      end
    end
  end
  for i = 1, #rowModules do
    out[#out + 1] = M.makeRackModuleInstance(rowModules[i])
  end
  return out
end

function M.packRow(modules, row)
  local rowModules = M.getRowModules(modules, row)
  local cursor = 0
  for i = 1, #rowModules do
    rowModules[i].col = cursor
    cursor = cursor + rowModules[i].w
  end
  return replaceRowNodes(modules, row, rowModules)
end

function M.moveModuleWithinRow(modules, moduleId, targetIndex)
  local allModules = M.cloneRackModules(modules)
  local sourceIndex = M.findRackModuleIndex(allModules, moduleId)
  assert(sourceIndex ~= nil, "module not found for same-row move: " .. tostring(moduleId))

  local module = allModules[sourceIndex]
  local row = module.row
  local rowModules = M.getRowModules(allModules, row)
  local movingIndex = nil
  for i = 1, #rowModules do
    if rowModules[i].id == moduleId then
      movingIndex = i
      break
    end
  end
  assert(movingIndex ~= nil, "row module not found for same-row move: " .. tostring(moduleId))

  local moving = rowModules[movingIndex]
  table.remove(rowModules, movingIndex)

  local clampedTarget = clampInt(targetIndex, #rowModules + 1, 1)
  if clampedTarget > (#rowModules + 1) then
    clampedTarget = #rowModules + 1
  end
  table.insert(rowModules, clampedTarget, moving)

  local cursor = 0
  for i = 1, #rowModules do
    rowModules[i].row = row
    rowModules[i].col = cursor
    cursor = cursor + rowModules[i].w
  end

  return replaceRowNodes(allModules, row, rowModules)
end

function M.getFlowModules(modules)
  local out = M.cloneRackModules(modules)
  table.sort(out, function(a, b)
    local ar = clampInt(a.row, 0, 0)
    local br = clampInt(b.row, 0, 0)
    if ar ~= br then
      return ar < br
    end
    local ac = tonumber(a.col) or 0
    local bc = tonumber(b.col) or 0
    if ac ~= bc then
      return ac < bc
    end
    return tostring(a.id or "") < tostring(b.id or "")
  end)
  return out
end

function M.wrapFlowModules(modules, columnsPerRow, startRow)
  local ordered = M.cloneRackModules(modules)
  local maxCols = math.max(1, clampInt(columnsPerRow, 5, 1))
  local row = clampInt(startRow, 0, 0)
  local cursor = 0

  for i = 1, #ordered do
    local node = ordered[i]
    local width = math.max(1, clampInt(node.w, 1, 1))
    if width > maxCols then
      width = maxCols
      node.w = width
    end
    if cursor > 0 and (cursor + width) > maxCols then
      row = row + 1
      cursor = 0
    end
    node.row = row
    node.col = cursor
    cursor = cursor + width
  end

  return ordered
end

function M.moveModuleInFlow(modules, moduleId, targetIndex, columnsPerRow, startRow)
  local ordered = M.getFlowModules(modules)
  local movingIndex = nil
  for i = 1, #ordered do
    if ordered[i].id == moduleId then
      movingIndex = i
      break
    end
  end
  assert(movingIndex ~= nil, "flow module not found for move: " .. tostring(moduleId))

  local moving = ordered[movingIndex]
  table.remove(ordered, movingIndex)

  local clampedTarget = clampInt(targetIndex, #ordered + 1, 1)
  if clampedTarget > (#ordered + 1) then
    clampedTarget = #ordered + 1
  end
  table.insert(ordered, clampedTarget, moving)

  return M.wrapFlowModules(ordered, columnsPerRow, startRow)
end

function M.wrapFlowModulesWithMinRows(modules, columnsPerRow, startRow, minRows)
  local ordered = M.cloneRackModules(modules)
  local maxCols = math.max(1, clampInt(columnsPerRow, 5, 1))
  local row = clampInt(startRow, 0, 0)
  local cursor = 0
  local minRowById = type(minRows) == "table" and minRows or {}

  for i = 1, #ordered do
    local node = ordered[i]
    local width = math.max(1, clampInt(node.w, 1, 1))
    if width > maxCols then
      width = maxCols
      node.w = width
    end

    local nodeMinRow = clampInt(minRowById[tostring(node.id or "")], row, 0)
    if row < nodeMinRow then
      row = nodeMinRow
      cursor = 0
    end

    if cursor > 0 and (cursor + width) > maxCols then
      row = row + 1
      cursor = 0
      if row < nodeMinRow then
        row = nodeMinRow
      end
    end

    node.row = row
    node.col = cursor
    cursor = cursor + width
  end

  return ordered
end

function M.moveModuleInFlowConstrained(modules, moduleId, targetIndex, columnsPerRow, startRow, minRows)
  local ordered = M.getFlowModules(modules)
  local movingIndex = nil
  for i = 1, #ordered do
    if ordered[i].id == moduleId then
      movingIndex = i
      break
    end
  end
  assert(movingIndex ~= nil, "flow module not found for constrained move: " .. tostring(moduleId))

  local moving = ordered[movingIndex]
  table.remove(ordered, movingIndex)

  local clampedTarget = clampInt(targetIndex, #ordered + 1, 1)
  if clampedTarget > (#ordered + 1) then
    clampedTarget = #ordered + 1
  end
  table.insert(ordered, clampedTarget, moving)

  return M.wrapFlowModulesWithMinRows(ordered, columnsPerRow, startRow, minRows)
end

function M.relocateModuleToRow(modules, moduleId, targetRow, targetIndex, columnsPerRow)
  local allModules = M.cloneRackModules(modules)
  local sourceIndex = M.findRackModuleIndex(allModules, moduleId)
  assert(sourceIndex ~= nil, "module not found for row relocation: " .. tostring(moduleId))

  local moving = allModules[sourceIndex]
  local sourceRow = moving.row
  moving.row = clampInt(targetRow, sourceRow, 0)
  moving.col = 0
  allModules[sourceIndex] = moving

  local sourcePacked = M.packRow(allModules, sourceRow)
  local destinationModules = M.getRowModules(sourcePacked, moving.row)

  local withoutMoving = {}
  for i = 1, #destinationModules do
    if destinationModules[i].id ~= moving.id then
      withoutMoving[#withoutMoving + 1] = destinationModules[i]
    end
  end

  local clampedTarget = clampInt(targetIndex, #withoutMoving + 1, 1)
  if clampedTarget > (#withoutMoving + 1) then
    clampedTarget = #withoutMoving + 1
  end
  table.insert(withoutMoving, clampedTarget, moving)

  local maxCols = columnsPerRow ~= nil and math.max(1, clampInt(columnsPerRow, 1, 1)) or nil
  local cursor = 0
  for i = 1, #withoutMoving do
    local width = math.max(1, clampInt(withoutMoving[i].w, 1, 1))
    withoutMoving[i].row = moving.row
    withoutMoving[i].col = cursor
    cursor = cursor + width
  end

  if maxCols ~= nil and cursor > maxCols then
    return nil
  end

  return replaceRowNodes(sourcePacked, moving.row, withoutMoving)
end

local function comparePosition(a, b)
  local ar = clampInt(a and a.row, 0, 0)
  local br = clampInt(b and b.row, 0, 0)
  if ar ~= br then
    return ar < br
  end
  local ac = clampInt(a and a.col, 0, 0)
  local bc = clampInt(b and b.col, 0, 0)
  return ac < bc
end

local function maxPosition(a, b)
  if comparePosition(a, b) then
    return { row = clampInt(b and b.row, 0, 0), col = clampInt(b and b.col, 0, 0) }
  end
  return { row = clampInt(a and a.row, 0, 0), col = clampInt(a and a.col, 0, 0) }
end

local function nextPositionAfter(node, columnsPerRow)
  local maxCols = math.max(1, clampInt(columnsPerRow, 1, 1))
  local row = clampInt(node and node.row, 0, 0)
  local col = clampInt(node and node.col, 0, 0) + math.max(1, clampInt(node and node.w, 1, 1))
  if col >= maxCols then
    row = row + math.floor(col / maxCols)
    col = col % maxCols
  end
  return { row = row, col = col }
end

local function findFirstFitForward(nodes, node, startRow, startCol, columnsPerRow, maxRows)
  local maxCols = math.max(1, clampInt(columnsPerRow, 1, 1))
  local rowsLimit = math.max(1, clampInt(maxRows, 3, 1))
  local width = math.max(1, clampInt(node and node.w, 1, 1))
  local height = math.max(1, clampInt(node and node.h, 1, 1))
  if width > maxCols then
    return nil
  end

  local row = clampInt(startRow, 0, 0)
  local col = clampInt(startCol, 0, 0)
  if col > (maxCols - width) then
    row = row + 1
    col = 0
  end

  while row < rowsLimit do
    local maxStartCol = maxCols - width
    while col <= maxStartCol do
      if (row + height) <= rowsLimit and M.isAreaFree(nodes, row, col, width, height, node and node.id or nil) then
        return { row = row, col = col }
      end
      col = col + 1
    end
    row = row + 1
    col = 0
  end

  return nil
end

function M.moveModuleWithSparseFlow(modules, moduleId, targetRow, targetCol, columnsPerRow, maxRows)
  local allModules = M.cloneRackModules(modules)
  local sourceIndex = M.findRackModuleIndex(allModules, moduleId)
  assert(sourceIndex ~= nil, "module not found for sparse slot move: " .. tostring(moduleId))

  local moving = M.makeRackModuleInstance(allModules[sourceIndex])
  table.remove(allModules, sourceIndex)

  local maxCols = math.max(1, clampInt(columnsPerRow, 1, 1))
  local rowsLimit = math.max(1, clampInt(maxRows, 3, 1))
  local movingWidth = math.max(1, clampInt(moving.w, 1, 1))
  local targetPos = {
    row = clampInt(targetRow, moving.row, 0),
    col = math.max(0, math.min(maxCols - movingWidth, clampInt(targetCol, moving.col, 0))),
  }

  local ordered = M.getFlowModules(allModules)
  local prefix = {}
  local suffix = {}
  for i = 1, #ordered do
    local module = ordered[i]
    local moduleEndCol = clampInt(module.col, 0, 0) + math.max(1, clampInt(module.w, 1, 1))
    local isBefore = (clampInt(module.row, 0, 0) < targetPos.row)
      or (clampInt(module.row, 0, 0) == targetPos.row and moduleEndCol <= targetPos.col)
    if isBefore then
      prefix[#prefix + 1] = M.makeRackModuleInstance(module)
    else
      suffix[#suffix + 1] = M.makeRackModuleInstance(module)
    end
  end

  local placed = M.cloneRackModules(prefix)
  local movingPlacement = findFirstFitForward(placed, moving, targetPos.row, targetPos.col, maxCols, rowsLimit)
  if movingPlacement == nil then
    return nil
  end
  moving.row = movingPlacement.row
  moving.col = movingPlacement.col
  placed[#placed + 1] = moving

  local cursor = nextPositionAfter(moving, maxCols)
  for i = 1, #suffix do
    local module = suffix[i]
    local desired = { row = clampInt(module.row, 0, 0), col = clampInt(module.col, 0, 0) }
    local earliest = maxPosition(desired, cursor)
    local placement = findFirstFitForward(placed, module, earliest.row, earliest.col, maxCols, rowsLimit)
    if placement == nil then
      return nil
    end
    module.row = placement.row
    module.col = placement.col
    placed[#placed + 1] = module
    cursor = nextPositionAfter(module, maxCols)
  end

  return M.getFlowModules(placed)
end

function M.moveModuleToSlot(modules, moduleId, targetRow, targetCol, columnsPerRow, maxRows)
  return M.moveModuleWithSparseFlow(modules, moduleId, targetRow, targetCol, columnsPerRow, maxRows)
end

local function serializeLuaValue(value, indent)
  local t = type(value)
  indent = indent or ""

  if t == "nil" then
    return "nil"
  end
  if t == "number" or t == "boolean" then
    return tostring(value)
  end
  if t == "string" then
    return string.format("%q", value)
  end
  if t ~= "table" then
    error("unsupported Lua serialization type: " .. t)
  end

  local isArray = true
  local count = 0
  local maxIndex = 0
  for k, _ in pairs(value) do
    if type(k) ~= "number" or k < 1 or math.floor(k) ~= k then
      isArray = false
      break
    end
    count = count + 1
    if k > maxIndex then maxIndex = k end
  end
  if isArray and maxIndex ~= count then
    isArray = false
  end

  local nextIndent = indent .. "  "
  if isArray then
    if count == 0 then
      return "{}"
    end
    local out = { "{" }
    for i = 1, count do
      out[#out + 1] = nextIndent .. serializeLuaValue(value[i], nextIndent) .. ","
    end
    out[#out + 1] = indent .. "}"
    return table.concat(out, "\n")
  end

  local keys = {}
  for k, _ in pairs(value) do
    keys[#keys + 1] = k
  end
  table.sort(keys, function(a, b)
    return tostring(a) < tostring(b)
  end)

  if #keys == 0 then
    return "{}"
  end

  local out = { "{" }
  for i = 1, #keys do
    local key = keys[i]
    local keyText
    if type(key) == "string" and key:match("^[%a_][%w_]*$") then
      keyText = key
    else
      keyText = "[" .. serializeLuaValue(key, nextIndent) .. "]"
    end
    out[#out + 1] = nextIndent .. keyText .. " = " .. serializeLuaValue(value[key], nextIndent) .. ","
  end
  out[#out + 1] = indent .. "}"
  return table.concat(out, "\n")
end

function M.serializeLuaLiteral(value)
  return serializeLuaValue(value, "")
end

return M
