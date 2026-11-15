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
 * there is no count while friends are off, signed out or loading.
 */
export function FriendsEntry({ testID }: { testID: string }) {
  const { colors } = useTheme();
  const status = useFriends((s) => s.status);
  const overview = useFriends((s) => s.overview);
  const seenAt = useFriendsSeen((s) => s.seenAt);
  const now = useNow();
  useEffect(loadFriendsSeen, []);
  const count = friendsAttention(status, overview, seenAt, now.getTime());
  return (
    <View>
      <IconButton testID={testID} accessibilityLabel={count ? `Friends, ${count} new` : 'Friends'} onPress={() => router.push('/friends' as never)}>
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
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 5,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text variant="caption" color="onPrimary" tabular style={{ fontSize: 11, lineHeight: 14, fontFamily: fonts.bold }}>
            {count > 9 ? '9+' : String(count)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
