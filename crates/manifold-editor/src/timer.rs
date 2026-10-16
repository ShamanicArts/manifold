//! Main-thread host event loop timer. No worker thread pumps GUI objects.
use std::{
    cell::RefCell,
    collections::HashMap,
    ffi::c_void,
    thread::{self, ThreadId},
};
thread_local! { static CALLBACKS: RefCell<HashMap<usize, Box<dyn Fn()>>> = RefCell::new(HashMap::new()); }

pub struct NativeTimer {
    id: usize,
    owner: ThreadId,
}
impl NativeTimer {
    pub fn new(callback: impl Fn() + 'static) -> Result<Self, &'static str> {
        let id = unsafe { platform::create() };
        if id == 0 {
            return Err("native UI timer unavailable");
        }
        CALLBACKS.with(|callbacks| {
            callbacks.borrow_mut().insert(id, Box::new(callback));
        });
        Ok(Self {
            id,
            owner: thread::current().id(),
        })
    }
    pub fn stop(self) {
        drop(self);
    }
}
impl Drop for NativeTimer {
    fn drop(&mut self) {
        if self.owner != thread::current().id() {
            return;
        }
        unsafe { platform::destroy(self.id) };
        CALLBACKS.with(|callbacks| {
            callbacks.borrow_mut().remove(&self.id);
        });
    }
}
fn tick(id: usize) {
    // Take the callback out while calling it: detach can retire its timer.
    let callback = CALLBACKS.with(|callbacks| callbacks.borrow_mut().remove(&id));
    if let Some(callback) = callback {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(&callback));
        // The platform timer still exists unless detach destroyed it during tick.
        if unsafe { platform::valid(id) } {
            CALLBACKS.with(|callbacks| {
                callbacks.borrow_mut().insert(id, callback);
            });
        }
    }
}
#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    thread_local! { static ALIVE: RefCell<std::collections::HashSet<usize>> = RefCell::new(Default::default()); }
    #[repr(C)]
    struct Context {
        version: isize,
        info: *mut c_void,
        retain: *const c_void,
        release: *const c_void,
        description: *const c_void,
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFRunLoopGetMain() -> *mut c_void;
        fn CFAbsoluteTimeGetCurrent() -> f64;
        fn CFRunLoopTimerCreate(
            allocator: *const c_void,
            date: f64,
            interval: f64,
            flags: usize,
            order: isize,
            callback: unsafe extern "C" fn(*mut c_void, *mut c_void),
            context: *const Context,
        ) -> *mut c_void;
        fn CFRunLoopAddTimer(runloop: *mut c_void, timer: *mut c_void, mode: *const c_void);
        fn CFRunLoopTimerInvalidate(timer: *mut c_void);
        fn CFRelease(object: *mut c_void);
        static kCFRunLoopCommonModes: *const c_void;
    }
    unsafe extern "C" fn callback(timer: *mut c_void, _context: *mut c_void) {
        tick(timer as usize);
    }
    pub unsafe fn create() -> usize {
        let context = Context {
            version: 0,
            info: std::ptr::null_mut(),
            retain: std::ptr::null(),
            release: std::ptr::null(),
            description: std::ptr::null(),
        };
        let timer = unsafe {
            CFRunLoopTimerCreate(
                std::ptr::null(),
                CFAbsoluteTimeGetCurrent() + 0.016,
                0.016,
                0,
                0,
                callback,
                &context,
            )
        };
        if !timer.is_null() {
            unsafe { CFRunLoopAddTimer(CFRunLoopGetMain(), timer, kCFRunLoopCommonModes) };
        }
        ALIVE.with(|alive| {
            alive.borrow_mut().insert(timer as usize);
        });
        timer as usize
    }
    pub unsafe fn destroy(id: usize) {
        ALIVE.with(|alive| {
            alive.borrow_mut().remove(&id);
        });
        unsafe {
            CFRunLoopTimerInvalidate(id as _);
            CFRelease(id as _);
        }
    }
    pub unsafe fn valid(id: usize) -> bool {
        ALIVE.with(|alive| alive.borrow().contains(&id))
    }
}
#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::{KillTimer, SetTimer};
    thread_local! { static ALIVE: RefCell<std::collections::HashSet<usize>> = RefCell::new(Default::default()); }
    unsafe extern "system" fn callback(_window: *mut c_void, _message: u32, id: usize, _time: u32) {
        tick(id);
    }
    pub unsafe fn create() -> usize {
        let id = unsafe { SetTimer(std::ptr::null_mut(), 0, 16, Some(callback)) };
        ALIVE.with(|alive| {
            alive.borrow_mut().insert(id);
        });
        id
    }
    pub unsafe fn destroy(id: usize) {
        unsafe {
            KillTimer(std::ptr::null_mut(), id);
        }
        ALIVE.with(|alive| {
            alive.borrow_mut().remove(&id);
        });
    }
    pub unsafe fn valid(id: usize) -> bool {
        ALIVE.with(|alive| alive.borrow().contains(&id))
    }
}
