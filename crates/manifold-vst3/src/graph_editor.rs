//! Linux graph view: the original browser widget renderers in an isolated
//! companion, with host edits delivered on VST3's UI run-loop timer.

use std::ffi::{CStr, c_char, c_void};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
#[cfg(target_os="linux")]
use std::os::unix::process::CommandExt;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use base64::Engine;
use crossbeam_queue::ArrayQueue;
use vst3::{
    Class, ComPtr, ComRef, ComWrapper, Steinberg::Vst::*, Steinberg::*,
};

#[cfg(target_os="linux")]
use vst3::Steinberg::Linux::*;
use crate::graph_controller::GraphShared;
use manifold_native::parameters::{HOST_SLOT_BASE};

#[cfg(target_os="linux")]
const PLATFORM_TYPE: FIDString = kPlatformTypeX11EmbedWindowID;
#[cfg(target_os="macos")]
const PLATFORM_TYPE: FIDString = kPlatformTypeNSView;
#[cfg(target_os="windows")]
const PLATFORM_TYPE: FIDString = kPlatformTypeHWND;

const WIDTH: i32 = 800;
const HEIGHT: i32 = 600;
const MAX_MESSAGES: usize = 256;

struct ImportAssembly {
    name: String,
    expected: usize,
    bytes: Vec<u8>,
}

type ImportResult = Result<(String, Vec<u8>), &'static str>;

enum EditorAction {
    Creator(u64, serde_json::Value),
    Import(ImportResult),
    Assign {
        id: u32,
        slot: u32,
    },
    Route {
        to: u32,
        input: String,
        from: Option<(u32, String)>,
    },
    CaptureStart {
        node: u32,
        seconds: f64,
    },
    CaptureBars {
        node: u32,
        bars: f64,
    },
    CaptureFreeArm {
        node: u32,
    },
    CaptureFreeStop {
        node: u32,
    },
    CaptureFinish {
        instrument: u32,
    },
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

#[cfg(target_os="linux")]
struct Session {
    child: Child,
    reader: Option<JoinHandle<()>>,
    running: Arc<AtomicBool>,
}

#[cfg(target_os="linux")]
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
        // WebKit subprocesses can inherit stdout. Retire the owned process
        // group so the reader reaches EOF before the UI thread joins it.
        unsafe { libc::kill(-(self.child.id() as i32), libc::SIGKILL); }
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}
#[cfg(any(target_os="macos",target_os="windows"))]
struct Session { view: manifold_editor::NativeView }
#[cfg(any(target_os="macos",target_os="windows"))]
impl Session {
    fn send(&mut self,value:&str)->bool {self.view.send(value)}
    fn stop(self) {self.view.stop();}
}

struct State {
    shared: Arc<GraphShared>,
    messages: Arc<ArrayQueue<Message>>,
    imports: Arc<ArrayQueue<EditorAction>>,
    session: Mutex<Option<Session>>,
    ready: AtomicBool,
    last_sent: AtomicU64,
    pending_route: Mutex<Option<u64>>,
    pending_creator: Mutex<Option<(u64, u64, Vec<String>)>>,
    creator: AtomicBool,
    creator_tick: AtomicU64,
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
            pending_route: Mutex::new(None),
            pending_creator: Mutex::new(None),
            creator: AtomicBool::new(false),
            creator_tick: AtomicU64::new(0),
        })
    }

    fn send_snapshot(&self) -> bool {
        let document = if self.creator.load(Ordering::Acquire) {
            self.shared.creator_presentation()
        } else {
            self.shared.snapshot()
        };
        let Some(document) = document else {
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
        #[cfg(any(target_os="macos",target_os="windows"))]
        {
            let Ok(session) = self.session.try_lock() else { return; };
            let incoming = session.as_ref().map(|session| session.view.poll()).unwrap_or_default();
            drop(session);
            for line in incoming {
                let Ok(value)=serde_json::from_str::<serde_json::Value>(&line) else{continue;};
                if value["version"]!=1 {continue;}
                match value["kind"].as_str() {
                    Some("editor-ready")=>self.ready.store(true,Ordering::Release),
                    Some("creator-request")=>if let Some(id)=value["id"].as_u64() {let _=self.imports.push(EditorAction::Creator(id,value["command"].clone()));},
                    _=>{},
                }
            }
        }
        let action_status = self.imports.pop().and_then(|action| match action {
            EditorAction::Creator(id, command) => {
                let paths = manifold_project_js::publication::creator_parameter_paths(&command);
                let busy = self.pending_creator.lock().ok().is_some_and(|pending| pending.is_some());
                if busy { self.creator_result(id, Some("Another creator edit is pending"), &[]); }
                else { match self.shared.creator_request(command) {
                    Ok(generation) => { if let Ok(mut pending) = self.pending_creator.lock() { *pending = Some((id, generation, paths)); } }
                    Err(error) => self.creator_result(id, Some(error), &[]),
                } }
                None
            },
            EditorAction::Import(Ok((name, bytes))) => Some((match self.shared.import_project(&bytes) {
                Ok(()) => format!("Loaded {name} into the DAW graph."),
                Err(reason) => format!("Project unchanged: {reason}."),
            }, None)),
            EditorAction::Import(Err(reason)) => Some((format!("Project unchanged: {reason}."), None)),
            EditorAction::Assign { id, slot } => Some((match self.shared.reassign_slot(id, slot) {
                Ok(()) => format!("Assigned host slot {} to slot {}. Graph reloaded; active voices and effect tails reset. Existing automation may reach a different control.", id - HOST_SLOT_BASE + 1, slot + 1),
                Err(reason) => format!("Host slot unchanged: {reason}."),
            }, None)),
            EditorAction::Route { to, input, from } => Some((match self.shared.request_route(to, &input, from.as_ref().map(|(node, port)| (*node, port.as_str()))) {
                Ok(generation) => {
                    if let Ok(mut pending) = self.pending_route.lock() { *pending = Some(generation); }
                    "Route queued for the next audio block.".to_owned()
                }
                Err(reason) => format!("Route unchanged: {reason}."),
            }, None)),
            EditorAction::CaptureStart { node, seconds } => Some(match self.shared.capture_start(node, seconds) {
                Ok(()) => (format!("Freezing {seconds} seconds from capture node {node}…"), None),
                Err(reason) => (format!("Capture failed: {reason}."), Some(false)),
            }),
            EditorAction::CaptureBars { node, bars } => Some(match self.shared.capture_start_bars(node, bars) {
                Ok(()) => (format!("Freezing {bars} bars from capture node {node}…"), None),
                Err(reason) => (format!("Capture failed: {reason}. Play the DAW transport to supply tempo and meter."), Some(false)),
            }),
            EditorAction::CaptureFreeArm { node } => Some(match self.shared.capture_free_arm(node) {
                Ok(()) => (format!("Free capture armed from node {node}. Press Stop free capture to publish."), None),
                Err(reason) => (format!("Capture failed: {reason}."), Some(false)),
            }),
            EditorAction::CaptureFreeStop { node } => Some(match self.shared.capture_free_stop(node) {
                Ok(()) => (format!("Freezing free capture from node {node}…"), None),
                Err(reason) => (format!("Capture failed: {reason}."), Some(false)),
            }),
            EditorAction::CaptureFinish { instrument } => match self.shared.capture_finish(instrument) {
                Ok(None) => None,
                Ok(Some(true)) => Some(("Captured source published. New notes use this take; compatible capture history was retained.".to_owned(), Some(true))),
                Ok(Some(false)) => Some(("Capture failed; the project was not changed.".to_owned(), Some(false))),
                Err(reason) => Some((format!("Capture failed: {reason}."), Some(false))),
            },
        });
        let pending = self
            .pending_creator
            .lock()
            .ok()
            .and_then(|pending| pending.clone());
        if let Some((id, generation, paths)) = pending {
            match self.shared.creator_status(generation) {
                Ok(0) => {}
                status => {
                    if let Ok(mut pending) = self.pending_creator.lock() {
                        *pending = None;
                    }
                    self.creator_result(
                        id,
                        if matches!(status, Ok(1)) {
                            None
                        } else {
                            Some("Native host rejected the creator edit")
                        },
                        &paths,
                    );
                }
            }
        }
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
        let route_status = self.pending_route.lock().ok().and_then(|mut pending| {
            let generation = (*pending)?;
            match self.shared.finish_route(generation) {
                Ok(None) => None,
                Ok(Some(true)) => {
                    *pending = None;
                    Some("Graph route applied and saved.".to_owned())
                }
                Ok(Some(false)) => {
                    *pending = None;
                    Some("Graph route rejected; project unchanged.".to_owned())
                }
                Err(reason) => {
                    *pending = None;
                    Some(format!("Route status failed: {reason}."))
                }
            }
        });
        let current = self.shared.version();
        if (self.last_sent.load(Ordering::Acquire) != current
            || (self.creator.load(Ordering::Acquire)
                && self.creator_tick.fetch_add(1, Ordering::Relaxed) % 6 == 0))
            && self.send_snapshot()
        {
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
        if let Some(message) = route_status {
            if let Ok(mut session) = self.session.lock() {
                if let Some(session) = session.as_mut() {
                    session
                        .send(&serde_json::json!({"kind":"status","message":message}).to_string());
                }
            }
        }
    }

    fn creator_result(&self, id: u64, error: Option<&str>, paths: &[String]) {
        let document = self.shared.creator_presentation();
        if error.is_none() {
            for path in paths {
                if let Some((id, value)) = {
                    document.as_ref().and_then(|view| {
                        manifold_project_js::publication::creator_host_parameter(view, path)
                    })
                } {
                    if let Some(handler) = self
                        .shared
                        .handler
                        .lock()
                        .ok()
                        .and_then(|handler| handler.clone())
                    {
                        unsafe {
                            handler.beginEdit(id);
                            handler.performEdit(id, value);
                            handler.endEdit(id);
                        }
                        self.shared.set_value(id, value);
                    }
                }
            }
        }
        let command =
            serde_json::json!({"kind":"creator-result","id":id,"error":error,"document":document})
                .to_string();
        if let Ok(mut session) = self.session.lock() {
            if let Some(session) = session.as_mut() {
                session.send(&command);
            }
        }
    }

    fn stop(&self) {
        self.ready.store(false, Ordering::Release);
        self.last_sent.store(u64::MAX, Ordering::Release);
        let session = self.session.lock().ok().and_then(|mut session| session.take());
        if let Some(session) = session { session.stop(); }
        while self.messages.pop().is_some() {}
        while self.imports.pop().is_some() {}
    }
}

#[cfg(target_os="linux")]
struct Timer(Arc<State>);
#[cfg(target_os="linux")]
impl Class for Timer {
    type Interfaces = (ITimerHandler,);
}
#[cfg(target_os="linux")]
impl ITimerHandlerTrait for Timer {
    unsafe fn onTimer(&self) {
        self.0.tick();
    }
}

#[cfg(target_os="linux")]
struct TimerRegistration {
    loop_ref: ComPtr<IRunLoop>,
    handler: ComPtr<ITimerHandler>,
}
#[cfg(target_os="linux")]
impl TimerRegistration {
    fn stop(self) {
        unsafe {
            self.loop_ref.unregisterTimer(self.handler.as_ptr());
        }
    }
}
#[cfg(any(target_os="macos",target_os="windows"))]
struct TimerRegistration;
#[cfg(any(target_os="macos",target_os="windows"))]
impl TimerRegistration { fn stop(self) {} }

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
            == unsafe { CStr::from_ptr(PLATFORM_TYPE) }
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
        #[cfg(any(target_os="macos",target_os="windows"))]
        {
            if !self.state.shared.has_creator() {return kResultFalse;}
            let Some((_,assets))=bundle() else{return kResultFalse;};
            if self.state.session.lock().map_or(true, |session| session.is_some()){return kResultFalse;}
            let state=Arc::downgrade(&self.state);
            let view=unsafe {manifold_editor::NativeView::new(parent as usize,assets,WIDTH as u32,HEIGHT as u32,move || {if let Some(state)=state.upgrade(){state.tick();}})};
            let view=match view {Ok(view)=>view,Err(error)=>{eprintln!("Manifold native editor: {error}");return kResultFalse;}};
            let Ok(mut session)=self.state.session.lock() else{return kResultFalse;};
            self.state.creator.store(true,Ordering::Release);
            *session=Some(Session{view});
        }
        #[cfg(target_os="linux")]
        {
        let Some((binary, assets)) = bundle() else {
            return kResultFalse;
        };
        let Ok(mut session) = self.state.session.lock() else {
            return kResultFalse;
        };
        if session.is_some() {
            return kResultFalse;
        }
        let creator = self.state.shared.has_creator();
        self.state.creator.store(creator, Ordering::Release);
        let Ok(mut child) = Command::new(binary)
            .process_group(0)
            .arg((parent as usize).to_string())
            .arg(assets)
            .arg(if creator { "creator" } else { "graph" })
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
                let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else {
                    continue;
                };
                if value["version"] != 1 {
                    continue;
                }
                if line.len() > 4096 && value["kind"] != "creator-request" {
                    continue;
                }
                if value["kind"] == "creator-request" {
                    if let Some(id) = value["id"].as_u64() {
                        submit(EditorAction::Creator(id, value["command"].clone()));
                    }
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
                        let bars = value["bars"].as_f64();
                        let seconds = value["seconds"].as_f64();
                        if let Some(node) = node.filter(|node| *node > 0) {
                            if let Some(bars) = bars
                                .filter(|bars| bars.is_finite() && *bars > 0.0)
                            {
                                submit(EditorAction::CaptureBars { node, bars });
                            } else if let Some(seconds) = seconds.filter(|seconds| {
                                seconds.is_finite() && *seconds > 0.0
                            }) {
                                submit(EditorAction::CaptureStart { node, seconds });
                            }
                        }
                        continue;
                    }
                    Some("capture-free-arm" | "capture-free-stop") => {
                        if let Some(node) = value["nodeId"]
                            .as_u64()
                            .and_then(|id| u32::try_from(id).ok())
                            .filter(|id| *id > 0)
                        {
                            submit(if value["kind"] == "capture-free-arm" {
                                EditorAction::CaptureFreeArm { node }
                            } else {
                                EditorAction::CaptureFreeStop { node }
                            });
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
                            if id >= HOST_SLOT_BASE && slot <= u32::MAX - HOST_SLOT_BASE
                            {
                                submit(EditorAction::Assign { id, slot });
                            }
                        }
                        continue;
                    }
                    Some("route") => {
                        let to = value["to"].as_u64().and_then(|n| u32::try_from(n).ok());
                        let input = value["input"].as_str().filter(|s| s.len() <= 32);
                        let from = if value["from"].is_null() {
                            Some(None)
                        } else {
                            value["from"]
                                .as_u64()
                                .and_then(|n| u32::try_from(n).ok())
                                .zip(value["output"].as_str().filter(|s| s.len() <= 32))
                                .map(|(node, port)| Some((node, port.to_owned())))
                        };
                        if let (Some(to), Some(input), Some(from)) = (to, input, from) {
                            submit(EditorAction::Route {
                                to,
                                input: input.to_owned(),
                                from,
                            });
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
                        if size == 0 {
                            submit(EditorAction::Import(Err("invalid project import description")));
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
                if id < HOST_SLOT_BASE {
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
        }
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
        #[cfg(any(target_os="macos",target_os="windows"))]
        { let _=frame; return kResultOk; }
        #[cfg(target_os="linux")]
        {
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
        }        }
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

#[cfg(target_os="linux")]
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

#[cfg(any(target_os="macos",target_os="windows"))]
fn bundle() -> Option<(PathBuf,PathBuf)> {
    #[cfg(target_os="macos")]
    let module={
        let mut info=unsafe{std::mem::zeroed::<libc::Dl_info>()};
        if unsafe{libc::dladdr(bundle as *const c_void,&mut info)}==0 || info.dli_fname.is_null(){return None;}
        PathBuf::from(unsafe{CStr::from_ptr(info.dli_fname)}.to_str().ok()?)
    };
    #[cfg(target_os="windows")]
    let module={
        use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleExW,GetModuleFileNameW,GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT};
        let mut handle=std::ptr::null_mut();
        if unsafe{GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS|GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,bundle as *const u16,&mut handle)}==0{return None;}
        let mut text=[0u16;32768];let len=unsafe{GetModuleFileNameW(handle,text.as_mut_ptr(),text.len() as u32)};
        if len==0 || len as usize>=text.len(){return None;}
        PathBuf::from(String::from_utf16(&text[..len as usize]).ok()?)
    };
    let assets=module.parent()?.parent()?.join("Resources/assets");
    assets.join("filter.html").is_file().then_some((module,assets))
}
