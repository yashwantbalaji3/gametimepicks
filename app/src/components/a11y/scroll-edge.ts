/**
 * Which edge of a sideways-scrolling box still hides columns (W6 · 2026-10-28). Pure, so the rule that drives the
 * table fade and the phone "swipe" hint (globals.css § W6 d) is unit-tested without a browser.
 *
 *   null     the content fits: no fade, no hint, nothing marked
 *   "start"  at the left edge, more to the right (the only state that shows the hint)
 *   "middle" more on both sides
 *   "end"    scrolled to the last column, more to the left
 *
 * A 1px slack absorbs sub-pixel widths, so a box that fits never flickers into "start".
 */
export type ScrollEdge = "start" | "middle" | "end";

export function scrollEdge(scrollLeft: number, scrollWidth: number, clientWidth: number): ScrollEdge | null {
  const max = scrollWidth - clientWidth;
  if (!(max > 1)) return null;
  const x = Math.abs(scrollLeft); // RTL boxes report a negative scrollLeft
  if (x <= 1) return "start";
  if (x >= max - 1) return "end";
  return "middle";
}
