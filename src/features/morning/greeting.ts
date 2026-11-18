/**
 * The morning page's header title: the greeting by the time of day, with the person's name when
 * the whole line fits beside the X and the share button (the same measure as Today's greeting,
 * greetingTitle in @/features/today/greetingTitle). When the name has to be left out, the page
 * puts it at the start of the personal line instead (nameShown false). Pure and unit-tested.
 */
import { greetingTitle } from '@/features/today/greetingTitle';

/** The header's title size (the kit Header's h3). */
export const MORNING_TITLE_SIZE = 18;

/**
 * Room for the title in the kit Header: the content width (capped at 560) less the 20 px gutters,
 * the X (44), the share button (44) and the two 12 px gaps: 208 at 360, 168 at 320, 238 at 390.
 */
export function morningTitleRoom(width: number): number {
  return Math.min(width, 560) - 152;
}

/** The title and whether it holds the (non-empty) name; with no name set, nameShown is true (nothing was left out). */
export function morningTitle(greeting: string, name: string | null | undefined, width: number): { title: string; nameShown: boolean } {
  const trimmed = (name ?? '').trim();
  const title = greetingTitle(greeting, trimmed, morningTitleRoom(width), MORNING_TITLE_SIZE);
  return { title, nameShown: !trimmed || title !== greeting };
}
