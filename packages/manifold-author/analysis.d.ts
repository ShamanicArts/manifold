export interface StereoAnalysis {
  peak: number;
  rms: number;
  pitchHz: number;
  confidence: number;
  peaks: Float32Array;
}
export function analyzeStereo(stereo: Float32Array, sourceRate: number): Promise<StereoAnalysis>;
