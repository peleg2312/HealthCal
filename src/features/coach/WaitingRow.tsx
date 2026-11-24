import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { FadeUp, Text, useReducedMotion } from '@/ui';

import { CoachMark } from './CoachMark';
import { startWaitLoop, waitDuration, waitWords, WAIT_LONG_AFTER_MS, WAIT_REST } from './waiting';

/**
 * The coach at work (`coach-typing`): the small coach cup pouring and falling back in a loop beside
 * "Reading your week" (sharing on) or "Writing an answer", which turns to "Taking longer than usual"
 * after 10 s. The screen mounts it 300 ms after a send (./waiting.ts `WAIT_SHOW_AFTER_MS`). Under
 * reduced motion the cup rests half full and nothing loops.
 */
export function WaitingRow({ shared, startedAt }: { shared: boolean; startedAt: number | null }) {
  const { spacing } = useTheme();
  const reduce = useReducedMotion();
  const [level, setLevel] = useState(WAIT_REST);
  // Read once when the row mounts (a re-open during a long wait shows the later words at once).
  const [long, setLong] = useState(() => startedAt !== null && Date.now() - startedAt >= WAIT_LONG_AFTER_MS);

  useEffect(() => startWaitLoop(setLevel, reduce), [reduce]);

  useEffect(() => {
    const t = setTimeout(() => setLong(true), Math.max(0, WAIT_LONG_AFTER_MS - (Date.now() - (startedAt ?? Date.now()))));
    return () => clearTimeout(t);
  }, [startedAt]);

  return (
    <FadeUp>
      <View testID="coach-typing" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 }}>
        <CoachMark size="small" level={level} animate={!reduce} duration={waitDuration(level)} />
        <Text variant="body" color="textSecondary">
          {waitWords(shared, long ? WAIT_LONG_AFTER_MS : 0)}
        </Text>
      </View>
    </FadeUp>
  );
}
