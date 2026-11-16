/**
 * The foot of About: which HealthCal is running, and on a phone build with updates one quiet
 * control to look for an update now or start the one that is waiting. The browser shows the
 * version line only.
 */
import Constants from 'expo-constants';
import { Brain } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useToday } from '@/store/clock';
import { useTheme } from '@/theme';
import { Button, Text } from '@/ui';

import { checkLine, runningLine } from './rules';
import { checkForUpdatesNow, restartToUpdate, useUpdatesStatus } from './updates';

export function AboutVersion() {
  const { colors, spacing } = useTheme();
  const today = useToday();
  const enabled = useUpdatesStatus((s) => s.enabled);
  const running = useUpdatesStatus((s) => s.running);
  const pending = useUpdatesStatus((s) => s.pending);
  const phase = useUpdatesStatus((s) => s.phase);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const line = enabled ? runningLine(running, today) : null;
  const status = enabled ? checkLine(phase) : null;
  const checking = phase === 'checking';

  return (
    <View style={{ alignItems: 'center', gap: 4, paddingVertical: spacing.md }}>
      <Brain size={18} color={colors.textTertiary} />
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
          {pending ? (
            <Button
              size="sm"
              variant="secondary"
              full={false}
              title="Restart to update"
              accessibilityLabel="Restart HealthCal to start the update"
              testID="about-restart"
              onPress={() => void restartToUpdate()}
            />
          ) : (
            <Button
              size="sm"
              variant="secondary"
              full={false}
              title={checking ? 'Checking…' : 'Check for updates'}
              accessibilityLabel={checking ? 'Checking for updates' : 'Check for updates'}
              disabled={checking}
              testID="about-check-updates"
              onPress={() => void checkForUpdatesNow()}
            />
          )}
          {status && !(pending && phase === 'ready') ? (
            <Text variant="caption" color="textSecondary" testID="about-update-status" accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
              {status}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
