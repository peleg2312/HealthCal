/**
 * The web app shown inside another page: the hosted preview's viewer frames it,
 * and the frame blocks downloads, file pickers, the camera and links out. A
 * control that needs one of those says so in words instead of doing nothing.
 * Natively and in a browser tab of its own this is always false.
 */
import { Platform } from 'react-native';

export function inFramedViewer(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    // A frame on another origin cannot even look at its parent.
    return true;
  }
}

const OPEN_FULL = 'Open HealthCal in its own browser tab or in the app to do this.';

/** What the person reads when the frame blocks something, by what was blocked. */
export const VIEWER_BLOCKED = {
  save: `This preview cannot save files. ${OPEN_FULL}`,
  files: `This preview cannot open files from your device. ${OPEN_FULL}`,
  camera: `This preview cannot use the camera or your photos. ${OPEN_FULL}`,
  share: `This preview cannot share or save images. ${OPEN_FULL}`,
} as const;

export class ViewerBlockedError extends Error {
  constructor(what: keyof typeof VIEWER_BLOCKED) {
    super(VIEWER_BLOCKED[what]);
    this.name = 'ViewerBlockedError';
  }
}
