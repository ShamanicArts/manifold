import type { VisualDefinition } from './composition.js';
/** Ordered project images. Frame numbers begin at zero. */
export function imageFrames(options?: {
  id?: string;
  label?: string;
  frames?: string[];
}): VisualDefinition;
export const selectImageFrame: VisualDefinition;
export const transformImage: VisualDefinition;
export const imageLayer: VisualDefinition;
export interface Image2D {
  asset: string;
  transform: readonly [number, number, number, number, number, number];
  opacity: number;
}
export interface ImageSequence {
  frames: readonly string[];
}
