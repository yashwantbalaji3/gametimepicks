import Link from "next/link";
import LevelACopy from "@/components/products/level-a-copy";
import { cardCopyText, jointShownFor, LEG_REFUSAL } from "@/lib/products/level-a/suggestions.mjs";
import { etStamp } from "@/lib/et-stamp.mjs";

/* LEVEL A · MODEL SUGGESTIONS (founder policy 2026-10-23). Server component; renders what level-a/model.mjs decided
   and computes nothing. Non-transactional: no price, no odds, no payout, no sportsbook link — ever. */

type Leg = {
  sport: string; eventId: string; eventLabel: string; startUtc: string; market: string;
  selection: { code: string; label: string }; probability: number | null; probabilityNote: string | null;
  forecast: { owner: string; modelId: string | null; stampedAt: string; ref: string | null };
  uncertainty: { kind: string; home?: number | null; draw?: number | null; away?: number | null; note?: string } | null;
  settlement: { grader: string; market: string; side: string };
};
type Card = { policy: string; tier: string | null; tierLabel: string | null; legs: Leg[]; sports: string[]; jointProbability: number; method: string; dependency: string; whySelected: string; label: string };
type Slot = { card: Card | null; reason: string | null };
type Projection = { eventLabel: string; name: string; team: string; availability: string | null; points: { median: number | null }; frozenAt: string };
export type LevelAModel = {
  productDay: string; label: string; method: string; legs: Leg[]; untiered: Leg[];
  refusedByReason: Record<string, number>;
  parlayLab: Array<Slot & { tier: string; tierLabel: string }>;
  bankBuilder: Slot; moonshot: Slot; nbaProjections: Projection[];
};

const SPORT: Record<string, string> = { mlb: "MLB", nba: "NBA", epl: "Premier League", "ligue-1": "Ligue 1", nfl: "NFL", ufc: "UFC" };
const pct = (p: number | null) => (p == null ? null : `${(p * 100).toFixed(1)}%`);
const one = (n: number | null) => (n == null ? "—" : n.toFixed(1));

function LegRow({ l }: { l: Leg }) {
  return (
    <li className="flex flex-col gap-0.5 text-[12.5px]" style={{ borderTop: "1px solid var(--vault-border)", paddingTop: 6 }}>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{l.selection.label}</span>
        <span style={{ color: "var(--vault-text-mute)" }}>{l.probability != null ? `Official Forecast ${pct(l.probability)}` : "probability not published"}</span>
      </span>
      <span style={{ color: "var(--vault-text-mute)" }}>
        {SPORT[l.sport] ?? l.sport} · {l.eventLabel} · starts {etStamp(l.startUtc) ?? l.startUtc}
        {l.uncertainty?.kind === "1x2" ? ` · home ${pct(l.uncertainty.home ?? null)} / draw ${pct(l.uncertainty.draw ?? null)} / away ${pct(l.uncertainty.away ?? null)}` : ""}
      </span>
      <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>
        Source: {l.forecast.owner}{l.forecast.modelId ? ` (${l.forecast.modelId})` : ""} · frozen {etStamp(l.forecast.stampedAt) ?? l.forecast.stampedAt} · no sportsbook price · settles on the official final
      </span>
      {l.probabilityNote ? <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>{l.probabilityNote}</span> : null}
    </li>
  );
}

function CardBox({ title, slot }: { title: string; slot: Slot }) {
  const c = slot.card;
  return (
    <article className="flex flex-col gap-2 rounded-[10px] px-4 py-3" style={{ border: "1px solid var(--vault-border)" }} aria-label={title}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 font-semibold" style={{ color: "var(--vault-text)", fontSize: 14 }}>{title}</h3>
        {c ? <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>{c.tierLabel} · model joint probability {jointShownFor(c.jointProbability, c.tier)}</span> : null}
      </header>
      {c ? (
        <>
          <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{c.legs.length} legs from {c.sports.map((s) => SPORT[s] ?? s).join(", ")}. {c.whySelected}</p>
          <ul className="m-0 flex flex-col gap-1 p-0" role="list">{c.legs.map((l) => <LegRow key={`${l.sport}:${l.eventId}`} l={l} />)}</ul>
          <p className="m-0 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>{c.dependency} Unpriced: no sportsbook price, so no payout is shown.</p>
          <LevelACopy text={cardCopyText(c)} />
        </>
      ) : (
        <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>No suggestion: {slot.reason}.</p>
      )}
    </article>
  );
}

/**
 * @param mode  "parlay-lab" shows the four tiers; "bank-builder" / "moonshot" show that product's own Level A policy.
 */
export default function LevelASuggestions({ model, mode }: { model: LevelAModel | null; mode: "parlay-lab" | "bank-builder" | "moonshot" }) {
  if (!model) return null;
  const refused = Object.entries(model.refusedByReason);
  return (
    <section aria-labelledby={`level-a-${mode}`} className="flex flex-col gap-3 rounded-xl px-4 py-4" style={{ border: "1px solid var(--vault-border-strong)", background: "var(--vault-panel)" }}>
      <div>
        <h2 id={`level-a-${mode}`} className="m-0 font-semibold" style={{ color: "var(--vault-text)", fontSize: 16 }}>Model suggestions · {model.productDay}</h2>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--vault-text-mute)", maxWidth: "72ch" }}>
          {model.label} Each leg is the Official Forecast&rsquo;s own pick, frozen before its game. Its accuracy over a large forward sample
          is not yet established. {model.method}
        </p>
      </div>
      {mode === "parlay-lab" ? (
        <div className="grid gap-3 lg:grid-cols-2">{model.parlayLab.map((t) => <CardBox key={t.tier} title={t.tierLabel} slot={t} />)}</div>
      ) : mode === "bank-builder" ? (
        <CardBox title="Bank Builder suggestion · 2 legs, Low or Medium band, highest joint probability" slot={model.bankBuilder} />
      ) : (
        <CardBox title="Moonshot suggestion · 3 legs, High or Longshot band, highest joint probability" slot={model.moonshot} />
      )}
      {model.untiered.length ? (
        <div className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
          <p className="m-0 font-semibold" style={{ color: "var(--vault-text)" }}>Official sides that are not tiered</p>
          <ul className="m-0 mt-1 flex flex-col gap-1 p-0" role="list">{model.untiered.map((l) => <LegRow key={`${l.sport}:${l.eventId}`} l={l} />)}</ul>
        </div>
      ) : null}
      {model.nbaProjections.length ? (
        <details className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
          <summary className="cursor-pointer" style={{ minHeight: 40, color: "var(--vault-text)" }}>Predicted Player Statistics · NBA median points (no market line, so not a pick)</summary>
          <ul className="m-0 mt-1 grid gap-1 p-0 sm:grid-cols-2" role="list">
            {model.nbaProjections.map((p) => (
              <li key={`${p.eventLabel}:${p.name}`} className="flex flex-wrap justify-between gap-x-3">
                <span style={{ color: "var(--vault-text)" }}>{p.name} ({p.team})</span>
                <span>median {one(p.points.median)} points{p.availability && p.availability !== "active" ? ` · ${p.availability}` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {refused.length ? (
        <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
          Unavailable today: {refused.map(([code, n]) => `${n} × ${LEG_REFUSAL[code as keyof typeof LEG_REFUSAL] ?? code}`).join(" ")}
        </p>
      ) : null}
      <p className="m-0 text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        Every suggestion is recorded and graded forward in its own record, separate from the priced paper record.{" "}
        <Link href="/methodology" style={{ color: "var(--vault-text-mute)" }}>How suggestions are chosen →</Link>{" "}
        <a href="/data/level-a/v1/model.json" style={{ color: "var(--vault-text-mute)" }}>These suggestions as data</a>
      </p>
    </section>
  );
}
