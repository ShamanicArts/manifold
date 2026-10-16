#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Studio's controllers are absent from the public library export.
if [ -e projects/studio/controller.mjs ]; then
  node scripts/build-js-project.mjs projects/studio/input-controller.mjs projects/studio/input-controller.bundle.js --check
  node scripts/build-js-project.mjs projects/studio/controller.mjs projects/studio/controller.bundle.js --check
fi
node scripts/generate-rack-oscillator-source.mjs --check
node scripts/generate-main-wave-creator-source.mjs --check
node scripts/build-js-project.mjs packages/manifold-author/examples/live-main-wave-controller.mjs projects/main-wave/live-controller.bundle.js --check
node scripts/generate-main-wave-creator-package.mjs --check
node scripts/build-js-project.mjs packages/manifold-author/examples/live-filter-controller.mjs projects/standalone-filter/live-controller.bundle.js --check
node scripts/build-js-project.mjs packages/manifold-author/examples/live-oscillator-controller.mjs projects/standalone-oscillator/live-controller.bundle.js --check
node scripts/generate-oscillator-creator-package.mjs --check
node scripts/build-js-project.mjs packages/manifold-author/examples/dsp-live-scripting.mjs projects/graph-workspace/dsp-live-project.bundle.js --check
node scripts/build-js-project.mjs packages/manifold-author/examples/fx-slot-swap.mjs projects/graph-workspace/fx-slot-project.bundle.js --check
node scripts/build-js-project.mjs packages/manifold-author/examples/loop-authoring.mjs projects/graph-workspace/loop-authoring-project.bundle.js --check
node scripts/build-js-project.mjs examples/projects/rack-sample-project.mjs projects/graph-workspace/rack-sample-project.bundle.js --check
node scripts/build-js-project.mjs examples/projects/sample-instrument-project.mjs projects/graph-workspace/sample-instrument-project.bundle.js --check
node scripts/build-js-project.mjs examples/projects/main-wave-project.mjs projects/graph-workspace/main-wave-project.bundle.js --check
node scripts/build-js-project.mjs examples/projects/arbitrary-io-project.mjs projects/graph-workspace/arbitrary-io-project.bundle.js --check
node scripts/generate-arbitrary-io-package.mjs --check
node scripts/generate-main-wave-package.mjs --check
node scripts/build-project-package.mjs manifold.main-wave-author 0.1.0 projects/graph-workspace/main-wave-project.bundle.js projects/graph-workspace/main-wave-author-project.json web/public/packages/main-wave-author.manifold.json --check
node scripts/build-project-package.mjs manifold.dsp-live-scripting 0.1.0 projects/graph-workspace/dsp-live-project.bundle.js projects/graph-workspace/authored-dsp-live-scripting.json web/public/packages/dsp-live-scripting.manifold.json --check
node scripts/build-project-package.mjs manifold.fx-slot-swap 0.1.0 projects/graph-workspace/fx-slot-project.bundle.js projects/graph-workspace/authored-fx-slot-swap.json web/public/packages/fx-slot-swap.manifold.json --check
node scripts/generate-sample-author-packages.mjs --check
node scripts/build-project-package.mjs manifold.rack-sample-author 0.1.0 projects/graph-workspace/rack-sample-project.bundle.js projects/graph-workspace/rack-sample-author-project.json web/public/packages/rack-sample-author.manifold.json --check
node scripts/build-project-package.mjs manifold.sample-instrument-author 0.1.0 projects/graph-workspace/sample-instrument-project.bundle.js projects/graph-workspace/sample-instrument-author-project.json web/public/packages/sample-instrument-author.manifold.json --check

node scripts/generate-live-primitive-sources.mjs --check
node scripts/build-js-project.mjs packages/manifold-author/examples/live-primitives-controller.mjs projects/dsp-live-scripting/live-controller.bundle.js --check
node scripts/generate-primitive-packages.mjs --check

if [ -e scripts/generate-studio-devices.mjs ]; then node scripts/generate-studio-devices.mjs --check; fi

node scripts/generate-nacre-composition.mjs --check

# Writes Studio's image-composition package under web/public/studio, absent from the library export.
if [ -e web/public/studio/image-composition.manifold.json ]; then node scripts/generate-image-composition.mjs --check; fi
