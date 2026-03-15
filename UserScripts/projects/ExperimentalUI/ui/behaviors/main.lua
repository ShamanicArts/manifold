local W = require("ui_widgets")

local M = {}

local MAX_LAYERS = 4

local GL_VERTEX_SHADER = [[
#version 150
in vec2 aPos;
in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
]]

local GL_SCENE_FRAGMENT = [[
#version 150
in vec2 vUv;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uResolution;
uniform float uWaveSpeed;
uniform float uRingSpeed;
void main() {
  vec2 uv = vUv;
  vec2 centered = uv - vec2(0.5);
  float r = length(centered);
  float wave = sin((uv.x * 16.0) + (uTime * uWaveSpeed)) * 0.5 + 0.5;
  float ring = sin((r * 40.0) - (uTime * uRingSpeed)) * 0.5 + 0.5;
  float flow = sin((uv.y * 12.0) + (uTime * 1.2)) * 0.5 + 0.5;
  vec3 base = vec3(0.05, 0.08, 0.14);
  vec3 hot = vec3(0.10 + 0.40 * wave, 0.20 + 0.60 * ring, 0.80 + 0.20 * flow);
  vec3 color = mix(base, hot, 0.80 * ring + 0.15 * wave);
  float vignette = smoothstep(0.95, 0.2, r);
  color *= vignette;
  fragColor = vec4(color, 1.0);
}
]]

local GL_POST_FRAGMENT = [[
#version 150
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uInputTex;
uniform float uTime;
uniform vec2 uResolution;
uniform float uIntensity;
uniform float uAberration;
uniform float uScanlines;
void main() {
  vec2 uv = vUv;
  vec2 center = uv - vec2(0.5);
  float dist = length(center);
  float aberration = uAberration + 0.0035 * uIntensity;
  vec2 dir = normalize(center + vec2(1e-4));
  vec3 sampleR = texture(uInputTex, uv + dir * aberration).rgb;
  vec3 sampleG = texture(uInputTex, uv).rgb;
  vec3 sampleB = texture(uInputTex, uv - dir * aberration).rgb;
  vec3 color = vec3(sampleR.r, sampleG.g, sampleB.b);
  float scan = sin((uv.y * uResolution.y * 0.25) + (uTime * 8.0)) * uScanlines;
  color *= (1.0 - uScanlines + scan);
  float vignette = smoothstep(0.95, 0.25, dist);
  color *= vignette;
  fragColor = vec4(color, 1.0);
}
]]

local function joinPath(a, b)
  local left = tostring(a or "")
  local right = tostring(b or "")
  if left == "" then return right end
  if right == "" then return left end
  if left:sub(-1) == "/" then
    return left .. right
  end
  return left .. "/" .. right
end

local function loadProjectModule(projectRoot, relativePath, label)
  local path = joinPath(projectRoot, relativePath)
  local chunk, loadErr = loadfile(path)
  if not chunk then
    error("failed to load " .. tostring(label or relativePath) .. ": " .. tostring(loadErr))
  end
  local ok, value = pcall(chunk)
  if not ok then
    error("failed to execute " .. tostring(label or relativePath) .. ": " .. tostring(value))
  end
  return value
end

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v)
  return math.floor((tonumber(v) or 0) + 0.5)
end

local function setBounds(widget, x, y, w, h)
  if widget and widget.setBounds then
    widget:setBounds(round(x), round(y), round(w), round(h))
  elseif widget and widget.node and widget.node.setBounds then
    widget.node:setBounds(round(x), round(y), round(w), round(h))
  end
end

local function setText(widget, text)
  if widget and widget.setText then
    widget:setText(text or "")
  end
end

local function setColour(widget, colour)
  if widget and widget.setColour then
    widget:setColour(colour)
  end
end

local function setPanelStyle(widget, style)
  if widget and widget.setStyle then
    widget:setStyle(style or {})
  end
end

local function repaint(widget)
  if widget and widget.node and widget.node.repaint then
    widget.node:repaint()
  elseif widget and widget.repaint then
    widget:repaint()
  end
end

local function readParam(params, path, fallback)
  if type(params) ~= "table" then
    return fallback
  end
  local value = params[path]
  if value == nil then
    return fallback
  end
  return value
end

local function readBoolParam(params, path, fallback)
  local raw = readParam(params, path, fallback and 1 or 0)
  if raw == nil then
    return fallback
  end
  return raw == true or raw == 1
end

local function normalizeState(state)
  if type(state) ~= "table" then
    return { params = {}, voices = {}, layers = {} }
  end

  local params = state.params or {}
  local voices = state.voices or {}
  local normalized = {
    params = params,
    voices = voices,
    spectrum = state.spectrum,
    isRecording = readBoolParam(params, "/manifold/recording", false),
    recordMode = readParam(params, "/manifold/mode", "firstLoop"),
    layers = {},
  }

  for i = 1, #voices do
    local voice = voices[i]
    if type(voice) == "table" then
      normalized.layers[i] = {
        index = voice.id or (i - 1),
        state = voice.state or "empty",
        speed = voice.speed or 1,
        volume = voice.volume or 1,
        reversed = voice.reversed or false,
      }
    end
  end

  return normalized
end

local function currentTime()
  if type(getTime) == "function" then
    return tonumber(getTime()) or 0
  end
  return 0
end

local function rendererMode()
  if type(getUIRendererMode) == "function" then
    return tostring(getUIRendererMode() or "canvas")
  end
  return "canvas"
end

local function syncOscHeader(ctx)
  local widgets = ctx.widgets or {}
  local path = ctx._oscRegisteredPath or "/experimental/xy"
  if ctx._oscEnabled == true then
    setText(widgets.oscLabel, "OSC: " .. tostring(path))
    setColour(widgets.oscLabel, 0xff22c55e)
  else
    setText(widgets.oscLabel, "OSC: disabled")
    setColour(widgets.oscLabel, 0xff64748b)
  end
end

local function syncOscTrafficLabels(ctx)
  local widgets = ctx.widgets or {}
  setText(widgets.xySentLabel, "TX " .. tostring(ctx._oscSentCount or 0) .. " - " .. tostring(ctx._oscLastSent or "x=0.50 y=0.50"))
  setText(widgets.xyRecvLabel, "RX " .. tostring(ctx._oscRecvCount or 0) .. " - " .. tostring(ctx._oscLastRecv or "x=0.50 y=0.50"))
end

local function handleXyOscSend(ctx, x, y)
  local xy = ctx._custom and ctx._custom.xy or nil
  if not xy then
    return
  end

  local path = tostring(xy._oscPath or "/experimental/xy")
  local minV = tonumber(xy._minValue) or 0
  local maxV = tonumber(xy._maxValue) or 1
  local sx = minV + (tonumber(x) or 0) * (maxV - minV)
  local sy = minV + (tonumber(y) or 0) * (maxV - minV)

  if osc and osc.send then
    osc.send(path, sx, sy)
  end

  ctx._oscSentCount = (ctx._oscSentCount or 0) + 1
  ctx._oscLastSent = string.format("x=%.2f y=%.2f", sx, sy)

  local now = currentTime()
  if now - (ctx._oscLastTxLogTime or 0) > 0.1 then
    print("[OSC TX]" .. path, ctx._oscLastSent)
    ctx._oscLastTxLogTime = now
  end

  syncOscTrafficLabels(ctx)
end

local function installOscHandler(ctx)
  local xy = ctx._custom and ctx._custom.xy or nil
  if not xy then
    return
  end

  local path = tostring(xy._oscPath or "/experimental/xy")
  if ctx._oscRegisteredPath == path then
    return
  end

  if ctx._oscRegisteredPath and osc and osc.removeHandler then
    pcall(osc.removeHandler, ctx._oscRegisteredPath)
  end

  ctx._oscRegisteredPath = path
  ctx._oscEnabled = false

  if osc and osc.registerEndpoint then
    pcall(osc.registerEndpoint, path, {
      type = "ff",
      range = { 0, 1 },
      access = 3,
      description = "XY Pad control (x, y)",
    })
    ctx._oscEnabled = true
  end

  if osc and osc.onMessage then
    osc.onMessage(path, function(args)
      if not (args and #args >= 2) then
        return
      end
      local nextX = tonumber(args[1]) or 0.5
      local nextY = tonumber(args[2]) or 0.5
      local current = ctx._custom and ctx._custom.xy or nil
      if current and current.setValues then
        current:setValues(nextX, nextY)
      end
      ctx._oscRecvCount = (ctx._oscRecvCount or 0) + 1
      ctx._oscLastRecv = string.format("x=%.2f y=%.2f", nextX, nextY)
      local now = currentTime()
      if now - (ctx._oscLastRxLogTime or 0) > 0.1 then
        print("[OSC RX] " .. path, ctx._oscLastRecv)
        ctx._oscLastRxLogTime = now
      end
      syncOscTrafficLabels(ctx)
    end)
    ctx._oscEnabled = true
  end

  syncOscHeader(ctx)
end

local function createCustomWidgets(ctx)
  local widgets = ctx.widgets or {}
  local rootNode = ctx.root and ctx.root.node or nil
  local projectRoot = ctx.project and ctx.project.root or ""

  local ParticleEmitter = loadProjectModule(projectRoot, "ui/widgets/particle_emitter.lua", "particle_emitter")
  local XYTrails = loadProjectModule(projectRoot, "ui/widgets/xy_trails.lua", "xy_trails")
  local MatrixRain = loadProjectModule(projectRoot, "ui/widgets/matrix_rain.lua", "matrix_rain")
  local EQVisualizer = loadProjectModule(projectRoot, "ui/widgets/eq_visualizer.lua", "eq_visualizer")
  local WaveformRing = loadProjectModule(projectRoot, "ui/widgets/waveform_ring.lua", "waveform_ring")
  local VectorField = loadProjectModule(projectRoot, "ui/widgets/vector_field.lua", "vector_field")
  local Kaleidoscope = loadProjectModule(projectRoot, "ui/widgets/kaleidoscope.lua", "kaleidoscope")

  ctx._custom = {
    particle = ParticleEmitter.new(widgets.particlePanel.node, "particlePad", {
      x = 0.5,
      y = 0.5,
    }),
    xy = XYTrails.new(widgets.xyPanel.node, "xyPad", {
      x = 0.5,
      y = 0.5,
      on_change = function(x, y)
        handleXyOscSend(ctx, x, y)
      end,
    }),
    matrix = MatrixRain.new(rootNode, "matrixRain", {
      cols = 30,
      charSize = 12,
      speed = 1.0,
      spawnRate = 0.05,
      color = 0xff00ff00,
    }),
    eq = EQVisualizer.new(widgets.eqPanel.node, "eqCanvas", { bandCount = 32 }),
    wave = WaveformRing.new(widgets.wavePanel.node, "waveCanvas", {}),
    noise = VectorField.new(widgets.noisePanel.node, "noiseCanvas", {}),
    kaleido = Kaleidoscope.new(widgets.kaleidoPanel.node, "kaleidoCanvas", { segments = 8 }),
    gl = W.GLSurfaceWidget.new(widgets.glViewportHost.node, "glSurface", {
      surface = {
        version = 1,
        kind = "shaderQuad",
        shaderLanguage = "glsl",
        passes = {
          {
            vertexShader = GL_VERTEX_SHADER,
            fragmentShader = GL_SCENE_FRAGMENT,
            clearColor = { 0.02, 0.03, 0.06, 1.0 },
            depth = true,
            uniforms = {
              uWaveSpeed = 1.8,
              uRingSpeed = 3.2,
            },
          },
          {
            vertexShader = GL_VERTEX_SHADER,
            fragmentShader = GL_POST_FRAGMENT,
            clearColor = { 0.01, 0.015, 0.03, 1.0 },
            inputTextureUniform = "uInputTex",
            uniforms = {
              uIntensity = 0.5,
              uAberration = 0.003,
              uScanlines = 0.03,
            },
          },
        },
      },
    }),
  }

  ctx._custom.xy._oscPath = "/experimental/xy"
  ctx._custom.xy._minValue = 0
  ctx._custom.xy._maxValue = 1
  ctx._custom.xy._deadZone = 0
end

local function resizeLayout(ctx, w, h)
  local widgets = ctx.widgets or {}
  local custom = ctx._custom or {}
  local margin = 12
  local panelH = h - 120
  local bottomH = 140
  local headerH = 40

  setBounds(ctx.root, 0, 0, w, h)
  setBounds(widgets.header, margin, margin, w - margin * 2, headerH)
  setBounds(widgets.title, margin + 12, margin, 200, 40)
  setBounds(widgets.subtitle, margin + 220, margin, 150, 40)
  setBounds(widgets.oscLabel, margin + 380, margin, w - margin * 2 - 392, 40)

  local panelW = math.floor((w - margin * 4) / 3)
  local topY = margin + headerH + margin
  local mainH = math.floor(panelH - bottomH - margin * 2)

  setBounds(widgets.particlePanel, margin, topY, panelW, mainH)
  if custom.particle then
    setBounds(custom.particle, 8, 8, panelW - 16, mainH - 16)
  end

  setBounds(widgets.xyPanel, margin * 2 + panelW, topY, panelW, mainH)
  setBounds(widgets.xyLabel, margin * 2 + panelW + 8, topY + 8, panelW - 16, 20)
  setBounds(widgets.xySentLabel, margin * 2 + panelW + 8, topY + 28, panelW - 16, 16)
  setBounds(widgets.xyRecvLabel, margin * 2 + panelW + 8, topY + 44, panelW - 16, 16)
  if custom.xy then
    setBounds(custom.xy, 8, 64, panelW - 16, mainH - 72)
  end

  if custom.matrix then
    setBounds(custom.matrix, margin * 3 + panelW * 2, topY, panelW, mainH)
  end

  local bottomY = topY + mainH + margin
  local sectionW = math.floor((w - margin * 6) / 5)

  setBounds(widgets.eqPanel, margin, bottomY, sectionW, bottomH)
  if custom.eq then
    setBounds(custom.eq, 8, 8, sectionW - 16, bottomH - 16)
  end

  setBounds(widgets.wavePanel, margin * 2 + sectionW, bottomY, sectionW, bottomH)
  if custom.wave then
    setBounds(custom.wave, 8, 8, sectionW - 16, bottomH - 16)
  end

  setBounds(widgets.noisePanel, margin * 3 + sectionW * 2, bottomY, sectionW, bottomH)
  setBounds(widgets.noiseLabel, margin * 3 + sectionW * 2 + 8, bottomY + 4, sectionW - 16, 18)
  if custom.noise then
    setBounds(custom.noise, 8, 24, sectionW - 16, bottomH - 28)
  end

  setBounds(widgets.kaleidoPanel, margin * 4 + sectionW * 3, bottomY, sectionW, bottomH)
  setBounds(widgets.kaleidoLabel, margin * 4 + sectionW * 3 + 8, bottomY + 4, sectionW - 16, 18)
  if custom.kaleido then
    setBounds(custom.kaleido, 8, 24, sectionW - 16, bottomH - 28)
  end

  setBounds(widgets.glPanel, margin * 5 + sectionW * 4, bottomY, sectionW, bottomH)
  setBounds(widgets.glLabel, margin * 5 + sectionW * 4 + 8, bottomY + 4, sectionW - 16, 18)
  setBounds(widgets.glStatusLabel, margin * 5 + sectionW * 4 + 8, bottomY + 20, sectionW - 16, 14)
  setBounds(widgets.glViewportHost, margin * 5 + sectionW * 4 + 8, bottomY + 36, sectionW - 16, bottomH - 40)
  if custom.gl then
    setBounds(custom.gl, 0, 0, sectionW - 16, bottomH - 40)
  end
  setBounds(widgets.glViewportText, margin * 5 + sectionW * 4 + 18, bottomY + 64, sectionW - 36, 28)

  setBounds(widgets.statusPanel, margin, h - 35, w - margin * 2, 25)
  local indicatorW = math.floor((w - margin * 2 - 16) / MAX_LAYERS)
  for i = 1, MAX_LAYERS do
    local x = margin + 8 + (i - 1) * (indicatorW + 4)
    setBounds(widgets["layer" .. i], x, h - 31, indicatorW, 17)
    setBounds(widgets["layer" .. i .. "Label"], 0, 0, indicatorW, 17)
  end
end

local function syncLayerIndicators(ctx, viewState)
  local widgets = ctx.widgets or {}
  local layers = viewState and viewState.layers or {}

  for i = 1, MAX_LAYERS do
    local panel = widgets["layer" .. i]
    local label = widgets["layer" .. i .. "Label"]
    local layer = layers[i]
    local bg = 0xff1e293b
    local text = "L" .. tostring(i)
    local textColour = 0xff94a3b8

    if type(layer) == "table" then
      if layer.state == "playing" then
        bg = 0xff22c55e
        textColour = 0xff052e16
      elseif layer.state == "recording" then
        bg = 0xffef4444
        textColour = 0xfffee2e2
      elseif layer.state == "overdubbing" then
        bg = 0xfff59e0b
        textColour = 0xff451a03
      elseif layer.state == "empty" then
        bg = 0xff1e293b
      else
        bg = 0xff334155
      end
    end

    setPanelStyle(panel, { bg = bg })
    setText(label, text)
    setColour(label, textColour)
  end
end

local function syncGlStatus(ctx)
  local widgets = ctx.widgets or {}
  local mode = rendererMode()
  local direct = mode == "imgui-direct"
  if direct then
    setText(widgets.glStatusLabel, "GPU shader surface active via first-party runtime node payload")
    setText(widgets.glViewportText, "")
    if widgets.glViewportText and widgets.glViewportText.setVisible then
      widgets.glViewportText:setVisible(false)
    end
  else
    setText(widgets.glStatusLabel, "GPU shader surface descriptor ready; canvas backend adapter pending (renderer: " .. mode .. ")")
    setText(widgets.glViewportText, "Switch to imgui-direct to run the first-party GPU shader surface")
    if widgets.glViewportText and widgets.glViewportText.setVisible then
      widgets.glViewportText:setVisible(true)
    end
  end
end

local function tickAnimations(ctx, dt, renderState)
  local custom = ctx._custom or {}

  if custom.particle then
    custom.particle:setAnimTime(renderState.animTime)
    custom.particle:update(dt)
    if math.random() < 0.1 then
      local w = custom.particle.node:getWidth()
      local h = custom.particle.node:getHeight()
      custom.particle:emitSecondary(w * 0.5 + ((math.random() * 100) - 50), h * 0.5 + ((math.random() * 100) - 50), {
        minSpeed = 20,
        maxSpeed = 60,
        minSize = 1,
        maxSize = 4,
        hue = (renderState.animTime * 0.05) % 1,
        hueShift = 0.2,
        gravity = -10,
      })
    end
    repaint(custom.particle)
  end

  if custom.xy then
    custom.xy:updateTrails(dt)
    repaint(custom.xy)
  end

  if custom.matrix then
    custom.matrix:update(dt)
    repaint(custom.matrix)
  end

  if custom.eq then
    custom.eq:setRenderState(renderState)
    repaint(custom.eq)
  end
  if custom.wave then
    custom.wave:setRenderState(renderState)
    repaint(custom.wave)
  end
  if custom.noise then
    custom.noise:setRenderState(renderState)
    repaint(custom.noise)
  end
  if custom.kaleido then
    custom.kaleido:setRenderState(renderState)
    repaint(custom.kaleido)
  end
end

function M.init(ctx)
  _G.__experimentalProjectRoot = ctx.project.root

  ctx._oscEnabled = false
  ctx._oscRegisteredPath = nil
  ctx._oscSentCount = 0
  ctx._oscRecvCount = 0
  ctx._oscLastSent = "x=0.50 y=0.50"
  ctx._oscLastRecv = "x=0.50 y=0.50"
  ctx._oscLastTxLogTime = 0
  ctx._oscLastRxLogTime = 0
  ctx._lastFrameTime = currentTime()
  ctx._animTime = 0
  ctx._viewState = { params = {}, voices = {}, layers = {} }

  createCustomWidgets(ctx)
  _G.__experimentalGlWidget = ctx._custom and ctx._custom.gl or nil
  installOscHandler(ctx)
  syncOscHeader(ctx)
  syncOscTrafficLabels(ctx)
  syncGlStatus(ctx)
  syncLayerIndicators(ctx, ctx._viewState)
end

function M.resized(ctx, w, h)
  resizeLayout(ctx, w, h)
  syncGlStatus(ctx)
end

function M.update(ctx, state)
  ctx._viewState = normalizeState(state)

  installOscHandler(ctx)

  local now = currentTime()
  local dt = now - (ctx._lastFrameTime or now)
  if dt < 0 then dt = 0 end
  if dt > 0.25 then dt = 0.25 end
  ctx._lastFrameTime = now
  ctx._animTime = (ctx._animTime or 0) + dt

  local renderState = {
    dt = dt,
    animTime = ctx._animTime,
    noiseOffset = ctx._animTime * 0.1,
    kaleidoscopeAngle = ctx._animTime * 0.5,
    viewState = ctx._viewState,
  }

  tickAnimations(ctx, dt, renderState)
  syncOscHeader(ctx)
  syncOscTrafficLabels(ctx)
  syncLayerIndicators(ctx, ctx._viewState)
  syncGlStatus(ctx)
end

function M.cleanup(ctx)
  if ctx._oscRegisteredPath and osc and osc.removeHandler then
    pcall(osc.removeHandler, ctx._oscRegisteredPath)
  end
  ctx._custom = nil
  ctx._oscRegisteredPath = nil
  _G.__experimentalGlWidget = nil
  _G.__experimentalProjectRoot = nil
end

return M
