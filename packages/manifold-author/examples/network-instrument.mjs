// Imports — the tools and DSP definitions used by this instrument.
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
import { createGraphWorkspace, parameterValue } from '@manifold/author';
import { oscillator, lfo, modulatedGain, gain } from '@manifold/author/primitives';
import { defineNetwork } from '@manifold/author/host-services';
export default function createProject() {
  // Interface — four controls shared by the graph, UI and external messages.
  const controls = {
    pitch: {
      id: 'tone',
      path: '/network/tone',
      label: 'Tone',
      unit: 'Hz',
      min: 40,
      max: 2000,
      default: 220,
    },
    pulseRate: {
      id: 'pulse',
      path: '/network/pulse',
      label: 'Pulse rate',
      unit: 'Hz',
      min: 0.1,
      max: 20,
      default: 2,
    },
    volume: {
      id: 'volume',
      path: '/network/volume',
      label: 'Volume',
      min: 0,
      max: 1,
      default: 0.7,
    },
    playback: {
      id: 'play',
      path: '/network/play',
      label: 'Playback gate',
      min: 0,
      max: 1,
      default: 1,
    },
  };
  // Graph definition — this instrument generates sound; it needs no audio input.
  const graph = createGraphWorkspace().setInputSource('none');
  const output = graph.output.input('in');
  // These stable instance IDs keep existing saved projects and automation valid.
  const tone = graph.add(oscillator.type, { id: 4 });
  const pulse = graph.add(lfo.type, { id: 5 });
  const movement = graph.add(modulatedGain.type, { id: 6 });
  const volume = graph.add(gain.type, { id: 7 });
  const playback = graph.add(gain.type, { id: 8 });
  tone.parameter('frequency').expose(controls.pitch);
  pulse.parameter('rate').expose(controls.pulseRate);
  volume.parameter('level').expose(controls.volume);
  playback.parameter('level').expose(controls.playback);
  // Keep the voice quiet. The unipolar LFO moves its gain from half to full level.
  tone.parameter('level').set(0.16);
  movement.parameter('base').set(0.5);
  movement.parameter('depth').set(0.5);
  graph.connect(tone.output('out'), movement.input('audio'));
  graph.connect(pulse.output('uni'), movement.input('cv'));
  graph.connect(movement.output('out'), volume.input('audio'));
  graph.connect(volume.output('out'), playback.input('audio'));
  graph.connect(playback.output('out'), output);
  // External inputs — port zero asks the host to choose an available port.
  // TCP: one JSON object per line. UDP: one JSON object per packet.
  // Both accept { "path": "/network/tone", "value": 440 }.
  // OSC uses the same control path and one numeric argument.
  const network = defineNetwork({
    tcp: '127.0.0.1:0',
    udp: '127.0.0.1:0',
    osc: '127.0.0.1:0',
    oscQuery: '127.0.0.1:0',
    link: { enabled: false, tempo: 120, quantum: 4, startStopSync: false },
  });
  // The host opens these services when networking is connected. It decodes
  // incoming TCP/UDP/OSC/Link events and delivers them to this handler.
  // Declaring a network here does not open sockets during graph compilation.
  network.onEvent(onNetwork);
  // Live behavior — messages become ordinary acknowledged control edits.
  function onNetwork(event, accepted) {
    if (event.type === 'link') {
      return followLink(event.state, accepted.graph);
    }
    const message =
      event.type === 'osc' ? { path: event.path, value: event.args[0] } : event.message;
    if (!message || typeof message.path !== 'string' || !Number.isFinite(message.value)) {
      throw new Error('Expected a parameter path and a finite numeric value');
    }
    // Try changing message.value to message.value / 2, then Apply while playing.
    // The runtime validates the path/range and accepts the audio edit before replying.
    return {
      command: {
        operation: 'parameter.set',
        path: message.path,
        value: message.value,
      },
      reply: { accepted: true, path: message.path },
    };
  }
  function followLink(transport, acceptedGraph) {
    const edits = [];
    if (transport.tempoSync) {
      // One pulse per beat: beats per minute / 60 = pulses per second (Hz).
      // This follows tempo; the LFO's phase is independent of Link's beat clock.
      const rate = transport.tempo / 60;
      const currentRate = parameterValue(acceptedGraph, controls.pulseRate.path);
      if (Math.abs(currentRate - rate) > 0.0001) {
        edits.push({ path: controls.pulseRate.path, value: rate });
      }
    }
    // A separate gate lets transport stop sound without changing the volume knob.
    const playing = transport.startStopSync ? Number(transport.playing) : 1;
    if (parameterValue(acceptedGraph, controls.playback.path) !== playing) {
      edits.push({ path: controls.playback.path, value: playing });
    }
    if (edits.length === 0) return null;
    return { command: { operation: 'parameter.batch', edits } };
  }
  // Presentation — retained and egui views bind to the same declared controls.
  const view = [
    slider(controls.pitch),
    slider(controls.pulseRate),
    slider(controls.volume),
    slider(controls.playback),
  ];
  function slider(control) {
    return {
      id: control.id,
      type: 'parameter',
      path: control.path,
      label: control.label,
      ...(control.unit ? { unit: control.unit } : {}),
    };
  }
  return { graph, view, network };
}
