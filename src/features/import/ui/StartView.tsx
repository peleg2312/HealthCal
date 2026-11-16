import { ChevronDown, ChevronUp, FileArchive, FileSpreadsheet, FileText, Map as MapIcon, Watch } from 'lucide-react-native';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Platform, View } from 'react-native';

import { fonts, useTheme } from '@/theme';
import { Card, Divider, PressableScale, Text } from '@/ui';

/** The first state: one line on what happens, and how to get the files out of Garmin Connect folded under one control. */
export function StartView({ failed }: { failed: { name: string; message: string }[] }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      {/* The header carries the title; the screen opens with what it does. */}
      <Text variant="body" color="textSecondary" testID="import-intro">
        Workouts go to Train with Garmin’s calories once you have checked them. Files stay on this device.
      </Text>

      {Platform.OS === 'android' ? (
        <Card tone="alt" onPress={() => router.push('/settings/health-sync')} testID="import-sync-link" accessibilityLabel="Workout sync: let workouts come in by themselves">
          <Text variant="bodyStrong">Workouts can come in by themselves</Text>
          <Text variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
            Workout sync reads new sessions from Health Connect, where Garmin Connect writes them. Open Workout sync
          </Text>
        </Card>
      ) : null}

      {failed.length ? (
        <Card tone="alt" testID="import-open-failed">
          {failed.map((f) => (
            <Text key={f.name} variant="caption" color="text">
              <Text variant="caption" color="text" style={{ fontFamily: fonts.bold }}>
                {f.name}
              </Text>
              {`: ${f.message}`}
            </Text>
          ))}
        </Card>
      ) : null}

      <Guide />
    </View>
  );
}

/** The five kinds of file, inside the guide: what each one holds. */
function FormatsList() {
  const { colors, spacing } = useTheme();
  const rows = [
    { icon: <Watch size={20} color={colors.text} strokeWidth={1.9} />, name: 'FIT', text: 'The original file from the watch. The most complete: measured calories, heart rate, every leg of a triathlon.' },
    { icon: <FileText size={20} color={colors.text} strokeWidth={1.9} />, name: 'TCX', text: 'Laps with time, distance, calories and heart rate.' },
    { icon: <MapIcon size={20} color={colors.text} strokeWidth={1.9} />, name: 'GPX', text: 'The route only. It has no calories, so they are estimated.' },
    { icon: <FileSpreadsheet size={20} color={colors.text} strokeWidth={1.9} />, name: 'CSV', text: 'The Activities list: many workouts at once, one row each.' },
    { icon: <FileArchive size={20} color={colors.text} strokeWidth={1.9} />, name: 'ZIP', text: 'As Garmin downloads it. No need to unzip.' },
  ];
  return (
    <View testID="import-formats" style={{ gap: spacing.md }}>
      {rows.map((r) => (
        <View key={r.name} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <View style={{ paddingTop: 1 }}>{r.icon}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong">{r.name}</Text>
            <Text variant="caption" color="textSecondary">
              {r.text}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** How to export from Garmin Connect, folded away until asked for. */
function Guide() {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <Card padding={0} testID="import-guide">
      <PressableScale
        testID="import-guide-toggle"
        accessibilityLabel="How to get your files from Garmin Connect"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        scaleTo={0.99}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg }}>
        <Text variant="title" style={{ flex: 1 }}>
          How to export from Garmin
        </Text>
        <Chevron size={20} color={colors.textSecondary} strokeWidth={1.9} />
      </PressableScale>
      {open ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
          <Divider />
          <Step n={1} title="Use the Garmin Connect website">
            The phone app cannot export workouts. Sign in at connect.garmin.com on a computer, or in your phone’s browser with the desktop site turned on.
          </Step>
          <Step n={2} title="One workout">
            Open the activity, tap the gear icon at the top right and choose Export Original. You get a ZIP with the FIT file in it: choose that ZIP here. Export to TCX
            and Export to GPX work too.
          </Step>
          <Step n={3} title="Many workouts at once">
            Open Activities, then All Activities. Scroll down until every workout you want is loaded (only loaded rows are exported), then choose Export CSV at the top
            right.
          </Step>
          <Text variant="caption" color="textSecondary">
            The CSV does not say whether its distances are in kilometres or miles, or which time zone it is in, so you will be asked. It follows the units set in
            Garmin Connect’s account settings.
          </Text>
          <Divider />
          <Text variant="title">Which files work</Text>
          <FormatsList />
        </View>
      ) : null}
    </Card>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          borderWidth: 1.5,
          borderColor: colors.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text variant="caption" color="text" style={{ fontSize: 12, lineHeight: 15, fontFamily: fonts.bold }}>
          {n}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="body" color="textSecondary">
          {children}
        </Text>
      </View>
    </View>
  );
}
