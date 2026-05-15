/**
 * Sportsbook light rail — thin animated LED strip used as an ambient
 * divider under the nav and on key section seams. Pure presentation,
 * no semantic content. The animation respects prefers-reduced-motion.
 *
 * Renders nothing readable to assistive tech (aria-hidden) so it never
 * appears in screen-reader output.
 */
export default function SportsbookLightRail() {
  return <div aria-hidden className="sportsbook-light-rail" />;
}
