/**
 * The UFC fight card — bouts, fighter portraits, records, and the one modelled prop.
 *
 * The only probability shown is "goes the distance", and only because it cleared a walk-forward
 * backtest (log loss 0.673 against a 0.693 base-rate baseline over 909 held-out bouts, every
 * adequately-sized calibration bin within 1.4 standard errors). Method of victory and moneyline are
 * named as NOT modelled with the reason, so their absence reads as a decision rather than an
 * oversight — the model block below renders those refusals from the artifact itself.
 */
import Image from "next/image";

type Fighter = {
  athleteId: string;
  name: string;
  record: string | null;
  photoUrl: string | null;
  priorBoutsInCorpus: number;
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

function Portrait({ f }: { f: Fighter }) {
  if (!f.photoUrl) {
    return (
      <span className="inline-flex items-center justify-center shrink-0 rounded-full font-mono"
        style={{ width: 46, height: 46, background: "rgba(255,255,255,0.05)", border: "1px solid var(--vault-rule)", color: "var(--vault-text-faint)", fontSize: 13 }}>
        {f.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full"
      style={{ width: 46, height: 46, background: "rgba(255,255,255,0.05)", border: "1px solid var(--vault-rule)" }}>
      <Image src={f.photoUrl} alt="" width={46} height={46} unoptimized style={{ objectFit: "cover", width: 46, height: 46 }} />
    </span>
  );
}

function Corner({ f, align }: { f: Fighter; align: "left" | "right" }) {
  const text = (
    <span className="flex flex-col min-w-0" style={{ alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <span className="truncate" style={{ color: "var(--vault-text)", fontWeight: 700, fontSize: 13.5 }}>{f.name}</span>
      {f.record ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{f.record}</span> : null}
    </span>
  );
  return (
    <span className="flex items-center gap-2.5 min-w-0 flex-1" style={{ justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
      {align === "left" ? <><Portrait f={f} />{text}</> : <>{text}<Portrait f={f} /></>}
    </span>
  );
}

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

      <div className="flex flex-col gap-1.5">
        {bouts.map((b, i) => (
          <div key={b.boutId} className="rounded-[12px] px-3 py-2.5 flex flex-col gap-2"
            style={{ border: `1px solid ${i === 0 ? "var(--vault-gold)" : "var(--vault-rule)"}`, background: i === 0 ? "rgba(217,164,65,0.05)" : "rgba(255,255,255,0.015)" }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 9, color: i === 0 ? "var(--vault-gold)" : "var(--vault-text-faint)" }}>
                {i === 0 ? "Main event · " : ""}{b.weightClass} · {b.scheduledRounds} rounds
              </span>
              {b.prediction?.rounds ? (
                <span className="font-mono" style={{ fontSize: 10, color: "var(--vault-text-mute)" }}>
                  Goes the distance <strong style={{ color: "var(--vault-text)" }}>{Math.round(b.prediction.rounds.goesTheDistance * 100)}%</strong>
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Corner f={b.red} align="left" />
              <span className="font-mono shrink-0" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>vs</span>
              <Corner f={b.blue} align="right" />
            </div>

            {b.prediction ? (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
                {b.prediction.winner ? (
                  <Head label="Predicted winner" value={b.prediction.winner.name}
                    sub={`${Math.round(b.prediction.winner.probability * 100)}% · model only, no market price`} />
                ) : null}
                {b.prediction.method ? (
                  <Head label="Method" value={METHOD_LABEL[b.prediction.method.most] ?? b.prediction.method.most}
                    sub={`KO ${Math.round(b.prediction.method.probabilities.ko * 100)}% · SUB ${Math.round(b.prediction.method.probabilities.submission * 100)}% · DEC ${Math.round(b.prediction.method.probabilities.decision * 100)}%`} />
                ) : null}
                {b.prediction.rounds ? (
                  <Head label="Ends in" value={b.prediction.rounds.endsIn === "3+" ? `Round 3${b.scheduledRounds === 5 ? "+" : ""}` : `Round ${b.prediction.rounds.endsIn}`}
                    sub={`R1 ${Math.round(b.prediction.rounds.probabilities.round1 * 100)}% · R2 ${Math.round(b.prediction.rounds.probabilities.round2 * 100)}% · R3+ ${Math.round(b.prediction.rounds.probabilities.round3plus * 100)}%`} />
                ) : null}
              </div>
            ) : b.unmodelledReason ? (
              <p className="font-mono m-0" style={{ fontSize: 9.5, color: "var(--vault-text-faint)" }}>{b.unmodelledReason}</p>
            ) : null}
          </div>
        ))}
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
