use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;
thread_local! { static COUNTS:Cell<Option<(usize,usize)>>=const{Cell::new(None)}; }
struct Allocator;
#[global_allocator]
static ALLOCATOR: Allocator = Allocator;
fn count(allocate: bool) {
    let _ = COUNTS.try_with(|cell| {
        if let Some((a, d)) = cell.get() {
            cell.set(Some((
                a + usize::from(allocate),
                d + usize::from(!allocate),
            )));
        }
    });
}
unsafe impl GlobalAlloc for Allocator {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        count(true);
        unsafe { System.alloc(l) }
    }
    unsafe fn alloc_zeroed(&self, l: Layout) -> *mut u8 {
        count(true);
        unsafe { System.alloc_zeroed(l) }
    }
    unsafe fn realloc(&self, p: *mut u8, l: Layout, n: usize) -> *mut u8 {
        count(true);
        unsafe { System.realloc(p, l, n) }
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        count(false);
        unsafe { System.dealloc(p, l) }
    }
}
pub fn measure<T>(run: impl FnOnce() -> T) -> T {
    COUNTS.with(|c| c.set(Some((0, 0))));
    let result = run();
    let counts = COUNTS.with(|c| c.replace(None));
    assert_eq!(counts, Some((0, 0)));
    result
}
