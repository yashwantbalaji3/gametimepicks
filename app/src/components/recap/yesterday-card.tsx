/**
 * "HOW YESTERDAY WENT" (P251) — the record, where a reader already is.
 *
 * Everything here settles overnight from official box scores, and that is the most credible thing
 * this product has. It lived only on /results. This puts it on the two pages people actually open,
 * so the daily loop closes: come for a forecast, learn whether it landed.
 *
 * It states the day plainly and does not soften a losing one. Three cards published and three
 * missed is the sentence, because that is what happened — a recap that only appears after a good
 * day is not a record, it is marketing.
 */
import Link from "next/link";

import type { buildYesterdayRecap } from "@/lib/recap/yesterday.mjs";

type Recap = NonNullable<ReturnType<typeof buildYesterdayRecap>>;

const ET_DAY = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })
    .format(new Date(`${iso}T12:00:00Z`));

export default function YesterdayCard({ recap }: { recap: Recap | null }) {
  if (!recap) return null;
  const { cards, model } = recap;
  const cardLine = cards.published === 0
    ? "No card was published."
    : `${cards.published} card${cards.published === 1 ? "" : "s"} published · ${cards.hit} hit, ${cards.missed} missed`;
  const rate = model && model.decisive > 0 ? (model.wins / model.decisive) * 100 : null;

  return (
    <section aria-labelledby="yesterday" className="reveal" style={{ marginTop: 18 }}>
      <div
        style={{
          border: "1px solid var(--vault-rule)", borderRadius: 12, padding: "14px 16px",
          background: "var(--vault-panel)", display: "flex", flexWrap: "wrap",
          alignItems: "baseline", gap: "6px 22px",
        }}
      >
        <h2
          id="yesterday"
          className="font-mono uppercase tracking-[0.16em]"
          style={{ fontSize: 10, color: "var(--vault-gold)", margin: 0, fontWeight: 400, flexBasis: "100%" }}
        >
          How {ET_DAY(recap.date)} went
        </h2>

        <span style={{ fontSize: 13.5, color: "var(--vault-text)" }}>{cardLine}</span>

        {model ? (
          <span style={{ fontSize: 13.5, color: "var(--vault-text-mute)" }}>
            <strong style={{ color: "var(--vault-text)" }}>{`${rate!.toFixed(1)}%`}</strong>{` of ${model.decisive.toLocaleString()} decisive projections cleared · ${model.games} MLB games`}
          </span>
        ) : null}

        <Link href="/results/" className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10, color: "var(--vault-gold-bright)", marginLeft: "auto" }}>
          Every settled row →
        </Link>

        {/*
          The two figures answer different questions and are never added together: a CARD is a whole
          slip that wins only if every leg does, and a model projection is one row graded on its own.
          Folding them into a single "record" is the arithmetic this site refuses everywhere else.
        */}
        {/* Short on purpose: the homepage's copy ratchet is a real budget, and the claim only needs
            one sentence. A card wins only if every leg does; a projection is graded alone. */}
        <p className="m-0" style={{ flexBasis: "100%", fontSize: 11, color: "var(--vault-text-faint)", lineHeight: 1.6 }}>
          {`Never combined: a card needs every leg, a projection is graded alone. Official box scores${recap.sameDay ? "" : ` · model figures from ${recap.model?.date}`}.`}
        </p>
      </div>
    </section>
  );
}
