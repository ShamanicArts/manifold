import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveProjectRuntime} from '@manifold/author/live-project';
import {projectFileDataUrl} from '@manifold/author/project-files';
import {getProgram} from '@manifold/author/examples/primitive-library';

test('project files survive save, restore and undo without publishing an audio graph', async () => {
  let graphPublications=0;
  const host={ready:true,replaceGraph:async()=>{graphPublications++;return true;},readPublishedParameters:()=>[]};
  const runtime=new LiveProjectRuntime(host,getProgram('ui-nacre').source);
  const projectSource=runtime.source;
  const file={path:'/assets/crest.svg',mediaType:'image/svg+xml',encoding:'utf8',content:'<svg xmlns="http://www.w3.org/2000/svg"/>'};
  await runtime.request({operation:'file.write',...file,expectedRevision:0});
  assert.equal(graphPublications,0);
  assert.equal(runtime.snapshot().files.find(item=>item.path===file.path).bytes,new TextEncoder().encode(file.content).length);
  assert.deepEqual(await runtime.request({operation:'file.read',path:file.path}),file);
  assert.match(projectFileDataUrl(file),/^data:image\/svg\+xml;char/);
  assert.equal((await runtime.request({operation:'file.read',path:'/project.mjs'})).content,projectSource);
  const saved=runtime.save();
  const detached = runtime.save();
  detached.files[0].content = 'Changed outside the runtime';
  detached.composition.nodes.push({id:123});
  detached.view.length = 0;
  assert.deepEqual(runtime.save(), saved, 'Saved objects must remain detached from accepted state');
  const reopened=new LiveProjectRuntime(null,saved.source,saved);
  assert.deepEqual(await reopened.request({operation:'file.read',path:file.path}),file);
  assert.deepEqual((await runtime.request({operation:'project.save'})).liveAuthoring.files,[file]);
  await runtime.request({operation:'file.remove',path:file.path,expectedRevision:1});
  assert.equal(runtime.snapshot().files.some(item=>item.path===file.path),false);
  await runtime.request({operation:'project.undo',expectedRevision:2});
  assert.deepEqual(await runtime.request({operation:'file.read',path:file.path}),file);
  assert.equal(graphPublications,0);
});

test('project files reject traversal and accept large content', async () => {
  const runtime=new LiveProjectRuntime(null,getProgram('ui-nacre').source);
  const write=(path,content)=>runtime.request({operation:'file.write',path,mediaType:'image/svg+xml',encoding:'utf8',content,expectedRevision:runtime.revision});
  await assert.rejects(write('/assets/../escape.svg','x'),/path/);
  assert.equal(runtime.revision,0);
  const content = '<svg><!--' + 'x'.repeat(2*1024*1024+1) + '--></svg>';
  await write('/assets/large.svg',content);
  assert.equal((await runtime.request({operation:'file.read',path:'/assets/large.svg'})).content,content);
  const saved=runtime.save();
  assert.deepEqual(new LiveProjectRuntime(null,saved.source,saved).save(),saved);
});
