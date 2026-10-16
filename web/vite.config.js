import { defineConfig } from "vite";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { liveProjectBridge } from './live-project-bridge.js';
import { pluginExportBridge } from './plugin-export-bridge.js';
import { buildHandbook, handbookInputs, handbookSite } from './handbook/build.js';

const handbook = await buildHandbook();

function isolatedPackageReview() {
  const headers = (request, response, next) => {
    if (request.url?.split('?')[0] === '/studio' || request.url?.split('?')[0] === '/studio/') {
      request.url = '/index.html' + (request.url.includes('?') ? '?' + request.url.split('?').slice(1).join('?') : '');
    }
    const path = request.url?.split('?')[0];
    if (path === '/studio.html' || path === '/primitives.html') {
      response.statusCode = 308;
      response.setHeader('Location', (path === '/primitives.html' ? '/library' : '/') + (request.url?.split('?')[1] ? '?' + request.url.split('?')[1] : ''));
      response.end();
      return;
    }
    if (path === '/' || path === '/index.html' || path === '/library' || path === '/library/' || path === '/nacre.html' || path === '/main-wave.html' || path === '/instrument.html' || path === '/oscillator.html' || path === '/filter.html' || path === '/package-project.html' || path === '/graph-runtime-review.html' || path === '/prepared-worklet-prototype.html' || path === '/sample-voice-chain.html'
      || path === '/rack-sample-eight-voice.html'
      || path === '/native-sample-authoring.html'
      || path === '/main-wave-author.html'
      || path === '/arbitrary-io.html'
      || path === '/rack-oscillator.html'
      || path === '/prepared-midi.html'
      || path === '/prepared-loops.html'
      || path === '/learn' || path?.startsWith('/learn/')
      || path?.startsWith('/importable-prepared-library/')
      || path?.startsWith('/examples/filter-import/')
      || path?.startsWith('/examples/instrument-import/')
      || path?.startsWith('/importable-midi-library/')
      || path?.startsWith('/importable-loop-library/')
      || path?.startsWith('/importable-sample-library/')
      || path?.includes('graph-worker') || path?.includes('prepared-compiler')
      || path?.includes('insight-worker')) {
      response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }
    next();
  };
  return { name: 'isolated-package-review',
    configureServer(server) { server.middlewares.use(headers); },
    configurePreviewServer(server) { server.middlewares.use(headers); } };
}

export default defineConfig({
  plugins: [isolatedPackageReview(), handbookSite(handbook), pluginExportBridge(), liveProjectBridge()],
  server: {
    allowedHosts: ['wubulon.tailfac9f9.ts.net'],
    fs: { allow: [resolve(import.meta.dirname), resolve(import.meta.dirname, '../packages/manifold-author'), resolve(import.meta.dirname, '../packages/manifold'), resolve(import.meta.dirname, '../packages/manifold-studio')].filter(existsSync) },
  },
  preview: { allowedHosts: ['wubulon.tailfac9f9.ts.net'] },
  build: {
    target: 'es2022',
    rollupOptions: {
      // The public library export omits Studio and product pages; only build what exists.
      input: Object.fromEntries(Object.entries({
        ...handbookInputs,
        nacre: resolve(import.meta.dirname, "nacre.html"),
        studio: resolve(import.meta.dirname, "index.html"),
        nativeFace: resolve(import.meta.dirname, "native-face.html"),
        nativeSource: resolve(import.meta.dirname, "native-source.html"),
        filter: resolve(import.meta.dirname, "filter.html"),
        oscillator: resolve(import.meta.dirname, "oscillator.html"),
        instrument: resolve(import.meta.dirname, "instrument.html"),
        mainWave: resolve(import.meta.dirname, "main-wave.html"),
        workbench: resolve(import.meta.dirname, "workbench.html"),
        fxModule: resolve(import.meta.dirname, "fx-module.html"),
        standaloneSample: resolve(import.meta.dirname, "standalone-sample.html"),
        graphModule: resolve(import.meta.dirname, "graph-module.html"),
        mainLooper: resolve(import.meta.dirname, "main-looper.html"),
        genericGraph: resolve(import.meta.dirname, "generic-graph.html"),
        packageProject: resolve(import.meta.dirname, "package-project.html"),
        graphRuntimeReview: resolve(import.meta.dirname, "graph-runtime-review.html"),
        preparedWorkletPrototype: resolve(import.meta.dirname, "prepared-worklet-prototype.html"),
        preparedMidi: resolve(import.meta.dirname, "prepared-midi.html"),
        preparedLoops: resolve(import.meta.dirname, "prepared-loops.html"),
        fxSlotSwap: resolve(import.meta.dirname, "fx-slot-swap.html"),
        rackFilterEq: resolve(import.meta.dirname, "rack-filter-eq.html"),
        rackOscillator: resolve(import.meta.dirname, "rack-oscillator.html"),
        phaseVocoder: resolve(import.meta.dirname, "phase-vocoder.html"),
        sampleVoiceChain: resolve(import.meta.dirname, "sample-voice-chain.html"),
        rackSampleEightVoice: resolve(import.meta.dirname, "rack-sample-eight-voice.html"),
        nativeSampleAuthoring: resolve(import.meta.dirname, "native-sample-authoring.html"),
        mainWaveAuthor: resolve(import.meta.dirname, "main-wave-author.html"),
        arbitraryIo: resolve(import.meta.dirname, "arbitrary-io.html"),
      }).filter(([, path]) => existsSync(path))),
    },
  },
});
