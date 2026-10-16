// Original Rack factory/mapping plus its editable shared creator face.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { authoredKeyboardSource } from './authored-keyboard-source.mjs';
import { rackOscillatorSource } from './rack-oscillator-source.generated.mjs';
export function creatorSource() {
  return (
    rackOscillatorSource +
    `
export default function createProject() {
// Audio interface and composition — host input/output are graph boundaries.
const graph = createGraphWorkspace();
addRackOscillatorModule(graph, { connectOutput: true });
// Eight reusable core envelopes, composed through the public graph contract.
for (let index=1; index<=8; index++) {
  const envelope=graph.add(adsrDefinition.type,{id:30+index});
  graph.registerInstance(OSC_BASE+'/envelopes/'+index,envelope);
  const input=graph.find(13).input('in-'+index);
  graph.disconnect(input);
  graph.connect(graph.find(3+index).output('out'),envelope.input('audio'));
  graph.connect(envelope.output('out'),input);
}
const ADSR_BASE='/keyboard/adsr';
for(const [name,min,max,value] of [['attack',.001,5,.05],['decay',.001,5,.2],['sustain',0,1,.7],['release',.001,10,.4]])
  graph.registerControl(ADSR_BASE+'/'+name,{min,max,default:value});
const control = (name, label, group, choices) => ({ id:name, type:'control',
  path:OSC_BASE+'/'+name, label, group, ...(choices ? {choices} : {}) });
// Presentation — one declared UI serves retained and immediate renderers.
const view = [
  {id:'oscillator-preview',type:'curve',points:[],label:'WAVE MODE',color:'#38bdf8',group:'Preview'},
  {id:'drive-preview',type:'curve',points:[],label:'DRIVE',color:'#f97316',group:'Preview'},
  control('waveform','Waveform','Source',['Sine','Saw','Square','Triangle','Blend','Noise','Pulse','SuperSaw']),
  control('pulseWidth','Pulse width','Source'),
  control('drive','Drive','Source'),
  control('driveShape','Drive shape','Source',['Soft','Hard','Clip','Fold']),
  control('driveBias','Bias','Source'),
  control('unison','Unison','Unison'),
  control('detune','Detune (cents)','Unison'),
  control('spread','Stereo spread','Unison'),
  control('renderMode','Render mode','Additive',['Standard','Additive']),
  control('additivePartials','Partials','Additive'),
  control('additiveTilt','Tilt','Additive'),
  control('additiveDrift','Drift','Additive'),
  control('manualPitch','Pitch (MIDI)','Manual'),
  control('manualLevel','Level','Manual'),
  control('output','Output','Manual'),
  ...['attack','decay','sustain','release'].map(name=>({id:name,type:'control',path:ADSR_BASE+'/'+name,label:name[0].toUpperCase()+name.slice(1),group:'ADSR'})),
  {id:'keyboard',type:'keyboard',firstNote:48,noteCount:25,group:'Play'},
];
let previewKey='',previewModel;
function paint(ui,snapshot) {
  const controls=Object.fromEntries(snapshot.graph.controls.filter(c=>c.path.startsWith(OSC_BASE+'/')).map(c=>[c.path.slice(OSC_BASE.length+1),c.value]));
  const key=JSON.stringify(['waveform','pulseWidth','renderMode','additivePartials','additiveTilt','additiveDrift','drive','driveShape','driveBias'].map(k=>controls[k]));
  if(key!==previewKey){previewKey=key;previewModel=oscillatorPreviewCurves(controls);}
  const preview=previewModel;
  for (const {path,type,...options} of view) {
    if(type==='curve')ui.curve({...options,points:options.id==='drive-preview'?preview.drive:preview.wave,color:options.id==='drive-preview'?'#f97316':preview.color,label:options.id==='drive-preview'?'DRIVE':preview.label});
    else if(type==='keyboard')ui.keyboard({...options,activeNotes:(snapshot.eventState?.voices ?? []).filter(v=>v.gate).map(v=>v.note)});
    else ui.control(path,options);
  }
}
// Live controls — the host invokes this mapper for accepted UI gestures.
function onControl(session,path,value) {
  if(path.startsWith(ADSR_BASE+'/')) {
    const id=['attack','decay','sustain','release'].indexOf(path.split('/').at(-1));
    return session.parametersWithControl(Array.from({length:8},(_,i)=>({nodeId:31+i,id,value})),{path,value});
  }
  return setRackOscillatorControl(session,path,value);
}
// Live events — keyboard/MIDI enter through the returned onEvent hook.
const eventStateSchema='manifold.rack-oscillator.keyboard.v1';
const envelopeId=index=>31+index;
const startVoice=(session,index,note,amplitude)=>{
  setRackOscillatorControl(session,voicePath(index+1)+'/vOct',note);
  setRackOscillatorControl(session,voicePath(index+1)+'/gate',amplitude);
};
const releaseVoice=(session,index)=>session.parameters([{nodeId:envelopeId(index),id:4,value:0}]);
const silenceVoice=(session,index)=>setRackOscillatorControl(session,voicePath(index+1)+'/gate',0);
` +
    authoredKeyboardSource +
    `
return { graph, view, paint, onControl, onEvent, eventState, eventStateSchema };
}`
  );
}
export { source } from './standalone-oscillator-source.generated.mjs';
