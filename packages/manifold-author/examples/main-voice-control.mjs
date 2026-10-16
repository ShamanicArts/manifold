// Port of Main/ui/behaviors/voice_manager.lua and lib/adsr_runtime.lua.
// This is project orchestration. DSP remains in the authored Rust graph.
// advance(dt, now) is explicit: a consumer supplies its control clock. A native
// transport/MIDI scheduling service is still required for full Main parity.
const fresh = () => ({
  active: false,
  note: null,
  gate: 0,
  stamp: 0,
  targetAmp: 0,
  currentAmp: 0,
  sentAmp: 0,
  lastAmpPushTime: 0,
  frequency: 220,
  envelopeStage: 'idle',
  envelopeTime: 0,
  envelopeLevel: 0,
  envelopeStartLevel: 0,
});
export function chooseMainVoice(voices) {
  const idle = voices.findIndex((v) => !v.active || v.envelopeStage === 'idle');
  if (idle >= 0) return idle;
  let release = -1;
  for (let index = 0; index < voices.length; index++) {
    if (
      voices[index].envelopeStage === 'release' &&
      (release < 0 || voices[index].envelopeLevel < voices[release].envelopeLevel)
    )
      release = index;
  }
  if (release >= 0) return release;
  return voices.reduce((oldest, v, index) => (v.stamp < voices[oldest].stamp ? index : oldest), 0);
}
export function advanceMainEnvelope(voice, adsr, dt) {
  let stage = voice.envelopeStage,
    level = voice.envelopeLevel;
  if (voice.gate > 0.5) {
    if (stage === 'idle' || stage === 'release') {
      stage = 'attack';
      voice.envelopeStartLevel = level;
    }
    if (stage === 'attack') {
      const progress = voice.envelopeTime / Math.max(0.001, adsr.attack);
      if (progress >= 1) {
        level = 1;
        stage = 'decay';
        voice.envelopeTime = 0;
        voice.envelopeStartLevel = 1;
      } else level = voice.envelopeStartLevel + (1 - voice.envelopeStartLevel) * progress;
    } else if (stage === 'decay') {
      const progress = voice.envelopeTime / Math.max(0.001, adsr.decay);
      if (progress >= 1) {
        level = adsr.sustain;
        stage = 'sustain';
      } else level = 1 - (1 - adsr.sustain) * progress;
    } else if (stage === 'sustain') level = adsr.sustain;
  } else {
    if (stage !== 'release' && stage !== 'idle') {
      stage = 'release';
      voice.envelopeTime = 0;
      voice.envelopeStartLevel = level;
    }
    if (stage === 'release') {
      const progress = voice.envelopeTime / Math.max(0.001, adsr.release);
      if (progress >= 1) {
        level = 0;
        stage = 'idle';
      } else level = voice.envelopeStartLevel * (1 - progress);
    }
  }
  voice.envelopeStage = stage;
  voice.envelopeLevel = level;
  voice.envelopeTime += dt;
  voice.currentAmp = level * Math.max(0, voice.targetAmp);
  return voice.currentAmp;
}
export function createMainVoiceControl(
  project,
  adsrValues = () => ({ attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.4 }),
) {
  let voices = Array.from({ length: 8 }, fresh),
    stamp = 0,
    chain = Promise.resolve();
  // Clone before publication; a rejected host edit must not advance allocation
  // or envelope state. Serialize user notes, ticks and panic through one owner.
  const enqueue = (operation) => {
    const result = chain.then(operation);
    chain = result.catch(() => {});
    return result;
  };
  return {
    snapshot: () => voices.map((v) => ({ ...v })),
    on(note, velocity = 100) {
      return enqueue(async () => {
        if (
          !Number.isInteger(note) ||
          note < 0 ||
          note > 127 ||
          !Number.isInteger(velocity) ||
          velocity < 1 ||
          velocity > 127
        )
          throw new Error('Invalid note/velocity');
        const index = chooseMainVoice(voices),
          frequency = Math.max(20, Math.min(8000, 440 * 2 ** ((note - 69) / 12)));
        await project.setVoices([{ index: index + 1, frequency }]);
        voices[index] = {
          ...fresh(),
          active: true,
          note,
          gate: 1,
          stamp: ++stamp,
          targetAmp: Math.max(0, Math.min(0.4, 0.03 + (velocity / 127) * 0.37)),
          frequency,
          envelopeStage: 'attack',
          sentAmp: -1,
        };
        return project.toProject();
      });
    },
    off(note) {
      return enqueue(() => {
        if (!Number.isInteger(note) || note < 0 || note > 127) throw new Error('Invalid note');
        for (const voice of voices)
          if (voice.active && voice.note === note) {
            voice.gate = 0;
            voice.envelopeStage = 'release';
            voice.envelopeTime = 0;
            voice.envelopeStartLevel = voice.envelopeLevel;
            voice.lastAmpPushTime = 0;
          }
        return project.toProject();
      });
    },
    advance(dt, now) {
      return enqueue(async () => {
        if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(now) || now < 0)
          throw new Error('Invalid control clock');
        const next = voices.map((v) => ({ ...v })),
          edits = [],
          adsr = adsrValues();
        for (const [index, voice] of next.entries()) {
          const amplitude = advanceMainEnvelope(voice, adsr, dt);
          const changed = Math.abs(amplitude - voice.sentAmp) >= 0.0015;
          const rest = amplitude <= 0.0015 && voice.sentAmp > 0.0015;
          if (changed && (now - voice.lastAmpPushTime >= 1 / 60 || rest)) {
            edits.push({ index: index + 1, amplitude });
            voice.sentAmp = amplitude;
            voice.lastAmpPushTime = now;
          }
        }
        if (edits.length) await project.setVoices(edits);
        voices = next;
        return project.toProject();
      });
    },
    panic() {
      return enqueue(async () => {
        await project.setVoices(voices.map((_, index) => ({ index: index + 1, amplitude: 0 })));
        voices = Array.from({ length: 8 }, fresh);
        stamp = 0;
        return project.toProject();
      });
    },
  };
}
