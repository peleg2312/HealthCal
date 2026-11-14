/**
 * Turning a card into an image and handing it on: iOS and Android (the web
 * version is `capture.ts`).
 *
 * The full-size card is rendered off screen by the share sheet; react-native-view-shot
 * captures that view to a temporary PNG and expo-sharing opens the system
 * share sheet with it (which also offers saving to Photos). There is no
 * separate Save image here: that would need a media-library package the app
 * does not have.
 */
import * as Sharing from 'expo-sharing';
import type { ComponentRef, RefObject } from 'react';
import { Platform, type View } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import { EXPORT_SCALE, type Scene } from './scene';

export interface CardExport {
  scene: Scene;
  fileName: string;
  title: string;
  text: string;
  target: RefObject<ComponentRef<typeof View> | null>;
}

export type ExportResult = 'shared' | 'saved' | 'cancelled';

export const SAVE_AVAILABLE = false;

export async function canShareImage(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

export async function shareCard(req: CardExport): Promise<ExportResult> {
  if (!req.target.current) throw new Error('The card is not ready');
  const uri = await captureRef(req.target, {
    format: 'png',
    result: 'tmpfile',
    fileName: req.fileName,
    // Android sizes in pixels; iOS draws at the screen's own scale, so it is left to the view's size there.
    ...(Platform.OS === 'android' ? { width: req.scene.width * EXPORT_SCALE, height: req.scene.height * EXPORT_SCALE } : { useRenderInContext: true }),
  });
  try {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: req.title });
    return 'shared';
  } finally {
    releaseCapture(uri);
  }
}

export async function saveCard(req: CardExport): Promise<ExportResult> {
  return shareCard(req);
}
