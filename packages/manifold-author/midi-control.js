/** Decode device messages into the same authored events used by keyboards/agents.
 * This control adapter neither allocates voices nor processes audio. */
export function decodeMidiControl(data,owner='midi') {
  const status=data[0],a=data[1] ?? 0,b=data[2] ?? 0;
  if(!Number.isInteger(status)||status<128||status>=240)return null;
  const channel=status&15,type=status&240;
  if([128,144,176,224].includes(type)&&(data[1]===undefined||data[2]===undefined))return null;
  if(!Number.isInteger(a)||a<0||a>127||!Number.isInteger(b)||b<0||b>127)return null;
  if(type===144&&b>0)return {type:'note-on',note:a,velocity:b,channel,owner};
  if(type===128||type===144)return {type:'note-off',note:a,channel,owner};
  if(type===224)return {type:'pitch-bend',value:a|(b<<7),channel,owner};
  if(type===176&&a===64)return {type:'sustain',down:b>=64,channel,owner};
  if(type===176&&a===120)return {type:'panic',channel,owner};
  if(type===176&&a===123)return {type:'all-notes-off',channel,owner};
  return null;
}

/** Selected browser input, delivering events to the project's accepted runtime.
 * Device changes release only that input's ownership. No graph or voice state is
 * kept in this adapter. Pass send(event) from any importing application's runtime. */
export class AuthoredMidiInput {
  constructor(send,onStatus=()=>{}) { this.send=send;this.onStatus=onStatus;this.access=null;this.input=null;this.pending=Promise.resolve(); }
  async connect(requestAccess=()=>navigator.requestMIDIAccess({sysex:false})) {
    if(this.access)return this.inputs();
    this.access=await requestAccess();
    this.access.onstatechange=()=>{
      if(this.input?.state==='disconnected')this.select(null).catch(e=>this.onStatus(e.message));
      this.onStatus('MIDI devices updated');
    };
    return this.inputs();
  }
  inputs() { return [...(this.access?.inputs.values() ?? [])].filter(p=>p.state!=='disconnected'); }
  select(id) {
    const result=this.pending.then(()=>this.selectInput(id));
    this.pending=result.catch(()=>{});
    return result;
  }
  async selectInput(id) {
    const next=id==null?null:this.access?.inputs.get(id);
    if(id!=null&&(!next||next.state==='disconnected'))throw new Error('MIDI input is unavailable');
    if(next===this.input)return;
    const old=this.input;
    if(old) {
      const handler=old.onmidimessage;
      old.onmidimessage=null;
      // Retain ownership until release is acknowledged; a failed switch can retry.
      try {await this.send({type:'panic',owner:'midi:'+old.id});}
      catch(error) {old.onmidimessage=handler;throw error;}
      this.input=null;
      await old.close();
    }
    if(next) {
      await next.open();
      this.input=next;
      next.onmidimessage=message=>{
        const event=decodeMidiControl(message.data,'midi:'+next.id);
        if(event)Promise.resolve(this.send(event)).catch(e=>this.onStatus('MIDI event failed: '+e.message));
      };
    }
    this.onStatus(next?'MIDI connected · '+next.name:'MIDI disconnected');
  }
  async disconnect() {
    await this.select(null);
    if(this.access)this.access.onstatechange=null;
    this.access=null;
  }
}
