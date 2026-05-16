/**
 * AnomalyGuardrailPanel — splits the settled-row hit rate into
 * "clean" vs "R5 model anomaly" buckets so visitors can audit how the
 * guardrail tier performed. Reads only audited settled rows + the
 * board JSON's `riskFlags` to bucket; never fabricates.
 *
 * The R5 cap exists to prevent extreme-edge calls from claiming
 * High-confidence status — surfacing how that capped bucket actually
 * grades is the most honest form of guardrail audit.
 */
import type { SettledLean } from "@/lib/settlement-data";
import type { PropLean } from "@/lib/types";

interface Bucket {
  wins: number;
  losses: number;
  pushes: number;
  decisive: number;
  hitRate: number | null;
}

function makeBucket(): Bucket {
  return { wins: 0, losses: 0, pushes: 0, decisive: 0, hitRate: null };
}

function recordResult(b: Bucket, result: string | undefined) {
  if (result === "win") b.wins++;
  else if (result === "loss") b.losses++;
  else if (result === "push") b.pushes++;
  b.decisive = b.wins + b.losses;
  b.hitRate = b.decisive > 0 ? b.wins / b.decisive : null;
}

interface Props {
  settledRows: SettledLean[];
  /** Loaded model leans for the same date (carry the riskFlags). */
  boardLeans: PropLean[];
}

export default function AnomalyGuardrailPanel({
  settledRows,
  boardLeans,
}: Props) {
  // (playerId, market, side, line, bookmaker) → riskFlags
  const riskMap = new Map<string, string[]>();
  for (const l of boardLeans) {
    const key = `${l.playerId ?? l.playerName}|${l.market}|${l.lean}|${l.line}|${l.bookmaker}`;
    riskMap.set(key, l.riskFlags ?? []);
  }

  const clean = makeBucket();
  const anomaly = makeBucket();
  for (const r of settledRows) {
    if (r.result !== "win" && r.result !== "loss" && r.result !== "push") {
      continue;
    }
    const key = `${r.playerId ?? r.playerName}|${r.market}|${r.side}|${r.line}|${r.bookmaker}`;
    const flags = riskMap.get(key) ?? [];
    const isAnomaly = flags.includes("suspicious_edge");
    recordResult(isAnomaly ? anomaly : clean, r.result);
  }

  // Both buckets render unless both are empty.
  if (clean.decisive === 0 && anomaly.decisive === 0) return null;

  return (
    <section
      className="mt-10 gtp-guardrail-panel"
      aria-label="Model guardrail breakdown"
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
          style={{
            background: "var(--vault-gold-bright)",
            boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
          }}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          Guardrail audit · clean vs model-anomaly
        </span>
      </div>

      <p
        className="mb-4 text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}
      >
        The model auto-caps any lean with an edge above the R5 anomaly
        threshold so extreme calls never claim High confidence. This
        panel grades those capped picks separately so visitors can see
        exactly how the guardrail tier performs against the clean tier.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GuardrailCard
          title="Clean model leans"
          subtitle="No anomaly flag · regular confidence path"
          bucket={clean}
          tone="gold"
        />
        <GuardrailCard
          title="Model anomaly (R5)"
          subtitle="Edge ≥ 25% · confidence auto-capped to Low"
          bucket={anomaly}
          tone="warn"
        />
      </div>
    </section>
  );
}

function GuardrailCard({
  title,
  subtitle,
  bucket,
  tone,
}: {
  title: string;
  subtitle: string;
  bucket: Bucket;
  tone: "gold" | "warn";
}) {
  const accent =
    tone === "warn" ? "var(--vault-warn)" : "var(--vault-gold-bright)";
  return (
    <div className="gtp-guardrail-card" data-tone={tone}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3
            className="font-display font-semibold tracking-tight"
            style={{ color: "var(--vault-text)", fontSize: 16 }}
          >
            {title}
          </h3>
          <p
            className="mt-0.5 font-mono"
            style={{
              fontSize: 10,
              color: "var(--vault-text-faint)",
              letterSpacing: "0.04em",
            }}
          >
            {subtitle}
          </p>
        </div>
        <div className="text-right">
          <div
            className="font-display font-semibold tabular tracking-tight"
            style={{ fontSize: 28, color: accent, lineHeight: 1 }}
          >
            {bucket.hitRate !== null
              ? `${(bucket.hitRate * 100).toFixed(1)}%`
              : "—"}
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: 10,
              color: "var(--vault-text-faint)",
              letterSpacing: "0.04em",
            }}
          >
            hit rate
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="wins" value={bucket.wins} tone="success" />
        <Stat label="losses" value={bucket.losses} tone="danger" />
        <Stat label="decisive" value={bucket.decisive} />
      </div>
      {bucket.pushes > 0 && (
        <div
          className="mt-2 font-mono"
          style={{
            fontSize: 10,
            color: "var(--vault-text-faint)",
            letterSpacing: "0.04em",
          }}
        >
          + {bucket.pushes} push{bucket.pushes === 1 ? "" : "es"} (excluded
          from hit-rate denominator)
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "var(--vault-success)"
      : tone === "danger"
        ? "var(--vault-danger)"
        : "var(--vault-text)";
  return (
    <div>
      <div
        className="font-mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--vault-text-faint)",
        }}
      >
        {label}
      </div>
      <div
        className="font-display font-semibold tabular tracking-tight"
        style={{ fontSize: 20, color, lineHeight: 1.05 }}
      >
        {value}
      </div>
    </div>
  );
}
