#!/usr/bin/env python3
"""
Inline GPU composite recording — full VJ-style automation with continuous motion.
Two 4-layer stacks with feedback effects, source morphing, blend op cycling,
and smooth parameter envelopes driven by continuous time functions.
"""

import glob
import os
import socket
import subprocess
import sys
import time

HEADLESS_BIN = "./build-dev/ManifoldHeadless"
TEMP_DIR = "/tmp/inline_composite"
REC_DIR = "/tmp/composite_rec"
OUT_MP4 = "/home/shamanic/dev/my-plugin-experiment/inline_composite.mp4"

# ============================================================================
# Write temp project files
# ============================================================================
os.makedirs(f"{TEMP_DIR}/ui", exist_ok=True)

with open(f"{TEMP_DIR}/manifold.project.json5", "w") as f:
    f.write('''{\n''')
    f.write('''  "name": "InlineComposite",\n''')
    f.write('''  "version": 1,\n''')
    f.write('''  "ui": {\n''')
    f.write('''    "root": "ui/composite.ui.lua",\n''')
    f.write('''    "sharedShell": false\n''')
    f.write('''  }\n''')
    f.write('''}\n''')

with open(f"{TEMP_DIR}/ui/composite.ui.lua", "w") as f:
    f.write('''return {\n''')
    f.write('''  id = "root",\n''')
    f.write('''  type = "Panel",\n''')
    f.write('''  x = 0, y = 0, w = 640, h = 480,\n''')
    f.write('''  shellLayout = { mode = "fill", designW = 640, designH = 480 },\n''')
    f.write('''  style = { bg = 0xff000000 },\n''')
    f.write('''  behavior = "ui/composite.lua",\n''')
    f.write('''  children = {\n''')
    f.write('''    { id = "stackA", type = "Panel", x = -4000, y = -4000, w = 1, h = 1, style = { bg = 0x00000000 } },\n''')
    f.write('''    { id = "stackB", type = "Panel", x = -4000, y = -4000, w = 1, h = 1, style = { bg = 0x00000000 } },\n''')
    f.write('''    { id = "composite", type = "Panel", x = 0, y = 0, w = 640, h = 480, style = { bg = 0xff000000 } },\n''')
    f.write('''  }\n''')
    f.write('''}\n''')

# ============================================================================
# Behavior script — continuous time-based automation
# ============================================================================
with open(f"{TEMP_DIR}/ui/composite.lua", "w") as f:
    f.write('''local M = {}\n''')
    f.write('''\n''')
    f.write('''-- Continuous 1D noise using smooth interpolation\n''')
    f.write('''local function noise1D(t, seed)\n''')
    f.write('''  local s = math.sin(t * 0.37 + seed) * 43758.5453\n''')
    f.write('''  return s - math.floor(s)\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''local function smoothNoise(t, freq, seed)\n''')
    f.write('''  local i = math.floor(t * freq)\n''')
    f.write('''  local f = (t * freq) - i\n''')
    f.write('''  local n1 = noise1D(i, seed)\n''')
    f.write('''  local n2 = noise1D(i + 1, seed)\n''')
    f.write('''  local sf = f * f * (3 - 2 * f)\n''')
    f.write('''  return n1 + sf * (n2 - n1)\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''-- Smooth envelope using sine\n''')
    f.write('''local function sinEnv(t, period)\n''')
    f.write('''  return 0.5 + 0.5 * math.sin(2 * math.pi * t / period)\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''-- Continuous source morphing based on noise\n''')
    f.write('''local function pickSourceA(t)\n''')
    f.write('''  -- Blend between sources continuously using smooth noise\n''')
    f.write('''  local blend = smoothNoise(t, 0.08, 1.0)\n''')
    f.write('''  local phase = blend * 3.0\n''')
    f.write('''  local phaseInt = math.floor(phase)\n''')
    f.write('''  local phaseFrac = phase - phaseInt\n''')
    f.write('''  \n''')
    f.write('''  if phaseInt == 0 then\n''')
    f.write('''    return \"plasma\", {\n''')
    f.write('''      scale = 3 + 6 * sinEnv(t, 4),\n''')
    f.write('''      speed = 0.3 + 0.4 * smoothNoise(t, 0.3, 2.0),\n''')
    f.write('''      palette = 0.5 + 0.5 * math.sin(t * 0.25),\n''')
    f.write('''    }\n''')
    f.write('''  elseif phaseInt == 1 then\n''')
    f.write('''    return \"fbm\", {\n''')
    f.write('''      scale = 2 + 3 * sinEnv(t, 5),\n''')
    f.write('''      speed = 0.2 + 0.3 * smoothNoise(t, 0.25, 3.0),\n''')
    f.write('''      gain = 0.4 + 0.2 * math.sin(t * 0.4),\n''')
    f.write('''      lacunarity = 1.8 + 0.6 * math.sin(t * 0.18),\n''')
    f.write('''    }\n''')
    f.write('''  else\n''')
    f.write('''    return \"noise\", {\n''')
    f.write('''      scale = 6 + 10 * sinEnv(t, 3.5),\n''')
    f.write('''      speed = 0.25 + 0.45 * smoothNoise(t, 0.35, 4.0),\n''')
    f.write('''      contrast = 1.0 + 0.5 * smoothNoise(t, 0.15, 5.0),\n''')
    f.write('''    }\n''')
    f.write('''  end\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''local function pickSourceB(t)\n''')
    f.write('''  local blend = smoothNoise(t, 0.1, 6.0)\n''')
    f.write('''  local phase = blend * 3.0\n''')
    f.write('''  local phaseInt = math.floor(phase)\n''')
    f.write('''  \n''')
    f.write('''  if phaseInt == 0 then\n''')
    f.write('''    return \"checker\", {\n''')
    f.write('''      scale = 8 + 14 * sinEnv(t, 4.5),\n''')
    f.write('''      softness = 0.01 + 0.06 * smoothNoise(t, 0.5, 7.0),\n''')
    f.write('''    }\n''')
    f.write('''  elseif phaseInt == 1 then\n''')
    f.write('''    return \"plasma\", {\n''')
    f.write('''      scale = 2 + 5 * sinEnv(t, 3.2),\n''')
    f.write('''      speed = 0.6 + 0.6 * smoothNoise(t, 0.3, 8.0),\n''')
    f.write('''      palette = t * 0.4 + 0.8,\n''')
    f.write('''    }\n''')
    f.write('''  else\n''')
    f.write('''    return \"fbm\", {\n''')
    f.write('''      scale = 1.2 + 2.5 * sinEnv(t, 4.2),\n''')
    f.write('''      speed = 0.1 + 0.3 * smoothNoise(t, 0.2, 9.0),\n''')
    f.write('''      gain = 0.45 + 0.15 * math.sin(t * 0.35),\n''')
    f.write('''      lacunarity = 1.9 + 0.5 * smoothNoise(t, 0.18, 10.0),\n''')
    f.write('''    }\n''')
    f.write('''  end\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''-- Stack A: warm organic with feedback\n''')
    f.write('''local function buildStackA(t)\n''')
    f.write('''  local srcId, srcParams = pickSourceA(t)\n''')
    f.write('''  local env = sinEnv(t, 4)\n''')
    f.write('''  local envSlow = sinEnv(t, 7)\n''')
    f.write('''  \n''')
    f.write('''  return shaders.buildPipeline({\n''')
    f.write('''    { enabled = true, effectId = \"fractal-echo\", params = {\n''')
    f.write('''      intensity = 0.3 + 0.4 * envSlow,\n''')
    f.write('''      speed = 0.6 + 0.5 * math.sin(t * 0.25),\n''')
    f.write('''      param1 = 0.25 + 0.35 * env,\n''')
    f.write('''      param2 = 0.3 + 0.5 * smoothNoise(t, 0.15, 11.0),\n''')
    f.write('''    }},\n''')
    f.write('''    { enabled = true, effectId = \"ripple\", params = {\n''')
    f.write('''      intensity = 0.25 + 0.3 * math.sin(t * 0.5),\n''')
    f.write('''      speed = 0.6 + 0.2 * math.sin(t * 0.3),\n''')
    f.write('''      param1 = 0.2 + 0.4 * env,\n''')
    f.write('''      param2 = 0.3 + 0.4 * math.sin(t * 0.4),\n''')
    f.write('''      freqMin = 12 + 12 * math.sin(t * 0.15),\n''')
    f.write('''      freqMax = 45 + 25 * math.sin(t * 0.2),\n''')
    f.write('''      waveScale = 0.012 + 0.01 * envSlow,\n''')
    f.write('''      maxLayers = 5,\n''')
    f.write('''    }},\n''')
    f.write('''    { enabled = true, effectId = \"neon-edge\", params = {\n''')
    f.write('''      intensity = 0.35 + 0.45 * sinEnv(t, 2.5),\n''')
    f.write('''      speed = 0.8 + 0.6 * math.sin(t * 0.45),\n''')
    f.write('''      param1 = 0.25 + 0.45 * env,\n''')
    f.write('''      param2 = 0.4 + 0.5 * math.sin(t * 0.6),\n''')
    f.write('''    }},\n''')
    f.write('''    { enabled = envSlow > 0.25, effectId = \"trail-dissolve\", params = {\n''')
    f.write('''      intensity = 0.3 + 0.3 * env,\n''')
    f.write('''      speed = 0.4 + 0.2 * math.sin(t * 0.3),\n''')
    f.write('''      param1 = 0.4 + 0.35 * math.sin(t * 0.35),\n''')
    f.write('''      param2 = 0.3 + 0.35 * envSlow,\n''')
    f.write('''      maxSamples = 8 + math.floor(4 * env + 0.5),\n''')
    f.write('''      offsetScale = 0.005 + 0.005 * env,\n''')
    f.write('''      noiseCutoff = 0.25,\n''')
    f.write('''      dissolveMin = 0.15,\n''')
    f.write('''      dissolveRange = 0.65,\n''')
    f.write('''    }},\n''')
    f.write('''  }, \"contain\", { type = \"generator\", sourceId = srcId, params = srcParams })\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''-- Stack B: cool geometric with glitch\n''')
    f.write('''local function buildStackB(t)\n''')
    f.write('''  local srcId, srcParams = pickSourceB(t)\n''')
    f.write('''  local env = sinEnv(t + 1, 5)\n''')
    f.write('''  local envFast = sinEnv(t, 1.5)\n''')
    f.write('''  \n''')
    f.write('''  return shaders.buildPipeline({\n''')
    f.write('''    { enabled = true, effectId = \"time-smear\", params = {\n''')
    f.write('''      intensity = 0.3 + 0.35 * env,\n''')
    f.write('''      speed = 0.5 + 0.3 * math.sin(t * 0.35),\n''')
    f.write('''      param1 = (t * 0.04) % 1.0,\n''')
    f.write('''      param2 = 0.35 + 0.45 * envFast,\n''')
    f.write('''    }},\n''')
    f.write('''    { enabled = true, effectId = \"kaleidoscope\", params = {\n''')
    f.write('''      intensity = 0.5 + 0.3 * math.sin(t * 0.3),\n''')
    f.write('''      speed = 0.15 + 0.25 * env,\n''')
    f.write('''      param1 = 4 + 5 * sinEnv(t, 3),\n''')
    f.write('''      param2 = 0.6 + 0.3 * math.sin(t * 0.45),\n''')
    f.write('''    }},\n''')
    f.write('''    { enabled = envFast > 0.35, effectId = \"rgb-split\", params = {\n''')
    f.write('''      intensity = 0.35 + 0.45 * envFast,\n''')
    f.write('''      speed = 1.0 + 0.3 * math.sin(t * 0.5),\n''')
    f.write('''      param1 = 0.25 + 0.5 * env,\n''')
    f.write('''      param2 = (t * 0.025) % 1.0,\n''')
    f.write('''    }},\n''')
    f.write('''    { enabled = env > 0.55, effectId = \"vhs\", params = {\n''')
    f.write('''      intensity = 0.25 + 0.35 * env,\n''')
    f.write('''      speed = 0.7 + 0.2 * math.sin(t * 0.4),\n''')
    f.write('''      param1 = 0.15 + 0.35 * envFast,\n''')
    f.write('''      param2 = 0.25 + 0.45 * env,\n''')
    f.write('''      tearThreshold = 0.92,\n''')
    f.write('''      tearAmount = 0.02 + 0.05 * env,\n''')
    f.write('''      wobbleAmount = 0.002 + 0.006 * env,\n''')
    f.write('''      bleedScale = 0.012,\n''')
    f.write('''    }},\n''')
    f.write('''  }, \"contain\", { type = \"generator\", sourceId = srcId, params = srcParams })\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''-- Blend ops with continuous cycling\n''')
    f.write('''local BLEND_OPS = { \"normal\", \"overlay\", \"add\", \"multiply\", \"screen\", \"difference\", \"lighten\", \"darken\" }\n''')
    f.write('''local function pickBlendOp(t)\n''')
    f.write('''  local idx = 1 + math.floor((t / 2.0) % #BLEND_OPS)\n''')
    f.write('''  return BLEND_OPS[idx]\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''local function buildComposite(t)\n''')
    f.write('''  local opId = pickBlendOp(t)\n''')
    f.write('''  local opacity = 0.55 + 0.4 * sinEnv(t, 3.5)\n''')
    f.write('''  return {\n''')
    f.write('''    version = 1,\n''')
    f.write('''    kind = \"compositeQuad\",\n''')
    f.write('''    fitMode = \"contain\",\n''')
    f.write('''    bottomNodeId = \"stackA\",\n''')
    f.write('''    topNodeId = \"stackB\",\n''')
    f.write('''    blendOpId = opId,\n''')
    f.write('''    opacity = opacity,\n''')
    f.write('''    blendParams = {\n''')
    f.write('''      baseLevel = 0.75 + 0.45 * sinEnv(t, 4),\n''')
    f.write('''      topLevel = 0.85 + 0.35 * math.sin(t * 0.4),\n''')
    f.write('''      topGamma = 0.75 + 0.45 * sinEnv(t + 0.5, 3),\n''')
    f.write('''    },\n''')
    f.write('''  }\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''function M.init(ctx)\n''')
    f.write('''  ctx._phase = 0\n''')
    f.write('''  local t = 0\n''')
    f.write('''  if ctx.widgets.stackA and ctx.widgets.stackA.node then\n''')
    f.write('''    ctx.widgets.stackA.node:setCustomSurface(\"gpu_shader\", buildStackA(t))\n''')
    f.write('''  end\n''')
    f.write('''  if ctx.widgets.stackB and ctx.widgets.stackB.node then\n''')
    f.write('''    ctx.widgets.stackB.node:setCustomSurface(\"gpu_shader\", buildStackB(t))\n''')
    f.write('''  end\n''')
    f.write('''  if ctx.widgets.composite and ctx.widgets.composite.node then\n''')
    f.write('''    ctx.widgets.composite.node:setCustomSurface(\"gpu_composite\", buildComposite(t))\n''')
    f.write('''  end\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''function M.update(ctx, _state)\n''')
    f.write('''  ctx._phase = (ctx._phase or 0) + 1\n''')
    f.write('''  local t = ctx._phase * 0.033  -- ~30Hz time progression\n''')
    f.write('''  if ctx.widgets.stackA and ctx.widgets.stackA.node then\n''')
    f.write('''    ctx.widgets.stackA.node:setCustomSurface(\"gpu_shader\", buildStackA(t))\n''')
    f.write('''  end\n''')
    f.write('''  if ctx.widgets.stackB and ctx.widgets.stackB.node then\n''')
    f.write('''    ctx.widgets.stackB.node:setCustomSurface(\"gpu_shader\", buildStackB(t))\n''')
    f.write('''  end\n''')
    f.write('''  if ctx.widgets.composite and ctx.widgets.composite.node then\n''')
    f.write('''    ctx.widgets.composite.node:setCustomSurface(\"gpu_composite\", buildComposite(t))\n''')
    f.write('''  end\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''function M.resized(ctx, w, h)\n''')
    f.write('''  if ctx.widgets.composite and ctx.widgets.composite.setBounds then\n''')
    f.write('''    ctx.widgets.composite:setBounds(0, 0, w, h)\n''')
    f.write('''  end\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''return M\n''')

print(f"Project written to {TEMP_DIR}")

# ============================================================================
# IPC helpers
# ============================================================================
def find_socket_for_pid(pid):
    expected = f"/tmp/manifold_{pid}.sock"
    return expected if os.path.exists(expected) else None


def ipc_send(sock_path, cmd, connect_timeout=2.0):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(connect_timeout)
    try:
        s.connect(sock_path)
        s.settimeout(5.0)
        s.sendall((cmd + "\n").encode())
        response = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            response += chunk
            if b"\n" in chunk or len(response) > 65536:
                break
        return response.decode().strip()
    except Exception as e:
        return f"ERROR {e}"
    finally:
        s.close()


# ============================================================================
# Start headless, load project, record
# ============================================================================
print("\n[1/5] Starting ManifoldHeadless...")
env = os.environ.copy()
env["MANIFOLD_PROFILE_WINDOW_SIZE"] = "640x480"
proc = subprocess.Popen(
    [HEADLESS_BIN, "--test-ui", "--duration", "0"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env,
)

time.sleep(2)

socket_path = find_socket_for_pid(proc.pid)
if not socket_path:
    for p in sorted(glob.glob("/tmp/manifold_*.sock"), key=os.path.getmtime, reverse=True):
        socket_path = p
        break

print(f"Socket: {socket_path}")
if not socket_path:
    print("ERROR: No socket found")
    proc.terminate()
    sys.exit(1)

print("\n[2/5] Health check...")
print(f"  {ipc_send(socket_path, 'PING')}")

print("\n[3/5] Switching to inline composite project...")
print(f"  {ipc_send(socket_path, f'UISWITCH {TEMP_DIR}/manifold.project.json5')}")
time.sleep(2)
print(f"  Current: {ipc_send(socket_path, 'EVAL return getCurrentScriptPath()')}")

print("\n[4/5] Starting recording...")
import shutil
if os.path.exists(REC_DIR):
    shutil.rmtree(REC_DIR)
os.makedirs(REC_DIR, exist_ok=True)

print(f"  {ipc_send(socket_path, f'RECORD START tga {REC_DIR}')}")

print("\n[5/5] Recording 10 seconds...")
rec_start = time.time()
time.sleep(10)
rec_wall = time.time() - rec_start

print(f"\nStopping recording...")
print(f"  {ipc_send(socket_path, 'RECORD STOP')}")

# Give the UI thread one timer cycle to flush RAM frames to disk
print("  Waiting for frame flush...")
time.sleep(0.5)

proc.terminate()
try:
    proc.wait(timeout=3)
except:
    proc.kill()

# ============================================================================
# Analyze output
# ============================================================================
frame_files = sorted(glob.glob(f"{REC_DIR}/frame_*.tga"))
wav_path = f"{REC_DIR}/audio.wav"

print(f"\n{'='*60}")
print("Results")
print(f"{'='*60}")
print(f"Frames captured: {len(frame_files)}")
print(f"Recording wall:  {rec_wall:.2f}s")
if frame_files:
    print(f"First frame:     {frame_files[0]}")
    print(f"Last frame:      {frame_files[-1]}")
    actual_fps = len(frame_files) / rec_wall
    print(f"Actual fps:      {actual_fps:.2f}")

# Verify mid-frame content via ffmpeg
if frame_files:
    mid = frame_files[len(frame_files) // 2]
    subprocess.run(
        ["ffmpeg", "-y", "-i", mid, "-f", "rawvideo", "-pix_fmt", "rgba", "/tmp/verify.raw"],
        capture_output=True
    )
    with open("/tmp/verify.raw", "rb") as f:
        d = f.read()
    stride = 640 * 4
    print(f"\nMid-frame pixels ({os.path.basename(mid)}):")
    for y in [160, 240, 320]:
        row = y * stride
        px = [tuple(d[row + x*4:row + x*4 + 4]) for x in [120, 320, 520]]
        print(f"  y={y}: {px}")

# Mux to MP4 using audio duration for sync
if len(frame_files) > 0:
    frame_pattern = f"{REC_DIR}/frame_%04d.tga"
    
    # Get audio duration for accurate fps calculation
    audio_duration = 0.0
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", wav_path],
            capture_output=True, text=True
        )
        audio_duration = float(result.stdout.strip())
    except:
        pass
    
    # Use audio duration if available, otherwise wall time
    if audio_duration > 0:
        actual_fps = len(frame_files) / audio_duration
        print(f"\nUsing audio duration for sync: {audio_duration:.3f}s")
        print(f"Computed fps from audio:       {actual_fps:.2f}")
    
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(actual_fps),
        "-start_number", "1",
        "-i", frame_pattern,
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-vsync", "cfr",
        OUT_MP4,
    ]
    print(f"\nMuxing to MP4...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0 and os.path.exists(OUT_MP4):
        print(f"MP4 written: {OUT_MP4}")
        print(f"MP4 size:    {os.path.getsize(OUT_MP4)} bytes")
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "stream=duration,nb_frames,r_frame_rate",
             "-of", "default=noprint_wrappers=1", OUT_MP4],
            capture_output=True, text=True
        )
        print(f"\nStream info:")
        for line in probe.stdout.strip().split("\n"):
            print(f"  {line}")
    else:
        print(f"ffmpeg failed:\n{result.stderr}")

print("\nDone.")
