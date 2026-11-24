/**
 * The composer's height in lines, estimated from the words and the field's inner width, for the web,
 * where a text area does not grow by itself (the apps' multiline field grows on its own). One to five
 * lines; past five the field scrolls. Pure.
 */
export const COMPOSER_MAX_LINES = 5;
/** The field's 16 px medium text: an average advance a little over half the size, rounded up so an estimate errs to one line more. */
const CHAR_W = 8.4;

export function composerLines(text: string, innerWidth: number): number {
  if (!text) return 1;
  const perLine = Math.max(8, Math.floor(innerWidth / CHAR_W));
  let lines = 0;
  for (const para of text.split('\n')) lines += Math.max(1, Math.ceil(para.length / perLine));
  return Math.min(COMPOSER_MAX_LINES, Math.max(1, lines));
}

/**
 * What the composer does (fix X11), from where the person stands. Pure.
 * - 'send': signed in (or under 18, whose Send writes the app's own line): Send asks the coach.
 * - 'sign-in': a backend and nobody signed in. Send keeps the words in the field (the session's draft)
 *   and opens sign-in; back in the coach, signed in, the next Send goes the normal way. Nothing is sent
 *   by itself.
 * - 'off': no backend at all (the hosted preview): Send is the outline cup and does nothing, and no
 *   sign-in is offered. The phone questions work in all three.
 * `active` is whether the send cup is the filled primary (words in the field and a tap does something);
 * otherwise it is the outline cup.
 */
export type ComposerMode = 'send' | 'sign-in' | 'off';

export function composerMode(s: { backend: boolean; signedIn: boolean }): ComposerMode {
  if (!s.backend) return 'off';
  return s.signedIn ? 'send' : 'sign-in';
}

export function sendActive(mode: ComposerMode, draft: string, busy: boolean): boolean {
  if (mode === 'off' || !draft.trim()) return false;
  return mode === 'sign-in' || !busy;
}
