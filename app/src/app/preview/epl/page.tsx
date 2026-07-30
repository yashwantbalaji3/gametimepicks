/**
 * /preview/epl — INTERNAL preview of the EPL market-intelligence prototype.
 *
 * Unlisted and founder-facing. `guardInternalRoute()` makes it 404 in the production export and
 * `scripts/prune-internal-routes.mjs` deletes `out/preview/` outright, so nothing is emitted — but
 * "internal" on a statically exported site has meant "world-readable at its URL" before now, so every
 * line here already meets the public-copy bar.
 *
 * What the page shows per fixture: clubs, kickoff in ET and UTC, our eventId and the provider aliases
 * behind it, the raw three-way prices with the measured overround and the no-vig probabilities,
 * per-row capture time with its leakage verdict, movement ONLY where two real snapshots exist, and the
 * fixture's lifecycle state. There is no GameTimePicks number on it.
 */
import { guardInternalRoute } from "@/lib/internal-route-guard";
import { loadEplArtifacts } from "@/lib/soccer/epl-load";
import { buildEplPreview, EPL_PREVIEW_COPY, type EplFixtureView } from "@/lib/soccer/epl-preview";
import { MATCH_RESULT_OUTCOMES } from "@/lib/soccer/epl-markets";

export const metadata = {
  title: "Internal Preview · EPL market intelligence",
  robots: { index: false, follow: false },
};

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const american = (o: number | null) => (o === null ? "—" : o > 0 ? `+${o}` : `${o}`);
const signed = (d: number) => `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}pp`;

const RULE = "1px solid var(--vault-rule)";
const MUTE = "var(--vault-text-mute)";

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] leading-relaxed" style={{ color: MUTE }}>
      {children}
    </p>
  );
}

function LifecycleBadge({ view }: { view: EplFixtureView }) {
  const tone =
    view.lifecycle.disposition === "GRADE"
      ? "var(--vault-success)"
      : view.lifecycle.disposition === "NO_SETTLEMENT"
        ? MUTE
        : "var(--vault-gold)";
  return (
    <span
      className="rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em]"
      style={{ color: tone, border: `1px solid ${tone}` }}
      title={view.lifecycle.reason}
    >
      {view.lifecycle.state}
    </span>
  );
}

function FixtureCard({ view }: { view: EplFixtureView }) {
  return (
    <section className="rounded-[12px] px-4 py-3.5" style={{ border: RULE, background: "rgba(12,8,6,0.5)" }}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[15px] font-bold tracking-tight" style={{ color: "var(--vault-text)" }}>
          {view.homeClub} <span style={{ color: MUTE }}>v</span> {view.awayClub}
        </h3>
        <LifecycleBadge view={view} />
      </header>

      <div className="mt-1 flex flex-col gap-0.5 font-mono text-[10.5px]" style={{ color: MUTE }}>
        <div>
          {view.kickoffEtLabel} · {view.kickoffUtcLabel}
        </div>
        <div>eventId {view.eventId}</div>
        <div>provider refs {view.providerRefs.length ? view.providerRefs.join(" · ") : "none"}</div>
      </div>

      <p className="mt-2 text-[11.5px]" style={{ color: MUTE }}>
        {view.lifecycle.reason}
      </p>

      {view.captures.length === 0 ? (
        <p className="mt-3 text-[12px]" style={{ color: MUTE }}>
          No capture for this fixture yet.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left font-mono text-[11px]">
            <thead style={{ color: MUTE }}>
              <tr>
                <th className="py-1 pr-3 font-normal">captured</th>
                <th className="py-1 pr-3 font-normal">book</th>
                {MATCH_RESULT_OUTCOMES.map((o) => (
                  <th key={o} className="py-1 pr-3 font-normal">
                    {o.toLowerCase()} price
                  </th>
                ))}
                <th className="py-1 pr-3 font-normal">overround</th>
                {MATCH_RESULT_OUTCOMES.map((o) => (
                  <th key={`nv-${o}`} className="py-1 pr-3 font-normal">
                    no-vig {o.toLowerCase()}
                  </th>
                ))}
                <th className="py-1 font-normal">pregame</th>
              </tr>
            </thead>
            <tbody style={{ color: "var(--vault-text)" }}>
              {view.captures.map((c) => (
                <tr key={`${c.book}-${c.capturedAt}`} style={{ borderTop: RULE }}>
                  <td className="py-1 pr-3">{c.capturedAt}</td>
                  <td className="py-1 pr-3">{c.book}</td>
                  {MATCH_RESULT_OUTCOMES.map((o) => (
                    <td key={o} className="py-1 pr-3">
                      {american(c.reading.prices[o])}
                    </td>
                  ))}
                  <td className="py-1 pr-3">
                    {c.reading.overround === null ? c.reading.status : c.reading.overround.toFixed(4)}
                  </td>
                  {MATCH_RESULT_OUTCOMES.map((o) => (
                    <td key={`nv-${o}`} className="py-1 pr-3">
                      {c.reading.noVig ? pct(c.reading.noVig[o]) : "—"}
                    </td>
                  ))}
                  <td className="py-1">{c.pregame ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 text-[11.5px]" style={{ color: MUTE }}>
        {view.movement.state === "MULTI_CAPTURE" && view.movement.noVigDelta ? (
          <>
            Movement across {view.movement.snapshotCount} captures ({view.movement.deltaBook}):{" "}
            {MATCH_RESULT_OUTCOMES.map((o) => `${o.toLowerCase()} ${signed(view.movement.noVigDelta![o])}`).join(" · ")}
          </>
        ) : view.movement.state === "SINGLE_CAPTURE" ? (
          EPL_PREVIEW_COPY.singleCapture
        ) : view.movement.state === "MULTI_CAPTURE" ? (
          `Two or more captures, but a three-way price could not be read from both — no movement measured.`
        ) : (
          "No capture, so no movement."
        )}
      </div>

      <div className="mt-2 font-mono text-[10.5px]" style={{ color: MUTE }}>
        settlement {view.settlement.state}
        {view.settlement.blocker ? ` · ${view.settlement.blocker}` : ""}
      </div>
    </section>
  );
}

export default function EplPreviewPage() {
  guardInternalRoute();

  const artifacts = loadEplArtifacts();
  const views = buildEplPreview({ fixtures: artifacts.fixtures, odds: artifacts.odds });
  const rejected = [
    ...artifacts.fixtureValidations.flatMap((v) => v.validation.rejected),
    ...artifacts.oddsValidations.flatMap((v) => v.validation.rejected),
  ];
  const sampleOnly = artifacts.dataClasses.length > 0 && artifacts.dataClasses.every((c) => c === "FIXTURE_SAMPLE");

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[22px] font-bold tracking-tight" style={{ color: "var(--vault-text)" }}>
          {EPL_PREVIEW_COPY.title}
        </h1>
        <Note>{EPL_PREVIEW_COPY.subtitle}</Note>
        <Note>{EPL_PREVIEW_COPY.noModel}</Note>
      </header>

      <div className="flex flex-col gap-1.5 rounded-[12px] px-4 py-3" style={{ border: RULE }}>
        <Note>{EPL_PREVIEW_COPY.probabilities}</Note>
        <Note>{EPL_PREVIEW_COPY.leakage}</Note>
        <Note>{EPL_PREVIEW_COPY.lifecycleNote}</Note>
        {sampleOnly ? <Note>{EPL_PREVIEW_COPY.sampleData}</Note> : null}
      </div>

      {views.length === 0 ? (
        <Note>No EPL fixtures on disk.</Note>
      ) : (
        views.map((v) => <FixtureCard key={v.eventId} view={v} />)
      )}

      <div className="flex flex-col gap-1.5 rounded-[12px] px-4 py-3" style={{ border: RULE }}>
        <Note>
          Rows refused at validation: {rejected.length}
          {rejected.length ? ` — ${rejected.map((r) => r.code).join(", ")}` : ""}
        </Note>
      </div>
    </main>
  );
}
