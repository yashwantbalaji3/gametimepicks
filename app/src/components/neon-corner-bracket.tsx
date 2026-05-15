/**
 * Four L-shaped gold corner brackets that frame a hero or major panel.
 *
 * Pure presentation. Caller wraps a section like:
 *
 *   <section className="neon-corner-bracket relative">
 *     <NeonCornerBracket />
 *     ...content...
 *   </section>
 *
 * The brackets sit absolutely positioned via the .gtp-bracket-* utility
 * classes defined in globals.css. Non-interactive; aria-hidden.
 */
export default function NeonCornerBracket() {
  return (
    <>
      <span aria-hidden className="gtp-bracket gtp-bracket-tl" />
      <span aria-hidden className="gtp-bracket gtp-bracket-tr" />
      <span aria-hidden className="gtp-bracket gtp-bracket-bl" />
      <span aria-hidden className="gtp-bracket gtp-bracket-br" />
    </>
  );
}
