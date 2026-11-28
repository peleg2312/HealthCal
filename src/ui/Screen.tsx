import { router, useIsFocused, usePreventRemove } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, useTheme } from '@/theme';

import { IconButton } from './Button';
import { keyboardCover, revealDelta, scrollGivesUp } from './keyboardInset';
import { FadeUp } from './motion';
import { PressableScale } from './Pressable';
import { useShortWindow } from './shortWindow';
import { ConfirmSheet } from './Sheet';
import { Text } from './Text';
import { useToastBand, useToastDock } from './Toast';
import { ToastScope } from './toastControls';

/** Height of the docked tab bar above the home indicator (the + cup rises 14 px above it). */
export const TAB_BAR_HEIGHT = 58;
/** Height reserved at the bottom of tab screens for the docked tab bar, plus breathing room. */
export const TAB_BAR_SPACE = TAB_BAR_HEIGHT + 28;


/**
 * What the tab bar adds to its height now: 0, or with large text on a window too narrow for its four labels whole
 * beside the + cup, the band the + then has over them (the tab bar sets it). Tab screens pad for it and the toast
 * rests above it.
 */
let tabBarExtra = 0;
const tabBarListeners = new Set<() => void>();
export function setTabBarExtra(px: number): void {
  if (px === tabBarExtra) return;
  tabBarExtra = px;
  for (const l of tabBarListeners) l();
}
/** The tab bar's extra height (`setTabBarExtra`), live. */
export function useTabBarExtra(): number {
  return useSyncExternalStore(
    (l) => {
      tabBarListeners.add(l);
      return () => tabBarListeners.delete(l);
    },
    () => tabBarExtra,
    () => tabBarExtra,
  );
}

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
  /**
   * Fade the content up 8 px when the screen first mounts (default true). On web this is the
   * page change, since the stack does not animate there. Set false for a screen that runs its
   * own entrance (onboarding steps, the plan reveal). Reduced motion turns it off.
   */
  enter?: boolean;
  testID?: string;
}

export function Screen({ children, scroll = true, header, footer, tabs, padded = true, contentStyle, scrollProps, noTopInset, backdrop: _backdrop, enter = true, testID }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const inner: ViewStyle = {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: padded ? spacing.xl : 0,
  };
  const barExtra = useTabBarExtra();
  // A short window pins nothing: the header and the footer scroll with the content (see `SHORT_WINDOW`). A screen
  // that manages its own list (`scroll={false}`) keeps them pinned.
  const short = useShortWindow();
  const unpinned = scroll && short;
  const pinnedFooter = unpinned ? null : footer;
  // Above a footer that scrolls with the content, the content ends as the cards' own gap does.
  const bottomPad = (tabs ? TAB_BAR_SPACE + barExtra : footer && unpinned ? spacing.lg : spacing.xxl) + (footer ? 0 : insets.bottom);
  // The toast rests 12 px above whatever this screen has at the bottom: the pinned footer,
  // the tab bar with its + cup (14 px proud of the bar), or just the home indicator; with the
  // keyboard up, the footer riding on it or the keyboard itself (see `cover` below).
  const [footerH, setFooterH] = useState(0);
  const focused = useIsFocused();
  // An id for this screen's element on web, so the keyboard handling only moves its own fields.
  const [domId] = useState(() => `screen-${++screenSeq}`);
  const webKeyboard = useWebKeyboard(domId, focused);
  // What the keyboard covers, by the same measure this screen pads itself with, for the toast:
  // in a phone browser the padding below; natively the padding KeyboardAvoidingView applied, read
  // as its height less its content's (it computes the padding itself and does not report it).
  // Where the window already shrank for the keyboard it pads nothing, so this is 0 and the toast
  // stays on the chrome, which is then drawn above the keyboard: never counted twice.
  const [outerH, setOuterH] = useState(0);
  const [innerH, setInnerH] = useState(0);
  const cover = Platform.OS === 'web' ? webKeyboard : outerH > 0 && innerH > 0 ? Math.max(0, outerH - innerH) : 0;
  const dock = pinnedFooter ? footerH : insets.bottom + (tabs ? TAB_BAR_HEIGHT + 14 + barExtra : 0);
  useToastDock(dock, focused, { cover, rides: !!pinnedFooter }, domId);
  // The toast always rests in one place; when a control of this screen lies under it, the scroll area ends 8 px above
  // it while it shows, so nothing a person can press is under it (`useToastBand`). Nothing on screen moves: the rows
  // under the band leave the scroll area's view and are a scroll away.
  const band = useToastBand(domId);
  // Under the scroll area lie the pinned footer and, while it is up, what the keyboard covers.
  const givesUp = focused ? scrollGivesUp(band, (pinnedFooter ? footerH : 0) + cover) : 0;
  // Keyboard focus is never left under the tab bar (WCAG 2.4.11), which lies over the scroll area, nor with its ring
  // cut at the edge of the scroll area, under a pinned footer or at the window's bottom (2.4.12).
  useFocusClear(domId, focused, tabs && !pinnedFooter ? dock : 0);
  const footerView = footer ? (
    <View
      testID="screen-footer"
      onLayout={(e) => setFooterH(Math.round(e.nativeEvent.layout.height))}
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.bg,
      }}>
      <View
        style={[
          inner,
          {
            paddingTop: spacing.md,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
          },
        ]}>
        {footer}
      </View>
    </View>
  ) : null;
  const headerView = header ? <View style={inner}>{header}</View> : null;
  const body = (
    <FadeUp disabled={!enter} style={{ flex: 1 }}>
      <View style={{ paddingTop: noTopInset ? 0 : insets.top }} />
      {unpinned ? null : headerView}
      {unpinned ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...scrollProps}
          style={[scrollProps?.style, givesUp ? { marginBottom: givesUp } : null]}>
          {headerView}
          <View style={[inner, { paddingTop: spacing.sm, paddingBottom: bottomPad, gap: spacing.lg }, contentStyle]}>{children}</View>
          {footerView}
        </ScrollView>
      ) : scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...scrollProps}
          style={[scrollProps?.style, givesUp ? { marginBottom: givesUp } : null]}
          contentContainerStyle={[
            inner,
            {
              paddingTop: spacing.sm,
              paddingBottom: bottomPad,
              gap: spacing.lg,
            },
            contentStyle,
          ]}>
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            inner,
            {
              flex: 1,
              paddingBottom: (tabs ? TAB_BAR_SPACE + barExtra : 0) + (footer ? 0 : insets.bottom),
            },
            givesUp ? { marginBottom: givesUp } : null,
            contentStyle,
          ]}>
          {children}
        </View>
      )}
      {unpinned ? null : footerView}
    </FadeUp>
  );
  return (
    // The keyboard, natively: KeyboardAvoidingView with "padding" on both platforms. On iOS the keyboard
    // covers the app and "padding" lifts the content (and a pinned footer) above it. On Android the app is
    // edge-to-edge (Expo SDK 58 default, edgeToEdgeEnabled in the generated gradle.properties), so the
    // window no longer resizes for the keyboard (adjustResize has no effect) and without a behaviour the
    // keyboard covers the footer and the lower fields. React Native 0.88's ReactRootView reports the
    // keyboard's top as the window's visible display frame bottom (keyboardDidShow, screenY), and
    // KeyboardAvoidingView pads by frame.y + frame.height - screenY: exactly the part under the keyboard,
    // with the navigation bar's share included, since an edge-to-edge window runs under it. "height" would
    // also work but changes the view's flex; "position" would move the footer off its own layout.
    // softwareKeyboardLayoutMode must stay "resize" (the default; app.json does not set it): with "pan"
    // the window pans and this pads, and a field moves up twice (Expo's keyboard-handling guide).
    // ScrollView then keeps the focused field in view: Android's ScrollView.onSizeChanged scrolls a focused
    // child that was visible back into view when the padding shrinks it. Web has no keyboard events:
    // useWebKeyboard below pads by what the visual viewport says the keyboard covers.
    // On a phone every kit control drawn in this screen is on its list, so a toast rests clear of them.
    <ToastScope.Provider value={domId}>
    <KeyboardAvoidingView
      nativeID={domId}
      testID={testID}
      style={[{ flex: 1, backgroundColor: colors.bg }, webKeyboard ? { paddingBottom: webKeyboard } : null]}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
      onLayout={Platform.OS === 'web' ? undefined : (e) => setOuterH(Math.round(e.nativeEvent.layout.height))}>
      {Platform.OS === 'web' ? (
        body
      ) : (
        // Natively only: a plain box around the content, whose height is the view's less the padding.
        <View style={{ flex: 1 }} onLayout={(e) => setInnerH(Math.round(e.nativeEvent.layout.height))}>
          {body}
        </View>
      )}
    </KeyboardAvoidingView>
    </ToastScope.Provider>
  );
}

let screenSeq = 0;

/** The browser's VisualViewport, where there is one (web only). */
function visualViewport(): VisualViewport | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.visualViewport ?? null;
}

/** The nearest element above `el` that scrolls vertically. */
function scrollerOf(el: Element | null): HTMLElement | null {
  for (let e = el?.parentElement ?? null; e && e !== document.body; e = e.parentElement) {
    const oy = getComputedStyle(e).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight + 1) return e;
  }
  return null;
}

/**
 * Phone browsers (web only): the px the on-screen keyboard covers at the bottom of the page
 * while this screen is in front, 0 otherwise. The page's layout does not shrink for the keyboard
 * on iOS (Safari and a Home Screen web app) nor by default in Android Chrome; only the visual
 * viewport does. So the screen pads its bottom by that much (the pinned footer rises above the
 * keyboard and the scroll area ends where the keyboard starts), puts back the page scroll the
 * browser leaves behind when it pans to the field, and scrolls the focused field into the space
 * that is left. When the keyboard closes the padding goes. The arithmetic is in ./keyboardInset.
 * Proven in a browser with a faked visualViewport (scripts/dev/e2e.cjs); not yet on an iPhone.
 */
function useWebKeyboard(domId: string, active: boolean): number {
  const [cover, setCover] = useState(0);
  useEffect(() => {
    const vv = visualViewport();
    if (!vv || !active) return;
    const measure = () => {
      const next = keyboardCover({ layoutHeight: window.innerHeight, viewportHeight: vv.height, scale: vv.scale });
      setCover(next);
      // The browser panned the page to the field; the padding now makes room, so pan it back.
      if (next > 0 && (window.scrollY > 0 || vv.offsetTop > 0)) window.scrollTo(0, 0);
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
      setCover(0);
    };
  }, [active]);
  // With the keyboard open, keep the focused field (in this screen) inside what is visible: after the
  // padding has been laid out, and again whenever the focus moves to another field.
  useEffect(() => {
    if (!cover || typeof document === 'undefined') return;
    const reveal = () => {
      const el = document.activeElement;
      const host = document.getElementById(domId);
      if (!el || !host || !host.contains(el) || !(el instanceof HTMLElement)) return;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) return;
      if (window.scrollY > 0) window.scrollTo(0, 0);
      const scroller = scrollerOf(el);
      if (!scroller) return;
      const r = el.getBoundingClientRect();
      const v = scroller.getBoundingClientRect();
      const delta = revealDelta({ top: r.top, bottom: r.bottom }, { top: v.top, bottom: Math.min(v.bottom, window.innerHeight - cover) });
      if (delta) scroller.scrollTop += delta;
    };
    const frame = requestAnimationFrame(reveal);
    const onFocus = () => requestAnimationFrame(reveal);
    document.addEventListener('focusin', onFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', onFocus);
    };
  }, [cover, domId]);
  return cover;
}

/**
 * Web only: a control reached with the keyboard (Tab) that lies under the tab bar, which is drawn over the
 * bottom of a tab screen's scroll area (`chrome`), or at an edge of the scroll area (a pinned footer under it, the
 * header above it), is scrolled into the part of the screen that shows with REVEAL_MARGIN to spare, so the
 * control and its focus ring (3 px, 2 px outside it) show whole. The browser's own scroll to a focused control
 * stops at its edge and left the ring, and up to 2 px of Goals' radios, under the footer. Only for keyboard focus
 * (`:focus-visible`), so a tap never moves the page.
 */
function useFocusClear(domId: string, active: boolean, chrome: number) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !active || typeof document === 'undefined') return;
    const clear = () => {
      const el = document.activeElement;
      const host = document.getElementById(domId);
      if (!(el instanceof HTMLElement) || !host || !host.contains(el)) return;
      let keyboard = true;
      try {
        keyboard = el.matches(':focus-visible');
      } catch {
        // An old browser without :focus-visible: treat it as keyboard focus.
      }
      if (!keyboard) return;
      const scroller = scrollerOf(el);
      if (!scroller) return;
      const r = el.getBoundingClientRect();
      const v = scroller.getBoundingClientRect();
      const delta = revealDelta({ top: r.top, bottom: r.bottom }, { top: v.top, bottom: Math.min(v.bottom, window.innerHeight - chrome) });
      if (delta) scroller.scrollTop += delta;
    };
    const onFocus = () => requestAnimationFrame(clear);
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, [domId, active, chrome]);
}

/**
 * A task screen that holds something typed and not saved (quick add's numbers) asks before it is left:
 * by its X, the back button, a swipe back or the browser's back. Pass the question while there is
 * something to lose ("Discard this quick add?"), else null. Render `guard` inside the screen, and call
 * `allowLeave()` right before the screen's own Save leaves it, so saving never asks.
 *
 *   const leave = useLeaveGuard(dirty ? 'Discard this quick add?' : null);
 *   ... onSave: () => { save(); leave.allowLeave(); goBack(); }
 *   ... {leave.guard}
 */
export function useLeaveGuard(unsaved: string | false | null | undefined): { allowLeave: () => void; guard: React.ReactElement } {
  const [released, setReleased] = useState(false);
  const [asking, setAsking] = useState<{ go: () => void } | null>(null);
  const [question, setQuestion] = useState('');
  const disable = usePreventRemove(!!unsaved && !released, ({ repeat }) => {
    setQuestion(unsaved || '');
    setAsking({ go: repeat });
  });
  const allowLeave = () => {
    setReleased(true);
    disable();
  };
  const guard = (
    <ConfirmSheet
      visible={!!asking}
      title={question}
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      destructive
      onConfirm={() => {
        const go = asking?.go;
        setAsking(null);
        allowLeave();
        go?.();
      }}
      onCancel={() => setAsking(null)}
    />
  );
  return { allowLeave, guard };
}

export function goBack(fallback: string = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

/**
 * The header of every pushed screen (tab screens use TabHeader): a back cup, the screen's
 * title, at most one short line under it and at most one action on the right. Screens that
 * rise from the bottom as tasks pass `close` for the X; everything else goes back with the
 * chevron. The title here is the screen's title, so there is no second large title under it.
 */
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
    <View
      testID="screen-header"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 56,
        gap: spacing.md,
        paddingVertical: spacing.sm,
      }}>
      {close ? (
        <IconButton accessibilityLabel="Close" onPress={handle} testID="header-close">
          <X size={20} color={colors.text} strokeWidth={2.2} />
        </IconButton>
      ) : back ? (
        <IconButton accessibilityLabel="Back" onPress={handle} testID="header-back">
          <ChevronLeft size={22} color={colors.text} strokeWidth={2.2} />
        </IconButton>
      ) : null}
      {/* minWidth 0 lets a long title shorten with an ellipsis inside the side padding instead of running past it. */}
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? (
          // The screen's one level-1 heading (D6-02); section titles are level 2.
          <Text variant="h3" numberOfLines={1} accessibilityRole="header" {...({ 'aria-level': 1 } as object)}>
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

export function SectionTitle({ title, action, onAction, testID }: { title: string; action?: string; onAction?: () => void; testID?: string }) {
  const slug = (testID ?? title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
      }}>
      <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)} style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {action && onAction ? (
        // The label is small; the pressable around it is a full-height touch target.
        // Section titles sit on bg, where light primary text is just under 4.5:1, so the action is an underlined text link.
        <PressableScale
          testID={`section-${slug}-action`}
          accessibilityLabel={action}
          onPress={onAction}
          hitSlop={8}
          style={{
            minHeight: 44,
            justifyContent: 'center',
            paddingLeft: 12,
            marginVertical: -10,
          }}>
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
