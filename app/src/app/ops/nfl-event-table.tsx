/**
 * NFL event control table (Program 177 · Release D). INTERNAL — /ops is pruned from the public
 * export by prune-internal-routes.
 *
 * The operator question this answers is "is the next NFL slate actually ready, and if not, which
 * row is missing what?" Until now that took three artifacts read by hand: the canonical index for
 * lifecycle and classification, the lane status for chain freshness and credits, and the product
 * eligibility artifact for the paper-product verdicts.
 *
 * Everything here is READ from committed artifacts. The console computes no state of its own — the
 * canonical index's rule is that a surface deriving its own counts is a defect, and an operations
 * console that disagreed with the public site about the same slate would be worse than no console.
 *
 * A missing artifact renders as a stated absence, never as an empty table that reads like "no
 * events". The two are different answers and the operator needs to tell them apart at a glance.
 */
import fs from "node:fs";
import path from "node:path";

const read = <T,>(rel: string): T | null => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as T; } catch { return null; }
};

type IndexEvent = {
  providerEventId: string; canonicalEventId: string; matchup: string; kickoffUtc: string;
  lifecycle: "UPCOMING" | "STARTED" | "SETTLED"; locked: boolean; state: string;
  projectedScore?: { home: number; away: number } | null;
  winProbability?: { home: number; away: number } | null;
  hasMarket: boolean;
  receipt?: { model: string; version: number; inputHash: string; generatedAt: string } | null;
};

type NflIndex = {
  generatedAt: string; nextKickoffUtc: string | null; nextMatchup: string | null;
  counts: Record<string, number>; contradictions: unknown[]; events: IndexEvent[];
};

type LaneStatus = {
  generatedAt: string;
  freshness: Record<string, { state: string; detail: string }>;
  markets: { state: string; events: number; books: number; capturedAt: string };
  credits: { state: string; programSpend: number; ceiling: number; remainingProgram: number; providerRemaining?: number };
};

type Eligibility = {
  generatedAt: string;
  products: Array<{ product: string; label: string; state: string; eligible: boolean }>;
};

const etStamp = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";

const TONE: Record<string, string> = {
  UPCOMING: "var(--gtp-success-on-dark, var(--vault-accent-mint))",
  STARTED: "var(--vault-gold)",
  SETTLED: "var(--vault-text-mute)",
};

/** Newest committed pregame audit. Derived, never pinned — a date literal here rots in a day. */
function newestAuditPath(): string {
  const dir = path.join(process.cwd(), "..", "data/internal/nfl/pregame-audit");
  try {
    const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    return files.length ? path.join(dir, files[files.length - 1]) : "";
  } catch { return ""; }
}

const th = { textAlign: "left" as const, padding: "6px 8px", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "var(--vault-text-faint)" };
const td = { padding: "6px 8px", borderTop: "1px solid var(--vault-rule)", fontSize: 11.5, whiteSpace: "nowrap" as const };

export function NflEventTable() {
  const index = read<NflIndex>("public/data/nfl/index.json");
  const lane = read<LaneStatus>("public/data/admin/nfl-lane.json");
  const eligibility = read<Eligibility>("public/data/nfl/product-eligibility.json");
  // P180-A: the operator side of the pregame audit — residuals and the tickets they generated.
  // The public page shows the record; this shows what the residuals are supposed to change.
  const audit = read<{
    etDate: string; cohort: Record<string, number | boolean | null>;
    tickets: Array<{ id: string; hypothesis: string; evidence: string; acceptanceTest: string; owner: string; candidateRelease: string }>;
    accounting: { reconciles: boolean; officialFinals: number; scoredWithFrozenForecast: number; missingPreEventArtifact: number };
  }>(newestAuditPath());

  if (!index) {
    return (
      <p className="text-[11.5px]" style={{ color: "var(--gtp-bank-heat)" }}>
        No canonical NFL index on disk. This is an absent artifact, not an empty slate — run
        <code className="mx-1 font-mono text-[10px]">scripts/nfl/build-nfl-index.mjs --now &lt;iso&gt;</code>
        or check the event-window workflow.
      </p>
    );
  }

  const events = [...index.events].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
        <span>index {index.generatedAt}</span>
        <span>next {index.nextMatchup ?? "—"} · {index.nextKickoffUtc ? etStamp(index.nextKickoffUtc) : "—"}</span>
        <span style={{ color: index.contradictions.length ? "var(--gtp-bank-heat)" : "var(--gtp-success-on-dark, var(--vault-accent-mint))" }}>
          contradictions {index.contradictions.length}
        </span>
        {Object.entries(index.counts).map(([k, v]) => <span key={k}>{k} {v}</span>)}
      </div>

      {/* Chain freshness + the credit ledger, straight from the lane artifact. */}
      {lane ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[10px]" style={{ color: "var(--vault-text-mute)" }}>
          {Object.entries(lane.freshness).map(([k, f]) => (
            <span key={k}>
              {k} <span style={{ color: f.state === "FRESH" ? "var(--gtp-success-on-dark, var(--vault-accent-mint))" : "var(--gtp-bank-heat)" }}>{f.state}</span>
            </span>
          ))}
          <span>markets {lane.markets.state} · {lane.markets.events} ev · {lane.markets.books} books</span>
          <span>credits {lane.credits.programSpend}/{lane.credits.ceiling} spent · {lane.credits.remainingProgram} left</span>
        </div>
      ) : (
        <p className="font-mono text-[10px]" style={{ color: "var(--gtp-bank-heat)" }}>nfl-lane.json absent — chain freshness and the credit ledger are unknown, not clean</p>
      )}

      {events.length === 0 ? (
        <p className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
          The index exists and lists zero events — a real empty window, not a missing artifact.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr>
                {["Event", "Kickoff", "Lifecycle", "Lock", "State", "Sim", "Market", "Receipt"].map((h) => (
                  <th key={h} scope="col" style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.canonicalEventId}>
                  <td style={{ ...td, color: "var(--vault-text)" }}>
                    {e.matchup}
                    <span className="ml-2 font-mono" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>{e.canonicalEventId}</span>
                  </td>
                  <td style={{ ...td, color: "var(--vault-text-mute)" }}>{etStamp(e.kickoffUtc)}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", color: TONE[e.lifecycle] ?? "var(--vault-text-mute)" }}>{e.lifecycle}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-faint)" }}>{e.locked ? "LOCKED" : "open"}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-mute)" }}>{e.state}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono, monospace)" }}>
                    {e.projectedScore && e.winProbability
                      ? `${e.projectedScore.away}-${e.projectedScore.home} · ${(e.winProbability.home * 100).toFixed(1)}%`
                      : <span style={{ color: "var(--gtp-bank-heat)" }}>none</span>}
                  </td>
                  <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", color: e.hasMarket ? "var(--gtp-success-on-dark, var(--vault-accent-mint))" : "var(--gtp-bank-heat)" }}>
                    {e.hasMarket ? "priced" : "none"}
                  </td>
                  <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", fontSize: 9.5, color: "var(--vault-text-faint)" }}>
                    {e.receipt ? `${e.receipt.inputHash} · ${e.receipt.generatedAt}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {eligibility ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[10px]" style={{ color: "var(--vault-text-mute)" }}>
          <span style={{ color: "var(--vault-text-faint)" }}>products {eligibility.generatedAt}</span>
          {eligibility.products.map((p) => (
            <span key={p.product}>
              {p.product} <span style={{ color: p.eligible ? "var(--gtp-success-on-dark, var(--vault-accent-mint))" : "var(--vault-text-faint)" }}>{p.state}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="font-mono text-[10px]" style={{ color: "var(--gtp-bank-heat)" }}>product-eligibility.json absent — the daily paper-product evaluation did not run</p>
      )}

      {audit ? (
        <div className="flex flex-col gap-1.5" style={{ borderTop: "1px solid var(--vault-rule)", paddingTop: 8 }}>
          <div className="font-mono text-[10px]" style={{ color: "var(--vault-text-mute)" }}>
            pregame audit {audit.etDate} · n={String(audit.cohort.n)} · reconciles {String(audit.accounting.reconciles)} · missing {audit.accounting.missingPreEventArtifact}
            {" · "}teamScoreMAE {String(audit.cohort.teamScoreMAE)} · marginMAE {String(audit.cohort.marginMAE)} · totalMAE {String(audit.cohort.totalMAE)}
            {" · "}cov80 margin {String(audit.cohort.marginInterval80Coverage)} / total {String(audit.cohort.totalInterval80Coverage)}
            {" · "}Brier {String(audit.cohort.modelBrier)} vs market {String(audit.cohort.marketBrier)}
          </div>
          {audit.tickets.map((t) => (
            <div key={t.id} className="text-[10.5px]" style={{ color: "var(--vault-text-mute)" }}>
              <span className="font-mono" style={{ color: "var(--gtp-bank-heat)" }}>{t.id}</span>{" — "}{t.hypothesis}
              <span style={{ color: "var(--vault-text-faint)" }}>{" · accept: "}{t.acceptanceTest}{" · "}{t.candidateRelease}</span>
            </div>
          ))}
        </div>
      ) : null}

      <p className="font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>
        Read-only. Every value is read from a committed artifact; this console derives nothing of its own.
        A row with no sim or no price is a real gap in the chain, not a rendering fault.
      </p>
    </div>
  );
}
