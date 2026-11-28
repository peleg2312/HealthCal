/**
 * Phones: the controls a screen toast is never over. A browser finds them in the page (every button, link,
 * field, switch); a phone has no such query, so the kit's own controls (every `PressableScale`, and so every
 * Button, IconButton, Chip, segment, row and switch, and every text field) put themselves on a list while
 * they are mounted inside a `Screen`, under that screen's id. When a toast shows, `ToastHost` measures the
 * focused screen's controls in the window (`measureInWindow`); when one lies under the place the toast always
 * rests (`toastCoversAmong` in ./keyboardInset), the screen's scroll area ends 8 px above the toast.
 *
 * A sheet's content is under no screen (`Sheet` sets the scope to null): a sheet shows its own toast, and a
 * closing sheet's controls must not count for the screen under it. Controls outside every `Screen` (the
 * tab bar, the toast's own action) are on no list. A control drawn by hand with React Native's Pressable
 * is not on the list either: such a screen's toast falls back on its usual place over it.
 */
import { createContext, useContext, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/** The id of the `Screen` a control is drawn in (its `nativeID`), or null inside a sheet or outside every screen. */
export const ToastScope = createContext<string | null>(null);

type Measurable = { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void };

interface Entry {
  scope: string;
  node: { current: unknown };
}

const entries = new Set<Entry>();

/**
 * A ref for a kit control's host view: while it is mounted inside a `Screen`, on a phone, the control is on
 * that screen's list. On the web it does nothing (the browser is asked instead).
 */
export function useToastControl<T>() {
  const scope = useContext(ToastScope);
  const node = useRef<T | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web' || !scope) return;
    const entry: Entry = { scope, node };
    entries.add(entry);
    return () => {
      entries.delete(entry);
    };
  }, [scope]);
  return node;
}

/** The host views of a screen's controls that are mounted now. */
export function controlsIn(scope: string): Measurable[] {
  const out: Measurable[] = [];
  for (const e of entries) if (e.scope === scope && e.node.current) out.push(e.node.current as Measurable);
  return out;
}

/** Writes a node to a ref the caller passed (an object or a function), beside the kit's own. */
export function passRef<T>(given: unknown, node: T | null) {
  if (typeof given === 'function') (given as (n: T | null) => void)(node);
  else if (given && typeof given === 'object' && 'current' in given) (given as { current: T | null }).current = node;
}
