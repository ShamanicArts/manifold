use manifold_native::{AudioBlock, project::NativeProject};
use manifold_project_js::native_host::{NativeHostError, NativeScriptAudio, prepare_native_script};
use serde_json::json;
mod callback_heap {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../manifold-native/tests/support/callback_heap.rs"
    ));
}
#[allow(dead_code)]
mod evidence {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../manifold-native/tests/support/loop_publication.rs"
    ));
}

const BUNDLE: &str =
    include_str!("../../../projects/graph-workspace/loop-authoring-project.bundle.js");
fn render(audio: &mut NativeScriptAudio) -> [[f32; 128]; 2] {
    let mut output = [[0.; 128]; 2];
    let [left, right] = &mut output;
    audio
        .process(AudioBlock {
            main: None,
            sidechain: None,
            output: [left, right],
            events: &[],
        })
        .unwrap();
    output
}
fn reference(runtime: &mut manifold_native::project::PreparedNativeProject) -> [[f32; 128]; 2] {
    let mut output = [[0.; 128]; 2];
    let [left, right] = &mut output;
    runtime
        .processor
        .process(AudioBlock {
            main: None,
            sidechain: None,
            output: [left, right],
            events: &[],
        })
        .unwrap();
    output
}

#[test]
fn actual_importable_loop_author_runs_native_js_edits_and_reopens_owned_pcm_without_callback_heap_work()
 {
    let (mut control, mut audio) = prepare_native_script(BUNDLE, None, 48_000., 128).unwrap();
    let mut expected = NativeProject::parse(control.current_project())
        .unwrap()
        .prepare_patchable_with_state(48_000., 128)
        .unwrap();
    let mut tape = Vec::new();
    let mut expected_tape = Vec::new();
    for index in 0..384 {
        match index {
            0 => {
                control
                    .begin_call("record", &[json!(1), json!(true)])
                    .unwrap();
                assert!(expected.processor.set_parameter(70, 0, 1.));
            }
            12 => control
                .begin_call("setInsert", &[json!(true), json!(0)])
                .unwrap(),
            48 => {
                control
                    .begin_call("record", &[json!(1), json!(false)])
                    .unwrap();
                assert!(expected.processor.set_parameter(70, 0, 0.));
            }
            49 => {
                control
                    .begin_call("play", &[json!(1), json!(true)])
                    .unwrap();
                assert!(expected.processor.set_parameter(70, 1, 1.));
            }
            96 => {
                control
                    .begin_call("overdub", &[json!(1), json!(true)])
                    .unwrap();
                assert!(expected.processor.set_parameter(70, 2, 1.));
            }
            120 => {
                control
                    .begin_call("speed", &[json!(1), json!(1.33)])
                    .unwrap();
                assert!(expected.processor.set_parameter(70, 3, 1.33));
            }
            128 => control.begin_call("setInsert", &[json!(false)]).unwrap(),
            180 => {
                control
                    .begin_call("reverse", &[json!(1), json!(true)])
                    .unwrap();
                assert!(expected.processor.set_parameter(70, 4, 1.));
            }
            240 => {
                control
                    .begin_call("overdub", &[json!(1), json!(false)])
                    .unwrap();
                assert!(expected.processor.set_parameter(70, 2, 0.));
            }
            _ => {}
        }
        let actual = callback_heap::measure(|| render(&mut audio));
        let reference = reference(&mut expected);
        assert_eq!(actual, reference, "block {index}");
        control.poll().unwrap();
        evidence::append(&mut tape, &actual);
        evidence::append(&mut expected_tape, &reference);
    }
    assert!(
        matches!(
            control.save_project(),
            Err(NativeHostError::LoopSnapshotRequired)
        ),
        "parameter-only save must not pretend to include live takes"
    );
    // A pending creator edit is accepted at host stop and the actual take wins
    // over its prepared empty storage. JS acknowledgement remains on control.
    control
        .begin_call("setInsert", &[json!(true), json!(0)])
        .unwrap();
    let saved = audio.stop_and_snapshot().unwrap();
    control.poll().unwrap();
    assert!(expected.finish_recording_loops_for_host_stop());
    let expected_saved = expected.save_state().unwrap();
    evidence::assert_take(&saved, &expected_saved);
    let (mut reopened_control, mut reopened) =
        prepare_native_script(BUNDLE, Some(&saved), 48_000., 128).unwrap();
    let mut expected = NativeProject::parse(&expected_saved)
        .unwrap()
        .prepare_patchable_with_state(48_000., 128)
        .unwrap();
    for _ in 384..448 {
        let actual = callback_heap::measure(|| render(&mut reopened));
        let reference = reference(&mut expected);
        assert_eq!(actual, reference);
        evidence::append(&mut tape, &actual);
        evidence::append(&mut expected_tape, &reference);
    }
    // A fresh QuickJS controller uses the same public author module and retains
    // embedded PCM when composing another transparent graph edit.
    reopened_control
        .begin_call("setInsert", &[json!(false)])
        .unwrap();
    let actual = callback_heap::measure(|| render(&mut reopened));
    let reference = reference(&mut expected);
    assert_eq!(actual, reference);
    reopened_control.poll().unwrap();
    evidence::append(&mut tape, &actual);
    evidence::append(&mut expected_tape, &reference);
    evidence::export("native-js", &tape, &expected_tape, &saved);
}
