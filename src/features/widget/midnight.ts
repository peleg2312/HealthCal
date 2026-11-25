/** Ms from `now` to one second past the next local midnight: when a widget kept drawn by the open app shows the new day. Pure. */
export function untilMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}
