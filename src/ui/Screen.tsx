import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, useTheme } from '@/theme';

import { AmbientGlow } from './AmbientGlow';
import { IconButton } from './Button';
import { Text } from './Text';

/** Height reserved at the bottom of tab screens for the floating tab bar. */
export const TAB_BAR_SPACE = 104;

export interface ScreenProps {
  children: React.ReactNode;
  /** Scrolls by default. Set false for screens that manage their own list. */
  scroll?: boolean;
  /** Fixed content above the scroll area (usually a Header). */
  header?: React.ReactNode;
  /** Fixed content pinned to the bottom (usually the primary button). */
  footer?: React.ReactNode;
  /** Leave room for the tab bar. */
  tabs?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: ScrollViewProps;
  /** Skip the top safe-area inset (modals presented as sheets on iOS). */
  noTopInset?: boolean;
  /** A theme colour washed softly behind the top of the screen (pass the screen's semantic colour). */
  backdrop?: string;
  testID?: string;
}

export function Screen({ children, scroll = true, header, footer, tabs, padded = true, contentStyle, scrollProps, noTopInset, backdrop, testID }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const inner: ViewStyle = {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: padded ? spacing.xl : 0,
  };
  const bottomPad = (tabs ? TAB_BAR_SPACE : spacing.xxl) + (footer ? 0 : insets.bottom);
  return (
    <KeyboardAvoidingView testID={testID} style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {backdrop ? <AmbientGlow color={backdrop} /> : null}
      <View style={{ paddingTop: noTopInset ? 0 : insets.top }} />
      {header ? <View style={inner}>{header}</View> : null}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...scrollProps}
          contentContainerStyle={[inner, { paddingTop: spacing.sm, paddingBottom: bottomPad, gap: spacing.lg }, contentStyle]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[inner, { flex: 1 }, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
          <View style={[inner, { paddingTop: spacing.md, paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function goBack(fallback: string = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

export function Header({
  title,
  subtitle,
  back = true,
  close,
  right,
  onBack,
}: {
  title?: string;
  subtitle?: string;
  /** Show a back chevron. */
  back?: boolean;
  /** Show a close cross instead (modals). */
  close?: boolean;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const { colors, spacing } = useTheme();
  const handle = onBack ?? (() => goBack());
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing.md, paddingVertical: spacing.sm }}>
      {close ? (
        <IconButton accessibilityLabel="Close" onPress={handle} testID="header-close">
          <X size={20} color={colors.text} />
        </IconButton>
      ) : back ? (
        <IconButton accessibilityLabel="Back" onPress={handle} testID="header-back">
          <ChevronLeft size={22} color={colors.text} />
        </IconButton>
      ) : null}
      <View style={{ flex: 1 }}>
        {title ? (
          <Text variant="h3" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Large title used at the top of tab screens. */
export function LargeTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs, gap: spacing.md }}>
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <Text variant="label" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
        <Text variant="h1" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
      <Text variant="h3">{title}</Text>
      {action ? (
        <Text variant="label" color="primary" onPress={onAction} accessibilityRole="button" suppressHighlighting>
          {action}
        </Text>
      ) : null}
    </View>
  );
}
