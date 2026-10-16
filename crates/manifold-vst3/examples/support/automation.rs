// Minimal read-only SDK automation queues used by behavioral host probes.
use vst3::{Class, ComPtr, ComWrapper, Steinberg::Vst::*, Steinberg::*};

struct Queue { id: u32, offset: i32, value: f64 }
impl Class for Queue { type Interfaces = (IParamValueQueue,); }
impl IParamValueQueueTrait for Queue {
    unsafe fn getParameterId(&self) -> u32 { self.id }
    unsafe fn getPointCount(&self) -> i32 { 1 }
    unsafe fn getPoint(&self, index: i32, offset: *mut i32, value: *mut f64) -> tresult {
        if index != 0 || offset.is_null() || value.is_null() { return kInvalidArgument; }
        unsafe { *offset = self.offset; *value = self.value; }
        kResultOk
    }
    unsafe fn addPoint(&self, _: i32, _: f64, _: *mut i32) -> tresult { kNotImplemented }
}
struct Changes { queue: ComPtr<IParamValueQueue> }
impl Class for Changes { type Interfaces = (IParameterChanges,); }
impl IParameterChangesTrait for Changes {
    unsafe fn getParameterCount(&self) -> i32 { 1 }
    unsafe fn getParameterData(&self, index: i32) -> *mut IParamValueQueue {
        if index == 0 { self.queue.as_ptr() } else { std::ptr::null_mut() }
    }
    unsafe fn addParameterData(&self, _: *const u32, _: *mut i32) -> *mut IParamValueQueue { std::ptr::null_mut() }
}
pub fn changes(slot: u32, offset: i32, normalized: f64) -> ComPtr<IParameterChanges> {
    let queue = ComWrapper::new(Queue { id: manifold_native::parameters::HOST_SLOT_BASE + slot, offset, value: normalized })
        .to_com_ptr::<IParamValueQueue>().unwrap();
    ComWrapper::new(Changes { queue }).to_com_ptr::<IParameterChanges>().unwrap()
}
