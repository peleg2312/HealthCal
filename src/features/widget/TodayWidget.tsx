'use no memo';
/**
 * The home-screen widget's drawing. The library draws these elements into a picture and lays real
 * tap areas over it, so the functions here are called as plain functions (never rendered by React:
 * no hooks, and no React Compiler, hence 'use no memo'). Everything is placed from `widgetModel`'s
 * figures and `widgetLayout`'s plan; colours come from the person's look (`paletteFor`), one
 * drawing for a light phone and one for a dark phone, alike in structure as the library requires.
 *
 * Every text is drawn at the dp size the plan measured it at (font scaling off: the plan already
 * applied the phone's font scale with Android's own curve), in a box of the plan's height, on one
 * line. Autosizing is on as a safety net only: should a line ever be wider or taller than measured,
 * it is drawn a little smaller in its box rather than cut or broken over two lines.
 *
 * Pour, flat: the card colour with its 1 px line and cup corners (square shoulders, a round base),
 * the calorie cup and the water cup drawn as SVG (`cupSvg`), numbers in Bricolage, words in Hanken
 * (the fonts the app.json plugin bundles). Three tap areas, side by side and never nested: the
 * calorie half opens Today, the water figures open Water, the glass logs one glass; while a glass
 * can be undone an Undo sits beside the calorie half, or beside the glass when the glass is on a
 * row of its own. A drawing with no figures opens the app.
 */
import { FlexWidget, SvgWidget, TextWidget, type WidgetInfo, type WidgetRepresentation } from 'react-native-android-widget';

import { cup, paletteFor, radius, type ThemeColors } from '@/theme/tokens';
import type { ThemeName } from '@/theme/resolve';

import { cupBox, cupSvg } from './cup';
import { FONT_FACES } from './fonts';
import { messageLayout, ROOM, widgetLayout, type LineBox, type WidgetLayout } from './layout';
import { widgetTexts, type WidgetDay, type WidgetMessage } from './model';
import { ADD_GLASS, TODAY_URI, UNDO_GLASS, WATER_URI } from './name';
import type { WidgetDrawing } from './task';

type Hex = `#${string}`;
const hex = (c: string) => c as Hex;

/** The margins a part is placed with. */
type Margins = { marginLeft?: number; marginRight?: number; marginTop?: number; marginBottom?: number };

/** The card: the surface with its 1 px line and cup corners. */
function card(c: ThemeColors, pad: number) {
  return {
    width: 'match_parent' as const,
    height: 'match_parent' as const,
    backgroundColor: hex(c.surface),
    borderWidth: ROOM.border,
    borderColor: hex(c.border),
    ...cup(radius.card),
    padding: pad,
  };
}

/** One line of text in its box: `width` the box's width (the measured words, or the column's). */
function line(b: LineBox, color: string, width: number | 'match_parent', extra: Margins = {}, key?: string) {
  return (
    <TextWidget
      key={key}
      text={b.text}
      maxLines={1}
      allowFontScaling={false}
      style={{
        ...FONT_FACES[b.font],
        fontSize: b.size,
        ...(b.tracking ? { letterSpacing: b.tracking * b.size } : {}),
        color: hex(color),
        width,
        height: b.height,
        adjustsFontSizeToFit: true,
        ...extra,
      }}
    />
  );
}

function svgFor(width: number, height: number, density: number, spec: Omit<Parameters<typeof cupSvg>[0], 'width' | 'height' | 'density'>) {
  const b = cupBox(width, height);
  return <SvgWidget svg={cupSvg({ ...spec, width, height, density })} style={{ width: b.width, height: b.height }} />;
}

function undoButton(f: WidgetDay, c: ThemeColors, L: WidgetLayout, extra: Margins) {
  if (!f.added || !L.lines.undo) return null;
  return (
    <FlexWidget
      clickAction={UNDO_GLASS}
      clickActionData={{ id: f.added.id }}
      accessibilityLabel={f.added.undoSpoken}
      style={{
        height: L.undoH,
        paddingHorizontal: ROOM.undoPad,
        borderWidth: ROOM.undoBorder,
        borderColor: hex(c.fieldEdge),
        ...cup(radius.buttonSm, 5),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        ...extra,
      }}>
      {line(L.lines.undo, c.actionInk, L.lines.undo.width)}
    </FlexWidget>
  );
}

function dayDrawing(f: WidgetDay, d: WidgetDrawing, c: ThemeColors, L: WidgetLayout, density: number) {
  const cupColors = { empty: c.vesselEmpty, edge: c.vesselEdge, rim: c.rim, headroom: c.headroom, warning: c.warning };
  const T = L.lines;
  const figureInk = f.kcal.over ? c.warningInk : c.caloriesInk;

  const figureRow = (
    // Bottom-aligned: Android lines the figure and "kcal left" up on their baselines.
    <FlexWidget style={{ width: 'match_parent', height: L.figureH, flexDirection: 'row', alignItems: 'flex-end' }}>
      {line(T.figure, figureInk, T.figure.width)}
      {L.units === 'inline' ? (
        line(T.units, c.textSecondary, T.units.width, { marginLeft: ROOM.unitGap })
      ) : (
        <FlexWidget style={{ flexDirection: 'column', marginLeft: ROOM.unitGap, marginBottom: L.unitsDrop }}>
          {line(T.kcal, c.textSecondary, Math.max(T.kcal.width, T.word.width))}
          {line(T.word, c.textSecondary, Math.max(T.kcal.width, T.word.width))}
        </FlexWidget>
      )}
    </FlexWidget>
  );

  const calorieHalf = (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'flex-start' }}>
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: TODAY_URI }}
        accessibilityLabel={f.kcal.spoken}
        style={{ flex: 1, width: 0, height: L.calH, flexDirection: 'row', alignItems: 'flex-end' }}>
        {svgFor(L.calCup.width, L.calCup.height, density, { value: f.kcal.eaten, max: f.kcal.budget, headroom: f.kcal.headroom, kind: 'limit', colors: { ...cupColors, fill: c.calories } })}
        <FlexWidget style={{ flex: 1, width: 0, height: L.calH, flexDirection: 'column', justifyContent: 'flex-end', marginLeft: ROOM.cupGap }}>
          {L.date ? line(T.date, c.textSecondary, 'match_parent') : null}
          {figureRow}
          {L.eaten ? line(T.eaten, c.textSecondary, 'match_parent') : null}
        </FlexWidget>
      </FlexWidget>
      {L.undo === 'beside' ? undoButton(f, c, L, { marginLeft: ROOM.buttonGap }) : null}
    </FlexWidget>
  );

  const waterFigures = (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WATER_URI }}
      accessibilityLabel={f.water.spoken}
      style={{ ...(L.glass === 'beside' ? { flex: 1, width: 0 } : { width: 'match_parent' as const }), height: L.waterTextH, flexDirection: 'row', alignItems: 'center' }}>
      {L.waterCup ? svgFor(L.waterCupSize.width, L.waterCupSize.height, density, { value: f.water.ml, max: f.water.goalMl, kind: 'reach', colors: { ...cupColors, fill: c.water } }) : null}
      <FlexWidget style={{ flex: 1, width: 0, height: L.waterTextH, flexDirection: 'column', justifyContent: 'center', marginLeft: L.waterCup ? ROOM.cupGap : 0 }}>
        {line(T.water, c.text, 'match_parent')}
        {line(T.caption, c.textSecondary, 'match_parent')}
      </FlexWidget>
    </FlexWidget>
  );

  const glassButton = (extra: Margins) => (
    <FlexWidget
      clickAction={ADD_GLASS}
      clickActionData={{ ml: f.glass.ml, drawing: d.token }}
      accessibilityLabel={f.glass.spoken}
      style={{
        height: L.glassH,
        paddingHorizontal: L.glassPad,
        borderWidth: ROOM.glassBorder,
        borderColor: hex(c.water),
        ...cup(radius.buttonSm, 5),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        ...extra,
      }}>
      {line(T.glass, c.text, T.glass.width)}
    </FlexWidget>
  );

  const waterBlock =
    L.glass === 'beside' ? (
      <FlexWidget style={{ width: 'match_parent', height: L.waterH, marginTop: L.gap, flexDirection: 'row', alignItems: 'center' }}>
        {waterFigures}
        {glassButton({ marginLeft: ROOM.buttonGap })}
      </FlexWidget>
    ) : (
      <FlexWidget style={{ width: 'match_parent', height: L.waterH, marginTop: L.gap, flexDirection: 'column' }}>
        {waterFigures}
        {/* The glass on a row of its own, at the right; the Undo beside it while it shows. */}
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: ROOM.underGap }}>
          {L.undo === 'glass' ? undoButton(f, c, L, { marginRight: ROOM.buttonGap }) : null}
          {glassButton({})}
        </FlexWidget>
      </FlexWidget>
    );

  return (
    // Height to spare goes between the halves, so the calorie half stays at the top and the glass at the foot.
    <FlexWidget style={{ ...card(c, L.pad), flexDirection: 'column', justifyContent: 'space-between' }} accessibilityLabel={f.spoken}>
      {calorieHalf}
      {L.divider ? <FlexWidget style={{ width: 'match_parent', height: 1, marginTop: L.gap, backgroundColor: hex(c.border) }} /> : null}
      {waterBlock}
    </FlexWidget>
  );
}

function messageDrawing(f: WidgetMessage, c: ThemeColors, info: WidgetInfo, density: number) {
  const M = messageLayout(info.width, info.height, info.screenInfo?.fontScale ?? 1, f.title, f.line);
  return (
    <FlexWidget clickAction="OPEN_APP" accessibilityLabel={f.spoken} style={{ ...card(c, M.pad), flexDirection: 'row', alignItems: 'center' }}>
      {svgFor(M.cup.width, M.cup.height, density, {
        value: 0,
        max: 1,
        kind: 'limit',
        colors: { fill: c.calories, empty: c.vesselEmpty, edge: c.vesselEdge, rim: c.rim, headroom: c.headroom, warning: c.warning },
      })}
      <FlexWidget style={{ flex: 1, width: 0, flexDirection: 'column', marginLeft: 12 }}>
        {M.title.map((b, i) => line(b, c.text, 'match_parent', {}, `title-${i}`))}
        {M.line.map((b, i) => line(b, c.textSecondary, 'match_parent', i === 0 ? { marginTop: 2 } : {}, `line-${i}`))}
      </FlexWidget>
    </FlexWidget>
  );
}

function oneLook(d: WidgetDrawing, name: ThemeName, info: WidgetInfo) {
  const c = paletteFor(name);
  const density = info.screenInfo?.density ?? 1;
  const f = d.figures;
  if (f.kind === 'message') return messageDrawing(f, c, info, density);
  const L = widgetLayout(info.width, info.height, info.screenInfo?.fontScale ?? 1, widgetTexts(f));
  return dayDrawing(f, d, c, L, density);
}

/** The widget for one drawing at the size the launcher gives it: one look for a light phone and one for a dark phone. */
export function todayWidget(d: WidgetDrawing, info: WidgetInfo): WidgetRepresentation {
  return { light: oneLook(d, d.figures.themes.light, info), dark: oneLook(d, d.figures.themes.dark, info) };
}
