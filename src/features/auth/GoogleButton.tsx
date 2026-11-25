/**
 * "Continue with Google": Google's own button, inside Pour as far as Google's rules allow.
 *
 * This is the one sanctioned exception to "theme colours and lucide icons only": Google's sign-in
 * branding rules (https://developers.google.com/identity/branding-guidelines) ask for the standard
 * full-colour G, unmodified, and Google's Light or Dark button colours. So the G below is Google's
 * own four paths in Google's own colours, and the button's fill, edge and label come from the three
 * palette tokens that hold Google's values (googleFill, googleEdge, googleText: Light on the light
 * papers, Dark on Dark and Java), never from a branch on the theme. What stays Pour: cup corners,
 * flat, one 1 px line, 50 px high like a field, the label in the app's own Hanken Grotesk 500 at
 * 14 px (Google Sans is not bundled). It is never the primary action: the screen's primary stays
 * its own button. It draws nothing until the backend says Google is on (googleSetting.ts).
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PourWait } from '@/components/PourWait';
import { cup, fonts, useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { askGoogleSetting, useGoogleChoice } from './googleSetting';
import { GOOGLE_LABEL } from './words';

/** Google's G, its four paths and colours exactly as Google ships them (48 x 48 grid). */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export const GOOGLE_BUTTON_HEIGHT = 50;

/**
 * Whether the button shows on this visit of a screen (`ready` once that is known); asks the
 * backend once a launch. Decided once per visit, so the button never moves what is on screen.
 */
export function useGoogleButtonChoice(): { ready: boolean; shown: boolean } {
  useEffect(() => askGoogleSetting(), []);
  return useGoogleChoice();
}

export function GoogleButton({ testID, onPress, busy, disabled }: { testID: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityLabel={GOOGLE_LABEL}
      accessibilityState={{ busy: !!busy, disabled: !!(disabled || busy) }}
      style={{
        height: GOOGLE_BUTTON_HEIGHT,
        ...cup(radius.button),
        backgroundColor: colors.googleFill,
        borderWidth: 1,
        borderColor: colors.googleEdge,
        paddingHorizontal: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'stretch',
      }}>
      {/* Google's layout: the G at the left edge, the label centred on the button. */}
      <View style={{ position: 'absolute', left: spacing.md, top: 0, bottom: 0, justifyContent: 'center' }}>
        <GoogleMark size={18} />
      </View>
      {busy ? (
        // The app's waiting cup (signing in is a wait that is not the AI), never a bare spinner.
        <PourWait size="inline" label="Signing in with Google" />
      ) : (
        <Text color="googleText" numberOfLines={1} style={{ fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, paddingHorizontal: 28 }}>
          {GOOGLE_LABEL}
        </Text>
      )}
    </PressableScale>
  );
}

/** The line between Google and the email form: a rule, "or", a rule. */
export function OrLine({ testID }: { testID?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      <Text variant="caption" color="textSecondary">
        or
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}

