#!/usr/bin/env python3
"""
Headless Rack Module Oscillator Promo Recorder

Automates ManifoldHeadless to:
1. Load the RackModuleHost project (DSP + UI)
2. Select the oscillator rack module
3. Make it play sound via parameter automation
4. Record audio + GL-captured UI frames headlessly
5. Mux into a viewable MP4

Run:
    python3 test_rack_osc_promo.py
"""

import glob
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time

PROJECT_ROOT = "/home/shamanic/dev/my-plugin-experiment"
HEADLESS_BIN = os.path.join(PROJECT_ROOT, "build-dev", "ManifoldHeadless")
RACK_DSP = os.path.join(PROJECT_ROOT, "UserScripts", "projects", "RackModuleHost", "dsp", "main.lua")
STANDALONE_OSC_DIR = os.path.join(PROJECT_ROOT, "UserScripts", "projects", "StandaloneOsc")
STANDALONE_OSC_MANIFEST = os.path.join(STANDALONE_OSC_DIR, "manifold.project.json5")
TEMP_PROJECT_DIR = os.path.join(PROJECT_ROOT, "UserScripts", "projects", "StandaloneOscShellless")
TEMP_NOSHELL_MANIFEST = os.path.join(TEMP_PROJECT_DIR, "manifold.project.json5")
OUTPUT_DIR = "/tmp/test_rack_osc_promo"
FINAL_MP4 = os.path.join(PROJECT_ROOT, "rack_osc_promo.mp4")


def cleanup_old_sockets():
    """Remove stale Manifold IPC socket files."""
    for p in glob.glob("/tmp/manifold_*.sock"):
        try:
            os.unlink(p)
        except OSError:
            pass


def find_socket_for_pid(pid):
    """Find the Manifold IPC socket for a specific PID."""
    expected = f"/tmp/manifold_{pid}.sock"
    return expected if os.path.exists(expected) else None


def ipc_send(sock_path, cmd, connect_timeout=2.0):
    """Send a single IPC command and return the response string."""
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(connect_timeout)
    try:
        s.connect(sock_path)
        s.settimeout(5.0)
        s.sendall((cmd + "\n").encode())
        data = b""
        while b"\n" not in data:
            chunk = s.recv(4096)
            if not chunk:
                break
            data += chunk
        return data.decode().strip()
    finally:
        s.close()


def wait_for_socket(proc, timeout=15):
    """Wait for the Manifold IPC socket belonging to proc to appear and respond."""
    pid = proc.pid
    for _ in range(timeout * 10):
        # Prefer socket matching our PID
        sock = find_socket_for_pid(pid)
        if not sock:
            # Fallback: any socket that responds to PING
            for candidate in sorted(glob.glob("/tmp/manifold_*.sock"), key=os.path.getctime, reverse=True):
                try:
                    resp = ipc_send(candidate, "PING", connect_timeout=0.3)
                    if resp.startswith("OK"):
                        return candidate
                except Exception:
                    pass
        else:
            try:
                resp = ipc_send(sock, "PING", connect_timeout=0.5)
                if resp.startswith("OK"):
                    return sock
            except Exception:
                pass
        # Check if process died
        if proc.poll() is not None:
            raise RuntimeError(f"ManifoldHeadless exited early with code {proc.returncode}")
        time.sleep(0.1)
    raise RuntimeError("IPC socket did not appear within %ds" % timeout)


def load_dsp(sock_path):
    """Load the RackModuleHost DSP script."""
    cmd = f'EVAL loadDspScript("{RACK_DSP}")'
    print(f"[IPC] {cmd}")
    resp = ipc_send(sock_path, cmd)
    print(f"[IPC] -> {resp}")
    if not resp.startswith("OK"):
        raise RuntimeError(f"Failed to load DSP: {resp}")
    # Give the DSP time to boot and sync endpoints
    time.sleep(0.5)


def switch_ui(sock_path):
    """Switch to the standalone oscillator UI without the shared shell."""
    # Create a temp project directory with a manifest that disables the shared
    # shell. It must be named manifold.project.json5 for JUCE to recognise it
    # as a manifest, so we use a sibling directory instead of a temp file.
    os.makedirs(os.path.join(TEMP_PROJECT_DIR, "ui"), exist_ok=True)
    ui_src = os.path.join(STANDALONE_OSC_DIR, "ui", "standalone_osc.ui.lua")
    ui_dst = os.path.join(TEMP_PROJECT_DIR, "ui", "standalone_osc.ui.lua")
    if not os.path.exists(ui_dst):
        os.symlink(os.path.abspath(ui_src), ui_dst)
    with open(TEMP_NOSHELL_MANIFEST, "w") as f:
        f.write('{\n  "name": "StandaloneOscillator",\n  "version": 1,\n  "ui": {\n    "root": "ui/standalone_osc.ui.lua",\n    "sharedShell": false\n  }\n}\n')
    cmd = f"UISWITCH {TEMP_NOSHELL_MANIFEST}"
    print(f"[IPC] {cmd}")
    resp = ipc_send(sock_path, cmd)
    print(f"[IPC] -> {resp}")
    # UI takes a moment to compile and load
    time.sleep(2.0)


def set_param(sock_path, path, value):
    """Set a single parameter via SET command."""
    cmd = f"SET {path} {value}"
    resp = ipc_send(sock_path, cmd)
    # Only print errors to keep output clean during animation
    if not resp.startswith("OK"):
        print(f"[IPC] {cmd} -> {resp}")
    return resp.startswith("OK")


def start_recording(sock_path, out_dir):
    """Start headless recording to the given directory."""
    shutil.rmtree(out_dir, ignore_errors=True)
    os.makedirs(out_dir, exist_ok=True)
    cmd = f"RECORD START png {out_dir}"
    print(f"[IPC] {cmd}")
    resp = ipc_send(sock_path, cmd)
    print(f"[IPC] -> {resp}")
    if not resp.startswith("OK"):
        raise RuntimeError(f"Failed to start recording: {resp}")
    return json.loads(resp[3:].strip()) if resp.startswith("OK ") else {}


def stop_recording(sock_path):
    """Stop recording and return metadata."""
    cmd = "RECORD STOP"
    print(f"[IPC] {cmd}")
    resp = ipc_send(sock_path, cmd)
    print(f"[IPC] -> {resp}")
    if not resp.startswith("OK"):
        raise RuntimeError(f"Failed to stop recording: {resp}")
    return json.loads(resp[3:].strip()) if resp.startswith("OK ") else {}


def analyze_wav(wav_path):
    """Return basic stats about a 16-bit mono/stereo WAV file."""
    with open(wav_path, "rb") as f:
        data = f.read()

    pos = 12
    audio = b""
    while pos < len(data):
        cid = data[pos:pos + 4]
        size = struct.unpack("<I", data[pos + 4:pos + 8])[0]
        if cid == b"data":
            audio = data[pos + 8:pos + 8 + size]
            break
        pos += 8 + size

    if not audio:
        return {"sample_count": 0, "max_abs": 0, "avg_abs": 0.0}

    # Assume 16-bit signed little-endian interleaved stereo
    samples = struct.unpack("<" + str(len(audio) // 2) + "h", audio)
    abs_samples = [abs(s) for s in samples]
    return {
        "sample_count": len(samples),
        "max_abs": max(abs_samples) if abs_samples else 0,
        "avg_abs": round(sum(abs_samples) / len(abs_samples), 1) if abs_samples else 0.0,
    }


def mux_mp4(frame_dir, wav_path, out_mp4, framerate=30):
    """Mux PNG frame sequence + WAV into an MP4 via ffmpeg."""
    frame_pattern = os.path.join(frame_dir, "frame_%04d.png")
    cmd = [
        "ffmpeg",
        "-y",
        "-framerate", str(framerate),
        "-start_number", "1",
        "-i", frame_pattern,
        "-i", wav_path,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-vsync", "cfr",
        "-async", "1",
        out_mp4,
    ]
    print(f"[ffmpeg] {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("[ffmpeg] stderr:", result.stderr[-2000:])
        raise RuntimeError("ffmpeg mux failed")
    print(f"[ffmpeg] MP4 written: {out_mp4}")


def animate_oscillator(sock_path, duration_sec=5.0, steps_per_sec=10):
    """Animate oscillator parameters for the given duration."""
    steps = int(duration_sec * steps_per_sec)
    sleep = 1.0 / steps_per_sec

    for i in range(steps + 1):
        t = i / steps  # 0.0 -> 1.0
        # Pitch sweep: C3 (48) -> C5 (72) -> C3 (48)
        pitch = 48.0 + 24.0 * (1.0 - abs(t * 2.0 - 1.0))
        set_param(sock_path, "/midi/synth/rack/osc/1/manualPitch", f"{pitch:.1f}")

        # Waveform cycle every ~1.5s
        waveform = int(t * 6) % 8
        set_param(sock_path, "/midi/synth/rack/osc/1/waveform", waveform)

        # Pulse width sweep
        pw = 0.1 + 0.8 * (0.5 + 0.5 * (t * 4.0 % 1.0))
        set_param(sock_path, "/midi/synth/rack/osc/1/pulseWidth", f"{pw:.2f}")

        # Unison ramp up and down
        unison = 1 + int(7 * (1.0 - abs(t * 2.0 - 1.0)))
        set_param(sock_path, "/midi/synth/rack/osc/1/unison", unison)

        # Detune sweep
        detune = 50.0 * (1.0 - abs(t * 2.0 - 1.0))
        set_param(sock_path, "/midi/synth/rack/osc/1/detune", f"{detune:.1f}")

        # Spread sweep
        spread = 0.5 * (1.0 - abs(t * 2.0 - 1.0))
        set_param(sock_path, "/midi/synth/rack/osc/1/spread", f"{spread:.2f}")

        time.sleep(sleep)


def main():
    print("=" * 60)
    print("Manifold Headless Rack Oscillator Promo Recorder")
    print("=" * 60)

    # Clean output and stale sockets
    shutil.rmtree(OUTPUT_DIR, ignore_errors=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    cleanup_old_sockets()

    # 1. Start ManifoldHeadless
    print("\n[1/8] Starting ManifoldHeadless...")
    env = os.environ.copy()
    env["MANIFOLD_PROFILE_WINDOW_SIZE"] = "472x208"
    proc = subprocess.Popen(
        [HEADLESS_BIN, "--test-ui", "--duration", "0"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )

    try:
        # 2. Wait for IPC socket
        print("[2/8] Waiting for IPC socket...")
        sock = wait_for_socket(proc, timeout=15)
        print(f"       Socket: {sock}")

        # 3. Load RackModuleHost DSP
        print("[3/8] Loading RackModuleHost DSP...")
        load_dsp(sock)

        # 4. Switch to RackModuleHost UI
        print("[4/8] Switching to RackModuleHost UI...")
        switch_ui(sock)

        # 5. Configure oscillator rack module
        print("[5/8] Configuring oscillator rack module...")
        set_param(sock, "/midi/synth/rack/osc/1/manualPitch", 60)
        set_param(sock, "/midi/synth/rack/osc/1/manualLevel", 0.9)
        set_param(sock, "/midi/synth/rack/osc/1/output", 1.0)
        set_param(sock, "/midi/synth/rack/osc/1/waveform", 1)  # saw
        time.sleep(0.3)

        # 6. Start recording
        print("[6/8] Starting recording...")
        start_recording(sock, OUTPUT_DIR)

        # 7. Animate parameters while recording
        print("[7/8] Animating oscillator parameters for 5 seconds...")
        animate_oscillator(sock, duration_sec=5.0, steps_per_sec=10)

        # 8. Stop recording
        print("[8/8] Stopping recording...")
        meta = stop_recording(sock)

    finally:
        print("\n[ cleanup ] Terminating ManifoldHeadless...")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        stderr = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
        if stderr.strip():
            print("[ManifoldHeadless stderr tail]")
            print(stderr[-2000:])
        # Clean up temp project
        try:
            shutil.rmtree(TEMP_PROJECT_DIR)
        except OSError:
            pass

    # Analyze results
    print("\n" + "=" * 60)
    print("Results")
    print("=" * 60)

    frame_files = sorted(glob.glob(os.path.join(OUTPUT_DIR, "frame_*.png")))
    wav_path = os.path.join(OUTPUT_DIR, "audio.wav")

    print(f"Frames captured: {len(frame_files)}")
    print(f"Audio file:      {wav_path} (exists={os.path.exists(wav_path)})")

    if frame_files:
        print(f"First frame:     {frame_files[0]}")
        print(f"Last frame:      {frame_files[-1]}")

    if os.path.exists(wav_path):
        stats = analyze_wav(wav_path)
        print(f"Audio samples:   {stats['sample_count']}")
        print(f"Audio max abs:   {stats['max_abs']}")
        print(f"Audio avg abs:   {stats['avg_abs']}")
        print(f"Has signal:      {stats['max_abs'] > 1000}")

    # Mux to MP4
    if frame_files and os.path.exists(wav_path):
        print("\nMuxing to MP4...")
        stats = analyze_wav(wav_path)
        audio_duration = stats["sample_count"] / 2 / 44100.0
        actual_fps = len(frame_files) / audio_duration if audio_duration > 0 else 30.0
        print(f"Audio duration:  {audio_duration:.2f}s")
        print(f"Actual fps:      {actual_fps:.2f}")
        mux_mp4(OUTPUT_DIR, wav_path, FINAL_MP4, framerate=actual_fps)
        print(f"Final MP4:       {FINAL_MP4}")
        print(f"MP4 size:        {os.path.getsize(FINAL_MP4)} bytes")
    else:
        print("\nSkipping mux - missing frames or audio")

    print("\nDone.")


if __name__ == "__main__":
    main()
