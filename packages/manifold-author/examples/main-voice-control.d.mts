import type { MainWaveProject } from './main-wave-graph.mjs';
import type { GraphWorkspaceProject } from '../index.js';
export interface MainControlVoice { active: boolean; note: number | null; gate: number; stamp: number;
  targetAmp: number; currentAmp: number; sentAmp: number; lastAmpPushTime: number; frequency: number;
  envelopeStage: 'idle' | 'attack' | 'decay' | 'sustain' | 'release';
  envelopeTime: number; envelopeLevel: number; envelopeStartLevel: number; }
export interface MainAdsr { attack: number; decay: number; sustain: number; release: number; }
export function chooseMainVoice(voices: readonly MainControlVoice[]): number;
export function advanceMainEnvelope(voice: MainControlVoice, adsr: MainAdsr, dt: number): number;
export function createMainVoiceControl(project: MainWaveProject, adsrValues?: () => MainAdsr): {
  snapshot(): MainControlVoice[]; on(note: number, velocity?: number): Promise<GraphWorkspaceProject>;
  off(note: number): Promise<GraphWorkspaceProject>; advance(dt: number, now: number): Promise<GraphWorkspaceProject>;
  panic(): Promise<GraphWorkspaceProject>;
};
