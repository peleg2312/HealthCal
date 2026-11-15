import { Check, Share2 } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { ViewerBlockedError } from '@/services/viewer';
import { useTheme } from '@/theme';
import { Button, haptic, PressableScale, Sheet, Text, toast } from '@/ui';

import { canShareImage, saveCard, SAVE_AVAILABLE, shareCard, type ExportResult } from './capture';
import { CardArt } from './CardArt';
import { CHOICE_LABEL, CHOICES_FOR, DEFAULT_SHARE_CHOICES, type ShareChoices } from './content';
import type { Scene } from './scene';

/**
 * The person's choices for this session, one set per card kind, so a second
 * share of a day starts where the first left off, and turning calorie numbers
 * on for a day card never turns them on for a week card.
 */
const remembered: Record<'day' | 'week', ShareChoices> = { day: DEFAULT_SHARE_CHOICES, week: DEFAULT_SHARE_CHOICES };
function remember(kind: 'day' | 'week', next: ShareChoices) {
  remembered[kind] = next;
}

/** A sheet ignores a close in the first moments after it opens: the second tap of a double tap lands on its backdrop. */
const OPEN_GRACE_MS = 450;

/**
 * One choice of what the card carries: a label you can tap, ink when on. It is
 * a checkbox to assistive technology (aria-checked on web), so a screen-reader
 * user hears whether calorie numbers or food names will be on the image.
 */
function ChoiceChip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="select"
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 32,
        paddingHorizontal: 12,
        borderRadius: radius.chip,
        backgroundColor: on ? colors.text : 'transparent',
        borderWidth: 1,
        borderColor: on ? colors.text : colors.borderStrong,
      }}>
      {on ? <Check size={14} color={colors.bg} strokeWidth={2.4} /> : null}
      <Text variant="label" color={on ? 'bg' : 'text'} numberOfLines={1} style={{ fontSize: 13.5, flexShrink: 1 }}>
        {label}
      </Text>
    </PressableScale>
  );
}

export interface SharePlan {
  scene: Scene;
  /** Plain words for the card (its accessibility label and the share text). */
  summary: string;
  fileName: string;
  title: string;
}

/**
 * The share sheet: the card as it will look, the choices of what it carries,
 * and Share (plus Save image on web). The card is drawn in the current theme.
 */
export function ShareSheet({
  visible,
  onClose,
  kind,
  title,
  plan,
  testID = 'share-sheet',
}: {
  visible: boolean;
  onClose: () => void;
  kind: 'day' | 'week';
  title: string;
  plan: (choices: ShareChoices) => SharePlan;
  testID?: string;
}) {
  const { colors, spacing } = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const [choices, setChoices] = useState<ShareChoices>(() => remembered[kind]);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [canShare, setCanShare] = useState(Platform.OS !== 'web');
  const target = useRef<React.ComponentRef<typeof View>>(null);

  // When the sheet last opened, read only in the close handler (never while rendering).
  const openedAt = useRef(0);
  useEffect(() => {
    if (visible) openedAt.current = Date.now();
  }, [visible]);
  const close = () => {
    if (Date.now() - openedAt.current < OPEN_GRACE_MS) return;
    onClose();
  };

  useEffect(() => {
    if (!visible) return;
    let live = true;
    canShareImage().then((ok) => live && setCanShare(ok), () => live && setCanShare(false));
    return () => {
      live = false;
    };
  }, [visible]);

  const p = plan(choices);
  // The preview leaves room for the choices and the buttons on a short phone.
  const maxW = Math.min(winW, 560) - 2 * spacing.xl - 2;
  const maxH = winH * 0.88 - 300;
  const previewW = Math.max(150, Math.min(kind === 'day' ? 230 : 300, maxW, (maxH * p.scene.width) / p.scene.height));

  const toggle = (k: keyof ShareChoices) => {
    const next = { ...choices, [k]: !choices[k] };
    remember(kind, next);
    setChoices(next);
  };

  const run = async (what: 'share' | 'save') => {
    if (busy) return;
    setBusy(what);
    try {
      const req = { scene: p.scene, fileName: p.fileName, title: p.title, text: p.summary, target };
      const result: ExportResult = what === 'share' ? await shareCard(req) : await saveCard(req);
      if (result === 'saved') {
        haptic.success();
        toast('Image saved', { tint: colors.calories });
      } else if (result === 'shared') onClose();
    } catch (e) {
      toast(e instanceof ViewerBlockedError ? e.message : 'Could not make the image. Try again in a moment.');
    } finally {
      setBusy(null);
    }
  };

  const shareButton = canShare ? (
    <Button
      title={Platform.OS === 'web' ? 'Share' : 'Share image'}
      icon={<Share2 size={18} color={colors.onPrimary} strokeWidth={2.2} />}
      onPress={() => run('share')}
      loading={busy === 'share'}
      testID="share-send"
      style={{ flex: 1 }}
    />
  ) : null;
  const saveButton =
    SAVE_AVAILABLE ? (
      <Button title="Save image" variant={canShare ? 'secondary' : 'primary'} onPress={() => run('save')} loading={busy === 'save'} testID="share-save" style={{ flex: 1 }} />
    ) : null;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={title}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {saveButton}
          {shareButton}
          {!saveButton && !shareButton ? <Text variant="caption" color="textSecondary">Sharing is not available on this device.</Text> : null}
        </View>
      }>
      <View testID={testID} style={{ gap: spacing.lg }}>
        <View
          testID="share-card-preview"
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Card preview. ${p.summary}`}
          style={{ alignSelf: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 6, overflow: 'hidden' }}>
          <CardArt scene={p.scene} width={previewW} />
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text variant="overline">On the card</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {CHOICES_FOR[kind].map((k) => (
              <ChoiceChip key={k} label={CHOICE_LABEL[k]} on={choices[k]} onPress={() => toggle(k)} testID={`share-choice-${k}`} />
            ))}
          </View>
          <Text variant="caption" color="textSecondary">
            Weight is never on a card. Calorie numbers{kind === 'day' ? ' and food names stay' : ' stay'} off unless you add them; the cups show how full each day was.
          </Text>
        </View>
      </View>
      {/* iOS and Android capture this full-size copy; web paints the same scene onto a canvas instead. */}
      {Platform.OS !== 'web' && visible ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0 }}>
          <View ref={target} collapsable={false} style={{ width: p.scene.width, height: p.scene.height }}>
            <CardArt scene={p.scene} width={p.scene.width} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
