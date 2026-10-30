/**
 * Today's priced Bank Builder / Moonshot candidate, or the precise reason there is none (P0-E, 2026-10-30).
 *
 * Presentation only: every figure is the engine's (lib/products/daily-candidates/engine.mjs). It renders inside its own
 * <section data-daily-candidate> so the page's historical record sections are untouched (the byte-identity test strips
 * exactly this section and compares the rest of the page with the section switched off).
 *
 * A qualifying candidate shows its legs only when DAILY_CANDIDATE_SWITCH.candidateCardsPublic is true (committed false,
 * the founder flips it); otherwise it says a candidate was drafted for founder review. Odds are shown only as verified
 * leg prices; the combined figure carries its pricing label; the stake is a hypothetical example. Nothing here says or
 * implies that a bet was placed.
 */
import { DAILY_CANDIDATE_SWITCH } from "@/lib/products/daily-candidates/policy.mjs";
import { REASON_COPY } from "@/lib/products/daily-candidates/engine.mjs";

type Requirement = { key: string; text: string; pass: boolean; detail: string | null };
type LegTypeRow = { label: string; considered: number; eligible: number; failureCounts: Record<string, number>; requirements: Requirement[] };
type CardLeg = { legId: string; selection: string | null; eventLabel: string | null; american: number; bookmaker: string; capturedAt: string; line: number | null; side: string; probability: number | null };
export type DailyCandidateModel = {
  product: string;
  productLabel: string;
  productDay: string;
  asOf: string;
  status: "CANDIDATE" | "NO_CANDIDATE";
  bandText: string;
  cardReasons: string[];
  legTypes: Record<string, LegTypeRow>;
  card: null | {
    legs: CardLeg[];
    combined: { decimal: number; american: number } | null;
    example: { stake: number; grossPayout: number; netProfit: number } | null;
    pricing: { kind: string; executable: boolean; label: string };
    jointProbability: { value: number; basis: string } | null;
  };
};

const am = (a: number) => (a > 0 ? `+${a}` : `${a}`);
const usd = (n: number) => `$${n.toFixed(2)}`;
const copy = (code: string) => (REASON_COPY as Record<string, string>)[code] ?? code;

export default function DailyCandidatePanel({ model, publicCards = DAILY_CANDIDATE_SWITCH.candidateCardsPublic }: { model: DailyCandidateModel; publicCards?: boolean }) {
  const box = { background: "var(--vault-wash-faint)", border: "1px dashed var(--vault-border)" } as const;
  return (
    <section data-daily-candidate={model.product} aria-label={`Today's ${model.productLabel} priced candidate`} className="mt-5 rounded-[12px] px-4 py-4" style={box}>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        Priced candidate · NBA and NFL · {model.productDay}
      </span>
      {model.status === "CANDIDATE" && model.card ? (
        publicCards ? (
          <div className="mt-2">
            <p className="m-0 font-semibold" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>Today&rsquo;s {model.productLabel} candidate (not a placed bet)</p>
            <ul className="m-0 mt-2 flex flex-col gap-1 pl-4">
              {model.card.legs.map((l) => (
                <li key={l.legId} style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
                  {l.selection} · {l.eventLabel} · {am(l.american)} at {l.bookmaker} (quoted {l.capturedAt})
                </li>
              ))}
            </ul>
            {model.card.combined && model.card.example ? (
              <p className="m-0 mt-2" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
                Combined {am(model.card.combined.american)}. Example only: a hypothetical {usd(model.card.example.stake)} stake would return {usd(model.card.example.grossPayout)} ({usd(model.card.example.netProfit)} profit) if every leg won.
              </p>
            ) : null}
            <p className="m-0 mt-1" style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>{model.card.pricing.label}</p>
            {model.card.jointProbability ? (
              <p className="m-0 mt-1" style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>
                Model chance all legs win: {(model.card.jointProbability.value * 100).toFixed(1)}%. {model.card.jointProbability.basis}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="m-0 mt-2" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
            A candidate qualified and is drafted for founder review. It is not published yet.
          </p>
        )
      ) : (
        <div className="mt-2">
          <p className="m-0 font-semibold" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>No qualified {model.productLabel} candidate today</p>
          <p className="m-0 mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.6 }}>
            A leg needs a calibrated outcome probability from the official forecast and a verified sportsbook price for the exact side.
            We do not build a card from a projection that merely sits above a sportsbook line. Product band: {model.bandText}.
          </p>
          {model.cardReasons.length ? (
            <p className="m-0 mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>Card check: {model.cardReasons.map(copy).join("; ")}.</p>
          ) : null}
          <ul className="m-0 mt-2 flex flex-col gap-2 pl-0" style={{ listStyle: "none" }}>
            {Object.entries(model.legTypes).map(([key, t]) => (
              <li key={key} data-leg-type={key} style={{ fontSize: 12 }}>
                <span className="font-semibold" style={{ color: "var(--vault-text)" }}>{t.label}</span>
                <span style={{ color: "var(--vault-text-faint)" }}> · {t.considered} considered, {t.eligible} eligible</span>
                <ul className="m-0 mt-1 flex flex-col gap-0.5 pl-4">
                  {t.requirements.filter((r) => !r.pass).map((r) => (
                    <li key={r.key} data-failed-requirement={r.key} style={{ color: "var(--vault-text-mute)" }}>
                      Not met: {r.text}.{r.detail ? ` ${r.detail}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
