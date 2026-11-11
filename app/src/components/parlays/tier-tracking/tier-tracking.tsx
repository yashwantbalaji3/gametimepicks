/**
 * PARLAY LAB · TIER PERFORMANCE on /build (checklist row H, 2026-11-11). Server component; every number comes from
 * lib/parlays/tier-tracking.mjs over the frozen card ledger + its official settlement. Mobile-first: one concise card
 * per tier, the window picked above (TierWindowTabs; with JavaScript off every window shows, stacked). Each count carries
 * its denominator; the hit record is "won of decided", a percentage only from the site's sample minimum. No ROI, payout,
 * price or odds exists here: "returns not tracked: no verified prices". The per-card history opens in a drawer.
 */
import TierWindowTabs from "./tier-window-tabs";
import CardHistoryDrawer from "./card-history-drawer";
import { hitText, RETURNS_NOTE } from "@/lib/parlays/tier-tracking.mjs";
import { etStamp } from "@/lib/et-stamp.mjs";

type Tally = { frozen: number; settled: number; won: number; lost: number; void: number; pending: number; decided: number; hit: { won: number; of: number; rate: number | null } };
type Model = {
  today: string; asOf: { recordedAt?: string | null; gradedAt?: string | null } | null; minDecidedForRate: number;
  windows: { key: string; label: string; total: Tally; tiers: (Tally & { tier: string; label: string; bySport: (Tally & { sport: string; label: string })[] })[] }[];
};
export type RecentCard = { id: string; productDay: string; tierLabel: string; label: string | null; sport: string; status: string; legs: string };

const ET = (iso: string | null | undefined) => (iso ? etStamp(iso) ?? "—" : "—");
const STATUS_WORD: Record<string, string> = { WON: "Won", LOST: "Lost", VOID: "Void", PENDING: "Pending" };

function Counts({ t }: { t: Tally }) {
  return (
    <dl className="ptt-counts">
      <div><dt>Frozen</dt><dd>{t.frozen}</dd></div>
      <div><dt>Settled</dt><dd>{t.settled} <span>of {t.frozen}</span></dd></div>
      <div><dt>Won · lost</dt><dd>{t.won} · {t.lost} <span>of {t.decided} decided</span></dd></div>
      <div><dt>Hit record</dt><dd data-ptt-hit="">{hitText(t.hit)}</dd></div>
    </dl>
  );
}

export default function TierTracking({ model, recent }: { model: Model; recent: RecentCard[] }) {
  return (
    <section id="tier-performance" aria-labelledby="ptt-h" className="ptt-root" data-parlay-tier-tracking="">
      <h2 id="ptt-h">Tier performance</h2>
      <p className="ptt-note">
        Every card is frozen when it is shown and graded only against the official final. Void and pending are never counted as
        losses. A hit rate shows from {model.minDecidedForRate} decided cards; below that, counts only. <b>{RETURNS_NOTE[0].toUpperCase() + RETURNS_NOTE.slice(1)}.</b>
        {model.asOf ? <> Record as of {ET(model.asOf.recordedAt)} (graded {ET(model.asOf.gradedAt)}).</> : null}
      </p>
      <TierWindowTabs windows={model.windows.map((w) => ({ key: w.key, label: w.label }))} />
      {model.windows.map((w) => (
        <div key={w.key} className="ptt-window" data-ptt-window={w.key}>
          <p className="ptt-total"><b>{w.label}</b> · {w.total.frozen} frozen · {w.total.settled} settled · {hitText(w.total.hit)}</p>
          {w.tiers.every((t) => t.frozen === 0) ? <p className="ptt-note">No card was frozen in this window.</p> : (
            <ul className="ptt-tiers">
              {w.tiers.filter((t) => t.frozen > 0).map((t) => (
                <li key={t.tier} className="ptt-card" data-ptt-tier={t.tier}>
                  <h3>{t.label}</h3>
                  <Counts t={t} />
                  {t.bySport.length > 1 || t.bySport[0]?.sport === "mixed" ? (
                    <table className="ptt-sports">
                      <caption className="sr-only">{t.label} by sport, {w.label}</caption>
                      <thead><tr><th scope="col">Sport</th><th scope="col">Frozen</th><th scope="col">Settled</th><th scope="col">Hit record</th></tr></thead>
                      <tbody>
                        {t.bySport.map((s) => (
                          <tr key={s.sport} data-ptt-sport={s.sport}><th scope="row">{s.label}</th><td>{s.frozen}</td><td>{s.settled} of {s.frozen}</td><td>{hitText(s.hit)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="ptt-sub">{t.bySport[0]?.label} only</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <h3 className="ptt-recent-h">Recent cards</h3>
      <ul className="ptt-recent">
        {recent.map((c) => (
          <li key={c.id}>
            <a href={`#card-${c.id}`} data-ptt-open={c.id} className="ptt-recent-row">
              <span className="ptt-sub">{c.productDay} · {c.tierLabel}</span>
              <span>{c.legs}</span>
              <span className={`ptt-status is-${c.status.toLowerCase()}`}>{STATUS_WORD[c.status] ?? c.status}</span>
            </a>
          </li>
        ))}
      </ul>
      <CardHistoryDrawer />
    </section>
  );
}
