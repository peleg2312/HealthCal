import { Platform } from 'react-native';

/**
 * Web: says `text` once to a screen reader through a polite live region of the kit's own, outside every screen and
 * sheet (react-native-web's announceForAccessibility does nothing). For words that change under the keyboard with no
 * focus move, such as the value a chart's arrow keys have reached. Each call writes a new text node, so the same words
 * twice are said twice. Natively it does nothing (the callers are web-only).
 */
let region: HTMLElement | null = null;
export function sayOnWeb(text: string): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !text) return;
  if (!region || !region.isConnected) {
    region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('data-testid', 'kit-live');
    // Heard, never seen.
    region.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;left:0;top:0;pointer-events:none';
    document.body.appendChild(region);
  }
  region.replaceChildren(document.createTextNode(text));
}
