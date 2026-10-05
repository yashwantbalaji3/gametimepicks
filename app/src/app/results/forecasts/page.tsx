/**
 * /results/forecasts — THE FORECAST RECORD (Session 13 · Results V2 · Phase I).
 *
 * Every forecast GameTimePicks published, counted ONCE (the Universal Forecast Ledger) and measured with the yardstick
 * its kind of claim calls for. There is deliberately no single "% accurate" headline: a yardage projection, a win
 * probability and a 1X2 vector answer different questions, and pooling them would be a number that means nothing.
 * Pending, void and withdrawn forecasts are counted and shown — never as losses. Products (Suggested Parlays, Bank
 * Builder, Moonshot, Mr Dub) are product performance and live elsewhere; their legs are rows here, once.
 *
 * Everything renders from forecastRecordView() (one reader). Styling is one stylesheet keyed by short class names.
 */
import Link from "next/link";

import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { forecastRecordView, familyHref, csvHref } from "@/lib/results/v2/forecast-ledger-reader";

export const metadata = withRouteMetadata("/results/forecasts/", {
  title: "Forecast Record — Every Published Forecast, Measured · GameTime Picks",
  description: "Every forecast GameTimePicks published across NFL, MLB, Premier League, Ligue 1 and UFC, counted once and measured against the official result with the right yardstick for each kind of forecast.",
});

const CSS = `
.fr table{width:100%;border-collapse:collapse}
.fr th{text-align:left;padding:7px 9px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint);white-space:nowrap}
.fr td{padding:8px 9px;border-top:1px solid var(--vault-border);font-size:12.5px;vertical-align:top}
.fr .m{color:var(--vault-text-mute)}
.fr .f{color:var(--vault-text-faint);font-size:11px}
.fr .k{font-family:var(--font-mono,ui-monospace,monospace);font-size:12px}
.fr .nw{white-space:nowrap}
.fr .scroll{overflow-x:auto;margin-top:8px;position:relative}
.fr .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:14px 0 6px}
.fr .kpi{border:1px solid var(--vault-border-strong);border-radius:10px;padding:10px 12px;background:var(--gtp-card)}
.fr .kpi b{display:block;font-size:20px;color:var(--vault-text);font-weight:600}
.fr .kpi span{font-size:11px;color:var(--vault-text-mute)}
.fr section{margin-top:28px}
.fr h2{font-size:20px;margin:0 0 4px;color:var(--vault-text)}
.fr .note{margin:8px 0 0;max-width:760px;font-size:12.5px;line-height:1.65;color:var(--vault-text-mute)}
.fr a.l{color:var(--gtp-bank-heat);font-weight:600}
`;

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null | undefined, d = 3) => (v == null ? "—" : v.toFixed(d));
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

const KIND_WORD: Record<string, string> = {
  CONTINUOUS_PROJECTION: "Projection",
  BINARY_PROBABILITY: "Probability",
  MULTICLASS_PROBABILITY: "Probabilities",
};

function primary(f: any): { main: string; sub: string } {
  if (f.kind === "CONTINUOUS_PROJECTION") {
    return {
      main: `Avg miss ${num(f.mae, 1)}`,
      sub: `median miss ${num(f.medianAbsError, 1)} · bias ${f.bias == null ? "—" : (f.bias > 0 ? "+" : "") + f.bias.toFixed(1)}${f.coverage ? ` · ${pct(f.coverage.inside)} inside our ${Math.round((f.coverage.target ?? 0.8) * 100)}% range` : ""}`,
    };
  }
  if (f.kind === "BINARY_PROBABILITY") {
    return { main: `Brier ${num(f.brier)}`, sub: `log loss ${num(f.logLoss)} · forecast ${pct(f.meanForecast)} vs happened ${pct(f.observedRate)} · ECE ${num(f.calibration?.ece)}` };
  }
  if (f.kind === "MULTICLASS_PROBABILITY") {
    return { main: `Log loss ${num(f.logLoss)}`, sub: `Brier ${num(f.brier)} · likeliest outcome happened ${pct(f.topClassAccuracy)} · a blind guess scores ${num(f.uniformReference?.logLoss)}` };
  }
  return { main: "—", sub: "" };
}

export default function ForecastRecordPage() {
  const rec = forecastRecordView();
  const k = rec.kpis;
  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden fr">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <nav aria-label="Breadcrumb" className="f"><Link href="/results/" className="l">Results</Link> · Forecast record</nav>
      <header className="flex flex-col gap-1.5 mt-2">
        <h1 className="font-display m-0" style={{ color: "var(--vault-text)", fontSize: 30, lineHeight: 1.1 }}>Forecast record</h1>
        <p className="note" style={{ marginTop: 0 }}>
          Every forecast we published, counted once and checked against the official result. Each kind of forecast gets
          its own yardstick: how far a projection missed, how well a probability was calibrated. There is no single
          accuracy number here on purpose. A yardage projection and a win chance answer different questions.
        </p>
      </header>

      {k.forecasts === 0 ? (
        <p className="note">The forecast ledger is not available in this build, so nothing is shown rather than an empty record.</p>
      ) : (
        <>
          <div className="kpis" role="list" aria-label="Forecast record at a glance">
            <div className="kpi" role="listitem"><b>{n(k.forecasts)}</b><span>forecasts published</span></div>
            <div className="kpi" role="listitem"><b>{n(k.measured)}</b><span>measured ({pct(k.coverage)})</span></div>
            <div className="kpi" role="listitem"><b>{n(k.pending)}</b><span>not final yet</span></div>
            <div className="kpi" role="listitem"><b>{n(k.voidCount + k.unmeasured)}</b><span>void or not measurable</span></div>
            <div className="kpi" role="listitem"><b>{k.sports} · {k.families}</b><span>sports · forecast types</span></div>
            <div className="kpi" role="listitem"><b>{day(k.lastSettledAt)}</b><span>last settled</span></div>
          </div>
          <p className="note">
            Void means the player did not play, or the game ended in a push or tie. Not measurable means the official
            result has no line for it. Neither ever counts as a miss. {n(k.withdrawn)} forecast{k.withdrawn === 1 ? " was" : "s were"} withdrawn
            before kickoff and stay listed, marked withdrawn.
          </p>

          {rec.sports.map((s: any) => (
            <section key={s.sport} aria-labelledby={`fr-${s.sport}`}>
              <h2 id={`fr-${s.sport}`} className="font-display">{s.label}</h2>
              <div className="f">{n(s.counts.measured)} measured · {n(s.counts.pending)} not final · {n(s.counts.void + s.counts.unmeasured)} void or not measurable</div>
              <div className="scroll">
                <table>
                  <thead>
                    <tr><th scope="col">Forecast</th><th scope="col">Kind</th><th scope="col">Measured</th><th scope="col">How it did</th><th scope="col">Latest game</th><th scope="col"><span className="sr-only">Details</span></th></tr>
                  </thead>
                  <tbody>
                    {s.families.map((f: any) => {
                      const p = primary(f);
                      return (
                        <tr key={f.family}>
                          <td><span style={{ color: "var(--vault-text)", fontWeight: 600 }}>{f.label}</span>{f.directional ? <div className="f">Pick record {f.directional.win}–{f.directional.loss}{f.directional.push ? `–${f.directional.push}` : ""}</div> : null}</td>
                          <td className="m nw">{KIND_WORD[f.kind] ?? f.kind}</td>
                          <td className="k nw">{n(f.counts.measured)}</td>
                          <td><span className="k">{p.main}</span><div className="f">{p.sub}</div></td>
                          <td className="m nw">{day(f.latestEvent)}</td>
                          <td className="nw"><Link href={familyHref(s.sport, f.family)} className="l">Details →</Link> <a href={csvHref(s.sport, f.family)} className="f" download>CSV</a></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <section aria-labelledby="fr-gaps">
            <h2 id="fr-gaps" className="font-display">Published but not in this record yet</h2>
            <ul className="note" style={{ paddingLeft: 18 }}>
              {rec.declaredGaps.map((g: any) => (
                <li key={`${g.sport}-${g.family}`}><b style={{ color: "var(--vault-text)" }}>{g.sport} · {g.family}</b>: {g.reason}</li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="fr-how">
            <h2 id="fr-how" className="font-display">How this record works</h2>
            <p className="note">
              One row per forecast: the last version we published before the game started, read from the record of
              that forecast and never re-predicted. A forecast that appeared on several pages (a game page, a Top-5
              board, Ask) is still one row. Projections are measured by how far they missed. Probabilities are measured
              by Brier score and log loss, where lower is better, plus calibration: when we said 30%, did it happen
              about 30% of the time? A pick record appears only where we published a pick. Sportsbook lines are shown
              for context and are never part of these numbers.
            </p>
            <p className="note">
              Products are graded separately, card by card: <Link href="/results/parlay-lab/" className="l">Suggested parlays</Link> and
              the <Link href="/mr-dub/" className="l">paper bankroll</Link>. A four-leg card is one product result here and four
              forecasts in this record.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
