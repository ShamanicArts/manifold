//! Loadable CLAP adapter for the authored Standalone FX project.

mod instance;

use std::ffi::{CStr, c_char, c_void};
use std::ptr::null;

use clap_sys::entry::clap_plugin_entry;
use clap_sys::ext::audio_ports::{
    CLAP_AUDIO_PORT_IS_MAIN, CLAP_EXT_AUDIO_PORTS, CLAP_PORT_STEREO, clap_audio_port_info,
    clap_plugin_audio_ports,
};
use clap_sys::ext::params::{
    CLAP_EXT_PARAMS, CLAP_PARAM_IS_AUTOMATABLE, CLAP_PARAM_IS_ENUM, CLAP_PARAM_IS_STEPPED,
    clap_param_info, clap_plugin_params,
};
use clap_sys::ext::state::{CLAP_EXT_STATE, clap_plugin_state};
use clap_sys::factory::plugin_factory::{CLAP_PLUGIN_FACTORY_ID, clap_plugin_factory};
use clap_sys::host::clap_host;
use clap_sys::plugin::{clap_plugin, clap_plugin_descriptor};
use clap_sys::plugin_features::{CLAP_PLUGIN_FEATURE_AUDIO_EFFECT, CLAP_PLUGIN_FEATURE_STEREO};
use clap_sys::version::{CLAP_VERSION, clap_version_is_compatible};

pub(crate) const SOURCE_PROJECT: &[u8] =
    include_bytes!("../../../projects/standalone-fx-module/project.json");
pub(crate) const TYPE_LABELS: [&str; 21] = [
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
pub(crate) const DEFAULTS: [f32; 7] = [0., 0., 0.5, 0.5, 0.2, 0.6, 0.4];
const ID: &CStr = c"arts.shamanic.manifold.standalone-fx";
const PARAM_LABELS: [&str; 7] = [
    "Effect type",
    "Wet mix",
    "Param 1",
    "Param 2",
    "Param 3",
    "Param 4",
    "Param 5",
];

struct Features([*const c_char; 3]);
unsafe impl Sync for Features {}
static FEATURES: Features = Features([
    CLAP_PLUGIN_FEATURE_AUDIO_EFFECT.as_ptr(),
    CLAP_PLUGIN_FEATURE_STEREO.as_ptr(),
    null(),
]);
static DESCRIPTOR: clap_plugin_descriptor = clap_plugin_descriptor {
    clap_version: CLAP_VERSION,
    id: ID.as_ptr(),
    name: c"Manifold Standalone FX".as_ptr(),
    vendor: c"Shamanic Arts".as_ptr(),
    url: c"https://github.com/ShamanicArts/manifold".as_ptr(),
    manual_url: c"https://github.com/ShamanicArts/manifold".as_ptr(),
    support_url: c"https://github.com/ShamanicArts/manifold/issues".as_ptr(),
    version: c"0.1.0".as_ptr(),
    description: c"Standalone FX with a Rust audio engine".as_ptr(),
    features: FEATURES.0.as_ptr(),
};

unsafe extern "C" fn port_count(_plugin: *const clap_plugin, _input: bool) -> u32 {
    1
}
unsafe extern "C" fn port_info(
    _plugin: *const clap_plugin,
    index: u32,
    input: bool,
    info: *mut clap_audio_port_info,
) -> bool {
    if index != 0 || info.is_null() {
        return false;
    }
    let info = unsafe { &mut *info };
    info.id = if input { 0 } else { 1 };
    info.name.fill(0);
    let label: &[u8] = if input { b"Main In" } else { b"Main Out" };
    for (target, source) in info.name.iter_mut().zip(label.iter()) {
        *target = *source as c_char;
    }
    info.flags = CLAP_AUDIO_PORT_IS_MAIN;
    info.channel_count = 2;
    info.port_type = CLAP_PORT_STEREO.as_ptr();
    info.in_place_pair = if input { 1 } else { 0 };
    true
}

unsafe extern "C" fn param_count(_plugin: *const clap_plugin) -> u32 {
    7
}
unsafe extern "C" fn param_info(
    _plugin: *const clap_plugin,
    index: u32,
    info: *mut clap_param_info,
) -> bool {
    if index >= 7 || info.is_null() {
        return false;
    }
    let info = unsafe { &mut *info };
    info.id = index;
    info.flags = CLAP_PARAM_IS_AUTOMATABLE
        | if index == 0 {
            CLAP_PARAM_IS_STEPPED | CLAP_PARAM_IS_ENUM
        } else {
            0
        };
    info.cookie = std::ptr::null_mut();
    info.name.fill(0);
    info.module.fill(0);
    for (target, source) in info
        .name
        .iter_mut()
        .zip(PARAM_LABELS[index as usize].bytes())
    {
        *target = source as c_char;
    }
    info.min_value = 0.;
    info.max_value = if index == 0 { 20. } else { 1. };
    info.default_value = DEFAULTS[index as usize] as f64;
    true
}

static AUDIO_PORTS: clap_plugin_audio_ports = clap_plugin_audio_ports {
    count: Some(port_count),
    get: Some(port_info),
};
static PARAMS: clap_plugin_params = clap_plugin_params {
    count: Some(param_count),
    get_info: Some(param_info),
    get_value: Some(instance::param_value),
    value_to_text: Some(instance::param_to_text),
    text_to_value: Some(instance::text_to_param),
    flush: Some(instance::param_flush),
};
static STATE: clap_plugin_state = clap_plugin_state {
    save: Some(instance::state_save),
    load: Some(instance::state_load),
};

unsafe extern "C" fn plugin_extension(
    _plugin: *const clap_plugin,
    id: *const c_char,
) -> *const c_void {
    if id.is_null() {
        return null();
    }
    let id = unsafe { CStr::from_ptr(id) };
    if id == CLAP_EXT_AUDIO_PORTS {
        &AUDIO_PORTS as *const _ as *const c_void
    } else if id == CLAP_EXT_PARAMS {
        &PARAMS as *const _ as *const c_void
    } else if id == CLAP_EXT_STATE {
        &STATE as *const _ as *const c_void
    } else {
        null()
    }
}

unsafe extern "C" fn factory_count(_factory: *const clap_plugin_factory) -> u32 {
    1
}
unsafe extern "C" fn factory_descriptor(
    _factory: *const clap_plugin_factory,
    index: u32,
) -> *const clap_plugin_descriptor {
    if index == 0 { &DESCRIPTOR } else { null() }
}
unsafe extern "C" fn factory_create(
    _factory: *const clap_plugin_factory,
    host: *const clap_host,
    id: *const c_char,
) -> *const clap_plugin {
    if host.is_null()
        || id.is_null()
        || !clap_version_is_compatible(unsafe { (*host).clap_version })
        || unsafe { CStr::from_ptr(id) } != ID
    {
        return null();
    }
    let instance = Box::into_raw(instance::Instance::new(host, &DESCRIPTOR, plugin_extension));
    unsafe { &(*instance).plugin }
}

struct Factory(clap_plugin_factory);
unsafe impl Sync for Factory {}
static FACTORY: Factory = Factory(clap_plugin_factory {
    get_plugin_count: Some(factory_count),
    get_plugin_descriptor: Some(factory_descriptor),
    create_plugin: Some(factory_create),
});

unsafe extern "C" fn entry_init(_path: *const c_char) -> bool {
    true
}
unsafe extern "C" fn entry_deinit() {}
unsafe extern "C" fn entry_factory(id: *const c_char) -> *const c_void {
    if id.is_null() {
        return null();
    }
    if unsafe { CStr::from_ptr(id) } == CLAP_PLUGIN_FACTORY_ID {
        &FACTORY.0 as *const _ as *const c_void
    } else {
        null()
    }
}

#[repr(transparent)]
pub struct Entry(clap_plugin_entry);
unsafe impl Sync for Entry {}
#[unsafe(no_mangle)]
pub static clap_entry: Entry = Entry(clap_plugin_entry {
    clap_version: CLAP_VERSION,
    init: Some(entry_init),
    deinit: Some(entry_deinit),
    get_factory: Some(entry_factory),
});

#[cfg(test)]
mod tests {
    use super::*;
    use clap_sys::audio_buffer::clap_audio_buffer;
    use clap_sys::events::{
        CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_PARAM_VALUE, clap_event_header,
        clap_event_param_value, clap_input_events,
    };
    use clap_sys::process::{CLAP_PROCESS_CONTINUE, clap_process};
    use clap_sys::stream::{clap_istream, clap_ostream};
    use manifold_native::host_buffers::{HostBuffers, RawHostBlock};
    use manifold_native::parameters::{HOST_SLOT_BASE, TimedAutomation};
    use manifold_native::project::NativeProject;
    use std::ptr::{null, null_mut};

    unsafe extern "C" fn event_count(_events: *const clap_input_events) -> u32 {
        1
    }
    unsafe extern "C" fn event_get(
        events: *const clap_input_events,
        _index: u32,
    ) -> *const clap_event_header {
        unsafe { (*events).ctx as *const clap_event_header }
    }

    unsafe extern "C" fn write_state(
        stream: *const clap_ostream,
        data: *const c_void,
        size: u64,
    ) -> i64 {
        let bytes = unsafe { &mut *((*stream).ctx as *mut Vec<u8>) };
        bytes.extend_from_slice(unsafe {
            std::slice::from_raw_parts(data as *const u8, size as usize)
        });
        size as i64
    }

    struct StateReader<'a> {
        bytes: &'a [u8],
        offset: usize,
    }
    unsafe extern "C" fn read_state(
        stream: *const clap_istream,
        data: *mut c_void,
        size: u64,
    ) -> i64 {
        let reader = unsafe { &mut *((*stream).ctx as *mut StateReader<'_>) };
        let count = (size as usize).min(reader.bytes.len() - reader.offset);
        unsafe {
            std::ptr::copy_nonoverlapping(
                reader.bytes.as_ptr().add(reader.offset),
                data as *mut u8,
                count,
            )
        };
        reader.offset += count;
        count as i64
    }

    #[test]
    fn inactive_host_flush_retains_each_effects_controls() {
        let host = clap_host {
            clap_version: CLAP_VERSION,
            host_data: null_mut(),
            name: c"Test host".as_ptr(),
            vendor: c"Manifold".as_ptr(),
            url: c"https://example.test".as_ptr(),
            version: c"1".as_ptr(),
            get_extension: None,
            request_restart: None,
            request_process: None,
            request_callback: None,
        };
        let plugin = unsafe { factory_create(&FACTORY.0, &host, ID.as_ptr()) };
        assert!(unsafe { (*plugin).init.unwrap()(plugin) });
        let flush = |id, value| {
            let event = clap_event_param_value {
                header: clap_event_header {
                    size: std::mem::size_of::<clap_event_param_value>() as u32,
                    time: 0,
                    space_id: CLAP_CORE_EVENT_SPACE_ID,
                    type_: CLAP_EVENT_PARAM_VALUE,
                    flags: 0,
                },
                param_id: id,
                cookie: null_mut(),
                note_id: -1,
                port_index: -1,
                channel: -1,
                key: -1,
                value,
            };
            let events = clap_input_events {
                ctx: &event as *const _ as *mut c_void,
                size: Some(event_count),
                get: Some(event_get),
            };
            unsafe { PARAMS.flush.unwrap()(plugin, &events, null()) };
        };
        flush(2, 0.81);
        flush(0, 7.);
        flush(2, 0.19);
        flush(0, 0.);
        let mut public = -1.;
        assert!(unsafe { PARAMS.get_value.unwrap()(plugin, 2, &mut public) });
        assert!((public - 0.81).abs() < 1e-6);
        let mut bytes = Vec::new();
        let stream = clap_ostream {
            ctx: &mut bytes as *mut _ as *mut c_void,
            write: Some(write_state),
        };
        assert!(unsafe { STATE.save.unwrap()(plugin, &stream) });
        let doc: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert!((doc["typeParameters"]["7"][0].as_f64().unwrap() - 0.19).abs() < 1e-6);
        assert!(unsafe { (*plugin).activate.unwrap()(plugin, 48_000., 1, 128) });
        flush(0, 7.);
        assert!(unsafe { PARAMS.get_value.unwrap()(plugin, 2, &mut public) });
        assert!((public - 0.19).abs() < 1e-6);
        unsafe {
            (*plugin).deactivate.unwrap()(plugin);
            (*plugin).destroy.unwrap()(plugin);
        }
    }

    #[test]
    fn clap_audio_matches_native_project_with_host_automation() {
        let host = clap_host {
            clap_version: CLAP_VERSION,
            host_data: null_mut(),
            name: c"Test host".as_ptr(),
            vendor: c"Manifold".as_ptr(),
            url: c"https://example.test".as_ptr(),
            version: c"1".as_ptr(),
            get_extension: None,
            request_restart: None,
            request_process: None,
            request_callback: None,
        };
        let plugin = unsafe { factory_create(&FACTORY.0, &host, ID.as_ptr()) };
        assert!(!plugin.is_null());
        assert!(unsafe { (*plugin).init.unwrap()(plugin) });
        assert!(unsafe { (*plugin).activate.unwrap()(plugin, 48_000., 1, 128) });
        assert!(unsafe { (*plugin).start_processing.unwrap()(plugin) });
        let mut left = [0.3f32; 128];
        let mut right = [-0.2f32; 128];
        let mut out_left = [0f32; 128];
        let mut out_right = [0f32; 128];
        let mut input_channels = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut output_channels = [out_left.as_mut_ptr(), out_right.as_mut_ptr()];
        let input = clap_audio_buffer {
            data32: input_channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let mut output = clap_audio_buffer {
            data32: output_channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let event = clap_event_param_value {
            header: clap_event_header {
                size: std::mem::size_of::<clap_event_param_value>() as u32,
                time: 0,
                space_id: CLAP_CORE_EVENT_SPACE_ID,
                type_: CLAP_EVENT_PARAM_VALUE,
                flags: 0,
            },
            param_id: 1,
            cookie: null_mut(),
            note_id: -1,
            port_index: -1,
            channel: -1,
            key: -1,
            value: 0.8,
        };
        let events = clap_input_events {
            ctx: &event as *const _ as *mut c_void,
            size: Some(event_count),
            get: Some(event_get),
        };
        let process = clap_process {
            steady_time: 0,
            frames_count: 128,
            transport: null(),
            audio_inputs: &input,
            audio_outputs: &mut output,
            audio_inputs_count: 1,
            audio_outputs_count: 1,
            in_events: &events,
            out_events: null(),
        };
        assert_eq!(
            unsafe { (*plugin).process.unwrap()(plugin, &process) },
            CLAP_PROCESS_CONTINUE
        );

        let mut native = NativeProject::parse_fx_module(SOURCE_PROJECT)
            .unwrap()
            .prepare(48_000., 128)
            .unwrap();
        let mut buffers = HostBuffers::prepare(128);
        let mut reference_left = [0f32; 128];
        let mut reference_right = [0f32; 128];
        let automation = [TimedAutomation {
            offset: 0,
            id: HOST_SLOT_BASE + 1,
            normalized: 0.8,
        }];
        // SAFETY: These arrays are live for the full synchronous render.
        unsafe {
            buffers
                .render(
                    &mut native,
                    RawHostBlock {
                        frames: 128,
                        main: [left.as_ptr(), right.as_ptr()],
                        sidechain: [null(); 2],
                        output: [reference_left.as_mut_ptr(), reference_right.as_mut_ptr()],
                        events: &[],
                        automation: &automation,
                    },
                )
                .unwrap();
        }
        assert_eq!(out_left, reference_left);
        assert_eq!(out_right, reference_right);
        let flush_parameter = |id: u32, value: f64| {
            let mut event = event;
            event.param_id = id;
            event.value = value;
            let events = clap_input_events {
                ctx: &event as *const _ as *mut c_void,
                size: Some(event_count),
                get: Some(event_get),
            };
            unsafe { PARAMS.flush.unwrap()(plugin, &events, null()) };
        };
        let public_value = |id: u32| {
            let mut value = -1.;
            assert!(unsafe { PARAMS.get_value.unwrap()(plugin, id, &mut value) });
            value
        };
        flush_parameter(2, 0.87);
        flush_parameter(0, 7.);
        assert_eq!(public_value(2), 0.5); // Reverb's first control.
        flush_parameter(2, 0.13);
        flush_parameter(0, 0.);
        assert!((public_value(2) - 0.87).abs() < 1e-6);
        let mut saved = Vec::new();
        let output_stream = clap_ostream {
            ctx: &mut saved as *mut _ as *mut c_void,
            write: Some(write_state),
        };
        assert!(unsafe { STATE.save.unwrap()(plugin, &output_stream) });
        let saved_document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        assert!((saved_document["typeParameters"]["0"][0].as_f64().unwrap() - 0.87).abs() < 1e-6);
        assert!((saved_document["typeParameters"]["7"][0].as_f64().unwrap() - 0.13).abs() < 1e-6);
        unsafe { (*plugin).reset.unwrap()(plugin) };
        assert!((public_value(2) - 0.87).abs() < 1e-6);
        unsafe {
            (*plugin).stop_processing.unwrap()(plugin);
            (*plugin).deactivate.unwrap()(plugin);
            (*plugin).destroy.unwrap()(plugin);
        }
        let reopened = unsafe { factory_create(&FACTORY.0, &host, ID.as_ptr()) };
        assert!(unsafe { (*reopened).init.unwrap()(reopened) });
        let mut reader = StateReader {
            bytes: &saved,
            offset: 0,
        };
        let input_stream = clap_istream {
            ctx: &mut reader as *mut _ as *mut c_void,
            read: Some(read_state),
        };
        assert!(unsafe { STATE.load.unwrap()(reopened, &input_stream) });
        assert!(unsafe { (*reopened).activate.unwrap()(reopened, 48_000., 1, 128) });
        let restored = |id: u32| {
            let mut value = -1.;
            assert!(unsafe { PARAMS.get_value.unwrap()(reopened, id, &mut value) });
            value
        };
        assert!((restored(2) - 0.87).abs() < 1e-6);
        let mut event = event;
        event.param_id = 0;
        event.value = 7.;
        let events = clap_input_events {
            ctx: &event as *const _ as *mut c_void,
            size: Some(event_count),
            get: Some(event_get),
        };
        unsafe { PARAMS.flush.unwrap()(reopened, &events, null()) };
        assert!((restored(2) - 0.13).abs() < 1e-6);
        unsafe {
            (*reopened).deactivate.unwrap()(reopened);
            (*reopened).destroy.unwrap()(reopened);
        }
    }
}
