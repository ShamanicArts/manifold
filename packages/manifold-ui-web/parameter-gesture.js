/** A continuous pointer gesture keeps the newest target while a host publishes
 * the previous one. Only acknowledged commands enter the accepted project. */
export function createParameterGesture(runtime, request, onError = console.error) {
  const pending=new Map(),listeners=new Set(),idleWaiters=[];
  let sequence=0,busy=false,scheduled=false,accepted=runtime.snapshot();
  const present=state=>{
    if(!pending.size)return state;
    const graph={...state.graph,controls:state.graph.controls?.map(control=>pending.has(control.path)?{...control,value:pending.get(control.path).value}:control),signal:{...state.graph.signal,initialParameters:state.graph.signal.initialParameters.map(parameter=>{
      const endpoint=(state.graph.endpoints ?? []).find(e=>e.nodeId===parameter.nodeId&&e.id===parameter.id);
      const intent=pending.get(endpoint?.path);return intent?{...parameter,value:intent.value}:parameter;
    })}};
    const parameters=state.parameters?.map(parameter=>pending.has(parameter.path)?{...parameter,value:pending.get(parameter.path).value}:parameter);
    return {...state,graph,...(parameters?{parameters}:{})};
  };
  // Runtime publications already supply an accepted snapshot. Pointer intent
  // only overlays its values; repeatedly cloning source/history here turns an
  // XY gesture into a project-serialization workload.
  const notify=published=>{if(published)accepted=published;const state=present(accepted);for(const listener of listeners)listener(state);if(!busy&&!pending.size)for(const waiter of idleWaiters.splice(0))waiter.resolve();};
  const schedule=()=>{if(busy||scheduled||!pending.size)return;scheduled=true;requestAnimationFrame(flush);};
  async function flush(){
    scheduled=false;if(busy||!pending.size)return;busy=true;
    const first=[...pending.values()][0];
    // One mapped control can fan out to nine DSP targets. Publish controls
    // individually, retaining latest intent; endpoint XY edits remain atomic.
    const sent=[...pending].filter(([,intent])=>intent.operation===first.operation).slice(0,first.operation==='control.set'?1:undefined).map(([path,intent])=>({path,...intent}));
    try {
      const state=await request({operation:first.operation==='control.set'?'control.batch':'parameter.batch',edits:sent.map(({path,value})=>({path,value})),origin:sent[0].origin});
      for(const intent of sent){
        const current=pending.get(intent.path);
        if(current?.sequence===intent.sequence){pending.delete(intent.path);for(const waiter of current.waiters)waiter.resolve(state);}
      }
    }catch(error){
      for(const intent of sent){const current=pending.get(intent.path);if(current?.sequence===intent.sequence){pending.delete(intent.path);for(const waiter of current.waiters)waiter.reject(error);}}
      onError(error);
    }finally{busy=false;notify();schedule();}
  }
  const unsubscribe=runtime.subscribe(notify);
  function setBatch(edits,origin='human',operation='parameter.set'){
    if(!Array.isArray(edits)||!edits.length||new Set(edits.map(edit=>edit.path)).size!==edits.length)
      return Promise.reject(new TypeError('Expected nonempty distinct gesture targets'));
    const promises=edits.map(({path,value})=>new Promise((resolve,reject)=>{
      const old=pending.get(path);pending.set(path,{value,origin,operation,sequence:++sequence,waiters:[...(old?.waiters??[]),{resolve,reject}]});
    }));
    // An XY surface is one intent. Paint both targets together, then send the
    // latest pair through the same bounded, acknowledged queue as a slider.
    notify();schedule();return Promise.all(promises).then(states=>states.at(-1));
  }
  return {
    set(path,value,origin='human',operation='parameter.set'){
      return setBatch([{path,value}],origin,operation);
    },
    setBatch,
    present,
    snapshot:()=>present(runtime.snapshot()),presentation:()=>present(runtime.presentation(accepted)),
    frame:()=>runtime.frame(),
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    settled(){if(!busy&&!pending.size)return Promise.resolve();return new Promise((resolve,reject)=>{idleWaiters.push({resolve,reject});schedule();});},
    destroy(){unsubscribe();const error=new Error('View closed');for(const intent of pending.values())for(const waiter of intent.waiters)waiter.reject(error);for(const waiter of idleWaiters.splice(0))waiter.reject(error);pending.clear();listeners.clear();},
  };
}
