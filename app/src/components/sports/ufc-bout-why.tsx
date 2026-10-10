/**
 * Bout page, section C: "Why: what we can and cannot say" (UFC-001 UX Phase B).
 *
 * Two panels, never merged:
 *  - the card's per-bout `reason` line, under its own label: a summary of the two tracked records, NOT the model's
 *    reasoning (it reads raw rates and none of the tale-of-the-tape inputs). Artifacts built after PR #1059 already
 *    start the sentence with that label, so a leading copy of it is stripped rather than printed twice;
 *  - "What the model uses": the winner head's inputs, named but not weighed, and a plain statement that per-fight
 *    attributions are not published. All copy comes from `lib/sports/ufc/bout-explain.mjs`.
 */
import {
  ATTRIBUTION_HEADLINE,
  ATTRIBUTION_STATUS,
  NOT_USED_NOTE,
  OTHER_HEADS_NOTE,
  WINNER_INPUTS,
} from "@/lib/sports/ufc/bout-explain.mjs";
import { RECORD_SUMMARY_LABEL } from "@/lib/sports/ufc/profile-copy.mjs";

const PANEL: React.CSSProperties = {
  background: "var(--vault-panel)",
  border: "1px solid var(--vault-rule)",
  borderRadius: 12,
  padding: "clamp(14px, 2vw, 20px)",
};

const LABEL = RECORD_SUMMARY_LABEL.replace(/:\s*$/, "");

/** The reason sentence without a leading copy of its own label. */
export function recordSummaryBody(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const t = reason.trim();
  const body = t.startsWith(RECORD_SUMMARY_LABEL) ? t.slice(RECORD_SUMMARY_LABEL.length).trim() : t;
  return body || null;
}

export default function UfcBoutWhy({ reason, modelled }: { reason?: string | null; modelled: boolean }) {
  const body = recordSummaryBody(reason);
  return (
    <div className="grid gap-3" data-bout-section="why">
      {body ? (
        <div style={PANEL} data-why-panel="record-summary">
          <h3 className="font-mono uppercase tracking-[0.1em] m-0" style={{ fontSize: 10, color: "var(--vault-text-faint)", fontWeight: 600 }}>
            {LABEL}
          </h3>
          <p className="m-0 mt-2" style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>{body}</p>
        </div>
      ) : null}

      <div style={PANEL} data-why-panel="model-inputs">
        <h3 className="m-0" style={{ fontSize: 15, fontWeight: 700, color: "var(--vault-text)" }}>What the model uses</h3>
        <p className="m-0 mt-1.5" style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
          The winner forecast comes from a logistic regression, recalibrated on earlier fights, that reads these inputs
          as differences between the two fighters{modelled ? "" : " (this bout has no forecast, so none of them is applied here)"}:
        </p>
        <ul className="m-0 mt-2 grid gap-1.5 list-disc" style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55, color: "var(--vault-text)" }}>
          {WINNER_INPUTS.map((x) => <li key={x.keys.join("+")}>{x.text}</li>)}
        </ul>
        <p className="m-0 mt-3" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>{OTHER_HEADS_NOTE}</p>
        <p className="m-0 mt-1.5" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>{NOT_USED_NOTE}</p>
        <p className="m-0 mt-3 rounded-[9px] px-3 py-2" data-why-panel="attribution-status"
          style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text)", border: "1px dashed var(--vault-rule)" }}>
          <strong>{ATTRIBUTION_HEADLINE}</strong> {ATTRIBUTION_STATUS}
        </p>
      </div>
    </div>
  );
}
