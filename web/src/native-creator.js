// Editor client of the native script worker. No graph evaluation or audio host.
export async function connectNativeCreator() {
  let state, nextId=0, tail=Promise.resolve();
  const subscribers=new Set(), pending=new Map();
  let first;
  const ready=new Promise(resolve=>{first=resolve;});
  const accept=document=>{if(!document?.graph?.endpoints || !Array.isArray(document.components))throw new Error('Invalid native creator presentation');state=document;first?.();first=null;for(const listener of subscribers)listener(state);};
  window.manifoldEditorReceive=accept;
  window.manifoldCreatorResult=reply=>{
    const waiter=pending.get(reply.id);if(!waiter)return;
    pending.delete(reply.id);clearTimeout(waiter.timer);
    if(reply.document)accept(reply.document);
    reply.error?waiter.reject(new Error(reply.error)):waiter.resolve(reply.document);
  };
  if(window.__manifoldPendingState){accept(window.__manifoldPendingState);delete window.__manifoldPendingState;}
  const send=command=>new Promise((resolve,reject)=>{
    const id=++nextId;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Native publication did not answer'));},30000);
    pending.set(id,{resolve,reject,timer});
    window.ipc.postMessage(JSON.stringify({version:1,kind:'creator-request',id,command}));
  });
  window.ipc.postMessage(JSON.stringify({version:1,kind:'editor-ready'}));
  await ready;
  return {
    get source(){return state.source;},get revision(){return state.revision;},get project(){return state.graph;},
    snapshot:()=>state,presentation:()=>state,
    save:()=>({format:'manifold.live-project',version:1,source:state.source,graph:state.graph,view:state.view}),
    subscribe(listener){subscribers.add(listener);return()=>subscribers.delete(listener);},
    request(command){const work=tail.then(()=>send({...command,expectedRevision:command.expectedRevision ?? state.revision}));tail=work.catch(()=>{});return work;},
  };
}
