//! Main CLAP X11 child editor. The child loads the original Main web surface;
//! its IPC reader only queues bounded controls and requests host callbacks.

use std::ffi::{CStr, c_char};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::JoinHandle;
use std::time::Duration;

use base64::Engine;
use clap_sys::ext::gui::{CLAP_WINDOW_API_X11, clap_plugin_gui, clap_window};
use clap_sys::host::clap_host;
use clap_sys::plugin::clap_plugin;
use manifold_core::events::EventKind;
use manifold_native::main_host_parameters::MainParameter;
use manifold_native::main_instrument::{MainHostEventKind, valid_main_command};
use manifold_native::main_sample_handoff::SampleUpdate;

use crate::instance::PLUGIN_PATH;
use crate::main_product::{Instance, MAX_STATE, get};

const WIDTH: u32 = 1280;
const HEIGHT: u32 = 780;

struct ImportAssembly {
    expected: usize,
    bytes: Vec<u8>,
}

struct Session {
    child: Child,
    reader: Option<JoinHandle<()>>,
    monitor: Option<JoinHandle<()>>,
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
        if let Some(monitor) = self.monitor.take() {
            let _ = monitor.join();
        }
    }
}

pub(crate) struct GuiState {
    created: AtomicBool,
    ready: AtomicBool,
    loaded: AtomicBool,
    refresh: AtomicBool,
    session: Mutex<Option<Session>>,
}

impl GuiState {
    pub(crate) fn new() -> Self {
        Self {
            created: AtomicBool::new(false),
            ready: AtomicBool::new(false),
            loaded: AtomicBool::new(false),
            refresh: AtomicBool::new(false),
            session: Mutex::new(None),
        }
    }

    pub(crate) fn request_refresh(&self, host: *const clap_host) {
        if !self.created.load(Ordering::Acquire) {
            return;
        }
        if !self.refresh.swap(true, Ordering::AcqRel) {
            request_callback(host);
        }
    }

    fn command(&self, message: &str) -> bool {
        self.session
            .lock()
            .ok()
            .and_then(|mut session| session.as_mut().map(|session| session.send(message)))
            .unwrap_or(false)
    }

    pub(crate) fn main_thread(&self, instance: &Instance) {
        if !self.refresh.swap(false, Ordering::AcqRel) || !self.ready.load(Ordering::Acquire) {
            return;
        }
        if let Some(document) = instance.editor_document() {
            self.loaded.store(false, Ordering::Release);
            let message = serde_json::json!({ "kind": "state", "document": document });
            let _ = self.command(&message.to_string());
        }
        if self.loaded.load(Ordering::Acquire) {
            if let Some(data) = instance.editor_status() {
                let message = serde_json::json!({ "kind": "live-status", "data": data });
                let _ = self.command(&message.to_string());
            }
        }
    }

    pub(crate) fn stop(&self) {
        self.created.store(false, Ordering::Release);
        self.ready.store(false, Ordering::Release);
        self.loaded.store(false, Ordering::Release);
        self.refresh.store(false, Ordering::Release);
        let session = self.session.lock().ok().and_then(|mut slot| slot.take());
        if let Some(session) = session {
            session.stop();
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

fn bundle() -> Option<(PathBuf, PathBuf)> {
    let module = PLUGIN_PATH.get()?.canonicalize().ok()?;
    let directory = module.parent()?;
    let binary = directory.join("ManifoldFX-editor");
    let assets = directory.join("assets");
    (binary.is_file() && assets.join("main-looper.html").is_file()).then_some((binary, assets))
}

fn sample_message(update: SampleUpdate) -> String {
    let data = match update {
        SampleUpdate::Started { frames } => {
            serde_json::json!({ "phase": "started", "frames": frames })
        }
        SampleUpdate::FreeStarted => serde_json::json!({ "phase": "free-started" }),
        SampleUpdate::FreeCancelled => serde_json::json!({ "phase": "free-cancelled" }),
        SampleUpdate::Progress { copied, total } => {
            serde_json::json!({ "phase": "progress", "copied": copied, "total": total })
        }
        SampleUpdate::Published { frames } => {
            serde_json::json!({ "phase": "published", "frames": frames })
        }
        SampleUpdate::Rejected => serde_json::json!({ "phase": "rejected" }),
    };
    serde_json::json!({ "kind": "sample-update", "data": data }).to_string()
}

fn receive(instance: &Instance, reader: impl BufRead) {
    let mut import = None::<ImportAssembly>;
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
            }
            Some("state-applied") if message["id"] == "manifold.main-looper" => {
                instance.gui.loaded.store(true, Ordering::Release);
                request_callback(instance.host);
            }
            Some("parameter") => {
                let (Some(id), Some(value)) = (message["id"].as_u64(), message["value"].as_f64())
                else {
                    continue;
                };
                let (Ok(id), value) = (u32::try_from(id), value as f32) else {
                    continue;
                };
                if MainParameter::decode(id, value).is_ok() {
                    let _ = instance.enqueue_ui_action(MainHostEventKind::Parameter { id, value });
                }
            }
            Some("command") => {
                let (Some(id), Some(value)) = (message["id"].as_u64(), message["value"].as_f64())
                else {
                    continue;
                };
                let (Ok(id), value) = (u32::try_from(id), value as f32) else {
                    continue;
                };
                if valid_main_command(id, value) {
                    let _ = instance.enqueue_ui_action(MainHostEventKind::Command { id, value });
                }
            }
            Some("note") => {
                let (Some(action), Some(note), Some(velocity)) = (
                    message["action"].as_u64(),
                    message["note"].as_u64(),
                    message["velocity"].as_u64(),
                ) else {
                    continue;
                };
                let event = match (action, note, velocity) {
                    (0, 0..=127, 1..=127) => EventKind::NoteOn {
                        channel: 0,
                        note: note as u8,
                        velocity: velocity as u8,
                    },
                    (1, 0..=127, _) => EventKind::NoteOff {
                        channel: 0,
                        note: note as u8,
                    },
                    (2, _, _) => EventKind::AllNotesOff,
                    _ => continue,
                };
                let _ = instance.enqueue_ui_action(MainHostEventKind::Midi(event));
            }
            Some("snapshot") => {
                if let Some(data) = instance.editor_status() {
                    let message = serde_json::json!({ "kind": "live-status", "data": data });
                    let _ = instance.gui.command(&message.to_string());
                }
            }
            Some("sample") => {
                let action = message["action"].as_str().unwrap_or("");
                let source = message["source"].as_u64().unwrap_or(0);
                let bars = message["bars"].as_f64().unwrap_or(0.0) as f32;
                let accepted = usize::try_from(source)
                    .ok()
                    .is_some_and(|source| instance.sample_action(action, source, bars));
                if !accepted {
                    let _ = instance
                        .gui
                        .command(&sample_message(SampleUpdate::Rejected));
                }
            }
            Some("rack-layout") => {
                let Some(request_id) = message["requestId"].as_u64() else {
                    continue;
                };
                let accepted = instance.set_rack_layout(&message["document"]);
                let result = serde_json::json!({
                    "kind": "rack-layout-result", "requestId": request_id, "ok": accepted
                });
                let _ = instance.gui.command(&result.to_string());
                if accepted {
                    instance.gui.request_refresh(instance.host);
                }
            }
            Some("session-import-start") => {
                import = message["size"]
                    .as_u64()
                    .and_then(|size| usize::try_from(size).ok())
                    .filter(|size| *size > 0 && *size <= MAX_STATE)
                    .map(|expected| ImportAssembly {
                        expected,
                        bytes: Vec::with_capacity(expected),
                    });
                if import.is_none() {
                    let _ = instance.gui.command("{\"kind\":\"session-import-result\",\"ok\":false,\"message\":\"Session exceeds native limits.\"}");
                }
            }
            Some("session-import-chunk") => {
                let Some(current) = import.as_mut() else {
                    continue;
                };
                let Some(encoded) = message["data"].as_str().filter(|data| data.len() <= 3000)
                else {
                    import = None;
                    continue;
                };
                let Ok(chunk) = base64::engine::general_purpose::STANDARD.decode(encoded) else {
                    import = None;
                    continue;
                };
                if current.bytes.len() + chunk.len() > current.expected {
                    import = None;
                    continue;
                }
                current.bytes.extend_from_slice(&chunk);
            }
            Some("session-import-end") => {
                let accepted = import.take().is_some_and(|current| {
                    current.bytes.len() == current.expected && instance.load_bytes(current.bytes)
                });
                let message = if accepted {
                    "{\"kind\":\"session-import-result\",\"ok\":true,\"message\":\"Main session opened in the native host.\"}"
                } else {
                    "{\"kind\":\"session-import-result\",\"ok\":false,\"message\":\"Main session rejected; previous state retained.\"}"
                };
                let _ = instance.gui.command(message);
            }
            Some("session-export") => {
                if let Some(bytes) = instance.save_bytes() {
                    let start =
                        serde_json::json!({ "kind": "session-export-start", "size": bytes.len() });
                    if !instance.gui.command(&start.to_string()) {
                        continue;
                    }
                    let mut sent = true;
                    for chunk in bytes.chunks(16 * 1024) {
                        let encoded = base64::engine::general_purpose::STANDARD.encode(chunk);
                        let packet =
                            serde_json::json!({ "kind": "session-export-chunk", "data": encoded });
                        if !instance.gui.command(&packet.to_string()) {
                            sent = false;
                            break;
                        }
                    }
                    if sent {
                        let _ = instance.gui.command("{\"kind\":\"session-export-end\"}");
                    }
                } else {
                    let _ = instance.gui.command("{\"kind\":\"session-export-result\",\"ok\":false,\"message\":\"Native Main session could not be saved.\"}");
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
        instance.cancel_sample_capture();
        instance.gui.stop();
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
        .arg("main")
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
    let monitor = std::thread::spawn(move || {
        let instance = unsafe { &*(address as *const Instance) };
        while instance.gui.created.load(Ordering::Acquire) {
            for update in instance.poll_sample_updates() {
                let _ = instance.gui.command(&sample_message(update));
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    });
    *session = Some(Session {
        child,
        reader: Some(reader),
        monitor: Some(monitor),
    });
    true
}

unsafe extern "C" fn show(plugin: *const clap_plugin) -> bool {
    unsafe { get(plugin) }.is_some_and(|instance| instance.gui.command("{\"kind\":\"show\"}"))
}

unsafe extern "C" fn hide(plugin: *const clap_plugin) -> bool {
    unsafe { get(plugin) }.is_some_and(|instance| instance.gui.command("{\"kind\":\"hide\"}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use clap_sys::ext::params::{CLAP_EXT_PARAMS, clap_plugin_params};
    use std::io::Cursor;
    use std::ptr::null;

    #[test]
    fn truncated_editor_file_import_preserves_main_state() {
        let instance = Instance::new(null(), null());
        let before = instance.save_bytes().unwrap();
        let encoded = base64::engine::general_purpose::STANDARD.encode(&before[..32]);
        let messages = format!(
            "{{\"version\":1,\"kind\":\"session-import-start\",\"size\":{}}}\n\
             {{\"version\":1,\"kind\":\"session-import-chunk\",\"data\":\"{}\"}}\n\
             {{\"version\":1,\"kind\":\"session-import-end\"}}\n",
            before.len() + 1,
            encoded,
        );
        receive(&instance, Cursor::new(messages));
        assert_eq!(instance.save_bytes().unwrap(), before);
    }

    #[test]
    fn editor_layout_message_persists_while_inactive_and_active() {
        let instance = Instance::new(null(), null());
        let browser: serde_json::Value = serde_json::from_slice(include_bytes!(
            "../../../web/public/main-rack-layout-saved-session.json"
        ))
        .unwrap();
        let mut moved = browser["rackDocument"].clone();
        moved["viewMode"] = serde_json::json!("patch");
        let message = serde_json::json!({"version":1,"kind":"rack-layout", "requestId":7,
            "document":moved});
        receive(&instance, Cursor::new(format!("{message}\n")));
        let saved: serde_json::Value =
            serde_json::from_slice(&instance.save_bytes().unwrap()).unwrap();
        assert_eq!(saved["rackDocument"], moved);
        assert_eq!(instance.editor_document().unwrap()["rackDocument"], moved);

        let plugin = &instance.plugin as *const clap_plugin;
        assert!(unsafe { (instance.plugin.activate.unwrap())(plugin, 44_100.0, 1, 128) });
        let original: serde_json::Value = serde_json::from_slice(include_bytes!(
            "../../../projects/main-looper/default-session-v16.json"
        ))
        .unwrap();
        let default = original["rackDocument"].clone();
        let message = serde_json::json!({"version":1,"kind":"rack-layout", "requestId":8,
            "document":default});
        receive(&instance, Cursor::new(format!("{message}\n")));
        let saved: serde_json::Value =
            serde_json::from_slice(&instance.save_bytes().unwrap()).unwrap();
        assert_eq!(saved["rackDocument"], default);
        unsafe { (instance.plugin.deactivate.unwrap())(plugin) };
    }

    #[test]
    fn editor_ipc_controls_the_actual_main_audio_runtime() {
        let instance = Instance::new(null(), null());
        let plugin = &instance.plugin as *const clap_plugin;
        assert!(unsafe { (instance.plugin.activate.unwrap())(plugin, 48_000.0, 1, 128) });
        let messages = concat!(
            "{\"version\":1,\"kind\":\"parameter\",\"id\":0,\"value\":2}\n",
            "{\"version\":1,\"kind\":\"command\",\"id\":0,\"value\":0}\n",
            "{\"version\":1,\"kind\":\"note\",\"action\":0,\"note\":60,\"velocity\":100}\n",
        );
        receive(&instance, Cursor::new(messages));
        let params = unsafe {
            &*((instance.plugin.get_extension.unwrap())(plugin, CLAP_EXT_PARAMS.as_ptr())
                as *const clap_plugin_params)
        };
        unsafe { (params.flush.unwrap())(plugin, null(), null()) };
        let status = instance.editor_status().unwrap();
        assert_eq!(status["active"], 2);
        assert_eq!(status["recording"], true);
        assert_eq!(status["layers"][2]["state"], 2.0);
        unsafe { (instance.plugin.deactivate.unwrap())(plugin) };
    }

    #[test]
    fn original_sample_widget_ipc_requests_native_capture() {
        let instance = Instance::new(null(), null());
        let plugin = &instance.plugin as *const clap_plugin;
        assert!(unsafe { (instance.plugin.activate.unwrap())(plugin, 48_000.0, 1, 128) });
        assert!(unsafe { (instance.plugin.start_processing.unwrap())(plugin) });
        receive(
            &instance,
            Cursor::new(
                "{\"version\":1,\"kind\":\"sample\",\"action\":\"retro\",\"source\":0,\"bars\":0.0625}\n",
            ),
        );
        let params = unsafe {
            &*((instance.plugin.get_extension.unwrap())(plugin, CLAP_EXT_PARAMS.as_ptr())
                as *const clap_plugin_params)
        };
        unsafe { (params.flush.unwrap())(plugin, null(), null()) };
        assert_eq!(
            instance.poll_sample_updates(),
            vec![SampleUpdate::Started { frames: 6000 }]
        );
        unsafe { (instance.plugin.stop_processing.unwrap())(plugin) };
        unsafe { (instance.plugin.deactivate.unwrap())(plugin) };
    }
}
