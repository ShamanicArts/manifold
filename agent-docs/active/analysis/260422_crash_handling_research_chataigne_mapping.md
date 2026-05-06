# Manifold Crash Handling Research: Chataigne Mapping & Implementation Plan

**Date:** 2026-04-22
**Research Subject:** Chataigne (https://github.com/benkuper/Chataigne) crash/exit handling techniques and how they map to Manifold.
**Goal:** Outline a concrete implementation plan to make Manifold's crash handling significantly better across standalone, VST3, and exported plugin targets.

---

## 1. What Chataigne Actually Does (Grounded in Source Code)

Chataigne's crash handling lives in its `juce_organicui` submodule, specifically:
- `app/CrashHandler.cpp` / `app/CrashHandler.h`
- `app/OrganicApplication.cpp` / `app/OrganicApplication.h`

### 1.1 Global Crash Handler Registration

`CrashDumpUploader::init()` calls:
```cpp
SystemStats::setApplicationCrashHandler((SystemStats::CrashHandlerFunction)handleCrashStatic);
```

Platform-specific handler signatures:
- **Windows:** `LONG WINAPI handleCrashStatic(LPEXCEPTION_POINTERS e)` — vectored exception handler
- **macOS/Linux:** `void handleCrashStatic(int signum)` — POSIX signal handler for `SIGSEGV`, `SIGABRT`, `SIGILL`, `SIGFPE`

### 1.2 Crash-Time Recovery Save

Inside `CrashDumpUploader::handleCrash()`, it serializes engine state:
```cpp
File f = Engine::mainEngine->getFile();
recoveredFile = f.existsAsFile()
    ? f.getParentDirectory().getChildFile(f.getFileNameWithoutExtension() + "_recovered" + f.getFileExtension())
    : File::getSpecialLocation(File::userDocumentsDirectory).getChildFile(
          getApp().appProperties->getStorageParameters().applicationName + "/recovered_session" + Engine::mainEngine->fileExtension);

if (recoveredFile.existsAsFile()) recoveredFile.deleteFile();

var data = Engine::mainEngine->getJSONData();
std::unique_ptr<OutputStream> os(recoveredFile.createOutputStream());
if (os != nullptr) {
    JSON::writeToStream(*os, data, false);
    os->flush();
}
```

Also captures:
- `SystemStats::getStackBacktrace()` → `crashlog.txt`
- Windows minidump via `MiniDumpWriteDump()` → `crashlog.dmp`

### 1.3 Virtual `handleCrashed()` Hook

`OrganicApplication` declares:
```cpp
virtual void handleCrashed() {}
```

Chataigne overrides it in `ChataigneApplication` to:
- Trigger `OSModule::crashedTrigger` for all OS modules
- Send analytics crash event via `MatomoAnalytics`

### 1.4 Crash Dialog & Upload

If `useWindow && crashAction == GlobalSettings::REPORT`:
```cpp
w.reset(new UploadWindow());
DialogWindow::showDialog("Got crashed ?", w.get(), getMainWindow(), Colours::black, true);
MessageManager::getInstance()->runDispatchLoop();
exitApp();
```

`uploadCrash()` POSTs `dumpFile`, `traceFile`, and `recoveredFile` to a configured PHP endpoint with params:
- `username`, `os`, `version`, `message`, `email`, `branch`

### 1.5 Relaunch-from-Crash

`exitApp()` checks `crashAction` enum:
- `RECOVER`: relaunch binary with `-c "<recoveredFile>"`
- `REOPEN`: relaunch with `-c "<curFile>"`

`moreThanOneInstanceAllowed()` detects crash relaunch:
```cpp
bool fromCrash = commandline.contains("-c ");
if (fromCrash) return true;
```

`initialise()` sets `launchedFromCrash = true` when `-c` is parsed, loading the recovered file directly.

### 1.6 Graceful Exit

`systemRequestedQuit()`:
```cpp
Engine::mainEngine->saveIfNeededAndUserAgreesAsync([](FileBasedDocument::SaveResult result) {
    if (result == savedOk) Engine::mainEngine->removeNewerAutosaves();
    quit();
});
```

`shutdown()`:
```cpp
CrashDumpUploader::deleteInstance();
AppUpdater::deleteInstance();
saveGlobalSettings();
mainComponent->clear();
mainWindow = nullptr;
```

---

## 2. What Manifold Actually Does (Grounded in Source Code)

### 2.1 Crash Handler: Nothing

No call to `SystemStats::setApplicationCrashHandler()`. No `SIGSEGV`/`SIGABRT` handler. The only signal handling is in `manifold/headless/ManifoldHeadless.cpp`:
```cpp
static void signalHandler(int) { shouldQuit.store(true); }
std::signal(SIGINT, signalHandler);
std::signal(SIGTERM, signalHandler);
```
This is purely for graceful CLI shutdown, not crash recovery.

### 2.2 Crash-Time Recovery Save: Nothing

`BehaviorCoreProcessor::getStateInformation()` only persists:
- Export plugin UI dimensions/view mode (`pluginUi` JSON object)
- Host parameter XML (`hostParamsXml`)

There is no autosave, no recovery snapshot, no `_recovered` file written on crash.

### 2.3 Stale Socket Pruning (Only "Detect Previous Death" Mechanism)

`ControlServer::start()` calls `pruneStaleManifoldSockets()`:
```cpp
if (::kill(pid, 0) == 0) continue;        // process still alive
if (errno != ESRCH) continue;             // some other error
fs::remove(entry.path(), removeEc);       // dead process, delete socket
```
This detects previous crashes for IPC cleanup but does not restore state.

### 2.4 Graceful Shutdown: `releaseResources()`

```cpp
void BehaviorCoreProcessor::releaseResources() {
    linkSync.shutdown();
    oscQueryServer.stop();
    oscServer.stop();
    controlServer.stop();
    drainRetiredGraphRuntimes();
    if (auto* pending = pendingRuntime.exchange(nullptr, std::memory_order_acq_rel)) {
        delete pending;
    }
    if (pendingRetireRuntime != nullptr) {
        delete pendingRetireRuntime;
        pendingRetireRuntime = nullptr;
    }
    if (activeRuntime != nullptr) {
        delete activeRuntime;
        activeRuntime = nullptr;
    }
}
```

**Notably does not touch `dspScriptHost` or `dspSlots`.** The code explicitly avoids Lua VM teardown due to known crashes.

### 2.5 Editor Destructor: Defensive Ordering

`BehaviorCoreEditor::~BehaviorCoreEditor()`:
```cpp
stopTimer();
directHost_.shutdown();
runtimeNodeDebugHost.setRootNode(nullptr);
clearRuntimeNodeLuaStateRecursive(rootCanvas.getRuntimeNode());
clearRuntimeNodeLuaStateRecursive(rootRuntime_.get());
removeChildComponent(&runtimeNodeDebugHost);
removeChildComponent(&directHost_);
processorRef.getControlServer().setLuaEngine(nullptr);
processorRef.getControlServer().setFrameTimings(nullptr);
```

Comment explicitly states this ordering exists because:
> "Fresh Bitwig coredumps point at sol::reference teardown inside RuntimeNode::CallbackSlots / user data destruction on editor close/reopen."

### 2.6 LuaEngine Destructor: Disconnects OSC Callbacks

```cpp
LuaEngine::~LuaEngine() {
    if (pImpl && pImpl->processor) {
        pImpl->processor->getOSCServer().setLuaCallback({});
        pImpl->processor->getOSCServer().setLuaQueryCallback({});
    }
}
```

### 2.7 Headless Harness: Aborts Destructors Entirely

```cpp
// Intentionally leak the transient test editor on process teardown.
// Offscreen GL screenshot capture keeps backend state alive long enough that
// fully destroying the editor here has been causing a late shutdown crash.
editor.release();
processor.getControlServer().stop();
processor.releaseResources();
std::_Exit(0);
```

### 2.8 Android Standalone: Bare Minimum

```cpp
void systemRequestedQuit() override { quit(); }
void shutdown() override { mainWindow = nullptr; }
```

---

## 3. Direct Technique Mapping

| Chataigne Technique | Manifold Equivalent | Status |
|---|---|---|
| `SystemStats::setApplicationCrashHandler()` | None. Only `SIGINT`/`SIGTERM` in headless. | **Absent** |
| `Engine::mainEngine->getJSONData()` recovery save | `getStateInformation()` only saves export UI + host params. `serializeStateToLua()` pushes atomic state to Lua but isn't persisted to disk. | **Absent. Mappable.** |
| `SystemStats::getStackBacktrace()` | Not called anywhere. | **Absent. Trivial to add.** |
| `MiniDumpWriteDump()` (Windows) | Not implemented. | **Absent. Port Chataigne's code directly.** |
| Virtual `handleCrashed()` hook | No hook exists on `BehaviorCoreProcessor` or `ScriptableProcessor`. | **Absent. Add to `ScriptableProcessor`.** |
| Crash dialog (`UploadWindow`) | No modal crash UI exists. | **Absent. Build new dialog component.** |
| HTTP upload of crash artifacts | No client upload logic. Has HTTP server in `OSCQuery` but no upload client. | **Absent. New upload thread needed.** |
| `exitApp()` relaunch with `-c <file>` | Headless uses `std::_Exit(0)`. Standalone uses auto-generated JUCE wrapper. | **Absent. Add to standalone wrapper.** |
| `launchedFromCrash` flag + `-c` parsing | `pruneStaleManifoldSockets()` detects dead PIDs from stale socket files. IPC cleanup only, not state recovery. | **Partial equivalent** |
| `systemRequestedQuit()` async save prompt | Android: trivial `quit()`. Standalone: default JUCE wrapper behavior. | **Absent in standalone** |
| `shutdown()` singleton cleanup | `releaseResources()` + destructors. Intentionally skips Lua/DSP teardown. | **Present but divergent** |

---

## 4. Implementation Plan

### 4.1 Core Crash Handler

**New file:** `manifold/primitives/app/CrashHandler.h`

```cpp
#pragma once
#include <juce_core/juce_core.h>
#include <atomic>

class ManifoldCrashHandler {
public:
    juce_DeclareSingleton(ManifoldCrashHandler, false)

    struct CrashInfo {
        juce::String stackTrace;
        juce::String signalName;
        juce::File recoveryFile;
        juce::File dumpFile;      // Windows minidump
        juce::File traceFile;     // stack trace + metadata
        juce::String userDescription;
        juce::String contactEmail;
        juce::String version;
        juce::Time crashTime;
    };

    void install(const juce::String& uploadUrl = {});
    void setRecoveryFilePath(const juce::File& file);
    void setProjectFilePath(const juce::File& file);
    void captureRecoverySnapshot(const juce::var& stateJson);

    // Called from signal handler context
    static void onCrash(int signalNumber);

    // Upload or save locally
    void uploadCrash(const CrashInfo& info);
    void saveCrashLocally(const CrashInfo& info);

    // Startup sentinel check
    bool hasPendingCrashReport();
    CrashInfo getPendingCrashReport();
    void clearPendingCrashReport();
    juce::Array<juce::File> getPendingReportDirectories();

private:
    std::atomic<bool> crashHandled{false};
    juce::File recoveryFilePath;
    juce::File projectFilePath;
    juce::String uploadUrl;
    juce::var lastKnownState;
    juce::CriticalSection stateLock;

    static juce::String getSignalName(int signum);
    void writeCrashMetadata(const CrashInfo& info);
};
```

**New file:** `manifold/primitives/app/CrashHandler.cpp`

Key implementation points:
- `install()` calls `SystemStats::setApplicationCrashHandler()` **only in standalone builds** (`#if !JucePlugin_Build_VST3`)
- `onCrash()` is `static` so it can be used as a C function pointer. It writes a sentinel file, captures stack trace, saves recovery snapshot, then exits.
- On Windows, `onCrash()` also captures `LPEXCEPTION_POINTERS` and writes minidump.
- **Never touches Lua, DSP, or JUCE message manager from signal context.**

### 4.2 Periodic Recovery Snapshot

Add to `BehaviorCoreProcessor`:

```cpp
void BehaviorCoreProcessor::writeRecoverySnapshot() {
    auto snapshot = buildSerializedStateMap(*this);
    juce::DynamicObject::Ptr root = new juce::DynamicObject();

    root->setProperty("projectPath", getCurrentProjectPath().getFullPathName());
    root->setProperty("dspScriptPath", getPrimaryDspScriptFile().getFullPathName());
    root->setProperty("uiScriptPath", luaEngine.getCurrentScriptFile().getFullPathName());
    root->setProperty("timestamp", juce::Time::getCurrentTime().toISO8601(true));
    root->setProperty("version", juce::String(ProjectInfo::versionString));

    // Atomic state
    juce::DynamicObject::Ptr state = new juce::DynamicObject();
    auto& as = controlServer.getAtomicState();
    state->setProperty("tempo", as.tempo.load());
    state->setProperty("sampleRate", as.sampleRate.load());
    state->setProperty("masterVolume", as.masterVolume.load());
    state->setProperty("inputVolume", as.inputVolume.load());
    state->setProperty("recording", as.isRecording.load());
    state->setProperty("overdub", as.overdubEnabled.load());
    state->setProperty("activeLayer", as.activeLayer.load());
    state->setProperty("recordMode", as.recordMode.load());
    state->setProperty("captureSize", as.captureSize.load());
    state->setProperty("graphEnabled", as.graphEnabled.load());
    root->setProperty("atomicState", juce::var(state.get()));

    // Layers
    juce::Array<juce::var> layers;
    for (int i = 0; i < MAX_LAYERS; ++i) {
        ScriptableLayerSnapshot snap;
        if (getLayerSnapshot(i, snap)) {
            juce::DynamicObject::Ptr layer = new juce::DynamicObject();
            layer->setProperty("state", toLayerStateString(snap.state));
            layer->setProperty("length", snap.length);
            layer->setProperty("position", snap.position);
            layer->setProperty("speed", snap.speed);
            layer->setProperty("volume", snap.volume);
            layer->setProperty("reversed", snap.reversed);
            layer->setProperty("muted", snap.muted);
            layers.add(juce::var(layer.get()));
        }
    }
    root->setProperty("layers", juce::var(layers));

    ManifoldCrashHandler::getInstance()->captureRecoverySnapshot(juce::var(root.get()));
}
```

Call this from `BehaviorCoreEditor::timerCallback()` every 5 seconds.

### 4.3 Stack Traces + Minidumps

Port Chataigne's `createDumpAndStrackTrace()` into `CrashHandler.cpp`:

```cpp
#if JUCE_WINDOWS
void ManifoldCrashHandler::createMinidump(void* exceptionPointers, const juce::File& dumpFile) {
    HANDLE hFile = CreateFile(dumpFile.getFullPathName().getCharPointer(),
                              GENERIC_READ | GENERIC_WRITE, 0, nullptr,
                              CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (hFile == INVALID_HANDLE_VALUE) return;

    MINIDUMP_EXCEPTION_INFORMATION info;
    info.ThreadId = GetCurrentThreadId();
    info.ExceptionPointers = (LPEXCEPTION_POINTERS)exceptionPointers;
    info.ClientPointers = FALSE;

    MiniDumpWriteDump(GetCurrentProcess(), GetCurrentProcessId(), hFile,
                      MiniDumpNormal, &info, nullptr, nullptr);
    CloseHandle(hFile);
}
#endif

void ManifoldCrashHandler::writeStackTrace(const juce::File& traceFile) {
    juce::String trace = juce::SystemStats::getStackBacktrace();
    juce::FileOutputStream fos(traceFile);
    if (fos.openedOk()) {
        fos.writeText(trace, false, false, "\n");
        fos.flush();
    }
}
```

### 4.4 Crash Dialog (Standalone)

**New files:** `manifold/primitives/app/CrashDialog.h` / `.cpp`

Simple JUCE component with:
- `TextEditor` for user description
- `TextEditor` for contact email
- `TextButton` "Send to Developer"
- `TextButton` "Save Locally"
- `TextButton` "Restart Manifold"
- `ProgressBar` for upload progress

Show dialog on **next startup** (safer than inside signal handler):

```cpp
// In standalone main() or BehaviourCoreEditor constructor
if (ManifoldCrashHandler::getInstance()->hasPendingCrashReport()) {
    auto info = ManifoldCrashHandler::getInstance()->getPendingCrashReport();
    CrashDialog dialog(info);
    dialog.enterModalState(true, nullptr);
}
```

### 4.5 Per-Target Strategy

| Target | Crash Handler | Recovery Save | Dialog | Notes |
|---|---|---|---|---|
| **Manifold Standalone** | ✅ Full `setApplicationCrashHandler()` | ✅ Periodic JSON snapshot | ✅ Startup crash dialog | Full parity with Chataigne |
| **Manifold VST3** | ❌ No global handler (host owns process) | ✅ Periodic JSON on message thread | ✅ Editor checks sentinel on open | Can't catch SIGSEGV, but can catch C++ exceptions |
| **Exported Plugin (Standalone)** | ✅ Full handler | ✅ Periodic JSON | ✅ Startup dialog | Same as Manifold Standalone |
| **Exported Plugin (VST3)** | ❌ No global handler | ✅ Periodic JSON | ✅ Editor sentinel check | Same as Manifold VST3 |
| **Headless harness** | ✅ `SIGINT`/`SIGTERM` only (already done) | ❌ Not needed | ❌ CLI output only | Keep `std::_Exit(0)` for test determinism |

### 4.6 Virtual `handleCrashed()` Hook

Add to `ScriptableProcessor` (`manifold/primitives/scripting/ScriptableProcessor.h`):

```cpp
class ScriptableProcessor {
public:
    virtual ~ScriptableProcessor() = default;
    virtual void handleCrashed() {} // called from crash-safe context, not signal handler
    // ... existing methods
};
```

Implement in `BehaviorCoreProcessor`:

```cpp
void BehaviorCoreProcessor::handleCrashed() {
    linkSync.shutdown();
    controlServer.stopRecording();
    writeRecoverySnapshot();
    oscServer.setCustomValue("/system/crashed", { juce::var(1) });
}
```

Called from `ManifoldCrashHandler::onCrash()` **after** writing files but before `_exit()`.

### 4.7 Agent Retrieval

Crash reports directory structure:
```
~/.manifold/crashes/
├── pending/
│   ├── crash_20250422_143052/
│   │   ├── recovery.json
│   │   ├── trace.txt
│   │   └── dump.dmp (Windows only)
│   └── ...
├── sent/
└── archive/
```

Add IPC commands to `ControlServer`:

```cpp
// In ControlServer::processCommand()
if (upperTrimmedCmd == "CRASH_REPORTS") {
    auto dirs = ManifoldCrashHandler::getInstance()->getPendingReportDirectories();
    // Build JSON array of pending reports
    return "OK {"pending": [...]}";
}
if (cmd.rfind("CRASH_UPLOAD ", 0) == 0) {
    // Trigger upload of specific report
    return "OK uploading...";
}
if (upperTrimmedCmd == "CRASH_CLEAR_ALL") {
    ManifoldCrashHandler::getInstance()->clearPendingCrashReport();
    return "OK";
}
```

Agent can retrieve via:
1. IPC: `echo "CRASH_REPORTS" | nc -U /tmp/manifold_<pid>.sock`
2. Direct file read: `ls ~/.manifold/crashes/pending/`
3. OSCQuery: `/system/crashReports` endpoint

### 4.8 Files to Create/Modify

**New files:**
- `manifold/primitives/app/CrashHandler.h`
- `manifold/primitives/app/CrashHandler.cpp`
- `manifold/primitives/app/CrashDialog.h`
- `manifold/primitives/app/CrashDialog.cpp`

**Modify:**
- `manifold/core/BehaviorCoreProcessor.h` — add `handleCrashed()` override, `writeRecoverySnapshot()`, `getCurrentProjectPath()`
- `manifold/core/BehaviorCoreProcessor.cpp` — implement snapshot logic, call periodically from editor timer
- `manifold/core/BehaviorCoreEditor.cpp` — check for crash sentinel in constructor
- `manifold/primitives/scripting/ScriptableProcessor.h` — add `virtual void handleCrashed()`
- `manifold/primitives/control/ControlServer.cpp` — add `CRASH_REPORTS`, `CRASH_UPLOAD`, `CRASH_CLEAR_ALL` commands
- `CMakeLists.txt` — add new source files

---

## 5. What "Better Than Chataigne" Looks Like

| Feature | Chataigne | Manifold (Proposed) |
|---|---|---|
| Signal handler writes recovery | ✅ Yes | ✅ Yes + **periodic autosave every 5s** |
| Stack trace | ✅ Yes | ✅ Yes |
| Minidump (Windows) | ✅ Yes | ✅ Yes |
| Serialized runtime state | ✅ `Engine::getJSONData()` | ✅ **AtomicState + layer snapshots + script paths** |
| Crash dialog | ✅ Inside signal handler | ✅ **Safer: shown on next startup** |
| Upload to developer | ✅ Single PHP endpoint | ✅ Configurable endpoint **or** save locally |
| Relaunch from recovery | ✅ `-c <file>` | ✅ `-c <file>` **+** editor detects crash on open |
| App-specific cleanup hook | ✅ `handleCrashed()` | ✅ `ScriptableProcessor::handleCrashed()` |
| Crash report enumeration | ❌ No | ✅ **IPC `CRASH_REPORTS` command for agent retrieval** |
| VST3 crash detection | ❌ N/A (standalone only) | ✅ **Editor sentinel check works in VST3 too** |
| User description + email | ✅ Yes | ✅ Yes |
| Auto-send without dialog | ✅ Yes | ✅ Yes (configurable) |

---

## 6. Immediate Next Steps (Vertical Slice)

1. **Create `ManifoldCrashHandler` singleton** with `install()`, `onCrash()` stub, and startup sentinel check
2. **Wire into standalone startup** with `#if !JucePlugin_Build_VST3`
3. **Add `writeRecoverySnapshot()`** to `BehaviorCoreProcessor` and call from `BehaviorCoreEditor::timerCallback()` every 5s
4. **Add startup sentinel check** in standalone main or editor constructor
5. **Add `CRASH_REPORTS` IPC command** to ControlServer so the agent can enumerate pending crashes

This gives us crash capture + recovery state + agent retrieval in one slice. Dialog and upload can follow in a second slice.
