

## Build Commands

```bash
# IMPORTANT: For fast iteration, use the dev build directory.
# It avoids LTO/IPO link-time overhead and is dramatically faster.

# Dev (fast iteration)
cmake -S . -B build-dev -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build-dev --target Manifold_Standalone

# Release-style (slow clean links due to LTO)
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target Manifold_Standalone
```

## Running

### Standalone Manifold
```bash
./build-dev/Manifold_artefacts/RelWithDebInfo/Standalone/Manifold
```

### VST3
```bash
./build-dev/Manifold_artefacts/RelWithDebInfo/VST3/Manifold.vst3
```


## IPC + OSCQuery

You have access to the running Application via IPC & OSCQUery. this should give you full observability and control over the application, if there is an area you cannot test, you should add it to the introspection. this enables deep debugging and testing of the application.

## UI System

The UI is entirely Lua-based with two main files:

- `manifold/ui/looper_ui.lua` - **Default UI** (minimal, modern)

### Widget Library (`ui_widgets.lua`)



**Built-in widgets:**
- `BaseWidget` (extendable), `Button`, `Label`, `Panel`
- `Slider`, `VSlider`, `Knob` (rotary), `Toggle`
- `Dropdown`, `WaveformView` (with scrubbing), `Meter`, `SegmentedControl`, `NumberBox`

**Critical:** All coordinates use `math.floor()` to satisfy sol2's strict typing (Lua doubles → C++ ints).


### Tmux Workflow (Long-running Processes)

Use **tmux session Manifold** with **windows 1 and 2** for all long-running commands. if this session doesnt exist create it:

```bash
# Check current sessions
ls -t /tmp/manifold_*.sock

# Capture pane output (before/after commands)
tmux capture-pane -p -t 0:1
tmux capture-pane -p -t 0:2

# Send commands to windows
tmux send-keys -t Manifold:1 'command here' Enter
tmux send-keys -t Manifold:2 'make -j$(nproc)' Enter

# Kill/restart standalone
tmux send-keys -t Manifold:1 C-c
sleep 2
tmux send-keys -t Manifold:1 './Manifold_artefacts/Release/Standalone/Manifold 2>&1' Enter
```

**Window assignments:**
- **Window 1 (Manifold:1)**: Manifold standalone process
- **Window 2 (Manifold:2)**: Build commands, tests, other processes

**Never use head/tail** on tmux capture output - it obfuscates the shell state.

### JJ Version Control Workflow

This project uses **Jujutsu (jj)** for version control. There is usuallly a commit called  "working merge" which is often a merge commit; 
Do not make commits unasked for, refer to the relevant skills and user guidance on how to correctly navigate JJ. 
JJ is not GIT and you should not assume it works the same as git.
