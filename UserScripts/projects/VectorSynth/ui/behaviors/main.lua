local M = {}

local function clamp(v, lo, hi) local n=tonumber(v) or 0; if n<lo then return lo end; if n>hi then return hi end; return n end

local function readParam(path, fallback)
  if type(_G.getParam) == "function" then local ok,v=pcall(_G.getParam,path); if ok and v ~= nil then return v end end
  return fallback
end
local function writeParam(path, value)
  local n=tonumber(value); if not n then return false end
  if type(_G.setParam)=="function" then return _G.setParam(path,n) end
  if type(command)=="function" then command("SET", path, tostring(n)); return true end
  return false
end

local function syncWidgetFromParam(widget, path)
  if not widget or not path then return end
  if widget._dragging or widget._open or widget._vectorSyncing then return end
  local v = readParam(path, nil); if v == nil then return end
  if type(widget.setValue)=="function" then
    local existing = type(widget.getValue)=="function" and widget:getValue() or nil
    if type(widget.setOnLabel)=="function" then
      local b=(tonumber(v) or 0)>0.5
      if existing == nil or existing ~= b then widget._vectorSyncing=true; widget:setValue(b); widget._vectorSyncing=false end
    elseif existing == nil or math.abs((tonumber(existing) or 0)-(tonumber(v) or 0))>0.0001 then
      widget._vectorSyncing=true; widget:setValue(tonumber(v) or 0); widget._vectorSyncing=false
    end
  elseif type(widget.setSelected)=="function" then
    local selected = math.floor((tonumber(v) or 0)+0.5)+1
    local existing = type(widget.getSelected)=="function" and widget:getSelected() or nil
    if existing == nil or existing ~= selected then widget._vectorSyncing=true; widget:setSelected(selected); widget._vectorSyncing=false end
  end
end

local function bindParamWidget(widget)
  local path = widget and widget.config and widget.config.paramPath or nil
  if type(path)~="string" or path=="" then return end
  if type(widget.setOnLabel)=="function" then
    widget._onChange=function(v) if widget._vectorSyncing then return end; writeParam(path, v and 1 or 0) end
    syncWidgetFromParam(widget,path)
  elseif type(widget.setValue)=="function" then
    widget._onChange=function(v) if widget._vectorSyncing then return end; writeParam(path,v) end
    syncWidgetFromParam(widget,path)
  elseif type(widget.setSelected)=="function" then
    widget._onSelect=function(idx) if widget._vectorSyncing then return end; writeParam(path,(tonumber(idx) or 1)-1) end
    syncWidgetFromParam(widget,path)
  else
    widget._onClick=function()
      local cur=readParam(path,0); local next=(tonumber(cur) or 0)+1; if next>999999 then next=1 end; writeParam(path,next)
    end
  end
end

local function buildXYDisplay(ctx, w, h)
  local x=clamp(readParam("/vector/x", ctx.xyX or 0.5),0,1)
  local y=clamp(readParam("/vector/y", ctx.xyY or 0.5),0,1)
  ctx.xyX=x; ctx.xyY=y
  local col=0xff8b5cf6
  local d={}
  d[#d+1]={cmd="drawText",x=8,y=6,w=w-16,h=16,text="VECTOR MIX",color=0xffc4b5fd,fontSize=12,align="left",valign="top"}
  d[#d+1]={cmd="drawText",x=8,y=h-20,w=80,h=14,text="A Osc",color=0xffa7f3d0,fontSize=10}
  d[#d+1]={cmd="drawText",x=w-72,y=h-20,w=64,h=14,text="B Noise",color=0xfffca5a5,fontSize=10,align="right"}
  d[#d+1]={cmd="drawText",x=8,y=24,w=80,h=14,text="C Add",color=0xff93c5fd,fontSize=10}
  d[#d+1]={cmd="drawText",x=w-70,y=24,w=64,h=14,text="D Sub",color=0xfffde68a,fontSize=10,align="right"}
  for i=1,3 do
    d[#d+1]={cmd="drawLine",x1=math.floor(w*i/4),y1=0,x2=math.floor(w*i/4),y2=h,thickness=1,color=0xff253044}
    d[#d+1]={cmd="drawLine",x1=0,y1=math.floor(h*i/4),x2=w,y2=math.floor(h*i/4),thickness=1,color=0xff253044}
  end
  local cx=math.floor(x*w); local cy=math.floor((1-y)*h)
  d[#d+1]={cmd="drawLine",x1=cx,y1=0,x2=cx,y2=h,thickness=1,color=0x668b5cf6}
  d[#d+1]={cmd="drawLine",x1=0,y1=cy,x2=w,y2=cy,thickness=1,color=0x668b5cf6}
  d[#d+1]={cmd="fillRoundedRect",x=cx-9,y=cy-9,w=18,h=18,radius=9,color=0x448b5cf6}
  d[#d+1]={cmd="fillRoundedRect",x=cx-6,y=cy-6,w=12,h=12,radius=6,color=ctx.dragging and 0xff22d3ee or col}
  local ga=(1-x)*(1-y); local gb=x*(1-y); local gc=(1-x)*y; local gd=x*y
  d[#d+1]={cmd="drawText",x=8,y=h-42,w=w-16,h=14,text=string.format("A %.2f  B %.2f  C %.2f  D %.2f",ga,gb,gc,gd),color=0xffaaaaaa,fontSize=10,align="center"}
  return d
end
local function refreshXY(ctx)
  local pad=ctx.widgets and ctx.widgets.xy_pad; if not pad or not pad.node then return end
  local w=pad.node:getWidth(); local h=pad.node:getHeight(); if w<=0 or h<=0 then return end
  pad.node:setDisplayList(buildXYDisplay(ctx,w,h)); pad.node:repaint()
end
local function setupXY(ctx)
  local pad=ctx.widgets and ctx.widgets.xy_pad; if not pad or not pad.node then return end
  local function apply(mx,my)
    local w=math.max(1,pad.node:getWidth()); local h=math.max(1,pad.node:getHeight())
    local x=clamp(mx/w,0,1); local y=clamp(1-(my/h),0,1)
    writeParam("/vector/x",x); writeParam("/vector/y",y); ctx.xyX=x; ctx.xyY=y; refreshXY(ctx)
  end
  if pad.node.setOnMouseDown then pad.node:setOnMouseDown(function(mx,my) ctx.dragging=true; apply(mx,my) end) end
  if pad.node.setOnMouseDrag then pad.node:setOnMouseDrag(function(mx,my) if ctx.dragging then apply(mx,my) end end) end
  if pad.node.setOnMouseUp then pad.node:setOnMouseUp(function() ctx.dragging=false; refreshXY(ctx) end) end
end

local PRESETS={
  lead={ ["/vector/x"]=0.10,["/vector/y"]=0.12,["/vector/env_amount"]=0.25,["/vector/env_speed"]=0.75,["/vector/env_path"]=0,["/env/attack"]=8,["/env/decay"]=180,["/env/sustain"]=0.65,["/env/release"]=280,["/filter/cutoff"]=10500,["/source/a/waveform"]=7,["/source/a/unison"]=5,["/source/a/detune"]=18,["/source/c/octave"]=1,["/master/gain"]=0.85 },
  pad={ ["/vector/x"]=0.5,["/vector/y"]=0.5,["/vector/env_amount"]=0.85,["/vector/env_speed"]=0.35,["/vector/env_path"]=0,["/vector/env_loop"]=1,["/env/attack"]=850,["/env/decay"]=1200,["/env/sustain"]=0.82,["/env/release"]=1800,["/filter/cutoff"]=7000,["/source/a/waveform"]=1,["/source/a/unison"]=4,["/source/a/detune"]=10,["/source/c/partials"]=16,["/master/gain"]=0.7 },
  noise={ ["/vector/x"]=0.9,["/vector/y"]=0.08,["/vector/env_amount"]=0.35,["/vector/env_path"]=2,["/env/attack"]=35,["/env/decay"]=400,["/env/sustain"]=0.55,["/env/release"]=900,["/filter/cutoff"]=4200,["/source/b/color"]=0.85,["/master/gain"]=0.75 },
  additive={ ["/vector/x"]=0.1,["/vector/y"]=0.9,["/vector/env_amount"]=0.55,["/vector/env_speed"]=0.8,["/vector/env_path"]=3,["/source/c/partials"]=24,["/source/c/tilt"]=-0.15,["/source/c/drift"]=0.22,["/env/attack"]=120,["/env/release"]=1300,["/filter/cutoff"]=12000,["/master/gain"]=0.7 },
  sub={ ["/vector/x"]=0.95,["/vector/y"]=0.95,["/vector/env_amount"]=0.15,["/source/d/waveform"]=6,["/source/d/octave"]=-2,["/source/d/pulse_width"]=0.25,["/env/attack"]=5,["/env/decay"]=220,["/env/sustain"]=0.9,["/env/release"]=250,["/filter/cutoff"]=5000,["/master/gain"]=0.9 },
  chaos={ ["/vector/x"]=0.5,["/vector/y"]=0.5,["/vector/env_amount"]=1.0,["/vector/env_speed"]=2.8,["/vector/env_path"]=4,["/vector/env_loop"]=1,["/source/a/waveform"]=7,["/source/a/unison"]=7,["/source/a/detune"]=35,["/source/b/color"]=0.4,["/source/c/drift"]=0.65,["/source/d/pulse_width"]=0.12,["/filter/cutoff"]=13500,["/master/gain"]=0.65 },
}
local function applyPreset(name)
  local p=PRESETS[name]; if not p then return end
  for path,value in pairs(p) do writeParam(path,value) end
end

local function buildMidiOptions()
  local devices=Midi and Midi.inputDevices and Midi.inputDevices() or {}; local opts={"None (Disabled)"}; for i=1,#devices do opts[#opts+1]=tostring(devices[i]) end; return opts,devices
end
local function currentMidiLabel() if Midi and Midi.currentInputDeviceName then local n=Midi.currentInputDeviceName(); if type(n)=="string" and n~="" then return n end end return nil end
local function setMidiStatus(ctx,t) local l=ctx.widgets and ctx.widgets.midi_status; if l and l.setText then l:setText(tostring(t or "")) end end
local function refreshMidi(ctx)
  local opts,dev=buildMidiOptions(); ctx._midiOptions=opts; ctx._midiDevices=dev; local dd=ctx.widgets and ctx.widgets.midi_input_dropdown
  if dd and dd.setOptions then dd:setOptions(opts) end
  local active=currentMidiLabel(); local sel=1; if active then for i=1,#opts do if opts[i]==active then sel=i end end end
  if dd and dd.setSelected then dd:setSelected(sel) end
  setMidiStatus(ctx, active and ("Device: "..active) or "Device: None (Disabled)")
end
local function openPreferredMidi(ctx)
  local dev=ctx._midiDevices or {}; if not (Midi and Midi.openInput) or #dev==0 then setMidiStatus(ctx,"Device: None Found"); return end
  local chosen=0; for i=1,#dev do if not tostring(dev[i]):lower():find("through",1,true) then chosen=i-1; break end end
  Midi.openInput(chosen); refreshMidi(ctx)
end
local function bindMidi(ctx)
  refreshMidi(ctx)
  local dd=ctx.widgets and ctx.widgets.midi_input_dropdown
  if dd then dd._onSelect=function(idx)
    local selected=math.max(1,math.floor(tonumber(idx) or 1)); if selected==1 then if Midi and Midi.closeInput then Midi.closeInput() end; refreshMidi(ctx); return end
    if Midi and Midi.openInput then Midi.openInput(selected-2) end; refreshMidi(ctx)
  end end
  local rb=ctx.widgets and ctx.widgets.midi_refresh_btn; if rb then rb._onClick=function() refreshMidi(ctx); if not currentMidiLabel() then openPreferredMidi(ctx) end end end
  if Audio==nil or (Audio.isPlugin and not Audio.isPlugin()) then if not currentMidiLabel() then openPreferredMidi(ctx) else refreshMidi(ctx) end end
end

function M.init(ctx)
  ctx._paramWidgets={}
  for _,w in pairs(ctx.allWidgets or {}) do
    if type(w)=="table" and type(w.config)=="table" and type(w.config.paramPath)=="string" then ctx._paramWidgets[#ctx._paramWidgets+1]=w; bindParamWidget(w) end
  end
  local pm={preset_lead="lead",preset_pad="pad",preset_noise="noise",preset_add="additive",preset_sub="sub",preset_chaos="chaos"}
  for id,name in pairs(pm) do local w=ctx.widgets and ctx.widgets[id]; if w then w._onClick=function() applyPreset(name); refreshXY(ctx) end end end
  setupXY(ctx); bindMidi(ctx); refreshXY(ctx)
end
function M.update(ctx)
  for _,w in ipairs(ctx._paramWidgets or {}) do local p=w.config and w.config.paramPath; if p then syncWidgetFromParam(w,p) end end
  refreshXY(ctx)
end
return M
