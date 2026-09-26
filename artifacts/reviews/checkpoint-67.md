# Checkpoint 67 · Loop Capture take to Granulator

Review the [Loop Capture workbench](http://127.0.0.1:4173/?primitive=loop-capture), [Granulator workbench](http://127.0.0.1:4173/?primitive=granulator), [Granulator transfer screenshot](checkpoint-67-loop-to-granulator.png), [Sample instrument transfer screenshot](checkpoint-67-loop-to-sample.png), [Granulator transfer metrics](checkpoint-67-metrics.json), and [Sample instrument transfer metrics](checkpoint-67-sample-metrics.json).

Loop Capture now offers two actions after Record stops: send the bounded stereo take to Sample instrument or to Granulator. Both use the existing worklet capture snapshot, stop the old graph, carry the PCM into the chosen project, and upload it before the new audio graph starts. Granulator exposes its source-region controls for a captured take and labels the route as captured audio. Its source remains immutable during playback, with no copy or lock in the audio callback.

A browser check recorded a roughly 0.44-second take, confirmed the Granulator action became available only after recording stopped, switched to Granulator, showed the captured take and source-region controls, and started audio with no page errors. A second check repeated the flow into Sample instrument and started that instrument with no page errors. The existing **373 offline comparisons across 43 views** remain the DSP baseline from checkpoint 66; this checkpoint changes the browser transfer flow and its review artifact.

The transfer uses a stopped take and starts the destination project afterward. Live cross-project streaming and state-preserving graph replacement remain separate work.
