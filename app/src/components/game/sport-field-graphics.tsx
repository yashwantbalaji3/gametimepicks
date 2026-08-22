/**
 * SPORT-SPECIFIC LOADING GRAPHICS — a gridiron, a pitch and an octagon.
 *
 * MLB had an animated diamond with a ball rounding the bases. Every other sport fell through to a
 * neutral shell that said, in as many words, "No {sport}-specific view yet — showing the generic
 * model staging." Honest, and a plain box while a ten-second simulation ran.
 *
 * These are the same shape as the diamond: one 300×300 viewBox, scoped keyframes, no global CSS, and
 * a `prefers-reduced-motion` block that stops every animation while leaving the picture intact — the
 * graphic is the point, the movement is decoration.
 *
 * They depict a PLAYING SURFACE, never a result. A puck-in-net or a knockout flourish would be the
 * animation telling a story the simulation has not run yet, and this is the ten seconds BEFORE any
 * number exists.
 */

/** The football field: yard lines, hash marks, and a ball tracking downfield. */
export function GridironGraphic() {
  return (
    <div className="gtp-sim-field" aria-hidden>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.gtp-sim-field { position: relative; width: 100%; max-width: 320px; margin: 0 auto; }
.gtp-sim-field svg { display: block; width: 100%; height: auto; overflow: visible; }
@keyframes gtp-sim-drive { 0% { transform: translate(46px, 150px); } 100% { transform: translate(254px, 150px); } }
@keyframes gtp-sim-yard { 0%, 100% { opacity: 0.28; } 50% { opacity: 0.72; } }
@keyframes gtp-sim-ez { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.8; } }
.gtp-sim-drive { animation: gtp-sim-drive 4.6s cubic-bezier(0.45,0,0.55,1) infinite alternate; transform: translate(46px, 150px); }
.gtp-sim-yard { animation: gtp-sim-yard 2.8s ease-in-out infinite; }
.gtp-sim-yard-2 { animation-delay: 0.35s; } .gtp-sim-yard-3 { animation-delay: 0.7s; }
.gtp-sim-yard-4 { animation-delay: 1.05s; } .gtp-sim-yard-5 { animation-delay: 1.4s; }
.gtp-sim-ez { animation: gtp-sim-ez 3.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .gtp-sim-drive { animation: none; transform: translate(150px, 150px); }
  .gtp-sim-yard, .gtp-sim-ez { animation: none; opacity: 0.5; }
}`,
        }}
      />
      <svg viewBox="0 0 300 300" role="img" aria-label="Football field">
        <rect x="20" y="70" width="260" height="160" rx="6" fill="color-mix(in srgb, var(--sport-nfl) 16%, transparent)" stroke="var(--vault-rule)" strokeWidth="1.5" />
        {/* end zones */}
        <rect className="gtp-sim-ez" x="20" y="70" width="34" height="160" rx="6" fill="color-mix(in srgb, var(--sport-nfl) 30%, transparent)" />
        <rect className="gtp-sim-ez" x="246" y="70" width="34" height="160" rx="6" fill="color-mix(in srgb, var(--sport-nfl) 30%, transparent)" />
        {/* yard lines */}
        {[92, 130, 150, 170, 208].map((x, i) => (
          <line key={x} className={`gtp-sim-yard gtp-sim-yard-${i + 1}`} x1={x} y1="70" x2={x} y2="230" stroke="var(--vault-text-faint)" strokeWidth={x === 150 ? 2 : 1} />
        ))}
        {/* hash marks */}
        {[120, 180].map((y) => (
          <line key={y} x1="54" y1={y} x2="246" y2={y} stroke="var(--vault-rule)" strokeWidth="0.75" strokeDasharray="4 10" />
        ))}
        <g className="gtp-sim-drive">
          <ellipse rx="9" ry="5.5" fill="var(--vault-text)" opacity="0.92" />
          <line x1="-4" y1="0" x2="4" y2="0" stroke="var(--vault-scrim-neutral)" strokeWidth="1.2" />
        </g>
      </svg>
    </div>
  );
}

/** The football (soccer) pitch: centre circle, penalty areas, and a ball worked across midfield. */
export function PitchGraphic() {
  return (
    <div className="gtp-sim-pitch" aria-hidden>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.gtp-sim-pitch { position: relative; width: 100%; max-width: 320px; margin: 0 auto; }
.gtp-sim-pitch svg { display: block; width: 100%; height: auto; overflow: visible; }
@keyframes gtp-sim-pass {
  0%   { transform: translate(150px, 150px); }
  30%  { transform: translate(92px, 104px); }
  60%  { transform: translate(214px, 190px); }
  100% { transform: translate(150px, 150px); }
}
@keyframes gtp-sim-centre { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.75; transform: scale(1.06); } }
@keyframes gtp-sim-box { 0%, 100% { opacity: 0.32; } 50% { opacity: 0.7; } }
.gtp-sim-pass { animation: gtp-sim-pass 5.4s cubic-bezier(0.45,0,0.55,1) infinite; transform: translate(150px, 150px); }
.gtp-sim-centre { animation: gtp-sim-centre 2.9s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.gtp-sim-box { animation: gtp-sim-box 3.1s ease-in-out infinite; }
.gtp-sim-box-2 { animation-delay: 0.6s; }
@media (prefers-reduced-motion: reduce) {
  .gtp-sim-pass { animation: none; }
  .gtp-sim-centre, .gtp-sim-box { animation: none; opacity: 0.5; }
}`,
        }}
      />
      <svg viewBox="0 0 300 300" role="img" aria-label="Football pitch">
        <rect x="26" y="62" width="248" height="176" rx="5" fill="color-mix(in srgb, var(--sport-soccer) 15%, transparent)" stroke="var(--vault-rule)" strokeWidth="1.5" />
        <line x1="150" y1="62" x2="150" y2="238" stroke="var(--vault-text-faint)" strokeWidth="1" />
        <circle className="gtp-sim-centre" cx="150" cy="150" r="34" fill="none" stroke="var(--vault-text-faint)" strokeWidth="1.25" />
        <circle cx="150" cy="150" r="3" fill="var(--vault-text-faint)" />
        {/* penalty areas */}
        <rect className="gtp-sim-box" x="26" y="106" width="44" height="88" fill="none" stroke="var(--vault-text-faint)" strokeWidth="1.1" />
        <rect className="gtp-sim-box gtp-sim-box-2" x="230" y="106" width="44" height="88" fill="none" stroke="var(--vault-text-faint)" strokeWidth="1.1" />
        <g className="gtp-sim-pass">
          <circle r="6.5" fill="var(--vault-text)" opacity="0.92" />
          <path d="M-6.5 0 L6.5 0 M0 -6.5 L0 6.5" stroke="var(--vault-scrim-neutral)" strokeWidth="1" opacity="0.55" />
        </g>
      </svg>
    </div>
  );
}

/** The octagon: the cage, a centre mark, and a pulse travelling the fence. */
export function OctagonGraphic() {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI / 4) * i - Math.PI / 8;
    return `${(150 + 104 * Math.cos(a)).toFixed(1)},${(150 + 104 * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return (
    <div className="gtp-sim-octagon" aria-hidden>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.gtp-sim-octagon { position: relative; width: 100%; max-width: 320px; margin: 0 auto; }
.gtp-sim-octagon svg { display: block; width: 100%; height: auto; overflow: visible; }
@keyframes gtp-sim-cage { to { stroke-dashoffset: -640; } }
@keyframes gtp-sim-centre-mark { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.12); } }
@keyframes gtp-sim-corner { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.85; } }
.gtp-sim-cage { stroke-dasharray: 10 8; animation: gtp-sim-cage 4.4s linear infinite; }
.gtp-sim-centre-mark { animation: gtp-sim-centre-mark 2.7s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.gtp-sim-corner { animation: gtp-sim-corner 3s ease-in-out infinite; }
.gtp-sim-corner-2 { animation-delay: 1.5s; }
@media (prefers-reduced-motion: reduce) {
  .gtp-sim-cage, .gtp-sim-centre-mark, .gtp-sim-corner { animation: none; opacity: 0.55; }
}`,
        }}
      />
      <svg viewBox="0 0 300 300" role="img" aria-label="Octagon">
        <polygon points={pts} fill="color-mix(in srgb, var(--sport-ufc) 14%, transparent)" stroke="var(--vault-rule)" strokeWidth="1.5" />
        <polygon className="gtp-sim-cage" points={pts} fill="none" stroke="var(--sport-ufc)" strokeWidth="1.6" opacity="0.8" />
        <circle className="gtp-sim-centre-mark" cx="150" cy="150" r="30" fill="none" stroke="var(--vault-text-faint)" strokeWidth="1.25" />
        {/* the two corners a bout starts from */}
        <circle className="gtp-sim-corner" cx="82" cy="150" r="7" fill="var(--vault-text-faint)" />
        <circle className="gtp-sim-corner gtp-sim-corner-2" cx="218" cy="150" r="7" fill="var(--vault-text-faint)" />
      </svg>
    </div>
  );
}
