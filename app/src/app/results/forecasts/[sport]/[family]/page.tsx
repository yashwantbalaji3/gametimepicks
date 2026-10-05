/**
 * /results/forecasts/[sport]/[family] — one forecast type's full record (Session 13 · Results V2 · E3/E4).
 *
 * Metrics for the family (the right yardstick for its kind), its calibration where it is a probability, its pick
 * record ONLY where a pick was published, and the latest rows in words: what we said, when, which model, the market
 * context if captured, what happened, how it was scored. The full history is the CSV — the same rows this page counts.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { csvHref, familyFromSlug, familyRows, familySlug, ledgerFamilies, researchHrefFor, SPORT_SLUGS, sportFromSlug } from "@/lib/results/v2/forecast-ledger-reader";
import { FAMILY_LABELS, familyMetrics, SPORT_LABELS } from "@/lib/results/v2/forecast-record.mjs";

export const dynamicParams = false;

export function generateStaticParams() {
  return ledgerFamilies().map(({ sport, family }) => ({ sport: SPORT_SLUGS[sport], family: familySlug(family) }));
}

type Params = { sport: string; family: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { sport: s, family: f } = await params;
  const sport = sportFromSlug(s) ?? s;
  const label = FAMILY_LABELS[familyFromSlug(f) as keyof typeof FAMILY_LABELS] ?? f;
  return withRouteMetadata(`/results/forecasts/${s}/${f}/`, {
    title: `${SPORT_LABELS[sport as keyof typeof SPORT_LABELS] ?? sport} ${label} — Forecast Record · GameTime Picks`,
    description: `Every ${label.toLowerCase()} forecast GameTimePicks published, measured against the official result.`,
  });
}

const CSS = `
.ff table{width:100%;border-collapse:collapse}
.ff th{text-align:left;padding:7px 9px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint);white-space:nowrap}
.ff td{padding:7px 9px;border-top:1px solid var(--vault-border);font-size:12.5px;vertical-align:top}
.ff .m{color:var(--vault-text-mute)}
.ff .f{color:var(--vault-text-faint);font-size:11px}
.ff .k{font-family:var(--font-mono,ui-monospace,monospace);font-size:12px}
.ff .nw{white-space:nowrap}
.ff .scroll{overflow-x:auto;margin-top:8px;position:relative}
.ff section{margin-top:26px}
.ff h2{font-size:19px;margin:0 0 4px;color:var(--vault-text)}
.ff .note{margin:8px 0 0;max-width:760px;font-size:12.5px;line-height:1.65;color:var(--vault-text-mute)}
.ff .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:14px}
.ff .stat{border:1px solid var(--vault-border-strong);border-radius:10px;padding:10px 12px;background:var(--gtp-card)}
.ff .stat b{display:block;font-size:19px;color:var(--vault-text);font-weight:600}
.ff .stat span{font-size:11px;color:var(--vault-text-mute)}
.ff a.l{color:var(--gtp-bank-heat);font-weight:600}
`;

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null | undefined, d = 3) => (v == null ? "—" : Number(v).toFixed(d));
const fmt = (v: number | null | undefined) => (v == null ? "—" : Number.isInteger(v) ? String(v) : Number(v).toFixed(1));

const BASIS_WORDS: Record<string, string> = {
  HIGHER_WIN_PROBABILITY_SIDE: "the team we gave the better win chance",
  HISTORICAL_MODEL_FAVORED: "the team with the higher frozen win chance (no pick was published)",
  IMPLIED_SIDE_OF_FROZEN_LINE: "the side of the sportsbook line our projection pointed to",
  PUBLISHED_PICK: "the pick we published",
};

function forecastText(r: any): string {
  if (r.forecastKind === "CONTINUOUS_PROJECTION") return r.rangeLow != null ? `${fmt(r.projection)} (range ${fmt(r.rangeLow)}–${fmt(r.rangeHigh)})` : fmt(r.projection);
  if (r.forecastKind === "BINARY_PROBABILITY") return `${pct(r.probability)}${r.direction && !/^[A-Z_]+$/.test(r.direction) ? ` · ${r.direction}` : ""}`;
  if (r.forecastKind === "MULTICLASS_PROBABILITY" && r.classProbabilities) {
    const c = r.classProbabilities;
    if ("home" in c && "draw" in c && "away" in c) return `Home ${pct(c.home)} · Draw ${pct(c.draw)} · Away ${pct(c.away)}`;
    // A score table (EPL correct score): the likeliest listed score, and the share left to scores the table omitted.
    if (r.categoryPrediction && "OTHER" in c) return `Likeliest ${r.categoryPrediction} (${pct(c[r.categoryPrediction])}) · scores not listed ${pct(c.OTHER)}`;
    return "—";
  }
  return "—";
}

function outcomeText(r: any): string {
  const s = r.settlement ?? {};
  if (r.publicationStatus === "WITHDRAWN") return "Withdrawn before kickoff — not a miss";
  if (s.state === "PENDING") return "Not final yet";
  if (s.state === "VOID") return s.reason === "DID_NOT_PLAY" ? "Void — did not play" : s.reason === "PUSH" ? "Void — push" : s.reason === "TIE_NO_WINNER" ? "Void — tie" : "Void";
  if (s.state === "NO_MEASUREMENT") return "Not measurable — no official line";
  if (r.forecastKind === "CONTINUOUS_PROJECTION") return `Actual ${fmt(s.finalValue)}`;
  if (r.forecastKind === "MULTICLASS_PROBABILITY") return s.finalCategory === "OTHER" ? `Result: a score not in the table${s.reason ? ` (${s.reason.replace(/^final /, "").replace(/ is outside the published table$/, "")})` : ""}` : `Result: ${s.finalCategory ?? "—"}`;
  // A score claim (Ligue 1 likeliest score) keeps the final score beside the verdict, so a miss shows what happened.
  const score = /^\d+-\d+$/.test(String(s.finalCategory ?? "")) ? ` (final ${s.finalCategory})` : "";
  return r.measurement?.observed === 1 ? `Happened${score}` : r.measurement?.observed === 0 ? `Did not happen${score}` : s.finalCategory ? String(s.finalCategory) : "Settled";
}

function scoreText(r: any): string {
  const m = r.measurement ?? {};
  if (!m.type) return "—";
  if (m.type === "CONTINUOUS_ERROR") return `missed by ${fmt(m.absoluteError)}${m.insideRange === true ? " · inside range" : m.insideRange === false ? " · outside range" : ""}`;
  return `Brier ${num(m.brier)}`;
}

export default async function ForecastFamilyPage({ params }: { params: Promise<Params> }) {
  const { sport: sportSlug, family: famSlug } = await params;
  const sport = sportFromSlug(sportSlug);
  const family = familyFromSlug(famSlug);
  if (!sport) notFound();
  const rows = familyRows(sport, family);
  if (!rows.length) notFound();
  const m: any = familyMetrics(rows);
  const label = FAMILY_LABELS[family as keyof typeof FAMILY_LABELS] ?? family;
  const sportLabel = SPORT_LABELS[sport as keyof typeof SPORT_LABELS] ?? sport;
  const models = [...new Set(rows.map((r) => r.modelId).filter(Boolean))].sort();
  const shown = rows.slice(0, 60);

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden ff">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <nav aria-label="Breadcrumb" className="f">
        <Link href="/results/" className="l">Results</Link> · <Link href="/results/forecasts/" className="l">Forecast record</Link> · {sportLabel}
      </nav>
      <h1 className="font-display m-0 mt-2" style={{ color: "var(--vault-text)", fontSize: 28, lineHeight: 1.15 }}>{sportLabel} · {label}</h1>
      <p className="note">
        {n(rows.length)} forecasts published · {n(m.counts.measured)} measured · {n(m.counts.pending)} not final · {n(m.counts.void + m.counts.unmeasured)} void or not measurable
        {m.counts.withdrawn ? ` · ${n(m.counts.withdrawn)} withdrawn` : ""}. Model{models.length === 1 ? "" : "s"}: {models.length ? models.join(", ") : "not recorded by this forecast's record"}.
      </p>

      <div className="stats">
        {m.kind === "CONTINUOUS_PROJECTION" ? (
          <>
            <div className="stat"><b>{num(m.mae, 1)}</b><span>average miss (n {n(m.n)})</span></div>
            <div className="stat"><b>{num(m.medianAbsError, 1)}</b><span>median miss</span></div>
            <div className="stat"><b>{num(m.rmse, 1)}</b><span>root-mean-square miss</span></div>
            <div className="stat"><b>{m.bias == null ? "—" : `${m.bias > 0 ? "+" : ""}${m.bias.toFixed(1)}`}</b><span>bias (+ = we projected high)</span></div>
            {m.coverage ? <div className="stat"><b>{pct(m.coverage.inside)}</b><span>inside our {Math.round((m.coverage.target ?? 0.8) * 100)}% range (n {n(m.coverage.n)}) — about {Math.round((m.coverage.target ?? 0.8) * 100)}% is the target, higher is not better</span></div> : null}
          </>
        ) : m.kind === "BINARY_PROBABILITY" ? (
          <>
            <div className="stat"><b>{num(m.brier)}</b><span>Brier score (n {n(m.n)}), lower is better</span></div>
            <div className="stat"><b>{num(m.logLoss)}</b><span>log loss, lower is better</span></div>
            <div className="stat"><b>{pct(m.meanForecast)} → {pct(m.observedRate)}</b><span>average forecast → how often it happened</span></div>
            <div className="stat"><b>{num(m.calibration?.ece)}</b><span>calibration error (ECE)</span></div>
          </>
        ) : (
          <>
            <div className="stat"><b>{num(m.logLoss)}</b><span>log loss (n {n(m.n)}) — a blind guess scores {num(m.uniformReference?.logLoss)}</span></div>
            <div className="stat"><b>{num(m.brier)}</b><span>Brier score — a blind guess scores {num(m.uniformReference?.brier)}</span></div>
            <div className="stat"><b>{pct(m.topClassAccuracy)}</b><span>{m.topClassLabel ?? "our likeliest outcome happened"}</span></div>
          </>
        )}
        {m.directional ? (m.directional.byBasis ?? [{ ...m.directional, basis: m.directional.basis[0], label: m.directional.label ?? "pick record" }]).map((d: any) => (
          <div className="stat" key={d.basis}><b>{d.win}–{d.loss}{d.push ? `–${d.push}` : ""}</b><span>{d.label}: {BASIS_WORDS[d.basis] ?? d.basis}</span></div>
        )) : null}
      </div>

      {m.kind === "BINARY_PROBABILITY" && m.calibration?.bins?.length ? (
        <section aria-labelledby="ff-cal">
          <h2 id="ff-cal" className="font-display">Calibration</h2>
          <p className="note">When we said a chance in each band, how often did it happen? A well-calibrated forecast lands close to its own number. Small bands are noisy.</p>
          <div className="scroll">
            <table>
              <thead><tr><th scope="col">We said</th><th scope="col">Forecasts</th><th scope="col">Average forecast</th><th scope="col">Happened</th></tr></thead>
              <tbody>
                {m.calibration.bins.map((b: any) => (
                  <tr key={b.lo}><td className="k nw">{Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%</td><td className="k">{n(b.n)}</td><td className="k">{pct(b.meanForecast)}</td><td className="k">{pct(b.observed)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="ff-rows">
        <h2 id="ff-rows" className="font-display">Latest forecasts</h2>
        <p className="note">The {n(shown.length)} most recent of {n(rows.length)}. <a href={csvHref(sport, family)} className="l" download>Download all {n(rows.length)} as CSV</a>.</p>
        <div className="scroll">
          <table>
            <thead><tr><th scope="col">Game</th><th scope="col">Forecast for</th><th scope="col">What we said</th><th scope="col">Market</th><th scope="col">What happened</th><th scope="col">Scored</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.forecastId}>
                  <td className="nw"><span className="k">{String(r.eventStart ?? r.publishedAt ?? "").slice(0, 10) || "—"}</span><div className="f">{r.matchup ?? ""}</div></td>
                  <td>{(() => {
                    const href = researchHrefFor(r.subjectId);
                    const label = r.subjectDisplay ?? r.subjectId;
                    return href ? <Link href={href} className="l">{label}</Link> : label;
                  })()}{r.teamId && r.subjectType === "PLAYER" ? <span className="f"> · {r.teamId}</span> : null}</td>
                  <td><span className="k">{forecastText(r)}</span><div className="f">{r.publishedAt ? `published ${String(r.publishedAt).slice(0, 16).replace("T", " ")}Z` : "publication time not recorded"}</div></td>
                  <td className="m">{r.market?.line != null ? `line ${r.market.line}` : r.market?.impliedProbability != null && typeof r.market.impliedProbability === "number" ? `book ${pct(r.market.impliedProbability)}` : "—"}</td>
                  <td>{outcomeText(r)}</td>
                  <td className="k nw">{scoreText(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">Market numbers are the sportsbook&rsquo;s, shown for context. They are not part of any score on this page.</p>
      </section>
    </div>
  );
}
