import { GraphWorkspace } from './index.js';

const PACKAGE_KEYS = ['format', 'schemaVersion', 'packageId', 'packageVersion', 'control', 'state'];
const CONTROL_KEYS = ['language', 'format', 'bundle', 'sha256'];
const exactKeys = (value, keys) => value && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const label = value => typeof value === 'string' && value.length > 0
  && value.length <= 128 && /^[A-Za-z0-9._-]+$/.test(value);
const fail = message => { throw new TypeError(`Invalid Manifold package: ${message}`); };

/** Validate a self-contained controller and project state before importing code. */
export async function readProjectPackage(input) {
  let value;
  try { value = typeof input === 'string' ? JSON.parse(input) : input; }
  catch { fail('JSON'); }
  if (!exactKeys(value, PACKAGE_KEYS) || value.format !== 'manifold.package'
    || value.schemaVersion !== 1 || !label(value.packageId)
    || !label(value.packageVersion)) fail('manifest');
  const control = value.control;
  if (!exactKeys(control, CONTROL_KEYS) || control.language !== 'javascript'
    || control.format !== 'iife' || typeof control.bundle !== 'string'
    || !/^[a-fA-F0-9]{64}$/.test(control.sha256)) fail('control entry');
  const bytes = new TextEncoder().encode(control.bundle);
  if (!bytes.length) fail('control bundle size');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== control.sha256.toLowerCase()) fail('controller hash');
  GraphWorkspace.fromProject(value.state);
  return value;
}

/** Import the same bundled author module used by native QuickJS. */
export async function instantiateProjectPackage(input, host) {
  const packaged = await readProjectPackage(input);
  const source = `${packaged.control.bundle}\nexport default ManifoldProject;`;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  let module;
  try { module = await import(/* @vite-ignore */ url); }
  finally { URL.revokeObjectURL(url); }
  if (typeof module.default?.restoreProject !== 'function') fail('restoreProject entry');
  const controller = module.default.restoreProject(host, structuredClone(packaged.state));
  if (typeof controller?.toProject !== 'function') {
    fail('project controller');
  }
  const expected = GraphWorkspace.fromProject(packaged.state).toProject();
  if (JSON.stringify(controller.toProject()) !== JSON.stringify(expected)) {
    fail('restored graph differs from saved state');
  }
  return { package: packaged, controller };
}

export function saveProjectPackage(packaged, project) {
  GraphWorkspace.fromProject(project);
  return { ...packaged, state: structuredClone(project) };
}
