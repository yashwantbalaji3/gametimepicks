/**
 * /ops — the internal, READ-ONLY ops dashboard (admin v1). Renders app/public/data/admin/status.json
 * (derived from canonical data by build-admin-status.mjs). It shows only figures already public on the
 * site, has NO write actions, is kept out of the nav, and is marked noindex. See docs/ADMIN_DASHBOARD_SPEC.md.
 */
import fs from "node:fs";
import path from "node:path";

export const metadata = {
  title: "Ops · GameTime Picks (internal)",
  robots: { index: false, follow: false },
};

type Lane = { lane: string; status: string; step: number | null; legs: number; combinedOdds: number | null; stake: number | null; potentialReturn: number | null; selections: string[] };
type Status = {
  generatedAt: string;
  canonical: { record: string; bankroll: number; crown: number; drawdown: number; profit: number; roiMultiple: number | null; portfolioMd5: string } | null;
  moneyGate: { crownMinusDrawdownEqualsBankroll: boolean; dailyTracksCanonical: boolean; pass: boolean };
  slate: { date: string | null; activeBankroll: number; openExposure: number; worldCupGames: number; mlbGames: number; mlbSlate: string | null };
  products: { bankBuilder: { activeLanes: number; lanes: Lane[] }; moonshot: { activeLanes: number; lanes: Lane[] } };
  lastSettlement: { date: string; matches: number } | null;
  nextAction: string;
};

function loadStatus(): Status | null {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "admin", "status.json"), "utf8")); } catch { return null; }
}

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
const odds = (n: number | null) => (n == null ? "—" : n > 0 ? `+${n}` : `${n}`);

const GATES: Array<[string, string]> = [
  ["Money integrity", "npx tsx scripts/verify-money-integrity.mjs"],
  ["Forensic audit", "npx tsx scripts/forensic-money-audit.mjs"],
  ["Health", "npx tsx scripts/health-check.mjs --today <date>"],
  ["Types + tests", "npx tsc --noEmit -p tsconfig.json && npx tsx --test $(find src -name '*.test.mjs')"],
  ["Build + smoke", "npm run build && npx tsx scripts/smoke-test-production.mjs"],
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4 sm:p-5" style={{ border: "1px solid var(--vault-border)", background: "var(--lava-panel, rgba(255,255,255,0.02))" }}>
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)" }}>{title}</h2>
      {children}
    </section>
  );
}

function LaneRow({ l }: { l: Lane }) {
  const live = l.status === "active";
  return (
    <div className="rounded-lg px-3 py-2" style={{ border: `1px solid ${live ? "rgba(242,54,69,0.4)" : "var(--vault-rule)"}`, background: live ? "rgba(242,54,69,0.06)" : "rgba(255,255,255,0.015)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--vault-text)" }}>Lane {l.lane} · <span className="font-mono text-[10px] uppercase" style={{ color: live ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)" }}>{l.status}</span>{l.step ? <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}> · Step {l.step}</span> : null}</span>
        <span className="font-mono text-[11px] tabular" style={{ color: "var(--vault-text-mute)" }}>{usd(l.stake)} → {usd(l.potentialReturn)} · {odds(l.combinedOdds)}</span>
      </div>
      {l.selections.length ? <div className="mt-1 truncate font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{l.selections.join(" · ")}</div> : null}
    </div>
  );
}

export default function OpsPage() {
  const s = loadStatus();
  if (!s || !s.canonical) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-10">
        <h1 className="font-display text-[24px] font-bold" style={{ color: "var(--vault-text)" }}>Ops · internal</h1>
        <p className="mt-3 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>admin/status.json not found — regenerate with <code>npx tsx scripts/build-admin-status.mjs</code>.</p>
      </div>
    );
  }
  const c = s.canonical;
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)" }}>GameTime Picks · internal ops · read-only</div>
          <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 26, fontWeight: 800 }}>Ops dashboard</h1>
        </div>
        <span className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ border: `1px solid ${s.moneyGate.pass ? "var(--vault-success)" : "var(--gtp-bank-heat)"}`, color: s.moneyGate.pass ? "var(--vault-success)" : "var(--gtp-bank-heat)" }}>
          money gate {s.moneyGate.pass ? "PASS" : "FAIL"}
        </span>
      </header>

      <Card title="Canonical money (official settlement only)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {([["Record", c.record], ["Bankroll", usd(c.bankroll)], ["Crown", usd(c.crown)], ["Drawdown", usd(c.drawdown)], ["Profit", usd(c.profit)], ["ROI", c.roiMultiple ? `${c.roiMultiple}×` : "—"]] as const).map(([k, v]) => (
            <div key={k}>
              <div className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)" }}>{k}</div>
              <div className="font-display tabular text-[18px] font-bold" style={{ color: "var(--vault-text)" }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>portfolio.json md5 {c.portfolioMd5?.slice(0, 12)} · crown − drawdown = bankroll: {String(s.moneyGate.crownMinusDrawdownEqualsBankroll)} · daily tracks canonical: {String(s.moneyGate.dailyTracksCanonical)}</div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title={`Today's slate · ${s.slate.date ?? "—"}`}>
          <div className="grid grid-cols-2 gap-3">
            {([["World Cup games", s.slate.worldCupGames], ["MLB games", s.slate.mlbGames], ["Active bankroll", usd(s.slate.activeBankroll)], ["Open exposure", usd(s.slate.openExposure)]] as const).map(([k, v]) => (
              <div key={k}><div className="font-mono text-[9px] uppercase" style={{ color: "var(--vault-text-faint)" }}>{k}</div><div className="font-display tabular text-[16px] font-bold" style={{ color: "var(--vault-text)" }}>{v}</div></div>
            ))}
          </div>
          <div className="mt-2 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>Last settlement: {s.lastSettlement?.date ?? "—"}</div>
        </Card>

        <Card title="Next action">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text)" }}>{s.nextAction}</p>
          <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>Generated {s.generatedAt.slice(0, 16).replace("T", " ")}Z · derived, read-only</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title={`Bank Builder · ${s.products.bankBuilder.activeLanes} active`}>
          <div className="flex flex-col gap-2">{s.products.bankBuilder.lanes.length ? s.products.bankBuilder.lanes.map((l, i) => <LaneRow key={i} l={l} />) : <span className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>No lanes today.</span>}</div>
        </Card>
        <Card title={`Moonshot · ${s.products.moonshot.activeLanes} active`}>
          <div className="flex flex-col gap-2">{s.products.moonshot.lanes.length ? s.products.moonshot.lanes.map((l, i) => <LaneRow key={i} l={l} />) : <span className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>No lanes today.</span>}</div>
        </Card>
      </div>

      <Card title="The gates (run these — authoritative)">
        <div className="flex flex-col gap-1.5">
          {GATES.map(([k, cmd]) => (
            <div key={k} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="w-[110px] shrink-0 font-mono text-[10px] uppercase" style={{ color: "var(--vault-text-mute)" }}>{k}</span>
              <code className="overflow-x-auto rounded px-2 py-1 font-mono text-[10px]" style={{ background: "rgba(0,0,0,0.3)", color: "var(--vault-text-faint)" }}>{cmd}</code>
            </div>
          ))}
        </div>
        <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>Read-only view. Money changes only through official settlement. See docs/DAILY_CLAUDE_RUNBOOK.md.</p>
      </Card>
    </div>
  );
}
