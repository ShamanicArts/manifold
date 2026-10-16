use manifold_native::AudioBlock;
use manifold_project_js::{native_host::{NativeScriptAudio, prepare_native_script}, package::ProjectPackage};
use serde_json::json;
const SCRIPT: &str=include_str!("../../../projects/standalone-oscillator/live-controller.bundle.js");
fn render(audio:&mut NativeScriptAudio)->f32 {
    let mut left=[0.;128];let mut right=[0.;128];
    audio.process(AudioBlock{main:None,sidechain:None,output:[&mut left,&mut right],events:&[]}).unwrap();
    left.iter().map(|v|v.abs()).sum()
}
#[test]
fn native_authored_keyboard_chord_releases_and_recalls_event_state() {
    let (mut control, mut audio) = prepare_native_script(SCRIPT, None, 48000., 128).unwrap();
    render(&mut audio);
    for note in [48, 52, 55] {
        control.begin_call("request", &[json!({"operation":"event.send","event":{"type":"note-on","note":note,"owner":"test"}})]).unwrap();
        render(&mut audio); control.poll().unwrap().unwrap();
    }
    let held = control.presentation().unwrap();
    assert_eq!(held["eventState"]["voices"].as_array().unwrap().iter().filter(|v|v["gate"]==1).count(),3);
    for _ in 0..100 { render(&mut audio); }
    assert!(render(&mut audio) > 1.);
    let source = format!("// live held-note edit\n{}", held["source"].as_str().unwrap());
    let started = std::time::Instant::now();
    control.begin_call("request", &[json!({"operation":"source.apply","source":source})]).unwrap();
    println!("native held-note source preparation: {:?}", started.elapsed());
    render(&mut audio); control.poll().unwrap().unwrap();
    let state = control.save_project().unwrap();
    let package = ProjectPackage::parse(include_bytes!("../../../web/public/packages/oscillator-creator.manifold.json")).unwrap();
    let recalled = ProjectPackage::parse(&package.save_with_state(state).unwrap()).unwrap();
    let (mut control, mut audio) = recalled.prepare_native(48000.,128).unwrap();
    render(&mut audio);
    assert_eq!(control.presentation().unwrap()["eventState"], held["eventState"]);
    for _ in 0..100 { render(&mut audio); }
    assert!(render(&mut audio) > 1., "held notes must sound after cold package recall");
    for note in [48, 52, 55] {
        control.begin_call("request", &[json!({"operation":"event.send","event":{"type":"note-off","note":note,"owner":"test"}})]).unwrap();
        render(&mut audio); control.poll().unwrap().unwrap();
    }
    for _ in 0..200 {render(&mut audio);}
    assert_eq!(render(&mut audio),0.);
}
#[test]
fn native_authored_oscillator_controls_publish_sound_and_recall_same_controller(){
    let (mut control,mut audio)=prepare_native_script(SCRIPT,None,48000.,128).unwrap();
    render(&mut audio);
    control.begin_call("request",&[json!({"operation":"control.set","path":"/midi/synth/rack/osc/1/manualLevel","value":0.6,"expectedRevision":0})]).unwrap();
    render(&mut audio);control.poll().unwrap().unwrap();
    for _ in 0..100 {render(&mut audio);}
    assert!(render(&mut audio)>1.);
    let before=control.presentation().unwrap();
    control.begin_call("request",&[json!({"operation":"control.set","path":"/midi/synth/rack/osc/1/unison","value":4,"expectedRevision":1})]).unwrap();
    assert_eq!(control.presentation().unwrap()["revision"],before["revision"]);
    render(&mut audio);control.poll().unwrap().unwrap();
    let saved=control.save_project().unwrap();
    let state:serde_json::Value=serde_json::from_slice(&saved).unwrap();
    assert_eq!(state["signal"]["initialParameters"].as_array().unwrap().iter().filter(|p|p["id"]==10&&p["value"]==4).count(),9);
    let package=ProjectPackage::parse(include_bytes!("../../../web/public/packages/oscillator-creator.manifold.json")).unwrap();
    let edited=package.save_with_state(saved).unwrap();
    let recalled=ProjectPackage::parse(&edited).unwrap();
    let (mut control,mut audio)=recalled.prepare_native(48000.,128).unwrap();
    for _ in 0..100 {render(&mut audio);}
    assert!(render(&mut audio)>1.);
    let view=control.presentation().unwrap();
    assert_eq!(view["components"].as_array().unwrap().len(),22);
    assert!(view["parameters"].as_array().unwrap().iter().any(|p|p["path"]=="/midi/synth/rack/osc/1/unison"&&p["value"]==4));
    assert_eq!(recalled.bundle_sha256,package.bundle_sha256);
}
