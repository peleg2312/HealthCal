/**
 * Paints a card scene onto a 2D canvas (web). The same primitives `CardArt`
 * draws with react-native-svg, so the saved image is the preview. Fonts are
 * the app's own: on web they are loaded as CSS font faces under the token
 * names, and `ensureFonts` waits for them before painting.
 */
import { fonts } from '@/theme/tokens';

import type { Prim, Scene } from './scene';

/** The subset of CanvasRenderingContext2D this needs (a fake one is enough in tests). */
export interface Ctx2D {
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fill(path?: unknown): void;
  stroke(path?: unknown): void;
  clip(path?: unknown): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  setLineDash(segments: number[]): void;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
  font: string;
  textAlign: string;
  letterSpacing?: string;
}

const fontCss = (family: string, size: number) => `${size}px "${family}"`;

function paintPrim(ctx: Ctx2D, p: Prim, makePath: (d: string) => unknown) {
  switch (p.k) {
    case 'rect':
      ctx.globalAlpha = p.opacity ?? 1;
      ctx.fillStyle = p.fill;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.globalAlpha = 1;
      return;
    case 'path': {
      const path = makePath(p.d);
      ctx.globalAlpha = p.opacity ?? 1;
      if (p.fill) {
        ctx.fillStyle = p.fill;
        ctx.fill(path);
      }
      if (p.stroke) {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.sw ?? 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(p.dash ?? []);
        ctx.stroke(path);
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
      return;
    }
    case 'text': {
      const runs = p.runs.filter((r) => r.text);
      const widths = runs.map((r) => {
        ctx.font = fontCss(fonts[r.font], r.size);
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${r.letterSpacing ?? 0}px`;
        return ctx.measureText(r.text).width;
      });
      const total = widths.reduce((a, b) => a + b, 0);
      let x = p.anchor === 'middle' ? p.x - total / 2 : p.anchor === 'end' ? p.x - total : p.x;
      ctx.textAlign = 'left';
      runs.forEach((r, i) => {
        ctx.font = fontCss(fonts[r.font], r.size);
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${r.letterSpacing ?? 0}px`;
        ctx.fillStyle = r.fill;
        ctx.fillText(r.text, x, p.y);
        x += widths[i];
      });
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      return;
    }
    case 'clip':
      ctx.save();
      ctx.beginPath();
      ctx.clip(makePath(p.d));
      for (const c of p.children) paintPrim(ctx, c, makePath);
      ctx.restore();
  }
}

/** Paint `scene` at `scale` pixels per card unit. `makePath` turns SVG path data into a Path2D. */
export function paintScene(ctx: Ctx2D, scene: Scene, scale: number, makePath: (d: string) => unknown) {
  ctx.save();
  ctx.scale(scale, scale);
  for (const p of scene.prims) paintPrim(ctx, p, makePath);
  ctx.restore();
}

/** Every font family a scene uses. */
export function sceneFonts(scene: Scene): string[] {
  const out = new Set<string>();
  const walk = (list: Prim[]) => {
    for (const p of list) {
      if (p.k === 'text') for (const r of p.runs) out.add(fonts[r.font]);
      if (p.k === 'clip') walk(p.children);
    }
  };
  walk(scene.prims);
  return [...out];
}
