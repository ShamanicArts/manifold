// This is a complete user-authored graph and message mapping. DSP is in Rust;
// JavaScript describes the instrument, its controls and external interactions.
export const source = `
const graph = manifold.createGraphWorkspace().setInputSource('none');

const tone = graph.add('oscillator', { id: 4 });
const pulse = graph.add('lfo', { id: 5 });
const movement = graph.add('modulated-gain', { id: 6 });
const volume = graph.add('gain', { id: 7 });
const playback = graph.add('gain', { id: 8 });

graph.setParameter(tone, 1, 220);
graph.setParameter(tone, 2, 0.16);
graph.setParameter(pulse, 1, 2);
graph.setParameter(movement, 0, 0.5);
graph.setParameter(movement, 1, 0.5);
graph.setParameter(volume, 0, 0.7);
graph.setParameter(playback, 0, 1);

graph.connect(tone.output('out'), movement.input('audio'));
graph.connect(pulse.output('uni'), movement.input('cv'));
graph.connect(movement.output('out'), volume.input('audio'));
graph.connect(volume.output('out'), playback.input('audio'));
graph.connect(playback.output('out'), graph.find(3).input('in'));

function parameter(path, node, id, min, max, initial) {
  graph.registerParameter(path, node, id, { min, max, default: initial });
}
parameter('/network/tone', tone, 1, 40, 2000, 220);
parameter('/network/pulse', pulse, 1, 0.1, 20, 2);
parameter('/network/volume', volume, 0, 0, 1, 0.7);
parameter('/network/play', playback, 0, 0, 1, 1);

const view = [
  { id: 'tone', type: 'parameter', path: '/network/tone', label: 'Tone', unit: 'Hz' },
  { id: 'pulse', type: 'parameter', path: '/network/pulse', label: 'Pulse rate', unit: 'Hz' },
  { id: 'volume', type: 'parameter', path: '/network/volume', label: 'Volume' },
  { id: 'play', type: 'parameter', path: '/network/play', label: 'Playback gate' },
];

// Port zero chooses an available port. Connection status shows the actual ports.
// TCP/UDP messages are JSON: { "path": "/network/tone", "value": 440 }
// TCP uses one JSON object per line. OSC uses the path and one numeric argument.
const network = {
  tcp: '127.0.0.1:0',
  udp: '127.0.0.1:0',
  osc: '127.0.0.1:0',
  oscQuery: '127.0.0.1:0',
  link: { enabled: false, tempo: 120, quantum: 4, startStopSync: false },
};

function onNetwork(event, accepted) {
  if (event.type === 'link') {
    const edits = [];
    const current = (nodeId, id) => accepted.graph.signal.initialParameters.find(p => p.nodeId === nodeId && p.id === id).value;
    if (event.state.tempoSync) {
      const rate = event.state.tempo / 60;
      if (Math.abs(current(5, 1) - rate) > 0.0001) edits.push({ path: '/network/pulse', value: rate });
    }
    const playing = event.state.startStopSync ? Number(event.state.playing) : 1;
    if (current(8, 0) !== playing) edits.push({ path: '/network/play', value: playing });
    if (edits.length === 0) return null;
    return { command: { operation: 'parameter.batch', edits } };
  }

  const message = event.type === 'osc'
    ? { path: event.path, value: event.args[0] }
    : event.message;
  if (!message || typeof message.path !== 'string' || !Number.isFinite(message.value)) {
    throw new Error('Expected a parameter path and a finite numeric value');
  }

  // The runtime validates paths/ranges and acknowledges the sounding graph first.
  return {
    command: { operation: 'parameter.set', path: message.path, value: message.value },
    reply: { accepted: true, path: message.path },
  };
}

return { graph, view, network, onNetwork };
`;
