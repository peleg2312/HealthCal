/**
 * The invite link as a QR code: the modules from `encodeQr` (./qr.ts) as one SVG path, dark `qrInk` on a light
 * `qrPaper` in every look (a phone camera reads dark on light most reliably), inside the standard quiet zone of
 * four modules. One image to a screen reader, named by what it holds. Nothing is drawn for a text longer than
 * version 6 holds (the invite link is far shorter).
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { cupFor, useTheme } from '@/theme';
import { figure } from '@/ui';

import { encodeQr, qrPath } from './qr';

const QUIET = 4;

export function QrCode({ value, size, label, testID }: { value: string; size: number; label: string; testID?: string }) {
  const { colors } = useTheme();
  const code = encodeQr(value);
  if (!code) return null;
  const span = code.size + QUIET * 2;
  return (
    <View testID={testID} {...figure(label)} style={{ width: size, height: size, ...cupFor(size), overflow: 'hidden', backgroundColor: colors.qrPaper }}>
      <Svg width={size} height={size} viewBox={`0 0 ${span} ${span}`}>
        <Rect x={0} y={0} width={span} height={span} fill={colors.qrPaper} />
        <Path d={qrPath(code.modules, 1, QUIET)} fill={colors.qrInk} />
      </Svg>
    </View>
  );
}
