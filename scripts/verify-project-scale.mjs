// Run through scripts/with-private-null-audio.py. No physical audio devices.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'http://127.0.0.1:4174';
const output = process.env.MANIFOLD_SCALE_REPORT ?? '/tmp/manifold-project-scale-browser.json';
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const results = [];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(site + '/package-project.html');
  for (const execution of ['prepared', 'worker']) {
    results.push(await page.evaluate(async execution => {
      const graph = (count, level=1) => ({format:'manifold.project',schemaVersion:1,projectId:'manifold.graph-workspace',
        instances:Array.from({length:count},(_,i)=>({path:`/stage-${i}`,nodeId:i+4})),
        signal:{inputs:2,outputs:2,inputSource:'external',
          nodes:[{id:1,type:'input.raw'},{id:3,type:'output'},...Array.from({length:count},(_,i)=>({id:i+4,type:'gain',a:0.7}))],
          connections:[...Array.from({length:count},(_,i)=>({from:i===0?1:i+3,to:i+4,inputPort:0,outputPort:0})),{from:count+3,to:3,inputPort:0,outputPort:0}],
          initialParameters:Array.from({length:count},(_,i)=>({nodeId:i+4,id:0,value:i===0?level:1}))}});
      const context = new AudioContext({sampleRate:48000});
      await context.resume();
      const host = new window.manifoldProject.Host(context,{execution});
      const source = context.createConstantSource(); source.offset.value = 0.25;
      const analyser = context.createAnalyser(); analyser.fftSize=256;
      const steps=[];
      try {
        await host.prepare(graph(600));
        host.connect(source,analyser); analyser.connect(context.destination); source.start();
        for(const [count,level] of [[600,1],[620,0.5],[580,0.75]]) {
          if(steps.length) await host.replaceGraph(graph(count,level));
          const samples=new Float32Array(256);
          let mean=0;
          const until=performance.now()+8000;
          do {
            await new Promise(r=>setTimeout(r,50));
            analyser.getFloatTimeDomainData(samples);
            mean=samples.reduce((a,b)=>a+b,0)/samples.length;
          } while(Math.abs(mean-0.25*level)>0.0001 && performance.now()<until);
          if(Math.abs(mean-0.25*level)>0.0001) throw Error(`${execution}: ${count} nodes produced ${mean}, expected ${0.25*level}`);
          steps.push({nodes:count+2,connections:count+1,parameters:count,expected:0.25*level,mean,diagnostics:host.diagnostics});
        }
        const measure = async expected => {
          const samples = new Float32Array(256); let mean = 0;
          const until = performance.now() + 8000;
          do {
            await new Promise(resolve => setTimeout(resolve, 50));
            analyser.getFloatTimeDomainData(samples);
            mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
          } while (Math.abs(mean - expected) > 0.0001 && performance.now() < until);
          if (Math.abs(mean - expected) > 0.0001) throw Error(`${execution}: expected ${expected}, heard ${mean}`);
          return mean;
        };
        const updates = Array.from({length:580}, (_, i) => ({nodeId:i+4, id:0, value:Math.pow(0.5, 1/580)}));
        await host.setParameterBatch(updates);
        const batchMean = await measure(0.125);
        let rejected = false;
        try { await host.setParameterBatch(updates.map((edit, i) => ({...edit, value:i === 579 ? -1 : 0.5}))); }
        catch { rejected = true; }
        if (!rejected) throw Error('An invalid large transaction was accepted');
        const retainedMean = await measure(0.125);
        const wide = graph(3), ids = [65536, 0x1000000, 0xfffffffe];
        const remap = id => id < 4 ? id : ids[id - 4];
        wide.instances.forEach(node => { node.path = `/wide-${node.nodeId}`; node.nodeId = remap(node.nodeId); });
        wide.signal.nodes.forEach(node => { node.id = remap(node.id); });
        wide.signal.initialParameters.forEach(parameter => { parameter.nodeId = remap(parameter.nodeId); });
        wide.signal.connections.forEach(edge => { edge.from = remap(edge.from); edge.to = remap(edge.to); });
        await host.replaceGraph(wide);
        await host.setParameterBatch(ids.map((nodeId, index) => ({nodeId, id:0, value:index === 2 ? 0.5 : 1})));
        const wideIdMean = await measure(0.125);
        return {execution,steps,largeBatch:{targets:580,batchMean,rejected,retainedMean},wideIds:{ids,mean:wideIdMean}, finalDiagnostics:host.diagnostics};
      } finally { try { source.stop(); } catch {} await host.close(); source.disconnect(); await context.close(); }
    },execution));
  }
  assert.deepEqual(errors,[]);
  for(const result of results) {
    assert.ok(result.steps[1].diagnostics.lastTransferredNodes>=600);
    assert.ok(result.steps[2].diagnostics.lastTransferredNodes>=580);
    if(result.execution==='prepared') for(const step of [...result.steps, {diagnostics:result.finalDiagnostics}]) {
      assert.equal(step.diagnostics.rustCallbackAllocations,0);
      assert.equal(step.diagnostics.rustCallbackDeallocations,0);
      assert.equal(step.diagnostics.rustProcessingFailures,0);
    }
  }
  await writeFile(output, JSON.stringify({results,errors},null,2));
  console.log(JSON.stringify({output,executions:results.map(r=>r.execution),errors}));
} finally { await browser.close(); }
