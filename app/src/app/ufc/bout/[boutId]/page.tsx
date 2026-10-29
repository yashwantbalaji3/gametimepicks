/**
 * /ufc/bout/[boutId] — ONE BOUT, ONE PAGE (P251 · F3).
 *
 * UFC was the only live sport with no per-event route: every "View report" on the hub was an
 * anchor to a row further down the same page, so a bout could not be shared, bookmarked, linked
 * to from a ranked panel or indexed. That is a strange gap here, because this is the best
 * evidenced model on the site — three heads, all PASS against preregistered bars, measured on
 * 3,557 held-out fights, while MLB's four markets were demoted to market context and NFL's and
 * EPL's have never beaten a price.
 *
 * The card artifact already holds the whole read. This page gives it room: the winner split, the
 * method distribution and the round distribution each get their own section rather than sharing
 * one dense row, the two fighter profiles sit side by side, and the model's own held-out numbers
 * are printed rather than summarised. Nothing here is computed — every figure is read from
 * `card-latest.json`, the same artifact the hub renders.
 *
 * A bout the model refuses to read still gets a page. It says why, in the producer's own words.
 */
import { ufcEndingLine, ufcPct, ufcRoundRead } from "@/lib/sports/ufc/round-phrase.mjs";
import type { Metadata } from "next";
import Link from "next/link";
import MoreDisclosure from "@/components/ui/more-disclosure";
import { notFound } from "next/navigation";

import { Histogram, ProbabilityBar } from "@/components/distribution-chart";
import HeadToHead from "@/components/ui/head-to-head";
import UfcProfileLines from "@/components/sports/ufc-profile-lines";
import SectionHeader from "@/components/section-header";
import { findUfcBout, findUfcSettledBout, ufcBoutIds, boutPositionLabel, UFC_FINISH_LABEL, type UfcSettledContext } from "@/lib/sports/ufc/bout";
import SaveForecastButton from "@/components/saved/save-forecast-button";
import { cardFromUfcBout, type UfcBout as UfcCardBout, type UfcCardDoc } from "@/lib/command-center/featured";
import { saveCardOf } from "@/lib/saved/saved-schema.mjs";
import { reportCardContext } from "@/lib/command-center/report-card";
import SimulationStorySection from "@/components/simulate/simulation-story-section";
import { buildUfcBoutPresentation } from "@/lib/simulate/presentation/ufc";
import path from "node:path";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { researchHref } from "@/lib/research-pages/projection-store";
import EtTime from "@/components/ui/et-time";

export const dynamicParams = false;

export function generateStaticParams() {
  return ufcBoutIds().map((boutId) => ({ boutId }));
}

export function generateMetadata({ params }: { params: { boutId: string } }): Metadata {
  const settled = findUfcSettledBout(params.boutId);
  if (settled) {
    const b = settled.bout;
    const read = b.pick && b.probability != null ? `The model read ${b.pick} at ${pct(b.probability)} before the fight` : "The model's pre-fight read";
    const outcome = b.state === "VOID" ? "the bout produced no winner" : b.winner ? `${b.winner} won` : "the official result";
    return withRouteMetadata(`/ufc/bout/${b.boutId}/`, {
      title: `${b.matchup} — settled · GameTime Picks`,
      description: `${read}; ${outcome}${b.competition ? ` at ${b.competition}` : ""}. The forecast as frozen before the card, beside the official result. Educational and paper-only.`,
    });
  }
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

const pct = (n: number) => ufcPct(n) ?? "—";
const METHOD_LABEL: Record<string, string> = { KO: "KO / TKO", SUB: "Submission", DEC: "Decision" };

const PANEL: React.CSSProperties = {
  background: "var(--vault-panel)",
  border: "1px solid var(--vault-rule)",
  borderRadius: 12,
  padding: "clamp(14px, 2vw, 20px)",
};

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

export default function UfcBoutPage({ params }: { params: { boutId: string } }) {
  const settled = findUfcSettledBout(params.boutId);
  if (settled) return <SettledBout ctx={settled} />;
  const ctx = findUfcBout(params.boutId);
  if (!ctx) notFound();
  const { card, bout, index, siblings } = ctx;
  const total = card.bouts?.length ?? 0;
  const p = bout.prediction;
  const pickedRed = !!p?.winner && p.winner.name === bout.red.name;
  const redP = p?.winner?.byFighter[bout.red.name] ?? null;
  const blueP = p?.winner?.byFighter[bout.blue.name] ?? null;
  const ufc = "var(--sport-ufc)";

  const rows = [
    { label: "Record", left: bout.red.record ?? "—", right: bout.blue.record ?? "—" },
    { label: "Tracked bouts", left: String(bout.red.priorBoutsInCorpus), right: String(bout.blue.priorBoutsInCorpus) },
    ...(redP != null && blueP != null
      ? [{ label: "Win chance", left: pct(redP), right: pct(blueP), better: (pickedRed ? "left" : "right") as "left" | "right" }]
      : []),
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
      <div className="mb-3">
        <Link href="/ufc/" className="inline-flex items-center -ml-1 px-1 py-2 font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 10, minHeight: 40 }}>
          ← Fight card
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
            <SaveForecastButton placement="report" compact={false} card={saveCardOf(cardFromUfcBout(bout as unknown as UfcCardBout, card as unknown as UfcCardDoc, reportCardContext("ufc", { dataRoot: path.join(process.cwd(), "public", "data"), repoRoot: path.join(process.cwd(), ".."), nowIso: new Date().toISOString(), ufcVerdicts: (card as { model?: { verdicts?: Record<string, string> } }).model?.verdicts ?? null })))} />
          </div>
        ) : null}
      </header>

      {/* P325: this bout's own story — the same read the card walkthrough carries, told for one fight; refused
          with the artifact's reason when the model did not read it. */}
      <div className="mt-5">
        <SimulationStorySection manifest={buildUfcBoutPresentation(bout, card)} id="bout-story" />
      </div>

      {/*
        ── What this read rests on, ABOVE the first number ─────────────────────────────────────
        The artifact types the BASIS of every bout — both fighters known, one with fewer than 2 tracked bouts, or refused —
        and the note is the producer's own sentence. A reader who stops after the headline
        probability has still been told how much history is behind it.
      */}
      {bout.unmodelledReason ? (
        <section className="mt-5" style={{ ...PANEL, borderColor: "color-mix(in srgb, var(--vault-warn) 45%, var(--vault-rule))" }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
            <strong style={{ color: "var(--vault-warn)" }}>No model read for this bout.</strong>{" "}
            {bout.unmodelledReason}
          </p>
        </section>
      ) : p?.basisNote ? (
        <section className="mt-5" style={{ ...PANEL, borderColor: `color-mix(in srgb, ${ufc} 40%, var(--vault-rule))` }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
            <strong style={{ color: ufc }}>How much history is behind this.</strong> {p.basisNote}
          </p>
        </section>
      ) : null}

      <section className="mt-8">
        <SectionHeader eyebrow="Winner" title="Who the model expects to win"
          sub="Probabilities over the two fighters, from the head that was evaluated on its own preregistered bar." />
        <div style={{ ...PANEL }}>
          <HeadToHead
            accent={ufc}
            left={{ name: bout.red.name, imageUrl: bout.red.photoUrl, subtitle: bout.red.record ?? undefined, favoured: pickedRed }}
            right={{ name: bout.blue.name, imageUrl: bout.blue.photoUrl, subtitle: bout.blue.record ?? undefined, favoured: p?.winner ? !pickedRed : false }}
            rows={rows}
            verdict={p?.winner ? {
              label: "Model pick",
              value: `${p.winner.name} · ${pct(p.winner.probability)}`,
              sub: ufcEndingLine(p) ?? undefined,
            } : null}
            note={p?.reason ?? undefined}
          />
        </div>
      </section>

      {p?.method ? (
        <section className="mt-8">
          <SectionHeader eyebrow="Method" title="How it ends"
            sub="Read among fights that end with a winner — a draw or no-contest sits outside this sample, so the three add to 100%." />
          <div style={{ ...PANEL, display: "grid", gap: 10 }}>
            <ProbabilityBar label="KO / TKO" p={p.method.probabilities.ko} color={ufc} />
            <ProbabilityBar label="Submission" p={p.method.probabilities.submission} color={ufc} />
            <ProbabilityBar label="Decision" p={p.method.probabilities.decision} color={ufc} />
          </div>
        </section>
      ) : null}

      {p?.rounds ? (
        <section className="mt-8">
          <SectionHeader eyebrow="Round" title="How far it goes"
            sub="R3+ carries every fight that reaches the judges as well as every round-3-or-later finish." />
          <div style={{ ...PANEL, display: "grid", gap: 14 }}>
            <Histogram
              accent={ufc}
              height={110}
              values={[p.rounds.probabilities.round1, p.rounds.probabilities.round2, p.rounds.probabilities.round3plus]}
              labelFor={(i) => (i === 0 ? "R1" : i === 1 ? "R2" : "R3+")}
            />
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              {/* Batch 1 #4: labels and numbers from the one round accessor the hub and /cage-chaos read. */}
              {(() => {
                const r = ufcRoundRead(p.rounds);
                return [r?.round1, r?.round2, r?.round3plus, r?.goesTheDistance].filter((x) => x != null).map((x) => (
                  <div key={x!.key} className="rounded-[9px] px-3 py-2" style={{ border: "1px solid var(--vault-rule)" }}>
                    <div className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>{x!.label}</div>
                    <div className="tabular" style={{ fontSize: 17, fontWeight: 700, color: "var(--vault-text)" }}>{x!.pct}</div>
                  </div>
                ));
              })()}
            </div>
            <p className="m-0" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>
              &ldquo;Goes the distance&rdquo; is the method head&rsquo;s decision probability, not a separate model — so it
              cannot disagree with the bar above it.
            </p>
          </div>
        </section>
      ) : null}

      {(bout.red.profile?.bouts || bout.blue.profile?.bouts) ? (
        <section className="mt-8">
          <SectionHeader eyebrow="The fighters" title="What the corpus knows about each of them"
            sub="Tracked bouts only — a fight outside the corpus is not counted, and a thin record says so." />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
            {[bout.red, bout.blue].map((f) => {
              const prof = f.profile;
              return (
                <div key={f.athleteId} style={{ ...PANEL }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--vault-text)" }}>{f.name}</div>
                    <div className="font-mono" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>{f.record ?? "—"}</div>
                  </div>
                  {prof?.bouts ? (
                    <div className="mt-2">
                      <UfcProfileLines profile={prof} size="full" />
                    </div>
                  ) : null}
                  {prof?.last5?.length ? (
                    <div className="mt-3">
                      <div className="font-mono uppercase tracking-[0.1em] mb-1.5" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>
                        Last {prof.last5.length} tracked
                      </div>
                      <div className="flex flex-col gap-1">
                        {prof.last5.map((b2) => (
                          <div key={`${b2.date}-${b2.opponent}`} className="font-mono flex items-center gap-2" style={{ fontSize: 11, color: "var(--vault-text-mute)" }}>
                            <span style={{ color: b2.result === "W" ? "var(--vault-success)" : "var(--vault-danger)", fontWeight: 700, width: 12 }}>{b2.result}</span>
                            <span className="truncate" style={{ flex: 1 }}>{b2.opponent}</span>
                            <span style={{ color: "var(--vault-text-faint)" }}>{METHOD_LABEL[b2.method] ?? b2.method} R{b2.round}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <SectionHeader eyebrow="Method" title="Where these numbers come from" />
        <div style={{ ...PANEL, display: "grid", gap: 10 }}>
          <p className="m-0" style={{ fontSize: 13, lineHeight: 1.65, color: "var(--vault-text-mute)" }}>
            Three separate heads — winner, method and round — each fitted on a corpus of tracked UFC fights and each
            tested on past fights it never trained on before it was published. This is an experimental model: winner
            forecasts are graded on every new card, method and round are not yet graded, and it has not been shown to
            have an edge over the market.
          </p>
          <div className="grid gap-1">
            <EvidenceRow label="Winner" e={card.model?.evidence?.winner} />
            <EvidenceRow label="Method" e={card.model?.evidence?.method} />
            <EvidenceRow label="Round" e={card.model?.evidence?.round} />
          </div>
          {card.generatedAt ? (
            <p className="m-0" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>Generated <EtTime iso={card.generatedAt} /></p>
          ) : null}
          {/* Overnight W8 (2026-10-28): the model fingerprint and the corpus's source and span are audit detail —
              RELOCATED, verbatim (dates as ISO keys, as recorded), into one collapsed "Technical details". */}
          <MoreDisclosure title="Technical details" summary="Model fingerprint and the fight corpus it was fitted on.">
            <div className="font-mono" style={{ fontSize: 11, color: "var(--vault-text-faint)", lineHeight: 1.7 }}>
              {card.model?.id ? <div>model {card.model.id}</div> : null}
              {card.model?.corpus?.fights ? (
                <div>
                  corpus {card.model.corpus.fights.toLocaleString("en-US")} fights
                  {card.model.corpus.from && card.model.corpus.to ? ` · ${card.model.corpus.from} to ${card.model.corpus.to}` : ""}
                  {card.model.corpus.source ? ` · ${card.model.corpus.source}` : ""}
                </div>
              ) : null}
            </div>
          </MoreDisclosure>
          <p className="m-0" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>
            Educational and paper-only — not betting advice.
          </p>
        </div>
      </section>

      {siblings.length ? (
        <section className="mt-8">
          <SectionHeader eyebrow="More" title="Other bouts on this card" />
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
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
        </section>
      ) : null}
    </div>
  );
}

const VOID_WORDS: Record<string, string> = { draw: "a draw", no_contest: "a no contest" };

/**
 * SETTLED MODE (Batch 1 · fix #3). A bout whose card has been and gone keeps its page: the winner read exactly as the
 * forecast ledger froze it before the card, beside the official result. Nothing here is recomputed — the method and
 * round reads were never frozen, so they are named as absent rather than re-derived.
 */
function SettledBout({ ctx }: { ctx: UfcSettledContext }) {
  const { bout: b, siblings } = ctx;
  const ufc = "var(--sport-ufc)";
  const f = b.finish;
  const finishWords = f
    ? [f.method ? (UFC_FINISH_LABEL[f.method] ?? f.method) : null, f.round != null ? `round ${f.round}` : null, f.time]
      .filter(Boolean).join(" · ")
    : null;
  const outcomeTag = b.state === "VOID" ? "VOID" : b.directionalResult === "WIN" ? "HIT" : b.directionalResult === "LOSS" ? "MISS" : null;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
      <div className="mb-3 flex flex-wrap gap-x-4">
        <Link href="/ufc/" className="inline-flex items-center -ml-1 px-1 py-2 font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 10, minHeight: 40 }}>
          ← Fight card
        </Link>
        <Link href="/results/picks/ufc/" className="inline-flex items-center px-1 py-2 font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 10, minHeight: 40 }}>
          Graded UFC record →
        </Link>
      </div>

      <header>
        <p className="font-mono uppercase tracking-[0.16em]" style={{ margin: 0, fontSize: 10, color: ufc }}>
          Settled{b.competition ? ` · ${b.competition}` : ""}
        </p>
        <h1 style={{ fontSize: "clamp(20px, 3.4vw, 30px)", fontWeight: 800, margin: "6px 0 0" }}>
          {b.matchup.split(" vs ")[0]} <span style={{ color: "var(--vault-text-faint)", fontWeight: 500 }}>vs</span> {b.matchup.split(" vs ").slice(1).join(" vs ")}
        </h1>
        {b.cardStartUtc ? (
          <p className="font-mono mt-2" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>
            Card started {ET(b.cardStartUtc)} ET{b.competition ? ` · ${b.competition}` : ""}
          </p>
        ) : null}
      </header>

      <section className="mt-6" data-ufc-settled-result="">
        <SectionHeader eyebrow="Official result" title="What happened"
          sub="From the official result record. Method and round are shown only where that record carries them and names the same outcome." />
        <div style={{ ...PANEL, display: "grid", gap: 8 }}>
          {b.state === "VOID" ? (
            <p className="m-0" style={{ fontSize: 15, lineHeight: 1.6 }}>
              <strong>No winner</strong>
              {f ? ` — ${VOID_WORDS[f.resultStatus] ?? "no winner"}` : ""}
              {finishWords ? ` (${finishWords})` : ""}. The pick is void: it is not scored, and it is not a miss.
            </p>
          ) : (
            <p className="m-0" style={{ fontSize: 15, lineHeight: 1.6 }}>
              <strong data-ufc-official-winner="">{b.winner}</strong> won
              {finishWords ? <> · <span data-ufc-official-finish="">{finishWords}</span></> : null}
            </p>
          )}
          {!f && b.state !== "VOID" ? (
            <p className="m-0" style={{ fontSize: 12, color: "var(--vault-text-faint)" }}>
              The official result record we hold does not carry the method and round for this bout, so none is shown.
            </p>
          ) : null}
          {outcomeTag && b.state !== "VOID" ? (
            <p className="m-0 font-mono" style={{ fontSize: 12, color: outcomeTag === "HIT" ? "var(--gtp-bank-heat)" : "var(--vault-text-mute)", letterSpacing: "0.04em" }}>
              {outcomeTag} — the model&rsquo;s pick, {b.pick}, {outcomeTag === "HIT" ? "won" : "lost"}.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-8" data-ufc-frozen-forecast="">
        <SectionHeader eyebrow="Before the fight" title="The forecast as published"
          sub="Frozen before the card started and never changed afterwards." />
        <div style={{ ...PANEL, display: "grid", gap: 8 }}>
          {b.pick && b.probability != null ? (
            <p className="m-0" style={{ fontSize: 15, lineHeight: 1.6 }}>
              Model pick: <strong>{b.pick}</strong> · <span className="tabular" data-ufc-frozen-probability="">{pct(b.probability)}</span>
            </p>
          ) : (
            <p className="m-0" style={{ fontSize: 14 }}>No winner read was recorded for this bout.</p>
          )}
          {b.publishedAt ? (
            <p className="m-0 font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>Recorded {ET(b.publishedAt)} ET</p>
          ) : null}
          {b.pick && b.marketProbability != null ? (
            <p className="m-0" style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
              At the same moment the betting market priced {b.pick} at {pct(b.marketProbability)}
              {b.marketProvider ? ` (${b.marketProvider}, margin removed)` : " (margin removed)"}.
            </p>
          ) : null}
          <p className="m-0" style={{ fontSize: 11.5, color: "var(--vault-text-faint)", lineHeight: 1.6 }}>
            Only the winner read was frozen. The method and round reads the card showed beside it were not recorded,
            so they are not reprinted here — re-running the model now would be a new forecast, not the one published.
          </p>
          <MoreDisclosure title="Technical details" summary="Which model and which pre-fight record this read comes from.">
            <div className="font-mono" style={{ fontSize: 11, color: "var(--vault-text-faint)", lineHeight: 1.7 }}>
              {b.modelId ? <div>model {b.modelId}</div> : null}
              {b.receiptId ? <div>pre-fight record {b.receiptId}</div> : null}
              <div>forecast {b.forecastId}</div>
              {b.settledAt ? <div>settled {b.settledAt}</div> : null}
            </div>
          </MoreDisclosure>
          <p className="m-0" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>
            Educational and paper-only — not betting advice.
          </p>
        </div>
      </section>

      {siblings.length ? (
        <section className="mt-8">
          <SectionHeader eyebrow="More" title="Other bouts on this card" />
          <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {siblings.map((s) => (
              <li key={s.boutId}>
                <Link href={`/ufc/bout/${s.boutId}/`}
                  style={{ display: "block", border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px", textDecoration: "none", color: "inherit" }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{s.matchup}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--vault-text-mute)", marginTop: 2 }}>
                    {s.pick && s.probability != null ? `${s.pick} ${pct(s.probability)}` : "no read"}
                    {s.state === "VOID" ? " · void" : s.directionalResult === "WIN" ? " · hit" : s.directionalResult === "LOSS" ? " · miss" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
