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
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Histogram, ProbabilityBar } from "@/components/distribution-chart";
import HeadToHead from "@/components/ui/head-to-head";
import SectionHeader from "@/components/section-header";
import { findUfcBout, ufcBoutIds, boutPositionLabel } from "@/lib/sports/ufc/bout";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

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

/** One head's held-out evidence, printed with its denominator — an accuracy without n is a number without a claim. */
function EvidenceRow({ label, e }: { label: string; e?: { accuracy?: number; baselineAccuracy?: number; logLoss?: number; baselineLogLoss?: number; n?: number } | null }) {
  if (!e || e.accuracy == null || e.n == null) return null;
  return (
    <div className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)", lineHeight: 1.7 }}>
      <strong style={{ color: "var(--vault-text)" }}>{label}</strong>{" "}
      {pct(e.accuracy)} accurate over {e.n.toLocaleString()} held-out fights
      {e.baselineAccuracy != null ? ` · baseline ${pct(e.baselineAccuracy)}` : ""}
      {e.logLoss != null && e.baselineLogLoss != null
        ? ` · log loss ${e.logLoss.toFixed(4)} against ${e.baselineLogLoss.toFixed(4)}`
        : ""}
    </div>
  );
}

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
      </header>

      {/*
        ── What this read rests on, ABOVE the first number ─────────────────────────────────────
        The artifact types the BASIS of every bout — both fighters known, one debut, or refused —
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
              sub: p.method && p.rounds
                ? `${METHOD_LABEL[p.method.most] ?? p.method.most} · ${p.rounds.endsIn === "3+" ? "round 3 or later" : `round ${p.rounds.endsIn}`}`
                : undefined,
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
              {[["Round 1", p.rounds.probabilities.round1], ["Round 2", p.rounds.probabilities.round2],
                ["Round 3 or later", p.rounds.probabilities.round3plus], ["Goes the distance", p.rounds.goesTheDistance]].map(([l, v]) => (
                <div key={String(l)} className="rounded-[9px] px-3 py-2" style={{ border: "1px solid var(--vault-rule)" }}>
                  <div className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>{l}</div>
                  <div className="tabular" style={{ fontSize: 17, fontWeight: 700, color: "var(--vault-text)" }}>{pct(v as number)}</div>
                </div>
              ))}
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
                  {prof?.summary ? (
                    <p className="m-0 mt-2" style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>{prof.summary}</p>
                  ) : null}
                  {prof?.strengths?.length ? (
                    <div className="mt-2 flex flex-col gap-1">
                      {prof.strengths.map((x) => <div key={x} style={{ fontSize: 12, color: "var(--vault-success)" }}>+ {x}</div>)}
                      {prof.weaknesses.map((x) => <div key={x} style={{ fontSize: 12, color: "var(--vault-text-faint)" }}>− {x}</div>)}
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
            published only on its own PASS verdict against a bar frozen before it was fitted. This is the one model on
            the site that beat its baseline on every head it was tested on.
          </p>
          <div className="grid gap-1">
            <EvidenceRow label="Winner" e={card.model?.evidence?.winner} />
            <EvidenceRow label="Method" e={card.model?.evidence?.method} />
            <EvidenceRow label="Round" e={card.model?.evidence?.round} />
          </div>
          <div className="font-mono" style={{ fontSize: 11, color: "var(--vault-text-faint)", lineHeight: 1.7 }}>
            {card.model?.id ? <div>model {card.model.id}</div> : null}
            {card.model?.corpus?.fights ? (
              <div>
                corpus {card.model.corpus.fights.toLocaleString()} fights
                {card.model.corpus.from && card.model.corpus.to ? ` · ${card.model.corpus.from} to ${card.model.corpus.to}` : ""}
                {card.model.corpus.source ? ` · ${card.model.corpus.source}` : ""}
              </div>
            ) : null}
            {card.generatedAt ? <div>generated {card.generatedAt}</div> : null}
          </div>
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
