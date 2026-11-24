/**
 * The membership card of someone who holds Plus: the full cup, the plan's name and since when, then
 * when it renews, ends or waits on a payment, and where it was bought. It keeps the `plan-status`
 * testID the old text card had, and the status line its two (`plan-status-line`, `plan-payment-line`).
 *
 * ARRIVING (ruling D3): when Plus has just arrived after a payment and the person is looking at this
 * page, the cup starts at the Free level and pours to the brim, the brim line spreads and flashes
 * once (the kit's reached-goal moment, skipped under reduced motion and with Celebrations off) and
 * one success haptic plays. It is the only place this happens, and it happens once: on every later
 * visit the cup simply is full (the same `memoryKey` on the arriving and the resting cup, so it does
 * not pour again either). Under reduced motion
 * the cup is full at once and the haptic still plays. The stored plan changed before any of this;
 * nothing waits for the animation.
 *
 * A failed renewal is said in two parts: the fact in `warningInk` with a card glyph, then what
 * happens next in the text colour. Never red, never a wall of amber.
 */
import { useIsFocused } from 'expo-router';
import { CreditCard } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useNow } from '@/store/clock';
import { useTheme } from '@/theme';
import { brimOverhang, Card, Divider, FadeUp, haptic, motion, Text } from '@/ui';

import { shareOfPlus } from './allowance';
import { PLAN_FULL_NAME } from './channel';
import { endArrival, takeArrival, useArrivalStore } from './arrival';
import { PlanCup } from './PlanCup';
import { paymentLate, type PlanView } from './view';
import { arrivalFresh } from './wait';
import { PAST_DUE_HEAD, memberSince, pastDueDetail, sourceLine, subscriberLine, tieDates } from './words';

const HERO_W = 44;

/**
 * Whether Plus arrived just now, asked by the plan screen for its membership card (ruling D3: only
 * while the person is looking). The stamp (`arrivedAt`, ./arrival.ts) is set in the same step that
 * puts Plus in the plan store, so a card that comes on screen in front reads it at mount and its
 * first frame already stands at the Free level. The stamp is taken in an effect that runs while the
 * page is in front and again whenever a stamp lands: a stamp that arrives after the card is on screen,
 * or while the page was under another screen (taken on the return, while it is still fresh), turns
 * `arriving` on then. Taken once, so the moment plays a single time; leaving the page ends it.
 */
export function useArrival(): boolean {
  const focused = useIsFocused();
  const stamp = useArrivalStore((s) => s.arrivedAt);
  // The one mount-time read of the clock: is the stamp fresh as the card first comes on screen?
  const [atMount] = useState(() => focused && arrivalFresh(useArrivalStore.getState().arrivedAt, Date.now()));
  const taken = useArrivalStore((s) => s.arriving);
  useEffect(() => {
    if (focused && stamp !== null) takeArrival();
  }, [focused, stamp]);
  useEffect(() => endArrival, []);
  return atMount || taken;
}

export function MembershipCard({ view, arriving, outside }: { view: PlanView; /** Plus arrived just now and the page is in front. */ arriving: boolean; /** Where to change a plan bought elsewhere (`plan-manage-elsewhere`). */ outside?: string | null }) {
  const { colors, spacing } = useTheme();
  const now = useNow();
  // Arriving: one frame at the Free level, then the pour to the brim.
  const [poured, setPoured] = useState(!arriving);
  useEffect(() => {
    if (poured) return;
    const id = requestAnimationFrame(() => setPoured(true));
    return () => cancelAnimationFrame(id);
  }, [poured]);
  const late = paymentLate(view);
  const since = memberSince(view.startedAt, now.getFullYear());
  const source = sourceLine(view.source);
  const freeLevel = shareOfPlus(view.planLimits.free.estimates, view.planLimits.plus.estimates);
  return (
    <Card padding={spacing.lg} testID="plan-status">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <PlanCup
          size="hero"
          testID="plan-hero-cup"
          level={poured ? 1 : Math.min(freeLevel, 0.9)}
          // The first frame stands at the Free level (no pour up from empty); the pour is the one to the brim.
          animate={arriving ? poured : true}
          // One key for the arriving and the resting cup: the pour to the brim is remembered, so the next visit is still.
          memoryKey="plan-hero"
          onReached={arriving ? () => void haptic.success() : undefined}
          // The brim line lies past the cup on each side: its left end starts where the card's content does.
          style={{ marginHorizontal: brimOverhang(HERO_W) }}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="h3">{PLAN_FULL_NAME}</Text>
          {since ? (
            <Text variant="caption" color="textSecondary" testID="plan-since">
              {since}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ marginVertical: spacing.md }}>
        <Divider />
      </View>
      {/* On arrival the words follow the pour by a moment; the card's size never changes. */}
      <FadeUp disabled={!arriving} delay={motion.duration.pourSmall} style={{ gap: spacing.sm }}>
        {late ? (
          <View testID="plan-payment-line" style={{ gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <CreditCard size={18} strokeWidth={1.9} color={colors.warningInk} style={{ marginTop: 2 }} />
              <Text variant="bodyStrong" color="warningInk" style={{ flex: 1 }}>
                {PAST_DUE_HEAD}
              </Text>
            </View>
            <Text variant="body" color="text">
              {tieDates(pastDueDetail(view))}
            </Text>
          </View>
        ) : (
          <Text variant="body" testID="plan-status-line">
            {tieDates(subscriberLine(view))}
          </Text>
        )}
        {source ? (
          <Text variant="caption" color="textSecondary">
            {source}
          </Text>
        ) : null}
        {outside ? (
          <Text variant="caption" color="textSecondary" testID="plan-manage-elsewhere">
            {outside}
          </Text>
        ) : null}
      </FadeUp>
    </Card>
  );
}
