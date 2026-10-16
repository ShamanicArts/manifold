import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readProjectPackage, saveProjectPackage } from '@manifold/author/package';

const dsp = new URL('../public/packages/dsp-live-scripting.manifold.json', import.meta.url);
const fx = new URL('../public/packages/fx-slot-swap.manifold.json', import.meta.url);

test('one packaged controller and graph survives a browser-side state export', async () => {
  const packaged = await readProjectPackage(await readFile(dsp, 'utf8'));
  assert.equal(packaged.packageId, 'manifold.dsp-live-scripting');
  const saved = saveProjectPackage(packaged, packaged.state);
  assert.deepEqual((await readProjectPackage(saved)).state, packaged.state);
  assert.equal((await readProjectPackage(await readFile(fx, 'utf8'))).packageId,
    'manifold.fx-slot-swap');
});

test('changed controller code and unsupported package versions fail before import', async () => {
  const original = await readProjectPackage(await readFile(dsp, 'utf8'));
  const altered = structuredClone(original);
  altered.control.bundle += '\n// changed';
  await assert.rejects(readProjectPackage(altered), /controller hash/);
  altered.schemaVersion = 2;
  await assert.rejects(readProjectPackage(altered), /manifest/);
});
