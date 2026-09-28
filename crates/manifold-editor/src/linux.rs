use std::borrow::Cow;
use std::cell::RefCell;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::mpsc;
use std::time::Duration;

use base64::Engine;
use gtk::prelude::*;
use raw_window_handle::{HasWindowHandle, RawWindowHandle, WindowHandle, XlibWindowHandle};
use wry::WebViewBuilder;

struct Parent(u64);

#[derive(Clone, Copy, PartialEq, Eq)]
enum Surface {
    Fx,
    Graph,
    Main,
}

struct ExportAssembly {
    expected: usize,
    bytes: Vec<u8>,
}

fn export_result(sender: &mpsc::SyncSender<String>, ok: bool, message: &str) {
    let _ = sender.send(
        serde_json::json!({
            "kind": "session-export-result", "ok": ok, "message": message,
        })
        .to_string(),
    );
}

fn write_export(path: PathBuf, bytes: Vec<u8>, sender: mpsc::SyncSender<String>) {
    std::thread::spawn(move || {
        let saved = fs::write(path, bytes).is_ok();
        export_result(
            &sender,
            saved,
            if saved {
                "Main session saved as JSON."
            } else {
                "Main session could not be written."
            },
        );
    });
}

impl HasWindowHandle for Parent {
    fn window_handle(&self) -> Result<WindowHandle<'_>, raw_window_handle::HandleError> {
        let handle = RawWindowHandle::Xlib(XlibWindowHandle::new(self.0 as _));
        // SAFETY: CLAP host supplied this live X11 parent for the editor lifetime.
        Ok(unsafe { WindowHandle::borrow_raw(handle) })
    }
}

fn mime(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("wasm") => "application/wasm",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        _ => "application/octet-stream",
    }
}

fn asset(root: &Path, path: &str) -> Option<(Vec<u8>, &'static str)> {
    let relative = path.trim_start_matches('/');
    let full = fs::canonicalize(root.join(relative)).ok()?;
    if !full.starts_with(root) || !full.is_file() {
        return None;
    }
    Some((fs::read(&full).ok()?, mime(&full)))
}

fn write_message(message: &str) {
    let mut stdout = io::stdout().lock();
    let _ = writeln!(stdout, "{message}");
    let _ = stdout.flush();
}

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let parent = args.next().ok_or("missing X11 parent")?.parse::<u64>()?;
    if parent == 0 {
        return Err("invalid X11 parent".into());
    }
    let root = fs::canonicalize(PathBuf::from(args.next().ok_or("missing assets path")?))?;
    let surface = match args.next().as_deref() {
        None => Surface::Fx,
        Some("graph") => Surface::Graph,
        Some("main") => Surface::Main,
        Some(_) => return Err("unsupported editor surface".into()),
    };
    if args.next().is_some() {
        return Err("extra editor arguments".into());
    }
    gtk::init()?;
    let parent = Parent(parent);
    let (sender, receiver) = mpsc::sync_channel::<String>(32);
    let async_sender = sender.clone();
    std::thread::spawn(move || {
        for line in io::stdin().lock().lines() {
            match line {
                Ok(line) if line.len() <= 16 * 1024 * 1024 => {
                    if sender.send(line).is_err() {
                        return;
                    }
                }
                _ => break,
            }
        }
        let _ = sender.send(String::from("{\"kind\":\"quit\"}"));
    });

    let webview = WebViewBuilder::new()
        .with_url(match surface {
            Surface::Fx => "manifold://editor/fx-module.html?editor=1",
            Surface::Graph => "manifold://editor/graph-module.html?editor=1",
            Surface::Main => "manifold://editor/main-looper.html?editor=1",
        })
        .with_custom_protocol("manifold".into(), move |_, request| {
            let (status, body, content_type) = match asset(&root, request.uri().path()) {
                Some((body, content_type)) => (200, body, content_type),
                None => (404, b"Asset not found".to_vec(), "text/plain"),
            };
            wry::http::Response::builder()
                .status(status)
                .header("Content-Type", content_type)
                .body(Cow::Owned(body))
                .expect("static response headers")
        })
        .with_ipc_handler(|request| {
            if request.body().len() <= 4096 {
                write_message(request.body());
            }
        })
        .with_bounds(wry::Rect {
            position: wry::dpi::PhysicalPosition::new(0, 0).into(),
            size: match surface {
                Surface::Fx => wry::dpi::PhysicalSize::new(500, 246).into(),
                Surface::Graph => wry::dpi::PhysicalSize::new(800, 600).into(),
                Surface::Main => wry::dpi::PhysicalSize::new(1280, 780).into(),
            },
        })
        .build_as_child(&parent)?;
    write_message("{\"kind\":\"ready\"}");
    // Opt-in isolated host probe: exercise the actual file input/IPC path
    // without steering a desktop file chooser from a test process.
    let mut probe_import = if surface == Surface::Graph {
        std::env::var("MANIFOLD_GRAPH_IMPORT_PROBE").ok()
    } else {
        None
    };
    let mut probe_main_import = if surface == Surface::Main {
        std::env::var("MANIFOLD_MAIN_IMPORT_PROBE").ok()
    } else {
        None
    };
    let probe_capture = if surface == Surface::Graph {
        std::env::var("MANIFOLD_GRAPH_CAPTURE_PROBE").ok()
    } else {
        None
    };
    let probe_sample = if surface == Surface::Main {
        std::env::var("MANIFOLD_MAIN_SAMPLE_PROBE").ok()
    } else {
        None
    };
    let probe_loop = if surface == Surface::Main {
        std::env::var("MANIFOLD_MAIN_LOOP_PROBE").ok()
    } else {
        None
    };
    let probe_layout = if surface == Surface::Main {
        std::env::var("MANIFOLD_MAIN_LAYOUT_PROBE").ok()
    } else {
        None
    };
    let probe_export = if surface == Surface::Main {
        std::env::var("MANIFOLD_MAIN_EXPORT_PROBE").ok()
    } else {
        None
    };
    let export_after_import = surface == Surface::Main
        && std::env::var("MANIFOLD_MAIN_EXPORT_AFTER_IMPORT_PROBE")
            .ok()
            .as_deref()
            == Some("1");
    let mut export = None::<ExportAssembly>;
    let mut probe_export_triggered = false;
    gtk::glib::timeout_add_local(Duration::from_millis(16), move || {
        if let Some(path) = probe_loop.as_deref() {
            if Path::new(path).exists() {
                let request = fs::read_to_string(path).unwrap_or_default();
                let _ = fs::remove_file(path);
                let id = match request.trim() {
                    "rec" => Some("rec"),
                    "stop" => Some("stop"),
                    "play" => Some("play"),
                    _ => None,
                };
                if let Some(id) = id {
                    let _ = webview
                        .evaluate_script(&format!("document.getElementById('{id}')?.click();"));
                }
            }
        }
        if let Some(path) = probe_layout.as_deref() {
            if Path::new(path).exists() {
                let request = fs::read_to_string(path).unwrap_or_default();
                let _ = fs::remove_file(path);
                if request.trim() == "toggle" {
                    let _ = webview.evaluate_script(
                        "document.querySelector('[data-main-tab=\"midisynth\"]')?.click(); document.getElementById('rack-view-switch')?.click();"
                    );
                }
            }
        }
        if let Some(path) = probe_sample.as_deref() {
            if Path::new(path).exists() {
                let request = fs::read_to_string(path).unwrap_or_default();
                let _ = fs::remove_file(path);
                if request.trim() == "retro" {
                    let _ = webview.evaluate_script(
                        "document.querySelector('[data-main-tab=\"midisynth\"]')?.click(); document.getElementById('sample-cap')?.click();"
                    );
                } else if request.trim() == "free:start" {
                    let _ = webview.evaluate_script(
                        "document.querySelector('[data-main-tab=\"midisynth\"]')?.click(); document.getElementById('sample-mode')?.click(); document.getElementById('sample-cap')?.click();"
                    );
                } else if request.trim() == "free:stop" {
                    let _ =
                        webview.evaluate_script("document.getElementById('sample-cap')?.click();");
                }
            }
        }
        if let Some(path) = probe_capture.as_deref() {
            if Path::new(path).exists() {
                let request = fs::read_to_string(path).unwrap_or_default();
                let _ = fs::remove_file(path);
                if request.trim() == "free:arm" {
                    let _ = webview.evaluate_script(
                        "const mode=document.getElementById('graph-capture-mode'); mode.value='free'; mode.dispatchEvent(new Event('change')); document.getElementById('graph-capture-go').click();"
                    );
                } else if request.trim() == "free:stop" {
                    let _ = webview
                        .evaluate_script("document.getElementById('graph-capture-go')?.click();");
                } else if let Some(bars) = request
                    .trim()
                    .strip_prefix("bars:")
                    .and_then(|value| value.parse::<f64>().ok())
                    .filter(|value| value.is_finite() && (0.0625..=16.0).contains(value))
                {
                    let _ = webview.evaluate_script(&format!(
                        "document.getElementById('graph-capture-mode').value='bars'; document.getElementById('graph-capture-seconds').value='{bars}'; document.getElementById('graph-capture-go').click();"
                    ));
                } else {
                    let _ = webview
                        .evaluate_script("document.getElementById('graph-capture-go')?.click();");
                }
            }
        }
        for _ in 0..16 {
            let Ok(line) = receiver.try_recv() else { break };
            let Ok(command) = serde_json::from_str::<serde_json::Value>(&line) else {
                continue;
            };
            match command["kind"].as_str() {
                Some("state") => {
                    let Some(document) = command.get("document") else {
                        continue;
                    };
                    let script = format!(
                        "window.manifoldEditorReceive ? window.manifoldEditorReceive({document}) : (window.__manifoldPendingState = {document});"
                    );
                    let _ = webview.evaluate_script(&script);
                    if probe_export.is_some() && !export_after_import && !probe_export_triggered {
                        probe_export_triggered = true;
                        let _ = webview
                            .evaluate_script("document.getElementById('save-session')?.click();");
                    }
                    if let Some(path) = probe_main_import.take() {
                        if let Ok(contents) = fs::read_to_string(&path) {
                            let text = serde_json::to_string(&contents).unwrap_or_default();
                            let _ = webview.evaluate_script(&format!(
                                "{{ const input = document.getElementById('open-session'); \
                                  const transfer = new DataTransfer(); \
                                  transfer.items.add(new File([{text}], 'main-session.json', {{type:'application/json'}})); \
                                  input.files = transfer.files; \
                                  input.dispatchEvent(new Event('change', {{bubbles:true}})); }}"
                            ));
                        }
                    }
                    if let Some(path) = probe_import.take() {
                        if let Ok(contents) = fs::read_to_string(&path) {
                            let text = serde_json::to_string(&contents).unwrap_or_default();
                            let name = Path::new(&path)
                                .file_name()
                                .and_then(|name| name.to_str())
                                .unwrap_or("project.json");
                            let name = serde_json::to_string(name).unwrap_or_default();
                            let _ = webview.evaluate_script(&format!(
                                "{{ const input = document.getElementById('graph-file'); \
                                  const transfer = new DataTransfer(); \
                                  transfer.items.add(new File([{text}], {name}, {{type:'application/json'}})); \
                                  input.files = transfer.files; \
                                  input.dispatchEvent(new Event('change', {{bubbles:true}})); }}"
                            ));
                        }
                    }
                }
                Some("live-status") => {
                    if let Some(data) = command.get("data") {
                        if let Some(path) = probe_loop.as_deref() {
                            let _ = fs::write(format!("{path}.status"), data.to_string());
                        }
                        let _ = webview.evaluate_script(&format!(
                            "window.manifoldEditorLiveStatus?.({data});"
                        ));
                    }
                }
                Some("sample-update") => {
                    if let Some(data) = command.get("data") {
                        if let Some(path) = probe_sample.as_deref() {
                            let _ = fs::write(format!("{path}.status"), data.to_string());
                        }
                        let _ = webview.evaluate_script(&format!(
                            "window.manifoldEditorSampleUpdate?.({data});"
                        ));
                    }
                }
                Some("rack-layout-result") => {
                    let result = serde_json::json!({
                        "requestId": command["requestId"].as_u64(),
                        "ok": command["ok"].as_bool().unwrap_or(false),
                    });
                    if let Some(path) = probe_layout.as_deref() {
                        let _ = fs::write(format!("{path}.result"), result.to_string());
                    }
                    let _ = webview.evaluate_script(&format!(
                        "window.manifoldEditorLayoutResult?.({result});"
                    ));
                }
                Some("session-import-result") => {
                    let result = serde_json::json!({
                        "ok": command["ok"].as_bool().unwrap_or(false),
                        "message": command["message"].as_str().unwrap_or("Main session import ended."),
                    });
                    if let Ok(path) = std::env::var("MANIFOLD_MAIN_IMPORT_PROBE") {
                        let _ = fs::write(format!("{path}.result"), result.to_string());
                    }
                    let _ = webview.evaluate_script(&format!(
                        "window.manifoldEditorImportResult?.({result});"
                    ));
                    if export_after_import
                        && probe_export.is_some()
                        && !probe_export_triggered
                        && result["ok"] == true
                    {
                        probe_export_triggered = true;
                        let _ = webview
                            .evaluate_script("document.getElementById('save-session')?.click();");
                    }
                }
                Some("session-export-start") => {
                    export = command["size"]
                        .as_u64()
                        .and_then(|size| usize::try_from(size).ok())
                        .filter(|size| *size > 0 && *size <= 300 * 1024 * 1024)
                        .map(|expected| ExportAssembly {
                            expected,
                            bytes: Vec::with_capacity(expected),
                        });
                }
                Some("session-export-chunk") => {
                    let Some(current) = export.as_mut() else {
                        continue;
                    };
                    let Some(encoded) =
                        command["data"].as_str().filter(|data| data.len() <= 24_000)
                    else {
                        export = None;
                        continue;
                    };
                    let Ok(chunk) = base64::engine::general_purpose::STANDARD.decode(encoded)
                    else {
                        export = None;
                        continue;
                    };
                    if current.bytes.len() + chunk.len() > current.expected {
                        export = None;
                        continue;
                    }
                    current.bytes.extend_from_slice(&chunk);
                }
                Some("session-export-end") => {
                    let Some(bytes) = export.take().and_then(|assembly| {
                        (assembly.bytes.len() == assembly.expected).then_some(assembly.bytes)
                    }) else {
                        export_result(
                            &async_sender,
                            false,
                            "Native Main session transfer was incomplete.",
                        );
                        continue;
                    };
                    if let Some(path) = probe_export.as_deref() {
                        write_export(PathBuf::from(path), bytes, async_sender.clone());
                        continue;
                    }
                    let chooser = gtk::FileChooserNative::new(
                        Some("Save Main session"),
                        None::<&gtk::Window>,
                        gtk::FileChooserAction::Save,
                        Some("Save"),
                        Some("Cancel"),
                    );
                    chooser.set_current_name("manifold-main-looper.json");
                    chooser.set_do_overwrite_confirmation(true);
                    let payload = Rc::new(RefCell::new(Some(bytes)));
                    let sender = async_sender.clone();
                    chooser.connect_response(move |dialog, response| {
                        if response == gtk::ResponseType::Accept {
                            if let (Some(path), Some(bytes)) =
                                (dialog.filename(), payload.borrow_mut().take())
                            {
                                write_export(path, bytes, sender.clone());
                            } else {
                                export_result(
                                    &sender,
                                    false,
                                    "No Main session destination was selected.",
                                );
                            }
                        } else {
                            export_result(&sender, false, "Main session save cancelled.");
                        }
                        dialog.destroy();
                    });
                    chooser.show();
                }
                Some("session-export-result") => {
                    let result = serde_json::json!({
                        "ok": command["ok"].as_bool().unwrap_or(false),
                        "message": command["message"].as_str().unwrap_or("Main session export ended."),
                    });
                    let _ = webview.evaluate_script(&format!(
                        "window.manifoldEditorExportResult?.({result});"
                    ));
                }
                Some("status") => {
                    if let Some(message) = command["message"].as_str() {
                        if let Some(path) = probe_capture.as_deref() {
                            let _ = fs::write(format!("{path}.status"), message);
                        }
                        let encoded = serde_json::to_string(message).unwrap_or_default();
                        let _ = webview
                            .evaluate_script(&format!("window.manifoldEditorStatus?.({encoded});"));
                    }
                }
                Some("capture-result") => {
                    if let Some(message) = command["message"].as_str() {
                        if let Some(path) = probe_capture.as_deref() {
                            let _ = fs::write(format!("{path}.result"), message);
                        }
                        let encoded = serde_json::to_string(message).unwrap_or_default();
                        let ok = command["ok"].as_bool().unwrap_or(false);
                        let _ = webview.evaluate_script(&format!(
                            "window.manifoldCaptureResult?.({ok}, {encoded});"
                        ));
                    }
                }
                Some("show") => {
                    let _ = webview.set_visible(true);
                }
                Some("hide") => {
                    let _ = webview.set_visible(false);
                }
                Some("quit") => {
                    gtk::main_quit();
                    return gtk::glib::ControlFlow::Break;
                }
                _ => {}
            }
        }
        gtk::glib::ControlFlow::Continue
    });
    gtk::main();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_path_stays_within_bundle() {
        let root = fs::canonicalize("../../web/dist").unwrap();
        assert!(asset(&root, "/fx-module.html").is_some());
        assert!(asset(&root, "/main-looper.html").is_some());
        assert!(asset(&root, "/../../Cargo.toml").is_none());
    }
}
