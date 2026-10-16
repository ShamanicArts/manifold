import { validateWebView, replaceWebViewSource } from './web-view.js';
import { projectFileManifest, projectFilePath, validateProjectFiles } from './project-files.js';
import * as author from './author.js';
import * as primitives from './primitives.js';
import * as creative from './creative.js';
import * as creativeGraph from './creative-graph.js';
import { isDevice, lowerDevice } from './device.js';
import { devicePresentation } from './device-presentation.js';
import { evaluateSource } from './project-source.js';
import { defineNetwork, unpackNetwork } from './network-definition.js';
import { chooseMainVoice } from './examples/main-voice-control.mjs';
import { oscillatorPreviewCurves } from './examples/oscillator-preview.mjs';
import { PORT_CATALOG } from './catalog.generated.js';
import { configuredWorkspaceType } from './workspace-types.js';
import { decodeMidiControl } from './midi-control.js';
import { DeviceMidiInput } from './device-midi.js';
import { applyStudioGraph, planStudioGraphEdit, readStudioGraph, studioGraphMetadataOnly } from './studio-graph.js';
import { exposeStudioParameter, editStudioLayout } from './studio-source.js';
import { planDeviceEdit } from './device-source.js';
import { describeNodeSources, nodeDeclaration } from './node-sources.js';
import { audioGraphPresentation } from './audio-graphs.js';
import { emptyComposition, validateComposition, editComposition, compositionPresentation } from './composition.js';

const copy = value => structuredClone(value);
const metadataEditToken = Symbol('studio metadata edit');
const deviceEditToken = Symbol('Device source edit');
function moveDeviceIdentities(project, moves) {
  if (!moves?.length) return project;
  const next = copy(project);
  for (const instance of next.instances ?? []) for (const move of moves)
    if (instance.path === move.from || instance.path.startsWith(move.from + '/')) {
      instance.path = move.to + instance.path.slice(move.from.length); break;
    }
  for (const entry of [...next.endpoints ?? [], ...next.hostAssignments ?? []]) for (const move of moves) {
    const controlPath = path => path.replace(/^\/device\/[^/]+/, '').replaceAll('/processors/', '/');
    const from = controlPath(move.from);
    if (entry.path?.startsWith(from + '/')) {
      entry.path = controlPath(move.to) + entry.path.slice(from.length); break;
    }
  }
  return next;
}
const canonicalJSON = text => JSON.stringify(JSON.parse(text), (_key,value) => value && typeof value==='object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))) : value);
const failure = (code, message) => { throw new author.GraphContractError(code, message); };
const publicCatalog = Object.fromEntries(author.listPrimitives().map(primitive => [primitive.type, {
  ...PORT_CATALOG[primitive.type], label: primitive.label, category: primitive.category, description: primitive.description, parameters: primitive.parameters ?? [],
}]));
function freezePresentationMetadata(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezePresentationMetadata(child);
    Object.freeze(value);
  }
  return value;
}
// The library catalogue is immutable. Frame readers share it; detached API
// inspections still receive their own copy, as before.
const frameCatalog = freezePresentationMetadata(copy(publicCatalog));

function validateView(view, project) {
  if (!Array.isArray(view)) failure('invalid-view', 'Expected presentation components');
  const paths = new Set(project.endpoints?.map(entry => entry.path)), ids = new Set();
  const controls = new Set(project.controls?.map(entry => entry.path));
  for (const component of view) {
    if (!component || typeof component.id !== 'string' || !component.id || ids.has(component.id)) failure('invalid-view', 'Component IDs must be unique strings');
    ids.add(component.id);
    if (component.style !== undefined && (!['parameter','control','label','curve'].includes(component.type) || !component.style || typeof component.style !== 'object' || Array.isArray(component.style) || Object.entries(component.style).some(([key, value]) => !['accent','background','text'].includes(key) || typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)))) failure('invalid-view', 'Style accepts accent, background and text as six-digit hex colors');
    if (component.height !== undefined && (component.type !== 'curve' || !Number.isFinite(component.height) || component.height < 64 || component.height > 320)) failure('invalid-view', 'Curve height must be 64–320 pixels');
    if (component.fontSize !== undefined && (component.type !== 'label' || !Number.isFinite(component.fontSize) || component.fontSize < 10 || component.fontSize > 32)) failure('invalid-view', 'Label fontSize must be 10–32 pixels');
    for (const field of ['label','path','base','unit','group']) if (component[field] !== undefined && typeof component[field] !== 'string') failure('invalid-view', `${field} must be a string`);
    if (!['parameter','control','label','filter-response','keyboard','curve'].includes(component.type)) failure('invalid-view', `Unknown component ${component.type}`);
    if(component.type==='curve' && (!Array.isArray(component.points)||component.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1))||!/^#[0-9a-f]{6}$/i.test(component.color ?? '#a78bfa')))failure('invalid-view','Curve requires up to 1024 normalized points and a hex color');
    if (component.type === 'control' && !controls.has(component.path)) failure('invalid-view', `Missing control ${component.path}`);
    if (component.type === 'parameter' && !paths.has(component.path)) failure('invalid-view', `Missing endpoint ${component.path}`);
    if (component.type === 'filter-response' && !['type','cutoff','resonance'].every(name => paths.has(`${component.base ?? '/plugin/params'}/${name}`))) failure('invalid-view','Filter response requires mode, cutoff and resonance endpoints');
    if(component.type==='keyboard' && (!Number.isInteger(component.firstNote ?? 48) || (component.firstNote ?? 48)<0 || !Number.isInteger(component.noteCount ?? 25) || (component.noteCount ?? 25)<1 || (component.noteCount ?? 25)>49 || (component.firstNote ?? 48)+(component.noteCount ?? 25)>128))failure('invalid-view','Keyboard range must contain 1–49 valid MIDI notes');
    if (component.choices !== undefined && (!Array.isArray(component.choices) || component.choices.some(choice => typeof choice !== 'string'))) failure('invalid-view','Choices must be strings');
    // Older hand-authored views copied the catalog's choice labels without its
    // numeric mapping. Resolve matching labels from their actual bound parameter;
    // explicitly authored mappings and custom label sets retain their meaning.
    if (component.type === 'parameter' && component.choices && component.choiceValues === undefined) {
      const endpoint = project.endpoints?.find(entry => entry.path === component.path);
      const node = project.signal.nodes.find(entry => entry.id === endpoint?.nodeId);
      const parameter = publicCatalog[node?.type]?.parameters.find(entry => entry.id === endpoint?.id);
      if (parameter?.choiceValues && JSON.stringify(component.choices) === JSON.stringify(parameter.choices))
        component.choiceValues = [...parameter.choiceValues];
    }
    if (component.choiceValues !== undefined && (!Array.isArray(component.choiceValues)
      || component.choiceValues.length !== component.choices?.length
      || component.choiceValues.some(value => !Number.isFinite(value))
      || new Set(component.choiceValues).size !== component.choiceValues.length)) failure('invalid-view','Choice values must be distinct numbers matching the labels');
  }
  return view;
}

function retainUnchangedTargets(previous, accepted, next) {
  const oldNames=new Map((previous.instances ?? []).map(e=>[e.path,e.nodeId]));
  const oldNamedIds=new Set(oldNames.values());
  const newNames=new Map((next.project.instances ?? []).map(e=>[e.nodeId,e.path]));
  const oldNodes=new Map(previous.signal.nodes.map(n=>[n.id,n.type]));
  const key=p=>p.nodeId+':'+p.id;
  const authoredTargets=new Map(previous.signal.initialParameters.map(p=>[key(p),p]));
  const liveTargets=new Map(accepted.signal.initialParameters.map(p=>[key(p),p]));
  const oldEndpoints=new Map((previous.endpoints ?? []).map(p=>[key(p),p]));
  const newEndpoints=new Map((next.project.endpoints ?? []).map(p=>[key(p),p]));
  const byNode=new Map();
  for(const p of next.project.signal.initialParameters){if(!byNode.has(p.nodeId))byNode.set(p.nodeId,[]);byNode.get(p.nodeId).push(p);}
  for(const node of next.project.signal.nodes) {
    const oldId=newNames.has(node.id)?oldNames.get(newNames.get(node.id)):oldNamedIds.has(node.id)?undefined:node.id;
    if(oldId===undefined||oldNodes.get(oldId)!==node.type)continue;
    for(const parameter of byNode.get(node.id) ?? []) {
      const oldKey=oldId+':'+parameter.id;
      const authored=authoredTargets.get(oldKey);
      const live=liveTargets.get(oldKey);
      const before=oldEndpoints.get(oldKey);
      const after=newEndpoints.get(key(parameter));
      // Widening a declared range still admits every prior live target. Keep
      // that target when the authored default and node identity are unchanged.
      const compatibleRange = before?.min===after?.min && before?.max===after?.max
        || before && after && after.min<=before.min && after.max>=before.max;
      if(authored&&live&&live.value!==parameter.value&&authored.value===parameter.value&&compatibleRange) {
        next.graph.setParameter(next.graph.find(node.id),parameter.id,live.value);
      }
    }
  }
  next.project=next.graph.toProject();
  for (const control of next.project.controls ?? []) {
    const before=previous.controls?.find(c=>c.path===control.path);
    const live=accepted.controls?.find(c=>c.path===control.path);
    if(before && live && before.value===control.value && before.min===control.min && before.max===control.max && before.discrete===control.discrete)
      next.graph.setControl(control.path,live.value);
  }
  next.project=next.graph.toProject();
}

// Parameter-only edits use the bounded queue. Topology/metadata changes require
// prepared publication; neither path compiles or calls author code in audio.
function structure(project) {
  const value=copy(project);
  delete value.signal.initialParameters;
  for(const control of value.controls ?? [])delete control.value;
  return JSON.stringify(value);
}

function reconcileProject(result, previous) {
  if(result.reconcile){
    const draft=result.graph.fork();
    const outcome=result.reconcile(draft,copy(previous));
    if(outcome?.then)failure('invalid-control','Graph reconciliation must be synchronous');
    result.graph=author.GraphWorkspace.fromProject(draft.toProject());
    result.project=result.graph.toProject();
    validateView(result.view,result.project);
  }
}

function paintFrame(paint, snapshot, view) {
  if (!paint) return copy(view);
  const frame=[], add=component=>frame.push(component);
  const result=paint(Object.freeze({
    parameter:(path,options={})=>add({...options,id:options.id ?? path,type:'parameter',path}),
    control:(path,options={})=>add({...options,id:options.id ?? path,type:'control',path}),
    label:(text,id=`label-${frame.length}`,options={})=>add({...options,id,type:'label',label:String(text)}),
    keyboard:(options={})=>add({...options,id:options.id ?? 'keyboard',type:'keyboard'}),
    curve:(options)=>add({...options,type:'curve'}),
    filterResponse:(base='/plugin/params',id='response')=>add({id,type:'filter-response',base}),
  }),snapshot);
  if(result?.then)failure('invalid-view','Immediate paint must be synchronous');
  // Module controls belong to the authored graph and remain available in the
  // inspector even when a project supplies its own immediate-mode paint.
  for (const component of view) {
    if (component.group?.startsWith('Module · ') && !frame.some(item=>item.path===component.path)) frame.push(component);
  }
  return validateView(frame,snapshot.graph);
}

function jsonState(value) {
  const serialized=JSON.stringify(value,(_key,entry)=>{
    if(typeof entry==='number'&&!Number.isFinite(entry)||['function','undefined','symbol','bigint'].includes(typeof entry))failure('invalid-event-state','Controller state must be finite JSON');
    return entry;
  });
  if(!serialized)failure('invalid-event-state','Controller state must be serializable');
  return JSON.parse(serialized);
}

function networkSettings(value) {
  if (value === null) return null;
  const config = jsonState(value);
  if (!config || Array.isArray(config) || Object.keys(config).some(key => !['tcp','udp','osc','oscQuery','link'].includes(key))) failure('invalid-network', 'Unknown network setting');
  for (const key of ['tcp','udp','osc','oscQuery']) if (config[key] !== undefined && (typeof config[key] !== 'string' || config[key].length > 128)) failure('invalid-network', 'Expected an IP:port address');
  if (config.link !== undefined) {
    if (!config.link || Array.isArray(config.link) || typeof config.link !== 'object') failure('invalid-network', 'Expected Link settings');
    const allowed = ['enabled','tempoSync','startStopSync','playing','tempo','quantum'];
    for (const [key, value] of Object.entries(config.link)) {
      if (!allowed.includes(key)) failure('invalid-network', 'Unknown Link setting');
      if (['tempo','quantum'].includes(key)) {
        const [min,max] = key === 'tempo' ? [20,300] : [0.25,64];
        if (!Number.isFinite(value) || value < min || value > max) failure('invalid-network', 'Invalid Link ' + key);
      } else if (typeof value !== 'boolean') failure('invalid-network', 'Expected boolean Link setting');
    }
  }
  return config;
}

/** Control-side project source. DSP remains in the prepared Rust host. */
export function evaluateProjectSource(source, { previous } = {}) {
  if (typeof source !== 'string') failure('invalid-source', 'Expected project source text');
  const authoredDevice = evaluateSource(source, {
    'manifold': Object.freeze({ ...creative }),
    'manifold/graph': Object.freeze({ ...creativeGraph }),
    '@manifold/author': Object.freeze({ ...author }),
    '@manifold/author/primitives': Object.freeze({ ...primitives }),
    '@manifold/author/host-services': Object.freeze({ defineNetwork }),
    '@manifold/author/studio-graph': Object.freeze({ applyStudioGraph }),
    '@manifold/author/examples/main-voice-control': Object.freeze({ chooseMainVoice }),
    '@manifold/author/examples/oscillator-preview': Object.freeze({ oscillatorPreviewCurves }),
  }, author, failure);
  const result = isDevice(authoredDevice) ? lowerDevice(authoredDevice, { previous }) : authoredDevice;
  const graph = result?.graph instanceof author.GraphWorkspace
    ? result.graph : author.GraphWorkspace.fromProject(result?.graph);
  const project = graph.toProject();
  audioGraphPresentation(result.editorGraph?.audioGraphs, project, publicCatalog, result.editorGraph?.layout ?? []);
  const view = copy(result.view ?? []);
  for (const module of result.editorGraph?.modules ?? []) {
    for (const parameter of module.definition.parameters ?? []) {
      const path = `${module.path}/${parameter.name}`;
      if (!view.some(component=>component.path===path)) view.push({
        id:path, type:'parameter', path, label:parameter.label ?? parameter.name,
        group:`Module · ${module.definition.label}`,
        ...(parameter.style ? {style:copy(parameter.style)} : {}),
      });
    }
  }
  validateView(view,project);
  if (result.paint !== undefined && typeof result.paint !== 'function') failure('invalid-view', 'paint must be a function');
  if (result.onControl !== undefined && typeof result.onControl !== 'function') failure('invalid-control', 'onControl must be a function');
  if(result.reconcile !== undefined && typeof result.reconcile !== 'function') failure('invalid-control','reconcile must be a function');
  if(result.onEvent !== undefined && typeof result.onEvent !== 'function') failure('invalid-event','onEvent must be a function');
  if(result.onEvent && (typeof result.eventStateSchema !== 'string' || !result.eventStateSchema)) failure('invalid-event','An event controller requires eventStateSchema');
  if (result.onNetwork !== undefined && typeof result.onNetwork !== 'function') failure('invalid-network', 'onNetwork must be a function');
  const declaration = unpackNetwork(result.network);
  if (declaration && result.onNetwork !== undefined) failure('invalid-network', 'Register the handler with network.onEvent only');
  const network = networkSettings(declaration ? declaration.settings : result.network ?? null);
  return { webView: validateWebView(result.webView), editorGraph: result.editorGraph ?? null, network, onNetwork: declaration ? declaration.handler : result.onNetwork ?? null, reconcile:result.reconcile ?? null,onEvent:result.onEvent ?? null,eventStateSchema:result.eventStateSchema ?? null,eventState:jsonState(result.eventState ?? null),graph, project, view, paint: result.paint ?? null, onControl: result.onControl ?? null };
}

// Observations sample a running presentation at a lower cadence than gestures.
// Only changes to its objects, scripts or wiring invalidate the previous sample.
function observationStructure(presentation) {
  const execution = presentation.presentationExecution;
  return JSON.stringify({
    nodes: execution.nodes.map(({ id, path, definition }) => ({ id, path, definition })),
    connections: execution.connections,
    compositeOutputs: execution.compositeOutputs,
    compositeMembers: execution.compositeMembers,
    definitions: presentation.visualDefinitions.filter(d => d.implementation.kind !== 'composition')
      .map(({ id, implementation, sources, inputs, outputs, preview }) => ({ id, implementation, sources, inputs, outputs, preview })),
  });
}

/** One accepted live project shared by UI, source editor and structured agent tools. */
export class LiveProjectRuntime {
  #onEvent; #eventState; #eventStateSchema;
  #deviceMidi = new DeviceMidiInput();
  #network; #onNetwork; #declaredNetwork;
  #webView; #editorGraph; #files = [];
  #composition = emptyComposition(); #visualPresentation;
  #sourceIndex;
  #observationRevision = 0; #observationStructure;
  #host; #graph; #source; #view; #paint; #onControl; #authored; #revision = 0;
  #tail = Promise.resolve(); #listeners = new Set(); #history = []; #events = [];

  constructor(host, source, saved = null) {
    this.#host = host;
    const result = evaluateProjectSource(source, { previous: saved?.graph });
    this.#webView=result.webView;
    this.#editorGraph=result.editorGraph;
    this.#authored=result.project;
    if(saved){result.graph=author.GraphWorkspace.fromProject(saved.graph);result.project=result.graph.toProject();reconcileProject(result,saved.graph);}
    this.#graph = result.graph;
    this.#source = source; this.#view = validateView(saved?.view ? copy(saved.view) : result.view,this.project);
    this.#files = validateProjectFiles(saved?.files ?? []);
    this.#composition = validateComposition(saved?.composition, this.#files, this.project);
    this.#visualPresentation = compositionPresentation(this.#composition, this.#files);
    this.#observationStructure = observationStructure(this.#visualPresentation);
    // Every publication carries the same accepted document metadata. Host
    // saves must not lose files/composition during unrelated DSP edits.
    if (host) this.#host = {
      ...Object.fromEntries(['setParameter','setParameterBatch','readPublishedParameters','sendEvent']
        .filter(key => typeof host[key] === 'function').map(key => [key,host[key].bind(host)])),
      get ready() { return host.ready; },
      get diagnostics() { return host.diagnostics; },
      ...(host.replaceGraph ? {replaceGraph: (graph, metadata) => host.replaceGraph(graph, { files:this.#files, composition:this.#composition, ...metadata })} : {}),
      ...(host.updateMetadata ? { updateMetadata: (graph, metadata) => host.updateMetadata(graph, { files:this.#files, composition:this.#composition, ...metadata }) } : {}),
    };
    this.#paint = result.paint;
    this.#onControl = result.onControl;
    this.#network = result.network; this.#declaredNetwork = result.network; this.#onNetwork = result.onNetwork;
    this.#onEvent=result.onEvent;this.#eventStateSchema=result.eventStateSchema;
    if (saved?.network && result.network) this.#network = networkSettings(saved.network);
    this.#eventState=jsonState(saved?.eventStateSchema===result.eventStateSchema && saved?.eventState!==undefined ? saved.eventState : result.eventState);
    this.frame();
  }

  subscribe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  get project() { return this.#graph.toProject(); }
  get source() { return this.#source; }
  get revision() { return this.#revision; }

  snapshot() {
    const graph = this.project;
    const audio = this.#editorGraph?.deviceHierarchy
      ? devicePresentation(this.#editorGraph, graph, publicCatalog)
      : audioGraphPresentation(this.#editorGraph?.audioGraphs, graph, publicCatalog, this.#editorGraph?.layout ?? []);
    for (const node of audio.audioNodes) if (node.sourceLinks) node.sourceLinks = node.sourceLinks.map((link) =>
      link.declarationPath ? nodeDeclaration(this.#source, node, graph, link.declarationPath) : link);
    const key = JSON.stringify([graph.signal.nodes.map(n=>[n.id,n.type]),graph.instances]);
    if (!this.#sourceIndex || this.#sourceIndex.source!==this.#source || this.#sourceIndex.visual!==this.#visualPresentation || this.#sourceIndex.key!==key) {
      this.#sourceIndex = {source:this.#source,visual:this.#visualPresentation,key,
        links:describeNodeSources(this.#source,graph,this.#composition,this.#visualPresentation.visualDefinitions)};
    }
    return copy({ revision: this.#revision, observationRevision: this.#observationRevision, source: this.#source, graph,
      ...audio,
      nodeSources: {...this.#sourceIndex.links, ...Object.fromEntries(audio.audioNodes.filter(n=>n.sourceLinks).map(n=>[n.id,n.sourceLinks]))},
      webView: this.#webView, editorGraph: this.#editorGraph, composition:this.#composition, ...this.#visualPresentation,
      componentReferences: this.#visualPresentation.componentNodes.filter(node => node.referencePath).flatMap(node => {
        const endpoint = graph.endpoints?.find(parameter => parameter.path === node.referencePath);
        const source = audio.audioNodes.find(item => item.id === endpoint?.nodeId);
        const label = source?.parameters.find(parameter => parameter.path === node.referencePath)?.label;
        return source ? [{from:source.id,to:node.id,label:label || node.referencePath,path:node.referencePath}] : [];
      }),
      componentEdges: this.#visualPresentation.componentEdges.map((edge) => edge.from === graph.signal.nodes.find((n)=>n.type==='output')?.id && graph.signal.io
        ? {...edge,from:audio.audioNodes.find((n)=>n.instance===`/@outputs/${graph.signal.io.outputs[0]?.id}`)?.id ?? edge.from} : edge),
      files:this.#fileManifest(), network: this.#network, view: this.#view,eventState:copy(this.#eventState),eventStateSchema:this.#eventStateSchema, history: this.#events, undoDepth: this.#history.length,
      running: Boolean(this.#host?.ready), diagnostics: this.#host?.diagnostics ?? null });
  }

  /** JS-authored immediate declarations, evaluated outside audio processing. */
  frame() {
    return paintFrame(this.#paint,this.snapshot(),this.#view);
  }

  /** A renderer can reuse the accepted snapshot delivered by subscribe().
   * Paint and host status remain live; no file/source copy is needed per frame.
   * Treat the supplied snapshot and the returned shared document as read-only.
   * With no argument, callers retain the existing detached-snapshot contract. */
  presentation(accepted) {
    const state=accepted ? {...accepted,running:Boolean(this.#host?.ready),diagnostics:this.#host?.diagnostics ?? null} : this.snapshot();
    const types=new Map(state.graph.signal.nodes.map(node=>[node.id,configuredWorkspaceType(node)]));
    return {...state,catalog:accepted ? frameCatalog : copy(publicCatalog),components:paintFrame(this.#paint,state,this.#view),parameters:[...(state.graph.endpoints ?? []).map(endpoint=>({...endpoint,
      discrete:types.get(endpoint.nodeId)?.parameters.find(p=>p.id===endpoint.id)?.discrete ?? false,
      value:state.graph.signal.initialParameters.find(p=>p.nodeId===endpoint.nodeId&&p.id===endpoint.id)?.value})),
      ...(state.graph.controls ?? []).map(control=>({...control,operation:'control.set'}))]};
  }

  #emit(event) {
    this.#events.push({ ...event, revision: this.#revision, at: new Date().toISOString() });
    if (this.#events.length > 100) this.#events.shift();
    for (const listener of this.#listeners) {
      try { listener(this.snapshot()); } catch (error) { console.error('Project view listener failed', error); }
    }
  }

  #remember() {
    // Accepted file tables are replaced, never mutated. History can retain the
    // immutable table without duplicating every embedded image on each edit.
    this.#history.push({ source: this.#source, graph: this.project, files:this.#files, composition:copy(this.#composition), view: copy(this.#view), network:copy(this.#network), authored:this.#authored,eventState:copy(this.#eventState),eventStateSchema:this.#eventStateSchema });
    if (this.#history.length > 32) this.#history.shift();
  }

  #fileManifest() {
    return [...projectFileManifest(this.#files,this.#source,this.#webView?.source),
      ...(this.#editorGraph?.audioGraphs ? [{path:'/audio-graphs.json',mediaType:'application/json',virtual:true,bytes:JSON.stringify(this.#editorGraph.audioGraphs).length}] : []),
      {path:'/composition.json',mediaType:'application/json',virtual:true,bytes:JSON.stringify(this.#composition).length}];
  }

  #adoptPresentation(presentation, force = false) {
    const structure = observationStructure(presentation);
    if (force || structure !== this.#observationStructure) this.#observationRevision = this.#revision + 1;
    this.#observationStructure = structure;
    this.#visualPresentation = presentation;
  }

  async #acceptComposition(composition, files, origin, operation) {
    const next = validateComposition(composition, files, this.project);
    const presentation = compositionPresentation(next, files);
    const {graph, ...metadata} = this.save();
    if (this.#host?.ready && this.#host.updateMetadata) {
      if (await this.#host.updateMetadata(graph, {...metadata,files,composition:next}) === false) failure('host-rejected','Host rejected project metadata');
    }
    this.#remember(); this.#composition = next; this.#files = files; this.#adoptPresentation(presentation);
    this.#revision++; this.#emit({origin,operation,publicationMs:0});
    return this.snapshot();
  }

  request(request) {
    const apply = () => this.#apply(request);
    const result = this.#tail.then(apply);
    this.#tail = result.catch(() => {});
    return result;
  }

  async #apply({ operation, expectedRevision, origin = 'human', ...args }) {
    if (operation === 'project.inspect') return this.presentation();
    if (operation === 'file.list') return this.#fileManifest();
    if (operation === 'file.read') {
      const path = projectFilePath(args.path);
      if (path === '/composition.json') return {path,mediaType:'application/json',encoding:'utf8',content:JSON.stringify(this.#composition,null,2)};
      if (path === '/audio-graphs.json') return {path,mediaType:'application/json',encoding:'utf8',content:JSON.stringify(this.#editorGraph?.audioGraphs ?? {version:1,definitions:[],instances:[]},null,2)};
      if (path === '/project.mjs') return {path,mediaType:'text/javascript',encoding:'utf8',content:this.#source};
      if (path === '/presentation.mjs' && this.#webView) return {path,mediaType:'text/javascript',encoding:'utf8',content:this.#webView.source};
      const file = this.#files.find(item => item.path === path);
      if (!file) failure('missing-file', `Unknown project file ${path}`);
      return copy(file);
    }
    if (operation === 'catalog.list') return copy(publicCatalog);
    if (operation === 'project.save') return { ...this.project, liveAuthoring: {
      format:'manifold.live-project',version:1,source:this.#source,files:copy(this.#files),composition:copy(this.#composition),...(this.#network ? {network:this.#network} : {}),view:copy(this.#view),eventState:copy(this.#eventState),eventStateSchema:this.#eventStateSchema,
    } };
    if (expectedRevision !== undefined && expectedRevision !== this.#revision) {
      failure('revision-conflict', `Expected revision ${expectedRevision}; current revision is ${this.#revision}`);
    }
    if (operation.startsWith('component.')) {
      // Canvas child handles resolve to definition-local IDs. Public callers may
      // instead pass an explicit definition scope and its saved local IDs.
      if (!args.scope && args.id !== undefined) {
        const node = this.#visualPresentation.componentNodes.find(node => node.id === args.id);
        if (node?.ownerDefinition) args = {...args, id:node.localId, scope:node.ownerDefinition};
      }
      const next = editComposition(this.#composition,this.#files,this.project,{operation,...args});
      return this.#acceptComposition(next.composition,next.files,origin,operation);
    }
    // Shared canvas commands retain their domain; visual wires never enter DSP.
    if (operation.startsWith('graph.')) {
      if (operation === 'graph.group' && Array.isArray(args.paths)) {
        const nodes = args.paths.map(path => this.#visualPresentation.componentNodes.find(node => node.instance === path));
        const first = nodes.find(Boolean);
        if (first) {
          if (nodes.some(node => !node || node.implementationKind.startsWith('interface-') || node.scope !== first.scope))
            failure('invalid-composition', 'Select visual nodes in the same graph to group them');
          return this.#apply({operation:'component.group', ids:nodes.map(node => node.localId),
            scope:nodes[0].ownerDefinition || undefined, label:args.label, expectedRevision, origin});
        }
      }
      if (operation === 'graph.ungroup') {
        const group = this.#visualPresentation.componentGroups.find(group => group.id === args.id);
        if (group) return this.#apply({operation:'component.ungroup', group:group.localId,
          scope:group.ownerDefinition || undefined, expectedRevision, origin});
      }
      const visual = this.#visualPresentation.componentNodes.find(node => node.id === args.id || node.instance === args.path);
      if (visual && operation === 'graph.remove') return this.#apply({operation:'component.remove',id:visual.id,expectedRevision,origin});
      if (visual && operation === 'graph.position') return this.#apply({operation:'component.update',id:visual.id,changes:{position:[args.x,args.y]},expectedRevision,origin});
      const to = this.#visualPresentation.componentNodes.find(node => node.instance === args.to);
      if (to && ['graph.connect','graph.disconnect'].includes(operation)) {
        const source = this.#visualPresentation.componentNodes.find(node => node.instance === args.from);
        if (source && source.scope !== to.scope) failure('invalid-composition','Connect through the named graph interface');
        const from = (args.from === '@output' || args.from === `/@outputs/${this.project.signal.io?.outputs[0]?.id}`) ? this.project.signal.nodes.find(node=>node.type==='output')?.id
          : source?.localId
            ?? this.project.instances?.find(node => node.path === args.from)?.nodeId;
        return this.#apply({operation:operation.replace('graph.','component.'),scope:to.ownerDefinition||undefined,from,output:args.output,to:to.localId,input:args.input,expectedRevision,origin});
      }
    }
    if (operation === 'file.write') {
      const path = projectFilePath(args.path);
      if (args.expectedContent !== undefined) {
        const current = await this.#apply({operation:'file.read',path});
        const same=['/composition.json','/audio-graphs.json'].includes(path) ? canonicalJSON(current.content)===canonicalJSON(args.expectedContent) : current.content===args.expectedContent;
        if (!same) failure('file-conflict','Accepted file changed. Merge or reload your draft before saving.');
      }
      if (path === '/composition.json') {
        if (args.encoding !== 'utf8' || args.mediaType !== 'application/json') failure('invalid-file','Composition is JSON text');
        return this.#acceptComposition(JSON.parse(args.content),this.#files,origin,operation);
      }
      if (path === '/audio-graphs.json') {
        if(args.encoding!=='utf8'||args.mediaType!=='application/json') failure('invalid-file','Audio graphs are JSON text');
        return this.#apply({operation:'graph.audio.replace',value:JSON.parse(args.content),expectedRevision,origin});
      }
      if (path === '/project.mjs') {
        if (args.encoding !== 'utf8' || args.mediaType !== 'text/javascript') failure('invalid-file','Project source is JavaScript text');
        return this.#apply({operation:'source.apply',source:args.content,expectedRevision,origin});
      }
      if (path === '/presentation.mjs') {
        if (!this.#webView || args.encoding !== 'utf8' || args.mediaType !== 'text/javascript') failure('invalid-file','No editable JavaScript presentation');
        return this.#apply({operation:'source.apply',source:replaceWebViewSource(this.#source,args.content),expectedRevision,origin});
      }
      const files = this.#files.filter(item => item.path !== path);
      files.push({path,mediaType:args.mediaType,encoding:args.encoding,content:args.content});
      const next = validateProjectFiles(files);
      return this.#acceptComposition(this.#composition,next,origin,operation);
    }
    if (operation === 'file.remove') {
      const path = projectFilePath(args.path);
      if (['/project.mjs','/presentation.mjs','/composition.json','/audio-graphs.json'].includes(path)) failure('invalid-file','Root project files cannot be removed');
      if (!this.#files.some(item => item.path === path)) failure('missing-file',`Unknown project file ${path}`);
      return this.#acceptComposition(this.#composition,this.#files.filter(item => item.path !== path),origin,operation);
    }
    if (['graph.wrap','graph.addInstance','graph.audio.replace','graph.add', 'graph.addModule', 'graph.remove', 'graph.connect', 'graph.disconnect', 'graph.position', 'graph.group', 'graph.ungroup'].includes(operation)) {
      const editedSource = this.#editorGraph?.deviceHierarchy
        ? planDeviceEdit(this.#source, { operation, ...args }, this.project, this.#editorGraph)
        : planStudioGraphEdit(this.#source, { operation, ...args }, this.project);
      if (['graph.position','graph.group','graph.ungroup'].includes(operation)
        && !this.#editorGraph?.deviceHierarchy
        && studioGraphMetadataOnly(this.#source)
        && this.#editorGraph && JSON.stringify(this.#editorGraph) === JSON.stringify(readStudioGraph(this.#source).value)) {
        return this.#apply({operation:'studio.metadata',source:editedSource,expectedRevision,
          origin,semanticOperation:operation,metadataEditToken});
      }
      return this.#apply({ operation: 'source.apply', source: editedSource.source ?? editedSource, expectedRevision,
        origin, semanticOperation: operation, deviceEditToken, identityMoves:editedSource.identityMoves });
    }
    if (operation === 'parameter.expose') {
      const definition = args.definition;
      const instance = this.project.instances?.find(item => item.path === definition?.instance);
      const node = this.project.signal.nodes.find(item => item.id === instance?.nodeId);
      const parameter = publicCatalog[node?.type]?.parameters.find(item => item.name === definition?.parameter);
      if (!parameter) failure('missing-parameter', 'Unknown named primitive parameter');
      if (this.project.endpoints?.some(item => item.nodeId === node.id && item.id === parameter.id))
        failure('parameter-exposed', 'Parameter is already exposed; place its existing binding');
      if (this.project.endpoints?.some(item => item.path === definition.path)) failure('duplicate-path', 'Parameter path already exists');
      const editedSource = this.#editorGraph?.deviceHierarchy
        ? planDeviceEdit(this.#source, {operation,definition}, this.project, this.#editorGraph)
        : exposeStudioParameter(this.#source, definition);
      return this.#apply({operation:'source.apply',source:editedSource.source ?? editedSource,expectedRevision,origin,semanticOperation:operation});
    }
    if (operation === 'presentation.insert' || operation === 'presentation.update') {
      if (operation === 'presentation.insert' && !this.presentation().parameters.some(item => item.path === args.path))
        failure('missing-parameter', 'Unknown parameter binding');
      const editedSource = editStudioLayout(this.#source, this.#webView?.layout ?? [], {operation,...args});
      return this.#apply({operation:'source.apply',source:editedSource.source ?? editedSource,expectedRevision,origin,semanticOperation:operation});
    }
    if (operation === 'network.configure') {
      const started = performance.now();
      if (!this.#network) failure('missing-network', 'Project has no network service declaration');
      const next = { ...this.#network, ...args.settings };
      if (args.settings?.link) next.link = { ...this.#network.link, ...args.settings.link };
      this.#network = networkSettings(next);
      this.#revision++;
      this.#emit({ origin, operation, publicationMs: performance.now() - started });
      return this.snapshot();
    }
    if (operation === 'network.receive') {
      if (!this.#onNetwork) return this.snapshot();
      const mapping = this.#onNetwork(Object.freeze(jsonState(args.event)), this.snapshot());
      if (mapping?.then) failure('invalid-network', 'Network mapping must be synchronous');
      if (!mapping) return this.snapshot();
      const command = mapping.command;
      if (!['parameter.set', 'parameter.batch', 'control.set', 'control.batch'].includes(command?.operation)) {
        failure('invalid-network', 'Network handlers return a parameter/control command');
      }
      const reply = jsonState(mapping.reply ?? null);
      const accepted = await this.#apply({ ...command, origin });
      return { ...accepted, networkReply: reply };
    }
    const started = performance.now();
    if (operation === 'parameter.set' || operation === 'parameter.batch') {
      const edits=operation==='parameter.set'?[{path:args.path,value:args.value}]:args.edits;
      if(!Array.isArray(edits)||!edits.length||new Set(edits.map(edit=>edit.path)).size!==edits.length)failure('invalid-parameters','Expected nonempty distinct parameter edits');
      const project=this.project,candidate=this.#graph.fork();
      const resolved=edits.map(edit=>{
        const endpoint=project.endpoints?.find(entry=>entry.path===edit.path);
        if(!endpoint)failure('missing-endpoint',`Unknown parameter ${edit.path}`);
        candidate.setParameter(candidate.find(endpoint.nodeId),endpoint.id,edit.value);
        return {nodeId:endpoint.nodeId,id:endpoint.id,value:edit.value};
      });
      if(this.#host?.ready){
        if(resolved.length>1&&!this.#host.setParameterBatch)failure('host-capability','Host does not support atomic parameter batches');
        const accepted=this.#host.setParameterBatch?await this.#host.setParameterBatch(resolved):await this.#host.setParameter(resolved[0]);
        if(accepted===false)failure('host-rejected','Audio host rejected the parameter edit');
      }
      this.#graph=candidate;
    } else if (operation === 'control.set' || operation === 'control.batch') {
      if(!this.#onControl)failure('missing-controller','Project source must define onControl');
      const edits=operation==='control.set'?[{path:args.path,value:args.value}]:args.edits;
      if(!Array.isArray(edits)||!edits.length||new Set(edits.map(e=>e.path)).size!==edits.length)failure('invalid-controls','Expected nonempty distinct control edits');
      let candidate=this.#graph.fork();
      const before=this.project;
      for(const edit of edits){
        // Validate before invoking user code. Only the candidate is exposed.
        candidate.setControl(edit.path,edit.value);
        const stage=(parameters,control)=>{
          if(control?.path!==edit.path||control.value!==edit.value)failure('invalid-control','Mapping must commit the requested control');
          for(const p of parameters)candidate.setParameter(candidate.find(p.nodeId),p.id,p.value);
        };
        const result=this.#onControl(Object.freeze({toProject:()=>candidate.toProject(),
          transaction:update=>{
            const draft=candidate.fork(),outcome=update(draft);
            if(outcome?.then)failure('invalid-control','Graph transaction must be synchronous');
            // Detached snapshot prevents retained user references modifying an
            // in-flight candidate while the audio host acknowledges it.
            candidate=author.GraphWorkspace.fromProject(draft.toProject());
          },
          parameterWithControl:(p,c)=>stage([p],c),parametersWithControl:stage}),edit.path,edit.value);
        if(result?.then)failure('invalid-control','Control mapping must be synchronous');
        if(candidate.findControl(edit.path)?.value!==edit.value)failure('invalid-control','Mapping must retain the requested control value');
      }
      const project=candidate.toProject(),structural=structure(project)!==structure(before);
      validateView(this.#view,project);
      paintFrame(this.#paint,{...this.snapshot(),graph:project,revision:this.#revision+1},this.#view);
      const resolved=project.signal.initialParameters.filter(p=>
        before.signal.initialParameters.find(old=>old.nodeId===p.nodeId&&old.id===p.id)?.value!==p.value);
      if(this.#host?.ready&&structural){
        if(!this.#host.replaceGraph)failure('host-capability','Host does not support prepared graph transactions');
        if(await this.#host.replaceGraph(project,{source:this.#source,view:this.#view,eventState:this.#eventState,eventStateSchema:this.#eventStateSchema})===false)failure('host-rejected','Audio host rejected the graph transaction');
      }else if(this.#host?.ready&&resolved.length){
        if(resolved.length>1&&!this.#host.setParameterBatch)failure('host-capability','Host does not support atomic parameter batches');
        const accepted=this.#host.setParameterBatch?await this.#host.setParameterBatch(resolved):await this.#host.setParameter(resolved[0]);
        if(accepted===false)failure('host-rejected','Audio host rejected the control edit');
      }
      this.#graph=candidate;
    } else if (operation === 'event.send' || operation === 'event.midi') {
      const decoded=operation==='event.midi'?decodeMidiControl(args.bytes ?? [],args.owner):args.event;
      if (this.#editorGraph?.deviceHierarchy && !this.#onEvent) {
        const input = this.project.signal.nodes.find(node => node.type === 'midi-input');
        if (!input) failure('missing-midi-input','Declare a MIDI input before playing this Device');
        await this.#deviceMidi.send(this.#host, input.id, decoded);
      } else {
      if(!this.#onEvent)failure('missing-controller','Project source must define onEvent');
      const candidate=this.#graph.fork(),before=this.project;
      const parameters=edits=>{for(const p of edits)candidate.setParameter(candidate.find(p.nodeId),p.id,p.value);};
      const withControl=(edits,control)=>{candidate.setControl(control.path,control.value);parameters(edits);};
      const session=Object.freeze({toProject:()=>candidate.toProject(),parameters,
        parameterWithControl:(p,c)=>withControl([p],c),parametersWithControl:withControl});
      if(!decoded)failure('invalid-event','Unsupported or incomplete MIDI event');
      const event=jsonState({...decoded,at:performance.now()/1000});
      const nextState=this.#onEvent(session,event,copy(this.#eventState));
      if(nextState?.then)failure('invalid-event','Event mapping must be synchronous');
      const state=jsonState(nextState);
      const resolved=candidate.toProject().signal.initialParameters.filter(p=>before.signal.initialParameters.find(old=>old.nodeId===p.nodeId&&old.id===p.id)?.value!==p.value);
      if(this.#host?.ready && resolved.length){
        if(resolved.length>1&&!this.#host.setParameterBatch)failure('host-capability','Host does not support atomic event targets');
        const accepted=this.#host.setParameterBatch?await this.#host.setParameterBatch(resolved):await this.#host.setParameter(resolved[0]);
        if(accepted===false)failure('host-rejected','Audio host rejected the event');
      }
      this.#graph=candidate;this.#eventState=state;
      }
    } else if (operation === 'studio.metadata') {
      if (args.metadataEditToken !== metadataEditToken) failure('invalid-operation','Metadata edit must be planned from a graph command');
      const previous = readStudioGraph(this.#source).value;
      const next = readStudioGraph(args.source).value;
      const dspShape = value => {
        const shape = copy(value);
        delete shape.layout; delete shape.groups;
        return JSON.stringify(shape);
      };
      if (dspShape(previous) !== dspShape(next)) failure('invalid-operation','Metadata edit changed the authored DSP graph');
      if (this.#host?.ready) {
        const metadata = {source:args.source,view:copy(this.#view),eventState:copy(this.#eventState),eventStateSchema:this.#eventStateSchema,
          ...(this.#network ? {network:copy(this.#network)} : {})};
        const accepted = this.#host.updateMetadata
          ? await this.#host.updateMetadata(this.project, metadata)
          : await this.#host.replaceGraph(this.project, metadata);
        if (accepted === false) failure('host-rejected','Audio host rejected the metadata edit');
      }
      this.#remember();
      this.#source = args.source;
      this.#editorGraph = next;
    } else if (operation === 'source.apply') {
      const moves = args.deviceEditToken === deviceEditToken ? args.identityMoves : null;
      const previous = moveDeviceIdentities(this.project, moves);
      const result = evaluateProjectSource(args.source, { previous });
      const authored=result.project;
      const nextNetwork = JSON.stringify(result.network) === JSON.stringify(this.#declaredNetwork) ? this.#network : result.network;
      const eventState=result.eventStateSchema===this.#eventStateSchema ? this.#eventState : result.eventState;
      retainUnchangedTargets(moveDeviceIdentities(this.#authored,moves),previous,result);
      reconcileProject(result,this.project);
      validateComposition(this.#composition,this.#files,result.project);
      paintFrame(result.paint,{...this.snapshot(),graph:result.project,source:args.source,view:result.view,eventState,eventStateSchema:result.eventStateSchema,revision:this.#revision+1},result.view);
      const presentationOnly = ['graph.wrap','graph.audio.replace','graph.position','graph.group','graph.ungroup'].includes(args.semanticOperation)
        && JSON.stringify(result.project) === JSON.stringify(this.project);
      if (this.#host?.ready) {
        const accepted = presentationOnly && this.#host.updateMetadata
          ? await this.#host.updateMetadata(result.project, {source:args.source,view:result.view,eventState,eventStateSchema:result.eventStateSchema,...(nextNetwork ? {network:nextNetwork} : {})})
          : await this.#host.replaceGraph(result.project, {source:args.source,view:result.view,eventState,eventStateSchema:result.eventStateSchema,...(nextNetwork ? {network:nextNetwork} : {})});
        if (accepted === false) failure('host-rejected', 'Audio host rejected the project update');
      }
      this.#remember();
      const keepController = presentationOnly && ['graph.wrap','graph.audio.replace'].includes(args.semanticOperation)
        && !this.#editorGraph?.deviceHierarchy
        && studioGraphMetadataOnly(this.#source);
      this.#source = args.source;
      this.#editorGraph = result.editorGraph;
      if (!keepController) {
        this.#graph = result.graph;
        this.#view = result.view; this.#paint = result.paint; this.#webView = result.webView;
        this.#onControl = result.onControl;
        this.#network = nextNetwork; this.#declaredNetwork = result.network; this.#onNetwork = result.onNetwork;
        this.#onEvent=result.onEvent;this.#eventStateSchema=result.eventStateSchema;this.#eventState=jsonState(eventState);
      }
      this.#authored=authored;
    } else if (operation === 'project.restore') {
      const saved = args.project?.format === 'manifold.project' && args.project.liveAuthoring
        ? { ...args.project.liveAuthoring, graph: args.project } : args.project;
      if (saved?.format !== 'manifold.live-project' || saved.version !== 1) failure('invalid-project', 'Expected a saved live project');
      const files = validateProjectFiles(saved.files ?? []);
      const result = evaluateProjectSource(saved.source, { previous: saved.graph });
      const restoredNetwork = networkSettings(saved.network ?? result.network);
      result.graph=author.GraphWorkspace.fromProject(saved.graph);result.project=result.graph.toProject();
      reconcileProject(result,saved.graph);
      const graph=result.graph;
      const composition=validateComposition(saved.composition,files,graph.toProject());
      const eventState=jsonState(saved.eventStateSchema===result.eventStateSchema && saved.eventState!==undefined ? saved.eventState : result.eventState);
      validateView(saved.view ?? result.view,graph.toProject());
      paintFrame(result.paint,{...this.snapshot(),graph:graph.toProject(),source:saved.source,view:saved.view ?? result.view,eventState,eventStateSchema:result.eventStateSchema,revision:this.#revision+1},saved.view ?? result.view);
      if (this.#host?.ready && await this.#host.replaceGraph(graph.toProject(), {source:saved.source,files,composition,view:saved.view ?? result.view,eventState,eventStateSchema:result.eventStateSchema,...(restoredNetwork ? {network:restoredNetwork} : {})}) === false) failure('host-rejected', 'Audio host rejected the project');
      // A host document switch starts a new undo scope only after adoption.
      if(args.newDocument===true)this.#history=[];else this.#remember();
      this.#deviceMidi = new DeviceMidiInput();
      this.#graph = graph; this.#source = saved.source; this.#files = files; this.#view = copy(saved.view ?? result.view); this.#paint = result.paint; this.#webView = result.webView; this.#editorGraph = result.editorGraph;
      this.#composition=composition;this.#adoptPresentation(compositionPresentation(composition,files), true);
      this.#onControl = result.onControl;
    this.#network = restoredNetwork; this.#declaredNetwork = result.network; this.#onNetwork = result.onNetwork;
      this.#onEvent=result.onEvent;this.#eventStateSchema=result.eventStateSchema;this.#eventState=eventState;
      this.#authored=result.project;
    } else if (operation === 'project.undo') {
      const previous = this.#history.at(-1);
      if (!previous) failure('empty-history', 'No authored edit to undo');
      const result = evaluateProjectSource(previous.source);
      const graph = author.GraphWorkspace.fromProject(previous.graph);
      // Undo restores the graph, not permission to redirect recorded automation.
      const restoredAssignments = graph.listHostAssignments();
      graph.reserveHostSlots(this.#graph.listHostAssignments().filter(entry =>
        !restoredAssignments.some(previous => previous.slot === entry.slot || entry.path !== undefined && previous.path === entry.path)));
      // Compile restored modules before publication, under the authoring budget.
      // Acknowledgement only adopts the already-prepared state, like file edits.
      const visualPresentation = compositionPresentation(previous.composition, previous.files);
      const filesOnly = previous.source === this.#source && JSON.stringify(previous.graph) === JSON.stringify(this.project)
        && JSON.stringify(previous.view) === JSON.stringify(this.#view)
        && JSON.stringify(previous.network) === JSON.stringify(this.#network);
      if (this.#host?.ready && (!filesOnly || this.#host.updateMetadata)) {
        const publish=filesOnly && this.#host.updateMetadata ? this.#host.updateMetadata : this.#host.replaceGraph;
        if (await publish(graph.toProject(), {source:previous.source,files:previous.files,composition:previous.composition,view:previous.view,eventState:previous.eventState,eventStateSchema:previous.eventStateSchema,...(previous.network ? {network:previous.network} : {})}) === false) failure('host-rejected', 'Audio host rejected undo');
      }
      this.#history.pop();
      this.#graph = graph; this.#source = previous.source; this.#files = previous.files; this.#view = previous.view; this.#paint = result.paint; this.#webView = result.webView; this.#editorGraph = result.editorGraph;
      this.#composition=previous.composition;this.#adoptPresentation(visualPresentation);
      this.#onControl = result.onControl;
    this.#network = previous.network ?? result.network; this.#declaredNetwork = result.network; this.#onNetwork = result.onNetwork;
      this.#onEvent=result.onEvent;this.#eventStateSchema=previous.eventStateSchema;this.#eventState=copy(previous.eventState);
      this.#authored=previous.authored;
    } else failure('unknown-operation', `Unknown live operation ${operation}`);
    // Accepted targets come from the sounding engine, including its clamp and
    // native/host automation. Source defaults are not a shadow parameter bank.
    if (this.#host?.ready && this.#host.readPublishedParameters) {
      for (const p of this.#host.readPublishedParameters()) {
        this.#graph.setParameter(this.#graph.find(p.nodeId), p.id, p.value);
      }
    }
    this.#revision++;
    this.#emit({ origin, operation: args.semanticOperation ?? operation, path: args.path, publicationMs: performance.now() - started });
    return this.snapshot();
  }

  save() {
    // File records contain only strings. Detach their records without encoding
    // and parsing megabytes of immutable image data on every native edit.
    return { format: 'manifold.live-project', version: 1, source: this.#source,
      files: this.#files.map(file => ({ ...file })), composition: copy(this.#composition),
      graph: this.project, ...(this.#network ? {network:copy(this.#network)} : {}),
      view: copy(this.#view), eventState: copy(this.#eventState), eventStateSchema: this.#eventStateSchema };
  }

  /** Host automation/readback updates accepted targets without a second DSP bank. */
  adoptPublishedParameters(edits) {
    for (const edit of edits) this.#graph.setParameter(this.#graph.find(edit.nodeId), edit.id, edit.value);
    // Host values are observations, not authored edits. Refresh subscribers
    // without adding history or changing the document revision.
    if (edits.length) for (const listener of this.#listeners) {
      try { listener(this.snapshot()); } catch (error) { console.error('Project view listener failed', error); }
    }
    return this.project;
  }
}
