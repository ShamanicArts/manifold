use manifold_native::AudioBlock;
use manifold_project_js::{native_host::{NativeScriptAudio, NativeScriptControl}, package::ProjectPackage};
use serde_json::json;

fn render(audio: &mut NativeScriptAudio) -> f32 {
    let mut left=[0.;128]; let mut right=[0.;128];
    audio.process(AudioBlock{main:None,sidechain:None,output:[&mut left,&mut right],events:&[]}).unwrap();
    left.iter().map(|v|v.abs()).sum()
}
fn command(control: &mut NativeScriptControl, audio: &mut NativeScriptAudio, value: serde_json::Value) {
    control.begin_call("request", &[value]).unwrap();
    render(audio); control.poll().unwrap().unwrap();
}
#[test]
fn main_wave_creator_keeps_authored_voices_through_edit_recall_and_scoped_release() {
    let package=ProjectPackage::parse(include_bytes!("../../../web/public/packages/main-wave-creator.manifold.json")).unwrap();
    let (mut control,mut audio)=package.prepare_native(48000.,128).unwrap();
    render(&mut audio);
    for (note,owner) in [(60,"device"),(64,"agent")] {
        command(&mut control,&mut audio,json!({"operation":"event.send","event":{"type":"note-on","note":note,"owner":owner}}));
    }
    for _ in 0..200 {render(&mut audio);}
    assert!(render(&mut audio)>1.);
    let bright: f32=(0..100).map(|_|render(&mut audio)).sum();
    command(&mut control,&mut audio,json!({"operation":"parameter.set","path":"/midi/synth/cutoff","value":80}));
    for _ in 0..100 {render(&mut audio);}
    let dark: f32=(0..100).map(|_|render(&mut audio)).sum();
    assert!(dark<bright*0.2, "shared synth filter must affect the sounding voice bus");
    command(&mut control,&mut audio,json!({"operation":"parameter.set","path":"/midi/synth/cutoff","value":3200}));
    let held=control.presentation().unwrap();
    let source=format!("// live author edit\n{}",held["source"].as_str().unwrap());
    command(&mut control,&mut audio,json!({"operation":"source.apply","source":source}));
    assert_eq!(control.presentation().unwrap()["eventState"],held["eventState"]);
    let saved=control.save_project().unwrap();
    let recalled=ProjectPackage::parse(&package.save_with_state(saved).unwrap()).unwrap();
    let (mut control,mut audio)=recalled.prepare_native(48000.,128).unwrap();
    for _ in 0..200 {render(&mut audio);}
    assert!(render(&mut audio)>1.);
    command(&mut control,&mut audio,json!({"operation":"event.send","event":{"type":"panic","owner":"device"}}));
    let state=control.presentation().unwrap();
    assert_eq!(state["eventState"]["voices"].as_array().unwrap().iter().filter(|v|v["gate"]==1).count(),1);
    for _ in 0..200 {render(&mut audio);}
    assert!(render(&mut audio)>1.);
    command(&mut control,&mut audio,json!({"operation":"parameter.set","path":"/midi/synth/output","value":0}));
    for _ in 0..100 {render(&mut audio);}
    assert!(render(&mut audio)<1e-8); // Gain smoothing approaches silence.
    command(&mut control,&mut audio,json!({"operation":"parameter.set","path":"/midi/synth/output","value":0.8}));
    for _ in 0..100 {render(&mut audio);}
    assert!(render(&mut audio)>1.);
    command(&mut control,&mut audio,json!({"operation":"event.send","event":{"type":"note-off","note":64,"owner":"agent"}}));
    for _ in 0..300 {render(&mut audio);}
    assert_eq!(render(&mut audio),0.);
}
