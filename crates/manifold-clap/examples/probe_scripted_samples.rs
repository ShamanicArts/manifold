//! Exercise the exported CLAP ABI without an editor or audio device.
//! LIBRARY RACK_PACKAGE INSTRUMENT_PACKAGE; set MANIFOLD_SCRIPT_SAMPLE_EVIDENCE_DIR.
use std::ffi::{CString, c_char, c_void};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use std::sync::OnceLock;

use clap_sys::{
    audio_buffer::clap_audio_buffer,
    entry::clap_plugin_entry,
    ext::state::{CLAP_EXT_STATE, clap_plugin_state},
    factory::plugin_factory::{CLAP_PLUGIN_FACTORY_ID, clap_plugin_factory},
    host::clap_host,
    plugin::clap_plugin,
    process::{CLAP_PROCESS_CONTINUE, clap_process},
    stream::{clap_istream, clap_ostream},
    version::CLAP_VERSION,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
mod sample_suite {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../manifold-native/tests/support/scripted_samples.rs"
    ));
}
static LIBRARY: OnceLock<PathBuf> = OnceLock::new();

// Exact layout of include/manifold_project_script.h.
#[repr(C)]
struct Script {
    set_path:
        Option<unsafe extern "C" fn(*const clap_plugin, *const c_char, f64, *mut u64) -> bool>,
    status: Option<unsafe extern "C" fn(*const clap_plugin, u64) -> u32>,
    call_json: Option<
        unsafe extern "C" fn(*const clap_plugin, *const c_char, *const u8, usize, *mut u64) -> bool,
    >,
}
struct Hosted {
    plugin: *const clap_plugin,
    state: *const clap_plugin_state,
    script: *const Script,
    entry: *const clap_plugin_entry,
    library: *mut c_void,
    _host: Box<clap_host>,
}
struct Incoming<'a> {
    bytes: &'a [u8],
    offset: usize,
}
unsafe extern "C" fn read(stream: *const clap_istream, buffer: *mut c_void, size: u64) -> i64 {
    let data = unsafe { &mut *((*stream).ctx as *mut Incoming<'_>) };
    let count = (size as usize).min(data.bytes.len() - data.offset);
    unsafe {
        std::ptr::copy_nonoverlapping(data.bytes.as_ptr().add(data.offset), buffer.cast(), count);
    }
    data.offset += count;
    count as i64
}
unsafe extern "C" fn write(stream: *const clap_ostream, buffer: *const c_void, size: u64) -> i64 {
    let data = unsafe { &mut *((*stream).ctx as *mut Vec<u8>) };
    data.extend_from_slice(unsafe { std::slice::from_raw_parts(buffer.cast(), size as usize) });
    size as i64
}
impl sample_suite::SampleHost for Hosted {
    fn open(package: &[u8]) -> Self {
        let path = CString::new(LIBRARY.get().unwrap().as_os_str().as_encoded_bytes()).unwrap();
        let library = unsafe { libc::dlopen(path.as_ptr(), libc::RTLD_NOW | libc::RTLD_LOCAL) };
        assert!(!library.is_null(), "CLAP library failed to load");
        let entry =
            unsafe { libc::dlsym(library, c"clap_entry".as_ptr()) } as *const clap_plugin_entry;
        assert!(!entry.is_null());
        assert!(unsafe { (*entry).init.unwrap()(path.as_ptr()) });
        let factory = unsafe { (*entry).get_factory.unwrap()(CLAP_PLUGIN_FACTORY_ID.as_ptr()) }
            as *const clap_plugin_factory;
        assert!(!factory.is_null());
        let host = Box::new(clap_host {
            clap_version: CLAP_VERSION,
            host_data: null_mut(),
            name: c"Manifold Sample SDK probe".as_ptr(),
            vendor: c"Shamanic Arts".as_ptr(),
            url: c"".as_ptr(),
            version: c"1".as_ptr(),
            get_extension: None,
            request_restart: None,
            request_process: None,
            request_callback: None,
        });
        let plugin = unsafe {
            (*factory).create_plugin.unwrap()(
                factory,
                &*host,
                c"arts.shamanic.manifold.graph".as_ptr(),
            )
        };
        assert!(!plugin.is_null());
        assert!(unsafe { (*plugin).init.unwrap()(plugin) });
        let state = unsafe { (*plugin).get_extension.unwrap()(plugin, CLAP_EXT_STATE.as_ptr()) }
            as *const clap_plugin_state;
        let script = unsafe {
            (*plugin).get_extension.unwrap()(plugin, c"manifold.project.script.v1".as_ptr())
        } as *const Script;
        assert!(!state.is_null() && !script.is_null());
        let mut data = Incoming {
            bytes: package,
            offset: 0,
        };
        let stream = clap_istream {
            ctx: (&mut data as *mut Incoming<'_>).cast(),
            read: Some(read),
        };
        assert!(unsafe { (*state).load.unwrap()(plugin, &stream) });
        assert_eq!(data.offset, package.len());
        assert!(unsafe { (*plugin).activate.unwrap()(plugin, 48000., 1, 128) });
        assert!(unsafe { (*plugin).start_processing.unwrap()(plugin) });
        Self {
            plugin,
            state,
            script,
            entry,
            library,
            _host: host,
        }
    }
    fn call(&self, method: &str, args: Vec<Value>) -> u64 {
        let method = CString::new(method).unwrap();
        let bytes = serde_json::to_vec(&args).unwrap();
        let mut generation = 0;
        assert!(unsafe {
            (*self.script).call_json.unwrap()(
                self.plugin,
                method.as_ptr(),
                bytes.as_ptr(),
                bytes.len(),
                &mut generation,
            )
        });
        generation
    }
    fn status(&self, generation: u64) -> u32 {
        unsafe { (*self.script).status.unwrap()(self.plugin, generation) }
    }
    fn render(&self) -> [[f32; 128]; 2] {
        let mut pcm = [[0.; 128]; 2];
        let mut channels = [pcm[0].as_mut_ptr(), pcm[1].as_mut_ptr()];
        let mut output = clap_audio_buffer {
            data32: channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let process = clap_process {
            steady_time: -1,
            frames_count: 128,
            transport: null(),
            audio_inputs: null(),
            audio_outputs: &mut output,
            audio_inputs_count: 0,
            audio_outputs_count: 1,
            in_events: null(),
            out_events: null(),
        };
        assert_eq!(
            unsafe { (*self.plugin).process.unwrap()(self.plugin, &process) },
            CLAP_PROCESS_CONTINUE
        );
        pcm
    }
    fn save(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        let stream = clap_ostream {
            ctx: (&mut bytes as *mut Vec<u8>).cast(),
            write: Some(write),
        };
        assert!(unsafe { (*self.state).save.unwrap()(self.plugin, &stream) });
        bytes
    }
    fn pause(&self) {
        unsafe {
            (*self.plugin).stop_processing.unwrap()(self.plugin);
        }
    }
    fn resume(&self) {
        assert!(unsafe { (*self.plugin).start_processing.unwrap()(self.plugin) });
    }
    fn retire(&self) {
        unsafe {
            (*self.plugin).on_main_thread.unwrap()(self.plugin);
        }
    }
}
impl Drop for Hosted {
    fn drop(&mut self) {
        unsafe {
            (*self.plugin).stop_processing.unwrap()(self.plugin);
            (*self.plugin).deactivate.unwrap()(self.plugin);
            (*self.plugin).destroy.unwrap()(self.plugin);
            (*self.entry).deinit.unwrap()();
            libc::dlclose(self.library);
        }
    }
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 3 {
        return Err("expected LIBRARY RACK_PACKAGE INSTRUMENT_PACKAGE; set MANIFOLD_SCRIPT_SAMPLE_EVIDENCE_DIR".into());
    }
    let library = Path::new(&args[0]).canonicalize()?;
    LIBRARY.set(library.clone()).unwrap();
    let root = std::env::var_os("MANIFOLD_SCRIPT_SAMPLE_EVIDENCE_DIR")
        .ok_or("evidence directory required")?;
    let rack = std::fs::read(&args[1])?;
    let instrument = std::fs::read(&args[2])?;
    sample_suite::rack::<Hosted>("clap-sdk", &rack);
    sample_suite::instrument::<Hosted>("clap-sdk", &instrument);
    let manifest = json!({"library":library,"librarySha256":hash(&std::fs::read(&library)?),"rackPackageSha256":hash(&rack),"instrumentPackageSha256":hash(&instrument),"host":"exported CLAP factory and process ABI","editorOpened":false,"audioDeviceOpened":false,"heapCounters":"not observed across shared-library boundary; see separate release callback tests"});
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(Path::new(&root).join("clap-sdk/manifest.json"))?;
    file.write_all(&serde_json::to_vec_pretty(&manifest)?)?;
    println!("{}", serde_json::to_string_pretty(&manifest)?);
    Ok(())
}
