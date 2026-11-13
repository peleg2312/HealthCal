import { Droplet, Minus, Plus, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { SourceTag } from '@/features/food/components';
import { formatMacro } from '@/lib/nutrition';
import { fonts, useTheme } from '@/theme';
import type { Food } from '@/types';
import { Badge, Chip, IconButton, parseNumber, Text } from '@/ui';

import { confidenceLevel, gramStep, type ReviewRow } from './estimate';
import { itemFromFood } from './localMatch';

/** One editable line of the estimate: name, grams, live calories and macros, remove. */
export function ItemRow({
  row,
  index,
  onGrams,
  onRename,
  onRemove,
  matches = [],
  onSwap,
  onUnswap,
}: {
  row: ReviewRow;
  index: number;
  onGrams: (grams: number) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  /** Database foods this item could be, offered as swap chips. */
  matches?: Food[];
  onSwap?: (food: Food) => void;
  onUnswap?: () => void;
}) {
  const { colors, spacing } = useTheme();
  const { item } = row;
  const step = gramStep(item.grams);
  const unsure = row.kind === 'detected' && confidenceLevel(item.confidence) === 'low';
  const id = `ai-item-${index}`;

  return (
    <View testID={id} style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {row.kind === 'fat' ? <Droplet size={16} color={colors.fat} /> : null}
        <TextInput
          testID={`${id}-name`}
          value={item.name}
          onChangeText={onRename}
          accessibilityLabel="Item name"
          selectionColor={colors.primary}
          placeholder="Item name"
          placeholderTextColor={colors.textTertiary}
          style={[
            { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.semibold, fontSize: 15, paddingVertical: 6 },
            { outlineStyle: 'none' } as object,
          ]}
        />
        {unsure && !row.food ? <Badge label="Unsure" color={colors.warning} /> : null}
        <IconButton testID={`${id}-remove`} accessibilityLabel={`Remove ${item.name}`} size={32} tone="clear" onPress={onRemove}>
          <X size={18} color={colors.textTertiary} />
        </IconButton>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconButton
            testID={`${id}-minus`}
            accessibilityLabel={`Less ${item.name}, minus ${step} grams`}
            size={36}
            tone="alt"
            disabled={item.grams <= step}
            onPress={() => onGrams(Math.max(step, item.grams - step))}>
            <Minus size={16} color={colors.text} />
          </IconButton>
          <GramsInput testID={`${id}-grams`} value={item.grams} onChange={onGrams} label={item.name} />
          <IconButton testID={`${id}-plus`} accessibilityLabel={`More ${item.name}, plus ${step} grams`} size={36} tone="alt" onPress={() => onGrams(item.grams + step)}>
            <Plus size={16} color={colors.text} />
          </IconButton>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end', minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
            <Text variant="title" tabular testID={`${id}-kcal`}>
              {item.kcal}
            </Text>
            <Text variant="caption" color="textSecondary">
              kcal
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Macro letter="P" value={item.protein} color={colors.protein} />
            <Macro letter="C" value={item.carbs} color={colors.carbs} />
            <Macro letter="F" value={item.fat} color={colors.fat} />
          </View>
        </View>
      </View>
      <View testID={`${id}-source`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <SourceTag source={row.food ? row.food.source : 'ai'} />
        {row.food && row.estimate ? (
          <Text variant="caption" color="textTertiary" style={{ fontSize: 11 }}>
            · portion still estimated
          </Text>
        ) : null}
      </View>
      {onSwap && (matches.length > 0 || row.food) ? (
        <View style={{ gap: 6 }}>
          <Text variant="caption" color="textSecondary">
            {row.food ? 'Matched to' : 'Could also be'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(row.food && !matches.some((m) => m.id === row.food?.id) ? [row.food, ...matches.slice(0, 2)] : matches).map((food, i) => {
              const selected = row.food?.id === food.id;
              const kcal = itemFromFood(food, item.grams, item.confidence).kcal;
              return (
                <Chip
                  key={food.id}
                  testID={`${id}-swap-${i}`}
                  label={`${food.name} · ${kcal} kcal`}
                  selected={selected}
                  onPress={() => (selected ? onUnswap?.() : onSwap(food))}
                />
              );
            })}
          </View>
          {row.food && row.estimate ? (
            <Text variant="caption" color="textTertiary">
              Tap the selected food again to go back to the AI estimate.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Macro({ letter, value, color }: { letter: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      <Text variant="caption" color={color}>
        {letter}
      </Text>
      <Text variant="caption" color="textSecondary" tabular>
        {formatMacro(value)}
      </Text>
    </View>
  );
}

/** Small grams field that keeps the raw text while typing and commits valid numbers. */
function GramsInput({ value, onChange, label, testID }: { value: number; onChange: (g: number) => void; label: string; testID: string }) {
  const { colors, radius } = useTheme();
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  const [focused, setFocused] = useState(false);
  if (value !== last) {
    setLast(value);
    if (parseNumber(text) !== value) setText(String(value));
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 36,
        minWidth: 72,
        paddingHorizontal: 10,
        borderRadius: radius.sm,
        borderWidth: 1.5,
        borderColor: focused ? colors.primary : colors.border,
        backgroundColor: colors.surface,
      }}>
      <TextInput
        testID={testID}
        value={text}
        inputMode="numeric"
        keyboardType="number-pad"
        selectTextOnFocus
        accessibilityLabel={`Grams of ${label}`}
        selectionColor={colors.primary}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (parseNumber(text) === null || (parseNumber(text) ?? 0) <= 0) setText(String(value));
        }}
        onChangeText={(t) => {
          setText(t);
          const n = parseNumber(t);
          if (n !== null && n > 0 && n <= 5000) {
            setLast(Math.round(n));
            onChange(n);
          }
        }}
        style={[
          { width: 40, color: colors.text, fontFamily: fonts.bold, fontSize: 15, textAlign: 'right', paddingVertical: 0, fontVariant: ['tabular-nums'] },
          { outlineStyle: 'none' } as object,
        ]}
      />
      <Text variant="caption" color="textSecondary" style={{ marginLeft: 3 }}>
        g
      </Text>
    </View>
  );
}
