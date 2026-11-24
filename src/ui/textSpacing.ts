/**
 * The person's own text spacing on the web (WCAG 1.4.12): a reader's style sheet or bookmarklet that sets
 * the line height, the letter and word spacing on every element (`* { letter-spacing: 0.12em !important;
 * word-spacing: 0.16em !important; ... }`). The kit then lays its one-line labels out as it does when text
 * grows (`useGrownText` in ./Text): a label wraps and its control grows, never cut with an ellipsis. At the
 * designed spacing nothing changes.
 *
 * Read from a hidden probe that the app never styles: the app sets no word spacing anywhere, and no letter
 * spacing on the probe, so any computed value there is the reader's own. Checked again whenever a style sheet
 * or a style attribute changes on the page's head, root or body.
 */
import { Platform } from 'react-native';

/** True when a probe the app does not style computes a letter or word spacing: the reader set one. */
export function spacingIsTheReaders(letterSpacing: string, wordSpacing: string): boolean {
  const px = (v: string) => (v === 'normal' || v === '' ? 0 : parseFloat(v));
  return Math.abs(px(letterSpacing)) > 0.1 || Math.abs(px(wordSpacing)) > 0.1;
}

let spaced = false;
let probe: HTMLElement | null = null;
let watcher: MutationObserver | null = null;
const listeners = new Set<() => void>();

function measure() {
  if (typeof document === 'undefined' || !document.body) return;
  if (!probe || !probe.isConnected) {
    probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.textContent = 'x x';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.left = '-9999px';
    probe.style.top = '0';
    document.body.appendChild(probe);
  }
  const s = getComputedStyle(probe);
  const next = spacingIsTheReaders(s.letterSpacing, s.wordSpacing);
  if (next === spaced) return;
  spaced = next;
  for (const l of listeners) l();
}

function start() {
  if (watcher || Platform.OS !== 'web' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  let queued = false;
  const later = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      measure();
    });
  };
  watcher = new MutationObserver(later);
  watcher.observe(document.head, { childList: true, subtree: true, characterData: true });
  watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  if (document.body) watcher.observe(document.body, { childList: true, attributes: true, attributeFilter: ['style', 'class'] });
  measure();
}

/** Subscribe to the reader's text spacing (for `useSyncExternalStore`). */
export function subscribeTextSpacing(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the reader's own text spacing is on (web; always false natively). */
export function textSpacingSet(): boolean {
  return spaced;
}
