import { CalendarClock, CameraOff, CloudOff, ImageOff, KeyRound, ServerCrash, Timer, Utensils } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { usedAllowance } from '@/features/plan/allowance';
import { AllowanceUsed } from '@/features/plan/AllowanceUsed';
import { tieEnd } from '@/features/plan/words';
import { useTheme } from '@/theme';
import { Button, Card, Text } from '@/ui';

import { aiError, type AiErrorCode } from './api';
import type { LimitInfo } from './limit';

export type ScreenErrorCode = AiErrorCode | 'camera_denied' | 'unreadable';

const TITLE: Record<ScreenErrorCode, string> = {
  daily_limit: "You've used today's AI estimates",
  not_food: 'No food found',
  declined: 'This one could not be estimated',
  truncated: 'Many items on one plate',
  rate_limited: 'The service is busy',
  unauthorized: 'Sign in again',
  not_configured: 'Analysis is not set up',
  bad_request: 'That image did not work',
  upstream: 'Analysis is unavailable',
  network: 'No connection',
  timeout: 'That took too long',
  unknown: 'Something went wrong',
  camera_denied: 'Camera access is off',
  unreadable: 'That photo could not be read',
};

/**
 * What follows the title when the message is the app's own: the stock message starts by saying
 * what the title already says ("No connection. Check your internet..."). A server's own message is shown as sent.
 */
const AFTER_TITLE: Partial<Record<AiErrorCode, string>> = {
  daily_limit: 'They reset at midnight UTC.',
  network: 'Check your internet and try again.',
  not_food: 'Try a clearer photo or describe the meal.',
  unauthorized: 'Your session has expired.',
  bad_request: 'Try another photo.',
};

function bodyFor(code: ScreenErrorCode, message: string): string {
  if (code === 'camera_denied' || code === 'unreadable') return message;
  const short = AFTER_TITLE[code];
  return short && message === aiError(code).message ? short : message;
}

function Icon({ code, color }: { code: ScreenErrorCode; color: string }) {
  const p = { size: 28, color, strokeWidth: 1.9 };
  switch (code) {
    case 'daily_limit':
      return <CalendarClock {...p} />;
    case 'not_food':
      return <Utensils {...p} />;
    case 'network':
      return <CloudOff {...p} />;
    case 'timeout':
    case 'rate_limited':
      return <Timer {...p} />;
    case 'unauthorized':
      return <KeyRound {...p} />;
    case 'camera_denied':
      return <CameraOff {...p} />;
    case 'declined':
    case 'bad_request':
    case 'unreadable':
    case 'truncated':
      return <ImageOff {...p} />;
    default:
      return <ServerCrash {...p} />;
  }
}

export interface ErrorAction {
  id: string;
  label: string;
  onPress: () => void;
}

/**
 * A designed failure: what happened, and every reasonable way forward. The first action is primary.
 * `title` and `body` replace the stock words (the limit's plan-aware words, ./limit.ts); `link` is one
 * quiet ghost link after the actions (the plan link at the limit, `ai-limit-plans`), never a filled button.
 * `limit` (the plan fields of a limit answer, with `leftBefore`, what was left before the call) puts
 * today's allowance in the icon's place as a full cup (`ai-limit-cup`), only at the person's own daily
 * limit (`usedAllowance`, @/features/plan/allowance: never at the shared ceiling, never for a careful
 * estimate that needed more than is left). The cup carries no figure: the title says the number once.
 * It adds no word and no link, and the title, body, actions and link keep their words and their order.
 */
export function ErrorView({
  code,
  message,
  actions,
  footnote,
  title,
  body,
  link,
  limit,
  leftBefore,
}: {
  code: ScreenErrorCode;
  message: string;
  actions: ErrorAction[];
  footnote?: string;
  title?: string;
  body?: string;
  link?: { testID: string; label: string; onPress: () => void };
  limit?: LimitInfo | null;
  leftBefore?: number | null;
}) {
  const { colors, spacing } = useTheme();
  // Every failure is information, not alarm: the icon stands alone in the text colour.
  const tone = code === 'daily_limit' || code === 'not_food' ? colors.textSecondary : colors.text;
  const used = code === 'daily_limit' ? usedAllowance(limit, leftBefore ?? null) : null;
  return (
    <Card testID={`ai-error-${code}`} style={{ gap: spacing.md, alignItems: 'stretch' }}>
      {used ? <AllowanceUsed used={used.used} limit={used.limit} /> : <Icon code={code} color={tone} />}
      {/* The last two words stay together: "Today's 5 estimates are used" never leaves "used" alone at 320 px. */}
      <Text variant="h3">{tieEnd(title ?? TITLE[code], 2)}</Text>
      <Text variant="body" color="textSecondary">
        {body ?? bodyFor(code, message)}
      </Text>
      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        {actions.map((a, i) => (
          <Button key={a.id} testID={`ai-error-${a.id}`} title={a.label} size="md" variant={i === 0 ? 'primary' : 'secondary'} onPress={a.onPress} />
        ))}
        {link ? <Button testID={link.testID} title={link.label} size="md" variant="ghost" onPress={link.onPress} /> : null}
      </View>
      {footnote ? (
        <Text variant="caption" color="textTertiary">
          {footnote}
        </Text>
      ) : null}
    </Card>
  );
}
