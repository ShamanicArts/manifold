//! Native embedded view adapter. All methods run on the DAW's UI thread.
#[cfg(any(target_os = "macos", target_os = "windows"))]
mod agent;
#[cfg(any(target_os = "macos", target_os = "windows"))]
mod embedded;
#[cfg(any(target_os = "macos", target_os = "windows"))]
mod timer;
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub use embedded::NativeView;
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub use timer::NativeTimer;
