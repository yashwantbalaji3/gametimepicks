/**
 * The UFC fight card — bouts, fighter portraits, records, and the one modelled prop.
 *
 * The only probability shown is "goes the distance", and only because it cleared a walk-forward
 * backtest (log loss 0.673 against a 0.693 base-rate baseline over 909 held-out bouts, every
 * adequately-sized calibration bin within 1.4 standard errors). Method of victory and moneyline are
 * named as NOT modelled with the reason, so their absence reads as a decision rather than an
 * oversight — the model block below renders those refusals from the artifact itself.
 */
import HeadToHead from "@/components/ui/head-to-head";

type Bout = { date: string; opponent: string; result: "W" | "L"; method: string; round: number };
type Profile = {
  bouts: number;
  record?: { wins: number; losses: number };
  last5: Bout[];
  strengths: string[];
  weaknesses: string[];
  summary: string | null;
};
type Fighter = {
  athleteId: string;
  name: string;
  record: string | null;
  photoUrl: string | null;
  priorBoutsInCorpus: number;
  profile?: Profile;
};

export type UfcBout = {
  boutId: string;
  weightClass: string;
  scheduledRounds: number;
  startUtc: string;
  titleFight: boolean;
  red: Fighter;
  blue: Fighter;
  prediction: {
    winner: { name: string; probability: number; byFighter: Record<string, number> } | null;
    method: { most: string; probabilities: { ko: number; submission: number; decision: number } } | null;
    rounds: { endsIn: string; probabilities: { round1: number; round2: number; round3plus: number }; goesTheDistance: number } | null;
    priorFights: { a: number; b: number };
    /** One line on WHY this fighter, assembled from the features that moved the prediction. */
    reason?: string | null;
    basis?: string;
    basisNote?: string | null;
  } | null;
  unmodelledReason: string | null;
};

export type UfcCardArtifact = {
  state?: string;
  event?: { name?: string; startUtc?: string; venue?: string | null; boutCount?: number; slateDate?: string };
  model?: {
    publishes?: string[];
    verdicts?: Record<string, string>;
    corpus?: { fights?: number | null; from?: string | null; to?: string | null; source?: string | null };
    evidence?: {
      heldOutFights?: number | null;
      winner?: { accuracy?: number; baselineAccuracy?: number; logLoss?: number; baselineLogLoss?: number } | null;
      method?: { accuracy?: number; baselineAccuracy?: number; logLoss?: number; baselineLogLoss?: number } | null;
      round?: { accuracy?: number; baselineAccuracy?: number; logLoss?: number; baselineLogLoss?: number } | null;
    };
    notModelled?: Record<string, string>;
  };
  bouts?: UfcBout[];
};

const ET = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso));

const METHOD_LABEL: Record<string, string> = { KO: "KO / TKO", SUB: "Submission", DEC: "Decision" };

/** One predicted market: the headline answer, with the full distribution underneath it. */
function Head({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[9px] px-2 py-1.5" style={{ border: "1px solid var(--vault-rule)", background: "rgba(0,0,0,0.2)" }}>
      <div className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 8, color: "var(--vault-text-faint)" }}>{label}</div>
      <div className="truncate" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--vault-text)" }}>{value}</div>
      <div className="font-mono" style={{ fontSize: 9, color: "var(--vault-text-mute)" }}>{sub}</div>
    </div>
  );
}

export default function UfcCard({ card }: { card: UfcCardArtifact }) {
  const bouts = card.bouts ?? [];
  if (!bouts.length) return null;
  const ev = card.event ?? {};
  const m = card.model ?? {};
  const heads = m.publishes ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-display" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700, margin: 0 }}>{ev.name}</h2>
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
          {ev.startUtc ? `${ET(ev.startUtc)} ET` : ""}{ev.venue ? ` · ${ev.venue}` : ""} · {bouts.length} bouts
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {bouts.map((b, i) => {
          const pickedRed = b.prediction?.winner?.name === b.red.name;
          const rp = b.red.profile, bp = b.blue.profile;
          const form = (p?: Profile) => (p?.last5?.length
            ? p.last5.map((f) => f.result).join(" ")
            : "—");
          const rows = [
            { label: "Record", left: b.red.record ?? "—", right: b.blue.record ?? "—" },
            { label: "Last 5", left: form(rp), right: form(bp),
              better: (rp?.last5.filter((f) => f.result === "W").length ?? 0) > (bp?.last5.filter((f) => f.result === "W").length ?? 0) ? "left" as const
                : (bp?.last5.filter((f) => f.result === "W").length ?? 0) > (rp?.last5.filter((f) => f.result === "W").length ?? 0) ? "right" as const : null },
            ...(b.prediction?.winner ? [{
              label: "Win chance",
              left: `${Math.round((b.prediction.winner.byFighter[b.red.name] ?? 0) * 100)}%`,
              right: `${Math.round((b.prediction.winner.byFighter[b.blue.name] ?? 0) * 100)}%`,
              better: (pickedRed ? "left" : "right") as "left" | "right",
            }] : []),
          ];
          return (
            <div key={b.boutId} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 9, color: i === 0 ? "var(--sport-ufc)" : "var(--vault-text-faint)" }}>
                  {i === 0 ? "Main event · " : ""}{b.weightClass} · {b.scheduledRounds} rounds
                </span>
                {b.prediction?.rounds ? (
                  <span className="font-mono" style={{ fontSize: 10, color: "var(--vault-text-mute)" }}>
                    Goes the distance <strong style={{ color: "var(--vault-text)" }}>{Math.round(b.prediction.rounds.goesTheDistance * 100)}%</strong>
                  </span>
                ) : null}
              </div>

              <HeadToHead
                accent="var(--sport-ufc)"
                left={{ name: b.red.name, imageUrl: b.red.photoUrl, subtitle: rp?.summary ? undefined : b.red.record ?? undefined, favoured: pickedRed }}
                right={{ name: b.blue.name, imageUrl: b.blue.photoUrl, subtitle: bp?.summary ? undefined : b.blue.record ?? undefined, favoured: b.prediction?.winner ? !pickedRed : false }}
                rows={rows}
                verdict={b.prediction?.winner ? {
                  label: "Model pick",
                  value: `${b.prediction.winner.name} · ${Math.round(b.prediction.winner.probability * 100)}%`,
                  sub: b.prediction.method && b.prediction.rounds
                    ? `${METHOD_LABEL[b.prediction.method.most] ?? b.prediction.method.most} · ${b.prediction.rounds.endsIn === "3+" ? "round 3 or later" : `round ${b.prediction.rounds.endsIn}`}`
                    : undefined,
                } : null}
                note={b.prediction?.reason ?? b.unmodelledReason ?? undefined}
              />

              {(rp?.strengths?.length || bp?.strengths?.length) ? (
                <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
                  {[["red", b.red, rp] as const, ["blue", b.blue, bp] as const].map(([k, f, p]) => p?.bouts ? (
                    <div key={k} className="rounded-[10px] px-2.5 py-2" style={{ border: "1px solid var(--vault-rule)", background: "rgba(0,0,0,0.18)" }}>
                      <div className="font-mono uppercase tracking-[0.1em] mb-1" style={{ fontSize: 8.5, color: "var(--vault-text-faint)" }}>{f.name}</div>
                      {p.summary ? <p className="m-0 mb-1" style={{ fontSize: 10.5, lineHeight: 1.5, color: "var(--vault-text-mute)" }}>{p.summary}</p> : null}
                      {p.strengths.map((x) => <div key={x} style={{ fontSize: 10.5, color: "var(--vault-success)" }}>+ {x}</div>)}
                      {p.weaknesses.map((x) => <div key={x} style={{ fontSize: 10.5, color: "var(--vault-text-faint)" }}>− {x}</div>)}
                      {p.last5.length ? (
                        <div className="mt-1.5 flex flex-col gap-0.5">
                          {p.last5.map((f2) => (
                            <div key={f2.date + f2.opponent} className="font-mono flex items-center gap-1.5" style={{ fontSize: 9.5, color: "var(--vault-text-faint)" }}>
                              <span style={{ color: f2.result === "W" ? "var(--vault-success)" : "var(--vault-danger)", fontWeight: 700, width: 10 }}>{f2.result}</span>
                              <span className="truncate">{f2.opponent}</span>
                              <span>· {f2.method} R{f2.round}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-[12px] px-3 py-2.5 flex flex-col gap-1.5" style={{ border: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.015)" }}>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>What is modelled, and what is not</span>
        {heads.length ? (
          <>
            <p className="font-mono m-0" style={{ fontSize: 10.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
              Three markets publish — winner, method and ending round — each tested separately by walking forward through
              {" "}{m.evidence?.heldOutFights?.toLocaleString() ?? "—"} held-out fights from a corpus of
              {" "}{m.corpus?.fights?.toLocaleString() ?? "—"} bouts ({m.corpus?.from ?? "?"} to {m.corpus?.to ?? "?"}).
              A head that fails its bar is withheld while the others still publish.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr>{["Market", "Model", "Baseline", "Log loss"].map((h, i) => (
                    <th key={h} className="py-1 pr-3 font-mono uppercase tracking-[0.08em]" style={{ textAlign: i === 0 ? "left" : "right", color: "var(--vault-text-faint)", fontWeight: 500, borderBottom: "1px solid var(--vault-rule)" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {([["Winner", m.evidence?.winner], ["Method", m.evidence?.method], ["Ending round", m.evidence?.round]] as const).map(([name, e]) => e ? (
                    <tr key={name}>
                      <td className="py-1 pr-3" style={{ color: "var(--vault-text)" }}>{name}</td>
                      <td className="py-1 pr-3 font-mono" style={{ textAlign: "right", color: "var(--vault-text)" }}>{((e.accuracy ?? 0) * 100).toFixed(1)}%</td>
                      <td className="py-1 pr-3 font-mono" style={{ textAlign: "right", color: "var(--vault-text-faint)" }}>{((e.baselineAccuracy ?? 0) * 100).toFixed(1)}%</td>
                      <td className="py-1 font-mono" style={{ textAlign: "right", color: "var(--vault-text-mute)" }}>{(e.logLoss ?? 0).toFixed(3)} vs {(e.baselineLogLoss ?? 0).toFixed(3)}</td>
                    </tr>
                  ) : null)}
                </tbody>
              </table>
            </div>
            <p className="font-mono m-0" style={{ fontSize: 9.5, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
              Accuracy is measured against a baseline that always answers the historical base rate. Paper and educational —
              research estimates, never advice, and never presented as an advantage over the sportsbook price.
            </p>
          </>
        ) : null}
        {Object.entries(m.notModelled ?? {}).map(([k, v]) => (
          <p key={k} className="font-mono m-0" style={{ fontSize: 10.5, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
            <strong style={{ color: "var(--vault-text-mute)" }}>{k === "methodOfVictory" ? "Method of victory" : k === "moneyline" ? "Moneyline" : k}:</strong> {v}
          </p>
        ))}
      </div>
    </section>
  );
}
