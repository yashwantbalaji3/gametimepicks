/**
 * MULTI-SPORT FREESIM REPORT SHELL — the one report spine every sport renders, driven purely by a
 * `MultiSportGameReport` (../../lib/multi-sport-report/schema). Presentational only: no fetch, no state,
 * no client hooks — a server-renderable element that can be handed into a client runner's `postReveal`.
 *
 * The spine, top → bottom, always in this order:
 *   1. Market Snapshot   2. Simulation Output   3. Main Read
 *   4. Top Leans         5. Key Takeaways       6. Expandable Details
 *
 * The honesty the contract encodes is surfaced here: a SourceModeBadge naming the read ("Market-implied
 * simulation" for soccer/UFC), the simulation notes ("not an independent 10,000-run soccer model"),
 * unavailable markets shown as a disabled roadmap (never as leans), and a paper-only disclaimer. This
 * component renders whatever the report says — it can't invent a claim the builder didn't make.
 */
import type { MultiSportGameReport, ReportMarket, ReportLean, SimulationSourceMode } from "@/lib/multi-sport-report/schema";
import { SOURCE_MODE_LABEL } from "@/lib/multi-sport-report/schema";

const gold = "var(--vault-gold-bright)";
const mute = "var(--vault-text-mute)";
const faint = "var(--vault-text-faint)";
const rule = "var(--vault-rule)";

function pct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${Math.round(v * 100)}%` : "—";
}
function american(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return v > 0 ? `+${v}` : `${v}`;
}

/** The honest source-mode chip. Prefers the report's own label; falls back to the generic map. */
export function SourceModeBadge({ mode, label }: { mode: SimulationSourceMode; label?: string }) {
  const text = label && label.length > 0 ? label : SOURCE_MODE_LABEL[mode];
  const implied = mode === "market_implied_simulation" || mode === "projection_only";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.12em]"
      style={{
        background: implied ? "rgba(217,164,65,0.12)" : "rgba(46,160,102,0.14)",
        border: `1px solid ${implied ? "rgba(217,164,65,0.4)" : "rgba(46,160,102,0.4)"}`,
        color: implied ? gold : "var(--gtp-success-on-dark, #7ee2a8)",
        fontSize: 9,
      }}
      data-source-mode={mode}
    >
      <span aria-hidden>◆</span> {text}
    </span>
  );
}

function SectionHead({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="font-mono" style={{ color: gold, fontSize: 10 }}>{String(n).padStart(2, "0")}</span>
      <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>{title}</h3>
      {hint ? <span className="font-mono" style={{ color: faint, fontSize: 9.5 }}>{hint}</span> : null}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] px-4 py-3.5" style={{ background: "rgba(26, 16, 11,0.5)", border: `1px solid var(--vault-border)` }}>
      {children}
    </section>
  );
}

// ── 1. Market Snapshot ────────────────────────────────────────────────────────
function MarketSnapshotPanel({ markets }: { markets: ReportMarket[] }) {
  const live = markets.filter((m) => m.available && m.status === "available");
  const roadmap = markets.filter((m) => !(m.available && m.status === "available"));
  return (
    <Card>
      <SectionHead n={1} title="Market Snapshot" hint={`${live.length} market${live.length === 1 ? "" : "s"} live`} />
      {live.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {live.map((m, i) => (
            <li key={`${m.key}-${i}`} className="flex items-center justify-between gap-3 rounded-[8px] px-2.5 py-1.5" style={{ background: "rgba(0,0,0,0.18)" }}>
              <span style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>{m.label}</span>
              <span className="flex items-center gap-2 font-mono" style={{ fontSize: 11 }}>
                {m.noVigProbability != null ? <span style={{ color: mute }}>{pct(m.noVigProbability)} de-vig</span> : null}
                {m.oddsAmerican != null ? <span style={{ color: gold }}>{american(m.oddsAmerican)}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: mute, fontSize: 12 }}>No live markets for this game yet.</p>
      )}
      {roadmap.length > 0 ? (
        <p className="mt-2 font-mono uppercase tracking-[0.1em]" style={{ color: faint, fontSize: 9 }}>
          Roadmap / provider-needed: {roadmap.map((m) => m.label).join(" · ")}
        </p>
      ) : null}
    </Card>
  );
}

// ── 2. Simulation Output ──────────────────────────────────────────────────────
function SimulationOutputPanel({ output, label }: { output: MultiSportGameReport["simulationOutput"]; label: string }) {
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionHead n={2} title="Simulation Output" hint={output.runCount != null ? `${output.runCount.toLocaleString()} runs` : undefined} />
        <SourceModeBadge mode={output.sourceMode} label={label} />
      </div>
      <p style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{output.headline}</p>
      {output.winProbabilities && output.winProbabilities.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {output.winProbabilities.map((w, i) => (
            <span key={`${w.label}-${i}`} className="rounded-full px-2.5 py-1 font-mono" style={{ background: "rgba(242,54,69,0.10)", border: `1px solid ${rule}`, color: mute, fontSize: 11 }}>
              {w.label} {pct(w.probability)}
            </span>
          ))}
        </div>
      ) : null}
      {output.notes.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {output.notes.map((nn, i) => (
            <li key={i} className="flex gap-1.5" style={{ color: faint, fontSize: 11 }}>
              <span aria-hidden style={{ color: gold }}>·</span> {nn}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

// ── 3. Main Read ──────────────────────────────────────────────────────────────
function MainReadPanel({ read }: { read: MultiSportGameReport["mainRead"] }) {
  return (
    <Card>
      <SectionHead n={3} title="Main Read" hint={read.confidence ?? undefined} />
      <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{read.label}</p>
      {read.explanation ? <p className="mt-1.5" style={{ color: mute, fontSize: 12.5, lineHeight: 1.45 }}>{read.explanation}</p> : null}
      {read.paperOnly ? <p className="mt-2 font-mono uppercase tracking-[0.12em]" style={{ color: faint, fontSize: 9 }}>Paper-only read · not betting advice</p> : null}
    </Card>
  );
}

// ── 4. Top Leans ──────────────────────────────────────────────────────────────
function TopLeansPanel({ leans }: { leans: ReportLean[] }) {
  return (
    <Card>
      <SectionHead n={4} title="Top Leans" hint={`${leans.length}`} />
      {leans.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {leans.map((l, i) => (
            <li key={`${l.market}-${i}`} className="rounded-[8px] px-2.5 py-2" style={{ background: "rgba(0,0,0,0.18)" }}>
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}>{l.selection}</span>
                <span className="flex items-center gap-2 font-mono" style={{ fontSize: 11 }}>
                  {l.confidence ? <span style={{ color: mute }}>{l.confidence}</span> : null}
                  {l.oddsAmerican != null ? <span style={{ color: gold }}>{american(l.oddsAmerican)}</span> : null}
                </span>
              </div>
              {l.rationale ? <p className="mt-0.5 font-mono" style={{ color: faint, fontSize: 10 }}>{l.rationale}</p> : null}
              {!l.settlementSupported ? <p className="mt-0.5 font-mono uppercase tracking-[0.1em]" style={{ color: faint, fontSize: 8.5 }}>Informational only — not settlement-supported</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: mute, fontSize: 12, lineHeight: 1.45 }}>
          No qualified top leans. The model is passing rather than forcing a weak play — for a market-implied read, most markets sit on the posted price.
        </p>
      )}
    </Card>
  );
}

// ── 5. Key Takeaways ──────────────────────────────────────────────────────────
function KeyTakeawaysPanel({ items }: { items: string[] }) {
  return (
    <Card>
      <SectionHead n={5} title="Key Takeaways" />
      <ul className="flex flex-col gap-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2" style={{ color: mute, fontSize: 12.5, lineHeight: 1.4 }}>
            <span aria-hidden style={{ color: gold }}>→</span> {t}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── 6. Expandable Details ─────────────────────────────────────────────────────
function DetailBlock({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="font-mono uppercase tracking-[0.12em]" style={{ color: faint, fontSize: 9 }}>{title}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((t, i) => (
          <li key={i} className="flex gap-1.5" style={{ color: mute, fontSize: 11.5, lineHeight: 1.4 }}>
            <span aria-hidden style={{ color: gold }}>·</span> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportDetailsDisclosure({ details, sourceLabel, advanced }: {
  details: MultiSportGameReport["details"];
  sourceLabel: string;
  advanced?: React.ReactNode;
}) {
  return (
    <details className="rounded-[12px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.5)", border: `1px solid var(--vault-border)` }}>
      <summary className="cursor-pointer list-none">
        <span className="font-mono" style={{ color: gold, fontSize: 10 }}>06</span>
        <span className="ml-2 font-display" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Expandable Details</span>
        <span className="ml-2 font-mono" style={{ color: faint, fontSize: 9.5 }}>methodology · unavailable markets · settlement · advanced dashboard</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <DetailBlock title="Methodology" items={details.methodology} />
        <DetailBlock title={`Source — ${sourceLabel}`} items={details.dataGaps} />
        <DetailBlock title="Unavailable markets (roadmap)" items={details.unavailableMarkets} />
        <DetailBlock title="Settlement notes" items={details.settlementNotes} />
        {advanced ? (
          <div>
            <p className="font-mono uppercase tracking-[0.12em]" style={{ color: faint, fontSize: 9 }}>Advanced market dashboard</p>
            <div className="mt-2">{advanced}</div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

/**
 * The full report. `advanced` is an OPTIONAL richer dashboard (e.g. the existing WcGameCenter) tucked
 * into the Details disclosure so the FreeSim spine is the primary content and nothing useful is lost.
 */
export default function MultiSportReportShell({ report, advanced }: { report: MultiSportGameReport; advanced?: React.ReactNode }) {
  const statusLabel =
    report.status === "final" ? "Result review" : report.status === "live" ? "Live" : report.status === "scheduled" ? "Pre-match" : report.status;
  return (
    <div className="flex flex-col gap-3" data-multi-sport-report={report.sport}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: gold, fontSize: 10 }}>{report.eventName}</span>
        <span className="font-mono" style={{ color: faint, fontSize: 9.5 }}>{report.slateDate}</span>
        <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.12em]" style={{ border: `1px solid ${rule}`, color: mute, fontSize: 8.5 }}>{statusLabel}</span>
        <SourceModeBadge mode={report.sourceMode} label={report.sourceLabel} />
      </div>
      <MarketSnapshotPanel markets={report.marketSnapshot.markets} />
      <SimulationOutputPanel output={report.simulationOutput} label={report.sourceLabel} />
      <MainReadPanel read={report.mainRead} />
      <TopLeansPanel leans={report.topLeans} />
      <KeyTakeawaysPanel items={report.keyTakeaways} />
      <ReportDetailsDisclosure details={report.details} sourceLabel={report.sourceLabel} advanced={advanced} />
      <p className="font-mono uppercase tracking-[0.12em]" style={{ color: faint, fontSize: 9 }}>Paper-only · educational · not betting advice</p>
    </div>
  );
}
