import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export function ProgressBar({
  progress,
  color,
  height = 8,
  trackColor,
  style,
}: {
  progress: number;
  color: string;
  height?: number;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const target = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(value, { toValue: target, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [target, value]);
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: trackColor ?? colors.track, overflow: 'hidden' }, style]}>
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: color,
          width: value.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}
