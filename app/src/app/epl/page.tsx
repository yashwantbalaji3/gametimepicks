/**
 * /epl — Premier League fixtures AND model forecasts.
 *
 * This page was SCHEDULE_ONLY, and its blocker said simulating a fixture needs per-club scoring
 * rates "fitted to this competition and validated out of sample". Half of that is now done: the
 * rates ARE fitted to the Premier League (1,520 matches over four seasons, cross-language parity at
 * n=1140). The other half is NOT — no EPL match has ever been graded under this model.
 *
 * So the forecasts are published with that limitation attached to them rather than hidden. What is
 * deliberately absent is as important as what is shown: no pick, no confidence score, no rating, and
 * no comparison against a price. The DISTRIBUTION is the product. A reader can see what the model
 * says; nothing here tells them what will happen or what to do.
 *
 * Cold-start clubs are flagged on their own row. Coventry City and Hull City are newly promoted with
 * no top-flight history, so they run at the league-average baseline — a fact that belongs beside the
 * number it affects, not in a footnote.
 */
import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";

import SportSchedulePage from "@/components/sports/sport-schedule-page";
import { allUpcoming } from "@/lib/sports/upcoming/adapters.mjs";

export const metadata: Metadata = {
  title: "Premier League — Forecasts · GameTime Picks",
  description:
    "Premier League model forecasts: match-result probabilities, expected goals and over/under 2.5 for each fixture. Distributions only — not picks. No match has been graded under this model yet.",
};

type Row = {
  eventId: string; matchup: string; kickoffUtc: string; state: string;
  unavailableReason: string | null;
  probs: { home: number; draw: number; away: number } | null;
  expectedGoals: number | null; over25: number | null;
  coldStart: { home: boolean; away: boolean } | null;
};
type Forecasts = { generatedAt: string; validation: string; trackRecord: string; rows: Row[] } | null;

function loadForecasts(): Forecasts {
  try {
    const p = path.join(process.cwd(), "public/data/soccer/epl/forecasts/latest.json");
    return JSON.parse(fs.readFileSync(p, "utf8")) as NonNullable<Forecasts>;
  } catch {
    return null; // Unreadable is ABSENT, never an empty-but-confident page.
  }
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

function ForecastTable({ f }: { f: NonNullable<Forecasts> }) {
  const priced = f.rows.filter((r) => r.probs);
  const unpriced = f.rows.filter((r) => !r.probs);
  return (
    <section aria-labelledby="epl-forecasts" className="mt-8">
      <h2 id="epl-forecasts" className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-mute)]">
        Model forecasts
      </h2>

      {/* The limitation sits ABOVE the numbers, not under them. */}
      <div className="mt-3 rounded-[8px] border p-4" style={{ borderColor: "var(--vault-border-strong)", background: "var(--vault-panel)" }}>
        <p className="text-[14px] leading-relaxed text-[var(--text)]">
          <strong>No Premier League match has been graded under this model.</strong> There is no
          win/loss record, no accuracy figure and no track record to cite. These are the model&rsquo;s
          own probability distributions, published so you can see what it says — not picks, and not
          compared against any price.
        </p>
      </div>

      <div className="mt-4" style={{ overflowX: "auto" }}>
        <table className="w-full text-[13.5px]" style={{ borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr style={{ color: "var(--text-mute)", textAlign: "left" }}>
              <th className="py-2 pr-3 font-semibold">Fixture</th>
              <th className="py-2 px-2 font-semibold">Home</th>
              <th className="py-2 px-2 font-semibold">Draw</th>
              <th className="py-2 px-2 font-semibold">Away</th>
              <th className="py-2 px-2 font-semibold">Exp. goals</th>
              <th className="py-2 pl-2 font-semibold">Over 2.5</th>
            </tr>
          </thead>
          <tbody>
            {priced.map((r) => (
              <tr key={r.eventId} style={{ borderTop: "1px solid var(--vault-border)" }}>
                <td className="py-2 pr-3 text-[var(--text)]">
                  {r.matchup}
                  {r.coldStart && (r.coldStart.home || r.coldStart.away) ? (
                    <span className="ml-2 text-[11px]" style={{ color: "var(--text-mute)" }}>
                      · newly promoted side, no top-flight history — league-average baseline
                    </span>
                  ) : null}
                </td>
                <td className="py-2 px-2 font-mono">{pct(r.probs!.home)}</td>
                <td className="py-2 px-2 font-mono">{pct(r.probs!.draw)}</td>
                <td className="py-2 px-2 font-mono">{pct(r.probs!.away)}</td>
                <td className="py-2 px-2 font-mono">{r.expectedGoals?.toFixed(2) ?? "—"}</td>
                <td className="py-2 pl-2 font-mono">{r.over25 != null ? pct(r.over25) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* A fixture we could not price is NAMED. Dropping it would overstate coverage. */}
      {unpriced.length > 0 ? (
        <p className="mt-3 text-[13px] text-[var(--text-mute)]">
          Not forecast:{" "}
          {unpriced.map((r) => `${r.matchup} (${r.unavailableReason ?? "unavailable"})`).join(" · ")}
        </p>
      ) : null}

      <p className="mt-3 text-[12px] text-[var(--text-mute)]">
        Generated {f.generatedAt} · pregame inputs only; the model never sees a result from a match it
        is forecasting.
      </p>
    </section>
  );
}

export default function EplPage() {
  type Feed = { sport?: string; events?: unknown[]; totals?: { upcoming?: number }; sourceVerdict?: { sourceId?: string | null; fetchedAt?: string | null } };
  const s = (allUpcoming({ nowIso: new Date().toISOString() }) as unknown as Feed[]).find((x) => x.sport === "epl");
  const f = loadForecasts();
  return (
    <>
      <SportSchedulePage
        title="Premier League"
        accent="var(--sport-soccer)"
        blurb="The 2026-27 Premier League fixture list, with model forecasts for the fixtures we can price."
        logoSport="soccer"
        sides={["home", "away"]}
        joiner="at"
        events={(s?.events ?? []) as never[]}
        source={s?.sourceVerdict?.sourceId ?? "openfootball (public domain)"}
        capturedAt={s?.sourceVerdict?.fetchedAt ?? null}
        totalEvents={s?.totals?.upcoming}
        /*
         * The blocker STAYS, narrowed to what is still true. It previously said the rates were
         * neither fitted nor validated; the fitting is done, the out-of-sample validation is not.
         * Removing it because forecasts now appear would delete the honest half of the sentence.
         */
        blocker="These forecasts have not been validated out of sample: no Premier League match has finished under this model, so nothing here has been checked against a result. Treat them as the model's stated view, not as evidence it is right."
      />
      {f ? <ForecastTable f={f} /> : null}
    </>
  );
}
