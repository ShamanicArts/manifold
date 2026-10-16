import { parse } from 'acorn';

/** Resolve built-in static imports for synchronous browser/native live authoring.
 * This is a control-side adapter, not a sandbox or a general dependency loader.
 */
export function evaluateSource(source, modules, legacyBindings, fail) {
  const tree = parse(source, {
    ecmaVersion: 2022, sourceType: 'module', allowReturnOutsideFunction: true,
  });
  const isModule = tree.body.some(node => node.type.startsWith('Import') || node.type.startsWith('Export'));
  if (!isModule) return new Function('manifold', `"use strict";\n${source}\n`)(legacyBindings);

  // A real module must not mix the old top-level return form with exports.
  parse(source, { ecmaVersion: 2022, sourceType: 'module' });
  const unsupported = node => {
    if (node.type === 'ImportExpression' || node.type === 'MetaProperty') {
      fail('unsupported-import', 'Live modules currently support static built-in imports; dynamic imports and import.meta need a module host');
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => { if (child?.type) unsupported(child); });
      else if (value?.type) unsupported(value);
    }
  };
  unsupported(tree);

  let entry = '__manifoldProjectDefault';
  while (source.includes(entry)) entry += '_';
  let resolver = '__manifoldResolveImport';
  while (source.includes(resolver)) resolver += '_';
  const replacements = [];
  let hasDefault = false;
  for (const node of tree.body) {
    if (node.type === 'ImportDeclaration') {
      const name = node.source.value;
      if (!Object.hasOwn(modules, name)) fail('unsupported-import', `Live module ${name} is unavailable; supported: ${Object.keys(modules).join(', ')}`);
      const bindings = modules[name];
      const lines = node.specifiers.map(specifier => {
        if (specifier.type === 'ImportNamespaceSpecifier') return `const ${specifier.local.name} = ${resolver}(${JSON.stringify(name)});`;
        const imported = specifier.type === 'ImportDefaultSpecifier' ? 'default' : specifier.imported.name ?? specifier.imported.value;
        if (!Object.hasOwn(bindings, imported)) fail('unknown-import', `${name} does not export ${imported}`);
        return `const ${specifier.local.name} = ${resolver}(${JSON.stringify(name)})[${JSON.stringify(imported)}];`;
      });
      replacements.push({ start: node.start, end: node.end, text: lines.join('\n') });
    } else if (node.type === 'ExportDefaultDeclaration') {
      hasDefault = true;
      const declaration = node.declaration;
      if (declaration.type === 'FunctionDeclaration' && declaration.id) {
        replacements.push({ start: node.start, end: declaration.start, text: '' });
        replacements.push({ start: node.end, end: node.end, text: `\nconst ${entry} = ${declaration.id.name};` });
      } else {
        replacements.push({ start: node.start, end: declaration.start, text: `const ${entry} = ` });
        replacements.push({ start: node.end, end: node.end, text: ';' });
      }
    } else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      replacements.push({ start: node.start, end: node.declaration.start, text: '' });
    } else if (node.type.startsWith('Export')) {
      fail('unsupported-export', 'Live modules use a default project factory and optional exported declarations; re-exports are not yet supported');
    }
  }
  if (!hasDefault) fail('missing-project-export', 'Export a default synchronous project factory');
  let body = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    body = body.slice(0, replacement.start) + replacement.text + body.slice(replacement.end);
  }
  const result = new Function(resolver, `"use strict";\n${body}\nreturn typeof ${entry} === 'function' ? ${entry}() : ${entry};`)(name => modules[name]);
  if (result?.then) fail('async-project', 'Project factories must return synchronously; prepare resources through host services');
  return result;
}
