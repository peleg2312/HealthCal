/**
 * Whether a measurement is an answer, for the measuring parts (`MeasureWidth`, `SizeProbe`) and every layout callback
 * a screen measures with. On the web a view laid out while its screen is hidden reports a width and a height of 0
 * (react-native-web's ResizeObserver on a `display: none` screen, and a measuring part mounted again as its screen
 * leaves, `useMeasureKey`): never the size of words or of a box that holds them. Such a report is ignored and the last
 * good value kept, so a screen comes back drawn as it left, not in its designed layout for a frame before the real
 * measurements return. Pure, so it is tested (measured.test.ts).
 */
export function isMeasured(width: number, height?: number): boolean {
  return width > 0 && (height === undefined || height > 0);
}
