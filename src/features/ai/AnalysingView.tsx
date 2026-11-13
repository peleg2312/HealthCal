import { Image } from 'expo-image';
import { Sparkles } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useTheme } from '@/theme';
import { Card, Text } from '@/ui';

/**
 * Waiting state. Honest about what is happening (no invented percentages):
 * a scanning light over the photo, placeholder rows, and a plain note if it
 * takes longer than usual.
 */
export function AnalysingView({ photoUri, aspect, description, precise }: { photoUri?: string; aspect?: number; description?: string; precise: boolean }) {
  const { colors, radius, spacing } = useTheme();
  const [sweep] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const [slow, setSlow] = useState(false);
  const [boxH, setBoxH] = useState(0);

  useEffect(() => {
    const a = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    a.start();
    b.start();
    const t = setTimeout(() => setSlow(true), precise ? 20_000 : 10_000);
    return () => {
      a.stop();
      b.stop();
      clearTimeout(t);
    };
  }, [sweep, pulse, precise]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });
  const translateY = sweep.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, boxH - 3)] });

  return (
    <View style={{ gap: spacing.lg }} testID="ai-analysing" accessibilityLiveRegion="polite">
      {photoUri ? (
        <View
          onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}
          style={{ width: '100%', aspectRatio: Math.max(0.75, Math.min(1.6, aspect ?? 1.33)), maxHeight: 340, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
          <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%', opacity: 0.75 }} contentFit="cover" accessibilityLabel="Your meal photo" />
          <Animated.View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: 3,
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
              shadowOpacity: 0.9,
              shadowRadius: 12,
              transform: [{ translateY }],
            }}
          />
        </View>
      ) : description ? (
        <Card tone="alt">
          <Text variant="body" color="textSecondary" numberOfLines={4}>
            “{description}”
          </Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Animated.View style={{ opacity }}>
          <Sparkles size={20} color={colors.primary} />
        </Animated.View>
        <Text variant="h3">{precise ? 'Checking more carefully' : 'Estimating your meal'}</Text>
      </View>
      <Text variant="body" color="textSecondary">
        {slow
          ? 'Still working. Busy plates and the careful check take a little longer.'
          : precise
            ? 'A stronger model is looking at each food, its portion and any hidden fat. This can take up to half a minute.'
            : 'Looking at each food, its portion and any hidden fat. This usually takes a few seconds.'}
      </Text>

      <Card padding={spacing.lg} style={{ gap: spacing.lg }}>
        {[0.62, 0.48, 0.55].map((w, i) => (
          <Animated.View key={i} style={{ opacity, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ height: 12, width: `${w * 100}%`, borderRadius: 6, backgroundColor: colors.track }} />
            <View style={{ flex: 1 }} />
            <View style={{ height: 12, width: 44, borderRadius: 6, backgroundColor: colors.track }} />
          </Animated.View>
        ))}
      </Card>
    </View>
  );
}
