use manifold_native::AudioBlock;
use manifold_project_js::native_host::{NativeScriptAudio, NativeScriptControl, prepare_native_script};
use serde_json::{Value, json};
mod callback_heap { include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../manifold-native/tests/support/callback_heap.rs")); }
const BUNDLE: &str = include_str!("../../../projects/graph-workspace/main-wave-project.bundle.js");
fn render(audio: &mut NativeScriptAudio) -> [[f32; 128]; 2] {
    let mut output = [[0.; 128]; 2]; let [left, right] = &mut output;
    callback_heap::measure(|| audio.process(AudioBlock { main: None, sidechain: None,
        output: [left, right], events: &[] })).unwrap(); output
}
fn call(control: &mut NativeScriptControl, method: &str, args: &[Value]) {
    control.begin_call(method, args).unwrap();
}
#[test]
fn eight_authored_main_voices_keep_signal_and_controller_targets_through_live_edits() {
    let (mut control, mut audio) = prepare_native_script(BUNDLE, None, 48000., 128).unwrap();
    let (mut reference_control, mut reference_audio) = prepare_native_script(BUNDLE, None, 48000., 128).unwrap();
    let values = json!((0..8).map(|i| json!({"index":i+1,"frequency":220+i*31,"amplitude":0.06})).collect::<Vec<_>>());
    for c in [&mut control, &mut reference_control] { call(c, "setVoices", &[values.clone()]); }
    assert_eq!(render(&mut audio), render(&mut reference_audio));
    assert!(control.poll().unwrap().is_some()); assert!(reference_control.poll().unwrap().is_some());
    for block in 0..128 {
        if block % 8 == 0 { call(&mut control,"setInsert",&[json!(block % 16 == 0)]); }
        let actual = render(&mut audio); let reference = render(&mut reference_audio);
        assert_eq!(actual, reference, "live Main Wave block {block}");
        if block % 8 == 0 { assert!(control.poll().unwrap().is_some()); }
        assert!(actual.iter().flatten().any(|v| v.abs() > 0.001));
    }
    // The same script allocator and explicit control clock run without an editor.
    call(&mut control,"panic",&[]); render(&mut audio); assert!(control.poll().unwrap().is_some());
    call(&mut control,"noteOn",&[json!(60),json!(127)]);render(&mut audio);assert!(control.poll().unwrap().is_some());
    for tick in 0..32 {
        call(&mut control,"advance",&[json!(1./60.),json!(1.+tick as f64/60.)]);
        render(&mut audio);control.poll().unwrap();assert!(!control.is_pending());
    }
    let saved: Value = serde_json::from_slice(control.current_project()).unwrap();
    let amplitude=saved["signal"]["initialParameters"].as_array().unwrap().iter()
        .find(|p|p["nodeId"]==10&&p["id"]==2).unwrap()["value"].as_f64().unwrap();
    assert!((amplitude-0.28).abs()<0.002);
}
