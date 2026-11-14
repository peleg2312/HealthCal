// TEMPORARY: a kit preview used by the design-system engineer to check src/ui in a browser.
// It is deleted before the work is handed over.
import { useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { BarChart, Button, Card, Chip, EmptyState, Header, IconButton, MiniCup, ProgressBar, Screen, Text, toast, ToggleRow, Trough, Vessel } from '@/ui';

export default function KitPreview() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ v?: string; footer?: string }>();
  const goal = 3300;
  const [ml, setMl] = useState(() => Math.round(goal * Number(params.v ?? '0.98')));
  const [reachedCount, setReachedCount] = useState(0);
  const [taps, setTaps] = useState(0);
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const p = ml / goal;
  return (
    <Screen header={<Header title="Kit preview" subtitle="Temporary" />} testID="kit-screen" footer={params.footer ? <Button title="Pinned footer action" testID="kit-footer" /> : undefined}>
      <Card padding={18} style={{ gap: spacing.lg }} testID="kit-water">
        <Vessel
          value={ml}
          max={goal}
          goalKind="reach"
          onReached={() => setReachedCount((n) => n + 1)}
          color={colors.water}
          width={96}
          height={220}
          labelGap={18}
          labels={[
            { key: 'goal', at: goal, height: 20, content: <Text variant="caption" color="textSecondary">{`Goal ${(goal / 1000).toFixed(1)} L`}</Text> },
            {
              key: 'percent',
              at: goal * 0.62,
              height: 72,
              content: (
                <View>
                  <Text testID="kit-percent" variant="numXL" tabular style={{ fontSize: 54, lineHeight: 56, letterSpacing: -1.6 }}>
                    {Math.round(p * 100)}%
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    of today’s goal
                  </Text>
                </View>
              ),
            },
            {
              key: 'drunk',
              at: goal * 0.3,
              height: 24,
              content: (
                <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
                  {(ml / 1000).toFixed(2)}
                  <Text variant="unit"> L drunk</Text>
                </Text>
              ),
            },
          ]}
        />
        <Text variant="label" testID="kit-reached-count">{`onReached fired ${reachedCount} time(s)`}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button size="sm" full={false} variant="secondary" tint={colors.water} title="+ 330 ml" testID="kit-add" onPress={() => { setMl((v) => v + 330); toast('Added 330 ml', { label: 'Undo', onPress: () => setMl((v) => v - 330), tint: colors.water }); }} />
          <Button size="sm" full={false} variant="secondary" title="Back to 98%" testID="kit-reset" onPress={() => setMl(Math.round(goal * 0.98))} />
          <Button size="sm" full={false} variant="secondary" title="Plain toast" testID="kit-toast" onPress={() => toast('Saved to your diary')} />
        </View>
      </Card>

      <Card style={{ gap: spacing.md }} testID="kit-minis">
        <Text variant="h3">Mini cups</Text>
        <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-end' }}>
          {[
            { label: '40%', node: <MiniCup progress={0.4} goalKind="reach" color={colors.water} /> },
            { label: '98%', node: <MiniCup progress={0.98} goalKind="reach" color={colors.water} /> },
            { label: 'Reached', node: <MiniCup progress={1} goalKind="reach" color={colors.water} /> },
            { label: '108%', node: <MiniCup progress={1.08} goalKind="reach" color={colors.exercise} /> },
            { label: 'Over', node: <MiniCup progress={1.2} color={colors.calories} /> },
            { label: 'At limit', node: <MiniCup progress={1} color={colors.calories} /> },
            { label: 'Future', node: <MiniCup progress={0} future color={colors.calories} /> },
            { label: 'Friend', node: <MiniCup progress={1} goalKind="reach" color={colors.exercise} width={30} height={26} /> },
          ].map((c) => (
            <View key={c.label} style={{ alignItems: 'center', gap: 6 }}>
              {c.node}
              <Text variant="caption">{c.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={{ gap: spacing.lg }} testID="kit-bars">
        <Text variant="h3">Bars and troughs</Text>
        <Text variant="caption">Protein 98% of goal (reach)</Text>
        <ProgressBar progress={0.98} goalKind="reach" color={colors.protein} />
        <Text variant="caption">Protein 108% of goal (reach)</Text>
        <ProgressBar progress={1.08} goalKind="reach" color={colors.protein} />
        <Text variant="caption">Water, live (reach)</Text>
        <ProgressBar progress={p} goalKind="reach" color={colors.water} />
        <Text variant="caption">Carbs 120% (limit)</Text>
        <ProgressBar progress={1.2} color={colors.carbs} />
        <Text variant="caption">Trough 98% (reach)</Text>
        <Trough value={0.98} max={1} goalKind="reach" color={colors.exercise} />
        <Text variant="caption">Trough, live (reach)</Text>
        <Trough value={ml} max={goal} goalKind="reach" color={colors.water} />
        <Text variant="caption">Trough 110% (limit)</Text>
        <Trough value={1.1} max={1} color={colors.calories} />
        <Text variant="caption">Trough 56% with headroom</Text>
        <Trough value={0.56} max={1} headroom={0.14} color={colors.calories} />
      </Card>

      <Card style={{ gap: spacing.sm }} testID="kit-controls">
        <Text variant="h3">Controls</Text>
        <ToggleRow testID="kit-toggle-on" title="Haptics" subtitle="A light tap when you log or confirm" value={on} onChange={setOn} />
        <ToggleRow testID="kit-toggle-off" title="Celebrations" subtitle="A small animation when you reach a goal" value={off} onChange={setOff} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 40, paddingVertical: 20 }}>
          <IconButton size={32} tone="alt" accessibilityLabel="Small icon" testID="kit-icon-32" onPress={() => setTaps((n) => n + 1)}>
            <X size={16} color={colors.text} />
          </IconButton>
          <IconButton size={36} accessibilityLabel="Medium icon" testID="kit-icon-36" onPress={() => setTaps((n) => n + 1)}>
            <X size={18} color={colors.text} />
          </IconButton>
          <Chip label="Chip" testID="kit-chip" onPress={() => setTaps((n) => n + 1)} />
          <Button size="sm" full={false} title="Small" testID="kit-small" onPress={() => setTaps((n) => n + 1)} />
        </View>
        <Text variant="label" testID="kit-taps">{`taps ${taps}`}</Text>
        <Text variant="caption" color="warningInk">Warning text in warningInk: the macros add up to about 200 kcal.</Text>
        <Text variant="caption" color="danger">Danger text: enter a height between 100 and 250 cm.</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button size="md" full={false} title="Primary" />
          <Button size="md" full={false} variant="danger" title="Remove friend" />
          <Button size="md" full={false} variant="soft" title="Cheered" />
        </View>
      </Card>

      <Card style={{ gap: spacing.md }} testID="kit-chart">
        <Text variant="h3">Last 7 days</Text>
        <BarChart
          data={['M', 'T', 'W', 'T', 'F', 'S', 'Today'].map((label, i) => ({ label, value: [2.1, 3.4, 2.8, 3.3, 1.9, 3.6, 1.2][i] }))}
          color={colors.water}
          goal={3.3}
          goalKind="reach"
          highlightIndex={6}
          openIndex={6}
          formatValue={(n) => `${n.toFixed(1)} L`}
        />
        <BarChart
          data={Array.from({ length: 30 }, (_, i) => ({ label: i % 7 === 0 ? `${i + 1}` : '', value: 1700 + ((i * 137) % 700) }))}
          color={colors.calories}
          goal={2100}
          marks={Array.from({ length: 30 }, (_, i) => i % 5 === 0)}
        />
      </Card>

      <Card>
        <EmptyState title="Nothing logged yet" message="Your drinks for the day show here." action="Add a drink" />
      </Card>
    </Screen>
  );
}
