// Presentation-only keyboard. Note events go to the project's authored controller.
export function mountKeyboard(element,component,request,onError=console.error){
  const first=component.firstNote ?? 48,count=component.noteCount ?? 25;
  const pointers=new Map(),keys=new Map(),buttons=[];
  const send=event=>Promise.resolve(request({operation:'event.send',event,origin:'retained'})).catch(onError);
  const owner='retained:'+component.id;
  element.className='manifold-keyboard';element.tabIndex=0;
  element.setAttribute('aria-label','Instrument keyboard');
  for(let note=first;note<first+count;note++){
    const button=document.createElement('button');button.type='button';button.dataset.note=String(note);
    const sharp=[1,3,6,8,10].includes(note%12);
    button.className=sharp?'black-key':'white-key';button.textContent=note%12===0?'C'+(Math.floor(note/12)-1):'';
    button.setAttribute('aria-label','MIDI note '+note);element.append(button);buttons.push(button);
    button.onpointerdown=event=>{event.preventDefault();element.focus();button.setPointerCapture(event.pointerId);pointers.set(event.pointerId,note);send({type:'note-on',note,owner:owner+':pointer',velocity:100});};
    const release=event=>{const held=pointers.get(event.pointerId);if(held!==undefined){pointers.delete(event.pointerId);send({type:'note-off',note:held,owner:owner+':pointer'});}};
    button.onpointerup=release;button.onpointercancel=release;button.onlostpointercapture=release;
  }
  const mapping='awsedftgyhujkolp;';
  element.onkeydown=event=>{
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    const index=mapping.indexOf(event.key.toLowerCase());
    if(index<0||index>=count||event.repeat)return;event.preventDefault();
    if(!keys.has(event.code)){keys.set(event.code,first+index);send({type:'note-on',note:first+index,owner:owner+':keys',velocity:100});}
  };
  const up=event=>{const note=keys.get(event.code);if(note!==undefined){keys.delete(event.code);send({type:'note-off',note,owner:owner+':keys'});}};
  const releaseAll=()=>{for(const note of keys.values())send({type:'note-off',note,owner:owner+':keys'});keys.clear();for(const note of pointers.values())send({type:'note-off',note,owner:owner+':pointer'});pointers.clear();};
  window.addEventListener('keyup',up);window.addEventListener('blur',releaseAll);
  element.onblur=releaseAll;
  const panic=document.createElement('button');panic.type='button';panic.textContent='Release all notes';panic.className='keyboard-panic';panic.onclick=()=>{releaseAll();send({type:'panic'});};element.parentElement.append(panic);
  const hint=document.createElement('small');hint.textContent='Focus keyboard • A W S E D F T G Y H U J';element.parentElement.append(hint);
  return {sync(notes=[]){for(const b of buttons)b.classList.toggle('active',notes.includes(Number(b.dataset.note)));},destroy(){releaseAll();window.removeEventListener('keyup',up);window.removeEventListener('blur',releaseAll);}};
}
