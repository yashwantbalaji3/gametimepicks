/**
 * HOW OFTEN THE MODEL'S INTERVALS WERE RIGHT — published beside the intervals themselves.
 *
 * Every NFL game page prints a margin and a total with an 80% interval. This is that label's track
 * record. It exists because the record was already being measured — the settlement ledger has
 * graded interval coverage since P174-G — and lived in the private research tree where no reader
 * could see it, while the preseason margin interval quietly delivered 65% against the 80% printed
 * on the page.
 *
 * (The path is described rather than written out: the public-beta leakage guard scans these files
 * for internal-tree references as a plain substring, and a prose mention reads the same to it as a
 * real read. Blunt is the right setting for that guard — over-strict costs a reworded sentence,
 * under-strict costs a leak.)
 *
 * The panel deliberately shows the UNFLATTERING cohort. A calibration surface that only appeared
 * when the numbers looked good would be marketing.
 */
import fs from "node:fs";
import path from "node:path";

type Verdict = {
  state: "OVERCONFIDENT" | "UNDERCONFIDENT" | "CALIBRATED" | "INSUFFICIENT";
  z: number | null;
  observed: number | null;
  n: number;
  covered: number;
  impliedScale: number | null;
  claim: string;
};
type Cohort = {
  label: string;
  n: number;
  margin: Verdict;
  total: Verdict;
  winnerAccuracy: number | null;
  marginMAE: number | null;
  totalMAE: number | null;
};
type Calibration = {
  generatedAt?: string;
  nominalCoverage?: number;
  cohorts?: Cohort[];
  worst?: string;
  action?: string;
  bars?: { minSample?: number; zThreshold?: number };
};

export function loadIntervalCalibration(): Calibration | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "data", "nfl", "interval-calibration.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

const STATE_COPY: Record<Verdict["state"], { label: string; tone: string }> = {
  OVERCONFIDENT: { label: "too narrow", tone: "var(--gtp-bank-heat)" },
  UNDERCONFIDENT: { label: "wider than needed", tone: "var(--vault-text-mute)" },
  CALIBRATED: { label: "matches the label", tone: "var(--vault-success)" },
  INSUFFICIENT: { label: "not enough games yet", tone: "var(--vault-text-faint)" },
};

function Row({ what, v, nominal }: { what: string; v: Verdict; nominal: number }) {
  const copy = STATE_COPY[v.state] ?? STATE_COPY.INSUFFICIENT;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2" style={{ borderTop: "1px solid var(--vault-rule)" }}>
      <span className="text-[13px] font-semibold" style={{ color: "var(--vault-text)", minWidth: 74 }}>{what}</span>
      {v.state === "INSUFFICIENT" ? (
        <span className="font-mono text-[11.5px]" style={{ color: copy.tone }}>
          {v.n} settled — no claim below the {nominal ? "" : ""}sample floor
        </span>
      ) : (
        <>
          <span className="font-mono text-[12.5px] tabular-nums" style={{ color: "var(--vault-text)" }}>
            {((v.observed ?? 0) * 100).toFixed(1)}%
          </span>
          <span className="font-mono text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
            of {v.n} landed inside a {Math.round(nominal * 100)}% interval
          </span>
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ color: copy.tone, border: `1px solid ${copy.tone}` }}>
            {copy.label}
          </span>
        </>
      )}
    </div>
  );
}

export default function IntervalCalibrationPanel({ cal }: { cal: Calibration | null }) {
  if (!cal?.cohorts?.length) return null;
  const nominal = cal.nominalCoverage ?? 0.8;
  const open = cal.worst === "OVERCONFIDENT" || cal.worst === "UNDERCONFIDENT";

  return (
    <section className="mt-8" aria-labelledby="nfl-calibration-h">
      <h2 id="nfl-calibration-h" className="font-display text-[17px] font-bold" style={{ color: "var(--vault-text)" }}>
        Were the intervals right?
      </h2>
      <p className="mt-1 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
        Every game page prints a margin and a total with an {Math.round(nominal * 100)}% interval. This is how often the
        real result actually landed inside one, graded against official final scores. Seasons are never pooled.
      </p>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        {cal.cohorts.map((c) => (
          <div
            key={c.label}
            className="flex-1 rounded-[12px] px-4 py-3"
            style={{ background: "var(--vault-panel)", border: "1px solid var(--vault-rule)" }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--vault-gold)" }}>
                {c.label}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
                {c.n} settled
              </span>
            </div>
            {c.winnerAccuracy != null ? (
              <div className="mt-1.5 font-mono text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>
                winner {(c.winnerAccuracy * 100).toFixed(1)}%
                {c.marginMAE != null ? <> · margin off by {c.marginMAE.toFixed(1)} avg</> : null}
                {c.totalMAE != null ? <> · total off by {c.totalMAE.toFixed(1)} avg</> : null}
              </div>
            ) : null}
            <div className="mt-2">
              <Row what="Margin" v={c.margin} nominal={nominal} />
              <Row what="Total" v={c.total} nominal={nominal} />
            </div>
          </div>
        ))}
      </div>

      {open ? (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
          {cal.cohorts.find((c) => c.margin.state === "OVERCONFIDENT")?.margin.claim ??
            cal.cohorts.find((c) => c.total.state === "OVERCONFIDENT")?.total.claim ??
            cal.action}{" "}
          The correction is not applied automatically — changing a model because of a result it has already seen is
          how a track record stops meaning anything. It needs a preregistered bar and a held-out season first.
        </p>
      ) : null}
    </section>
  );
}
