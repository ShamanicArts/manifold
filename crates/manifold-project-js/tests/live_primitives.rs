use manifold_native::AudioBlock;
use manifold_project_js::{native_host::{NativeScriptAudio,NativeScriptControl},package::ProjectPackage};
use serde_json::json;
fn render(audio:&mut NativeScriptAudio)->f32{
 let input:[f32;128]=std::array::from_fn(|i|(i as f32*0.17).sin()*0.2);
 let opposite=input.map(|v|-v);let mut left=[0.;128];let mut right=[0.;128];
 audio.process(AudioBlock{main:Some([&input,&opposite]),sidechain:None,output:[&mut left,&mut right],events:&[]}).unwrap();
 assert!(left.iter().chain(&right).all(|v|v.is_finite()));left.iter().map(|v|v.abs()).sum()
}
fn command(control:&mut NativeScriptControl,audio:&mut NativeScriptAudio,value:serde_json::Value){
 control.begin_call("request",&[value]).unwrap();render(audio);control.poll().unwrap();
}
fn load(id:&str)->ProjectPackage{
 let path=std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("../../web/public/packages/primitives/{id}.manifold.json"));
 ProjectPackage::parse(&std::fs::read(path).unwrap()).unwrap()
}
#[test]
fn every_visible_program_runs_its_saved_source_and_public_native_graph(){
 for id in ["ui-three-tone","ui-styled-tone","ui-reactive-tone","network-services","default","fx-slots","gain","fixed-gain","width","distortion","svf","oscillator","extended-oscillator","pulse","adsr","lfo-gain","crossfader","sum","mixer","phase-vocoder","noise","cv-slew","attenuverter","sample-hold","cv-mix","compare","range","cv-filter","ring","eq8","mixer9","wave-shaper","legacy-filter"]{
  let package=load(id);let(mut control,mut audio)=package.prepare_native(48000.,128).unwrap();
  if id=="adsr"{command(&mut control,&mut audio,json!({"operation":"parameter.set","path":"/primitives/adsr/envelope/4","value":1}));}
  let signal:f32=(0..300).map(|_|render(&mut audio)).sum();assert!(signal>1.,"{id} must produce sound");
  let before=control.presentation().unwrap();let source=format!("// live library edit\n{}",before["source"].as_str().unwrap());
  command(&mut control,&mut audio,json!({"operation":"source.apply","source":source}));
  assert!(render(&mut audio)>0.,"{id} must still sound after preparation");
  let saved=control.save_project().unwrap();let recalled=ProjectPackage::parse(&package.save_with_state(saved).unwrap()).unwrap();
  let(mut fresh,mut audio)=recalled.prepare_native(48000.,128).unwrap();let signal:f32=(0..300).map(|_|render(&mut audio)).sum();assert!(signal>1.,"{id} cold recall");
  assert_eq!(fresh.presentation().unwrap()["source"],source);
 }
}
#[test]
fn native_lazy_width_is_audible_and_preserves_selection_memory_through_edit_and_recall(){
 let package=load("fx-slots");let(mut control,mut audio)=package.prepare_native(48000.,128).unwrap();
 for _ in 0..100{render(&mut audio);}assert!(render(&mut audio)>1.);
 command(&mut control,&mut audio,json!({"operation":"control.set","path":"/test/fxslot/slotA/width/amount","value":0}));
 command(&mut control,&mut audio,json!({"operation":"control.set","path":"/test/fxslot/slotA/select","value":1}));
 for _ in 0..200{render(&mut audio);}assert!(render(&mut audio)<1e-5,"mid-only width removes anti-phase input");
 let held=control.presentation().unwrap();let source=format!("// source edit with Width selected\n{}",held["source"].as_str().unwrap());
 command(&mut control,&mut audio,json!({"operation":"source.apply","source":source}));
 assert_eq!(control.presentation().unwrap()["graph"]["signal"]["nodes"].as_array().unwrap().len(),12);
 let recalled=ProjectPackage::parse(&package.save_with_state(control.save_project().unwrap()).unwrap()).unwrap();
 let(mut control,mut audio)=recalled.prepare_native(48000.,128).unwrap();
 command(&mut control,&mut audio,json!({"operation":"control.set","path":"/test/fxslot/slotA/width/amount","value":1.9}));
 for _ in 0..100{render(&mut audio);}assert!(render(&mut audio)>1.);
}

#[test]
fn compatible_cv_noise_and_ring_source_edits_preserve_the_next_samples(){
 fn block(audio:&mut NativeScriptAudio)->Vec<f32>{
  let input:[f32;128]=std::array::from_fn(|i|(i as f32*0.17).sin()*0.2);let opposite=input.map(|v|-v);
  let mut left=[0.;128];let mut right=[0.;128];
  audio.process(AudioBlock{main:Some([&input,&opposite]),sidechain:None,output:[&mut left,&mut right],events:&[]}).unwrap();
  left.into_iter().chain(right).collect()
 }
 for id in ["noise","cv-slew","attenuverter","sample-hold","cv-mix","compare","range","cv-filter","ring","eq8","mixer9","wave-shaper","legacy-filter"]{
  let package=load(id);let(mut control,mut edited)=package.prepare_native(48000.,128).unwrap();
  let(_,mut reference)=package.prepare_native(48000.,128).unwrap();
  for _ in 0..137{assert_eq!(block(&mut edited),block(&mut reference));}
  let old=control.presentation().unwrap();let source=format!("// preserve {} processing state\n{}",id,old["source"].as_str().unwrap());
  control.begin_call("request",&[json!({"operation":"source.apply","source":source})]).unwrap();
  let actual=block(&mut edited);let expected=block(&mut reference);control.poll().unwrap();
  let error=actual.iter().zip(expected).map(|(a,b)|(a-b).abs()).fold(0.0_f32,f32::max);
  assert!(error<1e-6,"{id} state continuity: maximum error {error}");
  for _ in 0..10{assert_eq!(block(&mut edited),block(&mut reference),"{id}");}
 }
}

#[test]
fn networking_settings_are_saved_without_audio_publication_and_recalled_by_native_js() {
 let package=load("network-services");let(mut control,mut audio)=package.prepare_native(48000.,128).unwrap();
 let before=control.presentation().unwrap();
 control.begin_call("request",&[json!({"operation":"network.configure","settings":{"link":{"enabled":true,"quantum":8}}})]).unwrap();
 assert!(!control.is_pending(),"Host settings do not need audio publication");
 let accepted=control.presentation().unwrap();assert_eq!(accepted["graph"]["signal"],before["graph"]["signal"]);
 let saved=control.save_project().unwrap();let recalled=ProjectPackage::parse(&package.save_with_state(saved).unwrap()).unwrap();
 let(mut fresh,_)=recalled.prepare_native(48000.,128).unwrap();assert_eq!(fresh.presentation().unwrap()["network"]["link"]["quantum"],8);
 command(&mut control,&mut audio,json!({"operation":"network.receive","event":{"type":"udp","message":{"path":"/network/tone","value":440}}}));
 assert_eq!(control.presentation().unwrap()["parameters"].as_array().unwrap().iter().find(|p|p["path"]=="/network/tone").unwrap()["value"],440);
}
