import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// A dev server must see either the complete old module or the complete new one.
// Avoid emitting change events at all when regeneration produces identical text.
export async function writeGeneratedFile(destination, content) {
  const path = destination instanceof URL ? fileURLToPath(destination) : destination;
  try {
    if ((await readFile(path, 'utf8')) === content) return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
