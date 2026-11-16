/**
 * What the app needs from expo-updates, as a small interface: the native binding is
 * ./platform.native.ts (the only file that loads expo-updates), the browser and every build where
 * updates cannot run get null from ./platform.ts, and tests and the browser's demo states use
 * ./fake.ts.
 */
import type { Running } from './rules';

export interface RunningInfo extends Running {
  /** The running update's id, null for the installed code. */
  updateId: string | null;
  /** Why the library fell back to the installed code (emergency launches only). */
  emergencyReason: string | null;
  runtimeVersion: string | null;
  channel: string | null;
}

export interface Pending {
  /** A newer update (or a roll-back to the installed code) is downloaded and starts at the next restart. */
  pending: boolean;
  id: string | null;
}

export interface UpdatesPort {
  running: RunningInfo;
  /** Asks the server; true when there is something to download (an update or a roll-back). */
  check(): Promise<boolean>;
  /** Downloads it; true when something new is now waiting. */
  fetch(): Promise<boolean>;
  /** Starts the downloaded update now. The JavaScript after it may never run. */
  reload(backgroundColor: string): Promise<void>;
  pending(): Pending;
  /** Called when the library's own state changes (its launch download finished). */
  onChange(listener: () => void): () => void;
}
