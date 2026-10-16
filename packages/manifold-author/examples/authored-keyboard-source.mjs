// Shared editable project orchestration, independent of the voice factory.
// Callers provide ADSR_BASE, envelopeId, startVoice, silenceVoice, releaseVoice and chooseMainVoice.
export const authoredKeyboardSource = `
// Allocation is project orchestration; envelopes and oscillator samples run in Rust.
const emptyVoice=()=>({active:false,note:null,gate:0,stamp:0,owner:'',channel:0,
  startedAt:0,releasedAt:0,releaseLevel:0,velocity:0,keyDown:0,envelopeStage:'idle',envelopeLevel:0});
const eventState={stamp:0,sustain:{},voices:Array.from({length:8},emptyVoice)};
function onEvent(session,event,state) {
  const project=session.toProject(),controls=new Map(project.controls.map(c=>[c.path,c.value]));
  const get=name=>controls.get(ADSR_BASE+'/'+name);
  const owner=String(event.owner ?? 'user'),channel=event.channel ?? 0;
  if(!Number.isInteger(channel)||channel<0||channel>15)throw new GraphContractError('invalid-event','Invalid MIDI channel');
  const next=structuredClone(state);
  for(const voice of next.voices) {
    const age=Math.max(0,event.at-voice.startedAt);
    if(voice.gate) {
      voice.envelopeLevel=age<get('attack')?age/get('attack'):
        age<get('attack')+get('decay')?1-(1-get('sustain'))*(age-get('attack'))/get('decay'):get('sustain');
      voice.envelopeStage='sustain';
    } else if(voice.active) {
      voice.envelopeLevel=voice.releaseLevel*Math.max(0,1-(event.at-voice.releasedAt)/get('release'));
      voice.envelopeStage=voice.envelopeLevel>0?'release':'idle';
      if(voice.envelopeStage==='idle')voice.active=false;
    }
  }
  if(event.type==='panic') {
    for(const [index,voice] of next.voices.entries()) {
      if((event.owner==null||voice.owner===owner)&&(event.channel==null||voice.channel===channel)) {
        silenceVoice(session,index);
        session.parameters([{nodeId:envelopeId(index),id:4,value:0}]);
        next.voices[index]=emptyVoice();
      }
    }
    for(const key of Object.keys(next.sustain)) {
      const separator=key.lastIndexOf(':');
      if((event.owner==null||key.slice(0,separator)===owner)&&(event.channel==null||Number(key.slice(separator+1))===channel))delete next.sustain[key];
    }
    return next;
  }
  if(event.type==='all-notes-off') {
    for(const [index,voice] of next.voices.entries()) {
      if(voice.gate&&voice.owner===owner&&voice.channel===channel) {
        voice.keyDown=0;
        if(next.sustain?.[owner+':'+channel])continue;
        releaseVoice(session,index);
        voice.gate=0;voice.releasedAt=event.at;voice.releaseLevel=voice.envelopeLevel;voice.envelopeStage='release';
      }
    }
    return next;
  }
  if(event.type==='sustain') {
    if(typeof event.down!=='boolean')throw new GraphContractError('invalid-event','Sustain must be boolean');
    next.sustain ??= {};
    next.sustain[owner+':'+channel]=event.down;
    if(!event.down)for(const [index,voice] of next.voices.entries()) {
      if(voice.gate&&!voice.keyDown&&voice.owner===owner&&voice.channel===channel) {
        releaseVoice(session,index);
        voice.gate=0;voice.releasedAt=event.at;voice.releaseLevel=voice.envelopeLevel;voice.envelopeStage='release';
      }
    }
    return next;
  }
  if(!['note-on','note-off'].includes(event.type)||!Number.isInteger(event.note)||event.note<0||event.note>127)
    throw new GraphContractError('invalid-event','Expected a MIDI note-on, note-off or panic');
  if(event.type==='note-on') {
    const velocity=event.velocity ?? 100;
    if(!Number.isInteger(velocity)||velocity<1||velocity>127)throw new GraphContractError('invalid-event','Invalid note velocity');
    const index=chooseMainVoice(next.voices),stamp=(next.stamp%1000000)+1;
    startVoice(session,index,event.note,Math.min(.4,.03+velocity/127*.37));
    session.parameters([{nodeId:envelopeId(index),id:4,value:1},{nodeId:envelopeId(index),id:5,value:stamp}]);
    next.stamp=stamp;
    next.voices[index]={...emptyVoice(),active:true,note:event.note,gate:1,stamp,owner,channel,
      startedAt:event.at,velocity,keyDown:1,envelopeStage:'attack'};
  } else for(const [index,voice] of next.voices.entries()) {
    if(voice.gate && voice.note===event.note && voice.owner===owner && voice.channel===channel) {
      voice.keyDown=0;
      if(next.sustain?.[owner+':'+channel])continue;
      releaseVoice(session,index);
      voice.gate=0;voice.releasedAt=event.at;voice.releaseLevel=voice.envelopeLevel;voice.envelopeStage='release';
    }
  }
  return next;
}
`;
