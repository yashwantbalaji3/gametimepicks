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
  distance: { probability: number; state: string; note: string } | null;
};

export type UfcCardArtifact = {
  state?: string;
  event?: { name?: string; startUtc?: string; venue?: string | null; boutCount?: number; slateDate?: string };
  model?: {
    publishes?: string[];
    verdict?: string;
    evidence?: { scoredBouts?: number | null; modelLogLoss?: number | null; baselineLogLoss?: number | null; baseDistanceRate?: number | null };
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

export default function UfcCard({ card }: { card: UfcCardArtifact }) {
  const bouts = card.bouts ?? [];
  if (!bouts.length) return null;
  const ev = card.event ?? {};
  const m = card.model ?? {};
  const publishesDistance = (m.publishes ?? []).includes("goes_the_distance");

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
              {publishesDistance && b.distance ? (
                <span className="font-mono" style={{ fontSize: 10, color: "var(--vault-text-mute)" }}>
                  Goes the distance{" "}
                  <strong style={{ color: "var(--vault-text)" }}>{Math.round(b.distance.probability * 100)}%</strong>
                  {b.distance.state === "PRIOR_ONLY" ? <span style={{ color: "var(--vault-text-faint)" }}> · base rate only</span> : null}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Corner f={b.red} align="left" />
              <span className="font-mono shrink-0" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>vs</span>
              <Corner f={b.blue} align="right" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[12px] px-3 py-2.5 flex flex-col gap-1.5" style={{ border: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.015)" }}>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 9, color: "var(--vault-text-faint)" }}>What is modelled, and what is not</span>
        {publishesDistance ? (
          <p className="font-mono m-0" style={{ fontSize: 10.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
            <strong style={{ color: "var(--vault-text)" }}>Goes the distance</strong> is the one published market. It was tested by
            walking forward through {m.evidence?.scoredBouts?.toLocaleString() ?? "—"} held-out bouts and scored
            {" "}{m.evidence?.modelLogLoss?.toFixed(3) ?? "—"} on log loss against {m.evidence?.baselineLogLoss?.toFixed(3) ?? "—"} for
            a baseline that always answers the historical rate of {m.evidence?.baseDistanceRate != null ? `${Math.round(m.evidence.baseDistanceRate * 100)}%` : "—"}.
            Paper and educational — a research estimate, never advice, and never presented as an advantage over the sportsbook price.
          </p>
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
