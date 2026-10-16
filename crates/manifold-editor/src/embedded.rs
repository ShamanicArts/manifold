//! Wry in the host's NSView/HWND, with the same native creator protocol as Linux.
use crate::{NativeTimer, agent::AgentBridge};
use raw_window_handle::{HasWindowHandle, RawWindowHandle, WindowHandle};
use std::{
    borrow::Cow,
    cell::RefCell,
    collections::HashMap,
    ffi::c_void,
    fs,
    path::{Path, PathBuf},
    ptr::NonNull,
    sync::mpsc,
    thread::{self, ThreadId},
};
use wry::{WebView, WebViewBuilder};

struct Parent(usize);
impl HasWindowHandle for Parent {
    fn window_handle(&self) -> Result<WindowHandle<'_>, raw_window_handle::HandleError> {
        #[cfg(target_os = "macos")]
        let raw = RawWindowHandle::AppKit(raw_window_handle::AppKitWindowHandle::new(
            NonNull::new(self.0 as *mut c_void)
                .ok_or(raw_window_handle::HandleError::Unavailable)?,
        ));
        #[cfg(target_os = "windows")]
        let raw = RawWindowHandle::Win32(raw_window_handle::Win32WindowHandle::new(
            std::num::NonZeroIsize::new(self.0 as isize)
                .ok_or(raw_window_handle::HandleError::Unavailable)?,
        ));
        Ok(unsafe { WindowHandle::borrow_raw(raw) })
    }
}
struct Embedded {
    webview: WebView,
    receiver: mpsc::Receiver<String>,
    agent: AgentBridge,
    #[cfg(target_os = "windows")]
    _profile: BrowserProfile,
}
#[cfg(target_os = "windows")]
struct BrowserProfile(PathBuf);
#[cfg(target_os = "windows")]
impl BrowserProfile {
    fn new() -> std::io::Result<Self> {
        let root = std::env::var_os("MANIFOLD_WEBVIEW_DATA_DIRECTORY")
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::temp_dir().join("manifold-editor-webview"));
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten().take(32) {
                let path = entry.path();
                if fs::read(path.join(".manifold-closed")).ok().as_deref() == Some(b"closed\n") {
                    let _ = fs::remove_dir_all(path);
                }
            }
        }
        let session = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(std::io::Error::other)?
            .as_nanos();
        let path = root.join(format!("{}-{session}", std::process::id()));
        fs::create_dir_all(&path)?;
        Ok(Self(path))
    }
}
#[cfg(target_os = "windows")]
impl Drop for BrowserProfile {
    fn drop(&mut self) {
        // A plug-in must not leave cleanup threads executing after its DLL
        // unloads. If the browser still holds files, retry on the next attach.
        if fs::remove_dir_all(&self.0).is_err() && self.0.exists() {
            let _ = fs::write(self.0.join(".manifold-closed"), b"closed\n");
        }
    }
}
thread_local! { static VIEWS: RefCell<HashMap<usize,Embedded>> = RefCell::new(HashMap::new()); static NEXT: RefCell<usize> = const { RefCell::new(0) }; }
/// Sendable token; actual WebView remains in UI-thread local storage.
pub struct NativeView {
    id: usize,
    owner: ThreadId,
    timer: Option<NativeTimer>,
}
impl NativeView {
    /// # Safety
    /// Parent is a live NSView/HWND on this thread, valid until stop/detach.
    pub unsafe fn new(
        parent: usize,
        root: PathBuf,
        width: u32,
        height: u32,
        on_tick: impl Fn() + 'static,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let root = root.canonicalize()?;
        #[cfg(all(target_os = "windows", target_env = "gnu"))]
        {
            use std::os::windows::ffi::OsStrExt;
            use windows_sys::Win32::System::LibraryLoader::LoadLibraryW;
            static LOADER: std::sync::OnceLock<usize> = std::sync::OnceLock::new();
            let loader = [
                root.parent().unwrap().join("WebView2Loader.dll"),
                root.parent()
                    .unwrap()
                    .parent()
                    .unwrap()
                    .join("x86_64-win/WebView2Loader.dll"),
            ]
            .into_iter()
            .find(|path| path.is_file())
            .ok_or("Bundled WebView2 loader missing")?;
            let path: Vec<u16> = loader.as_os_str().encode_wide().chain(Some(0)).collect();
            // Keep the SDK loader mapped for this module's delayed import.
            // All browser calls and this load happen on the UI thread.
            if *LOADER.get_or_init(|| unsafe { LoadLibraryW(path.as_ptr()) } as usize) == 0 {
                return Err(std::io::Error::last_os_error().into());
            }
        }
        let agent = AgentBridge::start()?;
        eprintln!("Manifold creator agent endpoint: {}", agent.address);
        let pending = agent.pending.clone();
        let (sender, receiver) = mpsc::sync_channel(32);
        #[cfg(target_os = "macos")]
        let url = "manifold://editor/index.html?editor=1";
        #[cfg(target_os = "windows")]
        let url = "http://manifold.localhost/index.html?editor=1";
        // Creator state lives in the native worker. A private browser profile
        // prevents editors from sharing a DAW's unrelated WebView2 cache.
        #[cfg(target_os = "windows")]
        let profile = BrowserProfile::new()?;
        #[cfg(target_os = "windows")]
        let mut context = wry::WebContext::new(Some(profile.0.clone()));
        #[cfg(not(target_os = "windows"))]
        let builder = WebViewBuilder::new();
        #[cfg(target_os = "windows")]
        let builder = WebViewBuilder::new_with_web_context(&mut context);
        #[cfg(target_os = "windows")]
        let builder = {
            use wry::WebViewBuilderExtWindows;
            match std::env::var("MANIFOLD_WEBVIEW_BROWSER_ARGS") {
                Ok(arguments) => builder.with_additional_browser_args(&arguments),
                Err(_) => builder,
            }
        };
        let webview=builder.with_url(url)
          .with_initialization_script("window.addEventListener('error',e=>window.ipc.postMessage(JSON.stringify({kind:'editor-error',message:e.message})));window.addEventListener('unhandledrejection',e=>window.ipc.postMessage(JSON.stringify({kind:'editor-error',message:String(e.reason)})));")
          .with_custom_protocol("manifold".into(),move |_,request| {
            let file=root.join(request.uri().path().trim_start_matches('/')).canonicalize().ok().filter(|file|file.starts_with(&root)&&file.is_file());
            let (status,mime,body)=file.and_then(|file| fs::read(&file).ok().map(|body|(200,mime(&file),body))).unwrap_or((404,"text/plain",b"Asset not found".to_vec()));
            wry::http::Response::builder().status(status).header("Content-Type",mime).body(Cow::Owned(body)).unwrap()
          })
          .with_ipc_handler(move |request| {
            if request.body().len()>1024*1024 {return;}
            if let Ok(message)=serde_json::from_str::<serde_json::Value>(request.body()) {
              if message["kind"]=="agent-result" {AgentBridge::reply(&pending,&message);return;}
              if message["kind"]=="editor-error" {eprintln!("Manifold editor script: {}",message["message"]);return;}
            }
            let _=sender.try_send(request.body().clone());
          })
          .with_bounds(wry::Rect{position:wry::dpi::LogicalPosition::new(0,0).into(),size:wry::dpi::LogicalSize::new(width,height).into()})
          .build_as_child(&Parent(parent))?;
        let id = NEXT.with(|next| {
            let mut next = next.borrow_mut();
            *next += 1;
            *next
        });
        VIEWS.with(|views| {
            views.borrow_mut().insert(
                id,
                Embedded {
                    webview,
                    receiver,
                    agent,
                    #[cfg(target_os = "windows")]
                    _profile: profile,
                },
            );
        });
        let timer = match NativeTimer::new(on_tick) {
            Ok(timer) => timer,
            Err(error) => {
                let view = VIEWS.with(|views| views.borrow_mut().remove(&id));
                drop(view);
                return Err(error.into());
            }
        };
        Ok(Self {
            id,
            owner: thread::current().id(),
            timer: Some(timer),
        })
    }
    pub fn poll(&self) -> Vec<String> {
        if self.owner != thread::current().id() {
            return Vec::new();
        }
        VIEWS.with(|views| {
            let views = views.borrow();
            let Some(view) = views.get(&self.id) else {
                return Vec::new();
            };
            for (id, command) in view.agent.incoming.try_iter().take(16) {
                let _ = view.webview.evaluate_script(&format!(
                    "window.manifoldNativeAgentRequest?.({id},{command});"
                ));
            }
            view.receiver.try_iter().take(32).collect()
        })
    }
    pub fn send(&self, text: &str) -> bool {
        if self.owner != thread::current().id() {
            return false;
        }
        let Ok(mut message) = serde_json::from_str::<serde_json::Value>(text) else {
            return false;
        };
        VIEWS.with(|views|{
            let views=views.borrow();let Some(view)=views.get(&self.id) else{return false;};
            match message["kind"].as_str() {
                Some("state")=>{message["document"]["agentAddress"]=view.agent.address.clone().into();let document=&message["document"];view.webview.evaluate_script(&format!("window.manifoldEditorReceive?window.manifoldEditorReceive({document}):(window.__manifoldPendingState={document});")).is_ok()},
                Some("creator-result")=>view.webview.evaluate_script(&format!("window.manifoldCreatorResult?.({message});")).is_ok(),
                Some("show")=>view.webview.set_visible(true).is_ok(),Some("hide")=>view.webview.set_visible(false).is_ok(),
                _=>true,
            }
        })
    }
    pub fn stop(self) {
        drop(self);
    }
}
impl Drop for NativeView {
    fn drop(&mut self) {
        if self.owner != thread::current().id() {
            return;
        }
        self.timer.take();
        let view = VIEWS.with(|views| views.borrow_mut().remove(&self.id));
        if let Some(view) = view {
            let _ = view
                .webview
                .evaluate_script("window.dispatchEvent(new Event('pagehide')); ");
            // Destroying native windows can pump host messages. Release the
            // thread-local borrow before asking the OS to destroy the view.
            drop(view);
        }
    }
}
fn mime(file: &Path) -> &'static str {
    match file.extension().and_then(|s| s.to_str()) {
        Some("html") => "text/html",
        Some("js") => "text/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("wasm") => "application/wasm",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        _ => "application/octet-stream",
    }
}
