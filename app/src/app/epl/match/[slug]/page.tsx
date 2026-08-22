/**
 * /epl/match/[slug] — the Premier League per-fixture model report (P188). PUBLIC.
 *
 * The parity row this closes: /mlb and /nfl each have a per-game deep route, and EPL had none. The
 * fixture list could show three probabilities per match and a reader could never open the
 * distribution behind them — while the engine had already computed the whole thing and thrown it
 * away one layer before the artifact.
 *
 * EPL-NATIVE, NOT A FORK. This does not thread EPL through the MLB-shaped game-detail loaders. It
 * reads the SAME committed public artifact /epl reads, through the SAME loader, so no percentage on
 * this page is recomputed — a surface that computes its own is exactly how two pages end up
 * disagreeing about one fixture.
 *
 * NO RUN COUNT APPEARS ON THIS PAGE, and that is deliberate. MLB and NFL quote a sampled run count
 * because they sample. This model does not: it evaluates an exact Poisson score matrix, so every
 * figure here is a closed-form sum over the same grid rather than a frequency out of N draws.
 * Quoting a run count would be borrowing credibility from a method this page does not use.
 *
 * THE LIMITATION TRAVELS WITH THE NUMBERS. No Premier League match has ever been graded under this
 * model. A richer readout must not start reading as evidence the model is right, so the validation
 * state sits above the first figure rather than in a footer a later edit can drop.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import TeamLogo from "@/components/team-logo";
import SectionHeader from "@/components/section-header";
import { loadEplForecasts, reportableRows, findEplForecast, loadEplPlayerProjections, playersForFixture } from "@/lib/sports/epl/forecast-view";

/** Statically generate one page per fixture that genuinely carries a distribution. */
export function generateStaticParams() {
  return reportableRows(loadEplForecasts()).map((r) => ({ slug: r.slug as string }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const row = findEplForecast(loadEplForecasts(), params.slug);
  if (!row) return { title: "Premier League fixture · GameTime Picks" };
  return {
    title: `${row.matchup} — model forecast · GameTime Picks`,
    description:
      `Model distribution for ${row.matchup}: match-result probabilities, scoreline table, goals ladder and each side's goal curve. ` +
      "Distributions only — not picks. No Premier League match has been graded under this model yet.",
  };
}

const ET = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
/** One decimal, always shown — "2.0" reads as a measured value where "2" reads as a count. */
const dec = (n: number, d = 2) => n.toFixed(d);

const PANEL: React.CSSProperties = {
  background: "var(--vault-panel)",
  border: "1px solid var(--vault-rule)",
  borderRadius: 12,
  padding: "clamp(14px, 2vw, 20px)",
};

/** A horizontal probability bar. Width is the probability; the figure is always printed as text too. */
function Bar({ label, p, color, sub }: { label: string; p: number; color: string; sub?: string }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 13, color: "var(--vault-text)" }}>{label}</span>
        <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color }}>{pct(p)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--vault-rule)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
      {sub ? <span className="font-mono" style={{ fontSize: 10.5, color: "var(--vault-text-faint)" }}>{sub}</span> : null}
    </div>
  );
}

/** A compact column chart over a discrete distribution, with the modal bucket emphasised. */
function Histogram({ values, labelFor, accent }: { values: number[]; labelFor: (i: number) => string; accent: string }) {
  const max = Math.max(...values, 1e-9);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 96 }}>
      {values.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "grid", gap: 4, justifyItems: "center" }}>
          <span className="font-mono" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>
            {v >= 0.01 ? Math.round(v * 100) : ""}
          </span>
          <div
            title={`${labelFor(i)}: ${pct(v)}`}
            style={{
              width: "100%", height: Math.max(2, (v / max) * 64), borderRadius: 3,
              background: v === max ? accent : "color-mix(in srgb, " + accent + " 38%, transparent)",
            }}
          />
          <span className="font-mono" style={{ fontSize: 9.5, color: "var(--vault-text-mute)" }}>{labelFor(i)}</span>
        </div>
      ))}
    </div>
  );
}

export default function EplMatchPage({ params }: { params: { slug: string } }) {
  const set = loadEplForecasts();
  const row = findEplForecast(set, params.slug);
  /*
   * A fixture with no distribution has no report. It is not rendered as an empty page with the
   * furniture of a forecast around it — that reads as coverage.
   */
  if (!row || !set) notFound();

  const home = row.homeClub ?? row.matchup.split(" v ")[0];
  const away = row.awayClub ?? row.matchup.split(" v ")[1];
  const probs = row.probs!;
  const totals = row.totals;
  const soccer = "var(--sport-soccer)";
  const green = "var(--vault-accent)";
  /* A separate artifact and a separate model — same loader module, so the two cannot drift apart. */
  const playerFixture = playersForFixture(loadEplPlayerProjections(), params.slug);
  const playerRows = playerFixture?.players ?? [];
  /* Whether this fixture's rows actually carry the shots-on-target model. Derived, because the
     market is published per-run and a column of em dashes would be furniture, not information. */
  const anySog = playerRows.some((p) => typeof p.shotsOnGoalOver05 === "number");
  const awaiting = playerFixture?.lineupState !== "PUBLISHED";

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8" style={{ color: "var(--vault-text)" }}>
      <Link href="/epl/" style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>← Premier League fixtures</Link>

      {/* ── Identity ─────────────────────────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <TeamLogo team={home} sport="soccer" size="sm" ariaLabel={`${home} crest`} />
          <h1 style={{ fontSize: "clamp(20px, 3.4vw, 30px)", fontWeight: 800, margin: 0 }}>
            {home} <span style={{ color: "var(--vault-text-faint)", fontWeight: 500 }}>v</span> {away}
          </h1>
          <TeamLogo team={away} sport="soccer" size="sm" ariaLabel={`${away} crest`} />
        </div>
        <p className="font-mono mt-2" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>
          {ET(row.kickoffUtc)} ET{row.matchweek ? ` · Matchweek ${row.matchweek}` : ""} · Premier League
        </p>
      </header>

      {/*
        ── The limitation, ABOVE the first number ──────────────────────────────────────────────
        Not a footer. A reader who stops after the headline probability has still been told that
        nothing on this page has been checked against a result.
      */}
      <section className="mt-5" style={{ ...PANEL, borderColor: "color-mix(in srgb, var(--sport-soccer) 40%, var(--vault-rule))" }}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
          <strong style={{ color: soccer }}>Not validated out of sample.</strong> {set.trackRecord} These are the
          model&apos;s own probability distributions, published so you can see what it says — not picks, not advice,
          and not compared against any price.
        </p>
      </section>

      {row.coldStart?.home || row.coldStart?.away ? (
        <p className="mt-3" style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
          <strong style={{ color: "var(--vault-text)" }}>Cold start:</strong>{" "}
          {[row.coldStart.home ? home : null, row.coldStart.away ? away : null].filter(Boolean).join(" and ")}{" "}
          {row.coldStart.home && row.coldStart.away ? "have" : "has"} no top-flight history in the four-season
          corpus this model is fitted on, so {row.coldStart.home && row.coldStart.away ? "they run" : "it runs"} at
          the league-average baseline rather than a fitted strength. Every figure below inherits that.
        </p>
      ) : null}

      {/* ── Match result ─────────────────────────────────────────────────────────────────────── */}
      <section className="mt-7">
        <SectionHeader eyebrow="Match result" title="Full time, 90 minutes" sub="The draw is a real outcome and is never folded away." />
        <div style={{ ...PANEL, display: "grid", gap: 14 }}>
          <Bar label={`${home} win`} p={probs.home} color={green} />
          <Bar label="Draw" p={probs.draw} color="var(--vault-text-mute)" />
          <Bar label={`${away} win`} p={probs.away} color={soccer} />
        </div>

        {row.doubleChance ? (
          <div className="mt-3" style={{ ...PANEL, display: "grid", gap: 10 }}>
            <p className="font-mono" style={{ margin: 0, fontSize: 10.5, letterSpacing: "0.06em", color: "var(--vault-text-faint)", textTransform: "uppercase" }}>
              Two of three outcomes
            </p>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
              <Stat label={`${home} or draw`} value={pct(row.doubleChance.homeOrDraw)} />
              <Stat label={`${away} or draw`} value={pct(row.doubleChance.drawOrAway)} />
              <Stat label="Either side wins" value={pct(row.doubleChance.homeOrAway)} />
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--vault-text-faint)" }}>
              Each is a sum of the three probabilities above, so it cannot disagree with them.
            </p>
          </div>
        ) : null}
      </section>

      {/* ── Scorelines ───────────────────────────────────────────────────────────────────────── */}
      {row.topScorelines?.length ? (
        <section className="mt-7">
          <SectionHeader
            eyebrow="Exact score"
            title="The ten likeliest scorelines"
            sub={
              row.topScorelinesMass != null
                ? `These ten account for ${pct(row.topScorelinesMass)} of the distribution — the remaining ${pct(1 - row.topScorelinesMass)} is spread across every other scoreline.`
                : undefined
            }
          />
          <div style={{ ...PANEL, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 320 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--vault-text-faint)" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11 }}>Score ({home}–{away})</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11 }}>Probability</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11, width: "45%" }}></th>
                </tr>
              </thead>
              <tbody>
                {row.topScorelines.map((s) => {
                  const top = row.topScorelines![0].p;
                  return (
                    <tr key={s.score} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                      <td className="font-mono" style={{ padding: "7px 8px", fontWeight: 700 }}>{s.score.replace("-", "–")}</td>
                      <td className="font-mono" style={{ padding: "7px 8px" }}>{pct(s.p)}</td>
                      <td style={{ padding: "7px 8px" }}>
                        <div style={{ height: 6, borderRadius: 999, background: "var(--vault-rule)", overflow: "hidden" }}>
                          <div style={{ width: `${(s.p / top) * 100}%`, height: "100%", background: green, borderRadius: 999 }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* ── Goals ────────────────────────────────────────────────────────────────────────────── */}
      {totals ? (
        <section className="mt-7">
          <SectionHeader
            eyebrow="Goals"
            title="Total goals in the match"
            sub={`Expected ${dec(totals.expected)}. The middle half of the distribution falls between ${totals.quantiles.p25} and ${totals.quantiles.p75} goals.`}
          />
          <div style={{ ...PANEL, display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
              <Stat label="Expected goals" value={dec(totals.expected)} />
              <Stat label="Median (p50)" value={String(totals.quantiles.p50)} />
              <Stat label="p10 – p90" value={`${totals.quantiles.p10} – ${totals.quantiles.p90}`} />
            </div>

            <div>
              <p className="font-mono" style={{ margin: "0 0 6px", fontSize: 10.5, letterSpacing: "0.06em", color: "var(--vault-text-faint)", textTransform: "uppercase" }}>
                Probability of each total (goals)
              </p>
              <Histogram values={totals.distribution.slice(0, 9)} labelFor={(i) => String(i)} accent={green} />
            </div>

            <div>
              <p className="font-mono" style={{ margin: "0 0 8px", fontSize: 10.5, letterSpacing: "0.06em", color: "var(--vault-text-faint)", textTransform: "uppercase" }}>
                Over / under ladder
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--vault-text-faint)" }}>
                    <th style={{ padding: "5px 8px", fontWeight: 600, fontSize: 11 }}>Line</th>
                    <th style={{ padding: "5px 8px", fontWeight: 600, fontSize: 11 }}>Over</th>
                    <th style={{ padding: "5px 8px", fontWeight: 600, fontSize: 11 }}>Under</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.ladder.map((l) => (
                    <tr key={l.line} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                      <td className="font-mono" style={{ padding: "6px 8px", fontWeight: 700 }}>{l.line.toFixed(1)}</td>
                      <td className="font-mono" style={{ padding: "6px 8px", color: green }}>{pct(l.over)}</td>
                      <td className="font-mono" style={{ padding: "6px 8px", color: "var(--vault-text-mute)" }}>{pct(l.under)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>
                Half lines only — a match cannot land exactly on one, so over and under sum to 100% with no push.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Each side's goals ────────────────────────────────────────────────────────────────── */}
      {row.teamGoals ? (
        <section className="mt-7">
          <SectionHeader
            eyebrow="By side"
            title="How many each side scores"
            sub="The marginal of the same grid — not a separate fit, so these add back to the total above."
          />
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {([["home", home, green], ["away", away, soccer]] as const).map(([side, name, color]) => (
              <div key={side} style={{ ...PANEL }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span>
                  <span className="font-mono" style={{ fontSize: 12, color }}>
                    {dec(row.teamGoals![side].expected)} expected
                  </span>
                </div>
                <Histogram values={row.teamGoals![side].distribution.slice(0, 6)} labelFor={(i) => String(i)} accent={color} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Derived outcomes ─────────────────────────────────────────────────────────────────── */}
      <section className="mt-7">
        <SectionHeader eyebrow="Derived" title="Goalscoring shape and margin" sub="Every figure is an exact sum over the same score grid." />
        <div style={{ ...PANEL, display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {row.btts ? <Stat label="Both teams score" value={pct(row.btts.yes)} /> : null}
            {row.cleanSheet ? <Stat label={`${home} clean sheet`} value={pct(row.cleanSheet.home)} /> : null}
            {row.cleanSheet ? <Stat label={`${away} clean sheet`} value={pct(row.cleanSheet.away)} /> : null}
            {row.margin ? <Stat label="Expected margin" value={`${row.margin.expected > 0 ? "+" : ""}${dec(row.margin.expected)}`} /> : null}
          </div>

          {row.margin ? (
            <div>
              <p className="font-mono" style={{ margin: "0 0 6px", fontSize: 10.5, letterSpacing: "0.06em", color: "var(--vault-text-faint)", textTransform: "uppercase" }}>
                Winning margin ({home} goals − {away} goals)
              </p>
              <Histogram
                values={row.margin.distribution.filter((d) => d.margin >= -4 && d.margin <= 4).map((d) => d.p)}
                labelFor={(i) => { const m = i - 4; return m > 0 ? `+${m}` : String(m); }}
                accent={green}
              />
              <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)" }}>
                {/* No article before a club name — "a Arsenal win" was what interpolation produced. */}
                Positive means {home} win by that many, 0 is the draw, negative means {away}. Margins beyond ±4
                carry the remaining mass and are not drawn.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Player predictions for THIS fixture ──────────────────────────────────────────────── */}
      {playerRows.length > 0 ? (
        <section className="mt-7">
          <SectionHeader
            eyebrow="Player predictions · anytime goalscorer"
            title={awaiting ? "If he starts — likeliest scorers" : "Likeliest scorers"}
            sub={
              awaiting
                ? "The lineup is not posted yet, so each figure is the chance that player scores IF he starts — not a claim that he will. This is a different model from the score matrix above, with its own out-of-sample test."
                : "Read off the posted lineup: each figure is for the state the player is actually in, starting or off the bench."
            }
          />
          <div style={{ ...PANEL, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 320 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--vault-text-faint)" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11 }}>Player</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11 }}>Club</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11 }}>Appearances</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11 }}>To score</th>
                  {/* A SEPARATE model with its own cleared bars, computed for every player on every
                      run and — until now — rendered nowhere. A market that passes its test and then
                      cannot be read is indistinguishable from one that was never built. The column
                      appears only when the artifact actually carries the figures. */}
                  {anySog ? <th style={{ padding: "6px 8px", fontWeight: 600, fontSize: 11 }}>A shot on target</th> : null}
                </tr>
              </thead>
              <tbody>
                {playerRows.slice(0, 12).map((p) => (
                  <tr key={p.playerId} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                    <td style={{ padding: "7px 8px", fontWeight: 600 }}>{p.name}</td>
                    <td style={{ padding: "7px 8px", color: "var(--vault-text-mute)" }}>{p.teamName}</td>
                    {/* What the number rests on: no history means he is sitting on his position's rate. */}
                    <td className="font-mono" style={{ padding: "7px 8px", color: "var(--vault-text-faint)" }}>
                      {p.appearances > 0 ? p.appearances : "none"}
                    </td>
                    <td className="font-mono" style={{ padding: "7px 8px", fontWeight: 700, color: green }}>{pct(p.probability)}</td>
                    {anySog ? (
                      <td className="font-mono" style={{ padding: "7px 8px", color: "var(--vault-text-mute)" }}>
                        {/* An em dash, never a zero: a player this model has no figure for has not
                            been given a 0% chance of hitting the target. */}
                        {typeof p.shotsOnGoalOver05 === "number" ? pct(p.shotsOnGoalOver05) : "—"}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2" style={{ fontSize: 11.5, color: "var(--vault-text-faint)", lineHeight: 1.6 }}>
            Showing the {Math.min(12, playerRows.length)} likeliest of {playerRows.length}. No injury or suspension
            feed exists here, so a player who is unavailable can still appear in this list.
            {anySog ? " Shots on target is a separate model from the scorer figure beside it, fitted and tested on its own — the two are not derived from one another and can disagree." : ""}
          </p>
        </section>
      ) : null}

      {/* ── Provenance ───────────────────────────────────────────────────────────────────────── */}
      <section className="mt-7">
        <SectionHeader eyebrow="Method" title="Where these numbers come from" />
        <div style={{ ...PANEL, display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--vault-text-mute)" }}>
            Per-club attack and defence rates are fitted to Premier League results only, then combined into an
            exact Poisson score matrix for this fixture. Every probability on this page is a closed-form sum over
            that one grid — there is no sampling here, so there is no run count to quote and the figures are
            identical for every visitor, every time.
          </p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--vault-text-mute)" }}>
            The fit takes an explicit cutoff at the run clock, so it cannot see a result from a match it is
            forecasting. Team-level only: no lineup, injury or team-news input exists in this model, by design.
          </p>
          <dl style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", margin: 0 }}>
            <Meta k="Model" v={row.modelId ?? "epl-model-v1-split-poisson"} />
            {row.lambdas ? <Meta k="Scoring rates (λ)" v={`${home} ${dec(row.lambdas.home)} · ${away} ${dec(row.lambdas.away)}`} /> : null}
            <Meta k="Generated" v={set.generatedAt} />
            <Meta k="Validation" v={set.validation} />
          </dl>
        </div>
      </section>

      <p className="mt-6" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
        Paper-only and educational. Not betting advice.{" "}
        <Link href="/epl/" style={{ color: soccer }}>All Premier League fixtures</Link>
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: "0.06em", color: "var(--vault-text-faint)", textTransform: "uppercase" }}>{label}</span>
      <span className="font-display" style={{ fontSize: 18, fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-mono" style={{ fontSize: 9.5, letterSpacing: "0.06em", color: "var(--vault-text-faint)", textTransform: "uppercase" }}>{k}</dt>
      <dd className="font-mono" style={{ margin: 0, fontSize: 11.5, color: "var(--vault-text-mute)", overflowWrap: "anywhere" }}>{v}</dd>
    </div>
  );
}

/* Only the fixtures generateStaticParams enumerated exist; any other slug is a 404, not a guess. */
export const dynamicParams = false;
