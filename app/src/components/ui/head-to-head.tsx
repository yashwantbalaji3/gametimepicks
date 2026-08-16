import type { ReactNode } from "react";
import PlayerAvatar from "@/components/player-avatar";

/**
 * HEAD-TO-HEAD — the shared side-by-side comparison, modelled on the UFC app's fight card.
 *
 * The design idea worth stealing: two portraits FACING EACH OTHER with the stat label running down
 * the centre, so a reader's eye compares across a row instead of reading two separate columns. One
 * verdict at the top, the evidence beneath it, nothing else competing for attention.
 *
 * It is sport-agnostic on purpose — fighters, pitchers and teams all reduce to "two sides, a set of
 * comparable rows, one verdict". Building it per sport is how this codebase ended up with four
 * different card layouts saying the same thing.
 */

export type H2HSide = {
  name: string;
  /** Portrait or crest. Falls back to initials when absent — never a broken image. */
  imageUrl?: string | null;
  /** Record, seed, or whatever one line best identifies this side. */
  subtitle?: string | null;
  /** Highlight this side as the model's pick. */
  favoured?: boolean;
};

export type H2HRow = {
  label: string;
  left: ReactNode;
  right: ReactNode;
  /** Which side reads better on this row — drives the subtle emphasis, never a colour-only signal. */
  better?: "left" | "right" | null;
};

function Portrait({ side, size, accent }: { side: H2HSide; size: number; accent: string }) {
  const initials = side.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 overflow-hidden"
      style={{
        width: size, height: size, borderRadius: 14,
        background: "rgba(255,255,255,0.04)",
        border: side.favoured ? `1.5px solid ${accent}` : "1px solid var(--vault-border)",
        boxShadow: side.favoured ? `0 0 0 3px color-mix(in srgb, ${accent} 18%, transparent)` : undefined,
      }}
    >
      {side.imageUrl ? (
        // The shared avatar owns every provider image on this site; rolling our own element here
        // would fork the fallback behaviour that component already gets right.
        <PlayerAvatar photoUrl={side.imageUrl} playerName={side.name} size="xl" flat />
      ) : (
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: size * 0.3 }}>{initials}</span>
      )}
    </span>
  );
}

export default function HeadToHead({
  left, right, rows, verdict, note, accent = "var(--vault-gold)", portraitSize = 76,
}: {
  left: H2HSide;
  right: H2HSide;
  rows: H2HRow[];
  /** The single answer this comparison exists to deliver. */
  verdict?: { label: string; value: string; sub?: string } | null;
  /** One line of reasoning under the verdict. */
  note?: string | null;
  accent?: string;
  portraitSize?: number;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[16px] px-3.5 py-3.5"
      style={{ border: "1px solid var(--vault-border-strong)", background: "rgba(255,255,255,0.018)" }}>

      {/* Portraits facing each other, names under them — the UFC-app arrangement. */}
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1.5 min-w-0" style={{ flex: 1 }}>
          <Portrait side={left} size={portraitSize} accent={accent} />
          <span className="text-center truncate w-full" style={{ color: "var(--vault-text)", fontWeight: 700, fontSize: 13.5, lineHeight: 1.2 }}>{left.name}</span>
          {left.subtitle ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{left.subtitle}</span> : null}
        </div>

        <div className="flex flex-col items-center justify-center gap-1 shrink-0" style={{ paddingTop: portraitSize * 0.32 }}>
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>vs</span>
        </div>

        <div className="flex flex-col items-center gap-1.5 min-w-0" style={{ flex: 1 }}>
          <Portrait side={right} size={portraitSize} accent={accent} />
          <span className="text-center truncate w-full" style={{ color: "var(--vault-text)", fontWeight: 700, fontSize: 13.5, lineHeight: 1.2 }}>{right.name}</span>
          {right.subtitle ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{right.subtitle}</span> : null}
        </div>
      </div>

      {verdict ? (
        <div className="flex flex-col items-center gap-0.5 rounded-[12px] px-3 py-2"
          style={{ border: `1px solid ${accent}`, background: `color-mix(in srgb, ${accent} 10%, transparent)` }}>
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: accent, fontSize: 9 }}>{verdict.label}</span>
          <span style={{ color: "var(--vault-text)", fontWeight: 800, fontSize: 16, textAlign: "center" }}>{verdict.value}</span>
          {verdict.sub ? <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5, textAlign: "center" }}>{verdict.sub}</span> : null}
        </div>
      ) : null}

      {/* Comparison rows — value | label | value, so the eye scans across, not down. */}
      {rows.length ? (
        <div className="flex flex-col">
          {rows.map((r, i) => (
            <div key={r.label} className="grid items-center gap-2 py-1.5"
              style={{ gridTemplateColumns: "1fr auto 1fr", borderTop: i === 0 ? "none" : "1px solid var(--vault-rule)" }}>
              <span style={{ textAlign: "right", color: r.better === "left" ? "var(--vault-text)" : "var(--vault-text-mute)", fontWeight: r.better === "left" ? 700 : 500, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{r.left}</span>
              <span className="font-mono uppercase tracking-[0.1em] text-center" style={{ color: "var(--vault-text-faint)", fontSize: 9, minWidth: 92 }}>{r.label}</span>
              <span style={{ textAlign: "left", color: r.better === "right" ? "var(--vault-text)" : "var(--vault-text-mute)", fontWeight: r.better === "right" ? 700 : 500, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{r.right}</span>
            </div>
          ))}
        </div>
      ) : null}

      {note ? (
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.55 }}>{note}</p>
      ) : null}
    </div>
  );
}
