//! X11 CLAP child editor using the same graph-module.html and compact widgets
//! as the VST3 Graph view. IPC readers never call host main-thread methods.

use std::ffi::{CStr, c_char};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;

use base64::Engine;
use clap_sys::ext::gui::{CLAP_WINDOW_API_X11, clap_plugin_gui, clap_window};
use clap_sys::ext::params::{CLAP_EXT_PARAMS, clap_host_params};
use clap_sys::host::clap_host;
use clap_sys::plugin::clap_plugin;
use crossbeam_queue::ArrayQueue;
use manifold_native::parameters::{HOST_SLOT_BASE, HOST_SLOT_COUNT};
use manifold_native::project::NativeProject;

use crate::graph::{Instance, get};
use crate::instance::PLUGIN_PATH;

const WIDTH: u32 = 800;
const HEIGHT: u32 = 600;
const MAX_STATE: usize = 45 * 1024 * 1024;

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
    Import(String, Vec<u8>),
    Assign(u32, u32),
    Error(&'static str),
}
struct Assembly {
    name: String,
    expected: usize,
    bytes: Vec<u8>,
}
struct Session {
    child: Child,
    reader: Option<JoinHandle<()>>,
}
impl Session {
    fn send(&mut self, value: &str) -> bool {
        self.child
            .stdin
            .as_mut()
            .is_some_and(|stdin| writeln!(stdin, "{value}").is_ok() && stdin.flush().is_ok())
    }
    fn stop(mut self) {
        let _ = self.send("{\"kind\":\"quit\"}");
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}

pub(super) struct GuiState {
    pub created: AtomicBool,
    ready: AtomicBool,
    refresh: AtomicBool,
    pub flush_retry: AtomicBool,
    pub events: ArrayQueue<GuiMessage>,
    actions: Mutex<Vec<Action>>,
    session: Mutex<Option<Session>>,
}
impl GuiState {
    pub fn new() -> Self {
        Self {
            created: AtomicBool::new(false),
            ready: AtomicBool::new(false),
            refresh: AtomicBool::new(false),
            flush_retry: AtomicBool::new(false),
            events: ArrayQueue::new(256),
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
        if let Some(document) = instance.presentation() {
            let command = serde_json::json!({"kind":"state","document":document}).to_string();
            let _ = self.command(&command);
        }
    }
    pub fn main_thread(&self, instance: &Instance) {
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
                Action::Error(reason) => self.status(reason),
            }
        }
        if self.refresh.swap(false, Ordering::AcqRel) {
            self.snapshot(instance);
        }
    }
    pub fn stop(&self) {
        self.created.store(false, Ordering::Release);
        self.ready.store(false, Ordering::Release);
        if let Ok(mut session) = self.session.lock() {
            if let Some(session) = session.take() {
                session.stop();
            }
        }
        while self.events.pop().is_some() {}
        if let Ok(mut actions) = self.actions.lock() {
            actions.clear();
        }
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
fn bundle() -> Option<(PathBuf, PathBuf)> {
    let module = PLUGIN_PATH.get()?.canonicalize().ok()?;
    let directory = module.parent()?;
    let binary = directory.join("ManifoldFX-editor");
    let assets = directory.join("assets");
    (binary.is_file() && assets.join("graph-module.html").is_file()).then_some((binary, assets))
}

fn reassigned(instance: &Instance, source: u32, destination: u32) -> Option<Vec<u8>> {
    let source = source.checked_sub(HOST_SLOT_BASE)?;
    if source as usize >= HOST_SLOT_COUNT || destination as usize >= HOST_SLOT_COUNT {
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
    document["hostBindings"] = serde_json::Value::Array(
        bindings
            .iter()
            .map(|binding| {
                serde_json::json!({"slot":binding.slot,"nodeId":binding.graph_parameter >> 8,
            "id":binding.graph_parameter & 255})
            })
            .collect(),
    );
    serde_json::to_vec(&document).ok()
}

fn receive(instance: &Instance, reader: impl BufRead) {
    let mut assembly: Option<Assembly> = None;
    for line in reader.lines() {
        let Ok(line) = line else { break };
        if line.len() > 4096 {
            continue;
        }
        let Ok(message) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if message["version"] != 1 {
            continue;
        }
        match message["kind"].as_str() {
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
                    if size > 0 && size <= MAX_STATE && name.len() <= 128 {
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
                        Action::Error("Project unchanged: import exceeds limits."),
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
                    if (HOST_SLOT_BASE as u64..(HOST_SLOT_BASE + HOST_SLOT_COUNT as u32) as u64)
                        .contains(&id)
                        && slot < HOST_SLOT_COUNT as u64
                    {
                        instance
                            .gui
                            .submit(instance.host, Action::Assign(id as u32, slot as u32));
                    }
                }
            }
            Some("capture-start") => {
                let node = message["nodeId"]
                    .as_u64()
                    .and_then(|id| u32::try_from(id).ok());
                let seconds = message["seconds"].as_f64();
                if let (Some(node), Some(seconds)) = (node, seconds) {
                    if node > 0 && seconds.is_finite() && (0.05..=30.0).contains(&seconds) {
                        if instance.request_capture_seconds(node, seconds) {
                            instance.gui.status("Freezing the selected source…");
                        } else {
                            instance.gui.capture_result(
                                false,
                                "Capture could not start for this source and window.",
                            );
                        }
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
            Some("gesture-begin" | "parameter" | "gesture-end") => {
                let kind = match message["kind"].as_str().unwrap() {
                    "gesture-begin" => GuiMessageKind::Begin,
                    "parameter" => GuiMessageKind::Value,
                    _ => GuiMessageKind::End,
                };
                let Some(id) = message["id"].as_u64().and_then(|id| u32::try_from(id).ok()) else {
                    continue;
                };
                if !(HOST_SLOT_BASE..HOST_SLOT_BASE + HOST_SLOT_COUNT as u32).contains(&id) {
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
    !floating && !api.is_null() && unsafe { CStr::from_ptr(api) } == CLAP_WINDOW_API_X11
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
        *api = CLAP_WINDOW_API_X11.as_ptr();
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
    let Ok(mut child) = Command::new(binary)
        .arg(xid.to_string())
        .arg(assets)
        .arg("graph")
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
    true
}
unsafe extern "C" fn show(plugin: *const clap_plugin) -> bool {
    unsafe { get(plugin) }.is_some_and(|instance| instance.gui.command("{\"kind\":\"show\"}"))
}
unsafe extern "C" fn hide(plugin: *const clap_plugin) -> bool {
    unsafe { get(plugin) }.is_some_and(|instance| instance.gui.command("{\"kind\":\"hide\"}"))
}
