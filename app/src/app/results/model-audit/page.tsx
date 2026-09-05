/**
 * /results/model-audit — every cut of the settled record.
 *
 * Renders the settled-data audit: cross-sport and per-sport summaries, per-market and per-side
 * records, confidence tiers, model–market difference bands and quartiles, per-game dispersion, and
 * the per-date timeline. Every cell cites its sample size and every percentage comes from settled
 * rows; nothing here is a projection, a target or a claim about future accuracy.
 *
 * Two framing rules this page has to keep. Nothing is ordered so that a larger disagreement with the
 * sportsbook reads as a better call — the measured record runs the other way, and the difference
 * bands below are the evidence. And a market whose predictions have been switched off stays visible
 * in the per-market record but is never placed in a ranked or recommendation-shaped list, which is
 * why the old strong/weak cohort columns are gone rather than re-labelled.
 */
import Link from "next/link";

import { loadModelAudit } from "@/lib/results-audit-notes";
import type {
  ModelAuditArtifact,
  ModelAuditMarket,
  ModelAuditQuartile,
  ModelAuditSport,
} from "@/lib/results-audit-notes";
import { formatPercent } from "@/lib/format";
import { isPredictionDisabled } from "@/lib/mlb/model-calibration-status";
import { loadRecentAccounting } from "@/lib/research/results-accounting-loader";
import HitRateSparkline from "@/components/hit-rate-sparkline";
import CandidateReadout, { type ReadoutRow } from "@/components/results/candidate-readout";
import ModelResultsExplorer, { type ModelDay, type ModelCoverage } from "@/components/results/model-results-explorer";
import fs from "node:fs";
import nodePath from "node:path";

export const metadata = {
  title: "Model audit deep-dive · GameTime Picks",
  description:
    "Settled-data audit of the GameTime Picks projection model — per-market, per-side, per-confidence, per-difference-band and per-game cuts, every one sourced from real settled rows. Educational only.",
};

/**
 * The full per-day model-pick history, compacted for the page.
 *
 * The whole index is 76KB and the page does not need all of it; what it needs is every date's
 * counts, its market breakdown and its partition URL — about 19KB. Embedding those URLs is also
 * what keeps the export prune from deleting the partitions: the sweep keeps only data paths the
 * shipped output actually names, and a path mentioned solely inside another JSON is not named.
 */
function loadModelResults(): { days: ModelDay[]; coverage: ModelCoverage } | null {
  try {
    const doc = JSON.parse(fs.readFileSync(nodePath.join(process.cwd(), "public/data/mlb/results/model-index.json"), "utf8"));
    const days: ModelDay[] = (doc.days ?? []).map((d: ModelDay) => ({
      date: d.date, wins: d.wins, losses: d.losses, pushes: d.pushes, rows: d.rows,
      rowsUrl: d.rowsUrl, byMarket: d.byMarket,
    }));
    if (!days.length) return null;
    return { days, coverage: doc.coverage as ModelCoverage };
  } catch { return null; }
}

/** The committed readout, or nothing. An unreadable file publishes no section rather than an empty one. */
function loadCandidateReadout(): { rows: ReadoutRow[]; range: [string, string] | null } {
  try {
    const doc = JSON.parse(fs.readFileSync(nodePath.join(process.cwd(), "..", "data", "internal", "model-eval", "latest-readout.json"), "utf8"));
    return { rows: (doc.rows ?? []) as ReadoutRow[], range: (doc.auditDateRange ?? null) as [string, string] | null };
  } catch { return { rows: [], range: null }; }
}

export default function ModelAuditPage() {
  const { rows: candidateRows, range: candidateAuditRange } = loadCandidateReadout();
  const modelResults = loadModelResults();
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
          This audit has not been rebuilt since the last settlement, so there is nothing current to
          show. Nothing is displayed rather than presenting an older cut as the present record. The
          settled outcome accounting on{" "}
          <Link href="/results" style={{ color: "var(--vault-gold)" }}>
            Results
          </Link>{" "}
          is unaffected.
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

      {/* P235 · D — the whole settled history, not the 60-row sample the aggregate published beside
          a 37,958-row denominator. Filters and headline figures come from the embedded per-day
          summary; opening a day fetches that day alone. */}
      {modelResults ? <ModelResultsExplorer days={modelResults.days} coverage={modelResults.coverage} /> : null}

      {/* P234 · H — what the candidate machinery currently says. Refusals are kept and published:
          an evaluation system that only showed its wins would be the thing it exists to prevent. */}
      <CandidateReadout rows={candidateRows} auditRange={candidateAuditRange} />

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
            boxShadow: "0 0 8px color-mix(in srgb, var(--vault-accent) 60%, transparent)",
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
    nba: "var(--vault-info)",
    mlb: "var(--vault-mint-soft)",
  };
  return (
    <article
      className="rounded-[6px] px-5 py-4 flex flex-col gap-1"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
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
    accent === "nba" ? "var(--vault-info)" : "var(--vault-mint-soft)";
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
// Per-game dispersion
// ---------------------------------------------------------------------------

function DispersionRow({ sport }: { sport: ModelAuditSport }) {
  const d = sport.perGameDispersion;
  if (d.nGames === 0 || d.stdev === null) return null;
  return (
    <article
      className="mt-3 rounded-[6px] px-4 py-4 grid grid-cols-2 sm:grid-cols-4 gap-2"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
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
        style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
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
        borderBottom: "1px solid var(--vault-wash-soft)",
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
