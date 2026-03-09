#!/bin/bash
# Debug script for resolution-dependent freeze
# Usage: ./debug_freeze.sh [PID]

# If no PID provided, find the Manifold process
if [ -z "$1" ]; then
    PID=$(pgrep -f "Manifold_artefacts.*Manifold" | head -1)
    if [ -z "$PID" ]; then
        echo "Error: No Manifold process found"
        exit 1
    fi
else
    PID=$1
fi

echo "=== Manifold Debug Info for PID $PID ==="
echo ""

# Basic process info
echo "=== Process Info ==="
ps -p $PID -o pid,vsz,rss,pcpu,pmem,stat,comm
echo ""

# Thread count
echo "=== Thread Count ==="
ls /proc/$PID/task | wc -l
echo ""

# Current threads
echo "=== Threads ==="
ps -T -p $PID -o pid,tid,pcpu,comm | head -20
echo ""

# Open file descriptors
echo "=== Open FDs (count) ==="
ls /proc/$PID/fd | wc -l
echo ""

# GPU info
echo "=== GPU Processes ==="
nvidia-smi 2>/dev/null | grep -E "Manifold|$PID" || echo "nvidia-smi not available or no NVIDIA GPU"
echo ""

# Check for blocking
echo "=== Stack Trace (requires gdb) ==="
echo "Run: gdb -p $PID -batch -ex 'thread apply all bt'"
echo ""

# Check /proc for wait channels
echo "=== Thread Wait Channels ==="
for tid in $(ls /proc/$PID/task); do
    wchan=$(cat /proc/$PID/task/$tid/wchan 2>/dev/null)
    echo "Thread $tid: $wchan"
done | head -20
echo ""

# Memory info
echo "=== Memory Maps (first 20) ==="
head -20 /proc/$PID/maps
echo ""

# Screenshot of current state
echo "=== /proc/$PID/status ==="
cat /proc/$PID/status | grep -E "Name|State|Threads|VmSize|VmRSS|VmData|voluntary"
echo ""

echo "=== To attach gdb and get full backtrace: ==="
echo "sudo gdb -p $PID -batch -ex 'set pagination off' -ex 'thread apply all bt full'"
echo ""
echo "=== To get aperf (instruction pointer sampling): ==="
echo "perf top -p $PID"
