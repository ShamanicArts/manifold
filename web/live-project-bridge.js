import http from 'node:http';
import { existsSync } from 'node:fs';
// Studio's remote MCP adapter is absent from the public library export.
// The specifier is kept out of the import literal so the config bundler does not resolve it.
const remoteMcpModule = new URL('./remote-mcp.js', import.meta.url);
const remoteManifoldMCP = existsSync(remoteMcpModule)
  ? (await import(remoteMcpModule.href)).remoteManifoldMCP
  : () => async (_req, res) => { res.statusCode = 404; res.end('Remote MCP is a Manifold Studio feature'); };
// Development/preview adapter. Project operations execute in the running app,
// using its public runtime session; this broker never constructs an audio graph.
export function liveProjectBridge() {
  const projects = new Map(), pending = new Map();
  const json = (res, code, value) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  const body = async req => {
    let data = '';
    for await (const chunk of req) { data += chunk; if (data.length > 1_000_000) throw new Error('Request exceeds 1 MB'); }
    return JSON.parse(data || '{}');
  };
  const project=id=>{const value=projects.get(id);return value && Date.now()-value.seen<5000 ? value : null;};
  const submit=(id,command,signal)=>new Promise((resolve,reject)=>{
    const live=project(id);
    if(!live)return reject(new Error('No connected live project with this ID'));
    const requestId=crypto.randomUUID();
    const finish=(error,result)=>{
      clearTimeout(timer);pending.delete(requestId);signal?.removeEventListener('abort',abort);
      const current=projects.get(id);
      if(current)current.commands=current.commands.filter(item=>item.requestId!==requestId);
      error ? reject(error) : resolve(result);
    };
    const abort=()=>finish(signal.reason ?? new Error('Request cancelled'));
    const timer=setTimeout(()=>finish(new Error('Live application did not acknowledge the operation')),15000);
    pending.set(requestId,data=>finish(data.error ? Object.assign(new Error(data.error),{code:data.code}) : null,data.result));
    if(signal?.aborted)return abort();
    signal?.addEventListener('abort',abort,{once:true});
    live.commands.push({requestId,command});
  });
  const mcp=remoteManifoldMCP({project,submit,json});
  const middleware = async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/__manifold/')) return next();
    res.setHeader('Cache-Control', 'no-store');
    if(['/__manifold/connection','/__manifold/mcp'].includes(url.pathname)) {
      try {return await mcp(req,res,url);}catch(error){if(!res.headersSent)return json(res,500,{error:error.message});return res.destroy();}
    }
    if (url.pathname === '/__manifold/services') {
      if (req.method !== 'POST') return json(res, 405, { error: 'POST a service command' });
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'Origin does not match this application' });
      const upstream = http.request('http://127.0.0.1:4180/__manifold/services', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 3000,
      }, response => { res.statusCode = response.statusCode; res.setHeader('Content-Type', 'application/json'); response.pipe(res); });
      upstream.on('timeout', () => upstream.destroy(new Error('Service bridge timed out')));
      upstream.on('error', error => { if (!res.headersSent) json(res, 503, { error: 'Native service bridge unavailable: ' + error.message }); });
      req.pipe(upstream);
      return;
    }
    const id = url.searchParams.get('project');
    try {
      // Browser-origin mutations are same-origin; external local/Tailscale tools
      // use the explicit HTTP interface. No cross-site permissive CORS.
      if (req.method === 'POST' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'Origin does not match this application' });
      if (url.pathname === '/__manifold/projects' && req.method === 'GET') {
        return json(res, 200, [...projects].filter(([,p]) => Date.now()-p.seen < 5000).map(([id,p]) => ({ id, title:p.title, task:p.task, revision:p.state?.revision, running:p.state?.running, agentEnabled:p.agentEnabled })));
      }
      if (url.pathname === '/__manifold/state' && req.method === 'POST') {
        const data = await body(req), previous = projects.get(id);
        projects.set(id, { ...data, seen:Date.now(), commands:previous?.commands ?? [] });
        return json(res, 200, { accepted:true });
      }
      const project = projects.get(id);
      if (!project || Date.now()-project.seen > 5000) return json(res, 404, { error:'No connected live project with this ID' });
      if (url.pathname === '/__manifold/state' && req.method === 'GET') return json(res, 200, project.state);
      if (url.pathname === '/__manifold/commands' && req.method === 'GET') return json(res, 200, project.commands.splice(0));
      if (url.pathname === '/__manifold/request' && req.method === 'POST') {
        const command = await body(req);
        const controller=new AbortController();res.on('close',()=>controller.abort());
        try {const result=await submit(id,command,controller.signal);json(res,200,{result});}
        catch(error){if(!res.writableEnded)json(res,409,{error:error.message,code:error.code});}
        return;
      }
      if (url.pathname === '/__manifold/results' && req.method === 'POST') {
        const data = await body(req);
        pending.get(data.requestId)?.(data);
        return json(res, 200, { accepted:true });
      }
      return json(res, 404, { error:'Unknown live-project operation' });
    } catch (error) { json(res, 400, { error:error.message }); }
  };
  return { name:'manifold-live-project-bridge', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
