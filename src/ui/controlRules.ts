/**
 * The kit controls' platform rules, kept pure so they can be tested without a renderer:
 * the touch area on Android, the ARIA state a role carries on the web, the keys a control
 * answers, and the browser's names for what a field holds. No React, no React Native.
 */

/** Android's touch target (Core App Quality, Touch_Target_Size): 48 dp. Elsewhere the kit keeps 44 px. */
export const ANDROID_TARGET = 48;

/**
 * Whether the kit's touch areas grow to Android's 48 dp: in the Android app, and in a browser on an Android phone
 * or tablet that is used by touch (its primary pointer is coarse). A browser elsewhere (an iPhone, a computer, a
 * Chromebook with a mouse) keeps the 44 px target.
 */
export function wantsAndroidTarget(os: string, userAgent: string | undefined, coarsePointer: boolean): boolean {
  if (os === 'android') return true;
  return os === 'web' && coarsePointer && /\bAndroid\b/i.test(userAgent ?? '');
}

export type SlopInsets = { top: number; right: number; bottom: number; left: number };
type SlopIn = number | Partial<SlopInsets> | null | undefined;

const px = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * The hit slop that brings a control drawn `size` big up to a `target` touch area on each axis
 * whose size is known, keeping any larger slop it was given. An axis with no known size (a row
 * that stretches, a button as wide as its words) keeps what it was given. Returns the given value
 * unchanged when nothing has to grow.
 */
export function slopToReach(hitSlop: SlopIn, size: { width?: number; height?: number }, target: number): SlopIn {
  const given: SlopInsets =
    typeof hitSlop === 'number' ? { top: px(hitSlop), right: px(hitSlop), bottom: px(hitSlop), left: px(hitSlop) } : { top: px(hitSlop?.top), right: px(hitSlop?.right), bottom: px(hitSlop?.bottom), left: px(hitSlop?.left) };
  const out = { ...given };
  let grew = false;
  const grow = (dim: number | undefined, a: 'top' | 'left', b: 'bottom' | 'right') => {
    if (typeof dim !== 'number' || !Number.isFinite(dim) || dim <= 0) return;
    if (dim + out[a] + out[b] >= target) return;
    const each = Math.ceil((target - dim) / 2);
    if (out[a] < each) {
      out[a] = each;
      grew = true;
    }
    if (out[b] < each) {
      out[b] = each;
      grew = true;
    }
  };
  grow(size.height, 'top', 'bottom');
  grow(size.width, 'left', 'right');
  return grew ? out : hitSlop;
}

/** A style's drawn size on each axis when it is fixed in numbers: `width`/`height`, else the `min` of each. */
export function fixedSize(style: Record<string, unknown> | null | undefined): { width?: number; height?: number } {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  if (!style) return {};
  return { width: num(style.width) ?? num(style.minWidth), height: num(style.height) ?? num(style.minHeight) };
}

/** Roles whose selected state the web reads as `aria-selected`. */
const SELECTED_ROLES = new Set(['tab', 'option', 'row', 'gridcell', 'columnheader', 'rowheader', 'treeitem']);
/** Roles whose state the web reads as `aria-checked`. */
const CHECKED_ROLES = new Set(['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio']);

export interface StateIn {
  selected?: boolean;
  checked?: boolean | 'mixed';
  expanded?: boolean;
  disabled?: boolean;
  busy?: boolean;
}

/**
 * The ARIA attributes for a control's `accessibilityState` on the web, where react-native-web
 * drops `accessibilityState` itself. A role reads its own state word: a tab or an option is
 * selected, a radio, a checkbox or a switch is checked, and a button that is selected is
 * pressed (a toggle button). `explicit` holds the aria props the control already passes, which
 * always win.
 */
export function ariaFromState(role: string | undefined, state: StateIn | null | undefined, explicit: Record<string, unknown> = {}): Record<string, boolean | 'mixed'> {
  const out: Record<string, boolean | 'mixed'> = {};
  if (!state) return out;
  const r = role ?? 'button';
  const put = (key: string, v: boolean | 'mixed' | undefined) => {
    if (v === undefined || explicit[key] !== undefined) return;
    out[key] = v;
  };
  if (SELECTED_ROLES.has(r)) put('aria-selected', state.selected);
  if (CHECKED_ROLES.has(r)) put('aria-checked', state.checked ?? (r === 'radio' ? state.selected : undefined));
  if (r === 'button') put('aria-pressed', state.selected);
  put('aria-expanded', state.expanded);
  if (state.disabled) put('aria-disabled', true);
  if (state.busy !== undefined) put('aria-busy', state.busy);
  return out;
}

/**
 * Roles that Space must press on the web. react-native-web presses only a button or a menu item
 * on Space; a switch, a radio, a tab or a checkbox would let Space scroll the page instead.
 */
const SPACE_ROLES = new Set(['switch', 'radio', 'tab', 'checkbox', 'option', 'menuitemradio', 'menuitemcheckbox']);
export function pressesOnSpace(role: string | undefined): boolean {
  return !!role && SPACE_ROLES.has(role);
}
export function isSpaceKey(key: string): boolean {
  return key === ' ' || key === 'Spacebar';
}

/**
 * Where an arrow key moves in a row of tabs or radios (the WAI-ARIA tabs and radio group
 * patterns): Left and Up to the previous one, Right and Down to the next, both wrapping; Home
 * and End to the ends. Null for any other key.
 */
export function rovingIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  const i = index < 0 ? 0 : index;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (i + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (i - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/**
 * The value a stepper's key gives (the WAI-ARIA spin button pattern): Up and Right one step up,
 * Down and Left one step down, Page Up and Page Down ten steps, Home and End the limits when
 * they are finite. Held to the limits. Null for any other key, or a key that changes nothing.
 */
export function stepperKey(key: string, value: number, step: number, min: number, max: number): number | null {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 1000) / 1000));
  let next: number | null = null;
  if (key === 'ArrowUp' || key === 'ArrowRight') next = value + step;
  else if (key === 'ArrowDown' || key === 'ArrowLeft') next = value - step;
  else if (key === 'PageUp') next = value + step * 10;
  else if (key === 'PageDown') next = value - step * 10;
  else if (key === 'Home' && Number.isFinite(min)) next = min;
  else if (key === 'End' && Number.isFinite(max)) next = max;
  if (next === null) return null;
  const v = clamp(next);
  return v === value ? null : v;
}

/**
 * React Native's `autoComplete` names as the browser's `autocomplete` tokens (WCAG 1.3.5, HTML's
 * autofill field names), so one prop works on every platform. Names the browser already knows
 * ('email', 'name', 'current-password', 'new-password', 'off', ...) pass through.
 */
const WEB_AUTOCOMPLETE: Record<string, string> = {
  'birthdate-day': 'bday-day',
  'birthdate-month': 'bday-month',
  'birthdate-year': 'bday-year',
  'birthdate-full': 'bday',
  password: 'current-password',
  'password-new': 'new-password',
  'name-given': 'given-name',
  'name-family': 'family-name',
  'name-middle': 'additional-name',
  'name-prefix': 'honorific-prefix',
  'name-suffix': 'honorific-suffix',
  'username-new': 'username',
  'postal-address-country': 'country',
  'postal-address-region': 'address-level1',
  'postal-address-locality': 'address-level2',
  'postal-address-extended-postal-code': 'postal-code',
  'tel-device': 'tel',
  'sms-otp': 'one-time-code',
  'email-otp': 'one-time-code',
  '2fa-app-otp': 'one-time-code',
  gender: 'sex',
};
export function webAutoComplete(value: string | undefined): string | undefined {
  if (!value) return value;
  return WEB_AUTOCOMPLETE[value] ?? value;
}

/** A field's unit, said in full (its suffix, or the short unit at the end of its label). */
const FIELD_UNITS: Record<string, string> = {
  g: 'grams',
  mg: 'milligrams',
  kg: 'kilograms',
  lb: 'pounds',
  lbs: 'pounds',
  oz: 'ounces',
  'fl oz': 'fluid ounces',
  ml: 'millilitres',
  L: 'litres',
  kcal: 'kilocalories',
  '%': 'percent',
  min: 'minutes',
  h: 'hours',
  cm: 'centimetres',
  in: 'inches',
  ft: 'feet',
  km: 'kilometres',
  mi: 'miles',
};

/**
 * A text field's spoken name: its label as drawn, short unit included (WCAG 2.5.3, label in name: "Neck, in"),
 * then its unit in full: the label's own short unit ("Neck, in, inches", "Weight (kg), kilograms"), else the
 * unit drawn inside the field (`suffix`, "g": "Protein, grams"). A suffix that is not a unit ("servings") adds
 * nothing.
 */
export function spokenFieldName(label: string | undefined, suffix?: string): string | undefined {
  if (!label) return label;
  const own = label.match(/(?:,\s*|\s\()(fl oz|kcal|kg|lbs?|oz|ml|mg|g|L|cm|in|ft|km|mi|min|h|%)\)?$/);
  const word = (own ? FIELD_UNITS[own[1]] : undefined) ?? (suffix ? FIELD_UNITS[suffix.trim()] : undefined);
  return word && !label.includes(word) ? `${label}, ${word}` : label;
}

/**
 * The room a list row's title needs for its longest word at the designed size: a 13-letter word ("measurements",
 * "Notifications") in the row's 15 px semibold, with a little to spare.
 */
export const ROW_WORD_ROOM = 120;

/**
 * Whether a `ListRow` stacks at large text: its mark and its trailing part (value, switch, chevron) on a first
 * line and its words under them across the whole row, because beside them the words would have less room than
 * their longest word needs at that size (a word is never split). `growth` is how much the row's text has
 * grown (1 at the designed size, 2 at 200%); `sideWidth` is the mark, the trailing part and the gaps between.
 */
export function rowStacks(v: { rowWidth: number; sideWidth: number; growth: number }): boolean {
  return v.growth > 1 && v.rowWidth > 0 && v.rowWidth - v.sideWidth < ROW_WORD_ROOM * v.growth;
}

/** The kit's words under a number field that takes no negative when a minus is typed into it. */
export const NO_MINUS = 'Enter 0 or more, without a minus.';

/**
 * What a `NumberField` says under itself about its own text (null: nothing). A typed minus in a field that takes no
 * negative is kept as typed and named, never dropped (a dropped minus turned "-100" into 100 ml stored); the field's
 * value is then null, so nothing is stored until it is put right. A caller's own `error` is said instead when it gives one.
 */
export function numberTextProblem(text: string, allowNegative = false): string | null {
  return !allowNegative && text.includes('-') ? NO_MINUS : null;
}

/** A number field's value as typed: null for nothing, for what is not a number, and for a refused minus (`numberTextProblem`). */
export function numberTextValue(text: string, allowNegative = false): number | null {
  if (numberTextProblem(text, allowNegative)) return null;
  const cleaned = text.replace(',', '.').replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * A chart whose values a finger reads by pressing and dragging (`BarChart` with `scrub`, `LineChart` with
 * `formatPoint`) is one keyboard stop on the web, whose keys move the same point the finger does (WCAG 2.1.1): Left
 * and Right one point (from none, Right starts at the first and Left at the last), Home and End the ends, Escape lets
 * go. The new point (null: none), or undefined for a key that is not the chart's, which is left alone.
 */
export function scrubKey(key: string, active: number | null, count: number): number | null | undefined {
  if (count <= 0) return undefined;
  if (key === 'Escape') return active === null ? undefined : null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowLeft') return active === null ? count - 1 : Math.max(0, active - 1);
  if (key === 'ArrowRight') return active === null ? 0 : Math.min(count - 1, active + 1);
  return undefined;
}
