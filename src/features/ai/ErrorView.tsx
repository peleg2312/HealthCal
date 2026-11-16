import { CalendarClock, CameraOff, CloudOff, ImageOff, KeyRound, ServerCrash, Timer, Utensils } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Card, Text } from '@/ui';

import { aiError, type AiErrorCode } from './api';

export type ScreenErrorCode = AiErrorCode | 'camera_denied' | 'unreadable';

const TITLE: Record<ScreenErrorCode, string> = {
  daily_limit: "You've used today's analyses",
  not_food: 'No food found',
  declined: 'This one could not be analysed',
  truncated: 'Too much on one plate',
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

/** A designed failure: what happened, and every reasonable way forward. The first action is primary. */
export function ErrorView({ code, message, actions, footnote }: { code: ScreenErrorCode; message: string; actions: ErrorAction[]; footnote?: string }) {
  const { colors, spacing } = useTheme();
  // Every failure is information, not alarm: the icon stands alone in the text colour.
  const tone = code === 'daily_limit' || code === 'not_food' ? colors.textSecondary : colors.text;
  return (
    <Card testID={`ai-error-${code}`} style={{ gap: spacing.md, alignItems: 'stretch' }}>
      <Icon code={code} color={tone} />
      <Text variant="h3">{TITLE[code]}</Text>
      <Text variant="body" color="textSecondary">
        {bodyFor(code, message)}
      </Text>
      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        {actions.map((a, i) => (
          <Button key={a.id} testID={`ai-error-${a.id}`} title={a.label} size="md" variant={i === 0 ? 'primary' : 'secondary'} onPress={a.onPress} />
        ))}
      </View>
      {footnote ? (
        <Text variant="caption" color="textTertiary">
          {footnote}
        </Text>
      ) : null}
    </Card>
  );
}
