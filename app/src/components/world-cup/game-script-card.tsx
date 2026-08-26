/**
 * GameScriptCard — the single, consistent "model game script" panel: predicted score lean + total-goals
 * lean + BTTS lean, one plain-English explanation tying them together, confidence + knockout-risk badges,
 * and an explicit conflict warning when the markets disagree. Rendered identically on the knockout board,
 * game-detail pages, and the World Cup hub so the score/total/BTTS story never contradicts itself.
 *
 * Pure presentation of a GameScript (derived upstream from real de-vigged picks) — fabricates nothing.
 */
import type { GameScript } from "@/lib/world-cup/game-script";

const CONF_TONE: Record<string, string> = {
  High: "var(--vault-success)",
  Medium: "var(--vault-gold-bright)",
  Low: "var(--vault-text-faint)",
};
const RISK_TONE: Record<string, string> = {
  Low: "var(--vault-success)",
  Medium: "var(--vault-gold-bright)",
  High: "var(--gtp-bank-heat)",
};

function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{ background: "color-mix(in srgb, var(--vault-bg) 50%, transparent)", border: "1px solid var(--vault-rule)" }}>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8 }}>{label}</span>
      <span className="font-semibold" style={{ color: tone ?? "var(--vault-text)", fontSize: 11.5 }}>{value}</span>
    </span>
  );
}

export default function GameScriptCard({ script, compact = false }: { script: GameScript; compact?: boolean }) {
  if (!script.available) {
    return (
      <div className="rounded-[10px] px-4 py-3" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)", border: "1px solid var(--vault-border)" }}>
        <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Model game script</span>
        <p className="mt-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>Model game script publishes once the moneyline is posted for this fixture.</p>
      </div>
    );
  }
  return (
    <div className="rounded-[12px] px-4 py-3.5 flex flex-col gap-2.5"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 60%, transparent)", border: "1px solid var(--vault-gold-bright)", borderLeft: "3px solid var(--vault-gold-bright)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Model game script</span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: CONF_TONE[script.confidence] ?? "var(--vault-text)", fontSize: 8.5 }}>{script.confidence} confidence</span>
          {script.knockoutRisk ? (
            <span className="rounded-full px-1.5 py-0.5 font-mono uppercase" style={{ fontSize: 8, color: RISK_TONE[script.knockoutRisk.label] ?? "var(--vault-text)", background: "var(--vault-wash-soft)", border: "1px solid var(--vault-rule)" }}
              title={script.knockoutRisk.reason}>KO risk {script.knockoutRisk.label}</span>
          ) : null}
        </span>
      </div>

      {/* Predicted score — the headline read */}
      <div className="flex items-baseline gap-2">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: compact ? 18 : 22, fontWeight: 800 }}>
          {script.scoreLean}
        </span>
      </div>

      {/* Linked chips: winner · total · BTTS — the three that must agree */}
      <div className="flex flex-wrap items-center gap-1.5">
        {script.winner ? <Chip label="Winner" value={script.winner} tone="var(--vault-gold-bright)" /> : null}
        <Chip label="Total" value={script.totalLean ?? "Not offered yet"} tone={script.totalOffered ? "var(--vault-text)" : "var(--vault-text-faint)"} />
        <Chip label="BTTS" value={script.bttsLean ?? "Not offered yet"} tone={script.bttsLean ? "var(--vault-text)" : "var(--vault-text-faint)"} />
      </div>

      {/* One sentence tying score + total + BTTS together */}
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{script.explanation}</p>

      {script.conflictWarning ? (
        <p className="text-[11px] leading-snug rounded-[6px] px-2.5 py-1.5"
          style={{ color: "var(--gtp-bank-heat)", background: "rgba(255,120,80,0.06)", border: "1px solid rgba(255,120,80,0.25)" }}>
          ⚠ {script.conflictWarning}
        </p>
      ) : null}
    </div>
  );
}
