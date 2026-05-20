/**
 * /results/model-audit — model audit deep-dive.
 *
 * Reads `app/public/data/audit/model_audit.json` (produced by
 * `python -m pipeline.model_audit` after every settlement) and renders
 * every cut of the settled-data record the audit framework computes:
 *
 *   * cross-sport lifetime + per-sport summaries
 *   * per-market W-L + projection-error stats
 *   * per-side and per-side × per-market W-L
 *   * confidence-tier calibration
 *   * fixed-cutoff edge bands + data-derived edge quartiles
 *   * per-game hit-rate dispersion
 *   * weak / strong named cohorts (sample-size weighted)
 *   * per-date timeline including each date's gameContext
 *
 * The page is intentionally a single scrollable surface — readers
 * looking for an honest answer to "what is the model actually doing"
 * should be able to scan it without clicking through tabs. Every cell
 * cites its sample size; every percentage is computed from real
 * settled rows. No projections, no targets, no future-accuracy claims.
 */
import Link from "next/link";

import { loadModelAudit } from "@/lib/results-audit-notes";
import type {
  ModelAuditArtifact,
  ModelAuditCohort,
  ModelAuditMarket,
  ModelAuditQuartile,
  ModelAuditSport,
} from "@/lib/results-audit-notes";
import { formatPercent } from "@/lib/format";
import HitRateSparkline from "@/components/hit-rate-sparkline";

export const metadata = {
  title: "Model audit deep-dive · GameTime Picks",
  description:
    "Settled-data audit of the GameTime Picks projection model. Per-market, per-side, per-confidence, per-edge-band, per-quartile, per-game dispersion — every cut sourced from real settled rows. Educational only.",
};

export default function ModelAuditPage() {
  const audit = loadModelAudit();
  if (!audit) {
    return (
      <main className="mx-auto max-w-[1080px] px-4 sm:px-6 py-10">
        <h1
          className="font-display tracking-tight"
          style={{ color: "var(--vault-text)", fontSize: 28 }}
        >
          Model audit deep-dive
        </h1>
        <p
          className="mt-4 text-sm"
          style={{ color: "var(--vault-text-mute)" }}
        >
          The audit artifact has not been generated yet. Run{" "}
          <code className="font-mono">python -m pipeline.model_audit</code>{" "}
          after a settlement to populate this page.
        </p>
      </main>
    );
  }

  const cross = audit.sports.cross;
  const nba = audit.sports.nba;
  const mlb = audit.sports.mlb;

  return (
    <main className="mx-auto max-w-[1080px] px-4 sm:px-6 py-8">
      <Breadcrumb />
      <PageHero artifact={audit} />
      <CrossSportRow audit={audit} />

      <SportBlock sport={nba} accent="nba" />
      <SportBlock sport={mlb} accent="mlb" />

      <HonestyFooter generatedAt={audit.generatedAt} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Header / hero
// ---------------------------------------------------------------------------

function Breadcrumb() {
  return (
    <nav
      className="mb-4 flex items-center gap-2 font-mono uppercase tracking-[0.16em]"
      style={{ fontSize: 10, color: "var(--vault-text-mute)" }}
    >
      <Link
        href="/results"
        className="hover:underline"
        style={{ color: "var(--vault-gold)" }}
      >
        Results
      </Link>
      <span aria-hidden>›</span>
      <span style={{ color: "var(--vault-text-mute)" }}>Model audit</span>
    </nav>
  );
}

function PageHero({ artifact }: { artifact: ModelAuditArtifact }) {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-2 mb-2">
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
          Model audit · deep dive
        </span>
      </div>
      <h1
        className="font-display tracking-tight"
        style={{
          color: "var(--vault-text)",
          fontSize: "clamp(26px, 4vw, 36px)",
          lineHeight: 1.15,
        }}
      >
        Every cut of the settled record
      </h1>
      <p
        className="mt-3 text-[13px] leading-relaxed max-w-2xl"
        style={{ color: "var(--vault-text-mute)" }}
      >
        Sourced from <code className="font-mono">model_audit.json</code>,
        rebuilt after every settlement. Pushes excluded from the
        denominator; pending and insufficient-data rows never counted.
        Educational only — not betting advice.
      </p>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Cross-sport summary
// ---------------------------------------------------------------------------

function CrossSportRow({ audit }: { audit: ModelAuditArtifact }) {
  const cross = audit.sports.cross;
  const nba = audit.sports.nba;
  const mlb = audit.sports.mlb;
  return (
    <section
      aria-label="Cross-sport summary"
      className="mb-10 grid grid-cols-1 sm:grid-cols-3 gap-3"
    >
      <SummaryTile
        label="Cross-sport"
        value={fmtPct(cross.hitRate)}
        sub={`${cross.wins}–${cross.losses} on ${cross.decisive} decisive`}
        accent="gold"
      />
      <SummaryTile
        label="NBA"
        value={fmtPct(nba.lifetime.hitRate)}
        sub={`${nba.lifetime.wins}–${nba.lifetime.losses} on ${nba.sampleSize.decisive} · ${nba.sampleSize.dates} dates`}
        accent="nba"
      />
      <SummaryTile
        label="MLB"
        value={fmtPct(mlb.lifetime.hitRate)}
        sub={`${mlb.lifetime.wins}–${mlb.lifetime.losses} on ${mlb.sampleSize.decisive} · ${mlb.sampleSize.dates} dates`}
        accent="mlb"
      />
    </section>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "gold" | "nba" | "mlb";
}) {
  const accentMap: Record<string, string> = {
    gold: "var(--vault-gold-bright)",
    nba: "rgba(120, 175, 255, 1)",
    mlb: "rgba(140, 230, 175, 1)",
  };
  return (
    <article
      className="rounded-[6px] px-5 py-4 flex flex-col gap-1"
      style={{
        background: "rgba(7, 11, 26, 0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: accentMap[accent], fontSize: 10 }}
      >
        {label}
      </span>
      <span
        className="font-display font-semibold gtp-scoreboard-number"
        style={{
          color: "var(--vault-text)",
          fontSize: 30,
          lineHeight: 1.0,
        }}
      >
        {value}
      </span>
      <span
        className="text-[12px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {sub}
      </span>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Per-sport block (used by NBA + MLB)
// ---------------------------------------------------------------------------

function SportBlock({
  sport,
  accent,
}: {
  sport: ModelAuditSport;
  accent: "nba" | "mlb";
}) {
  if (sport.sampleSize.decisive === 0) return null;
  const label = sport.sport.toUpperCase();
  return (
    <section
      aria-label={`${label} audit`}
      className="mb-12 reveal"
    >
      <BlockHeader accent={accent} title={`${label} settled audit`} />

      <CohortsRow
        weak={sport.weakCohorts}
        strong={sport.strongCohorts}
      />

      <DispersionRow sport={sport} />

      <h3 className="mt-8 mb-3 font-mono uppercase tracking-[0.16em]" style={fineHeader}>
        Per-market
      </h3>
      <MarketsTable markets={sport.byMarket} />

      <h3 className="mt-8 mb-3 font-mono uppercase tracking-[0.16em]" style={fineHeader}>
        Per-side × market
      </h3>
      <MarketSideTable rows={sport.byMarketSide} />

      <h3 className="mt-8 mb-3 font-mono uppercase tracking-[0.16em]" style={fineHeader}>
        Confidence tier
      </h3>
      <BucketTable rows={sport.byConfidence} />

      <h3 className="mt-8 mb-3 font-mono uppercase tracking-[0.16em]" style={fineHeader}>
        Edge band (fixed cutoffs)
      </h3>
      <BucketTable rows={sport.byEdgeBand} />

      <h3 className="mt-8 mb-3 font-mono uppercase tracking-[0.16em]" style={fineHeader}>
        Edge quartile (data-derived)
      </h3>
      <QuartileTable rows={sport.byEdgeQuartile} />

      <h3 className="mt-8 mb-3 font-mono uppercase tracking-[0.16em]" style={fineHeader}>
        Per-date timeline
      </h3>
      <DateTimeline rows={sport.byDate} />

      <h3 className="mt-8 mb-3 font-mono uppercase tracking-[0.16em]" style={fineHeader}>
        Per-date hit rate sparkline
      </h3>
      <HitRateSparkline
        rows={sport.byDate.map((r) => ({
          date: r.date,
          hitRate: r.hitRate,
          wins: r.wins,
          losses: r.losses,
          decisive: r.decisive,
        }))}
        label={sport.sport === "nba" ? "NBA" : "MLB"}
        color={
          sport.sport === "nba"
            ? "var(--vault-gold-bright)"
            : "var(--vault-success)"
        }
        width={480}
        height={120}
      />
    </section>
  );
}

const fineHeader = {
  color: "var(--vault-gold)",
  fontSize: 11,
};

function BlockHeader({
  accent,
  title,
}: {
  accent: "nba" | "mlb";
  title: string;
}) {
  const accentColor =
    accent === "nba" ? "rgba(120, 175, 255, 1)" : "rgba(140, 230, 175, 1)";
  return (
    <div className="mb-5 flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block w-2 h-2 rounded-full"
        style={{
          background: accentColor,
          boxShadow: `0 0 8px ${accentColor}`,
        }}
      />
      <h2
        className="font-display tracking-tight"
        style={{ color: "var(--vault-text)", fontSize: 22, lineHeight: 1.2 }}
      >
        {title}
      </h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cohort row (weak / strong)
// ---------------------------------------------------------------------------

function CohortsRow({
  weak,
  strong,
}: {
  weak: ModelAuditCohort[];
  strong: ModelAuditCohort[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <CohortColumn title="Strong cohorts" cohorts={strong} tone="strong" />
      <CohortColumn title="Weak cohorts" cohorts={weak} tone="weak" />
    </div>
  );
}

function CohortColumn({
  title,
  cohorts,
  tone,
}: {
  title: string;
  cohorts: ModelAuditCohort[];
  tone: "strong" | "weak";
}) {
  const accent =
    tone === "strong" ? "var(--vault-success)" : "var(--vault-warn-amber)";
  return (
    <article
      className="rounded-[6px] px-4 py-4 flex flex-col gap-3"
      style={{
        background: "rgba(7, 11, 26, 0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
        />
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: accent, fontSize: 10 }}
        >
          {title}
        </span>
      </div>
      {cohorts.length === 0 ? (
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          No cohorts cleared the 30-decisive / 5pp deviation threshold yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cohorts.map((c) => (
            <li
              key={c.name}
              className="flex items-center justify-between gap-3 text-[13px]"
              style={{ color: "var(--vault-text)" }}
            >
              <span className="truncate" title={c.name}>
                {c.name}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span
                  className="font-mono font-semibold gtp-scoreboard-number"
                  style={{ fontSize: 14 }}
                >
                  {fmtPct(c.hitRate)}
                </span>
                <span
                  className="font-mono uppercase tracking-[0.12em]"
                  style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
                >
                  {c.wins}–{c.losses} · {weightLabel(c.weight)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function weightLabel(w: string): string {
  if (w === "signal") return "signal";
  if (w === "lean") return "lean";
  return "small";
}

// ---------------------------------------------------------------------------
// Per-game dispersion
// ---------------------------------------------------------------------------

function DispersionRow({ sport }: { sport: ModelAuditSport }) {
  const d = sport.perGameDispersion;
  if (d.nGames === 0 || d.stdev === null) return null;
  return (
    <article
      className="mt-3 rounded-[6px] px-4 py-4 grid grid-cols-2 sm:grid-cols-4 gap-2"
      style={{
        background: "rgba(7, 11, 26, 0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <Stat label="Per-game stdev" value={`${(d.stdev * 100).toFixed(1)}pp`} />
      <Stat label="Worst game" value={fmtPct(d.minHit)} />
      <Stat label="Best game" value={fmtPct(d.maxHit)} />
      <Stat label="Games audited" value={String(d.nGames)} />
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-mute)", fontSize: 9 }}
      >
        {label}
      </span>
      <span
        className="font-mono font-semibold gtp-scoreboard-number"
        style={{ color: "var(--vault-text)", fontSize: 18, lineHeight: 1 }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function MarketsTable({ markets }: { markets: ModelAuditMarket[] }) {
  if (markets.length === 0) {
    return <EmptyRow label="No markets settled yet." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={tableStyle}>
        <thead style={theadStyle}>
          <tr>
            <Th>Market</Th>
            <Th align="right">Record</Th>
            <Th align="right">Hit</Th>
            <Th align="right">Avg |err|</Th>
            <Th align="right">Stdev err</Th>
            <Th align="right">Bias</Th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => (
            <tr key={m.label}>
              <Td>{m.label}</Td>
              <Td align="right">
                {m.wins}–{m.losses}{" "}
                <Faint>on {m.decisive}</Faint>
              </Td>
              <Td align="right">{fmtPct(m.hitRate)}</Td>
              <Td align="right">{fmtNum(m.avgAbsErr, 2)}</Td>
              <Td align="right">{fmtNum(m.stdevErr, 2)}</Td>
              <Td align="right">{fmtBias(m.bias)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketSideTable({
  rows,
}: {
  rows: ModelAuditSport["byMarketSide"];
}) {
  if (rows.length === 0) return <EmptyRow label="No side splits yet." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={tableStyle}>
        <thead style={theadStyle}>
          <tr>
            <Th>Market</Th>
            <Th>Side</Th>
            <Th align="right">Record</Th>
            <Th align="right">Hit</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.market}-${r.side}`}>
              <Td>{r.market}</Td>
              <Td>{r.side}</Td>
              <Td align="right">
                {r.wins}–{r.losses} <Faint>on {r.decisive}</Faint>
              </Td>
              <Td align="right">{fmtPct(r.hitRate)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BucketTable({
  rows,
}: {
  rows: Array<{
    label: string;
    wins: number;
    losses: number;
    decisive: number;
    hitRate: number | null;
  }>;
}) {
  if (rows.length === 0) return <EmptyRow label="No data yet." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={tableStyle}>
        <thead style={theadStyle}>
          <tr>
            <Th>Bucket</Th>
            <Th align="right">Record</Th>
            <Th align="right">Hit</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <Td>{r.label}</Td>
              <Td align="right">
                {r.wins}–{r.losses} <Faint>on {r.decisive}</Faint>
              </Td>
              <Td align="right">{fmtPct(r.hitRate)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuartileTable({ rows }: { rows: ModelAuditQuartile[] }) {
  if (rows.length === 0)
    return (
      <EmptyRow label="Edge quartiles require at least 8 decisive picks with edge data." />
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={tableStyle}>
        <thead style={theadStyle}>
          <tr>
            <Th>Quartile</Th>
            <Th>|Edge| range</Th>
            <Th align="right">Record</Th>
            <Th align="right">Hit</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.quartile}>
              <Td>Q{r.quartile}</Td>
              <Td>
                {r.lo.toFixed(2)}–{r.hi.toFixed(2)}pp
              </Td>
              <Td align="right">
                {r.wins}–{r.losses} <Faint>on {r.decisive}</Faint>
              </Td>
              <Td align="right">{fmtPct(r.hitRate)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DateTimeline({
  rows,
}: {
  rows: ModelAuditSport["byDate"];
}) {
  if (rows.length === 0) return <EmptyRow label="No dates settled yet." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={tableStyle}>
        <thead style={theadStyle}>
          <tr>
            <Th>Date</Th>
            <Th align="right">Record</Th>
            <Th align="right">Hit</Th>
            <Th>Phase</Th>
            <Th>Day</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date}>
              <Td>{r.date}</Td>
              <Td align="right">
                {r.wins}–{r.losses} <Faint>on {r.decisive}</Faint>
              </Td>
              <Td align="right">{fmtPct(r.hitRate)}</Td>
              <Td>{r.gameContext?.seasonPhase ?? "—"}</Td>
              <Td>{dayName(r.gameContext?.dayOfWeek)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

const tableStyle = {
  borderCollapse: "collapse" as const,
  width: "100%",
};

const theadStyle = {
  color: "var(--vault-text-mute)",
  fontSize: 10,
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="py-2 px-2"
      style={{
        borderBottom: "1px solid var(--vault-border)",
        textAlign: align,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className="py-2 px-2"
      style={{
        borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
        textAlign: align,
        color: "var(--vault-text)",
      }}
    >
      {children}
    </td>
  );
}

function Faint({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: "var(--vault-text-mute)" }}>{children}</span>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <p
      className="text-[12px] py-2"
      style={{ color: "var(--vault-text-mute)" }}
    >
      {label}
    </p>
  );
}

function fmtPct(v: number | null | undefined): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}

function fmtBias(v: number | null | undefined): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

function dayName(d: number | null | undefined): string {
  if (typeof d !== "number") return "—";
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d] ?? "—";
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function HonestyFooter({ generatedAt }: { generatedAt: string }) {
  return (
    <footer
      className="mt-12 border-t pt-6 text-[12px] leading-relaxed"
      style={{
        borderColor: "var(--vault-border)",
        color: "var(--vault-text-mute)",
      }}
    >
      <p>
        Generated <code className="font-mono">{generatedAt}</code> by the
        nightly settlement pipeline. The pipeline derives every cell on
        this page from <code className="font-mono">settled_leans.jsonl</code>{" "}
        — no live model calls, no projections. Pushes are excluded from the
        denominator; pending and insufficient-data rows are never counted.
      </p>
      <p className="mt-3">
        The model uses Over/Under closing-line proxies + recent-form
        adjustments. It has no series-state, no leverage, no usage-spike,
        no OT-pace input today — that wiring is on the roadmap. The
        gameContext column above carries date-derived fields only;
        eliminationFlag / paceProjection / parkFactor remain placeholders
        until those loaders ship.
      </p>
      <p className="mt-3">
        Educational only — not betting advice. See{" "}
        <Link
          href="/methodology"
          className="hover:underline"
          style={{ color: "var(--vault-gold)" }}
        >
          methodology
        </Link>{" "}
        and{" "}
        <Link
          href="/responsible-use"
          className="hover:underline"
          style={{ color: "var(--vault-gold)" }}
        >
          responsible use
        </Link>
        .
      </p>
    </footer>
  );
}
