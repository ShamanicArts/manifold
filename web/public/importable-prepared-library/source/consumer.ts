import { BrowserGraphHost } from '@manifold/author/browser';
import { createProject } from '@manifold/author/examples/dsp-live-scripting';
async function use(context: AudioContext): Promise<void> {
 const host = new BrowserGraphHost(context, { execution: 'prepared' });
 const project = createProject(host);
 await host.prepare(project.toProject());
 await project.set('/dsp/live/input_gain', 0.375);
 const diagnostics = host.diagnostics;
 if (diagnostics?.execution === 'prepared') console.log(diagnostics.rustProcessedBlocks);
 await host.close();
}
void use;
