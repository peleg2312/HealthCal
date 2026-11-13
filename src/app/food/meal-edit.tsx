import { router, useLocalSearchParams } from 'expo-router';
import { Plus, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { storeSavedMeal } from '@/features/food/actions';
import { formatPortion, itemsRange, mealServings } from '@/features/food/build';
import { href, kcal, param } from '@/features/food/helpers';
import { openMealDraft, removeDraftItem, setDraftName, setDraftServings, updateDraftItem, useMealDraft } from '@/features/food/mealDraft';
import { RequireProfile } from '@/features/food/RequireProfile';
import { ItemAmountSheet, itemLine } from '@/features/food/SavedMealParts';
import { sumNutrients } from '@/lib/nutrition';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { Avatar, Button, Card, Divider, EmptyState, Header, IconButton, MacroBar, NumberField, PressableScale, Screen, Text, TextField, goBack, haptic, toast } from '@/ui';

export default function MealEditRoute() {
  return (
    <RequireProfile>
      <MealEdit />
    </RequireProfile>
  );
}

function MealEdit() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ id?: string; meal?: string; date?: string }>();
  const id = param(params.id);
  const saved = useStore((s) => (id ? s.savedMeals[id] : undefined));
  // Open the draft once, from the stored meal (or empty for a new one).
  const [missing] = useState(() => {
    if (id && (!saved || saved.deleted)) return true;
    openMealDraft(id ? saved : undefined);
    return false;
  });
  const name = useMealDraft((s) => s.name);
  const servings = useMealDraft((s) => s.servings);
  const rows = useMealDraft((s) => s.rows);
  const [editing, setEditing] = useState<string | null>(null);
  const back = href('/food/meals', { meal: param(params.meal), date: param(params.date) });

  if (missing) {
    return (
      <Screen header={<Header title="Saved meal" />}>
        <EmptyState emoji="🍱" title="This meal was deleted" message="Undo the delete from Saved meals, or build a new one." action="Saved meals" onAction={() => router.replace(back as never)} />
      </Screen>
    );
  }

  const items = rows.map((r) => r.item);
  const n = sumNutrients(items.map((it) => it.nutrients));
  const range = itemsRange(items);
  const count = mealServings({ servings: servings ?? 1 });
  const editingRow = editing ? rows.find((r) => r.key === editing) : undefined;
  const canSave = !!name.trim() && rows.length > 0 && (servings === null || servings > 0);

  const remove = (key: string) => {
    const row = rows.find((r) => r.key === key);
    const undo = removeDraftItem(key);
    haptic.tap();
    if (row) toast(`Removed ${row.item.name}`, { label: 'Undo', onPress: undo });
  };

  return (
    <Screen
      testID="meal-edit-screen"
      header={<Header title={id ? 'Edit meal' : 'New meal or recipe'} subtitle={rows.length ? `${rows.length} ${rows.length === 1 ? 'item' : 'items'}` : undefined} />}
      footer={
        <Button
          testID="meal-edit-save"
          title={id ? 'Save changes' : 'Save meal'}
          disabled={!canSave}
          onPress={() => {
            if (storeSavedMeal({ id: id ?? null, name, servings, items })) goBack(back);
          }}
        />
      }>
      <Card style={{ gap: spacing.md }}>
        <TextField testID="meal-edit-name" label="Name" placeholder="Chili, overnight oats, work lunch" value={name} onChangeText={setDraftName} maxLength={60} autoFocus={!id} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
          <NumberField
            testID="meal-edit-servings"
            label="Makes"
            suffix={count === 1 ? 'serving' : 'servings'}
            value={servings}
            onChange={setDraftServings}
            decimals={1}
            style={{ width: 150 }}
          />
          <Text variant="caption" color="textSecondary" style={{ flex: 1, paddingBottom: 12 }}>
            {count > 1 ? `Logs as one line, a share of the whole recipe.` : 'Leave at 1 for a meal you eat whole. A pot that feeds four makes 4.'}
          </Text>
        </View>
      </Card>

      {rows.length > 0 ? (
        <Card testID="meal-edit-totals">
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
            <View>
              <Text variant="caption" color="textSecondary">
                {count > 1 ? 'Per serving' : 'Total'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text variant="numL" tabular testID="meal-edit-kcal">
                  {range ? '~' : ''}
                  {kcal(n.kcal / count)}
                </Text>
                <Text variant="label" color="textSecondary">
                  kcal
                </Text>
              </View>
            </View>
            <Text variant="caption" color="textSecondary" align="right" tabular style={{ flexShrink: 1, paddingBottom: 6 }}>
              {count > 1 ? `Whole recipe ${kcal(n.kcal)} kcal · ${formatPortion(count)} servings` : `P ${Math.round(n.protein)} g · C ${Math.round(n.carbs)} g · F ${Math.round(n.fat)} g`}
            </Text>
          </View>
          {range ? (
            <Text variant="caption" color="textSecondary" tabular>
              Includes estimates: likely between {kcal(range[0] / count)} and {kcal(range[1] / count)} kcal
            </Text>
          ) : null}
          <View style={{ marginTop: spacing.md }}>
            <MacroBar protein={n.protein * 4} carbs={n.carbs * 4} fat={n.fat * 9} height={6} />
          </View>
        </Card>
      ) : null}

      <Card padding={spacing.lg} style={{ paddingVertical: spacing.md }}>
        <Text variant="h3" style={{ marginBottom: spacing.xs }}>
          {count > 1 ? 'Ingredients' : 'Items'}
        </Text>
        {rows.length === 0 ? (
          <Text variant="body" color="textSecondary" style={{ paddingVertical: spacing.sm }}>
            Add what goes in, at the amount you make it. Tap an item later to change its amount.
          </Text>
        ) : (
          rows.map((r, i) => (
            <View key={r.key}>
              {i > 0 ? <Divider inset={50} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <PressableScale
                  testID={`meal-edit-item-${i}`}
                  scaleTo={0.985}
                  onPress={() => setEditing(r.key)}
                  accessibilityLabel={`${r.item.name}, ${itemLine(r.item)}. Change amount`}
                  style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 6 }}>
                  <Avatar emoji={r.item.emoji ?? '🍽️'} size={38} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {r.item.name}
                    </Text>
                    <Text variant="caption" color="textSecondary" numberOfLines={1} tabular>
                      {itemLine(r.item)}
                    </Text>
                  </View>
                </PressableScale>
                <IconButton testID={`meal-edit-item-${i}-remove`} accessibilityLabel={`Remove ${r.item.name}`} tone="clear" size={44} onPress={() => remove(r.key)}>
                  <X size={16} color={colors.textTertiary} />
                </IconButton>
              </View>
            </View>
          ))
        )}
        <Button
          testID="meal-edit-add"
          variant="secondary"
          size="md"
          title={rows.length ? 'Add more' : 'Add food'}
          icon={<Plus size={18} color={colors.text} />}
          onPress={() => router.push('/food/meal-pick' as never)}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <ItemAmountSheet
        key={editing ?? 'none'}
        item={editingRow?.item ?? null}
        onChange={(item) => editingRow && updateDraftItem(editingRow.key, item)}
        onRemove={() => {
          if (editingRow) remove(editingRow.key);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}

