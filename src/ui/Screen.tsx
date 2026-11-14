import { router } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, useTheme } from '@/theme';

import { IconButton } from './Button';
import { PressableScale } from './Pressable';
import { Text } from './Text';

/** Height of the docked tab bar above the home indicator (the + cup rises 14 px above it). */
export const TAB_BAR_HEIGHT = 58;
/** Height reserved at the bottom of tab screens for the docked tab bar, plus breathing room. */
export const TAB_BAR_SPACE = TAB_BAR_HEIGHT + 28;

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
  /** @deprecated Pour has no glow backdrops. Accepted so callers do not break; ignored. */
  backdrop?: string;
  testID?: string;
}

export function Screen({ children, scroll = true, header, footer, tabs, padded = true, contentStyle, scrollProps, noTopInset, backdrop: _backdrop, testID }: ScreenProps) {
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
    <KeyboardAvoidingView testID={testID} style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
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
        <View style={[inner, { flex: 1, paddingBottom: (tabs ? TAB_BAR_SPACE : 0) + (footer ? 0 : insets.bottom) }, contentStyle]}>{children}</View>
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
          <X size={20} color={colors.text} strokeWidth={2.2} />
        </IconButton>
      ) : back ? (
        <IconButton accessibilityLabel="Back" onPress={handle} testID="header-back">
          <ChevronLeft size={22} color={colors.text} strokeWidth={2.2} />
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

/** Large title used at the top of tab screens: an overline (the date or range) above a Bricolage h1. */
export function LargeTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingTop: spacing.sm, paddingBottom: spacing.xs, gap: spacing.md }}>
      <View style={{ flex: 1, gap: 6 }}>
        {subtitle ? (
          <Text variant="overline" numberOfLines={1}>
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

export function SectionTitle({ title, action, onAction, testID }: { title: string; action?: string; onAction?: () => void; testID?: string }) {
  const slug = (testID ?? title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
      <Text variant="h3" style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {action && onAction ? (
        // The label is small; the pressable around it is a full-height touch target.
        // Section titles sit on bg, where light primary text is just under 4.5:1, so the action is an underlined text link.
        <PressableScale testID={`section-${slug}-action`} accessibilityLabel={action} onPress={onAction} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 12, marginVertical: -10 }}>
          <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
            {action}
          </Text>
        </PressableScale>
      ) : action ? (
        <Text variant="label" color="textSecondary">
          {action}
        </Text>
      ) : null}
    </View>
  );
}
