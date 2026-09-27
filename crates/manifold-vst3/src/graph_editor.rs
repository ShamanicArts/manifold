//! Linux graph view: the original browser widget renderers in an isolated
//! companion, with host edits delivered on VST3's UI run-loop timer.

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
use vst3::{
    Class, ComPtr, ComRef, ComWrapper, Steinberg::Linux::*, Steinberg::Vst::*, Steinberg::*,
};

use crate::graph_controller::GraphShared;
use manifold_native::parameters::{HOST_SLOT_BASE, HOST_SLOT_COUNT};

const WIDTH: i32 = 800;
const HEIGHT: i32 = 600;
const MAX_MESSAGES: usize = 256;
const MAX_PROJECT_BYTES: usize = 45 * 1024 * 1024;

struct ImportAssembly {
    name: String,
    expected: usize,
    bytes: Vec<u8>,
}

type ImportResult = Result<(String, Vec<u8>), &'static str>;

enum EditorAction {
    Import(ImportResult),
    Assign { id: u32, slot: u32 },
    CaptureStart { node: u32, seconds: f64 },
    CaptureFinish { instrument: u32 },
}

#[derive(Clone, Copy)]
enum Kind {
    Begin,
    Value,
    End,
}

#[derive(Clone, Copy)]
struct Message {
    kind: Kind,
    id: u32,
    value: f64,
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
    shared: Arc<GraphShared>,
    messages: Arc<ArrayQueue<Message>>,
    imports: Arc<ArrayQueue<EditorAction>>,
    session: Mutex<Option<Session>>,
    ready: AtomicBool,
    last_sent: AtomicU64,
}

impl State {
    fn new(shared: Arc<GraphShared>) -> Arc<Self> {
        Arc::new(Self {
            shared,
            messages: Arc::new(ArrayQueue::new(MAX_MESSAGES)),
            imports: Arc::new(ArrayQueue::new(2)),
            session: Mutex::new(None),
            ready: AtomicBool::new(false),
            last_sent: AtomicU64::new(u64::MAX),
        })
    }

    fn send_snapshot(&self) -> bool {
        let Some(document) = self.shared.snapshot() else {
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
        let action_status = self.imports.pop().and_then(|action| match action {
            EditorAction::Import(Ok((name, bytes))) => Some((match self.shared.import_project(&bytes) {
                Ok(()) => format!("Loaded {name} into the DAW graph."),
                Err(reason) => format!("Project unchanged: {reason}."),
            }, None)),
            EditorAction::Import(Err(reason)) => Some((format!("Project unchanged: {reason}."), None)),
            EditorAction::Assign { id, slot } => Some((match self.shared.reassign_slot(id, slot) {
                Ok(()) => format!("Assigned host slot {} to slot {}. Graph reloaded; active voices and effect tails reset. Existing automation may reach a different control.", id - HOST_SLOT_BASE + 1, slot + 1),
                Err(reason) => format!("Host slot unchanged: {reason}."),
            }, None)),
            EditorAction::CaptureStart { node, seconds } => Some(match self.shared.capture_start(node, seconds) {
                Ok(()) => (format!("Freezing {seconds} seconds from capture node {node}…"), None),
                Err(reason) => (format!("Capture failed: {reason}."), Some(false)),
            }),
            EditorAction::CaptureFinish { instrument } => match self.shared.capture_finish(instrument) {
                Ok(None) => None,
                Ok(Some(true)) => Some(("Captured source published. New notes use this take; compatible capture history was retained.".to_owned(), Some(true))),
                Ok(Some(false)) => Some(("Capture failed; the project was not changed.".to_owned(), Some(false))),
                Err(reason) => Some((format!("Capture failed: {reason}."), Some(false))),
            },
        });
        let handler = self
            .shared
            .handler
            .lock()
            .ok()
            .and_then(|handler| handler.clone());
        if let Some(handler) = handler.as_ref() {
            while let Some(message) = self.messages.pop() {
                match message.kind {
                    Kind::Begin => {
                        unsafe { handler.beginEdit(message.id) };
                    }
                    Kind::Value => {
                        if unsafe { handler.performEdit(message.id, message.value) } == kResultOk {
                            self.shared.set_value(message.id, message.value);
                        }
                    }
                    Kind::End => {
                        unsafe { handler.endEdit(message.id) };
                    }
                }
            }
        }
        if !self.ready.load(Ordering::Acquire) {
            return;
        }
        let current = self.shared.version();
        if self.last_sent.load(Ordering::Acquire) != current && self.send_snapshot() {
            self.last_sent.store(current, Ordering::Release);
        }
        if let Some((message, capture_result)) = action_status {
            let command = if let Some(ok) = capture_result {
                serde_json::json!({"kind":"capture-result","ok":ok,"message":message}).to_string()
            } else {
                serde_json::json!({"kind":"status","message":message}).to_string()
            };
            if let Ok(mut session) = self.session.lock() {
                if let Some(session) = session.as_mut() {
                    session.send(&command);
                }
            }
        }
    }

    fn stop(&self) {
        self.ready.store(false, Ordering::Release);
        self.last_sent.store(u64::MAX, Ordering::Release);
        if let Ok(mut session) = self.session.lock() {
            if let Some(session) = session.take() {
                session.stop();
            }
        }
        while self.messages.pop().is_some() {}
        while self.imports.pop().is_some() {}
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
        unsafe {
            self.loop_ref.unregisterTimer(self.handler.as_ptr());
        }
    }
}

struct View {
    state: Arc<State>,
    timer: Mutex<Option<TimerRegistration>>,
}
impl View {
    fn new(shared: Arc<GraphShared>) -> Self {
        Self {
            state: State::new(shared),
            timer: Mutex::new(None),
        }
    }
    fn stop_timer(&self) {
        if let Ok(mut timer) = self.timer.lock() {
            if let Some(timer) = timer.take() {
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
            .arg("graph")
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
        let queue = self.state.messages.clone();
        let imports = self.state.imports.clone();
        let state = self.state.clone();
        let running = Arc::new(AtomicBool::new(true));
        let reader_running = running.clone();
        let reader = std::thread::spawn(move || {
            let mut assembly: Option<ImportAssembly> = None;
            let submit = |mut result: EditorAction| {
                while reader_running.load(Ordering::Acquire) {
                    match imports.push(result) {
                        Ok(()) => return,
                        Err(value) => result = value,
                    }
                    std::thread::sleep(Duration::from_millis(1));
                }
            };
            for line in BufReader::new(stdout).lines() {
                if !reader_running.load(Ordering::Acquire) {
                    break;
                }
                let Ok(line) = line else { break };
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
                match value["kind"].as_str() {
                    Some("capture-start") => {
                        let node = value["nodeId"]
                            .as_u64()
                            .and_then(|id| u32::try_from(id).ok());
                        let seconds = value["seconds"].as_f64();
                        if let (Some(node), Some(seconds)) = (node, seconds) {
                            if node > 0 && seconds.is_finite() && (0.05..=30.0).contains(&seconds) {
                                submit(EditorAction::CaptureStart { node, seconds });
                            }
                        }
                        continue;
                    }
                    Some("capture-finish") => {
                        if let Some(instrument) = value["instrumentId"]
                            .as_u64()
                            .and_then(|id| u32::try_from(id).ok())
                            .filter(|id| *id > 0)
                        {
                            submit(EditorAction::CaptureFinish { instrument });
                        }
                        continue;
                    }
                    Some("slot-assign") => {
                        let id = value["id"].as_u64().and_then(|id| u32::try_from(id).ok());
                        let slot = value["slot"]
                            .as_u64()
                            .and_then(|slot| u32::try_from(slot).ok());
                        if let (Some(id), Some(slot)) = (id, slot) {
                            if (HOST_SLOT_BASE..HOST_SLOT_BASE + HOST_SLOT_COUNT as u32)
                                .contains(&id)
                                && (slot as usize) < HOST_SLOT_COUNT
                            {
                                submit(EditorAction::Assign { id, slot });
                            }
                        }
                        continue;
                    }
                    Some("import-start") => {
                        assembly = None;
                        let Some(size) = value["size"]
                            .as_u64()
                            .and_then(|size| usize::try_from(size).ok())
                        else {
                            continue;
                        };
                        let Some(name) = value["name"].as_str() else {
                            continue;
                        };
                        if size == 0 || size > MAX_PROJECT_BYTES || name.len() > 128 {
                            submit(EditorAction::Import(Err("project exceeds import limits")));
                            continue;
                        }
                        assembly = Some(ImportAssembly {
                            name: name.to_owned(),
                            expected: size,
                            bytes: Vec::with_capacity(size),
                        });
                        continue;
                    }
                    Some("import-chunk") => {
                        let Some(current) = assembly.as_mut() else {
                            continue;
                        };
                        let Some(chunk) =
                            value["data"].as_str().filter(|chunk| chunk.len() <= 3000)
                        else {
                            assembly = None;
                            submit(EditorAction::Import(Err("invalid project transfer")));
                            continue;
                        };
                        let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(chunk)
                        else {
                            assembly = None;
                            submit(EditorAction::Import(Err("invalid project transfer")));
                            continue;
                        };
                        if current.bytes.len() + bytes.len() > current.expected {
                            assembly = None;
                            submit(EditorAction::Import(Err(
                                "project transfer exceeded its size",
                            )));
                            continue;
                        }
                        current.bytes.extend_from_slice(&bytes);
                        continue;
                    }
                    Some("import-end") => {
                        if let Some(current) = assembly.take() {
                            let result = if current.bytes.len() == current.expected {
                                Ok((current.name, current.bytes))
                            } else {
                                Err("project transfer incomplete")
                            };
                            submit(EditorAction::Import(result));
                        }
                        continue;
                    }
                    _ => {}
                }
                let kind = match value["kind"].as_str() {
                    Some("gesture-begin") => Kind::Begin,
                    Some("parameter") => Kind::Value,
                    Some("gesture-end") => Kind::End,
                    _ => continue,
                };
                let Some(id) = value["id"].as_u64().and_then(|id| u32::try_from(id).ok()) else {
                    continue;
                };
                if !(HOST_SLOT_BASE..HOST_SLOT_BASE + HOST_SLOT_COUNT as u32).contains(&id) {
                    continue;
                }
                let normalized = if matches!(kind, Kind::Value) {
                    let Some(value) = value["value"].as_f64() else {
                        continue;
                    };
                    if !value.is_finite() || !(0. ..=1.).contains(&value) {
                        continue;
                    }
                    value
                } else {
                    0.
                };
                let message = Message {
                    kind,
                    id,
                    value: normalized,
                };
                while reader_running.load(Ordering::Acquire) && queue.push(message).is_err() {
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
        if let Ok(mut timer) = self.timer.lock() {
            *timer = Some(TimerRegistration { loop_ref, handler });
            kResultOk
        } else {
            unsafe {
                loop_ref.unregisterTimer(handler.as_ptr());
            }
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

pub(crate) fn create_view(name: *const c_char, shared: Arc<GraphShared>) -> *mut IPlugView {
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
    (binary.is_file() && assets.join("graph-module.html").is_file()).then_some((binary, assets))
}
