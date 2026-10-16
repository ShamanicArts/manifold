use manifold_core::events::{EventKind, TimedEvent};
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use manifold_native::author::GraphWorkspace;
use manifold_native::project::NativeProject;
use manifold_native::{
    AudioBus, InputBinding, InputBus, InputChannel, IoLayout, NativeProcessor, OutputBus,
    OutputChannel,
};
use serde_json::Value;
mod callback_heap {
    include!("support/callback_heap.rs");
}

fn fixture() -> Value {
    let output = std::process::Command::new("node").current_dir(concat!(env!("CARGO_MANIFEST_DIR"),"/../.."))
        .args(["--input-type=module","-e","import {createArbitraryIoGraph} from './packages/manifold-author/examples/arbitrary-io.mjs';console.log(JSON.stringify(createArbitraryIoGraph().toProject()));"])
        .output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn explicit_bus_host_automation_matches_stereo_at_every_sample_and_rejects_before_mutation() {
    use manifold_native::parameters::{HOST_SLOT_BASE, TimedAutomation};
    use manifold_native::{AudioBlock, NativeError};
    let mut graph = GraphWorkspace::new();
    graph.add(12, "gain").unwrap();
    graph.set_parameter(12, 0, 0.5).unwrap();
    graph.connect(1, "out", 12, "audio").unwrap();
    graph.connect(12, "out", 3, "in").unwrap();
    graph.bind_host_slot(0, 12, 0).unwrap();
    let legacy = graph.to_project().unwrap();
    graph
        .set_io_layout(IoLayout {
            version: 1,
            inputs: vec![AudioBus {
                id: "three".into(),
                name: "Three channels".into(),
                channels: 3,
                optional: false,
            }],
            outputs: vec![AudioBus {
                id: "mono".into(),
                name: "Mono".into(),
                channels: 1,
                optional: false,
            }],
            input_bindings: vec![InputBinding {
                node: 1,
                channels: [
                    Some(InputChannel { bus: 0, channel: 0 }),
                    Some(InputChannel { bus: 0, channel: 2 }),
                ],
            }],
            output_bindings: vec![Some(OutputChannel {
                node: 12,
                port: 0,
                channel: 0,
            })],
        })
        .unwrap();
    let prepare = |document: Value| {
        NativeProject::parse(&serde_json::to_vec(&document).unwrap())
            .unwrap()
            .prepare(48000., 128)
            .unwrap()
    };
    let mut stereo = prepare(legacy);
    let mut explicit = prepare(graph.to_project().unwrap());
    let main = [[0.125; 128], [-0.25; 128], [0.375; 128]];
    let inputs = [main[0].as_slice(), main[1].as_slice(), main[2].as_slice()];
    let mut pcm = [99.; 128];
    let mut left = [99.; 128];
    let mut right = [99.; 128];
    for points in [
        vec![
            TimedAutomation {
                offset: 0,
                id: u64::from(HOST_SLOT_BASE),
                normalized: 0.1,
            },
            TimedAutomation {
                offset: 7,
                id: u64::from(HOST_SLOT_BASE),
                normalized: 0.8,
            },
            TimedAutomation {
                offset: 127,
                id: u64::from(HOST_SLOT_BASE),
                normalized: 0.4,
            },
        ],
        vec![],
    ] {
        callback_heap::measure(|| {
            stereo.process_host_automated(
                AudioBlock {
                    main: Some([&main[0], &main[2]]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                },
                &points,
            )
        })
        .unwrap();
        let mut channels = [pcm.as_mut_slice()];
        callback_heap::measure(|| {
            explicit.process_io_host_automated(
                &[InputBus { channels: &inputs }],
                &mut [OutputBus {
                    channels: &mut channels,
                }],
                128,
                &[],
                &points,
            )
        })
        .unwrap();
        assert_eq!(pcm, left);
        assert_eq!(
            explicit.current_parameter_values(),
            stereo.current_parameter_values()
        );
    }
    let values = explicit.current_parameter_values().to_vec();
    pcm.fill(99.);
    for points in [
        vec![
            TimedAutomation {
                offset: 0,
                id: u64::from(HOST_SLOT_BASE),
                normalized: 0.9,
            },
            TimedAutomation {
                offset: 128,
                id: u64::from(HOST_SLOT_BASE),
                normalized: 0.4,
            },
        ],
        vec![
            TimedAutomation {
                offset: 1,
                id: u64::from(HOST_SLOT_BASE),
                normalized: 0.5,
            },
            TimedAutomation {
                offset: 0,
                id: u64::from(HOST_SLOT_BASE),
                normalized: 0.5,
            },
        ],
    ] {
        let mut channels = [pcm.as_mut_slice()];
        assert!(matches!(
            callback_heap::measure(|| explicit.process_io_host_automated(
                &[InputBus { channels: &inputs }],
                &mut [OutputBus {
                    channels: &mut channels
                }],
                128,
                &[],
                &points
            )),
            Err(NativeError::Automation(_))
        ));
        assert_eq!(pcm, [99.; 128]);
        assert_eq!(explicit.current_parameter_values(), values);
    }
    callback_heap::measure(|| {
        explicit.flush_host_automation(&[TimedAutomation {
            offset: 0,
            id: u64::from(HOST_SLOT_BASE),
            normalized: 0.2,
        }])
    })
    .unwrap();
    assert_ne!(explicit.current_parameter_values(), values);
}

#[test]
fn authored_asymmetric_buses_preserve_channel_identity_recall_and_reject_bad_blocks() {
    let document = fixture();
    let graph = GraphWorkspace::from_project(&document).unwrap();
    assert_eq!(graph.to_project().unwrap(), document);
    let mut authored = GraphWorkspace::new();
    authored.add(10, "input.raw").unwrap();
    authored.add(12, "gain").unwrap();
    authored.set_parameter(12, 0, 0.5).unwrap();
    authored.connect(1, "out", 12, "audio").unwrap();
    authored
        .set_io_layout(graph.io_layout().unwrap().clone())
        .unwrap();
    assert_eq!(authored.to_project().unwrap(), document);
    let bytes = serde_json::to_vec(&document).unwrap();
    let mut prepared = NativeProject::parse(&bytes)
        .unwrap()
        .prepare_patchable_with_state(48000., 128)
        .unwrap();
    for absent in [false, true] {
        for frames in [17, 128] {
            let a = vec![0.125; frames];
            let b = vec![-0.25; frames];
            let c = vec![0.375; frames];
            let d = vec![-0.5; frames];
            let main = [a.as_slice(), b.as_slice(), c.as_slice()];
            let aux = [d.as_slice()];
            let inputs = [
                InputBus { channels: &main },
                InputBus {
                    channels: if absent { &[] } else { &aux },
                },
            ];
            let mut tape = vec![vec![99.; frames]; 5];
            let (stems, mono) = tape.split_at_mut(4);
            let mut stems: Vec<_> = stems.iter_mut().map(Vec::as_mut_slice).collect();
            let mut mono = [mono[0].as_mut_slice()];
            callback_heap::measure(|| {
                prepared.processor.process_io(
                    &inputs,
                    &mut [
                        OutputBus {
                            channels: &mut stems,
                        },
                        OutputBus {
                            channels: &mut mono,
                        },
                    ],
                    frames,
                    &[],
                )
            })
            .unwrap();
            for (channel, value) in [0.125, -0.25, 0.375, if absent { 0. } else { -0.5 }, 0.0625]
                .iter()
                .enumerate()
            {
                assert!(
                    tape[channel].iter().all(|sample| sample == value),
                    "channel {channel}"
                );
            }
        }
    }
    let saved = prepared.save_state().unwrap();
    let mut recalled = NativeProject::parse(&saved)
        .unwrap()
        .prepare(48000., 128)
        .unwrap();
    assert_eq!(recalled.io_layout(), prepared.processor.io_layout());
    let short = [0.; 17];
    let malformed = [short.as_slice(), short.as_slice()];
    let mut out = [99.; 17];
    let mut channels = [out.as_mut_slice()];
    let result = callback_heap::measure(|| {
        recalled.process_io(
            &[
                InputBus {
                    channels: &malformed,
                },
                InputBus { channels: &[] },
            ],
            &mut [OutputBus {
                channels: &mut channels,
            }],
            17,
            &[],
        )
    });
    assert!(result.is_err());
    assert_eq!(out, [99.; 17]);
    let mut staged = graph.clone();
    assert!(staged.remove(10).is_err());
    assert_eq!(staged.to_project().unwrap(), document);
}

#[test]
fn live_reordering_remaps_all_output_roots_without_allocating_or_losing_routes() {
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 2,
                kind: NodeKind::Gain { gain: 1. },
            },
            NodeSpec {
                id: 9,
                kind: NodeKind::Constant { value: 0.25 },
            },
        ],
        connections: vec![],
    };
    let layout = IoLayout {
        version: 1,
        inputs: vec![],
        outputs: vec![AudioBus {
            id: "mono".into(),
            name: "Mono".into(),
            channels: 1,
            optional: false,
        }],
        input_bindings: vec![],
        output_bindings: vec![Some(OutputChannel {
            node: 2,
            port: 0,
            channel: 0,
        })],
    };
    let mut plan = graph.compile_with_io(48000., 17, true, &layout).unwrap();
    let mut output = [99.; 17];
    callback_heap::measure(|| plan.process_io_planar(&[], &mut output, 17, 17, &[])).unwrap();
    assert_eq!(output, [0.; 17]);
    callback_heap::measure(|| plan.set_route(2, 0, Some(9))).unwrap();
    callback_heap::measure(|| plan.process_io_planar(&[], &mut output, 17, 17, &[])).unwrap();
    assert_eq!(output, [0.25; 17]);
    callback_heap::measure(|| plan.set_route(2, 0, None)).unwrap();
    callback_heap::measure(|| plan.process_io_planar(&[], &mut output, 17, 17, &[])).unwrap();
    assert_eq!(output, [0.; 17]);
}

#[test]
fn generator_zero_input_and_explicit_silence_do_not_need_a_stereo_output_node() {
    let graph = GraphDescription {
        nodes: vec![NodeSpec {
            id: 7,
            kind: NodeKind::Constant { value: 0.25 },
        }],
        connections: vec![],
    };
    let layout = IoLayout {
        version: 1,
        inputs: vec![],
        outputs: vec![AudioBus {
            id: "out".into(),
            name: "Mono".into(),
            channels: 1,
            optional: false,
        }],
        input_bindings: vec![],
        output_bindings: vec![Some(OutputChannel {
            node: 7,
            port: 0,
            channel: 1,
        })],
    };
    let mut processor =
        NativeProcessor::prepare_with_io(&graph, &layout, 48000., 17, true).unwrap();
    let mut output = [0.; 17];
    let mut channels = [output.as_mut_slice()];
    callback_heap::measure(|| {
        processor.process_io(
            &[],
            &mut [OutputBus {
                channels: &mut channels,
            }],
            17,
            &[],
        )
    })
    .unwrap();
    assert_eq!(output, [0.25; 17]);
    let empty = IoLayout {
        outputs: vec![],
        output_bindings: vec![],
        ..layout
    };
    let mut processor =
        NativeProcessor::prepare_with_io(&graph, &empty, 48000., 17, false).unwrap();
    callback_heap::measure(|| processor.process_io(&[], &mut [], 17, &[])).unwrap();
}

#[test]
fn zero_input_timed_instrument_matches_legacy_execution_across_event_spans() {
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::MidiInput,
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::VoiceSynth,
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![
            Connection {
                from: 1,
                to: 2,
                input_port: 0,
                output_port: 0,
            },
            Connection {
                from: 2,
                to: 3,
                input_port: 0,
                output_port: 0,
            },
        ],
    };
    let layout = IoLayout {
        version: 1,
        inputs: vec![],
        outputs: vec![AudioBus {
            id: "instrument".into(),
            name: "Instrument".into(),
            channels: 2,
            optional: false,
        }],
        input_bindings: vec![],
        output_bindings: vec![
            Some(OutputChannel {
                node: 2,
                port: 0,
                channel: 0,
            }),
            Some(OutputChannel {
                node: 2,
                port: 0,
                channel: 1,
            }),
        ],
    };
    let mut io = graph.compile_with_io(48000., 128, true, &layout).unwrap();
    let mut legacy = graph.compile_patchable(48000., 128).unwrap();
    let events = [
        TimedEvent {
            node: 1,
            offset: 17,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        },
        TimedEvent {
            node: 1,
            offset: 100,
            kind: EventKind::NoteOff {
                channel: 0,
                note: 60,
            },
        },
    ];
    let mut output = [0.; 256];
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    let silence = [0.; 128];
    callback_heap::measure(|| io.process_io_planar(&[], &mut output, 128, 128, &events)).unwrap();
    callback_heap::measure(|| {
        legacy.process_with_events([&silence, &silence], [&mut left, &mut right], &events)
    })
    .unwrap();
    assert_eq!(&output[..128], &left);
    assert_eq!(&output[128..], &right);
    assert!(output.iter().any(|v| v.abs() > 0.001));
    let invalid = [TimedEvent {
        node: 999,
        ..events[0]
    }];
    output.fill(99.);
    assert!(
        callback_heap::measure(|| io.process_io_planar(&[], &mut output, 128, 128, &invalid))
            .is_err()
    );
    assert_eq!(output, [99.; 256]);
    callback_heap::measure(|| io.process_io_planar(&[], &mut output, 128, 128, &[])).unwrap();
    callback_heap::measure(|| {
        legacy.process_with_events([&silence, &silence], [&mut left, &mut right], &[])
    })
    .unwrap();
    assert_eq!(&output[..128], &left);
    assert_eq!(&output[128..], &right);
}

#[test]
fn sparse_256_channel_input_is_addressed_explicitly_and_invalid_layout_is_rejected() {
    let graph = GraphDescription {
        nodes: vec![NodeSpec {
            id: 8,
            kind: NodeKind::InputRaw,
        }],
        connections: vec![],
    };
    let layout = IoLayout {
        version: 1,
        inputs: vec![AudioBus {
            id: "data".into(),
            name: "Wide input".into(),
            channels: 256,
            optional: false,
        }],
        outputs: vec![AudioBus {
            id: "selected".into(),
            name: "Selected channels".into(),
            channels: 3,
            optional: false,
        }],
        input_bindings: vec![InputBinding {
            node: 8,
            channels: [
                Some(InputChannel {
                    bus: 0,
                    channel: 255,
                }),
                Some(InputChannel {
                    bus: 0,
                    channel: 127,
                }),
            ],
        }],
        output_bindings: vec![
            Some(OutputChannel {
                node: 8,
                port: 0,
                channel: 0,
            }),
            Some(OutputChannel {
                node: 8,
                port: 0,
                channel: 1,
            }),
            None,
        ],
    };
    let mut plan = graph.compile_with_io(48000., 17, true, &layout).unwrap();
    let input: Vec<_> = (0..256)
        .flat_map(|channel| vec![channel as f32; 17])
        .collect();
    let mut output = vec![99.; 51];
    callback_heap::measure(|| plan.process_io_planar(&input, &mut output, 17, 17, &[])).unwrap();
    assert_eq!(&output[..17], &[255.; 17]);
    assert_eq!(&output[17..34], &[127.; 17]);
    assert_eq!(&output[34..], &[0.; 17]);
    let mut invalid = layout.clone();
    invalid.input_bindings[0].channels[0]
        .as_mut()
        .unwrap()
        .channel = 256;
    assert!(graph.compile_with_io(48000., 17, true, &invalid).is_err());
}

#[test]
fn large_bus_layouts_preserve_spans_aliasing_and_channel_identity_without_callback_heap() {
    use manifold_native::host_buffers::{IoHostBuffers, RawInputBus, RawOutputBus};
    use manifold_native::parameters::{HOST_SLOT_BASE, TimedAutomation};
    use manifold_native::AudioBlock;
    const FRAMES: usize = 67;
    const STRIDE: usize = 96;
    let mut graph = GraphWorkspace::new();
    graph.add(12, "gain").unwrap();
    graph.set_parameter(12, 0, 0.5).unwrap();
    graph.connect(1, "out", 12, "audio").unwrap();
    graph.connect(12, "out", 3, "in").unwrap();
    graph.bind_host_slot(0, 12, 0).unwrap();
    let legacy = graph.to_project().unwrap();
    let buses: Vec<_> = (0..41).map(|i| AudioBus {
        id: format!("bus-{i}-{}", "wide".repeat(20)),
        name: format!("Audio bus {i} {}", "named channel group ".repeat(10).trim()),
        channels: if i == 0 { 300 } else { 9 }, optional: false,
    }).collect();
    let count: usize = buses.iter().map(|b| b.channels).sum();
    let layout = IoLayout {
        version: 1, inputs: buses.clone(), outputs: buses.clone(),
        input_bindings: vec![InputBinding { node: 1, channels: [
            Some(InputChannel { bus: 40, channel: 8 }),
            Some(InputChannel { bus: 0, channel: 299 }),
        ] }],
        output_bindings: (0..count).map(|i| (i % 11 != 0).then_some(OutputChannel {
            node: 12, port: 0, channel: i % 2,
        })).collect(),
    };
    graph.set_io_layout(layout.clone()).unwrap();
    let document = graph.to_project().unwrap();
    assert_eq!(GraphWorkspace::from_project(&document).unwrap().to_project().unwrap(), document);
    let prepare = |document: &Value| NativeProject::parse(&serde_json::to_vec(document).unwrap())
        .unwrap().prepare(48000., STRIDE).unwrap();
    let mut stereo = prepare(&legacy);
    let mut borrowed = prepare(&document);
    let mut planar = prepare(&document);
    let mut raw = prepare(&document);
    let mut scratch = IoHostBuffers::prepare(&layout, STRIDE).unwrap();
    let samples: Vec<Vec<f32>> = (0..count).map(|c|
        (0..FRAMES).map(|f| c as f32 * 0.001 + f as f32 * 0.0001).collect()).collect();
    let points = [
        TimedAutomation { offset: 0, id: u64::from(HOST_SLOT_BASE), normalized: 0.2 },
        TimedAutomation { offset: 7, id: u64::from(HOST_SLOT_BASE), normalized: 0.8 },
        TimedAutomation { offset: 63, id: u64::from(HOST_SLOT_BASE), normalized: 0.4 },
    ];
    let mut left = [0.; FRAMES];
    let mut right = [0.; FRAMES];
    callback_heap::measure(|| stereo.process_host_automated(AudioBlock {
        main: Some([&samples[count - 1], &samples[299]]), sidechain: None,
        output: [&mut left, &mut right], events: &[],
    }, &points)).unwrap();
    let channels: Vec<_> = samples.iter().map(Vec::as_slice).collect();
    let mut offset = 0;
    let inputs: Vec<_> = buses.iter().map(|bus| {
        let input = InputBus { channels: &channels[offset..offset + bus.channels] };
        offset += bus.channels;
        input
    }).collect();
    let mut pcm = vec![vec![99.; FRAMES]; count];
    let mut channel_views: Vec<_> = pcm.iter_mut().map(Vec::as_mut_slice).collect();
    let mut tail = &mut channel_views[..];
    let mut outputs = Vec::new();
    for bus in &buses {
        let (channels, rest) = tail.split_at_mut(bus.channels);
        outputs.push(OutputBus { channels });
        tail = rest;
    }
    callback_heap::measure(|| borrowed.process_io_host_automated(
        &inputs, &mut outputs, FRAMES, &[], &points,
    )).unwrap();
    let expected = |channel: usize| -> &[f32] {
        if channel % 11 == 0 { &[0.; FRAMES] }
        else if channel % 2 == 0 { &left } else { &right }
    };
    for (i, channel) in pcm.iter().enumerate() { assert_eq!(channel, expected(i)); }
    let mut flat_input = vec![0.; STRIDE * count];
    for (to, from) in flat_input.chunks_exact_mut(STRIDE).zip(&samples) {
        to[..FRAMES].copy_from_slice(from);
    }
    let mut flat_output = vec![99.; STRIDE * count];
    callback_heap::measure(|| planar.process_io_planar_host_automated(
        &flat_input, &mut flat_output, STRIDE, FRAMES, &[], &points,
    )).unwrap();
    for (i, channel) in flat_output.chunks_exact(STRIDE).enumerate() {
        assert_eq!(&channel[..FRAMES], expected(i));
        assert!(channel[FRAMES..].iter().all(|s| *s == 99.));
    }
    // Every output aliases an input from the opposite end of the host table.
    // The first output would overwrite the last input before its later reads if
    // the adapter did not copy every input before rendering/writing outputs.
    let mut aliased = samples.clone();
    let input_ptrs: Vec<_> = aliased.iter().map(|s| s.as_ptr()).collect();
    let output_ptrs: Vec<_> = aliased.iter_mut().rev().map(|s| s.as_mut_ptr()).collect();
    let mut offset = 0;
    let raw_inputs: Vec<_> = buses.iter().map(|bus| {
        let channels = &input_ptrs[offset..offset + bus.channels]; offset += bus.channels;
        RawInputBus { channels }
    }).collect();
    let mut offset = 0;
    let raw_outputs: Vec<_> = buses.iter().map(|bus| {
        let channels = &output_ptrs[offset..offset + bus.channels]; offset += bus.channels;
        RawOutputBus { channels }
    }).collect();
    callback_heap::measure(|| unsafe { scratch.render(
        &mut raw, &raw_inputs, &raw_outputs, FRAMES, &[], &points,
    ) }).unwrap();
    for (i, channel) in aliased.iter().rev().enumerate() { assert_eq!(channel, expected(i)); }
    let accepted = raw.current_parameter_values().to_vec();
    let before = aliased.clone();
    let mut invalid_inputs = raw_inputs.clone();
    invalid_inputs[40].channels = &[];
    assert!(callback_heap::measure(|| unsafe { scratch.render(
        &mut raw, &invalid_inputs, &raw_outputs, FRAMES, &[], &points,
    ) }).is_err());
    assert_eq!(aliased, before);
    assert_eq!(raw.current_parameter_values(), accepted);
}
