/**
 * Plan (/settings/plan): Free and Plus side by side, the price from the server, one primary button
 * pinned in the footer, and for a subscriber the plan, its date, and the payment company's page.
 * Reached from Profile, Account, About and the two limit messages; never shown elsewhere.
 * Every word is in @/features/plan/words; the plan is decided on the server only.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { refreshPlan, usePlan, usePlanStore } from '@/features/plan/cache';
import { checkoutBlockedHere, checkoutShown, PLAN_FULL_NAME } from '@/features/plan/channel';
import { openManage, startCheckout, useCheckout, waitAfterCheckout } from '@/features/plan/checkout';
import { canManageHere, canWithdraw, holdsPlus, offerFor, paymentLate, isEnding, planVisible, type PlanLimits, type PlanPeriod, type PlanView } from '@/features/plan/view';
import {
  CANCEL_LABEL,
  FREE_CARD_TITLE,
  LATE_LINE,
  LOADING_LINE,
  MANAGE_LABEL,
  NOTHING_TO_CHOOSE,
  PLAN_INTRO,
  PLAN_TITLE,
  PLUS_CARD_TITLE,
  PRIVACY_LABEL,
  SELLER_LINE,
  SIGNED_OUT_LINE,
  TERMS_LABEL,
  WAITING_LINE,
  WITHDRAW_LABEL,
  cardLabel,
  cardRows,
  formatMoney,
  graceLine,
  monthlyEquivalent,
  notBuyableHere,
  periodLabel,
  planShortLine,
  priceLine,
  refusalLine,
  renewalLine,
  sourceLine,
  subscribeLabel,
  subscriberLine,
  taxNote,
  withdrawLine,
} from '@/features/plan/words';
import { useAuth } from '@/services/auth';
import { useNow } from '@/store/clock';
import { useTheme } from '@/theme';
import { Button, Card, Header, Screen, Segmented, Text, toast } from '@/ui';

let returnHandled = false;

export default function PlanScreen() {
  const view = usePlan();
  const demo = usePlanStore((s) => s.demo);
  const session = useAuth((s) => s.session);
  const phase = useCheckout((s) => s.phase);
  const params = useLocalSearchParams<{ checkout?: string }>();
  // Once the first answer is in (or did not come), "Reading your plan" gives way to what is known.
  const [asked, setAsked] = useState(() => params.checkout === 'done');

  useEffect(() => {
    if (params.checkout === 'done' && !returnHandled) {
      returnHandled = true;
      void waitAfterCheckout();
    } else {
      void refreshPlan().finally(() => setAsked(true));
    }
  }, [params.checkout]);

  const signedIn = !!session || !!demo;
  const header = <Header title={PLAN_TITLE} subtitle={planShortLine(view)} />;

  if (!view.known || !planVisible(view)) {
    // Back from the payment page before the plan was read on this load: the wait's own words.
    const waitLine = phase === 'waiting' ? WAITING_LINE : phase === 'late' ? LATE_LINE : null;
    const line = waitLine ?? (!signedIn ? SIGNED_OUT_LINE : !view.known && !asked ? LOADING_LINE : NOTHING_TO_CHOOSE);
    return (
      <Screen header={header} testID="plan-screen">
        <Card>
          <Text variant="body" color="textSecondary" testID={phase === 'waiting' ? 'plan-waiting' : phase === 'late' ? 'plan-late' : 'plan-status'}>
            {line}
          </Text>
        </Card>
      </Screen>
    );
  }
  return holdsPlus(view) ? <Subscriber view={view} header={header} /> : <Choose view={view} header={header} />;
}

/** The person holds no plan: Free and Plus, the period, the price, and the button. */
function Choose({ view, header }: { view: PlanView; header: React.ReactNode }) {
  const { spacing, colors } = useTheme();
  const phase = useCheckout((s) => s.phase);
  const busy = useCheckout((s) => s.busy);
  const [period, setPeriod] = useState<PlanPeriod>(() => (offerFor(view, 'year') ? 'year' : 'month'));
  const offer = offerFor(view, period) ?? view.offers[0] ?? null;
  const periods = (['month', 'year'] as const).filter((p) => offerFor(view, p));
  const grace = graceLine(view.graceUntil);
  const blocked = !checkoutShown() ? 'channel' : checkoutBlockedHere() ? 'frame' : null;

  let footer: React.ReactNode = null;
  if (phase === 'waiting') {
    footer = (
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', minHeight: 50 }} testID="plan-waiting">
        <ActivityIndicator color={colors.textSecondary} />
        <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
          {WAITING_LINE}
        </Text>
      </View>
    );
  } else if (offer && blocked) {
    footer = (
      <Text variant="body" color="textSecondary" testID="plan-buy-elsewhere">
        {notBuyableHere(blocked)}
      </Text>
    );
  } else if (offer && view.canCheckout) {
    footer = (
      <View style={{ gap: spacing.md }}>
        {/* A payment that has not arrived: said above the offer, which stays (the person may have closed the page without paying). */}
        {phase === 'late' ? (
          <Text variant="caption" color="text" testID="plan-late">
            {LATE_LINE}
          </Text>
        ) : null}
        <Text variant="caption" color="textSecondary" testID="plan-renewal-line">
          {renewalLine(offer)}
        </Text>
        <Button
          testID="plan-subscribe"
          title={subscribeLabel(offer)}
          loading={busy === 'subscribe'}
          onPress={() =>
            void startCheckout(offer).then((r) => {
              if (!r.ok) toast(r.message);
            })
          }
        />
      </View>
    );
  }

  return (
    <Screen header={header} footer={footer} testID="plan-screen">
      <Text variant="body" testID="plan-intro">
        {PLAN_INTRO}
      </Text>
      {grace ? (
        <Text variant="body" color="textSecondary" testID="plan-grace-line">
          {grace}
        </Text>
      ) : null}
      <PlanCards view={view} />
      {offer ? (
        <>
          {periods.length > 1 ? (
            <Segmented
              testID="plan-period"
              options={periods.map((p) => ({ value: p, label: periodLabel(p) }))}
              value={offer.period}
              onChange={(p) => setPeriod(p)}
            />
          ) : null}
          <View testID="plan-price" accessible accessibilityLabel={[priceLine(offer), monthlyEquivalent(offer), taxNote(offer)].filter(Boolean).join('. ')}>
            <Text variant="numL">
              {formatMoney(offer.amount, offer.currency)}
              <Text variant="unit">{` a ${offer.period}`}</Text>
            </Text>
            {monthlyEquivalent(offer) ? (
              <Text variant="body" color="textSecondary">
                {monthlyEquivalent(offer)}
              </Text>
            ) : null}
            {taxNote(offer) ? (
              <Text variant="caption" color="textSecondary" style={{ marginTop: spacing.xs }}>
                {taxNote(offer)}
              </Text>
            ) : null}
          </View>
          <Text variant="caption" color="textSecondary" testID="plan-seller-line">
            {SELLER_LINE}
          </Text>
        </>
      ) : null}
      <LegalLinks />
    </Screen>
  );
}

/** The person holds Plus (or a plan that is ending or waiting on a payment). */
function Subscriber({ view, header }: { view: PlanView; header: React.ReactNode }) {
  const { spacing } = useTheme();
  const now = useNow();
  const busy = useCheckout((s) => s.busy);
  const manageable = canManageHere(view);
  const outside = !manageable && view.source ? refusalLine('cancel_elsewhere', 'manage', view.source) : null;
  const withdraw = manageable && canWithdraw(view, now.getTime()) && view.startedAt ? view.startedAt : null;
  const manage = () =>
    void openManage().then((r) => {
      if (!r.ok) toast(r.message);
    });
  const footer = manageable ? <Button testID="plan-manage" title={MANAGE_LABEL} variant="secondary" loading={busy === 'manage'} onPress={manage} /> : null;
  const source = sourceLine(view.source);
  return (
    <Screen header={header} footer={footer} testID="plan-screen">
      <Card testID="plan-status">
        <Text variant="h3">{PLAN_FULL_NAME}</Text>
        <Text variant="body" color={paymentLate(view) ? 'warningInk' : 'text'} style={{ marginTop: spacing.sm }} testID={paymentLate(view) ? 'plan-payment-line' : 'plan-status-line'}>
          {subscriberLine(view)}
        </Text>
        {source ? (
          <Text variant="caption" color="textSecondary" style={{ marginTop: spacing.sm }}>
            {source}
          </Text>
        ) : null}
        {outside ? (
          <Text variant="caption" color="textSecondary" style={{ marginTop: spacing.sm }} testID="plan-manage-elsewhere">
            {outside}
          </Text>
        ) : null}
      </Card>
      {manageable ? (
        <View style={{ gap: spacing.sm }}>
          {!isEnding(view) ? <Button testID="plan-cancel" title={CANCEL_LABEL} variant="ghost" size="md" onPress={manage} /> : null}
          {withdraw ? (
            <>
              <Button testID="plan-withdraw" title={WITHDRAW_LABEL} variant="ghost" size="md" onPress={manage} />
              <Text variant="caption" color="textSecondary" align="center">
                {withdrawLine(withdraw)}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
      <PlanCards view={view} />
      <LegalLinks />
    </Screen>
  );
}

function PlanCard({ title, limits, current, testID }: { title: string; limits: PlanLimits; current: boolean; testID: string }) {
  const { spacing, colors } = useTheme();
  return (
    <Card
      testID={testID}
      padding={spacing.md}
      style={{ flex: 1, minWidth: 0, borderColor: current ? colors.borderStrong : colors.border }}
      accessible
      accessibilityLabel={cardLabel(title, limits, current)}>
      <Text variant="h3">{title}</Text>
      <Text variant="caption" color="textSecondary" style={{ minHeight: 16 }}>
        {current ? 'Your plan' : ' '}
      </Text>
      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        {cardRows(limits).map((r) => {
          const i = r.value.indexOf(' ');
          return (
            <View key={r.key}>
              <Text variant="caption" color="textSecondary">
                {r.label}
              </Text>
              <Text variant="numM" tabular>
                {r.value.slice(0, i)}
                <Text variant="unit">{` ${r.value.slice(i + 1)}`}</Text>
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function PlanCards({ view }: { view: PlanView }) {
  const { spacing } = useTheme();
  const plus = holdsPlus(view);
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <PlanCard title={FREE_CARD_TITLE} limits={view.planLimits.free} current={!plus} testID="plan-free-card" />
      <PlanCard title={PLUS_CARD_TITLE} limits={view.planLimits.plus} current={plus} testID="plan-plus-card" />
    </View>
  );
}

function LegalLinks() {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Button testID="plan-terms" title={TERMS_LABEL} variant="ghost" size="sm" full={false} style={{ flex: 1 }} onPress={() => router.push('/legal/terms' as never)} />
      <Button testID="plan-privacy" title={PRIVACY_LABEL} variant="ghost" size="sm" full={false} style={{ flex: 1 }} onPress={() => router.push('/legal/privacy' as never)} />
    </View>
  );
}
