import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
test('the Device facade type-checks plain JS and TS, rejecting wrong members and wires', () => {
  const files = [
    'device-types.ts',
    '../../packages/manifold/examples/gain.js',
    '../../packages/manifold/examples/tone.js',
    '../../packages/manifold/examples/spectral.js',
    '../../packages/manifold/examples/explicit-device.js',
    '../handbook/examples/gain.mjs',
    '../handbook/examples/ring.mjs',
    '../handbook/examples/spectral.mjs',
  ];
  const program = ts.createProgram(
    files.map((file) => fileURLToPath(new URL(file, import.meta.url))),
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      noEmit: true,
      allowJs: true,
      checkJs: true,
    },
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    }),
  );
});
