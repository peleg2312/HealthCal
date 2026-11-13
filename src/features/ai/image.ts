/** Image sizing for AI analysis. Pure, so the token maths is tested. */

/** Long-edge limit in px: the default pass, and the careful pass. */
export const IMAGE_EDGE = { fast: 768, precise: 1024 };
export const JPEG_QUALITY = 0.6;

/** Size that fits `edge` on the long side, never upscaling. Unknown sizes fall back to a square bound. */
export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: edge, height: edge };
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Approximate vision input tokens: about one per 28x28 px patch. */
export function visionTokens(width: number, height: number): number {
  return Math.ceil((width * height) / (28 * 28));
}
