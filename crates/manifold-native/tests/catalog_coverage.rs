use manifold_core::{
    events::{EventKind, TimedEvent},
    graph::{NodeKind, SignalKind},
    node_catalog::workspace_type,
    parameter_catalog::workspace_parameters,
};
use manifold_native::project::NativeProject;
use serde_json::json;

// Exercise the authorable contract through the native document reader, prepared
// engine and live controls. In particular, parameter IDs need not be contiguous.
#[test]
fn expanded_catalog_prepares_wires_and_processes_real_audio_and_midi() {
    for id in [
        "compressor",
        "limiter",
        "stereo-delay",
        "phaser",
        "chorus",
        "reverb",
        "multitap-delay",
        "transient-shaper",
        "bit-crusher",
        "three-band-eq",
        "formant-filter",
        "resonator",
        "reverse-delay",
        "stutter",
        "pitch-shifter",
        "shimmer",
        "spectrum-analyzer",
        "fft-spectrum",
        "envelope-follower",
        "envelope-control",
        "midi-note-filter",
        "midi-scale-quantizer",
        "midi-velocity-mapper",
        "midi-arpeggiator",
        "constant",
        "linear-blend",
        "slew-audio",
        "phrase-gain",
    ] {
        let spec = workspace_type(id).unwrap();
        let kind = NodeKind::from_abi_code(spec.code, spec.a as f32, spec.b as f32).unwrap();
        let mut authored = json!({"id":4,"type":id});
        if spec.arg_count > 0 {
            authored["a"] = json!(spec.a);
        }
        if spec.arg_count > 1 {
            authored["b"] = json!(spec.b);
        }
        let mut nodes = vec![
            json!({"id":1,"type":"input.raw"}),
            json!({"id":3,"type":"output"}),
            authored,
        ];
        let edge = |from, to, input| json!({"from":from,"to":to,"inputPort":input,"outputPort":0});
        let mut connections = vec![];
        let mut midi = false;
        for port in 0..kind.input_port_count() {
            let from = match kind.input_port_signal(port).unwrap() {
                SignalKind::Audio => 1,
                SignalKind::Control => {
                    nodes.push(json!({"id":10,"type":"lfo","a":2}));
                    10
                }
                SignalKind::Midi => {
                    midi = true;
                    nodes.push(json!({"id":11,"type":"midi-input"}));
                    11
                }
            };
            connections.push(edge(from, 4, port));
        }
        match kind.output_port_signal(0).unwrap() {
            SignalKind::Audio => connections.push(edge(4, 3, 0)),
            SignalKind::Control => {
                nodes.push(json!({"id":12,"type":"modulated-gain","a":0.5,"b":0.4}));
                connections.extend([edge(1, 12, 0), edge(4, 12, 1), edge(12, 3, 0)]);
            }
            SignalKind::Midi => {
                nodes.push(json!({"id":12,"type":"voice-synth"}));
                connections.extend([edge(4, 12, 0), edge(12, 3, 0)]);
            }
        }
        let parameters: Vec<_> = nodes
            .iter()
            .flat_map(|node| {
                workspace_parameters(node["type"].as_str().unwrap())
                    .iter()
                    .map(|p| json!({"nodeId":node["id"],"id":p.id,"value":p.default}))
            })
            .collect();
        let document = json!({"format":"manifold.project","schemaVersion":1,"projectId":"manifold.graph-workspace",
            "signal":{"inputs":2,"outputs":2,"inputSource":"external","nodes":nodes,
            "connections":connections,"initialParameters":parameters}});
        let project = NativeProject::parse(&serde_json::to_vec(&document).unwrap())
            .unwrap_or_else(|error| panic!("{id}: {error:?}"));
        let mut plan = project.prepare_patchable(48_000., 128).unwrap().into_plan();
        for p in workspace_parameters(id) {
            for value in [p.min, p.max, p.default] {
                assert!(plan.set_parameter(4, p.id, value as f32), "{id}:{}", p.id);
            }
        }
        if id == "constant" {
            assert!(plan.set_parameter(4, 0, 0.2));
        }
        let input = std::array::from_fn::<_, 128, _>(|i| (i as f32 * 0.1).sin() * 0.2);
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        let note = TimedEvent {
            offset: 0,
            node: 11,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        };
        let mut energy = 0.;
        for block in 0..256 {
            let events = if midi && block == 0 {
                std::slice::from_ref(&note)
            } else {
                &[]
            };
            plan.process_with_events([&input, &input], [&mut left, &mut right], events)
                .unwrap();
            for sample in left.iter().chain(&right) {
                assert!(sample.is_finite(), "{id}");
                energy += sample * sample;
            }
        }
        assert!(energy > 0.0001, "{id} produced silence");
        if midi {
            let off = TimedEvent {
                kind: EventKind::AllNotesOff,
                ..note
            };
            plan.process_with_events([&input, &input], [&mut left, &mut right], &[off])
                .unwrap();
            for _ in 0..300 {
                plan.process([&input, &input], [&mut left, &mut right]);
            }
            assert!(
                left.iter().all(|sample| sample.abs() < 0.0001),
                "{id} left a held voice"
            );
        }
    }
}
