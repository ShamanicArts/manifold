use std::ffi::c_char;

use vst3::{
    ComRef,
    Steinberg::Vst::TChar,
    Steinberg::{IBStream, IBStreamTrait, kResultOk},
};

const MAX_STATE_BYTES: usize = 45 * 1024 * 1024;

pub(crate) const SOURCE_PROJECT: &[u8] =
    include_bytes!("../../../projects/standalone-fx-module/project.json");
pub(crate) const DEFAULTS: [f32; 7] = [0., 0., 0.5, 0.5, 0.2, 0.6, 0.4];
pub(crate) const LABELS: [&str; 7] = [
    "Effect type",
    "Wet mix",
    "Param 1",
    "Param 2",
    "Param 3",
    "Param 4",
    "Param 5",
];
pub(crate) const TYPES: [&str; 21] = [
    "Chorus",
    "Phaser",
    "WaveShaper",
    "Compressor",
    "StereoWidener",
    "Filter",
    "SVF Filter",
    "Reverb",
    "Stereo Delay",
    "Multitap",
    "Pitch Shift",
    "Granulator",
    "Ring Mod",
    "Formant",
    "EQ",
    "Limiter",
    "Transient",
    "Bitcrusher",
    "Shimmer",
    "Reverse Delay",
    "Stutter",
];

pub(crate) fn copy_cstring(source: &str, destination: &mut [c_char]) {
    destination.fill(0);
    for (target, byte) in destination.iter_mut().zip(source.bytes()) {
        *target = byte as c_char;
    }
}

pub(crate) fn copy_wstring(source: &str, destination: &mut [TChar]) {
    destination.fill(0);
    for (target, unit) in destination.iter_mut().zip(source.encode_utf16()) {
        *target = unit as TChar;
    }
}

pub(crate) unsafe fn utf16_string(pointer: *const TChar, limit: usize) -> Option<String> {
    if pointer.is_null() {
        return None;
    }
    let mut len = 0;
    while len < limit && unsafe { *pointer.add(len) } != 0 {
        len += 1;
    }
    let units = unsafe { std::slice::from_raw_parts(pointer as *const u16, len) };
    String::from_utf16(units).ok()
}

pub(crate) unsafe fn read_stream(pointer: *mut IBStream) -> Option<Vec<u8>> {
    let stream = unsafe { ComRef::from_raw(pointer) }?;
    let mut result = Vec::new();
    let mut chunk = [0_u8; 4096];
    loop {
        let mut count = 0_i32;
        let status =
            unsafe { stream.read(chunk.as_mut_ptr().cast(), chunk.len() as i32, &mut count) };
        if count < 0 || count as usize > chunk.len() || (status != kResultOk && count != 0) {
            return None;
        }
        if count == 0 {
            break;
        }
        if result.len() + count as usize > MAX_STATE_BYTES {
            return None;
        }
        result.extend_from_slice(&chunk[..count as usize]);
    }
    Some(result)
}

pub(crate) unsafe fn write_stream(pointer: *mut IBStream, bytes: &[u8]) -> bool {
    let Some(stream) = (unsafe { ComRef::from_raw(pointer) }) else {
        return false;
    };
    let mut offset = 0;
    while offset < bytes.len() {
        let mut written = 0_i32;
        let chunk = (bytes.len() - offset).min(i32::MAX as usize);
        let status = unsafe {
            stream.write(
                bytes[offset..].as_ptr().cast_mut().cast(),
                chunk as i32,
                &mut written,
            )
        };
        if status != kResultOk || written <= 0 || written as usize > chunk {
            return false;
        }
        offset += written as usize;
    }
    true
}
