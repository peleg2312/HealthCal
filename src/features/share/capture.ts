/**
 * Turning a card into an image and handing it on: the web version (Metro
 * picks `capture.native.ts` on iOS and Android).
 *
 * The card is painted straight onto a canvas from its scene (react-native-view-shot
 * needs html2canvas-pro on web, which is not installed). Then:
 * - Share uses the Web Share API with the PNG as a file where the browser can
 *   share files (most phones' browsers);
 * - Save image downloads the PNG, which works everywhere.
 */
import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';

import { inFramedViewer, ViewerBlockedError } from '@/services/viewer';

import { paintScene, sceneFonts, type Ctx2D } from './paint';
import { EXPORT_SCALE, type Scene } from './scene';

export interface CardExport {
  scene: Scene;
  /** File name without extension, e.g. healthcal-2026-11-14. */
  fileName: string;
  title: string;
  text: string;
  /** The off-screen view that holds the full-size card (used on iOS and Android). */
  target: RefObject<ComponentRef<typeof View> | null>;
}

export type ExportResult = 'shared' | 'saved' | 'cancelled';

/** Save image is offered where the platform can write a file the person can find (web downloads). */
export const SAVE_AVAILABLE = true;

async function renderPng(scene: Scene): Promise<Blob> {
  const families = sceneFonts(scene);
  if (typeof document !== 'undefined' && document.fonts) {
    await Promise.all(families.map((f) => document.fonts.load(`20px "${f}"`).catch(() => undefined)));
  }
  const canvas = document.createElement('canvas');
  canvas.width = scene.width * EXPORT_SCALE;
  canvas.height = scene.height * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  paintScene(ctx as unknown as Ctx2D, scene, EXPORT_SCALE, (d) => new Path2D(d));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))), 'image/png'));
}

function fileFor(blob: Blob, name: string): File {
  return new File([blob], `${name}.png`, { type: 'image/png' });
}

/** Whether Share can send the image itself (not only a link). Checked once the sheet opens. */
export async function canShareImage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File([new Uint8Array([0])], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareCard(req: CardExport): Promise<ExportResult> {
  if (inFramedViewer()) throw new ViewerBlockedError('share');
  const blob = await renderPng(req.scene);
  const file = fileFor(blob, req.fileName);
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: req.title, text: req.text });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  download(blob, req.fileName);
  return 'saved';
}

export async function saveCard(req: CardExport): Promise<ExportResult> {
  if (inFramedViewer()) throw new ViewerBlockedError('share');
  download(await renderPng(req.scene), req.fileName);
  return 'saved';
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.png`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
