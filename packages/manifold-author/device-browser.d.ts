import type { Device, DeviceControl } from './device.js';
import type { BrowserGraphHost, EventAdmission } from './browser.js';

export type BrowserDeviceOptions = Pick<
  NonNullable<ConstructorParameters<typeof BrowserGraphHost>[1]>,
  'preparedWasmUrl' | 'preparedWorkletUrl' | 'preparedCompilerUrl'
>;

/** Uses the shared prepared runtime. Requires cross-origin isolation and AudioWorklet. */
export class BrowserDeviceHost {
  constructor(context: AudioContext, options?: BrowserDeviceOptions);
  readonly ready: boolean;
  readonly diagnostics: BrowserGraphHost['diagnostics'];
  /** Prepare once; the caller controls its own sources and output routing. */
  prepare(device: Device): Promise<this>;
  connectInput(name: string, source: AudioNode | null, sourceOutput?: number): this;
  connectOutput(name: string, destination: AudioNode, destinationInput?: number): this;
  sendMidi(
    input: string,
    event: {
      type: 'noteOn' | 'noteOff' | 'allNotesOff' | 'pitchBend';
      value?: number;
      note?: number;
      velocity?: number;
      channel?: number;
      offset?: number;
    },
  ): Promise<EventAdmission | void>;
  /** Await the runtime's acceptance. Returns the accepted value. */
  setControl(control: DeviceControl, value: number): Promise<number>;
  /** Disconnect owned routes and dispose the runtime; leave the caller's context open. */
  close(): Promise<void>;
}
