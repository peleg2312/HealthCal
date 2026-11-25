import { X } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { go } from '@/features/progress/parts';
import { diffDays } from '@/lib/dates';
import { useToday } from '@/store/clock';
import { foodLoggedDates, useLive } from '@/store/selectors';
import { cup, useTheme } from '@/theme';
import { Badge, Card, CupKey, Divider, IconButton, ListRow, MiniCup, Text, toast } from '@/ui';
import type { ISODate } from '@/types';

import { markPeriodDealt, offerAllowed, periodOffer, unmarkPeriodDealt, useDealtPeriods } from './offer';
import { countedSpan, defaultMonth, defaultYear, loggedBetween, monthPeriod, yearPeriod, type Period } from './period';
import { useFirstDate } from './usePeriodRecap';
import { monthRowWords, OFFER_HIDDEN, offerLine, periodName, yearRowWords } from './words';

const routeOf = (p: Period) => (p.kind === 'month' ? `/recap/month?month=${p.key}` : `/recap/year?year=${p.key}`);

/** The days with food logged and the first record: all the Progress entries need (no day is computed). */
function useLoggedDays() {
  const today = useToday();
  const food = useLive('foodEntries');
  const firstDate = useFirstDate(today);
  const logged = useMemo(() => foodLoggedDates(food), [food]);
  return { today, firstDate, logged };
}

/** The period Progress offers once as a month or a year ends (`periodOffer`), or null. */
function useOffer(today: ISODate, logged: ReadonlySet<ISODate>, firstDate: ISODate | null): Period | null {
  const dealt = useDealtPeriods();
  return periodOffer(today, logged, firstDate, offerAllowed() ? dealt : null);
}

/** "26 of 31 days logged" for a month, "214 days logged so far" for a year, counted from the logged days, and the share. */
function counted(p: Period, logged: ReadonlySet<ISODate>, today: ISODate, firstDate: ISODate | null): { caption: string; share: number } {
  const span = countedSpan(p, today, firstDate);
  const n = span ? loggedBetween(logged, span.from, span.to) : 0;
  const elapsed = span ? diffDays(span.from, span.to) + 1 : 0;
  const share = elapsed ? n / elapsed : 0;
  if (p.kind === 'year') return { caption: yearRowWords(p.key, n, today).caption, share };
  return { caption: monthRowWords(p.key, n, elapsed, today).caption, share };
}

/**
 * The gentle one-time line at the top of Progress when a month or a year has ended ("Your October in cups"):
 * one slim row in a surface tile, the kit's ListRow with its mark and chevron, and the hide X beside it, never a
 * pop-up and never over logging. It opens the recap (which deals with it); the X puts it away, with Undo. Either
 * way it is not offered again on this device. A row like Today's "Your week is ready".
 */
export function PeriodOfferRow() {
  const { colors, radius, spacing } = useTheme();
  const { today, firstDate, logged } = useLoggedDays();
  const offer = useOffer(today, logged, firstDate);
  if (!offer) return null;
  const line = offerLine(offer, today);
  const hide = () => {
    markPeriodDealt(offer.key);
    toast(OFFER_HIDDEN, { label: 'Undo', onPress: () => unmarkPeriodDealt(offer.key) });
  };
  return (
    <View
      testID="progress-period-offer"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...cup(radius.card), paddingLeft: spacing.lg, paddingRight: spacing.xs }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ListRow
          testID="progress-period-offer-open"
          title={line}
          subtitle={counted(offer, logged, today, firstDate).caption}
          left={<CupKey color={colors.calories} size={12} />}
          chevron
          onPress={() => go(routeOf(offer))}
        />
      </View>
      <IconButton tone="clear" testID="progress-period-offer-hide" accessibilityLabel={`Hide ${line}`} onPress={hide}>
        <X size={18} color={colors.textSecondary} strokeWidth={1.9} />
      </IconButton>
    </View>
  );
}

/**
 * Progress's way in to the months and years in cups: the last month that has ended (or this one, so far) and this
 * year, each a row that opens its recap, with "New" beside the title while one is offered and not yet opened.
 * Counted from the logged days only, so Progress computes no extra day.
 */
export function PeriodsCard() {
  const { colors, spacing } = useTheme();
  const { today, firstDate, logged } = useLoggedDays();
  const offer = useOffer(today, logged, firstDate);
  if (!firstDate) return null;
  const month = monthPeriod(defaultMonth(today, firstDate));
  const year = yearPeriod(defaultYear(today, firstDate));
  return (
    <Card testID="progress-periods" style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, rowGap: spacing.sm }}>
        <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)} style={{ flexShrink: 1 }}>
          Months and years in cups
        </Text>
        {offer ? <Badge label="New" color={colors.primary} /> : null}
      </View>
      {[month, year].map((p, i) => {
        const c = counted(p, logged, today, firstDate);
        return (
          <React.Fragment key={p.key}>
            {i ? <Divider /> : null}
            <ListRow
              testID={`progress-periods-${p.kind}`}
              title={`Your ${periodName(p, today)}`}
              subtitle={c.caption}
              // A small cup filled to the share of its days with food logged: the recap's own picture, in little.
              left={<MiniCup progress={c.share} color={colors.calories} width={18} height={22} index={i} memoryKey={`periods-${p.key}-${c.share.toFixed(3)}`} />}
              chevron
              onPress={() => go(routeOf(p))}
            />
          </React.Fragment>
        );
      })}
    </Card>
  );
}
