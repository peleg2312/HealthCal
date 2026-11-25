import { router } from 'expo-router';
import { Users } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { View } from 'react-native';

import { useFriends } from '@/services/friends';
import { useNow } from '@/store/clock';
import { fonts, useTheme } from '@/theme';
import { IconButton, Text } from '@/ui';

import { friendsAttention, loadFriendsSeen, useFriendsSeen } from './attention';

/**
 * The way into Friends, in the same place on every tab header. A small count marks
 * requests waiting for an answer and cheers received since Friends was last opened;
 * there is no count while friends are off, signed out or loading. `size` is the cup's visible
 * size (the tab header's cups are 36 px; IconButton keeps the touch area at 44).
 */
export function FriendsEntry({ testID, size = 44, hitSlop }: { testID: string; size?: number; hitSlop?: { top: number; bottom: number; left: number; right: number } }) {
  const { colors, radius } = useTheme();
  const status = useFriends((s) => s.status);
  const overview = useFriends((s) => s.overview);
  const seenAt = useFriendsSeen((s) => s.seenAt);
  const now = useNow();
  useEffect(loadFriendsSeen, []);
  const count = friendsAttention(status, overview, seenAt, now.getTime());
  return (
    <View>
      <IconButton testID={testID} size={size} hitSlop={hitSlop} accessibilityLabel={count ? `Friends, ${count} new` : 'Friends'} onPress={() => router.push('/friends' as never)}>
        <Users size={20} color={colors.text} strokeWidth={1.9} />
      </IconButton>
      {count ? (
        // A label on the cup's corner, on purpose. It takes no touches, so the whole cup stays the button.
        <View
          pointerEvents="none"
          testID={`${testID}-count`}
          style={{
            position: 'absolute',
            top: -5,
            right: -5,
            minWidth: 20,
            minHeight: 20,
            paddingHorizontal: 4,
            // A label's small equal corners, and the caption's own size (12.5 px, never under the 12 px floor).
            borderRadius: radius.chip,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text variant="caption" color="onPrimary" tabular style={{ fontFamily: fonts.bold }}>
            {count > 9 ? '9+' : String(count)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
