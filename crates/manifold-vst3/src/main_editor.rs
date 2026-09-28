//! Original Main browser surface embedded in a VST3 X11 plug view.

use std::ffi::{CStr, c_char, c_void};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use base64::Engine;
use crossbeam_queue::ArrayQueue;
use manifold_native::main_host_parameters::MainParameter;
use manifold_native::main_instrument::valid_main_command;
use vst3::{
    Class, ComPtr, ComRef, ComWrapper, Steinberg::Linux::*, Steinberg::Vst::*, Steinberg::*,
};

use crate::main_controller::MainShared;

const WIDTH: i32 = 1280;
const HEIGHT: i32 = 780;
const MAX_ACTIONS: usize = 256;
const MAX_TRANSFER_BYTES: usize = 300 * 1024 * 1024;
const EXPORT_CHUNKS_PER_TICK: usize = 8;

enum Action {
    Begin(u32),
    Value(u32, f32),
    End(u32),
    Command(u32, f32),
    Note(u8, u8, u8),
    Sample(u8, u8, f32),
    ImportStart(usize),
    ImportChunk(Vec<u8>),
    ImportEnd,
    ImportInvalid,
    Export,
}

struct ImportAssembly {
    expected: usize,
    bytes: Vec<u8>,
}

struct ExportProgress {
    expected: usize,
    offset: usize,
}

struct Session {
    child: Child,
    reader: Option<JoinHandle<()>>,
    running: Arc<AtomicBool>,
}

impl Session {
    fn send(&mut self, message: &str) -> bool {
        self.child
            .stdin
            .as_mut()
            .is_some_and(|stdin| writeln!(stdin, "{message}").is_ok() && stdin.flush().is_ok())
    }
    fn stop(mut self) {
        self.running.store(false, Ordering::Release);
        let _ = self.send("{\"kind\":\"quit\"}");
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}

struct State {
    shared: Arc<MainShared>,
    actions: Arc<ArrayQueue<Action>>,
    session: Mutex<Option<Session>>,
    ready: AtomicBool,
    status_requested: AtomicBool,
    last_sent: AtomicU64,
    import: Mutex<Option<ImportAssembly>>,
    export: Mutex<Option<ExportProgress>>,
}

impl State {
    fn new(shared: Arc<MainShared>) -> Arc<Self> {
        Arc::new(Self {
            shared,
            actions: Arc::new(ArrayQueue::new(MAX_ACTIONS)),
            session: Mutex::new(None),
            ready: AtomicBool::new(false),
            status_requested: AtomicBool::new(false),
            last_sent: AtomicU64::new(u64::MAX),
            import: Mutex::new(None),
            export: Mutex::new(None),
        })
    }

    fn send(&self, message: &str) -> bool {
        self.session
            .lock()
            .ok()
            .and_then(|mut slot| slot.as_mut().map(|session| session.send(message)))
            .unwrap_or(false)
    }

    fn import_result(&self, ok: bool) {
        let message = if ok {
            "{\"kind\":\"session-import-result\",\"ok\":true,\"message\":\"Main session opened in the native host.\"}"
        } else {
            "{\"kind\":\"session-import-result\",\"ok\":false,\"message\":\"Main session rejected; previous state retained.\"}"
        };
        let _ = self.send(message);
    }

    fn export_failed(&self) {
        self.shared.end_export();
        if let Ok(mut slot) = self.export.lock() {
            *slot = None;
        }
        let _ = self.send("{\"kind\":\"session-export-result\",\"ok\":false,\"message\":\"Native Main session could not be saved.\"}");
    }

    fn send_export_chunks(&self) {
        let Ok(mut slot) = self.export.lock() else {
            return;
        };
        let Some(progress) = slot.as_mut() else {
            return;
        };
        for _ in 0..EXPORT_CHUNKS_PER_TICK {
            if progress.offset == progress.expected {
                self.shared.end_export();
                let _ = self.send("{\"kind\":\"session-export-end\"}");
                *slot = None;
                return;
            }
            let Some(chunk) = self.shared.export_chunk(progress.offset) else {
                drop(slot);
                self.export_failed();
                return;
            };
            if chunk.len() > progress.expected - progress.offset {
                drop(slot);
                self.export_failed();
                return;
            }
            let data = base64::engine::general_purpose::STANDARD.encode(&chunk);
            let message =
                serde_json::json!({"kind":"session-export-chunk","data":data}).to_string();
            if !self.send(&message) {
                drop(slot);
                self.export_failed();
                return;
            }
            progress.offset += chunk.len();
        }
    }

    fn send_state(&self) -> bool {
        let Some(document) = self
            .shared
            .presentation
            .lock()
            .ok()
            .and_then(|value| value.clone())
        else {
            return false;
        };
        let message = serde_json::json!({"kind":"state","document":document}).to_string();
        self.session
            .lock()
            .ok()
            .and_then(|mut session| session.as_mut().map(|session| session.send(&message)))
            .unwrap_or(false)
    }

    fn tick(&self) {
        let handler = self
            .shared
            .handler
            .lock()
            .ok()
            .and_then(|slot| slot.clone());
        while let Some(action) = self.actions.pop() {
            match action {
                Action::Begin(id) => {
                    if let Some(handler) = handler.as_ref() {
                        unsafe { handler.beginEdit(id) };
                    }
                }
                Action::Value(id, plain) => {
                    if let Some(normalized) = self.shared.set_plain(id, plain) {
                        if let Some(handler) = handler.as_ref() {
                            unsafe { handler.performEdit(id, normalized) };
                        }
                    }
                }
                Action::End(id) => {
                    if let Some(handler) = handler.as_ref() {
                        unsafe { handler.endEdit(id) };
                    }
                }
                Action::Command(id, value) => {
                    let mut bytes = [0_u8; 12];
                    bytes[..4].copy_from_slice(&0_u32.to_le_bytes());
                    bytes[4..8].copy_from_slice(&id.to_le_bytes());
                    bytes[8..].copy_from_slice(&value.to_le_bytes());
                    let _ = self
                        .shared
                        .send_payload(c"manifold.main.action.v1", c"action", &bytes);
                }
                Action::Note(action, note, velocity) => {
                    let mut bytes = [0_u8; 12];
                    bytes[..4].copy_from_slice(&1_u32.to_le_bytes());
                    let encoded = ((action as u32) << 16) | ((note as u32) << 8) | velocity as u32;
                    bytes[4..8].copy_from_slice(&encoded.to_le_bytes());
                    let _ = self
                        .shared
                        .send_payload(c"manifold.main.action.v1", c"action", &bytes);
                }
                Action::Sample(action, source, bars) => {
                    let mut bytes = [0_u8; 8];
                    bytes[0] = action;
                    bytes[1] = source;
                    bytes[4..].copy_from_slice(&bars.to_le_bytes());
                    if !self
                        .shared
                        .send_payload(c"manifold.main.sample.v1", c"sample", &bytes)
                    {
                        if let Ok(mut session) = self.session.lock() {
                            if let Some(session) = session.as_mut() {
                                let _ = session.send("{\"kind\":\"sample-update\",\"data\":{\"phase\":\"rejected\"}}");
                            }
                        }
                    }
                }
                Action::ImportStart(expected) => {
                    if let Ok(mut slot) = self.import.lock() {
                        *slot = None;
                    }
                    self.shared.abort_import();
                    if expected == 0
                        || expected > MAX_TRANSFER_BYTES
                        || !self.shared.begin_import(expected)
                    {
                        self.import_result(false);
                    } else if let Ok(mut slot) = self.import.lock() {
                        *slot = Some(ImportAssembly {
                            expected,
                            bytes: Vec::new(),
                        });
                    }
                }
                Action::ImportChunk(chunk) => {
                    let Ok(mut slot) = self.import.lock() else {
                        continue;
                    };
                    let Some(import) = slot.as_mut() else {
                        continue;
                    };
                    if chunk.is_empty()
                        || chunk.len() > import.expected.saturating_sub(import.bytes.len())
                        || import.bytes.try_reserve(chunk.len()).is_err()
                        || !self.shared.append_import(&chunk)
                    {
                        *slot = None;
                        self.shared.abort_import();
                        drop(slot);
                        self.import_result(false);
                        continue;
                    }
                    import.bytes.extend_from_slice(&chunk);
                }
                Action::ImportInvalid => {
                    if let Ok(mut slot) = self.import.lock() {
                        *slot = None;
                    }
                    self.shared.abort_import();
                    self.import_result(false);
                }
                Action::ImportEnd => {
                    let import = self.import.lock().ok().and_then(|mut slot| slot.take());
                    let accepted = import.is_some_and(|import| {
                        import.bytes.len() == import.expected
                            && self.shared.finish_import(&import.bytes)
                    });
                    if !accepted {
                        self.shared.abort_import();
                    }
                    self.import_result(accepted);
                }
                Action::Export => {
                    if self.export.lock().ok().is_some_and(|slot| slot.is_some()) {
                        continue;
                    }
                    let Some(expected) = self.shared.begin_export() else {
                        self.export_failed();
                        continue;
                    };
                    let message =
                        serde_json::json!({"kind":"session-export-start","size":expected})
                            .to_string();
                    if !self.send(&message) {
                        self.export_failed();
                        continue;
                    }
                    if let Ok(mut slot) = self.export.lock() {
                        *slot = Some(ExportProgress {
                            expected,
                            offset: 0,
                        });
                    }
                }
            }
        }
        if self.ready.load(Ordering::Acquire) {
            let version = self.shared.version.load(Ordering::Acquire);
            if self.last_sent.load(Ordering::Acquire) != version && self.send_state() {
                self.last_sent.store(version, Ordering::Release);
            }
            if self.status_requested.swap(false, Ordering::AcqRel) {
                if let Some(data) = self.shared.request_status() {
                    let message = serde_json::json!({"kind":"live-status","data":data}).to_string();
                    if let Ok(mut session) = self.session.lock() {
                        if let Some(session) = session.as_mut() {
                            let _ = session.send(&message);
                        }
                    }
                }
            }
            if let Some(updates) = self
                .shared
                .poll_sample()
                .and_then(|value| value.as_array().cloned())
            {
                if let Ok(mut session) = self.session.lock() {
                    if let Some(session) = session.as_mut() {
                        for data in updates {
                            let message =
                                serde_json::json!({"kind":"sample-update","data":data}).to_string();
                            let _ = session.send(&message);
                        }
                    }
                }
            }
            self.send_export_chunks();
        }
    }

    fn stop(&self) {
        self.ready.store(false, Ordering::Release);
        self.status_requested.store(false, Ordering::Release);
        self.last_sent.store(u64::MAX, Ordering::Release);
        if let Ok(mut slot) = self.import.lock() {
            *slot = None;
        }
        if let Ok(mut slot) = self.export.lock() {
            *slot = None;
        }
        self.shared.abort_import();
        self.shared.end_export();
        if let Ok(mut slot) = self.session.lock() {
            if let Some(session) = slot.take() {
                session.stop();
            }
        }
        while self.actions.pop().is_some() {}
    }
}

struct Timer(Arc<State>);
impl Class for Timer {
    type Interfaces = (ITimerHandler,);
}
impl ITimerHandlerTrait for Timer {
    unsafe fn onTimer(&self) {
        self.0.tick();
    }
}

struct TimerRegistration {
    loop_ref: ComPtr<IRunLoop>,
    handler: ComPtr<ITimerHandler>,
}
impl TimerRegistration {
    fn stop(self) {
        unsafe { self.loop_ref.unregisterTimer(self.handler.as_ptr()) };
    }
}

struct View {
    state: Arc<State>,
    timer: Mutex<Option<TimerRegistration>>,
}

impl View {
    fn new(shared: Arc<MainShared>) -> Self {
        Self {
            state: State::new(shared),
            timer: Mutex::new(None),
        }
    }
    fn stop_timer(&self) {
        if let Ok(mut slot) = self.timer.lock() {
            if let Some(timer) = slot.take() {
                timer.stop();
            }
        }
    }
}

impl Drop for View {
    fn drop(&mut self) {
        self.stop_timer();
        self.state.stop();
    }
}

impl Class for View {
    type Interfaces = (IPlugView,);
}

impl IPlugViewTrait for View {
    unsafe fn isPlatformTypeSupported(&self, kind: FIDString) -> tresult {
        if kind.is_null() {
            return kResultFalse;
        }
        if unsafe { CStr::from_ptr(kind) }
            == unsafe { CStr::from_ptr(kPlatformTypeX11EmbedWindowID) }
        {
            kResultTrue
        } else {
            kResultFalse
        }
    }
    unsafe fn attached(&self, parent: *mut c_void, kind: FIDString) -> tresult {
        if parent.is_null() || unsafe { self.isPlatformTypeSupported(kind) } != kResultTrue {
            return kResultFalse;
        }
        let Some((binary, assets)) = bundle() else {
            return kResultFalse;
        };
        let Ok(mut session) = self.state.session.lock() else {
            return kResultFalse;
        };
        if session.is_some() {
            return kResultFalse;
        }
        let Ok(mut child) = Command::new(binary)
            .arg((parent as usize).to_string())
            .arg(assets)
            .arg("main")
            .env("GDK_BACKEND", "x11")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
        else {
            return kResultFalse;
        };
        let Some(stdout) = child.stdout.take() else {
            let _ = child.kill();
            return kResultFalse;
        };
        let state = self.state.clone();
        let queue = self.state.actions.clone();
        let running = Arc::new(AtomicBool::new(true));
        let reader_running = running.clone();
        let reader = std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                if !reader_running.load(Ordering::Acquire) {
                    break;
                }
                let Ok(line) = line else {
                    break;
                };
                if line.len() > 4096 {
                    continue;
                }
                let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
                    continue;
                };
                if value["version"] != 1 {
                    continue;
                }
                if value["kind"] == "editor-ready" {
                    state.ready.store(true, Ordering::Release);
                    continue;
                }
                if value["kind"] == "snapshot" {
                    state.status_requested.store(true, Ordering::Release);
                    continue;
                }
                let action = match value["kind"].as_str() {
                    Some("gesture-begin") | Some("gesture-end") => {
                        let Some(id) = value["id"].as_u64().and_then(|id| u32::try_from(id).ok())
                        else {
                            continue;
                        };
                        if MainParameter::spec(id).is_err() {
                            continue;
                        }
                        if value["kind"] == "gesture-begin" {
                            Action::Begin(id)
                        } else {
                            Action::End(id)
                        }
                    }
                    Some("parameter") => {
                        let (Some(id), Some(plain)) = (
                            value["id"].as_u64().and_then(|id| u32::try_from(id).ok()),
                            value["value"].as_f64(),
                        ) else {
                            continue;
                        };
                        let plain = plain as f32;
                        if MainParameter::decode(id, plain).is_err() {
                            continue;
                        }
                        Action::Value(id, plain)
                    }
                    Some("command") => {
                        let (Some(id), Some(value)) = (
                            value["id"].as_u64().and_then(|id| u32::try_from(id).ok()),
                            value["value"].as_f64(),
                        ) else {
                            continue;
                        };
                        let value = value as f32;
                        if !valid_main_command(id, value) {
                            continue;
                        }
                        Action::Command(id, value)
                    }
                    Some("note") => {
                        let (Some(action), Some(note), Some(velocity)) = (
                            value["action"].as_u64(),
                            value["note"].as_u64(),
                            value["velocity"].as_u64(),
                        ) else {
                            continue;
                        };
                        let (Ok(action), Ok(note), Ok(velocity)) = (
                            u8::try_from(action),
                            u8::try_from(note),
                            u8::try_from(velocity),
                        ) else {
                            continue;
                        };
                        if !matches!(
                            (action, note, velocity),
                            (0, 0..=127, 1..=127) | (1, 0..=127, _) | (2, _, _)
                        ) {
                            continue;
                        }
                        Action::Note(action, note, velocity)
                    }
                    Some("sample") => {
                        let action = match value["action"].as_str() {
                            Some("retro") => 0,
                            Some("free-start") => 1,
                            Some("free-stop") => 2,
                            Some("free-cancel") => 3,
                            _ => continue,
                        };
                        let source = value["source"].as_u64().unwrap_or(0);
                        let bars = value["bars"].as_f64().unwrap_or(0.0);
                        if source > 4 || !bars.is_finite() || !(0.0..=16.0).contains(&bars) {
                            continue;
                        }
                        Action::Sample(action, source as u8, bars as f32)
                    }
                    Some("session-import-start") => {
                        let Some(expected) = value["size"]
                            .as_u64()
                            .and_then(|size| usize::try_from(size).ok())
                        else {
                            continue;
                        };
                        Action::ImportStart(expected)
                    }
                    Some("session-import-chunk") => {
                        match value["data"].as_str().filter(|data| data.len() <= 3000) {
                            Some(encoded) => {
                                match base64::engine::general_purpose::STANDARD.decode(encoded) {
                                    Ok(chunk) if !chunk.is_empty() && chunk.len() <= 2048 => {
                                        Action::ImportChunk(chunk)
                                    }
                                    _ => Action::ImportInvalid,
                                }
                            }
                            None => Action::ImportInvalid,
                        }
                    }
                    Some("session-import-end") => Action::ImportEnd,
                    Some("session-export") => Action::Export,
                    _ => continue,
                };
                let mut action = action;
                while reader_running.load(Ordering::Acquire) {
                    match queue.push(action) {
                        Ok(()) => break,
                        Err(pending) => action = pending,
                    }
                    std::thread::sleep(Duration::from_millis(1));
                }
            }
        });
        *session = Some(Session {
            child,
            reader: Some(reader),
            running,
        });
        kResultOk
    }
    unsafe fn removed(&self) -> tresult {
        self.state.stop();
        kResultOk
    }
    unsafe fn onWheel(&self, _distance: f32) -> tresult {
        kResultFalse
    }
    unsafe fn onKeyDown(&self, _key: char16, _key_code: int16, _modifiers: int16) -> tresult {
        kResultFalse
    }
    unsafe fn onKeyUp(&self, _key: char16, _key_code: int16, _modifiers: int16) -> tresult {
        kResultFalse
    }
    unsafe fn getSize(&self, size: *mut ViewRect) -> tresult {
        if size.is_null() {
            return kInvalidArgument;
        }
        unsafe {
            *size = ViewRect {
                left: 0,
                top: 0,
                right: WIDTH,
                bottom: HEIGHT,
            };
        }
        kResultOk
    }
    unsafe fn onSize(&self, size: *mut ViewRect) -> tresult {
        if size.is_null() {
            return kInvalidArgument;
        }
        let size = unsafe { &*size };
        if size.right - size.left == WIDTH && size.bottom - size.top == HEIGHT {
            kResultOk
        } else {
            kResultFalse
        }
    }
    unsafe fn onFocus(&self, _state: TBool) -> tresult {
        kResultOk
    }
    unsafe fn setFrame(&self, frame: *mut IPlugFrame) -> tresult {
        self.stop_timer();
        let Some(frame) = (unsafe { ComRef::from_raw(frame) }) else {
            return kResultOk;
        };
        let Some(loop_ref) = frame.cast::<IRunLoop>() else {
            return kResultFalse;
        };
        let handler = ComWrapper::new(Timer(self.state.clone()))
            .to_com_ptr::<ITimerHandler>()
            .unwrap();
        if unsafe { loop_ref.registerTimer(handler.as_ptr(), 16) } != kResultOk {
            return kResultFalse;
        }
        if let Ok(mut slot) = self.timer.lock() {
            *slot = Some(TimerRegistration { loop_ref, handler });
            kResultOk
        } else {
            unsafe { loop_ref.unregisterTimer(handler.as_ptr()) };
            kResultFalse
        }
    }
    unsafe fn canResize(&self) -> tresult {
        kResultFalse
    }
    unsafe fn checkSizeConstraint(&self, size: *mut ViewRect) -> tresult {
        unsafe { self.getSize(size) }
    }
}

pub(crate) fn create_view(name: *const c_char, shared: Arc<MainShared>) -> *mut IPlugView {
    if name.is_null()
        || unsafe { CStr::from_ptr(name) }.to_bytes() != b"editor"
        || bundle().is_none()
    {
        return null_mut();
    }
    ComWrapper::new(View::new(shared))
        .to_com_ptr::<IPlugView>()
        .unwrap()
        .into_raw()
}

fn bundle() -> Option<(PathBuf, PathBuf)> {
    let mut info = unsafe { std::mem::zeroed::<libc::Dl_info>() };
    if unsafe { libc::dladdr(bundle as *const c_void, &mut info) } == 0 || info.dli_fname.is_null()
    {
        return None;
    }
    let module = PathBuf::from(unsafe { CStr::from_ptr(info.dli_fname) }.to_str().ok()?);
    let binary = module.parent()?.join("ManifoldFX-editor");
    let assets = module.parent()?.parent()?.join("Resources/assets");
    (binary.is_file() && assets.join("main-looper.html").is_file()).then_some((binary, assets))
}
