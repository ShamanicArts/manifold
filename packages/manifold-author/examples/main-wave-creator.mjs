// Main's real public Wave graph and routing, with reusable Rust envelopes.
// Full Main's Sample, modulation, FX, rack and quantized looper remain open.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { mainWaveFactorySource } from './main-wave-creator-source.generated.mjs';
import { authoredKeyboardSource } from './authored-keyboard-source.mjs';
export function creatorSource() {
  return (
    mainWaveFactorySource +
    `
export default function createProject() {
// Audio interface and composition — shared synth/input routing.
const graph=buildGraph();
// The original shared Filter follows the voice mixer. Dry monitoring stays dry.
const sharedFilter=addMainSynthFilter(graph,{input:graph.findInstance(MAIN_SYNTH+'/nodes/voice_mixer').output('out')});
for(const name of ['synth_monitor','synth_send']){
  const target=graph.findInstance('/main/nodes/'+name).input('audio');
  graph.disconnect(target);graph.connect(sharedFilter.output('out'),target);
}
const ADSR_BASE=MAIN_SYNTH+'/adsr';
const envelopeId=index=>110+index;
for(let index=0;index<8;index++){
  const envelope=graph.add(adsrDefinition.type,{id:envelopeId(index)});
  graph.registerInstance(voiceBase(index+1)+'/nodes/envelope',envelope);
  const output=graph.findInstance(nodePath(index+1,'output'));
  const mixer=graph.findInstance(MAIN_SYNTH+'/nodes/voice_mixer');
  graph.disconnect(mixer.input('in-'+(index+1)));
  graph.connect(output.output('out'),envelope.input('audio'));
  graph.connect(envelope.output('out'),mixer.input('in-'+(index+1)));
}
for(const [name,min,max,value] of [['attack',.001,5,.05],['decay',.001,5,.2],['sustain',0,1,.7],['release',.001,10,.4]])
  graph.registerControl(ADSR_BASE+'/'+name,{min,max,default:value});
const control=(name,label,group,choices)=>({id:name,type:['output','inputTrim','inputMonitor','master','filterType','cutoff','resonance'].includes(name)?'parameter':'control',path:MAIN_SYNTH+'/'+name,label,group,...(choices?{choices}:{})});
// Presentation — one declared UI serves retained and immediate renderers.
const view=[
  {id:'wave-preview',type:'curve',points:[],label:'WAVE MODE',color:'#38bdf8',group:'Preview'},
  {id:'drive-preview',type:'curve',points:[],label:'DRIVE',color:'#f97316',group:'Preview'},
  control('waveform','Waveform','Wave',['Sine','Saw','Square','Triangle','Blend','Noise','Pulse','SuperSaw']),
  control('pulseWidth','Pulse width','Wave'),control('drive','Drive','Wave'),
  control('driveShape','Drive shape','Wave',['Soft','Hard','Clip','Fold']),
  control('driveBias','Bias','Wave'),control('driveMix','Drive mix','Wave'),
  control('unison','Unison','Tone'),control('detune','Detune (cents)','Tone'),
  control('spread','Stereo spread','Tone'),
  control('filterType','Filter mode','Tone',['Low pass','Band pass','High pass','Notch']),
  control('cutoff','Filter cutoff (Hz)','Tone'),control('resonance','Filter resonance','Tone'),
  ...['attack','decay','sustain','release'].map(name=>({id:name,type:'control',path:ADSR_BASE+'/'+name,label:name[0].toUpperCase()+name.slice(1),group:'ADSR'})),
  control('output','Synth monitor','Routing'),control('inputTrim','Input trim','Routing'),
  control('inputMonitor','Input monitor','Routing'),control('master','Master','Routing'),
  {id:'keyboard',type:'keyboard',firstNote:48,noteCount:25,group:'Play'},
];
let previewKey='',previewModel;
function paint(ui,snapshot){
  const values=Object.fromEntries(snapshot.graph.controls.filter(c=>c.path.startsWith(MAIN_SYNTH+'/')).map(c=>[c.path.slice(MAIN_SYNTH.length+1),c.value]));
  const key=JSON.stringify(['waveform','pulseWidth','drive','driveShape','driveBias'].map(k=>values[k]));
  if(key!==previewKey){previewKey=key;previewModel=oscillatorPreviewCurves(values);}
  for(const {path,type,...options} of view){
    if(type==='curve')ui.curve({...options,points:options.id==='drive-preview'?previewModel.drive:previewModel.wave,color:options.id==='drive-preview'?'#f97316':previewModel.color,label:options.id==='drive-preview'?'DRIVE':previewModel.label});
    else if(type==='keyboard')ui.keyboard({...options,activeNotes:(snapshot.eventState?.voices??[]).filter(v=>v.gate).map(v=>v.note)});
    else if(type==='parameter')ui.parameter(path,options);
    else ui.control(path,options);
  }
}
// Live controls — the host invokes this mapper for accepted UI gestures.
function onControl(session,path,value){
  if(path.startsWith(ADSR_BASE+'/')){
    const id=['attack','decay','sustain','release'].indexOf(path.split('/').at(-1));
    return session.parametersWithControl(Array.from({length:8},(_,i)=>({nodeId:envelopeId(i),id,value})),{path,value});
  }
  const project=session.toProject(),endpoint=project.endpoints.find(e=>e.path===path);
  if(endpoint)return session.parameterPath(path,value);
  const name=path.slice((MAIN_SYNTH+'/').length);
  const instances=new Map(project.instances.map(i=>[i.path,i.nodeId]));
  if(!path.startsWith(MAIN_SYNTH+'/')||!Object.hasOwn(ranges,name))throw new GraphContractError('unknown-control','Unknown Main Wave control '+path);
  const edits=[];
  for(let index=1;index<=8;index++){
    if(name==='blend/amount')for(const branch of ['mix','direction'])edits.push({nodeId:instances.get(nodePath(index,branch)),id:0,value:value*2-1});
    else edits.push({nodeId:instances.get(nodePath(index,'oscillator')),id:oscillatorIds[name],value});
  }
  return session.parametersWithControl(edits,{path,value});
}
// Live events — keyboard/MIDI enter through the returned onEvent hook.
const eventStateSchema='manifold.main-wave.keyboard.v1';
const startVoice=(session,index,note,amplitude)=>{
  const project=session.toProject(),nodeId=project.instances.find(i=>i.path===nodePath(index+1,'oscillator')).nodeId;
  session.parametersWithControl([{nodeId,id:1,value:Math.max(20,Math.min(8000,440*2**((note-69)/12)))},{nodeId,id:2,value:amplitude}],{path:voiceBase(index+1)+'/gate',value:1});
};
const releaseVoice=(session,index)=>session.parametersWithControl([{nodeId:envelopeId(index),id:4,value:0}],{path:voiceBase(index+1)+'/gate',value:0});
const silenceVoice=(session,index)=>{
  const nodeId=session.toProject().instances.find(i=>i.path===nodePath(index+1,'oscillator')).nodeId;
  return session.parametersWithControl([{nodeId,id:2,value:0}],{path:voiceBase(index+1)+'/gate',value:0});
};
` +
    authoredKeyboardSource +
    `
return {graph,view,paint,onControl,onEvent,eventState,eventStateSchema};
}`
  );
}
export { source } from './main-wave-live-source.generated.mjs';
