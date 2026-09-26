/** Map a Web MIDI Event.timeStamp to an AudioWorklet frame. */
export const MIDI_LOOKAHEAD_MS = 12;
const MAX_EVENT_AGE_MS = 1000;
const RENDER_LEAD_BLOCKS = 2;

export function midiFrame(context, eventTimeMs, nowMs = performance.now()) {
  const rate = context.sampleRate;
  const eventTime = Number.isFinite(eventTimeMs) && Math.abs(nowMs - eventTimeMs) <= MAX_EVENT_AGE_MS
    ? eventTimeMs : nowMs;
  const timestamp = context.getOutputTimestamp?.();
  const mapped = timestamp && Number.isFinite(timestamp.contextTime)
    && Number.isFinite(timestamp.performanceTime) && timestamp.performanceTime > 0
    ? timestamp.contextTime + (eventTime - timestamp.performanceTime + MIDI_LOOKAHEAD_MS) / 1000
    : context.currentTime + (eventTime - nowMs + MIDI_LOOKAHEAD_MS) / 1000;
  const earliest = context.currentTime + RENDER_LEAD_BLOCKS * 128 / rate;
  return Math.round(Math.max(mapped, earliest) * rate);
}
