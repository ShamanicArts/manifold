#!/usr/bin/env python3
"""
Inline GPU composite recording — continuous motion with dramatic changes.
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
# Behavior script — fast continuous motion with dramatic changes
# ============================================================================
with open(f"{TEMP_DIR}/ui/composite.lua", "w") as f:
    f.write('''local M = {}\n''')
    f.write('''\n''')
    f.write('''local function sinEnv(t, period)\n''')
    f.write('''  return 0.5 + 0.5 * math.sin(2 * math.pi * t / period)\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''local function pickSourceA(t)\n''')
    f.write('''  local cycle = (t * 0.5) % 3\n''')
    f.write('''  local phase = math.floor(cycle)\n''')
    f.write('''  \n''')
    f.write('''  if phase == 0 then\n''')
    f.write('''    return \"plasma\", {\n''')
    f.write('''      scale = 3.0 + 5.0 * math.sin(t * 0.8),\n''')
    f.write('''      speed = 0.4 + 0.4 * math.sin(t * 0.6),\n''')
    f.write('''      palette = math.sin(t * 0.4) * 0.5 + 0.5,\n''')
    f.write('''    }\n''')
    f.write('''  elseif phase == 1 then\n''')
    f.write('''    return \"fbm\", {\n''')
    f.write('''      scale = 2.0 + 2.5 * math.sin(t * 0.7),\n''')
    f.write('''      speed = 0.2 + 0.3 * math.sin(t * 0.5),\n''')
    f.write('''      gain = 0.4 + 0.15 * math.sin(t * 0.9),\n''')
    f.write('''      lacunarity = 2.0 + 0.4 * math.sin(t * 0.4),\n''')
    f.write('''    }\n''')
    f.write('''  else\n''')
    f.write('''    return \"noise\", {\n''')
    f.write('''      scale = 6.0 + 8.0 * math.sin(t * 0.6),\n''')
    f.write('''      speed = 0.3 + 0.4 * math.sin(t * 0.7),\n''')
    f.write('''      contrast = 0.8 + 0.5 * math.sin(t * 0.5),\n''')
    f.write('''    }\n''')
    f.write('''  end\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''local function pickSourceB(t)\n''')
    f.write('''  local cycle = (t * 0.4) % 3\n''')
    f.write('''  local phase = math.floor(cycle)\n''')
    f.write('''  \n''')
    f.write('''  if phase == 0 then\n''')
    f.write('''    return \"checker\", {\n''')
    f.write('''      scale = 8.0 + 12.0 * math.sin(t * 0.5),\n''')
    f.write('''      softness = 0.01 + 0.06 * math.sin(t * 0.8),\n''')
    f.write('''    }\n''')
    f.write('''  elseif phase == 1 then\n''')
    f.write('''    return \"plasma\", {\n''')
    f.write('''      scale = 2.5 + 3.5 * math.sin(t * 0.6),\n''')
    f.write('''      speed = 0.8 + 0.5 * math.sin(t * 0.5),\n''')
    f.write('''      palette = math.sin(t * 0.3) * 0.5 + 0.5,\n''')
    f.write('''    }\n''')
    f.write('''  else\n''')
    f.write('''    return \"fbm\", {\n''')
    f.write('''      scale = 1.2 + 2.0 * math.sin(t * 0.55),\n''')
    f.write('''      speed = 0.15 + 0.25 * math.sin(t * 0.65),\n''')
    f.write('''      gain = 0.4 + 0.15 * math.sin(t * 0.7),\n''')
    f.write('''      lacunarity = 1.8 + 0.4 * math.sin(t * 0.45),\n''')
    f.write('''    }\n''')
    f.write('''  end\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''local function buildStackA(t)\n''')
    f.write('''  local srcId, srcParams = pickSourceA(t)\n''')
    f.write('''  \n''')
    f.write('''  return shaders.buildPipeline({\n''')
    f.write('''    { enabled = true, effectId = \"fractal-echo\", params = {\n''')
    f.write('''      intensity = 0.3 + 0.35 * math.sin(t * 0.4),\n''')
    f.write('''      speed = 0.6 + 0.3 * math.sin(t * 0.3),\n''')
    f.write('''      param1 = 0.25 + 0.35 * math.sin(t * 0.5),\n''')
    f.write('''      param2 = 0.2 + 0.5 * math.sin(t * 0.4),\n''')
    f.write('''    }},\n''')
    f.write('''    { enabled = true, effectId = \"ripple\", params = {\n''')
    f.write('''      intensity = 0.25 + 0.25 * math.sin(t * 0.6),\n''')
    f.write('''      speed = 0.6 + 0.2 * math.sin(t * 0.5),\n''')
    f.write('''      param1 = 0.2 + 0.4 * math.sin(t * 0.4),\n''')
    f.write('''      param2 = 0.3 + 0.3 * math.sin(t * 0.5),\n''')
    f.write('''      freqMin = 15 + 10 * math.sin(t * 0.3),\n''')
    f.write('''      freqMax = 50 + 20 * math.sin(t * 0.35),\n''')
    f.write('''      waveScale = 0.015 + 0.01 * math.sin(t * 0.25),\n''')
    f.write('''      maxLayers = 5,\n''')
    f.write('''    }},\n''')
    f.write('''    { enabled = true, effectId = \"neon-edge\", params = {\n''')
    f.write('''      intensity = 0.35 + 0.4 * math.sin(t * 0.5),\n''')
    f.write('''      speed = 0.8 + 0.5 * math.sin(t * 0.4),\n''')
    f.write('''      param1 = 0.25 + 0.4 * math.sin(t * 0.45),\n''')
    f.write('''      param2 = 0.4 + 0.4 * math.sin(t * 0.6),\n''')
    f.write('''    }},\n''')
    f.write('''  }, \"contain\", { type = \"generator\", sourceId = srcId, params = srcParams })\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''local function buildStackB(t)\n''')
    f.write('''  local srcId, srcParams = pickSourceB(t)\n''')
    f.write('''  \n''')
    f.write('''  return shaders.buildPipeline({\n''')
    f.write('''    { enabled = true, effectId = \"time-smear\", params = {\n''')
    f.write('''      intensity = 0.3 + 0.3 * math.sin(t * 0.5),\n''')
    f.write('''      speed = 0.5 + 0.25 * math.sin(t * 0.4),\n''')
    f.write('''      param1 = (t * 0.08) % 1.0,\n''')
    f.write('''      param2 = 0.35 + 0.35 * math.sin(t * 0.6),\n''')
    f.write('''    }},\n''')
    f.write('''    { enabled = true, effectId = \"kaleidoscope\", params = {\n''')
    f.write('''      intensity = 0.5 + 0.25 * math.sin(t * 0.4),\n''')
    f.write('''      speed = 0.15 + 0.2 * math.sin(t * 0.3),\n''')
    f.write('''      param1 = 4 + 5 * math.sin(t * 0.35),\n''')
    f.write('''      param2 = 0.6 + 0.25 * math.sin(t * 0.4),\n''')
    f.write('''    }},\n''')
    f.write('''    { enabled = math.sin(t * 0.8) > 0.2, effectId = \"rgb-split\", params = {\n''')
    f.write('''      intensity = 0.35 + 0.35 * math.sin(t * 0.7),\n''')
    f.write('''      speed = 0.9 + 0.3 * math.sin(t * 0.5),\n''')
    f.write('''      param1 = 0.25 + 0.4 * math.sin(t * 0.4),\n''')
    f.write('''      param2 = (t * 0.05) % 1.0,\n''')
    f.write('''    }},\n''')
    f.write('''    { enabled = math.sin(t * 0.5) > 0.3, effectId = \"vhs\", params = {\n''')
    f.write('''      intensity = 0.25 + 0.3 * math.sin(t * 0.6),\n''')
    f.write('''      speed = 0.6 + 0.2 * math.sin(t * 0.5),\n''')
    f.write('''      param1 = 0.15 + 0.35 * math.sin(t * 0.7),\n''')
    f.write('''      param2 = 0.25 + 0.35 * math.sin(t * 0.5),\n''')
    f.write('''      tearThreshold = 0.92,\n''')
    f.write('''      tearAmount = 0.02 + 0.05 * math.sin(t * 0.4),\n''')
    f.write('''      wobbleAmount = 0.003 + 0.006 * math.sin(t * 0.5),\n''')
    f.write('''      bleedScale = 0.012,\n''')
    f.write('''    }},\n''')
    f.write('''  }, \"contain\", { type = \"generator\", sourceId = srcId, params = srcParams })\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''local BLEND_OPS = { \"normal\", \"overlay\", \"add\", \"multiply\", \"screen\", \"difference\", \"lighten\", \"darken\" }\n''')
    f.write('''local function pickBlendOp(t)\n''')
    f.write('''  local idx = 1 + math.floor((t / 0.8) % #BLEND_OPS)\n''')
    f.write('''  return BLEND_OPS[idx]\n''')
    f.write('''end\n''')
    f.write('''\n''')
    f.write('''local function buildComposite(t)\n''')
    f.write('''  local opId = pickBlendOp(t)\n''')
    f.write('''  local opacity = 0.55 + 0.35 * math.sin(t * 0.6)\n''')
    f.write('''  return {\n''')
    f.write('''    version = 1,\n''')
    f.write('''    kind = \"compositeQuad\",\n''')
    f.write('''    fitMode = \"contain\",\n''')
    f.write('''    bottomNodeId = \"stackA\",\n''')
    f.write('''    topNodeId = \"stackB\",\n''')
    f.write('''    blendOpId = opId,\n''')
    f.write('''    opacity = opacity,\n''')
    f.write('''    blendParams = {\n''')
    f.write('''      baseLevel = 0.75 + 0.4 * math.sin(t * 0.5),\n''')
    f.write('''      topLevel = 0.85 + 0.3 * math.sin(t * 0.6),\n''')
    f.write('''      topGamma = 0.75 + 0.4 * math.sin(t * 0.55),\n''')
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
    f.write('''  local t = ctx._phase * 0.033  -- ~30Hz\n''')
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

# Sample multiple frames to show continuous changes
if frame_files:
    print(f"\nCenter pixel samples (frame -> RGB):")
    for idx in [1, 50, 100, 150, 200, 250, 296]:
        if idx <= len(frame_files):
            mid = frame_files[idx - 1]
            subprocess.run(
                ["ffmpeg", "-y", "-i", mid, "-f", "rawvideo", "-pix_fmt", "rgba", "/tmp/check.raw", "-v", "error"],
                capture_output=True
            )
            with open("/tmp/check.raw", "rb") as f:
                d = f.read()
            stride = 640 * 4
            row = 240 * stride
            px = tuple(d[row + 320*4:row + 320*4 + 4])
            print(f"  frame {idx:3d}: RGB={px[:3]}")

# Mux to MP4
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
