use manifold_native::AudioBlock;
use manifold_project_js::native_host::{
    NativeScriptAudio, NativeScriptControl, prepare_native_script,
};
use serde_json::{Value, json};
const SCRIPT: &str = include_str!("../../../projects/standalone-filter/live-controller.bundle.js");

fn document(text: &str) -> Vec<u8> {
    let mut fixture: Value = serde_json::from_str(text).unwrap();
    let mut graph = fixture.as_object_mut().unwrap().remove("graph").unwrap();
    graph["liveAuthoring"] = fixture;
    serde_json::to_vec(&graph).unwrap()
}
fn render(audio: &mut NativeScriptAudio, block: usize) -> [f32; 128] {
    let input: [f32; 128] =
        std::array::from_fn(|i| ((block * 128 + i) as f32 * 0.031).sin() * 0.25);
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    audio
        .process(AudioBlock {
            main: Some([&input, &input]),
            sidechain: None,
            output: [&mut left, &mut right],
            events: &[],
        })
        .unwrap();
    left
}
fn edit(
    control: &mut NativeScriptControl,
    audio: &mut NativeScriptAudio,
    reference: &mut NativeScriptAudio,
    block: &mut usize,
    command: Value,
) {
    control.begin_call("request", &[command]).unwrap();
    for _ in 0..20 {
        assert_eq!(
            render(audio, *block),
            render(reference, *block),
            "wrapping must preserve sounding DSP state at block {}",
            *block
        );
        *block += 1;
        if control.is_pending() {
            control.poll().unwrap();
        }
        if !control.is_pending() {
            return;
        }
    }
    panic!("Audio edit was not acknowledged");
}
#[test]
fn wrapping_sounding_audio_is_sample_exact_and_preserves_recall() {
    let bytes = document(include_str!(
        "../../../web/public/studio/audio-chain.manifold.json"
    ));
    let (mut control, mut audio) =
        prepare_native_script(SCRIPT, Some(&bytes), 48000., 128).unwrap();
    let (_, mut reference) = prepare_native_script(SCRIPT, Some(&bytes), 48000., 128).unwrap();
    let before = control.presentation().unwrap()["graph"].clone();
    let mut block = 0;
    for _ in 0..30 {
        assert_eq!(render(&mut audio, block), render(&mut reference, block));
        block += 1;
    }
    edit(
        &mut control,
        &mut audio,
        &mut reference,
        &mut block,
        json!({"operation":"graph.wrap","ids":[4,5],"definitionId":"color","label":"Color"}),
    );
    edit(
        &mut control,
        &mut audio,
        &mut reference,
        &mut block,
        json!({"operation":"graph.wrap","ids":[4],"definitionId":"filter","label":"Filter"}),
    );
    assert_eq!(control.presentation().unwrap()["graph"], before);
    edit(
        &mut control,
        &mut audio,
        &mut reference,
        &mut block,
        json!({"operation":"graph.addInstance","definitionId":"color"}),
    );
    for _ in 0..50 {
        assert_eq!(render(&mut audio, block), render(&mut reference, block));
        block += 1;
    }
    let saved = control.save_project().unwrap().to_vec();
    let (mut recalled, _) = prepare_native_script(SCRIPT, Some(&saved), 48000., 128).unwrap();
    assert_eq!(
        recalled.presentation().unwrap()["audioNodes"],
        control.presentation().unwrap()["audioNodes"]
    );
}
#[test]
fn reusable_audio_instances_have_independent_controls_and_real_signal() {
    let bytes = document(include_str!(
        "../../../web/public/studio/nested-audio.manifold.json"
    ));
    let (mut control, mut audio) =
        prepare_native_script(SCRIPT, Some(&bytes), 48000., 128).unwrap();
    let state = control.presentation().unwrap();
    let gains: Vec<_> = state["audioNodes"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|n| n["type"] == "gain")
        .collect();
    assert_eq!(gains.len(), 2);
    assert_ne!(
        gains[0]["parameters"][0]["path"],
        gains[1]["parameters"][0]["path"]
    );
    let before = render(&mut audio, 20);
    assert!(before.iter().any(|v| v.abs() > 0.01));
    let second = gains.iter().find(|n| n["id"] != 5).unwrap();
    control.begin_call("request",&[json!({"operation":"parameter.set","path":second["parameters"][0]["path"],"value":0.})]).unwrap();
    for block in 21..80 {
        render(&mut audio, block);
        if control.is_pending() {
            control.poll().unwrap();
        }
    }
    assert!(!control.is_pending());
    assert!(render(&mut audio, 80).iter().all(|v| v.abs() < 1e-6));
    let after = control.presentation().unwrap();
    assert_eq!(
        after["audioNodes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["id"] == 5)
            .unwrap()["parameters"][0]["default"],
        0.8
    );
}
