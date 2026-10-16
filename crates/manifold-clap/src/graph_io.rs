//! CLAP discovery is a projection of the saved project's buses, never a second
//! routing table. Ports can change only while deactivated and with host support.
use super::*;
use clap_sys::ext::audio_ports::*;
use clap_sys::ext::audio_ports_config::*;
use manifold_native::IoLayout;
use manifold_native::host_buffers::{RawInputs, RawOutputs};

// Opt-in host lifecycle diagnostics, called only by control/SDK entrypoints.
pub(super) fn trace(message: std::fmt::Arguments<'_>) {
    if std::env::var_os("MANIFOLD_CLAP_IO_TRACE").is_some() {
        eprintln!("Manifold CLAP I/O: {message}");
    }
}

/// A callback-scoped view of CLAP's own bus tables. No copied pointer table or
/// project-size quota is needed; IoHostBuffers owns the prepared sample copies.
pub(super) struct Channels<'a> {
    block: &'a clap_process,
}
impl<'a> Channels<'a> {
    /// The host keeps its bus and channel-pointer arrays valid for this callback.
    pub unsafe fn read(block: &'a clap_process, layout: &IoLayout) -> Option<Self> {
        if block.audio_inputs_count as usize != layout.inputs.len()
            || block.audio_outputs_count as usize != layout.outputs.len()
            || !layout.inputs.is_empty() && block.audio_inputs.is_null()
            || !layout.outputs.is_empty() && block.audio_outputs.is_null()
        {
            return None;
        }
        for (index, bus) in layout.inputs.iter().enumerate() {
            let source = unsafe { &*block.audio_inputs.add(index) };
            if source.channel_count == 0 && bus.optional && source.data64.is_null() {
                continue;
            }
            if source.channel_count as usize != bus.channels
                || !source.data64.is_null()
                || source.data32.is_null() && !bus.optional
            {
                return None;
            }
        }
        for (index, bus) in layout.outputs.iter().enumerate() {
            let destination = unsafe { &*block.audio_outputs.add(index) };
            if destination.channel_count as usize != bus.channels
                || destination.data32.is_null()
                || !destination.data64.is_null()
            {
                return None;
            }
            for channel in 0..bus.channels {
                if unsafe { *destination.data32.add(channel) }.is_null() {
                    return None;
                }
            }
        }
        Some(Self { block })
    }
}
impl RawInputs for Channels<'_> {
    fn bus_count(&self) -> usize {
        self.block.audio_inputs_count as usize
    }
    fn channel_count(&self, bus: usize) -> usize {
        assert!(bus < RawInputs::bus_count(self));
        let source = unsafe { &*self.block.audio_inputs.add(bus) };
        if source.data32.is_null() {
            0
        } else {
            source.channel_count as usize
        }
    }
    fn channel(&self, bus: usize, channel: usize) -> *const f32 {
        assert!(channel < RawInputs::channel_count(self, bus));
        unsafe { *(*self.block.audio_inputs.add(bus)).data32.add(channel) }
    }
}
impl RawOutputs for Channels<'_> {
    fn bus_count(&self) -> usize {
        self.block.audio_outputs_count as usize
    }
    fn channel_count(&self, bus: usize) -> usize {
        assert!(bus < RawOutputs::bus_count(self));
        unsafe { (*self.block.audio_outputs.add(bus)).channel_count as usize }
    }
    fn channel(&self, bus: usize, channel: usize) -> *mut f32 {
        assert!(channel < RawOutputs::channel_count(self, bus));
        unsafe { *(*self.block.audio_outputs.add(bus)).data32.add(channel) }
    }
}

pub(super) struct PortLayout {
    pub layout: Option<IoLayout>,
    pub inputs: Vec<clap_audio_port_info>,
    pub outputs: Vec<clap_audio_port_info>,
}

fn port_type(channels: usize) -> *const c_char {
    match channels {
        1 => CLAP_PORT_MONO.as_ptr(),
        2 => CLAP_PORT_STEREO.as_ptr(),
        _ => null(),
    }
}

fn info(id: u32, name: &str, channels: usize, index: usize, pair: u32) -> clap_audio_port_info {
    let mut result = clap_audio_port_info {
        id,
        name: [0; 256],
        flags: if index == 0 {
            CLAP_AUDIO_PORT_IS_MAIN
        } else {
            0
        },
        channel_count: channels as u32,
        port_type: port_type(channels),
        in_place_pair: pair,
    };
    for (destination, source) in result.name.iter_mut().take(255).zip(name.bytes()) {
        *destination = source as c_char;
    }
    result
}

impl PortLayout {
    pub fn new(layout: Option<&IoLayout>) -> Option<Self> {
        let Some(layout) = layout else {
            return Some(Self {
                layout: None,
                inputs: vec![
                    info(0, "Main In", 2, 0, 2),
                    info(1, "Sidechain", 2, 1, u32::MAX),
                ],
                outputs: vec![info(2, "Main Out", 2, 0, 0)],
            });
        };
        let ports = |buses: &[manifold_native::AudioBus]| -> Option<Vec<clap_audio_port_info>> {
            u32::try_from(buses.len()).ok()?;
            let mut result: Vec<clap_audio_port_info> = Vec::new();
            for (index, bus) in buses.iter().enumerate() {
                u32::try_from(bus.channels).ok()?;
                // Deterministic direction-local ID from the authored string.
                // Reject collisions rather than silently changing identities.
                let id = bus.id.bytes().fold(2166136261u32, |hash, byte| {
                    (hash ^ byte as u32).wrapping_mul(16777619)
                }) & 0x7fff_ffff;
                if result.iter().any(|port| port.id == id) {
                    return None;
                }
                result.push(info(id, &bus.name, bus.channels, index, u32::MAX));
            }
            Some(result)
        };
        Some(Self {
            inputs: ports(&layout.inputs)?,
            outputs: ports(&layout.outputs)?,
            layout: Some(layout.clone()),
        })
    }

    pub fn same_shape(&self, next: &Self) -> bool {
        match (&self.layout, &next.layout) {
            (None, None) => true,
            (Some(a), Some(b)) => a.inputs == b.inputs && a.outputs == b.outputs,
            _ => false,
        }
    }

    pub fn changes(&self, next: &Self) -> u32 {
        let mut flags = 0;
        for (previous, next) in [(&self.inputs, &next.inputs), (&self.outputs, &next.outputs)] {
            if previous.len() != next.len() || previous.iter().zip(next).any(|(a, b)| a.id != b.id)
            {
                flags |= CLAP_AUDIO_PORTS_RESCAN_LIST;
            }
            for (a, b) in previous.iter().zip(next) {
                if a.name != b.name {
                    flags |= CLAP_AUDIO_PORTS_RESCAN_NAMES;
                }
                if a.flags != b.flags {
                    flags |= CLAP_AUDIO_PORTS_RESCAN_FLAGS;
                }
                if a.channel_count != b.channel_count {
                    flags |= CLAP_AUDIO_PORTS_RESCAN_CHANNEL_COUNT;
                }
                if a.port_type != b.port_type {
                    flags |= CLAP_AUDIO_PORTS_RESCAN_PORT_TYPE;
                }
                if a.in_place_pair != b.in_place_pair {
                    flags |= CLAP_AUDIO_PORTS_RESCAN_IN_PLACE_PAIR;
                }
            }
        }
        flags
    }
}

impl Instance {
    pub(super) fn accepts_port_changes(&self, flags: u32) -> bool {
        if flags == 0 || self.host.is_null() {
            return true;
        }
        let Some(get) = (unsafe { (*self.host).get_extension }) else {
            return false;
        };
        let pointer = unsafe { get(self.host, CLAP_EXT_AUDIO_PORTS.as_ptr()) }
            as *const clap_host_audio_ports;
        if pointer.is_null() {
            return false;
        }
        let host = unsafe { &*pointer };
        let (Some(supported), Some(_)) = (host.is_rescan_flag_supported, host.rescan) else {
            return false;
        };
        let accepted =
            (0..6).all(|bit| flags & (1 << bit) == 0 || unsafe { supported(self.host, 1 << bit) });
        trace(format_args!("host port flags={flags} supported={accepted}"));
        accepted
    }
    pub(super) fn notify_port_changes(&self, flags: u32) {
        if flags == 0 || self.host.is_null() {
            return;
        }
        let Some(get) = (unsafe { (*self.host).get_extension }) else {
            return;
        };
        let ports = unsafe { get(self.host, CLAP_EXT_AUDIO_PORTS.as_ptr()) }
            as *const clap_host_audio_ports;
        if !ports.is_null() {
            if let Some(rescan) = unsafe { (*ports).rescan } {
                unsafe { rescan(self.host, flags) };
            }
        }
        let configs = unsafe { get(self.host, CLAP_EXT_AUDIO_PORTS_CONFIG.as_ptr()) }
            as *const clap_host_audio_ports_config;
        if !configs.is_null() {
            if let Some(rescan) = unsafe { (*configs).rescan } {
                unsafe { rescan(self.host) };
            }
        }
    }
}

pub(super) unsafe extern "C" fn count(plugin: *const clap_plugin, input: bool) -> u32 {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return 0;
    };
    instance.ports.lock().map(|ports| if input { ports.inputs.len() } else { ports.outputs.len() } as u32).unwrap_or(0)
}
pub(super) unsafe extern "C" fn port(
    plugin: *const clap_plugin,
    index: u32,
    input: bool,
    out: *mut clap_audio_port_info,
) -> bool {
    if out.is_null() {
        return false;
    }
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    let Ok(ports) = instance.ports.lock() else {
        return false;
    };
    let Some(value) = (if input { &ports.inputs } else { &ports.outputs }).get(index as usize)
    else {
        return false;
    };
    unsafe { *out = *value };
    true
}
unsafe extern "C" fn config_count(_plugin: *const clap_plugin) -> u32 {
    1
}
unsafe extern "C" fn config_get(
    plugin: *const clap_plugin,
    index: u32,
    out: *mut clap_audio_ports_config,
) -> bool {
    if index != 0 || out.is_null() {
        return false;
    }
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    let Ok(ports) = instance.ports.lock() else {
        return false;
    };
    let mut name = [0; 256];
    for (destination, source) in name.iter_mut().zip(b"Authored project") {
        *destination = *source as c_char;
    }
    let input = ports.inputs.first();
    let output = ports.outputs.first();
    unsafe {
        *out = clap_audio_ports_config {
            id: 0,
            name,
            input_port_count: ports.inputs.len() as u32,
            output_port_count: ports.outputs.len() as u32,
            has_main_input: input.is_some(),
            main_input_channel_count: input.map_or(0, |p| p.channel_count),
            main_input_port_type: input.map_or(null(), |p| p.port_type),
            has_main_output: output.is_some(),
            main_output_channel_count: output.map_or(0, |p| p.channel_count),
            main_output_port_type: output.map_or(null(), |p| p.port_type),
        }
    };
    true
}
unsafe extern "C" fn select(plugin: *const clap_plugin, id: u32) -> bool {
    id == 0
        && unsafe { get(plugin) }.is_some_and(|instance| !instance.active.load(Ordering::Acquire))
}
unsafe extern "C" fn current(_plugin: *const clap_plugin) -> u32 {
    0
}
unsafe extern "C" fn config_port(
    plugin: *const clap_plugin,
    id: u32,
    index: u32,
    input: bool,
    out: *mut clap_audio_port_info,
) -> bool {
    id == 0 && unsafe { port(plugin, index, input, out) }
}
pub(super) static CONFIG: clap_plugin_audio_ports_config = clap_plugin_audio_ports_config {
    count: Some(config_count),
    get: Some(config_get),
    select: Some(select),
};
pub(super) static CONFIG_INFO: clap_plugin_audio_ports_config_info =
    clap_plugin_audio_ports_config_info {
        current_config: Some(current),
        get: Some(config_port),
    };

#[cfg(test)]
mod tests {
    use super::super::tests::callback_heap;
    use super::*;
    use serde_json::{Value, json};

    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../manifold-native/tests/support/large_io.rs"
    ));

    #[test]
    fn clap_large_bus_shapes_render_and_reopen_without_callback_heap() {
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        for buses in [41, 42, 33] {
            let document = large_io_project(buses);
            assert!(instance.restore(serde_json::to_vec(&document).unwrap()));
            assert_eq!(unsafe { count(&instance.plugin, true) }, buses as u32);
            assert_eq!(port_info(&instance, 0, true).channel_count, 300);
            assert!(unsafe { activate(&instance.plugin, 48000., 1, 128) });
            assert!(unsafe { start(&instance.plugin) });
            let total = 300 + (buses - 1) * 9;
            let mut pcm = vec![vec![0.125; 17]; total];
            pcm[299].fill(-0.25);
            pcm[total - 1].fill(0.75);
            let mut input_ptrs: Vec<_> = pcm.iter_mut().map(|v| v.as_mut_ptr()).collect();
            let mut output = vec![vec![99.; 17]; total];
            let mut output_ptrs: Vec<_> = output.iter_mut().map(|v| v.as_mut_ptr()).collect();
            let make_buses = |pointers: &mut Vec<*mut f32>| {
                let mut offset = 0;
                (0..buses)
                    .map(|i| {
                        let channel_count = if i == 0 { 300 } else { 9 };
                        let result = clap_audio_buffer {
                            data32: unsafe { pointers.as_mut_ptr().add(offset) },
                            data64: null_mut(),
                            channel_count,
                            latency: 0,
                            constant_mask: 0,
                        };
                        offset += channel_count as usize;
                        result
                    })
                    .collect::<Vec<_>>()
            };
            let mut inputs = make_buses(&mut input_ptrs);
            let mut outputs = make_buses(&mut output_ptrs);
            let block = clap_process {
                steady_time: -1,
                frames_count: 17,
                transport: null(),
                audio_inputs: inputs.as_ptr(),
                audio_outputs: outputs.as_mut_ptr(),
                audio_inputs_count: buses as u32,
                audio_outputs_count: buses as u32,
                in_events: null(),
                out_events: null(),
            };
            for connected in [true, false, true] {
                inputs[buses - 1].channel_count = if connected { 9 } else { 0 };
                inputs[buses - 1].data32 = if connected {
                    unsafe { input_ptrs.as_mut_ptr().add(total - 9) }
                } else {
                    null_mut()
                };
                assert_eq!(
                    callback_heap::measure(|| unsafe { process(&instance.plugin, &block) }),
                    CLAP_PROCESS_CONTINUE
                );
                for (i, channel) in output.iter().enumerate() {
                    let expected = if i % 2 == 1 {
                        -0.25
                    } else if connected {
                        0.75
                    } else {
                        0.
                    };
                    assert!(
                        channel.iter().all(|v| *v == expected),
                        "bus shape {buses}, channel {i}"
                    );
                }
            }
            unsafe {
                stop(&instance.plugin);
                deactivate(&instance.plugin);
            }
        }
    }

    fn fixture() -> Value {
        let output = std::process::Command::new("node").current_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
            .args(["--input-type=module", "-e", "import {createArbitraryIoGraph} from './packages/manifold-author/examples/arbitrary-io.mjs';console.log(JSON.stringify(createArbitraryIoGraph().toProject()));"]).output().unwrap();
        assert!(output.status.success());
        serde_json::from_slice(&output.stdout).unwrap()
    }
    fn package() -> Vec<u8> {
        use sha2::{Digest, Sha256};
        let bundle =
            include_str!("../../../projects/graph-workspace/arbitrary-io-project.bundle.js");
        serde_json::to_vec(&json!({"format":"manifold.package", "schemaVersion":1, "packageId":"manifold.arbitrary-io", "packageVersion":"1.0.0",
            "control":{"language":"javascript","format":"iife","bundle":bundle,"sha256":format!("{:x}",Sha256::digest(bundle.as_bytes()))},"state":fixture()})).unwrap()
    }
    fn port_info(instance: &Instance, index: u32, input: bool) -> clap_audio_port_info {
        let mut value = info(0, "", 0, 0, u32::MAX);
        assert!(unsafe { port(&instance.plugin, index, input, &mut value) });
        value
    }
    fn render(
        instance: &Instance,
        absent: bool,
        malformed: bool,
    ) -> (clap_process_status, [[f32; 17]; 5]) {
        render_with_events(instance, absent, malformed, null())
    }
    fn render_with_events(
        instance: &Instance,
        absent: bool,
        malformed: bool,
        events: *const clap_input_events,
    ) -> (clap_process_status, [[f32; 17]; 5]) {
        // Deliberately alias every input with an output in different bus widths.
        let mut pcm = [[0.125; 17], [-0.25; 17], [0.375; 17], [-0.5; 17], [99.; 17]];
        let mut pointers = pcm.each_mut().map(|channel| channel.as_mut_ptr());
        let audio = |data32, channel_count| clap_audio_buffer {
            data32,
            data64: null_mut(),
            channel_count,
            latency: 0,
            constant_mask: 0,
        };
        let inputs = [
            audio(pointers.as_mut_ptr(), 3),
            audio(
                if absent {
                    null_mut()
                } else {
                    unsafe { pointers.as_mut_ptr().add(3) }
                },
                if absent { 0 } else { 1 },
            ),
        ];
        let mut outputs = [
            audio(pointers.as_mut_ptr(), if malformed { 3 } else { 4 }),
            audio(unsafe { pointers.as_mut_ptr().add(4) }, 1),
        ];
        let block = clap_process {
            steady_time: -1,
            frames_count: 17,
            transport: null(),
            audio_inputs: inputs.as_ptr(),
            audio_outputs: outputs.as_mut_ptr(),
            audio_inputs_count: 2,
            audio_outputs_count: 2,
            in_events: events,
            out_events: null(),
        };
        let status = callback_heap::measure(|| unsafe { process(&instance.plugin, &block) });
        (status, pcm)
    }
    #[test]
    fn clap_buses_discovery_in_place_render_live_script_rejection_and_recall() {
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        let bytes = package();
        assert!(instance.restore(bytes));
        assert_eq!(unsafe { count(&instance.plugin, true) }, 2);
        assert_eq!(unsafe { count(&instance.plugin, false) }, 2);
        let main = port_info(&instance, 0, true);
        let aux = port_info(&instance, 1, true);
        let stems = port_info(&instance, 0, false);
        let mono = port_info(&instance, 1, false);
        assert_eq!(
            [
                main.channel_count,
                aux.channel_count,
                stems.channel_count,
                mono.channel_count
            ],
            [3, 1, 4, 1]
        );
        assert!(main.port_type.is_null());
        assert!(stems.port_type.is_null());
        assert_eq!(mono.port_type, CLAP_PORT_MONO.as_ptr());
        assert_eq!(main.flags, CLAP_AUDIO_PORT_IS_MAIN);
        assert_eq!(aux.flags, 0);
        assert!(unsafe { activate(&instance.plugin, 48000., 1, 128) });
        assert!(unsafe { start(&instance.plugin) });
        assert!(!unsafe { select(&instance.plugin, 0) });
        assert_eq!(
            render(&instance, false, false).1.map(|c| c[0]),
            [0.125, -0.25, 0.375, -0.5, 0.0625]
        );
        assert_eq!(
            render(&instance, true, false).1.map(|c| c[0]),
            [0.125, -0.25, 0.375, 0., 0.0625]
        );
        for index in 0..6 {
            let generation = instance.scripted_call("swap", vec![]).unwrap();
            assert_eq!(instance.scripted_status(generation), 0);
            let (status, pcm) = render(&instance, false, true);
            assert_eq!(status, CLAP_PROCESS_ERROR);
            assert_eq!(pcm[4], [99.; 17]);
            assert_eq!(instance.scripted_status(generation), 0);
            let (status, pcm) = render(&instance, false, false);
            assert_eq!(status, CLAP_PROCESS_CONTINUE);
            assert_eq!(
                pcm.map(|c| c[0]),
                if index % 2 == 0 {
                    [-0.25, 0.125, 0.375, -0.5, 0.0625]
                } else {
                    [0.125, -0.25, 0.375, -0.5, 0.0625]
                }
            );
            assert_eq!(instance.scripted_status(generation), 1);
            instance.retire();
        }
        let before = instance.host_state_bytes().unwrap();
        assert!(
            instance
                .scripted_call("requestDifferentLayout", vec![])
                .is_err()
        );
        assert!(instance.scripted_call("requireAux", vec![]).is_err());
        assert_eq!(instance.host_state_bytes().unwrap(), before);
        unsafe {
            stop(&instance.plugin);
            deactivate(&instance.plugin);
        }
        let reopened = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(reopened.restore(before));
        assert_eq!(port_info(&reopened, 0, true).id, main.id);
        assert!(unsafe { activate(&reopened.plugin, 48000., 1, 128) });
        assert_eq!(
            render(&reopened, false, false).1.map(|c| c[0]),
            [0.125, -0.25, 0.375, -0.5, 0.0625]
        );
        reopened.deactivate();
    }
    #[test]
    fn clap_host_that_cannot_rescan_rejects_layout_without_changing_state() {
        let host = clap_host {
            clap_version: clap_sys::version::CLAP_VERSION,
            host_data: null_mut(),
            name: c"Fixed ports host".as_ptr(),
            vendor: c"test".as_ptr(),
            url: c"".as_ptr(),
            version: c"1".as_ptr(),
            get_extension: None,
            request_restart: None,
            request_process: None,
            request_callback: None,
        };
        let instance = Instance::new(&host, &crate::GRAPH_DESCRIPTOR);
        let before = instance.host_state_bytes().unwrap();
        assert!(!instance.restore(serde_json::to_vec(&fixture()).unwrap()));
        assert_eq!(instance.host_state_bytes().unwrap(), before);
        assert_eq!(port_info(&instance, 0, true).channel_count, 2);
    }
    #[test]
    fn clap_declared_buses_apply_host_automation_at_exact_offsets_and_flush() {
        use manifold_native::{InputBus, OutputBus};
        let mut document = fixture();
        document["hostBindings"] = json!([{"slot":0,"nodeId":12,"id":0}]);
        let bytes = serde_json::to_vec(&document).unwrap();
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(instance.restore(bytes.clone()));
        assert!(unsafe { activate(&instance.plugin, 48000., 1, 128) });
        let mut reference = NativeProject::parse(&bytes)
            .unwrap()
            .prepare(48000., 128)
            .unwrap();
        let event = |time, value| clap_event_param_value {
            header: clap_event_header {
                size: std::mem::size_of::<clap_event_param_value>() as u32,
                time,
                space_id: CLAP_CORE_EVENT_SPACE_ID,
                type_: CLAP_EVENT_PARAM_VALUE,
                flags: 0,
            },
            param_id: HOST_SLOT_BASE,
            cookie: null_mut(),
            note_id: -1,
            port_index: -1,
            channel: -1,
            key: -1,
            value,
        };
        let values = [event(7, 0.1), event(16, 0.4)];
        unsafe extern "C" fn size(_events: *const clap_input_events) -> u32 {
            2
        }
        unsafe extern "C" fn event_get(
            events: *const clap_input_events,
            index: u32,
        ) -> *const clap_event_header {
            if index >= 2 {
                return null();
            }
            let values = unsafe { &*((*events).ctx as *const [clap_event_param_value; 2]) };
            &values[index as usize].header
        }
        let input_events = clap_input_events {
            ctx: values.as_ptr() as *mut c_void,
            size: Some(size),
            get: Some(event_get),
        };
        let (status, actual) = render_with_events(&instance, false, false, &input_events);
        assert_eq!(status, CLAP_PROCESS_CONTINUE);
        let main = [[0.125; 17], [-0.25; 17], [0.375; 17]];
        let aux = [-0.5; 17];
        let channels = main.each_ref().map(|c| c.as_slice());
        let side = [aux.as_slice()];
        let mut expected = [[0.; 17]; 5];
        let [a, b, c, d, e] = &mut expected;
        let mut stems = [
            a.as_mut_slice(),
            b.as_mut_slice(),
            c.as_mut_slice(),
            d.as_mut_slice(),
        ];
        let mut mono = [e.as_mut_slice()];
        let points = [
            TimedAutomation {
                offset: 7,
                id: u64::from(HOST_SLOT_BASE),
                normalized: 0.1,
            },
            TimedAutomation {
                offset: 16,
                id: u64::from(HOST_SLOT_BASE),
                normalized: 0.4,
            },
        ];
        callback_heap::measure(|| {
            reference.process_io_host_automated(
                &[
                    InputBus {
                        channels: &channels,
                    },
                    InputBus { channels: &side },
                ],
                &mut [
                    OutputBus {
                        channels: &mut stems,
                    },
                    OutputBus {
                        channels: &mut mono,
                    },
                ],
                17,
                &[],
                &points,
            )
        })
        .unwrap();
        assert_eq!(actual, expected);
        assert_eq!(actual[0], [0.125; 17]);
        assert_eq!(actual[3], [-0.5; 17]);
        let zero = [event(0, 0.2), event(0, 0.3)];
        let flush_events = clap_input_events {
            ctx: zero.as_ptr() as *mut c_void,
            ..input_events
        };
        callback_heap::measure(|| unsafe { flush(&instance.plugin, &flush_events, null()) });
        callback_heap::measure(|| {
            reference.flush_host_automation(&[
                TimedAutomation {
                    offset: 0,
                    id: u64::from(HOST_SLOT_BASE),
                    normalized: 0.2,
                },
                TimedAutomation {
                    offset: 0,
                    id: u64::from(HOST_SLOT_BASE),
                    normalized: 0.3,
                },
            ])
        })
        .unwrap();
        assert_eq!(
            unsafe { &*instance.current.load(Ordering::Acquire) }
                .prepared
                .processor
                .current_parameter_values(),
            reference.current_parameter_values()
        );
        instance.deactivate();
    }
    #[test]
    fn clap_zero_input_generator_mono_and_discrete_outputs_then_no_outputs() {
        use manifold_native::{AudioBus, InputBinding, IoLayout, OutputChannel};
        let mut graph = manifold_native::author::GraphWorkspace::new();
        graph.add(20, "oscillator").unwrap();
        graph.set_parameter(20, 1, 440.).unwrap();
        graph.set_parameter(20, 2, 0.25).unwrap();
        let layout = IoLayout {
            version: 1,
            inputs: vec![],
            outputs: vec![
                AudioBus {
                    id: "mono".into(),
                    name: "Mono".into(),
                    channels: 1,
                    optional: false,
                },
                AudioBus {
                    id: "discrete".into(),
                    name: "Discrete".into(),
                    channels: 3,
                    optional: false,
                },
            ],
            input_bindings: vec![InputBinding {
                node: 1,
                channels: [None, None],
            }],
            output_bindings: vec![
                Some(OutputChannel {
                    node: 20,
                    port: 0,
                    channel: 0,
                }),
                Some(OutputChannel {
                    node: 20,
                    port: 0,
                    channel: 1,
                }),
                None,
                None,
            ],
        };
        graph.set_io_layout(layout.clone()).unwrap();
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(instance.restore(serde_json::to_vec(&graph.to_project().unwrap()).unwrap()));
        assert_eq!(unsafe { count(&instance.plugin, true) }, 0);
        assert!(unsafe { activate(&instance.plugin, 48000., 1, 128) });
        let mut pcm = [[99.; 17]; 4];
        let mut pointers = pcm.each_mut().map(|c| c.as_mut_ptr());
        let audio = |data32, channel_count| clap_audio_buffer {
            data32,
            data64: null_mut(),
            channel_count,
            latency: 0,
            constant_mask: 0,
        };
        let mut output = [
            audio(pointers.as_mut_ptr(), 1),
            audio(unsafe { pointers.as_mut_ptr().add(1) }, 3),
        ];
        let mut block = clap_process {
            steady_time: -1,
            frames_count: 17,
            transport: null(),
            audio_inputs: null(),
            audio_outputs: output.as_mut_ptr(),
            audio_inputs_count: 0,
            audio_outputs_count: 2,
            in_events: null(),
            out_events: null(),
        };
        assert_eq!(
            callback_heap::measure(|| unsafe { process(&instance.plugin, &block) }),
            CLAP_PROCESS_CONTINUE
        );
        assert!(pcm[0].iter().any(|v| v.abs() > 0.01));
        assert_eq!(pcm[0], pcm[1]);
        assert_eq!(pcm[2], [0.; 17]);
        assert_eq!(pcm[3], [0.; 17]);
        instance.deactivate();
        let mut empty = layout;
        empty.outputs.clear();
        empty.output_bindings.clear();
        graph.set_io_layout(empty).unwrap();
        assert!(instance.restore(serde_json::to_vec(&graph.to_project().unwrap()).unwrap()));
        assert_eq!(unsafe { count(&instance.plugin, false) }, 0);
        assert!(unsafe { activate(&instance.plugin, 48000., 1, 128) });
        block.audio_outputs = null_mut();
        block.audio_outputs_count = 0;
        assert_eq!(
            callback_heap::measure(|| unsafe { process(&instance.plugin, &block) }),
            CLAP_PROCESS_CONTINUE
        );
        instance.deactivate();
    }
}
