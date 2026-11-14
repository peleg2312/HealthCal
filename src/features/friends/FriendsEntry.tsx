import { router } from 'expo-router';
import { Users } from 'lucide-react-native';
import React from 'react';

import { useFriends } from '@/services/friends';
import { useTheme } from '@/theme';
import { CupKey, IconButton } from '@/ui';

/** The way into Friends from Train: training is what friends see. A cup key marks requests waiting for an answer. */
export function FriendsEntry() {
  const { colors } = useTheme();
  const waiting = useFriends((s) => s.overview?.incoming.length ?? 0);
  return (
    <IconButton
      testID="train-friends"
      accessibilityLabel={waiting ? `Friends, ${waiting} ${waiting === 1 ? 'request' : 'requests'} waiting` : 'Friends'}
      onPress={() => router.push('/friends' as never)}>
      <Users size={20} color={colors.text} strokeWidth={2} />
      {waiting ? <CupKey color={colors.primary} size={8} style={{ position: 'absolute', top: 8, right: 8 }} /> : null}
    </IconButton>
  );
}
