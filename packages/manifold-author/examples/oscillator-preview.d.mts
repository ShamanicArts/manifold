export interface PreviewControls {
  waveform?: number; pulseWidth?: number; renderMode?: number;
  additivePartials?: number; additiveTilt?: number; additiveDrift?: number;
  drive?: number; driveShape?: number; driveBias?: number;
}
export function oscillatorPreviewWave(type: number, x: number, width: number): number;
export function oscillatorPreviewRecipe(type: number, width: number): {
  ratio: number; amplitude: number; phase: number;
}[];
export function oscillatorPreviewDrive(x: number, drive: number, shape: number, bias: number): number;
export function oscillatorPreviewCurves(controls: PreviewControls): {
  wave: [number, number][]; drive: [number, number][]; color: string; label: string;
};
