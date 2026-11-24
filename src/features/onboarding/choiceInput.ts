/**
 * How a single-choice tile was pressed. A finger or a mouse ('pointer') sees the choice marked and is
 * moved on to the next question after a beat, which saves a tap. A keyboard or assistive technology
 * ('keys') only makes the choice: Continue moves on, so nobody is taken to another question by
 * choosing an answer (WCAG 3.2.2 On Input) and the focus stays where it was.
 *
 * On the web a key press reaches `onPress` as a keyboard event (Enter as react-native-web's 'keyup',
 * Space as the kit's 'keydown'), and a screen reader's or a keyboard's activation as a 'click' with
 * no pointer behind it (`detail` 0). A screen reader on a phone sends an ordinary press, so the flow
 * also asks whether one is on (`AccessibilityInfo`).
 */
export type ChoiceInput = 'pointer' | 'keys';

interface PressLike {
  type?: unknown;
  detail?: unknown;
  nativeEvent?: { type?: unknown; detail?: unknown } | null;
}

export function choiceInput(e: unknown): ChoiceInput {
  if (!e || typeof e !== 'object') return 'pointer';
  const ev = e as PressLike;
  const native = ev.nativeEvent && typeof ev.nativeEvent === 'object' ? ev.nativeEvent : null;
  const type = typeof native?.type === 'string' ? native.type : typeof ev.type === 'string' ? ev.type : '';
  if (type.startsWith('key')) return 'keys';
  const detail = typeof native?.detail === 'number' ? native.detail : typeof ev.detail === 'number' ? ev.detail : null;
  if (type === 'click' && detail === 0) return 'keys';
  return 'pointer';
}
