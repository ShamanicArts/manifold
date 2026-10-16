//! X11 CLAP child editor using the same graph-module.html and compact widgets
//! as the VST3 Graph view. IPC readers never call host main-thread methods.

use std::ffi::{CStr, c_char};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
#[cfg(target_os="linux")]
use std::os::unix::process::CommandExt;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;

use base64::Engine;
use clap_sys::ext::gui::{ clap_plugin_gui, clap_window};
use clap_sys::ext::params::{CLAP_EXT_PARAMS, clap_host_params};
use clap_sys::host::clap_host;
use clap_sys::plugin::clap_plugin;
use crossbeam_queue::ArrayQueue;
use manifold_native::parameters::{HOST_SLOT_BASE};
use manifold_native::project::NativeProject;

use crate::graph::{Instance, get};
use crate::instance::PLUGIN_PATH;

#[cfg(target_os="linux")]
use clap_sys::ext::gui::CLAP_WINDOW_API_X11 as WINDOW_API;
#[cfg(target_os="macos")]
use clap_sys::ext::gui::CLAP_WINDOW_API_COCOA as WINDOW_API;
#[cfg(target_os="windows")]
use clap_sys::ext::gui::CLAP_WINDOW_API_WIN32 as WINDOW_API;

const WIDTH: u32 = 800;
const HEIGHT: u32 = 600;

#[derive(Clone, Copy)]
pub(super) enum GuiMessageKind {
    Begin,
    Value,
    End,
}
#[derive(Clone, Copy)]
pub(super) struct GuiMessage {
    pub kind: GuiMessageKind,
    pub id: u32,
    pub value: f32,
}

enum Action {
    Creator(u64, serde_json::Value),
    Import(String, Vec<u8>),
    Assign(u32, u32),
    Route(u32, String, Option<(u32, String)>),
    Error(&'static str),
}
struct Assembly {
    name: String,
    expected: usize,
    bytes: Vec<u8>,
}
#[cfg(target_os="linux")]
struct Session {
    child: Child,
    reader: Option<JoinHandle<()>>,
}
#[cfg(target_os="linux")]
impl Session {
    fn send(&mut self, value: &str) -> bool {
        self.child
            .stdin
            .as_mut()
            .is_some_and(|stdin| writeln!(stdin, "{value}").is_ok() && stdin.flush().is_ok())
    }
    fn stop(mut self) {
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

pub(super) struct GuiState {
    pub created: AtomicBool,
    creator: AtomicBool,
    ready: AtomicBool,
    refresh: AtomicBool,
    pub flush_retry: AtomicBool,
    pub events: ArrayQueue<GuiMessage>,
    route_pending: std::sync::atomic::AtomicU64,
    creator_pending: Mutex<Option<(u64, u64, Vec<String>)>>,
    actions: Mutex<Vec<Action>>,
    session: Mutex<Option<Session>>,
}
impl GuiState {
    pub fn new() -> Self {
        Self {
            created: AtomicBool::new(false),
            creator: AtomicBool::new(false),
            ready: AtomicBool::new(false),
            refresh: AtomicBool::new(false),
            flush_retry: AtomicBool::new(false),
            events: ArrayQueue::new(256),
            route_pending: std::sync::atomic::AtomicU64::new(0),
            creator_pending: Mutex::new(None),
            actions: Mutex::new(Vec::with_capacity(2)),
            session: Mutex::new(None),
        }
    }
    pub fn request_refresh(&self, host: *const clap_host) {
        if !self.created.load(Ordering::Acquire) {
            return;
        }
        if !self.refresh.swap(true, Ordering::AcqRel) {
            request_callback(host);
        }
    }
    pub fn enqueue(&self, host: *const clap_host, message: GuiMessage) -> bool {
        if self.events.push(message).is_err() {
            return false;
        }
        request_flush(host);
        true
    }
    fn submit(&self, host: *const clap_host, action: Action) {
        if let Ok(mut actions) = self.actions.lock() {
            if actions.len() < 2 {
                actions.push(action);
            } else {
                return;
            }
        }
        request_callback(host);
    }
    fn command(&self, value: &str) -> bool {
        self.session
            .lock()
            .ok()
            .and_then(|mut session| session.as_mut().map(|session| session.send(value)))
            .unwrap_or(false)
    }
    fn status(&self, message: &str) {
        let command = serde_json::json!({"kind":"status","message":message}).to_string();
        let _ = self.command(&command);
    }
    fn capture_result(&self, ok: bool, message: &str) {
        let command =
            serde_json::json!({"kind":"capture-result","ok":ok,"message":message}).to_string();
        let _ = self.command(&command);
    }
    fn snapshot(&self, instance: &Instance) {
        if !self.ready.load(Ordering::Acquire) {
            return;
        }
        let document = if self.creator.load(Ordering::Acquire) {
            instance.creator_presentation()
        } else {
            instance.presentation()
        };
        if let Some(document) = document {
            let command = serde_json::json!({"kind":"state","document":document}).to_string();
            let _ = self.command(&command);
        }
    }
    pub fn main_thread(&self, instance: &Instance) {
        #[cfg(any(target_os="macos",target_os="windows"))]
        {
            // WebView2 can pump host messages while evaluating JS. A nested
            // host callback must wait for the next tick instead of blocking
            // the same UI thread on its own session lock.
            let Ok(session) = self.session.try_lock() else { return; };
            let incoming = session.as_ref().map(|session| session.view.poll()).unwrap_or_default();
            drop(session);
            for line in incoming { receive(instance,std::io::Cursor::new(format!("{line}\n"))); }
            self.refresh.store(true,Ordering::Release);
        }
        if self.flush_retry.swap(false, Ordering::AcqRel) {
            request_flush(instance.host);
        }
        let actions = self
            .actions
            .lock()
            .ok()
            .map(|mut actions| std::mem::take(&mut *actions))
            .unwrap_or_default();
        for action in actions {
            match action {
                Action::Creator(id, command) => {
                    let paths = manifold_project_js::publication::creator_parameter_paths(&command);
                    let pending = self
                        .creator_pending
                        .lock()
                        .ok()
                        .is_some_and(|pending| pending.is_some());
                    if pending {
                        self.creator_result(
                            instance,
                            id,
                            Some("Another creator edit is pending"),
                            &[],
                        );
                    } else {
                        match instance.scripted_call("request", vec![command]) {
                            Ok(generation) => {
                                if let Ok(mut pending) = self.creator_pending.lock() {
                                    *pending = Some((id, generation, paths));
                                }
                            }
                            Err(error) => self.creator_result(instance, id, Some(error), &[]),
                        }
                    }
                }
                Action::Import(name, bytes) => {
                    if instance.restore(bytes) {
                        self.status(&format!("Loaded {name} into the CLAP graph."));
                    } else {
                        self.status("Project unchanged: graph could not be prepared.");
                    }
                }
                Action::Assign(source, destination) => {
                    if let Some(bytes) = reassigned(instance, source, destination) {
                        if instance.restore(bytes) {
                            self.status(&format!("Assigned host slot {} to {}. Graph reloaded; voices and tails reset.",
                                source - HOST_SLOT_BASE + 1, destination + 1));
                        } else {
                            self.status("Host slot unchanged: graph could not be prepared.");
                        }
                    } else {
                        self.status("Host slot unchanged: invalid binding.");
                    }
                }
                Action::Route(to, input, from) => {
                    if let Some(generation) = instance.request_live_route(
                        to,
                        &input,
                        from.as_ref().map(|(node, port)| (*node, port.as_str())),
                    ) {
                        self.route_pending.store(generation, Ordering::Release);
                        self.status("Updating graph route…");
                    } else {
                        self.status("Graph route unchanged: invalid or unavailable.");
                    }
                }
                Action::Error(reason) => self.status(reason),
            }
        }
        let creator = self
            .creator_pending
            .lock()
            .ok()
            .and_then(|pending| pending.clone());
        if let Some((id, generation, paths)) = creator {
            match instance.scripted_status(generation) {
                0 => request_callback(instance.host),
                status => {
                    if let Ok(mut pending) = self.creator_pending.lock() {
                        *pending = None;
                    }
                    self.creator_result(
                        instance,
                        id,
                        (status != 1).then_some("Audio host rejected the creator edit"),
                        &paths,
                    );
                }
            }
        }
        let route = self.route_pending.load(Ordering::Acquire);
        if route != 0 {
            if let Some(accepted) = instance.live_route_status(route) {
                self.route_pending.store(0, Ordering::Release);
                self.status(if accepted {
                    "Graph route applied and saved."
                } else {
                    "Graph route unchanged: audio host rejected it."
                });
            }
        }
        if self.refresh.swap(false, Ordering::AcqRel) {
            self.snapshot(instance);
        }
    }
    pub fn stop(&self) {
        self.created.store(false, Ordering::Release);
        self.ready.store(false, Ordering::Release);
        let session = self.session.lock().ok().and_then(|mut session| session.take());
        if let Some(session) = session { session.stop(); }
        while self.events.pop().is_some() {}
        if let Ok(mut actions) = self.actions.lock() {
            actions.clear();
        }
    }

    fn creator_result(&self, instance: &Instance, id: u64, error: Option<&str>, paths: &[String]) {
        let document = instance.creator_presentation();
        if error.is_none() {
            for path in paths {
                if let Some((id, value)) = {
                    document.as_ref().and_then(|view| {
                        manifold_project_js::publication::creator_host_parameter(view, path)
                    })
                } {
                    for kind in [
                        GuiMessageKind::Begin,
                        GuiMessageKind::Value,
                        GuiMessageKind::End,
                    ] {
                        self.enqueue(
                            instance.host,
                            GuiMessage {
                                kind,
                                id,
                                value: value as f32,
                            },
                        );
                    }
                }
            }
        }
        let _ = self.command(
            &serde_json::json!({"kind":"creator-result","id":id,"error":error,
            "document":document})
            .to_string(),
        );
    }
}

fn request_callback(host: *const clap_host) {
    if !host.is_null() {
        if let Some(callback) = unsafe { (*host).request_callback } {
            unsafe { callback(host) };
        }
    }
}
pub(super) fn request_flush(host: *const clap_host) {
    if host.is_null() {
        return;
    }
    if let Some(get) = unsafe { (*host).get_extension } {
        let extension = unsafe { get(host, CLAP_EXT_PARAMS.as_ptr()) };
        if !extension.is_null() {
            let params = unsafe { &*(extension as *const clap_host_params) };
            if let Some(flush) = params.request_flush {
                unsafe { flush(host) }
            }
        }
    }
}
#[cfg(target_os="linux")]
fn bundle() -> Option<(PathBuf, PathBuf)> {
    let module = PLUGIN_PATH.get()?.canonicalize().ok()?;
    let directory = module.parent()?;
    let binary = directory.join("ManifoldFX-editor");
    let assets = directory.join("assets");
    (binary.is_file() && assets.join("graph-module.html").is_file()).then_some((binary, assets))
}

#[cfg(any(target_os="macos",target_os="windows"))]
fn bundle() -> Option<(PathBuf,PathBuf)> {
    let module=PLUGIN_PATH.get()?.canonicalize().ok()?;
    #[cfg(target_os="macos")]
    let assets=if module.is_dir(){module.join("Contents/Resources/assets")}else{module.parent()?.parent()?.join("Resources/assets")};
    #[cfg(target_os="windows")]
    let assets=module.parent()?.join("assets");
    assets.join("filter.html").is_file().then_some((module,assets))
}

fn reassigned(instance: &Instance, source: u32, destination: u32) -> Option<Vec<u8>> {
    let source = source.checked_sub(HOST_SLOT_BASE)?;
    if source > u32::MAX - HOST_SLOT_BASE || destination > u32::MAX - HOST_SLOT_BASE
        || !crate::product::EXPORTED && destination >= manifold_native::parameters::STUDIO_HOST_SLOT_COUNT as u32 {
        return None;
    }
    let bytes = instance.state_bytes()?;
    let project = NativeProject::parse(&bytes).ok()?;
    let mut bindings = project.host_bindings().to_vec();
    let current = bindings.iter().position(|binding| binding.slot == source)?;
    if let Some(displaced) = bindings
        .iter()
        .position(|binding| binding.slot == destination)
    {
        bindings[displaced].slot = source;
    }
    bindings[current].slot = destination;
    let mut document: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    manifold_native::parameters::swap_host_assignments(&mut document, source, destination);
    document["hostBindings"] = serde_json::Value::Array(
        bindings
            .iter()
            .map(|binding| {
                serde_json::json!({"slot":binding.slot,"nodeId":binding.graph_parameter >> 32,
            "id":binding.graph_parameter & u32::MAX as u64})
            })
            .collect(),
    );
    serde_json::to_vec(&document).ok()
}

#[cfg(test)]
mod assignment_tests {
    use super::*;
    mod fixture {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../manifold-native/tests/support/mixer_scale.rs"
        ));
    }

    #[test]
    fn mixer_wide_local_ids_survive_slot_swap_and_move() {
        let instance = Instance::new(std::ptr::null(), &crate::GRAPH_DESCRIPTOR);
        assert!(instance.restore(fixture::wide_mixer()));
        let swapped = reassigned(&instance, HOST_SLOT_BASE, 1).unwrap();
        fixture::assert_mixer_assignments(&swapped, 1, 0);
        assert!(instance.restore(swapped));
        let moved = reassigned(&instance, HOST_SLOT_BASE + 1, 17).unwrap();
        fixture::assert_mixer_assignments(&moved, 17, 0);
        assert!(instance.restore(moved));
    }
}

fn receive(instance: &Instance, reader: impl BufRead) {
    let mut assembly: Option<Assembly> = None;
    for line in reader.lines() {
        let Ok(line) = line else { break };
        let Ok(message) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if message["version"] != 1 {
            continue;
        }
        if line.len() > 4096 && message["kind"] != "creator-request" {
            continue;
        }
        match message["kind"].as_str() {
            Some("creator-request") => {
                if let Some(id) = message["id"].as_u64() {
                    instance.gui.submit(
                        instance.host,
                        Action::Creator(id, message["command"].clone()),
                    );
                }
            }
            Some("editor-ready") => {
                instance.gui.ready.store(true, Ordering::Release);
                instance.gui.request_refresh(instance.host);
                request_callback(instance.host);
            }
            Some("import-start") => {
                assembly = None;
                let size = message["size"]
                    .as_u64()
                    .and_then(|size| usize::try_from(size).ok());
                let name = message["name"].as_str();
                if let (Some(size), Some(name)) = (size, name) {
                    if size > 0 {
                        assembly = Some(Assembly {
                            name: name.to_owned(),
                            expected: size,
                            bytes: Vec::with_capacity(size),
                        });
                    }
                }
                if assembly.is_none() {
                    instance.gui.submit(
                        instance.host,
                        Action::Error("Project unchanged: invalid import description."),
                    );
                }
            }
            Some("import-chunk") => {
                let Some(current) = assembly.as_mut() else {
                    continue;
                };
                let Some(chunk) = message["data"].as_str().filter(|chunk| chunk.len() <= 3000)
                else {
                    assembly = None;
                    continue;
                };
                let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(chunk) else {
                    assembly = None;
                    continue;
                };
                if current.bytes.len() + bytes.len() > current.expected {
                    assembly = None;
                    continue;
                }
                current.bytes.extend_from_slice(&bytes);
            }
            Some("import-end") => {
                if let Some(current) = assembly.take() {
                    if current.bytes.len() == current.expected {
                        instance
                            .gui
                            .submit(instance.host, Action::Import(current.name, current.bytes));
                    } else {
                        instance.gui.submit(
                            instance.host,
                            Action::Error("Project unchanged: incomplete import."),
                        );
                    }
                }
            }
            Some("slot-assign") => {
                if let (Some(id), Some(slot)) = (message["id"].as_u64(), message["slot"].as_u64()) {
                    if (HOST_SLOT_BASE as u64..=u32::MAX as u64).contains(&id)
                        && slot <= (u32::MAX - HOST_SLOT_BASE) as u64
                    {
                        instance
                            .gui
                            .submit(instance.host, Action::Assign(id as u32, slot as u32));
                    }
                }
            }
            Some("route") => {
                let to = message["to"]
                    .as_u64()
                    .and_then(|value| u32::try_from(value).ok());
                let input = message["input"].as_str().filter(|value| value.len() <= 32);
                let from = if message["from"].is_null() {
                    Some(None)
                } else {
                    message["from"]
                        .as_u64()
                        .and_then(|value| u32::try_from(value).ok())
                        .zip(message["output"].as_str().filter(|value| value.len() <= 32))
                        .map(|(node, port)| Some((node, port.to_owned())))
                };
                if let (Some(to), Some(input), Some(from)) = (to, input, from) {
                    instance
                        .gui
                        .submit(instance.host, Action::Route(to, input.to_owned(), from));
                }
            }
            Some("capture-start") => {
                let node = message["nodeId"]
                    .as_u64()
                    .and_then(|id| u32::try_from(id).ok());
                let bars = message["bars"].as_f64();
                let seconds = message["seconds"].as_f64();
                if let Some(node) = node.filter(|node| *node > 0) {
                    let accepted = if let Some(bars) =
                        bars.filter(|bars| bars.is_finite() && *bars > 0.0)
                    {
                        instance.request_capture_bars(node, bars)
                    } else if let Some(seconds) = seconds
                        .filter(|seconds| seconds.is_finite() && *seconds > 0.0)
                    {
                        instance.request_capture_seconds(node, seconds)
                    } else {
                        false
                    };
                    if accepted {
                        instance.gui.status("Freezing the selected source…");
                    } else {
                        instance.gui.capture_result(
                                false,
                                "Capture could not start. Play the DAW transport for bar timing, or choose a shorter window.",
                            );
                    }
                }
            }
            Some("capture-finish") => {
                if let Some(instrument) = message["instrumentId"]
                    .as_u64()
                    .and_then(|id| u32::try_from(id).ok())
                    .filter(|id| *id > 0)
                {
                    if let Some(result) = instance.finish_capture(instrument, "DAW capture") {
                        if result {
                            instance.gui.snapshot(instance);
                            instance.gui.capture_result(true, "Captured source published. New notes use this take; compatible capture history was retained.");
                        } else {
                            instance.gui.capture_result(
                                false,
                                "Capture failed; the project was not changed.",
                            );
                        }
                    }
                }
            }
            Some("capture-free-arm" | "capture-free-stop") => {
                if let Some(node) = message["nodeId"]
                    .as_u64()
                    .and_then(|id| u32::try_from(id).ok())
                    .filter(|id| *id > 0)
                {
                    let accepted = if message["kind"] == "capture-free-arm" {
                        instance.request_capture_free_arm(node)
                    } else {
                        instance.request_capture_free_stop(node)
                    };
                    if accepted {
                        instance
                            .gui
                            .status(if message["kind"] == "capture-free-arm" {
                                "Free capture armed. Press Stop free capture to publish."
                            } else {
                                "Freezing free capture…"
                            });
                    } else {
                        instance.gui.capture_result(false, "Free capture request was rejected. Keep the DAW processing audio and try again.");
                    }
                }
            }
            Some("gesture-begin" | "parameter" | "gesture-end") => {
                let kind = match message["kind"].as_str().unwrap() {
                    "gesture-begin" => GuiMessageKind::Begin,
                    "parameter" => GuiMessageKind::Value,
                    _ => GuiMessageKind::End,
                };
                let Some(id) = message["id"].as_u64().and_then(|id| u32::try_from(id).ok()) else {
                    continue;
                };
                if id < HOST_SLOT_BASE {
                    continue;
                }
                let value = if matches!(kind, GuiMessageKind::Value) {
                    let Some(value) = message["value"].as_f64() else {
                        continue;
                    };
                    if !value.is_finite() || !(0. ..=1.).contains(&value) {
                        continue;
                    }
                    value as f32
                } else {
                    0.
                };
                let msg = GuiMessage { kind, id, value };
                while instance.gui.created.load(Ordering::Acquire)
                    && !instance.gui.enqueue(instance.host, msg)
                {
                    std::thread::sleep(std::time::Duration::from_millis(1));
                }
            }
            _ => {}
        }
    }
}

pub(crate) static GUI: clap_plugin_gui = clap_plugin_gui {
    is_api_supported: Some(supported),
    get_preferred_api: Some(preferred),
    create: Some(create),
    destroy: Some(destroy),
    set_scale: Some(scale),
    get_size: Some(size),
    can_resize: Some(can_resize),
    get_resize_hints: None,
    adjust_size: Some(adjust),
    set_size: Some(set_size),
    set_parent: Some(parent),
    set_transient: None,
    suggest_title: None,
    show: Some(show),
    hide: Some(hide),
};
unsafe extern "C" fn supported(
    _plugin: *const clap_plugin,
    api: *const c_char,
    floating: bool,
) -> bool {
    !floating && !api.is_null() && unsafe { CStr::from_ptr(api) } == WINDOW_API
}
unsafe extern "C" fn preferred(
    _plugin: *const clap_plugin,
    api: *mut *const c_char,
    floating: *mut bool,
) -> bool {
    if api.is_null() || floating.is_null() {
        return false;
    }
    unsafe {
        *api = WINDOW_API.as_ptr();
        *floating = false;
    }
    true
}
unsafe extern "C" fn create(
    plugin: *const clap_plugin,
    api: *const c_char,
    floating: bool,
) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    if !unsafe { supported(plugin, api, floating) } || bundle().is_none() {
        return false;
    }
    instance
        .gui
        .created
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
}
unsafe extern "C" fn destroy(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { get(plugin) } {
        instance.gui.stop()
    }
}
unsafe extern "C" fn scale(_plugin: *const clap_plugin, _value: f64) -> bool {
    false
}
unsafe extern "C" fn size(plugin: *const clap_plugin, width: *mut u32, height: *mut u32) -> bool {
    if unsafe { get(plugin) }.is_none() || width.is_null() || height.is_null() {
        return false;
    }
    unsafe {
        *width = WIDTH;
        *height = HEIGHT;
    }
    true
}
unsafe extern "C" fn can_resize(_plugin: *const clap_plugin) -> bool {
    false
}
unsafe extern "C" fn adjust(plugin: *const clap_plugin, width: *mut u32, height: *mut u32) -> bool {
    unsafe { size(plugin, width, height) }
}
unsafe extern "C" fn set_size(_plugin: *const clap_plugin, width: u32, height: u32) -> bool {
    width == WIDTH && height == HEIGHT
}
unsafe extern "C" fn parent(plugin: *const clap_plugin, window: *const clap_window) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    if !instance.gui.created.load(Ordering::Acquire) || window.is_null() {
        return false;
    }
    let window = unsafe { &*window };
    if !unsafe { supported(plugin, window.api, false) } {
        return false;
    }
    #[cfg(any(target_os="macos",target_os="windows"))]
    {
        if !instance.has_creator() {return false;}
        let Some((_,assets))=bundle() else{return false;};
        #[cfg(target_os="macos")]
        let parent=unsafe {window.specific.cocoa} as usize;
        #[cfg(target_os="windows")]
        let parent=unsafe {window.specific.win32} as usize;
        if parent==0 || instance.gui.session.lock().map_or(true, |session| session.is_some()){return false;}
        let host=instance.host as usize;
        let view=unsafe {manifold_editor::NativeView::new(parent,assets,WIDTH,HEIGHT,move || request_callback(host as *const clap_host))};
        let view=match view {Ok(view)=>view,Err(error)=>{eprintln!("Manifold native editor: {error}");return false;}};
        let Ok(mut session)=instance.gui.session.lock() else{return false;};
        instance.gui.creator.store(true,Ordering::Release);
        *session=Some(Session{view});
    }
    #[cfg(target_os="linux")]
    {
    let xid = unsafe { window.specific.x11 };
    if xid == 0 {
        return false;
    }
    let Some((binary, assets)) = bundle() else {
        return false;
    };
    let Ok(mut session) = instance.gui.session.lock() else {
        return false;
    };
    if session.is_some() {
        return false;
    }
    let creator = instance.has_creator();
    instance.gui.creator.store(creator, Ordering::Release);
    let Ok(mut child) = Command::new(binary)
            .process_group(0)
        .arg(xid.to_string())
        .arg(assets)
        .arg(if creator { "creator" } else { "graph" })
        .env("GDK_BACKEND", "x11")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
    else {
        return false;
    };
    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill();
        return false;
    };
    let address = instance as *const Instance as usize;
    let reader = std::thread::spawn(move || {
        let instance = unsafe { &*(address as *const Instance) };
        receive(instance, BufReader::new(stdout));
    });
    *session = Some(Session {
        child,
        reader: Some(reader),
    });
    }
    true
}
unsafe extern "C" fn show(plugin: *const clap_plugin) -> bool {
    unsafe { get(plugin) }.is_some_and(|instance| instance.gui.command("{\"kind\":\"show\"}"))
}
unsafe extern "C" fn hide(plugin: *const clap_plugin) -> bool {
    unsafe { get(plugin) }.is_some_and(|instance| instance.gui.command("{\"kind\":\"hide\"}"))
}
