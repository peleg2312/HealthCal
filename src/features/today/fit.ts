/**
 * Measured fits for the layouts drawn to grow with their text (`VERY_LARGE_TEXT` in @/theme: Today, its tab header,
 * the diary and the + sheet). Through the phone's common text steps such a layout keeps its designed shape; a part of
 * it gives way only where its words, measured as drawn on this device (`MeasureWidth`), are wider than its room, never
 * by a guess at a width. Pure, so the rules are tested.
 */

/** Whether measured words fit their room: true until both are measured (the designed shape is drawn first). */
export function fitsRoom(measured: number | null | undefined, room: number | null | undefined): boolean {
  if (!measured || !room || room <= 0) return true;
  return measured <= room;
}

/**
 * How tall a cup must be to hold its labels beside it, each in its own box, `spacing` apart: the designed height, or
 * taller when the labels' boxes (measured as drawn, with text grown) need more. With the designed boxes it is always
 * the designed height.
 */
export function cupHeightFor(designed: number, heights: number[], spacing: number): number {
  const need = heights.reduce((a, h) => a + h, 0) + spacing * Math.max(0, heights.length - 1);
  return Math.max(designed, Math.ceil(need));
}
