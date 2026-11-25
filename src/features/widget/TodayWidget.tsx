'use no memo';
/**
 * The home-screen widget's drawing. The library draws these elements into a picture and lays real
 * tap areas over it, so the functions here are called as plain functions (never rendered by React:
 * no hooks, and no React Compiler, hence 'use no memo'). Everything is placed from `widgetModel`'s
 * figures and `widgetLayout`'s sizes; colours come from the person's look (`paletteFor`), one
 * drawing for a light phone and one for a dark phone, alike in structure as the library requires.
 *
 * Pour, flat: the card colour with its 1 px line and cup corners (square shoulders, a round base),
 * the calorie cup and the water cup drawn as SVG (`cupSvg`), numbers in Bricolage, words in Hanken
 * (the fonts the app.json plugin bundles). Three tap areas, side by side and never nested: the
 * calorie half opens Today, the water figures open Water, the glass logs one glass; while a glass
 * can be undone an Undo sits beside the calorie half. A drawing with no figures opens the app.
 */
import { FlexWidget, SvgWidget, TextWidget, type WidgetInfo, type WidgetRepresentation } from 'react-native-android-widget';

import { cup, paletteFor, radius, type ThemeColors } from '@/theme/tokens';
import type { ThemeName } from '@/theme/resolve';

import { cupBox, cupSvg } from './cup';
import { TYPE, widgetLayout, type WidgetLayout } from './layout';
import type { WidgetDay, WidgetMessage } from './model';
import { ADD_GLASS, TODAY_URI, UNDO_GLASS, WATER_URI } from './name';
import type { WidgetDrawing } from './task';
import { UNDO_WORD } from './words';

/** The font files the app.json plugin copies into the app, by file name, with the weight each one is. */
const NUMBERS = { fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '700' } as const;
const WORDS = { fontFamily: 'HankenGrotesk_500Medium', fontWeight: '500' } as const;
const STRONG = { fontFamily: 'HankenGrotesk_700Bold', fontWeight: '700' } as const;

type Hex = `#${string}`;
const hex = (c: string) => c as Hex;

/** The card: the surface with its 1 px line and cup corners. */
function card(c: ThemeColors, pad: number) {
  return {
    width: 'match_parent' as const,
    height: 'match_parent' as const,
    backgroundColor: hex(c.surface),
    borderWidth: 1,
    borderColor: hex(c.border),
    ...cup(radius.card),
    padding: pad,
  };
}

function svgFor(width: number, height: number, density: number, spec: Omit<Parameters<typeof cupSvg>[0], 'width' | 'height' | 'density'>) {
  const box = cupBox(width, height);
  return <SvgWidget svg={cupSvg({ ...spec, width, height, density })} style={{ width: box.width, height: box.height }} />;
}

function dayDrawing(f: WidgetDay, d: WidgetDrawing, c: ThemeColors, L: WidgetLayout, density: number) {
  const cupColors = { empty: c.vesselEmpty, edge: c.vesselEdge, rim: c.rim, headroom: c.headroom, warning: c.warning };
  const caption = { ...WORDS, fontSize: TYPE.caption.size, color: hex(c.textSecondary) };
  return (
    // Height to spare goes between the halves, so the calorie half stays at the top and the glass at the foot.
    <FlexWidget style={{ ...card(c, L.pad), flexDirection: 'column', justifyContent: 'space-between' }} accessibilityLabel={f.spoken}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'flex-start' }}>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: TODAY_URI }}
          accessibilityLabel={f.kcal.spoken}
          style={{ flex: 1, width: 0, height: L.calH, flexDirection: 'row', alignItems: 'flex-end' }}>
          {svgFor(L.calCup.width, L.calCup.height, density, { value: f.kcal.eaten, max: f.kcal.budget, headroom: f.kcal.headroom, kind: 'limit', colors: { ...cupColors, fill: c.calories } })}
          <FlexWidget style={{ flex: 1, width: 0, height: L.calH, flexDirection: 'column', justifyContent: 'flex-end', marginLeft: 10 }}>
            {L.date ? (
              <TextWidget
                text={f.dateLine.toUpperCase()}
                maxLines={1}
                style={{ ...STRONG, fontSize: TYPE.date.size, letterSpacing: 0.9, color: hex(c.textSecondary), marginBottom: 2 }}
              />
            ) : null}
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <TextWidget
                text={f.kcal.figure}
                maxLines={1}
                allowFontScaling={false}
                style={{ ...NUMBERS, fontSize: TYPE.figure.size, letterSpacing: -0.6, color: hex(f.kcal.over ? c.warningInk : c.caloriesInk) }}
              />
              <FlexWidget style={{ flexDirection: 'column', marginLeft: 6, marginBottom: 3 }}>
                <TextWidget text="kcal" maxLines={1} style={{ ...STRONG, fontSize: TYPE.unit.size, color: hex(c.textSecondary) }} />
                <TextWidget text={f.kcal.word} maxLines={1} style={{ ...STRONG, fontSize: TYPE.unit.size, color: hex(c.textSecondary) }} />
              </FlexWidget>
            </FlexWidget>
            {L.eaten ? <TextWidget text={f.kcal.eatenLine} maxLines={1} style={{ ...caption, marginTop: 2 }} /> : null}
          </FlexWidget>
        </FlexWidget>
        {f.added ? (
          <FlexWidget
            clickAction={UNDO_GLASS}
            clickActionData={{ id: f.added.id }}
            accessibilityLabel={f.added.undoSpoken}
            style={{
              height: 36,
              marginLeft: 8,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: hex(c.fieldEdge),
              ...cup(radius.buttonSm, 5),
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <TextWidget text={UNDO_WORD} maxLines={1} style={{ ...STRONG, fontSize: TYPE.button.size - 1, color: hex(c.actionInk) }} />
          </FlexWidget>
        ) : null}
      </FlexWidget>
      {L.divider ? <FlexWidget style={{ width: 'match_parent', height: 1, marginTop: L.gap, backgroundColor: hex(c.border) }} /> : null}
      <FlexWidget style={{ width: 'match_parent', height: L.waterH, marginTop: L.gap, flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: WATER_URI }}
          accessibilityLabel={f.water.spoken}
          style={{ flex: 1, width: 0, height: L.waterH, flexDirection: 'row', alignItems: 'center' }}>
          {svgFor(L.waterCup.width, L.waterCup.height, density, { value: f.water.ml, max: f.water.goalMl, kind: 'reach', colors: { ...cupColors, fill: c.water } })}
          <FlexWidget style={{ flex: 1, width: 0, flexDirection: 'column', marginLeft: 10 }}>
            <TextWidget text={f.water.line} maxLines={1} style={{ ...NUMBERS, fontSize: TYPE.water.size, color: hex(c.text) }} />
            <TextWidget text={f.added ? f.added.caption : f.water.caption} maxLines={1} style={caption} />
          </FlexWidget>
        </FlexWidget>
        <FlexWidget
          clickAction={ADD_GLASS}
          clickActionData={{ ml: f.glass.ml, drawing: d.token }}
          accessibilityLabel={f.glass.spoken}
          style={{
            height: L.glassH,
            marginLeft: 8,
            paddingHorizontal: 14,
            borderWidth: 1.5,
            borderColor: hex(c.water),
            ...cup(radius.buttonSm, 5),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <TextWidget text={f.glass.label} maxLines={1} style={{ ...STRONG, fontSize: TYPE.button.size, color: hex(c.text) }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

function messageDrawing(f: WidgetMessage, c: ThemeColors, pad: number, density: number) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={f.spoken}
      style={{ ...card(c, pad), flexDirection: 'row', alignItems: 'center' }}>
      {svgFor(30, 44, density, {
        value: 0,
        max: 1,
        kind: 'limit',
        colors: { fill: c.calories, empty: c.vesselEmpty, edge: c.vesselEdge, rim: c.rim, headroom: c.headroom, warning: c.warning },
      })}
      <FlexWidget style={{ flex: 1, width: 0, flexDirection: 'column', marginLeft: 12 }}>
        <TextWidget text={f.title} maxLines={2} style={{ ...NUMBERS, fontSize: 18, color: hex(c.text) }} />
        <TextWidget text={f.line} maxLines={3} style={{ ...WORDS, fontSize: 13, color: hex(c.textSecondary), marginTop: 2 }} />
      </FlexWidget>
    </FlexWidget>
  );
}

function oneLook(d: WidgetDrawing, name: ThemeName, info: WidgetInfo) {
  const c = paletteFor(name);
  const density = info.screenInfo?.density ?? 1;
  const f = d.figures;
  if (f.kind === 'message') return messageDrawing(f, c, 14, density);
  const L = widgetLayout(info.width, info.height, info.screenInfo?.fontScale ?? 1, { eatenChars: f.kcal.eatenLine.length, undo: !!f.added });
  return dayDrawing(f, d, c, L, density);
}

/** The widget for one drawing at the size the launcher gives it: one look for a light phone and one for a dark phone. */
export function todayWidget(d: WidgetDrawing, info: WidgetInfo): WidgetRepresentation {
  return { light: oneLook(d, d.figures.themes.light, info), dark: oneLook(d, d.figures.themes.dark, info) };
}
