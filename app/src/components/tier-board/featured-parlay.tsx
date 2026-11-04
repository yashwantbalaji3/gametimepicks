import Link from "next/link";
import StateBadge from "@/components/tier-board/state-badge";
import { AddToSlip } from "@/components/products/level-a-slip";
import { slipLegOf } from "@/lib/products/level-a/slip-legs.mjs";
import { etStamp } from "@/lib/et-stamp.mjs";

/* THE FEATURED PARLAY (Founder Priority 4). Server component; renders a tier-board card view (tier-board/view.mjs) and
   computes nothing. Every leg opens (<details>) to its identification, MODEL PROJECTION, eligibility, availability and
   links. A price appears only when the view says pricing is authorized; otherwise the card says, once, that it is
   model-only. Adding to the Smart Betslip uses the existing model-only slip (level-a-slip). */

type LegView = {
  key: string; sport: string; sportLabel: string; title: string;
  subject: { kind: "team" | "player"; name: string | null; team: string | null };
  market: string | null;
  game: { id: string | null; label: string | null; startUtc: string | null; href: string | null };
  playerHref: string | null;
  players: Array<{ name: string; points: number | null; guard: string | null; href: string | null }>;
  projection: { label: string; text: string | null; value: number | null } | null;
  eligibility: { state: string; text: string; flags: string[] };
  availability: { state: string; text: string };
  frozenAt: string | null;
  price: { american: number; bookmaker: string; capturedAt: string } | null;
  source: Record<string, unknown>;
};
export type CardView = {
  id: string | null; origin: string; state: string; tier: string | null; tierLabel: string | null; joint: string | null;
  legs: LegView[]; why: string[]; risks: string[]; disclosure: string | null;
  pricing: { authorized: boolean; text: string; combined?: { american: number } | null };
};

const am = (a: number) => (a > 0 ? `+${a}` : `${a}`);
const ELIG_GLYPH: Record<string, string> = { pass: "✓", review: "!", blocked: "✕" };

function slipKey(l: LegView): string | null {
  try {
    return (l.source as { selection?: unknown }).selection ? slipLegOf(l.source).key : null;
  } catch {
    return null;
  }
}

function Leg({ l, n }: { l: LegView; n: number }) {
  const key = slipKey(l);
  return (
    <li className="tb-leg" data-leg={l.key}>
      <details>
        <summary className="tb-leg-summary">
          <span className="tb-leg-num" aria-hidden>{n}</span>
          <span className="tb-leg-main">
            <span className="tb-leg-title">{l.title}</span>
            <span className="tb-leg-meta">{l.sportLabel}{l.game.label ? ` · ${l.game.label}` : ""}{l.game.startUtc ? ` · ${etStamp(l.game.startUtc) ?? l.game.startUtc}` : ""}</span>
          </span>
          {l.projection?.text ? (
            <span className="tb-leg-proj">
              <span className="tb-proj-label">{l.projection.label}</span>
              <span className="tb-proj-value">{l.projection.text}</span>
            </span>
          ) : null}
          <span className="tb-leg-chevron" aria-hidden>▾</span>
        </summary>
        <div className="tb-leg-body">
          <dl className="tb-leg-facts">
            <div><dt>{l.subject.kind === "player" ? "Player" : "Team"}</dt><dd>{l.subject.name ?? "—"}{l.subject.team ? ` (${l.subject.team})` : ""}</dd></div>
            <div><dt>{l.projection?.label ?? "MODEL PROJECTION"}</dt><dd>{l.projection?.text ?? "No published projection"}</dd></div>
            <div><dt>Eligibility</dt><dd data-eligibility={l.eligibility.state}><span aria-hidden>{ELIG_GLYPH[l.eligibility.state] ?? "!"} </span>{l.eligibility.text}{l.eligibility.flags.length ? ` · ${l.eligibility.flags.join(", ")}` : ""}</dd></div>
            <div><dt>Availability</dt><dd>{l.availability.text}</dd></div>
            <div><dt>Price</dt><dd>{l.price ? `${am(l.price.american)} at ${l.price.bookmaker} (quoted ${etStamp(l.price.capturedAt) ?? l.price.capturedAt})` : "Not priced · model only"}</dd></div>
            {l.frozenAt ? <div><dt>Forecast frozen</dt><dd>{etStamp(l.frozenAt) ?? l.frozenAt}</dd></div> : null}
          </dl>
          {l.players.length ? (
            <div className="tb-leg-players">
              <p className="tb-proj-label m-0">Key players · MODEL PROJECTION (median points)</p>
              <ul className="tb-player-list">
                {l.players.map((p) => (
                  <li key={p.name}>
                    {p.href ? <Link className="tb-link" href={p.href} data-leg-player-link="">{p.name}</Link> : <span>{p.name}</span>}
                    <span className="tb-player-proj">{p.points != null ? `${p.points.toFixed(1)} pts` : "no projection"}{p.guard && p.guard !== "pass" ? ` · ${p.guard === "blocked" ? "withheld from cards" : "under review"}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="tb-leg-links">
            {l.playerHref && !l.players.length ? <Link className="tb-link" href={l.playerHref} data-leg-player-link="">Player page →</Link> : null}
            {l.game.href ? <Link className="tb-link" href={l.game.href} data-leg-game-link="">Game page →</Link> : null}
            {key ? <AddToSlip keys={[key]} name={`${l.title}${l.game.label ? `, ${l.game.label}` : ""}`} /> : null}
          </div>
        </div>
      </details>
    </li>
  );
}

export default function FeaturedParlay({ card, product }: { card: CardView; product: "bank-builder" | "moonshot" }) {
  const keys = card.legs.map(slipKey).filter((k): k is string => Boolean(k));
  return (
    <article className={`tb-card ${product === "moonshot" ? "tb-card--moonshot" : "tb-card--bank"}`} aria-labelledby="tb-featured-title" data-featured-card={card.id ?? card.origin}>
      <header className="tb-card-head">
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={card.state} size="sm" />
          {card.tier ? <span className={`tb-tier-chip tb-band--${card.tier}`}>{card.tierLabel}</span> : null}
          <span className="tb-leg-count">{card.legs.length} legs</span>
        </div>
        <h3 id="tb-featured-title" className="tb-card-title">Today&rsquo;s featured {product === "moonshot" ? "Moonshot" : "Bank Builder"}</h3>
        {card.joint ? (
          <p className="tb-joint">
            <span className="tb-proj-label">MODEL PROJECTION</span>
            <span className="tb-joint-value">{card.joint}</span>
            <span className="tb-joint-sub">chance every leg wins</span>
          </p>
        ) : null}
      </header>

      <ol className="tb-legs" aria-label="Legs — open one for detail">
        {card.legs.map((l, i) => <Leg key={l.key} l={l} n={i + 1} />)}
      </ol>

      <div className="tb-why-grid">
        <section aria-label="Why it qualifies">
          <h4 className="tb-subhead">Why this combination</h4>
          <ul className="tb-bullets">{card.why.map((w) => <li key={w}>{w}</li>)}</ul>
        </section>
        <section aria-label="Risks">
          <h4 className="tb-subhead">Risks</h4>
          <ul className="tb-bullets tb-bullets--risk">{card.risks.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
      </div>

      <footer className="tb-card-foot">
        {card.disclosure ? <p className="tb-pricing" data-card-disclosure="">{card.disclosure}</p> : null}
        <p className="tb-pricing" data-pricing-authorized={card.pricing.authorized ? "true" : "false"}>
          {card.pricing.authorized && card.pricing.combined ? `Combined ${am(card.pricing.combined.american)}. ` : ""}{card.pricing.text}
        </p>
        <div className="tb-card-actions">
          {keys.length ? <AddToSlip keys={keys} label="Add card to Smart Betslip" name={`Featured ${product === "moonshot" ? "Moonshot" : "Bank Builder"} (${keys.length} legs)`} /> : null}
          <Link className="tb-btn" href="/build/#level-a-parlay-lab">Open in Parlay Lab</Link>
        </div>
      </footer>
    </article>
  );
}
