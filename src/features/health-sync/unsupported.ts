/**
 * The adapter for a platform without a health store this build can read: the
 * browser, and iPhone until its Apple Health adapter exists. It answers "not
 * available here" and never touches a native module.
 */
import { HealthError, NO_ACCESS, type HealthAdapter } from './types';

const unavailable = () => new HealthError('unavailable', 'There is no health store to read on this device.');

export const unsupportedAdapter: HealthAdapter = {
  store: null,
  availability: async () => 'unsupported',
  access: async () => NO_ACCESS,
  requestAccess: async () => NO_ACCESS,
  readWorkouts: async () => {
    throw unavailable();
  },
  openSettings: () => {},
  openInstall: () => {},
};
