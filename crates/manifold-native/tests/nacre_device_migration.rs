use manifold_native::{AudioBlock, InputBus, NativeProcessor, OutputBus, project::NativeProject};
use serde_json::Value;

fn prepare(graph: &Value) -> NativeProcessor {
    NativeProject::parse(&serde_json::to_vec(graph).unwrap())
        .unwrap()
        .prepare_patchable_with_state(48000., 128)
        .unwrap()
        .processor
}
fn set(processor: &mut NativeProcessor, graph: &Value, path: &str, value: f32) {
    let endpoint = graph["endpoints"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["path"] == path)
        .unwrap();
    assert!(processor.set_parameter(
        (endpoint["nodeId"].as_u64().unwrap() as u32).into(),
        endpoint["id"].as_u64().unwrap() as u32,
        value
    ));
}
fn render(processor: &mut NativeProcessor, input: &[[f32; 128]; 2]) -> [[f32; 128]; 2] {
    let mut output = [[0.; 128]; 2];
    let [left, right] = &mut output;
    if processor.io_layout().is_some() {
        let channels: &[&[f32]] = &[&input[0], &input[1]];
        let mut destination = [left.as_mut_slice(), right.as_mut_slice()];
        processor
            .process_io(
                &[InputBus { channels }],
                &mut [OutputBus {
                    channels: &mut destination,
                }],
                128,
                &[],
            )
            .unwrap();
    } else {
        processor
            .process(AudioBlock {
                main: Some([&input[0], &input[1]]),
                sidechain: None,
                output: [left, right],
                events: &[],
            })
            .unwrap();
    }
    output
}

#[test]
fn device_nacre_preserves_legacy_stereo_sound_and_live_controls_sample_for_sample() {
    // Captured before the Device migration; independent of the new source/generator.
    let old: Value = serde_json::from_str(include_str!(
        "../../../web/tests/fixtures/nacre-legacy-graph.json"
    ))
    .unwrap();
    let saved: Value = serde_json::from_str(include_str!(
        "../../../web/public/nacre/2026-10-10-graph/nacre-prism-bend.manifold.json"
    ))
    .unwrap();
    let new = &saved["graph"];
    let mut legacy = prepare(&old);
    let mut device = prepare(new);
    let changes = [
        ("focus", 4200.),
        ("shift", -4.),
        ("drive", 24.),
        ("resonance", 0.8),
        ("mix", -1.),
        ("mix", 1.),
        ("afterimage", 0.7),
        ("grain-size", 110.),
        ("scatter", 0.1),
        ("hold", 1.),
        ("hold", 0.),
        ("active", -1.),
        ("active", 1.),
        ("output", 0.3),
        ("curve", 4.),
    ];
    let mut energy = 0.;
    for block in 0..1000 {
        if block >= 100 && (block - 100) % 50 == 0 {
            if let Some((key, value)) = changes.get((block - 100) / 50) {
                set(&mut legacy, &old, &format!("/nacre/{key}"), *value);
                set(&mut device, new, &format!("/{key}"), *value);
            }
        }
        if block == 900 {
            for (key, value) in [("edge", 2100.), ("heat", 14.)] {
                set(
                    &mut legacy,
                    &old,
                    &format!("/studio/prism-bend/12/{key}"),
                    value,
                );
                set(&mut device, new, &format!("/prism-bend/{key}"), value);
            }
        }
        let input = std::array::from_fn(|channel| {
            std::array::from_fn(|sample| {
                let t = (block * 128 + sample) as f32 / 48000.;
                (t * (173. + channel as f32 * 71.) * std::f32::consts::TAU).sin() * 0.12
                    + if sample == 0 && block % 47 == 0 {
                        0.2
                    } else {
                        0.
                    }
            })
        });
        let expected = render(&mut legacy, &input);
        let actual = render(&mut device, &input);
        for channel in 0..2 {
            for frame in 0..128 {
                assert_eq!(
                    actual[channel][frame], expected[channel][frame],
                    "Block {block}, channel {channel}, frame {frame}"
                );
                energy += actual[channel][frame].abs();
            }
        }
    }
    assert!(energy > 100., "Parity must compare audible signal");
}
