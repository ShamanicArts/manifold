// Build-time formatting only; no formatter is shipped into the audio/runtime.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const ts = require('typescript');
const prettier = require('prettier');
export const creativeFormat = { parser: 'babel', singleQuote: true, printWidth: 100, tabWidth: 2 };
export function authorImports(source) {
  const module = ts.createSourceFile('module.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return module.statements.filter(ts.isImportDeclaration)
    .filter(statement => statement.moduleSpecifier.text.startsWith('@manifold/author'))
    .map(statement => statement.getText(module));
}
export async function formatProjectSource(source) {
  if (!source.includes('Alternative: import * as manifold')) {
    source = source.replace('import ',
      "// Examples name imports so you can trace each tool to its module.\n" +
      "// Alternative: import * as manifold from '@manifold/author';\n" +
      "// Then use manifold.createGraphWorkspace(), manifold.gain, etc.\nimport ");
  }
  const module = ts.createSourceFile('sketch.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (module.parseDiagnostics.length) throw new Error('Invalid sketch syntax: ' + module.parseDiagnostics[0].messageText);
  return prettier.format(source, creativeFormat);
}
