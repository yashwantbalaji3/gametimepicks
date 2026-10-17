/**
 * /ufc/bout/[boutId] — ONE BOUT, ONE PAGE (P251 · F3; restructured in UFC-001 UX Phase B, 2026-10-10).
 *
 * The page answers a reader's questions in the order they ask them, and each answer says only what its source
 * supports:
 *   A. Who we pick — both fighters, the published win chance, the model id, the forecast time, the D2 disclosure.
 *   B. How it may end — the experimental method lean; the method distribution, which is P(method | the bout ends with
 *      a winner) for EITHER fighter (there is no joint winner-and-method model); the round distribution.
 *   C. Why: what we can and cannot say — the tracked-record summary under its own "not the model's reasoning" label,
 *      the winner head's inputs named but not weighed, and a plain statement that per-fight attributions are not
 *      published (they need the builder to emit coefficients: Phase D, a producer change).
 *   D. Fighter comparison — verified fields only: the ESPN tale of the tape, ESPN pro record, UFC tracked record, last 5.
 *      Every row carries its source and "as of" date; a missing value says why.
 *   E. Strengths · weaknesses · tendencies · not established — the shared profile lines (PR #1059).
 *   F. Detailed analytics — the bout story and the full tracked history, behind disclosures.
 *   G. Provenance and limitations, and the way back to the full board.
 *
 * Nothing here is computed from a model. Forecast figures are read from `card-latest.json`, the artifact the hub
 * renders; the tale of the tape is read at build time from the research pull (`lib/sports/ufc/tale-of-tape.mjs`). A bout
 * the model refuses to read still gets a page, and it says why in the producer's own words.
 */
import { roundPhrase } from "@/lib/sports/ufc/round-phrase.mjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Histogram, ProbabilityBar } from "@/components/distribution-chart";
import HeadToHead from "@/components/ui/head-to-head";
import PlayerAvatar from "@/components/player-avatar";
import UfcProfileLines from "@/components/sports/ufc-profile-lines";
import UfcBoutWhy from "@/components/sports/ufc-bout-why";
import UfcFighterComparison from "@/components/sports/ufc-fighter-comparison";
import SectionHeader from "@/components/section-header";
import { findUfcBout, ufcBoutIds, boutPositionLabel } from "@/lib/sports/ufc/bout";
import { loadTaleOfTheTape } from "@/lib/sports/ufc/tale-of-tape.mjs";
import { comparisonRows } from "@/lib/sports/ufc/bout-comparison.mjs";
import { METHOD_DIST_LABEL, METHOD_DIST_NOTE, METHOD_LEAN_NOTE, ROUND_NOTES } from "@/lib/sports/ufc/bout-explain.mjs";
import SaveForecastButton from "@/components/saved/save-forecast-button";
import { cardFromUfcBout, type UfcBout as UfcCardBout, type UfcCardDoc } from "@/lib/command-center/featured";
import { saveCardOf } from "@/lib/saved/saved-schema.mjs";
import { reportCardContext } from "@/lib/command-center/report-card";
import SimulationStorySection from "@/components/simulate/simulation-story-section";
import { buildUfcBoutPresentation } from "@/lib/simulate/presentation/ufc";
import path from "node:path";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { researchHref } from "@/lib/research-pages/projection-store";

export const dynamicParams = false;

export function generateStaticParams() {
  return ufcBoutIds().map((boutId) => ({ boutId }));
}

export function generateMetadata({ params }: { params: { boutId: string } }): Metadata {
  const ctx = findUfcBout(params.boutId);
  if (!ctx) return { title: "UFC bout · GameTime Picks" };
  const { bout, card } = ctx;
  const matchup = `${bout.red.name} vs ${bout.blue.name}`;
  const w = bout.prediction?.winner;
  const read = w
    ? `The model reads ${w.name} at ${Math.round(w.probability * 100)}%`
    : "The model does not read this bout";
  return withRouteMetadata(`/ufc/bout/${bout.boutId}/`, {
    title: `${matchup} — model read · GameTime Picks`,
    description:
      `${read}, with the full method and round distributions for ${matchup} at ${card.event?.name ?? "this UFC card"}. ` +
      "Winner, method and round each publish on their own preregistered evaluation. Educational and paper-only.",
  });
}

const ET = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const METHOD_LABEL: Record<string, string> = { KO: "KO / TKO", SUB: "Submission", DEC: "Decision" };

const PANEL: React.CSSProperties = {
  background: "var(--vault-panel)",
  border: "1px solid var(--vault-rule)",
  borderRadius: 12,
  padding: "clamp(14px, 2vw, 20px)",
};
const SUBHEAD: React.CSSProperties = { fontSize: 10, color: "var(--vault-text-faint)", fontWeight: 600, margin: 0 };
const NOTE: React.CSSProperties = { fontSize: 11.5, lineHeight: 1.6, color: "var(--vault-text-faint)", margin: 0 };

/** One head's held-out evidence, printed with its denominator — an accuracy without n is a number without a claim. */
function EvidenceRow({ label, e }: { label: string; e?: { accuracy?: number; baselineAccuracy?: number; logLoss?: number; baselineLogLoss?: number; n?: number } | null }) {
  if (!e || e.accuracy == null || e.n == null) return null;
  return (
    <div className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)", lineHeight: 1.7 }}>
      <strong style={{ color: "var(--vault-text)" }}>{label}</strong>{" "}
      {pct(e.accuracy)} accurate over {e.n.toLocaleString("en-US")} held-out fights
      {e.baselineAccuracy != null ? ` · baseline ${pct(e.baselineAccuracy)}` : ""}
      {e.logLoss != null && e.baselineLogLoss != null
        ? ` · log loss ${e.logLoss.toFixed(4)} against ${e.baselineLogLoss.toFixed(4)}`
        : ""}
    </div>
  );
}

/** A native disclosure with a full-size touch target. Closed content stays in the DOM for search and the guards. */
function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group" style={{ ...PANEL, padding: 0 }}>
      <summary className="cursor-pointer list-none flex items-center gap-2 px-4"
        style={{ minHeight: 44, fontSize: 13.5, fontWeight: 600, color: "var(--vault-text)" }}>
        <span aria-hidden className="transition-transform group-open:rotate-90" style={{ display: "inline-block", fontSize: 9, color: "var(--vault-text-faint)" }}>▶</span>
        {summary}
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

const SECTIONS = [
  ["bout-pick", "The pick"],
  ["bout-ending", "How it may end"],
  ["bout-why", "Why"],
  ["bout-compare", "Comparison"],
  ["bout-profiles", "Profiles"],
  ["bout-detail", "Detail"],
  ["bout-provenance", "Sources"],
] as const;

export default function UfcBoutPage({ params }: { params: { boutId: string } }) {
  const ctx = findUfcBout(params.boutId);
  if (!ctx) notFound();
  const { card, bout, index, siblings } = ctx;
  const total = card.bouts?.length ?? 0;
  const p = bout.prediction;
  const pickedRed = !!p?.winner && p.winner.name === bout.red.name;
  const redP = p?.winner?.byFighter[bout.red.name] ?? null;
  const blueP = p?.winner?.byFighter[bout.blue.name] ?? null;
  const ufc = "var(--sport-ufc)";
  const repoRoot = path.join(process.cwd(), "..");
  const tott = loadTaleOfTheTape(repoRoot);
  const compareRows = comparisonRows({ bout, card, tott });
  const corpus = card.model?.corpus;

  const rows = redP != null && blueP != null
    ? [{ label: "Win chance", left: pct(redP), right: pct(blueP), better: (pickedRed ? "left" : "right") as "left" | "right" }]
    : [];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
      <div className="mb-3">
        <Link href="/ufc/#ufc-games" className="inline-flex items-center -ml-1 px-1 py-2 font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 10, minHeight: 40 }}>
          ← Full fight card
        </Link>
      </div>

      <header>
        <p className="font-mono uppercase tracking-[0.16em]" style={{ margin: 0, fontSize: 10, color: ufc }}>
          {boutPositionLabel(index, total)}{bout.titleFight ? " · Title fight" : ""}
        </p>
        <h1 style={{ fontSize: "clamp(20px, 3.4vw, 30px)", fontWeight: 800, margin: "6px 0 0" }}>
          {bout.red.name} <span style={{ color: "var(--vault-text-faint)", fontWeight: 500 }}>vs</span> {bout.blue.name}
        </h1>
        <p className="font-mono mt-2" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>
          {ET(bout.startUtc)} ET · {bout.weightClass} · {bout.scheduledRounds} rounds
          {card.event?.name ? ` · ${card.event.name}` : ""}
          {card.event?.venue ? ` · ${card.event.venue}` : ""}
        </p>
        {/* v1.3: fighter research, by exact ESPN athlete id → ufc-athlete-<id>; a fighter without a page gets no link. */}
        {(() => {
          const r = researchHref(`ufc-athlete-${bout.red.athleteId}`);
          const b = researchHref(`ufc-athlete-${bout.blue.athleteId}`);
          if (!r && !b) return null;
          return (
            <p className="font-mono" style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--vault-text-mute)" }}>
              Fight history:{" "}
              {r ? <Link href={r} style={{ color: "var(--vault-gold-bright)" }}>{bout.red.name}</Link> : null}
              {r && b ? " · " : null}
              {b ? <Link href={b} style={{ color: "var(--vault-gold-bright)" }}>{bout.blue.name}</Link> : null}
            </p>
          );
        })()}
        {/* P319: save exactly this bout's read — the card the homepage would feature for it. */}
        {p?.winner ? (
          <div className="mt-3">
            <SaveForecastButton placement="report" compact={false} card={saveCardOf(cardFromUfcBout(bout as unknown as UfcCardBout, card as unknown as UfcCardDoc, reportCardContext("ufc", { dataRoot: path.join(process.cwd(), "public", "data"), repoRoot, nowIso: new Date().toISOString(), ufcVerdicts: (card as { model?: { verdicts?: Record<string, string> } }).model?.verdicts ?? null })))} />
          </div>
        ) : null}
        <nav aria-label="On this page" className="mt-4">
          <ul className="m-0 p-0 flex flex-wrap gap-x-1 gap-y-1" style={{ listStyle: "none" }}>
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="inline-flex items-center rounded-full px-3 font-mono"
                  style={{ minHeight: 32, fontSize: 11, color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", textDecoration: "none" }}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* ── A. WHO WE PICK ───────────────────────────────────────────────────────────────────────────── */}
      <section id="bout-pick" className="mt-8 scroll-mt-24">
        <SectionHeader eyebrow="The pick" title="Who we pick" compact
          sub="The winner forecast, as published on the card before the bout." />
        <div className="grid gap-3">
          {/*
            What this read rests on, ABOVE the first number. The artifact types the BASIS of every bout — both fighters
            known, one with fewer than 2 tracked bouts, or refused — and the note is the producer's own sentence.
          */}
          {bout.unmodelledReason ? (
            <div style={{ ...PANEL, borderColor: "color-mix(in srgb, var(--vault-warn) 45%, var(--vault-rule))" }}>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
                <strong style={{ color: "var(--vault-warn)" }}>No model read for this bout.</strong>{" "}
                {bout.unmodelledReason}
              </p>
            </div>
          ) : p?.basisNote ? (
            <div style={{ ...PANEL, borderColor: `color-mix(in srgb, ${ufc} 40%, var(--vault-rule))` }}>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
                <strong style={{ color: ufc }}>How much history is behind this.</strong> {p.basisNote}
              </p>
            </div>
          ) : null}

          <div style={{ ...PANEL }}>
            <HeadToHead
              accent={ufc}
              left={{ name: bout.red.name, imageUrl: bout.red.photoUrl, subtitle: bout.red.record ?? undefined, favoured: pickedRed }}
              right={{ name: bout.blue.name, imageUrl: bout.blue.photoUrl, subtitle: bout.blue.record ?? undefined, favoured: p?.winner ? !pickedRed : false }}
              rows={rows}
              verdict={p?.winner ? {
                label: "Our pick",
                value: `${p.winner.name} · ${pct(p.winner.probability)} win chance`,
              } : null}
            />
            <div className="font-mono mt-3" style={{ fontSize: 11, color: "var(--vault-text-faint)", lineHeight: 1.7 }}>
              {card.model?.id ? <div>Model {card.model.id}</div> : null}
              {card.generatedAt ? (
                <div>
                  Forecast generated {ET(card.generatedAt)} ET{" "}
                  <span style={{ whiteSpace: "nowrap" }}>({card.generatedAt})</span>
                </div>
              ) : null}
            </div>
            <p className="m-0 mt-3" style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--vault-text-mute)" }}>
              Three separate heads — winner, method and round — each fitted on a corpus of tracked UFC fights and each
              tested on past fights it never trained on before it was published. This is an experimental model: winner
              forecasts are graded on every new card, method and round are not yet graded, and it has not been shown to
              have an edge over the market.
            </p>
          </div>
        </div>
      </section>

      {/* ── B. HOW IT MAY END ────────────────────────────────────────────────────────────────────────── */}
      <section id="bout-ending" className="mt-10 scroll-mt-24">
        <SectionHeader eyebrow="How it may end" title="Method and round" compact
          sub="Experimental: method and round forecasts are not graded yet. Both describe the bout, not the pick." />
        {p?.method || p?.rounds ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
            {p?.method ? (
              <div style={{ ...PANEL, display: "grid", gap: 12, alignContent: "start" }} data-bout-panel="method">
                <div className="rounded-[9px] px-3 py-2" style={{ border: `1px solid color-mix(in srgb, ${ufc} 40%, var(--vault-rule))` }}>
                  <h3 className="font-mono uppercase tracking-[0.1em]" style={SUBHEAD}>Experimental method lean</h3>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--vault-text)", marginTop: 2 }}>
                    {METHOD_LABEL[p.method.most] ?? p.method.most}
                  </div>
                  <p style={{ ...NOTE, marginTop: 2 }}>{METHOD_LEAN_NOTE}</p>
                </div>
                <h3 className="font-mono" style={{ ...SUBHEAD, fontSize: 11.5, color: "var(--vault-text-mute)" }}>{METHOD_DIST_LABEL}</h3>
                <ProbabilityBar label="KO / TKO" p={p.method.probabilities.ko} color={ufc} />
                <ProbabilityBar label="Submission" p={p.method.probabilities.submission} color={ufc} />
                <ProbabilityBar label="Decision" p={p.method.probabilities.decision} color={ufc} />
                <p style={NOTE}>{METHOD_DIST_NOTE}</p>
              </div>
            ) : null}
            {p?.rounds ? (
              <div style={{ ...PANEL, display: "grid", gap: 12, alignContent: "start" }} data-bout-panel="round">
                <h3 className="font-mono uppercase tracking-[0.1em]" style={SUBHEAD}>
                  Round the bout ends · likeliest {roundPhrase(p.rounds)}
                </h3>
                <Histogram
                  accent={ufc}
                  height={110}
                  values={[p.rounds.probabilities.round1, p.rounds.probabilities.round2, p.rounds.probabilities.round3plus]}
                  labelFor={(i) => (i === 0 ? "R1" : i === 1 ? "R2" : "R3+")}
                />
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))" }}>
                  {[["Round 1", p.rounds.probabilities.round1], ["Round 2", p.rounds.probabilities.round2],
                    ["Round 3 or later", p.rounds.probabilities.round3plus], ["Goes the distance", p.rounds.goesTheDistance]].map(([l, v]) => (
                    <div key={String(l)} className="rounded-[9px] px-3 py-2" style={{ border: "1px solid var(--vault-rule)" }}>
                      <div className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>{l}</div>
                      <div className="tabular" style={{ fontSize: 17, fontWeight: 700, color: "var(--vault-text)" }}>{pct(v as number)}</div>
                    </div>
                  ))}
                </div>
                {ROUND_NOTES.map((n) => <p key={n} style={NOTE}>{n}</p>)}
              </div>
            ) : null}
          </div>
        ) : (
          <p style={{ ...PANEL, margin: 0, fontSize: 13, color: "var(--vault-text-mute)" }}>
            {bout.unmodelledReason
              ? "No method or round read: the model does not read this bout."
              : "The method and round heads are not published on this card."}
          </p>
        )}
      </section>

      {/* ── C. WHY: WHAT WE CAN AND CANNOT SAY ───────────────────────────────────────────────────────── */}
      <section id="bout-why" className="mt-10 scroll-mt-24">
        <SectionHeader eyebrow="Why" title="What we can and cannot say" compact
          sub="What the model reads, and what this page does not claim about it." />
        <UfcBoutWhy reason={p?.reason ?? null} modelled={!!p?.winner} />
      </section>

      {/* ── D. FIGHTER COMPARISON ────────────────────────────────────────────────────────────────────── */}
      <section id="bout-compare" className="mt-10 scroll-mt-24">
        <SectionHeader eyebrow="Comparison" title="Tale of the tape and records" compact
          sub="Verified fields only. Each row names its source and date; a gap says why it is a gap." />
        <div style={{ ...PANEL }}>
          <UfcFighterComparison
            redName={bout.red.name}
            blueName={bout.blue.name}
            rows={compareRows}
            caveat={tott ? `self-reported to ESPN and pulled once (as of ${tott.asOf ?? "an unknown date"}). Listed heights tend to be generous and reach is measured inconsistently. Age is computed for the bout date.` : null}
          />
        </div>
      </section>

      {/* ── E. STRENGTHS · WEAKNESSES · TENDENCIES · NOT ESTABLISHED ─────────────────────────────────── */}
      <section id="bout-profiles" className="mt-10 scroll-mt-24">
        <SectionHeader eyebrow="Profiles" title="Strengths · weaknesses · tendencies · not established" compact
          sub={`From tracked UFC bouts only${corpus?.to ? `, as of ${corpus.to}` : ""}. A fight outside the corpus is not counted, and a thin record says so.`} />
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
          {[bout.red, bout.blue].map((f) => {
            const prof = f.profile;
            return (
              <div key={f.athleteId} style={{ ...PANEL }}>
                <div className="flex items-center gap-2.5">
                  <PlayerAvatar photoUrl={f.photoUrl} playerName={f.name} size="sm" flat />
                  <h3 className="m-0" style={{ fontSize: 15, fontWeight: 700, color: "var(--vault-text)" }}>{f.name}</h3>
                </div>
                {prof ? (
                  <div className="mt-2">
                    <UfcProfileLines profile={prof} size="full" />
                  </div>
                ) : (
                  <p className="m-0 mt-2" style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
                    — This card carries no tracked profile for {f.name} ({f.priorBoutsInCorpus} tracked{" "}
                    {f.priorBoutsInCorpus === 1 ? "bout" : "bouts"}).
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── F. DETAILED ANALYTICS ────────────────────────────────────────────────────────────────────── */}
      <section id="bout-detail" className="mt-10 scroll-mt-24">
        <SectionHeader eyebrow="Detail" title="Detailed analytics" compact
          sub="The bout story and the full tracked history, one tap away." />
        <div className="grid gap-3">
          {/* P325: this bout's own story — refused with the artifact's reason when the model did not read it. */}
          <Disclosure summary="The bout story, step by step">
            <SimulationStorySection manifest={buildUfcBoutPresentation(bout, card)} id="bout-story" />
          </Disclosure>
          <Disclosure summary="Last 5 tracked bouts, in full">
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
              {[bout.red, bout.blue].map((f) => {
                const last5 = f.profile?.last5 ?? [];
                return (
                  <div key={f.athleteId}>
                    <h3 className="m-0 mb-1.5" style={{ fontSize: 13, fontWeight: 700, color: "var(--vault-text)" }}>{f.name}</h3>
                    {last5.length ? (
                      <ol className="m-0 p-0 flex flex-col gap-1" style={{ listStyle: "none" }}>
                        {last5.map((b2) => (
                          <li key={`${b2.date}-${b2.opponent}`} className="font-mono flex items-center gap-2" style={{ fontSize: 11, color: "var(--vault-text-mute)" }}>
                            <span aria-hidden style={{ color: b2.result === "W" ? "var(--vault-success)" : "var(--vault-danger)", fontWeight: 700, width: 12 }}>{b2.result}</span>
                            <span className="sr-only">{b2.result === "W" ? "Win against" : "Loss to"}</span>
                            <span className="truncate" style={{ flex: 1 }}>{b2.opponent}</span>
                            <span style={{ color: "var(--vault-text-faint)" }}>{METHOD_LABEL[b2.method] ?? b2.method} R{b2.round} · {b2.date}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p style={NOTE}>— No tracked bouts on this card for {f.name}.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Disclosure>
        </div>
      </section>

      {/* ── G. PROVENANCE AND LIMITATIONS ────────────────────────────────────────────────────────────── */}
      <section id="bout-provenance" className="mt-10 scroll-mt-24">
        <SectionHeader eyebrow="Sources" title="Where these numbers come from" compact />
        <div style={{ ...PANEL, display: "grid", gap: 12 }}>
          <ul className="m-0 grid gap-1.5 list-disc" style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
            <li>
              Forecasts: the published UFC card{card.generatedAt ? `, generated ${card.generatedAt}` : ""}
              {card.model?.id ? `, model ${card.model.id}` : ""}.
            </li>
            <li>
              Tracked records and profiles: {corpus?.fights ? `${corpus.fights.toLocaleString("en-US")} tracked UFC fights` : "the tracked UFC fight corpus"}
              {corpus?.from && corpus?.to ? `, ${corpus.from} to ${corpus.to}` : ""}
              {corpus?.source ? ` (${corpus.source})` : ""}.
            </li>
            <li>
              Tale of the tape: ESPN athlete profiles, self-reported{tott?.asOf ? `, pulled ${tott.asOf}` : ""}.
            </li>
            <li>Pro records: ESPN, as listed on the card when it was built.</li>
          </ul>
          <div className="grid gap-1">
            <EvidenceRow label="Winner" e={card.model?.evidence?.winner} />
            <EvidenceRow label="Method" e={card.model?.evidence?.method} />
            <EvidenceRow label="Round" e={card.model?.evidence?.round} />
          </div>
          <div>
            <h3 className="font-mono uppercase tracking-[0.1em]" style={SUBHEAD}>Limitations</h3>
            <ul className="m-0 mt-1.5 grid gap-1 list-disc" style={{ paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
              <li>Method and round forecasts are experimental and not graded yet.</li>
              <li>Per-fight attributions are not published, so this page does not say which input mattered most.</li>
              <li>Bouts after {corpus?.to ?? "the corpus's last event"} are not in the tracked records.</li>
              <li>The tale of the tape is self-reported and static.</li>
              <li>No striking or grappling averages: no reliable point-in-time source for them yet.</li>
              <li>This page is static: it changes only when the site is rebuilt, and nothing on it is live.</li>
            </ul>
          </div>
          <p className="m-0" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>
            Educational and paper-only — not betting advice.
          </p>
        </div>

        <div className="mt-5">
          <Link href="/ufc/#ufc-games" className="inline-flex items-center rounded-full px-4 font-mono uppercase tracking-[0.12em]"
            style={{ minHeight: 44, fontSize: 11, color: "var(--vault-text)", border: `1px solid ${ufc}`, textDecoration: "none" }}>
            ← Back to the full board
          </Link>
        </div>

        {siblings.length ? (
          <div className="mt-6">
            <h3 className="font-mono uppercase tracking-[0.1em]" style={SUBHEAD}>Other bouts on this card</h3>
            <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))", gap: 8 }}>
              {siblings.map((s) => (
                <li key={s.boutId}>
                  <Link href={`/ufc/bout/${s.boutId}/`}
                    style={{ display: "block", border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px", textDecoration: "none", color: "inherit" }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{s.red.name} vs {s.blue.name}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--vault-text-mute)", marginTop: 2 }}>
                      {s.weightClass}
                      {s.prediction?.winner ? ` · ${s.prediction.winner.name} ${pct(s.prediction.winner.probability)}` : " · no model read"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
