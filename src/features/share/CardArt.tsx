import React, { useId } from 'react';
import Svg, { ClipPath, Defs, G, Path, Rect, Text as SvgText, TSpan } from 'react-native-svg';

import { fonts } from '@/theme';

import type { Prim, Scene } from './scene';

function draw(p: Prim, key: string, uid: string): React.ReactNode {
  switch (p.k) {
    case 'rect':
      return <Rect key={key} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} opacity={p.opacity} />;
    case 'path':
      return (
        <Path
          key={key}
          d={p.d}
          fill={p.fill ?? 'none'}
          stroke={p.stroke}
          strokeWidth={p.sw}
          strokeDasharray={p.dash?.join(' ')}
          strokeLinecap={p.stroke ? 'round' : undefined}
          strokeLinejoin={p.stroke ? 'round' : undefined}
          opacity={p.opacity}
        />
      );
    case 'text':
      return (
        <SvgText key={key} x={p.x} y={p.y} textAnchor={p.anchor ?? 'start'}>
          {p.runs
            .filter((r) => r.text)
            .map((r, i) => (
              <TSpan key={i} fontFamily={fonts[r.font]} fontSize={r.size} fill={r.fill} letterSpacing={r.letterSpacing}>
                {r.text}
              </TSpan>
            ))}
        </SvgText>
      );
    case 'clip': {
      const id = `${uid}-${key}`;
      return (
        <G key={key}>
          <Defs>
            <ClipPath id={id}>
              <Path d={p.d} />
            </ClipPath>
          </Defs>
          <G clipPath={`url(#${id})`}>{p.children.map((c, i) => draw(c, `${key}-${i}`, uid))}</G>
        </G>
      );
    }
  }
}

/** A share card drawn at `width` (the scene keeps its proportions). Static: a card is a picture, it does not pour. */
export function CardArt({ scene, width }: { scene: Scene; width: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const height = (width * scene.height) / scene.width;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${scene.width} ${scene.height}`}>
      {scene.prims.map((p, i) => draw(p, `p${i}`, `card${uid}`))}
    </Svg>
  );
}
