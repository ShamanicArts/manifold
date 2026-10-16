#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/generate-author-definitions.mjs
node scripts/generate-rack-oscillator-source.mjs
node scripts/generate-main-wave-creator-source.mjs
node scripts/generate-live-primitive-sources.mjs
node scripts/build-js-project.mjs packages/manifold-author/examples/live-primitives-controller.mjs projects/dsp-live-scripting/live-controller.bundle.js
node scripts/generate-primitive-packages.mjs
node scripts/build-js-project.mjs packages/manifold-author/examples/live-main-wave-controller.mjs projects/main-wave/live-controller.bundle.js
node scripts/generate-main-wave-creator-package.mjs
node scripts/build-js-project.mjs packages/manifold-author/examples/live-filter-controller.mjs projects/standalone-filter/live-controller.bundle.js
node scripts/build-js-project.mjs packages/manifold-author/examples/live-oscillator-controller.mjs projects/standalone-oscillator/live-controller.bundle.js
node scripts/generate-oscillator-creator-package.mjs
node scripts/build-js-project.mjs packages/manifold-author/examples/dsp-live-scripting.mjs projects/graph-workspace/dsp-live-project.bundle.js
node scripts/build-project-package.mjs manifold.dsp-live-scripting 0.1.0 projects/graph-workspace/dsp-live-project.bundle.js projects/graph-workspace/authored-dsp-live-scripting.json web/public/packages/dsp-live-scripting.manifold.json
node scripts/build-js-project.mjs packages/manifold-author/examples/fx-slot-swap.mjs projects/graph-workspace/fx-slot-project.bundle.js
node scripts/build-project-package.mjs manifold.fx-slot-swap 0.1.0 projects/graph-workspace/fx-slot-project.bundle.js projects/graph-workspace/authored-fx-slot-swap.json web/public/packages/fx-slot-swap.manifold.json
