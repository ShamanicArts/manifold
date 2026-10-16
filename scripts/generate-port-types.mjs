import { PORT_CATALOG } from '../packages/manifold-author/catalog.generated.js';

const ids = Object.keys(PORT_CATALOG).sort();
console.log('// Generated from manifold-core graph metadata. Run scripts/update-port-catalog.sh.');
console.log('export declare const PORT_CATALOG: {');
for (const id of ids) {
  const spec = PORT_CATALOG[id];
  console.log(`  readonly ${JSON.stringify(id)}: {`);
  console.log(`    readonly code: ${spec.code};`);
  console.log(`    readonly args: { ${Object.entries(spec.args).map(([key, value]) => `readonly ${key}: ${value};`).join(' ')} };`);
  console.log(`    readonly configuration: { ${Object.entries(spec.configuration).map(([key, field]) => `readonly ${JSON.stringify(key)}: { readonly argument: ${JSON.stringify(field.argument)}; readonly min: ${field.min}; ${field.max === undefined ? "" : `readonly max: ${field.max};`} readonly default: ${field.default} };`).join(' ')} };`);
  for (const direction of ['inputs', 'outputs']) {
    const ports = spec[direction].map(port =>
      `{ readonly name: ${JSON.stringify(port.name)}; readonly signal: ${JSON.stringify(port.signal)} }`);
    console.log(`    readonly ${direction}: readonly [${ports.join(', ')}];`);
  }
  console.log('    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];');
  console.log('  };');
}
console.log('};');
console.log('export type PrimitiveType = keyof typeof PORT_CATALOG;');
console.log('export type SignalType = "audio" | "control" | "midi";');
console.log('export interface PortDescription { readonly name: string; readonly signal: SignalType; }');
console.log('export type PrimitiveDescription = typeof PORT_CATALOG[PrimitiveType];');
