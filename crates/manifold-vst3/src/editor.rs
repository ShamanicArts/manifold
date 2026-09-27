//! Linux VST3 view around the same packaged widget process used by CLAP.
//! The IPC reader only enqueues; host callbacks run on IRunLoop's UI thread.

use std::ffi::{CStr, c_char, c_void};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use crossbeam_queue::ArrayQueue;
use vst3::{
    Class, ComPtr, ComRef, ComWrapper, Steinberg::Linux::*, Steinberg::Vst::*, Steinberg::*,
};

use crate::controller::Shared;

const WIDTH: i32 = 500;
const HEIGHT: i32 = 246;
const MAX_MESSAGES: usize = 256;

#[derive(Clone, Copy, Debug)]
enum MessageKind {
    Begin,
    Value,
    End,
}

#[derive(Clone, Copy, Debug)]
struct Message {
    kind: MessageKind,
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
    shared: Arc<Shared>,
    messages: Arc<ArrayQueue<Message>>,
    session: Mutex<Option<Session>>,
    ready: AtomicBool,
    last_sent: AtomicU64,
}

impl State {
    fn new(shared: Arc<Shared>) -> Arc<Self> {
        Arc::new(Self {
            shared,
            messages: Arc::new(ArrayQueue::new(MAX_MESSAGES)),
            session: Mutex::new(None),
            ready: AtomicBool::new(false),
            last_sent: AtomicU64::new(u64::MAX),
        })
    }

    fn send_snapshot(&self) -> bool {
        let values: Vec<_> = (0..7)
            .map(|id| {
                let value = if id == 0 {
                    self.shared.value(id) * 20.
                } else {
                    self.shared.value(id)
                };
                serde_json::json!({"nodeId":2,"id":id,"value":value})
            })
            .collect();
        let Ok(memories) = self.shared.memories.lock() else {
            return false;
        };
        let rows: serde_json::Map<_, _> = memories
            .iter()
            .enumerate()
            .map(|(id, row)| (id.to_string(), serde_json::json!(row)))
            .collect();
        drop(memories);
        let command = serde_json::json!({"kind":"state","document":{
            "schemaVersion":1,"id":"manifold.standalone-fx-module",
            "signal":{"initialParameters":values},"typeParameters":rows
        }})
        .to_string();
        self.session
            .lock()
            .ok()
            .and_then(|mut session| session.as_mut().map(|session| session.send(&command)))
            .unwrap_or(false)
    }

    fn tick(&self) {
        let handler = self
            .shared
            .handler
            .lock()
            .ok()
            .and_then(|handler| handler.clone());
        if let Some(handler) = handler.as_ref() {
            while let Some(message) = self.messages.pop() {
                match message.kind {
                    MessageKind::Begin => {
                        unsafe { handler.beginEdit(message.id) };
                    }
                    MessageKind::Value => {
                        let normalized = if message.id == 0 {
                            message.value / 20.
                        } else {
                            message.value
                        };
                        if unsafe { handler.performEdit(message.id, normalized) } == kResultOk {
                            self.shared.set_value(message.id as usize, normalized);
                            if message.id == 0 {
                                unsafe {
                                    handler.restartComponent(RestartFlags_::kParamValuesChanged)
                                };
                            }
                        }
                    }
                    MessageKind::End => {
                        unsafe { handler.endEdit(message.id) };
                    }
                }
            }
        }
        if !self.ready.load(Ordering::Acquire) {
            return;
        }
        let current = self.shared.editor_version();
        if self.last_sent.load(Ordering::Acquire) != current && self.send_snapshot() {
            self.last_sent.store(current, Ordering::Release);
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

pub(crate) struct View {
    state: Arc<State>,
    timer: Mutex<Option<TimerRegistration>>,
}

impl View {
    fn new(shared: Arc<Shared>) -> Self {
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
        let state = self.state.clone();
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
                let kind = match value["kind"].as_str() {
                    Some("gesture-begin") => MessageKind::Begin,
                    Some("parameter") => MessageKind::Value,
                    Some("gesture-end") => MessageKind::End,
                    _ => continue,
                };
                let Some(id) = value["id"].as_u64().and_then(|id| u32::try_from(id).ok()) else {
                    continue;
                };
                if id >= 7 {
                    continue;
                }
                let physical = if matches!(kind, MessageKind::Value) {
                    let Some(number) = value["value"].as_f64() else {
                        continue;
                    };
                    if !number.is_finite()
                        || (id == 0 && !(0. ..=20.).contains(&number))
                        || (id != 0 && !(0. ..=1.).contains(&number))
                    {
                        continue;
                    }
                    number
                } else {
                    0.
                };
                let message = Message {
                    kind,
                    id,
                    value: physical,
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
        drop(session);
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

pub(crate) fn create_view(name: *const c_char, shared: Arc<Shared>) -> *mut IPlugView {
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
    (binary.is_file() && assets.join("fx-module.html").is_file()).then_some((binary, assets))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::controller::Controller;
    use vst3::Steinberg::Vst::IComponentHandlerTrait;

    struct HostHandler(Arc<Mutex<Vec<(u8, u32, f64)>>>);
    impl Class for HostHandler {
        type Interfaces = (IComponentHandler,);
    }
    impl IComponentHandlerTrait for HostHandler {
        unsafe fn beginEdit(&self, id: u32) -> tresult {
            self.0.lock().unwrap().push((0, id, 0.));
            kResultOk
        }
        unsafe fn performEdit(&self, id: u32, value: f64) -> tresult {
            self.0.lock().unwrap().push((1, id, value));
            kResultOk
        }
        unsafe fn endEdit(&self, id: u32) -> tresult {
            self.0.lock().unwrap().push((2, id, 0.));
            kResultOk
        }
        unsafe fn restartComponent(&self, _flags: i32) -> tresult {
            kResultOk
        }
    }

    struct HostFrame(Arc<Mutex<Option<ComPtr<ITimerHandler>>>>);
    impl Class for HostFrame {
        type Interfaces = (IPlugFrame, IRunLoop);
    }
    impl IPlugFrameTrait for HostFrame {
        unsafe fn resizeView(&self, _view: *mut IPlugView, _size: *mut ViewRect) -> tresult {
            kResultFalse
        }
    }
    impl IRunLoopTrait for HostFrame {
        unsafe fn registerEventHandler(
            &self,
            _handler: *mut IEventHandler,
            _fd: FileDescriptor,
        ) -> tresult {
            kResultFalse
        }
        unsafe fn unregisterEventHandler(&self, _handler: *mut IEventHandler) -> tresult {
            kResultFalse
        }
        unsafe fn registerTimer(&self, handler: *mut ITimerHandler, _ms: TimerInterval) -> tresult {
            *self.0.lock().unwrap() =
                unsafe { ComRef::from_raw(handler) }.map(|handler| handler.to_com_ptr());
            kResultOk
        }
        unsafe fn unregisterTimer(&self, _handler: *mut ITimerHandler) -> tresult {
            self.0.lock().unwrap().take();
            kResultOk
        }
    }

    #[test]
    fn widget_messages_reach_vst3_handler_on_host_timer() {
        let controller = Controller::new();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let host_handler = ComWrapper::new(HostHandler(calls.clone()))
            .to_com_ptr::<IComponentHandler>()
            .unwrap();
        *controller.shared.handler.lock().unwrap() = Some(host_handler);
        let view = View::new(controller.shared.clone());
        let timers = Arc::new(Mutex::new(None));
        let host = ComWrapper::new(HostFrame(timers.clone()));
        let frame = host.to_com_ptr::<IPlugFrame>().unwrap();
        assert_eq!(unsafe { view.setFrame(frame.as_ptr()) }, kResultOk);
        for kind in [MessageKind::Begin, MessageKind::Value, MessageKind::End] {
            view.state
                .messages
                .push(Message {
                    kind,
                    id: 1,
                    value: 0.72,
                })
                .unwrap();
        }
        let timer = timers.lock().unwrap().clone().unwrap();
        unsafe { timer.onTimer() };
        assert_eq!(
            *calls.lock().unwrap(),
            vec![(0, 1, 0.), (1, 1, 0.72), (2, 1, 0.)]
        );
        assert_eq!(controller.shared.value(1), 0.72);
        assert_eq!(unsafe { view.setFrame(null_mut()) }, kResultOk);
        assert!(timers.lock().unwrap().is_none());
    }
}
