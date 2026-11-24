/**
 * The foot of About: which HealthCal is running, and on a phone build with updates one quiet
 * control to look for an update now or start the one that is waiting. The browser shows the
 * version line only.
 *
 * The status line is always mounted (empty when there is nothing to say), so the live region exists
 * before its words change and a screen reader hears the result; iOS ignores live regions, so it is
 * also announced there. When an update is waiting, the status and what a restart does come first and
 * "Restart to update" sits under them, below where "Check for updates" and its touch area were, so
 * a second tap on the check (nothing seemed to happen) cannot restart the app.
 */
import Constants from 'expo-constants';
import { Info } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';

import { useToday } from '@/store/clock';
import { useTheme } from '@/theme';
import { Button, Text } from '@/ui';

import { aboutState, runningLine } from './rules';
import { checkForUpdatesNow, forgetCheckResult, restartToUpdate, useUpdatesStatus } from './updates';

export function AboutVersion() {
  const { colors, spacing } = useTheme();
  const today = useToday();
  const enabled = useUpdatesStatus((s) => s.enabled);
  const running = useUpdatesStatus((s) => s.running);
  const pending = useUpdatesStatus((s) => s.pending);
  const phase = useUpdatesStatus((s) => s.phase);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const line = enabled ? runningLine(running, today) : null;
  const state = aboutState(pending, phase);
  const checking = phase === 'checking';

  // A result from an earlier visit is old news: forget it on the way in and on the way out.
  useEffect(() => {
    forgetCheckResult();
    return forgetCheckResult;
  }, []);

  // iOS does not read live regions: say the new status there (not what was already showing on arrival).
  const said = useRef<string | null>(null);
  useEffect(() => {
    if (said.current !== null && state.line && state.line !== said.current && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(state.line);
    }
    said.current = state.line;
  }, [state.line]);

  const status = (
    <Text key="status" variant="caption" color="textSecondary" testID="about-update-status" accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
      {state.line}
    </Text>
  );

  return (
    <View style={{ alignItems: 'center', gap: 4, paddingVertical: spacing.md }}>
      <Info size={18} color={colors.textTertiary} />
      <Text variant="caption" color="textTertiary" testID="about-version">
        HealthCal {version}
      </Text>
      {line ? (
        <Text variant="caption" color="textTertiary" testID="about-update-line" style={{ textAlign: 'center' }}>
          {line}
        </Text>
      ) : null}
      {enabled ? (
        <View style={{ alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
          {pending
            ? [
                status,
                state.restartNote ? (
                  <Text key="note" variant="caption" color="textTertiary" testID="about-restart-note" style={{ textAlign: 'center' }}>
                    {state.restartNote}
                  </Text>
                ) : null,
                state.restart ? (
                  <Button
                    key="restart"
                    size="sm"
                    variant="secondary"
                    full={false}
                    title="Restart to update"
                    accessibilityLabel={`Restart to update. ${state.restartNote ?? ''}`.trim()}
                    testID="about-restart"
                    style={{ alignSelf: 'center' }}
                    onPress={() => void restartToUpdate()}
                  />
                ) : null,
              ]
            : [
                <Button
                  key="check"
                  size="sm"
                  variant="secondary"
                  full={false}
                  title="Check for updates"
                  accessibilityLabel={checking ? 'Checking for updates' : 'Check for updates'}
                  disabled={checking}
                  testID="about-check-updates"
                  style={{ alignSelf: 'center' }}
                  onPress={() => void checkForUpdatesNow()}
                />,
                status,
              ]}
        </View>
      ) : null}
    </View>
  );
}
