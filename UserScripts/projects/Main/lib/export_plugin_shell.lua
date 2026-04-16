local ExportPluginShell = {}

local SYNC_INTERVAL = 0.15
local REMOTE_DISCOVERY_HOST = "127.0.0.1"
local DEFAULT_REMOTE_DISCOVERY_PORT = 18081
local REMOTE_DISCOVERY_INTERVAL = 1.0
local REMOTE_DISCOVERY_REGISTER_PATH = "/manifold/remote/register"
local REMOTE_DISCOVERY_UNREGISTER_PATH = "/manifold/remote/unregister"

local function safeGetTime()
  return type(getTime) == "function" and getTime() or 0
end

local function ensureRemoteDiscoveryState()
  if type(_G) ~= "table" then
    return nil
  end
  local state = rawget(_G, "__manifoldRemoteDiscoveryStatus")
  if type(state) ~= "table" then
    state = {}
    rawset(_G, "__manifoldRemoteDiscoveryStatus", state)
  end
  return state
end

local function updateRemoteDiscoveryState(fields)
  local state = ensureRemoteDiscoveryState()
  if type(state) ~= "table" or type(fields) ~= "table" then
    return
  end
  for key, value in pairs(fields) do
    state[key] = value
  end
end

local function getRemoteDiscoveryPort()
  local state = ensureRemoteDiscoveryState()
  local port = math.floor((tonumber(type(state) == "table" and state.port or DEFAULT_REMOTE_DISCOVERY_PORT) or DEFAULT_REMOTE_DISCOVERY_PORT) + 0.5)
  if port < 1 then
    return DEFAULT_REMOTE_DISCOVERY_PORT
  end
  if port > 65535 then
    return 65535
  end
  return port
end

local function setRemoteDiscoveryPort(port)
  local state = ensureRemoteDiscoveryState()
  local previousPort = getRemoteDiscoveryPort()
  local queryPort = math.floor(tonumber(type(state) == "table" and state.queryPort or 0) or 0)
  local oscPort = math.floor(tonumber(type(state) == "table" and state.oscPort or 0) or 0)

  local n = math.floor((tonumber(port) or DEFAULT_REMOTE_DISCOVERY_PORT) + 0.5)
  if n < 1 then
    n = 1
  elseif n > 65535 then
    n = 65535
  end

  if previousPort ~= n and queryPort > 0 and type(osc) == "table" and type(osc.sendTo) == "function" then
    pcall(function()
      osc.sendTo(REMOTE_DISCOVERY_HOST,
                 previousPort,
                 REMOTE_DISCOVERY_UNREGISTER_PATH,
                 queryPort,
                 oscPort)
    end)
  end

  updateRemoteDiscoveryState({
    port = n,
    advertising = false,
  })
  return n
end

local function currentOscSettings()
  return type(osc) == "table" and type(osc.getSettings) == "function" and osc.getSettings() or nil
end

local function sendRemoteDiscoveryPacket(path, queryPort, inputPort)
  local remotePort = getRemoteDiscoveryPort()
  if type(osc) ~= "table" or type(osc.sendTo) ~= "function" then
    return false
  end
  local ok = pcall(function()
    osc.sendTo(REMOTE_DISCOVERY_HOST,
               remotePort,
               path,
               queryPort,
               inputPort)
  end)
  return ok
end

local function sendRemoteDiscoveryUnregister(queryPort, inputPort)
  queryPort = math.floor(tonumber(queryPort) or 0)
  inputPort = math.floor(tonumber(inputPort) or 0)
  if queryPort <= 0 then
    return false
  end
  local ok = sendRemoteDiscoveryPacket(REMOTE_DISCOVERY_UNREGISTER_PATH, queryPort, inputPort)
  updateRemoteDiscoveryState({
    advertising = false,
    lastUnregisterTime = safeGetTime(),
  })
  return ok
end

local function sendRemoteDiscoveryHeartbeat()
  local state = ensureRemoteDiscoveryState()
  local settings = currentOscSettings()
  local now = safeGetTime()
  local queryEnabled = type(settings) == "table" and settings.oscQueryEnabled == true
  local queryPort = math.floor(tonumber(type(settings) == "table" and settings.queryPort or 0) or 0)
  local inputPort = math.floor(tonumber(type(settings) == "table" and settings.inputPort or 0) or 0)

  local remotePort = getRemoteDiscoveryPort()
  local lastQueryPort = math.floor(tonumber(type(state) == "table" and state.queryPort or 0) or 0)
  local lastOscPort = math.floor(tonumber(type(state) == "table" and state.oscPort or 0) or 0)

  updateRemoteDiscoveryState({
    host = REMOTE_DISCOVERY_HOST,
    port = remotePort,
    advertising = false,
    queryEnabled = queryEnabled,
    queryPort = queryPort,
    oscPort = inputPort,
  })

  if not queryEnabled or queryPort <= 0 then
    if lastQueryPort > 0 then
      sendRemoteDiscoveryUnregister(lastQueryPort, lastOscPort)
      updateRemoteDiscoveryState({
        queryPort = 0,
        oscPort = 0,
      })
    end
    return false
  end

  if lastQueryPort > 0 and lastQueryPort ~= queryPort then
    sendRemoteDiscoveryUnregister(lastQueryPort, lastOscPort)
  end

  local ok = sendRemoteDiscoveryPacket(REMOTE_DISCOVERY_REGISTER_PATH, queryPort, inputPort)

  updateRemoteDiscoveryState({
    advertising = ok,
    lastAttemptTime = now,
    lastSuccessTime = ok and now or (state and state.lastSuccessTime or 0),
    queryPort = queryPort,
    oscPort = inputPort,
  })

  return ok
end

function ExportPluginShell.build(options)
  options = type(options) == "table" and options or {}

  local discoveryState = ensureRemoteDiscoveryState()
  if type(discoveryState) == "table" then
    discoveryState.host = REMOTE_DISCOVERY_HOST
    discoveryState.port = getRemoteDiscoveryPort()
    discoveryState.advertising = false
    discoveryState.lastAttemptTime = discoveryState.lastAttemptTime or 0
    discoveryState.lastSuccessTime = discoveryState.lastSuccessTime or 0
  end

  local rootId = tostring(options.rootId or "export_plugin_root")
  local title = tostring(options.title or "Export")
  local accent = tonumber(options.accent) or 0xff22d3ee
  local width = math.max(1, math.floor(tonumber(options.width) or 472))
  local height = math.max(1, math.floor(tonumber(options.height) or 220))
  local headerHeight = math.max(1, math.floor(tonumber(options.headerHeight) or 12))
  local contentWidth = math.max(1, math.floor(tonumber(options.contentWidth) or width))
  local contentHeight = math.max(1, math.floor(tonumber(options.contentHeight) or (height - headerHeight)))
  local moduleId = tostring(options.moduleId or "module_component")
  local moduleBehavior = tostring(options.moduleBehavior or "")
  local moduleRef = tostring(options.moduleRef or "")
  local moduleProps = type(options.moduleProps) == "table" and options.moduleProps or {}

  if moduleBehavior == "" then
    error("export_plugin_shell.build: moduleBehavior is required")
  end
  if moduleRef == "" then
    error("export_plugin_shell.build: moduleRef is required")
  end

  return {
    id = rootId,
    type = "Panel",
    x = 0,
    y = 0,
    w = width,
    h = height,
    behavior = "../Main/ui/behaviors/export_shell.lua",
    props = {
      moduleComponentId = moduleId,
      contentW = contentWidth,
      contentH = contentHeight,
    },
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
        w = width,
        h = headerHeight,
        style = { bg = 0xff111827, radius = 0 },
      },
      {
        id = "header_accent",
        type = "Panel",
        x = 0,
        y = 0,
        w = 18,
        h = headerHeight,
        style = { bg = accent, radius = 0 },
      },
      {
        id = "title",
        type = "Label",
        x = 24,
        y = 0,
        w = math.max(80, width - 88),
        h = headerHeight,
        props = { text = title },
        style = { colour = 0xffffffff, fontSize = 9, bg = 0x00000000 },
      },
      {
        id = "dev_button",
        type = "Toggle",
        x = math.max(0, width - 60),
        y = 0,
        w = 60,
        h = headerHeight,
        props = { value = false, onLabel = "SET", offLabel = "SET" },
        style = { onColour = 0xff475569, offColour = 0x20ffffff, textColour = 0xffffffff, fontSize = 8, radius = 0 },
      },
      {
        id = "content_bg",
        type = "Panel",
        x = 0,
        y = headerHeight,
        w = width,
        h = math.max(1, height - headerHeight),
        style = { bg = 0xff0b1220, radius = 0 },
      },
    },
    components = {
      {
        id = moduleId,
        x = 0,
        y = headerHeight,
        w = width,
        h = contentHeight,
        behavior = moduleBehavior,
        ref = moduleRef,
        props = moduleProps,
      },
      {
        id = "settings_overlay",
        x = 0,
        y = headerHeight,
        w = width,
        h = contentHeight,
        behavior = "../Main/ui/behaviors/export_settings_panel.lua",
        ref = "../Main/ui/components/export_settings_panel.ui.lua",
        props = {},
      },
      {
        id = "perf_overlay",
        x = 0,
        y = headerHeight,
        w = width,
        h = contentHeight,
        behavior = "../Main/ui/behaviors/export_perf_overlay.lua",
        ref = "../Main/ui/components/export_perf_overlay.ui.lua",
        props = {},
      },
    },
  }
end

function ExportPluginShell.remoteDiscoveryUpdate(ctx)
  ctx = type(ctx) == "table" and ctx or {}
  local now = safeGetTime()
  local last = tonumber(ctx._lastRemoteDiscoveryTime or 0) or 0
  if now == 0 or now - last >= REMOTE_DISCOVERY_INTERVAL then
    ctx._lastRemoteDiscoveryTime = now
    sendRemoteDiscoveryHeartbeat()
  end
end

function ExportPluginShell.remoteDiscoveryShutdown()
  local state = ensureRemoteDiscoveryState()
  local queryPort = math.floor(tonumber(type(state) == "table" and state.queryPort or 0) or 0)
  local oscPort = math.floor(tonumber(type(state) == "table" and state.oscPort or 0) or 0)
  if queryPort > 0 then
    sendRemoteDiscoveryUnregister(queryPort, oscPort)
    updateRemoteDiscoveryState({
      queryPort = 0,
      oscPort = 0,
      advertising = false,
    })
  end
end

function ExportPluginShell.remoteDiscoveryStatus()
  return ensureRemoteDiscoveryState()
end

function ExportPluginShell.remoteDiscoveryConfig()
  return {
    host = REMOTE_DISCOVERY_HOST,
    port = getRemoteDiscoveryPort(),
    defaultPort = DEFAULT_REMOTE_DISCOVERY_PORT,
    interval = REMOTE_DISCOVERY_INTERVAL,
  }
end

function ExportPluginShell.setRemoteDiscoveryPort(port)
  return setRemoteDiscoveryPort(port)
end

function ExportPluginShell.syncInterval()
  return SYNC_INTERVAL
end

return ExportPluginShell
