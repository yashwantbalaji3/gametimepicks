/**
 * UFC PRESENTATION ADAPTER — Program 234 · Release C.
 *
 * A UFC event is a CARD, not a fixture, so the presentation is a card walkthrough: the bouts the
 * model could read, then the main event in depth, then the bouts it refused and why.
 *
 * THE CHARTER SAID WINNER-ONLY. THE ARTIFACT DISAGREES, so the artifact wins. `card-latest.json`
 * publishes `winner`, `method` and `rounds`; all three carry a PASS verdict and held-out evidence
 * over 3,557 fights. Method and round chapters are therefore supported and are shown — but only
 * because they were checked, and only for bouts that carry them. Nothing here animates a fight:
 * there is no sequence model, so there is no sequence.
 *
 * NO PRICE, AND THE ARTIFACT SAYS SO ITSELF. The odds authorisation does not cover UFC, so the win
 * probability stands alone with no market beside it. That sentence is carried from the artifact
 * rather than written here, so it cannot drift from the authorisation it describes.
 */
/* The canonical artifact type, not a second copy of it — two copies had already disagreed about
   whether `venue` may be null. */
import type { UfcCardArtifact } from "@/components/sports/ufc-card";
import type { ChapterKind, PresentationChapter, PresentationManifest, PresentationResult } from "./types";

const HOLD = { light: 4200, normal: 5200, dense: 6400 } as const;
const pctOf = (n: number) => Math.round(n * 100);

const METHOD_LABEL: Record<string, string> = { ko: "KO / TKO", submission: "Submission", decision: "Decision" };
const ROUND_LABEL: Record<string, string> = { round1: "Round 1", round2: "Round 2", round3plus: "Round 3+" };

export function buildUfcPresentation(card: UfcCardArtifact | null | undefined): PresentationResult {
  const reportHref = "/ufc/";
  const eventId = `ufc:${card?.event?.providerEventId ?? card?.event?.name ?? "card"}`;
  const refuse = (reason: string): PresentationResult =>
    ({ schema: 1, sport: "ufc", eventId, unavailable: true, reason, reportHref });

  if (!card?.event) return refuse("No UFC card artifact is published for this date.");
  const bouts = card.bouts ?? [];
  const read = bouts.filter((b) => Number.isFinite(b.prediction?.winner?.probability));
  if (!read.length) {
    return refuse("No bout on this card has enough fighter history to model, so the card is listed without a read.");
  }

  const eventName = card.event.name ?? "UFC card";
  const main = read[0];
  const chapters: PresentationChapter[] = [];

  chapters.push({
    id: "event", kind: "event",
    title: eventName,
    line: `${bouts.length} bouts${card.event.venue ? ` at ${card.event.venue}` : ""}. The model read ${read.length} of them.`,
    stats: [], bars: [], rows: [], holdMs: HOLD.light,
  });

  /* ── the card. Every bout the model read, favourite first, with its own probability. ── */
  chapters.push({
    id: "players", kind: "players",
    title: "The card",
    line: `${read.length} bouts carry a modelled read. The closer a number sits to 50%, the less the model is claiming.`,
    stats: [], bars: [],
    rows: read.slice(0, 6).map((b) => ({
      label: b.prediction!.winner!.name ?? "—",
      detail: `${b.red?.name ?? "?"} v ${b.blue?.name ?? "?"}${b.weightClass ? ` · ${b.weightClass}` : ""}`,
      value: `${pctOf(b.prediction!.winner!.probability as number)}%`,
    })),
    holdMs: HOLD.dense,
  });

  /* ── the main event: winner ── */
  const mw = main.prediction!.winner!;
  const byFighter = Object.entries(mw.byFighter ?? {});
  chapters.push({
    id: "outcome", kind: "outcome",
    title: main.titleFight ? "Main event · title fight" : "Main event",
    line: `${mw.name} is the model's side at ${pctOf(mw.probability as number)}% — ${(mw.probability as number) < 0.55 ? "close to a coin flip" : "a clear but not decisive read"}.`,
    stats: byFighter.map(([name, p]) => ({ label: name, value: p, format: "probability" as const })),
    bars: byFighter.map(([name, p]) => ({ label: name, p, highlight: name === mw.name })),
    rows: [], holdMs: HOLD.normal,
  });

  /* ── method, ONLY because the model publishes and passes it ── */
  const method = main.prediction?.method;
  const methodPasses = card.model?.verdicts?.method === "PASS" && card.model?.publishes?.includes("method");
  if (method?.probabilities && methodPasses) {
    chapters.push({
      id: "distribution", kind: "distribution",
      title: "How it ends",
      line: `The model's most likely finish is ${METHOD_LABEL[String(method.most).toLowerCase()] ?? method.most}.`,
      stats: [],
      axisCaption: "Finish type · model probability",
      bars: Object.entries(method.probabilities).map(([k, p]) => ({
        label: METHOD_LABEL[k] ?? k, p, highlight: k === String(method.most).toLowerCase(),
      })),
      rows: [], holdMs: HOLD.normal,
    });
  }

  /* ── rounds, on the same condition ── */
  const rounds = main.prediction?.rounds;
  const roundPasses = card.model?.verdicts?.round === "PASS" && card.model?.publishes?.includes("rounds");
  if (rounds?.probabilities && roundPasses) {
    chapters.push({
      id: "margin", kind: "margin",
      title: "How long it lasts",
      line: Number.isFinite(rounds.goesTheDistance)
        ? `It goes the distance in ${pctOf(rounds.goesTheDistance as number)}% of reads.`
        : `The model's most likely ending is ${rounds.endsIn}.`,
      stats: Number.isFinite(rounds.goesTheDistance)
        ? [{ label: "Goes the distance", value: rounds.goesTheDistance as number, format: "probability" as const }]
        : [],
      bars: Object.entries(rounds.probabilities).map(([k, p]) => ({
        label: ROUND_LABEL[k] ?? k, p, highlight: k.includes(String(rounds.endsIn ?? "").replace("+", "plus")),
      })),
      rows: [], holdMs: HOLD.normal,
    });
  }

  /* ── the refusals and the caveats ── */
  const limits: { label: string; detail: string }[] = [];
  const unread = bouts.filter((b) => !Number.isFinite(b.prediction?.winner?.probability));
  if (unread.length) {
    limits.push({
      label: `${unread.length} bout${unread.length === 1 ? "" : "s"} unread`,
      detail: unread[0].unmodelledReason ?? "Not enough fighter history in the corpus to model these bouts.",
    });
  }
  const weak = read.filter((b) => b.prediction?.basisNote);
  if (weak.length) limits.push({ label: "Weaker basis", detail: weak[0].prediction!.basisNote as string });
  /*
   * THE ARTIFACT'S OWN `notModelled.moneyline` IS NOT CARRIED, and this is the one place in these
   * adapters where a source sentence is deliberately not repeated. It reads "our authorisation to
   * buy odds covers NFL only, so there is no captured UFC line to show" — which expired. A UFC odds
   * receipt of its own exists, posted fight-winner prices appear on /ufc's paper cards, and the
   * model has been scored against the de-vigged line bout by bout since 2026-08-22. /ufc already
   * carries a long comment about having once printed that same expired sentence directly above the
   * prices it denied.
   *
   * Repeating it inside a presentation would reintroduce the contradiction in a more persuasive
   * form. What IS true is narrower and is what gets said: this frame shows the model's own
   * probability with no market beside it. Where the comparison lives is stated rather than implied.
   */
  limits.push({
    label: "No market here",
    detail: "This frame shows the model's own probability with no price beside it. The posted fight-winner prices, and how the model has scored against the de-vigged line, are on the UFC page.",
  });
  const ev = card.model?.evidence?.winner;
  if (ev && Number.isFinite(ev.accuracy) && Number.isFinite(ev.n)) {
    limits.push({
      label: "Held-out record",
      detail: `Winner calls were right ${pctOf(ev.accuracy as number)}% of the time on ${(ev.n as number).toLocaleString()} fights the model never trained on, against a ${pctOf(ev.baselineAccuracy ?? 0.5)}% coin flip.`,
    });
  }
  chapters.push({
    id: "limits", kind: "limits",
    title: "What this does not know",
    line: "A fight read is a probability, not a prediction of what will happen.",
    stats: [], bars: [], rows: limits.slice(0, 5), holdMs: HOLD.dense,
  });

  chapters.push({
    id: "closing", kind: "closing",
    title: eventName,
    line: "No sequence of the fight is simulated and none is shown — the model publishes probabilities for the winner, the method and the round, and nothing beyond them.",
    stats: [], bars: [],
    rows: card.model?.id ? [{ label: "Model", detail: card.model.id }] : [],
    holdMs: HOLD.normal,
  });

  const manifest: PresentationManifest = {
    schema: 1, sport: "ufc", eventId,
    slug: card.event.providerEventId ?? eventId,
    title: eventName,
    displayDate: card.event.slateDate ?? (card.event.startUtc ?? "").slice(0, 10),
    startUtc: card.event.startUtc ?? null,
    venue: card.event.venue ?? null,
    home: { name: main.blue?.name ?? "Blue", abbr: main.blue?.name ?? "Blue", logo: main.blue?.photoUrl ?? null },
    away: { name: main.red?.name ?? "Red", abbr: main.red?.name ?? "Red", logo: main.red?.photoUrl ?? null },
    /*
     * Degraded describes THE READ BEING PRESENTED, not the card's coverage. A card where the model
     * skipped three undercard bouts but read the main event cleanly is not a degraded read — the
     * skipped bouts have their own row in the limits chapter, which is where a coverage fact
     * belongs. What does degrade this presentation is the main event resting on priors, which is
     * exactly what `basis` records.
     */
    readiness: main.prediction?.basisNote ? "degraded" : "ready",
    provenance: {
      artifactHash: null, modelVersion: card.model?.id ?? null, simulationVersion: null,
      /* The fight model is not a trial-based simulator; there is no run count to claim. */
      runCount: null,
      generatedAt: card.generatedAt ?? null, marketCapturedAt: null, bookmaker: null,
    },
    supportedChapters: chapters.map((c) => c.kind) as ChapterKind[],
    chapters,
    reportHref,
  };
  return manifest;
}
