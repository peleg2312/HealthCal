/**
 * Plan (/settings/plan): what stays free in one line, each day's AI allowance as cups (Free poured to
 * its share of Plus, Plus brim-full), Monthly and Yearly as two price tiles with the smaller charge
 * chosen first, and one primary button pinned in the footer under its renewal sentence. For a
 * subscriber: the membership card with its full cup, the allowance, and the cancel controls as plain
 * rows. Plus arriving after a payment is the page's one moment (the cup pours to the brim, once).
 * Reached from Profile, Account, About and the two limit messages; never shown elsewhere.
 * Every word is in @/features/plan/words; the plan is decided on the server only, and every price,
 * currency and period on this page is the server's.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarX, Undo2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { PourWait } from '@/components/PourWait';
import { AllowanceTable } from '@/features/plan/AllowanceTable';
import { refreshPlan, usePlan, usePlanStore } from '@/features/plan/cache';
import { checkoutBlockedHere, checkoutShown } from '@/features/plan/channel';
import { openManage, startCheckout, useCheckout, waitAfterCheckout, type CheckoutPhase } from '@/features/plan/checkout';
import { MembershipCard, useArrival } from '@/features/plan/MembershipCard';
import { LegalLinksLine } from '@/features/legal/LegalLinksLine';
import { PeriodTiles } from '@/features/plan/PeriodTiles';
import { StaysFree } from '@/features/plan/StaysFree';
import { canManageHere, canWithdraw, holdsPlus, isEnding, offerFor, planVisible, type PlanPeriod, type PlanView } from '@/features/plan/view';
import {
  BOTH_LEAD,
  CANCEL_LABEL,
  CANCEL_SUB,
  EACH_DAY_TITLE,
  LATE_LINE,
  LATE_MORE,
  LATE_TITLE,
  LOADING_LINE,
  MANAGE_LABEL,
  NOTHING_TO_CHOOSE,
  OFF_TITLE,
  PLAN_INTRO_LEAD,
  PLAN_INTRO_MORE,
  PLAN_TITLE,
  PRIVACY_LABEL,
  SELLER_LINE,
  SIGNED_OUT_BODY,
  SIGNED_OUT_TITLE,
  SIGN_IN_ACTION,
  STAYS_FREE_AFTER_END,
  STAYS_FREE_IF_CANCEL,
  STAYS_FREE_TITLE,
  TERMS_LABEL,
  WAITING_LINE,
  WITHDRAW_LABEL,
  eachDayUntil,
  graceLine,
  notBuyableHere,
  planShortLine,
  refusalLine,
  renewalLine,
  savingAndTax,
  subscribeLabel,
  subscribeLabelRoom,
  tieDates,
  tieEnd,
  withdrawSub,
} from '@/features/plan/words';
import { IconTile } from '@/features/settings/components';
import { useAuth } from '@/services/auth';
import { isBackendConfigured } from '@/services/supabase';
import { useNow } from '@/store/clock';
import { useTextSize, useTheme } from '@/theme';
import { Button, Card, Divider, EmptyState, Header, ListRow, Screen, SectionTitle, Text, toast } from '@/ui';

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
    return (
      <Screen header={header} testID="plan-screen">
        <StatusOnly phase={phase} signedIn={signedIn} loading={!view.known && !asked} />
      </Screen>
    );
  }
  return holdsPlus(view) ? <Subscriber view={view} header={header} /> : <Choose view={view} header={header} />;
}

/**
 * Nothing to show a plan from yet: back from the payment page before the plan was read on this load
 * (the wait's own words), no account, the first answer still on its way, or plans off. One centred
 * block: the waiting cup while something is on its way, else the app's empty cup with one sentence
 * and, where there is one, the button that does it.
 */
function StatusOnly({ phase, signedIn, loading }: { phase: CheckoutPhase; signedIn: boolean; loading: boolean }) {
  const { spacing } = useTheme();
  if (phase === 'waiting' || (phase !== 'late' && signedIn && loading)) {
    const waiting = phase === 'waiting';
    return (
      <View testID={waiting ? 'plan-waiting' : 'plan-status'} accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xl + 28, paddingHorizontal: spacing.md }}>
        <PourWait size="tile" />
        <Text variant="body" color="textSecondary" align="center">
          {waiting ? WAITING_LINE : LOADING_LINE}
        </Text>
      </View>
    );
  }
  if (phase === 'late') {
    return (
      <View testID="plan-late" style={{ paddingTop: spacing.xl }}>
        <EmptyState title={LATE_TITLE} message={LATE_MORE} />
      </View>
    );
  }
  if (!signedIn) {
    return (
      <View testID="plan-status" style={{ paddingTop: spacing.xl }}>
        {isBackendConfigured ? (
          <EmptyState title={SIGNED_OUT_TITLE} message={tieEnd(SIGNED_OUT_BODY)} action={SIGN_IN_ACTION} actionTestID="plan-sign-in" onAction={() => router.push('/auth?mode=signin')} />
        ) : (
          <EmptyState title={SIGNED_OUT_TITLE} message={refusalLine('no_backend', 'status')} />
        )}
      </View>
    );
  }
  return (
    <View testID="plan-status" style={{ paddingTop: spacing.xl }}>
      <EmptyState title={OFF_TITLE} message={NOTHING_TO_CHOOSE} />
    </View>
  );
}

/** The person holds no plan: what stays free, the allowance as cups, the two prices, and the button. */
function Choose({ view, header }: { view: PlanView; header: React.ReactNode }) {
  const { spacing } = useTheme();
  const { width } = useWindowDimensions();
  const textSize = useTextSize();
  const phase = useCheckout((s) => s.phase);
  const busy = useCheckout((s) => s.busy);
  // Ruling D2: the smaller charge is the one chosen when the page opens; both prices are in view.
  const [period, setPeriod] = useState<PlanPeriod>(() => (offerFor(view, 'month') ? 'month' : 'year'));
  const offer = offerFor(view, period) ?? view.offers[0] ?? null;
  const grace = graceLine(view.graceUntil);
  const blocked = !checkoutShown() ? 'channel' : checkoutBlockedHere() ? 'frame' : null;
  const saving = offer ? savingAndTax(offerFor(view, 'month'), offerFor(view, 'year'), offer) : null;

  let footer: React.ReactNode = null;
  let linksInFooter = false;
  if (phase === 'waiting') {
    footer = (
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', minHeight: 50 }} testID="plan-waiting" accessibilityLiveRegion="polite">
        <PourWait size="inline" />
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
    linksInFooter = true;
    footer = (
      // The renewal sentence is the legal one and is never shortened; a narrow phone only closes the gap.
      <View style={{ gap: width < 360 ? spacing.sm : spacing.md }}>
        {/* A payment that has not arrived: said above the offer, which stays (the person may have closed the page without paying). */}
        {phase === 'late' ? (
          <Text variant="caption" color="text" testID="plan-late">
            {LATE_LINE}
          </Text>
        ) : null}
        <Text variant="caption" color="textSecondary" testID="plan-renewal-line">
          {renewalLine(offer)}
        </Text>
        {/* Terms and Privacy pinned beside Subscribe, so they are seen with the price at every width (rubric D11-04). */}
        <LegalLinksLine termsLabel={TERMS_LABEL} privacyLabel={PRIVACY_LABEL} termsTestID="plan-terms" privacyTestID="plan-privacy" />
        <Button
          testID="plan-subscribe"
          title={subscribeLabel(offer, subscribeLabelRoom(width, textSize))}
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
      {/* 12 px to the card (the page's blocks are 16 apart). */}
      <View testID="plan-intro" style={{ gap: spacing.xs, marginBottom: -spacing.xs }}>
        <Text variant="bodyStrong">{PLAN_INTRO_LEAD}</Text>
        <Text variant="body" color="textSecondary">
          {tieEnd(PLAN_INTRO_MORE)}
        </Text>
        {grace ? (
          <Text variant="body" color="textSecondary" testID="plan-grace-line">
            {tieDates(grace)}
          </Text>
        ) : null}
      </View>
      <AllowanceTable free={view.planLimits.free} plus={view.planLimits.plus} current="free" />
      {offer ? (
        <View style={{ gap: spacing.sm }}>
          <PeriodTiles offers={view.offers} value={offer.period} onChange={setPeriod} />
          {saving ? (
            <Text variant="caption" color="textSecondary" testID="plan-saving">
              {saving}
            </Text>
          ) : null}
          {/* The two links a careful buyer looks for: in the pinned footer beside Subscribe when it is there, else right under the prices. */}
          {linksInFooter ? null : <LegalLinks />}
        </View>
      ) : (
        <LegalLinks />
      )}
      <StaysFree free={view.planLimits.free} title={STAYS_FREE_TITLE} />
      {offer ? (
        <Text variant="caption" color="textSecondary" testID="plan-seller-line">
          {SELLER_LINE}
        </Text>
      ) : null}
    </Screen>
  );
}

/** The person holds Plus (or a plan that is ending or waiting on a payment). */
function Subscriber({ view, header }: { view: PlanView; header: React.ReactNode }) {
  const { spacing } = useTheme();
  const now = useNow();
  const busy = useCheckout((s) => s.busy);
  const arriving = useArrival();
  const manageable = canManageHere(view);
  const outside = !manageable && view.source ? refusalLine('cancel_elsewhere', 'manage', view.source) : null;
  const withdraw = manageable && canWithdraw(view, now.getTime()) && view.startedAt ? view.startedAt : null;
  const cancel = manageable && !isEnding(view);
  const manage = () =>
    void openManage().then((r) => {
      if (!r.ok) toast(r.message);
    });
  const footer = manageable ? <Button testID="plan-manage" title={MANAGE_LABEL} variant="secondary" loading={busy === 'manage'} onPress={manage} /> : null;
  return (
    <Screen header={header} footer={footer} testID="plan-screen">
      {/* Keyed, so an arrival seen on a return to the front starts the card afresh at the Free level. */}
      <MembershipCard key={arriving ? 'arriving' : 'held'} view={view} arriving={arriving} outside={outside} />
      <View style={{ gap: spacing.sm }}>
        <SectionTitle title={isEnding(view) ? eachDayUntil(view.periodEnd) : EACH_DAY_TITLE} />
        <AllowanceTable free={view.planLimits.free} plus={view.planLimits.plus} current="plus" />
      </View>
      {/* The contract's two controls as plain rows; only the ones that apply, and no card with none. */}
      {cancel || withdraw ? (
        <View style={{ gap: spacing.sm }}>
          <Card padding={0} testID="plan-actions" style={{ paddingHorizontal: spacing.lg }}>
            {cancel ? (
              <ListRow
                testID="plan-cancel"
                title={CANCEL_LABEL}
                subtitle={tieEnd(CANCEL_SUB, 2)}
                left={
                  <IconTile>
                    <CalendarX />
                  </IconTile>
                }
                onPress={manage}
              />
            ) : null}
            {cancel && withdraw ? <Divider /> : null}
            {withdraw ? (
              <ListRow
                testID="plan-withdraw"
                title={WITHDRAW_LABEL}
                subtitle={tieDates(withdrawSub(withdraw))}
                left={
                  <IconTile>
                    <Undo2 />
                  </IconTile>
                }
                onPress={manage}
              />
            ) : null}
          </Card>
          {cancel && withdraw ? (
            <Text variant="caption" color="textSecondary">
              {BOTH_LEAD}
            </Text>
          ) : null}
        </View>
      ) : null}
      {/* A plan that is already cancelled, or one that ends by itself, has nothing left to cancel: the title says when instead. */}
      <StaysFree free={view.planLimits.free} title={isEnding(view) || view.source === 'promotional' ? STAYS_FREE_AFTER_END : STAYS_FREE_IF_CANCEL} />
      <LegalLinks />
    </Screen>
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
