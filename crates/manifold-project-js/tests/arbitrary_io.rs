use manifold_native::{InputBus, OutputBus};
use manifold_project_js::native_host::{NativeScriptAudio, prepare_native_script};
mod callback_heap {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../manifold-native/tests/support/callback_heap.rs"
    ));
}
const BUNDLE: &str =
    include_str!("../../../projects/graph-workspace/arbitrary-io-project.bundle.js");
fn render(audio: &mut NativeScriptAudio) -> [[f32; 17]; 5] {
    let main = [[0.125; 17], [-0.25; 17], [0.375; 17]];
    let aux = [[-0.5; 17]];
    let input = [main[0].as_slice(), main[1].as_slice(), main[2].as_slice()];
    let auxiliary = [aux[0].as_slice()];
    let mut output = [[0.; 17]; 5];
    let [a, b, c, d, e] = &mut output;
    let mut stems = [
        a.as_mut_slice(),
        b.as_mut_slice(),
        c.as_mut_slice(),
        d.as_mut_slice(),
    ];
    let mut mono = [e.as_mut_slice()];
    callback_heap::measure(|| {
        audio.process_io(
            &[
                InputBus { channels: &input },
                InputBus {
                    channels: &auxiliary,
                },
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
        )
    })
    .unwrap();
    output
}
#[test]
fn public_script_routes_publish_on_arbitrary_buses_and_rejected_layout_keeps_sound() {
    let (mut control, mut audio) = prepare_native_script(BUNDLE, None, 48000., 128).unwrap();
    assert_eq!(
        render(&mut audio).map(|c| c[0]),
        [0.125, -0.25, 0.375, -0.5, 0.0625]
    );
    for index in 0..6 {
        control.begin_call("swap", &[]).unwrap();
        assert!(control.is_pending());
        let mut invalid = [0.; 17];
        let mut channels = [invalid.as_mut_slice()];
        assert!(
            callback_heap::measure(|| audio.process_io(
                &[],
                &mut [OutputBus {
                    channels: &mut channels
                }],
                17,
                &[]
            ))
            .is_err()
        );
        assert!(control.poll().unwrap().is_none());
        assert!(control.is_pending());
        let expected = if index % 2 == 0 {
            [-0.25, 0.125, 0.375, -0.5, 0.0625]
        } else {
            [0.125, -0.25, 0.375, -0.5, 0.0625]
        };
        let output = render(&mut audio);
        for (c, v) in output.iter().zip(expected) {
            assert_eq!(*c, [v; 17]);
        }
        assert!(control.poll().unwrap().is_some());
        assert!(!control.is_pending());
    }
    let before = control.current_project().to_vec();
    assert!(control.begin_call("requestDifferentLayout", &[]).is_err());
    assert!(control.begin_call("requireAux", &[]).is_err());
    assert_eq!(control.current_project(), before);
    assert!(!control.is_pending());
    assert_eq!(
        render(&mut audio).map(|c| c[0]),
        [0.125, -0.25, 0.375, -0.5, 0.0625]
    );
    control.begin_call("swap", &[]).unwrap();
    render(&mut audio);
    assert!(control.poll().unwrap().is_some());
    let saved = control.current_project().to_vec();
    drop(audio);
    drop(control);
    let (_, mut reopened) = prepare_native_script(BUNDLE, Some(&saved), 48000., 128).unwrap();
    assert_eq!(
        render(&mut reopened).map(|c| c[0]),
        [-0.25, 0.125, 0.375, -0.5, 0.0625]
    );
}
