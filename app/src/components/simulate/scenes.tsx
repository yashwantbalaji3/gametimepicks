"use client";
/**
 * SPORT GENERATION SCENES (P209 · Release C) — code-native SVG, one per registered sport plus a
 * generic arena. Decorative by contract: every scene is aria-hidden (the stage's live-region text
 * carries the truth), colours come from theme tokens, and all motion runs through the
 * `gtp-sim-*` keyframes in globals.css, which sit behind the global reduced-motion guard — under
 * prefers-reduced-motion the animations stop and the scene reads as its static poster.
 *
 * The `phase` prop advances what is LIT, not what is claimed: inputs illuminate during
 * LOADING_INPUTS, the gate ring scans during VALIDATING, the sport figure resolves during
 * PREPARING/SUMMARIZING. Nothing here displays a check before the machine reaches it.
 */
import type { SceneId } from "@/lib/simulate/themes";

export interface SceneProps {
  accent: string;
  accentSoft: string;
  /** Current machine phase — drives which layer is lit. */
  phase: string;
}

const lit = (phase: string, from: string[]) => (from.includes(phase) ? 1 : 0.18);
const AFTER_INPUTS = ["VALIDATING", "PREPARING", "SUMMARIZING", "COMPLETE"];
const AFTER_GATES = ["PREPARING", "SUMMARIZING", "COMPLETE"];
const RESOLVING = ["SUMMARIZING", "COMPLETE"];

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 320 190" width="100%" aria-hidden focusable="false" style={{ display: "block", height: "auto", maxHeight: 220 }}>
      {children}
    </svg>
  );
}

function Diamond({ accent, accentSoft, phase }: SceneProps) {
  return (
    <Frame>
      <rect x="0" y="0" width="320" height="190" rx="12" fill="var(--vault-scrim-base)" />
      {/* outfield glow */}
      <ellipse cx="160" cy="150" rx="150" ry="80" fill={accentSoft} opacity={0.35} />
      {/* diamond */}
      <g className="gtp-sim-pulse" style={{ opacity: lit(phase, ["LOADING_INPUTS", ...AFTER_INPUTS]) }}>
        <path d="M160 60 L230 118 L160 176 L90 118 Z" fill="none" stroke={accent} strokeWidth="2.5" />
        {[
          [160, 60], [230, 118], [160, 176], [90, 118],
        ].map(([x, y], i) => (
          <rect key={i} x={x - 5} y={y - 5} width="10" height="10" fill={accent} transform={`rotate(45 ${x} ${y})`} />
        ))}
      </g>
      {/* stadium lights — the gate scan */}
      <g style={{ opacity: lit(phase, ["VALIDATING", ...AFTER_GATES]) }}>
        {[40, 120, 200, 280].map((x) => (
          <g key={x}>
            <line x1={x} y1="18" x2={x} y2="36" stroke="var(--vault-text-faint)" strokeWidth="2" />
            <circle cx={x} cy="14" r="6" fill={accent} className="gtp-sim-blink" />
          </g>
        ))}
      </g>
      {/* trajectory arc — resolves with the summary */}
      <path d="M92 120 Q160 30 228 120" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="200"
        className="gtp-sim-trace" style={{ opacity: lit(phase, RESOLVING) }} />
    </Frame>
  );
}

function Field({ accent, accentSoft, phase }: SceneProps) {
  return (
    <Frame>
      <rect x="0" y="0" width="320" height="190" rx="12" fill="var(--vault-scrim-base)" />
      <rect x="24" y="30" width="272" height="130" rx="6" fill={accentSoft} opacity="0.25" />
      {/* yard lines light as inputs load */}
      <g style={{ opacity: lit(phase, ["LOADING_INPUTS", ...AFTER_INPUTS]) }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <line key={i} x1={24 + i * 45} y1="30" x2={24 + i * 45} y2="160" stroke="var(--vault-text-faint)" strokeWidth="1.5" opacity="0.7" />
        ))}
      </g>
      {/* chalk route animates through validation */}
      <path d="M40 140 h70 l30 -40 h60 l40 -30" fill="none" stroke={accent} strokeWidth="2.5" strokeDasharray="260"
        className="gtp-sim-trace" style={{ opacity: lit(phase, ["VALIDATING", ...AFTER_GATES]) }} />
      {/* end zones reveal at resolve */}
      <g style={{ opacity: lit(phase, RESOLVING) }}>
        <rect x="24" y="30" width="18" height="130" fill={accent} opacity="0.5" />
        <rect x="278" y="30" width="18" height="130" fill={accent} opacity="0.5" />
      </g>
    </Frame>
  );
}

function Pitch({ accent, accentSoft, phase }: SceneProps) {
  const nodes: Array<[number, number]> = [[60, 140], [110, 90], [160, 130], [210, 70], [255, 110]];
  return (
    <Frame>
      <rect x="0" y="0" width="320" height="190" rx="12" fill="var(--vault-scrim-base)" />
      <rect x="20" y="26" width="280" height="138" rx="8" fill={accentSoft} opacity="0.22" />
      <circle cx="160" cy="95" r="30" fill="none" stroke="var(--vault-text-faint)" strokeWidth="1.5"
        style={{ opacity: lit(phase, ["LOADING_INPUTS", ...AFTER_INPUTS]) }} />
      {/* passing network connects during validation */}
      <g style={{ opacity: lit(phase, ["VALIDATING", ...AFTER_GATES]) }}>
        <path d={`M${nodes.map((n) => n.join(" ")).join(" L")}`} fill="none" stroke={accent} strokeWidth="2" strokeDasharray="300" className="gtp-sim-trace" />
        {nodes.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" fill={accent} className="gtp-sim-pulse" />)}
      </g>
      {/* goal frame resolves */}
      <g style={{ opacity: lit(phase, RESOLVING) }}>
        <path d="M292 70 h-16 v50 h16" fill="none" stroke={accent} strokeWidth="2.5" />
      </g>
    </Frame>
  );
}

function Octagon({ accent, accentSoft, phase }: SceneProps) {
  return (
    <Frame>
      <rect x="0" y="0" width="320" height="190" rx="12" fill="var(--vault-scrim-base)" />
      <polygon points="160,26 232,56 262,95 232,134 160,164 88,134 58,95 88,56"
        fill={accentSoft} opacity="0.25" />
      <polygon points="160,26 232,56 262,95 232,134 160,164 88,134 58,95 88,56"
        fill="none" stroke={accent} strokeWidth="2.5" className="gtp-sim-pulse"
        style={{ opacity: lit(phase, ["LOADING_INPUTS", ...AFTER_INPUTS]) }} />
      {/* corners lock during validation — red vs blue */}
      <g style={{ opacity: lit(phase, ["VALIDATING", ...AFTER_GATES]) }}>
        <circle cx="96" cy="62" r="9" fill="var(--vault-danger)" />
        <circle cx="224" cy="62" r="9" fill="var(--vault-info, var(--vault-text-mute))" />
      </g>
      {/* round lights resolve */}
      <g style={{ opacity: lit(phase, RESOLVING) }}>
        {[130, 150, 170, 190].map((x, i) => (
          <circle key={i} cx={x} cy="180" r="4" fill={accent} className="gtp-sim-blink" />
        ))}
      </g>
    </Frame>
  );
}

function Court({ accent, accentSoft, phase }: SceneProps) {
  return (
    <Frame>
      <rect x="0" y="0" width="320" height="190" rx="12" fill="var(--vault-scrim-base)" />
      <rect x="22" y="28" width="276" height="134" rx="8" fill={accentSoft} opacity="0.22" />
      <circle cx="160" cy="95" r="26" fill="none" stroke="var(--vault-text-faint)" strokeWidth="1.5"
        style={{ opacity: lit(phase, ["LOADING_INPUTS", ...AFTER_INPUTS]) }} />
      {/* key + arc */}
      <g style={{ opacity: lit(phase, ["VALIDATING", ...AFTER_GATES]) }}>
        <rect x="22" y="70" width="46" height="50" fill="none" stroke={accent} strokeWidth="2" />
        <path d="M68 60 a48 48 0 0 1 0 70" fill="none" stroke={accent} strokeWidth="2" />
      </g>
      {/* shot arc resolves */}
      <path d="M60 130 Q160 20 262 118" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="260"
        className="gtp-sim-trace" style={{ opacity: lit(phase, RESOLVING) }} />
    </Frame>
  );
}

function Arena({ accent, accentSoft, phase }: SceneProps) {
  return (
    <Frame>
      <rect x="0" y="0" width="320" height="190" rx="12" fill="var(--vault-scrim-base)" />
      <ellipse cx="160" cy="120" rx="120" ry="52" fill={accentSoft} opacity="0.3"
        style={{ opacity: lit(phase, ["LOADING_INPUTS", ...AFTER_INPUTS]) }} />
      <g style={{ opacity: lit(phase, ["VALIDATING", ...AFTER_GATES]) }}>
        {[70, 160, 250].map((x) => <circle key={x} cx={x} cy="34" r="6" fill={accent} className="gtp-sim-blink" />)}
      </g>
      <ellipse cx="160" cy="120" rx="120" ry="52" fill="none" stroke={accent} strokeWidth="2"
        className="gtp-sim-pulse" style={{ opacity: lit(phase, RESOLVING) }} />
    </Frame>
  );
}

const SCENES: Record<SceneId, (p: SceneProps) => React.ReactNode> = {
  diamond: Diamond, field: Field, pitch: Pitch, octagon: Octagon, court: Court, arena: Arena,
};

export default function SimulationScene({ scene, ...props }: SceneProps & { scene: SceneId }) {
  const Cmp = SCENES[scene] ?? Arena;
  return <>{Cmp(props)}</>;
}
