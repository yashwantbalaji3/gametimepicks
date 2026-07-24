/**
 * /ops — the internal, READ-ONLY ops dashboard (admin v1). Renders app/public/data/admin/status.json
 * (derived from canonical data by build-admin-status.mjs). It shows only figures already public on the
 * site, has NO write actions, is kept out of the nav, and is marked noindex. See docs/ADMIN_DASHBOARD_SPEC.md.
 */
import fs from "node:fs";
import path from "node:path";
import { guardInternalRoute } from "@/lib/internal-route-guard";
import { currentEtDate } from "@/lib/freshness";
import { readSinkConfig } from "@/lib/analytics/sink";
import { buildGrowthOpsView, NOT_YET_MEASURED } from "@/lib/analytics/growth-ops";
import { buildSocialOpsBoard } from "@/lib/social/social-ops";
import { buildAllGameDetails } from "@/lib/game-detail";

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
  productReadiness?: Record<string, string>;
  products: { bankBuilder: { activeLanes: number; lanes: Lane[] }; moonshot: { activeLanes: number; lanes: Lane[] } };
  counts?: { activeProducts: number; pendingApprovals: number };
  workflowHealth?: { lastRunAt?: string | null; ok?: boolean | null; status?: string | null; phase?: string | null; note?: string };
  warnings?: string[];
  dailyChecklist?: Array<{ step: string; done: boolean }>;
  lastSettlement: { date: string; matches: number } | null;
  nextSettlementDate?: string | null;
  nextRefreshDate?: string | null;
  nextAction: string;
};

const ROLES: Array<[string, string]> = [
  ["Ops Manager", "runs the daily loop · settles · deploys"],
  ["Quant Analyst", "reviews wins/losses · reliability weights"],
  ["Product Manager", "approves the daily card · product status"],
  ["QA Engineer", "render-audits every page"],
  ["UI/UX Designer", "nav · cards · visuals · mobile"],
  ["Data Engineer", "odds · props · schedules · portfolios"],
  ["Launch Manager", "deploy · smoke · release notes"],
  ["Content Analyst", "explanations · methodology copy"],
];
const DOCS: Array<[string, string]> = [
  ["Which Claude tool to use", "docs/CLAUDE_TOOL_USAGE_GUIDE.md"],
  ["CEO daily workflow", "docs/CEO_DAILY_WORKFLOW.md"],
  ["Daily runbook", "docs/DAILY_CLAUDE_RUNBOOK.md"],
  ["Prompt library", "docs/CLAUDE_PROMPT_LIBRARY.md"],
  ["Custom change workflow", "docs/CUSTOM_CHANGE_WORKFLOW.md"],
  ["Agent missions", "agents/<role>/mission.md"],
];

function loadStatus(): Status | null {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "admin", "status.json"), "utf8")); } catch { return null; }
}

// ── Growth-ops readers (internal repo artifacts; /ops is pruned from the public export) ──
const REPO_ROOT = path.dirname(process.cwd()); // `next build` runs with cwd = app/
function loadLatestSocialPack(): { pack: unknown; date: string | null } {
  try {
    const dir = path.join(REPO_ROOT, "data", "internal", "mlb", "social");
    const files = fs.readdirSync(dir).filter((f) => /^pack-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    if (!files.length) return { pack: null, date: null };
    const latest = files[files.length - 1];
    return { pack: JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8")), date: latest.slice(5, 15) };
  } catch { return { pack: null, date: null }; }
}
function loadApprovals(date: string | null): Record<string, string> {
  if (!date) return {};
  try { return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "data", "internal", "mlb", "social", `ops-approvals-${date}.json`), "utf8")); } catch { return {}; }
}
function latestMlbSlateDate(): string | null {
  try {
    const dir = path.join(process.cwd(), "public", "data", "mlb", "game-simulations");
    const dates = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
    return dates.length ? dates[dates.length - 1] : null;
  } catch { return null; }
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
  // Internal surface — 404 in the public static export (see internal-route-guard).
  guardInternalRoute();
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

  // ── Growth + Measurement (Sprint 006) — sink state, funnel (NOT YET MEASURED until live), health, social ops ──
  const growthToday = currentEtDate();
  const latestSlate = latestMlbSlateDate() ?? s.slate.mlbSlate ?? null;
  const { pack: socialPack, date: socialPackDate } = loadLatestSocialPack();
  const growth = buildGrowthOpsView({
    today: growthToday,
    latestSlate,
    latestSocialPack: socialPackDate,
    nowUtcHour: new Date().getUTCHours(),
    sinkConfig: readSinkConfig(),
  });
  const availableGamePaths = new Set(buildAllGameDetails().filter((d) => d.sport === "mlb" && d.slug).map((d) => `/games/mlb/${d.slug}`));
  const opsBoard = buildSocialOpsBoard(socialPack as Parameters<typeof buildSocialOpsBoard>[0], { today: growthToday, availableGamePaths, approvals: loadApprovals(socialPackDate) });

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

      {/* Company health + product readiness */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title="Company health">
          <div className="grid grid-cols-3 gap-3">
            {([["Active products", s.counts?.activeProducts ?? "—"], ["Pending approvals", s.counts?.pendingApprovals ?? "—"], ["Checklist", s.dailyChecklist ? `${s.dailyChecklist.filter((x) => x.done).length}/${s.dailyChecklist.length}` : "—"]] as const).map(([k, v]) => (
              <div key={k}><div className="font-mono text-[9px] uppercase" style={{ color: "var(--vault-text-faint)" }}>{k}</div><div className="font-display tabular text-[18px] font-bold" style={{ color: "var(--vault-text)" }}>{v}</div></div>
            ))}
          </div>
          {s.warnings && s.warnings.length ? (
            <div className="mt-3 flex flex-col gap-1">{s.warnings.map((w, i) => <div key={i} className="rounded px-2 py-1 text-[11px]" style={{ background: "rgba(242,54,69,0.08)", color: "var(--gtp-bank-heat)" }}>⚠ {w}</div>)}</div>
          ) : <div className="mt-3 text-[11px]" style={{ color: "var(--vault-success)" }}>✓ No missing-data warnings.</div>}
        </Card>

        <Card title="Product readiness">
          <div className="flex flex-col gap-1.5">
            {s.productReadiness ? Object.entries(s.productReadiness).map(([k, v]) => {
              const tone = /active|live/.test(v) ? "var(--vault-success)" : /awaiting|pending/.test(v) ? "var(--vault-gold)" : "var(--vault-text-faint)";
              return (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>{k.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase())}</span>
                  <span className="font-mono text-[10.5px]" style={{ color: tone }}>{v}</span>
                </div>
              );
            }) : <span className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>not wired</span>}
          </div>
        </Card>
      </div>

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title="Workflow health + schedule">
          <div className="flex flex-col gap-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
            {s.workflowHealth?.note ? (
              <span style={{ color: "var(--vault-text-faint)" }}>{s.workflowHealth.note}</span>
            ) : (
              <>
                <div>Last automated run: <span className="font-mono" style={{ color: s.workflowHealth?.ok ? "var(--vault-success)" : "var(--gtp-bank-heat)" }}>{s.workflowHealth?.status ?? "—"}</span> · {s.workflowHealth?.phase ?? "—"}</div>
                <div className="font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>{s.workflowHealth?.lastRunAt ? new Date(s.workflowHealth.lastRunAt).toISOString().slice(0, 16).replace("T", " ") + "Z" : "—"}</div>
              </>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
              <span>Next settlement: <span style={{ color: "var(--vault-text-mute)" }}>{s.nextSettlementDate ?? "—"}</span></span>
              <span>Next refresh: <span style={{ color: "var(--vault-text-mute)" }}>{s.nextRefreshDate ?? "—"}</span></span>
            </div>
          </div>
        </Card>

        <Card title="Daily checklist">
          <div className="flex flex-col gap-1">
            {(s.dailyChecklist ?? []).map((x, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span aria-hidden style={{ color: x.done ? "var(--vault-success)" : "var(--vault-text-faint)" }}>{x.done ? "✓" : "○"}</span>
                <span style={{ color: x.done ? "var(--vault-text-mute)" : "var(--vault-text)" }}>{x.step}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── GROWTH + MEASUREMENT (Sprint 006) ── */}
      <Card title={`Production health · slate ${growth.health.slateFreshness.toUpperCase()}`}>
        {growth.health.incident ? (
          <div className="mb-2 rounded px-2 py-1.5 text-[11.5px]" style={{ background: "rgba(242,54,69,0.1)", color: "var(--gtp-bank-heat)" }}>⚠ INCIDENT — {growth.health.incident}</div>
        ) : (
          <div className="mb-2 text-[11px]" style={{ color: "var(--vault-success)" }}>✓ Daily production within/at expectation.</div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([["Today (ET)", growth.health.today], ["Latest slate", growth.health.latestSlate ?? "—"], ["Latest brief", growth.health.latestBrief ?? "—"], ["Latest social pack", growth.health.latestSocialPack ?? "none"]] as const).map(([k, v]) => (
            <div key={k}><div className="font-mono text-[9px] uppercase" style={{ color: "var(--vault-text-faint)" }}>{k}</div><div className="font-mono text-[12px]" style={{ color: "var(--vault-text)" }}>{v}</div></div>
          ))}
        </div>
        <div className="mt-2 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>Analytics sink: <span style={{ color: growth.sink.state === "live" ? "var(--vault-success)" : growth.sink.state === "misconfigured" ? "var(--gtp-bank-heat)" : "var(--vault-text-mute)" }}>{growth.sink.state.toUpperCase()}</span> · endpoint {growth.sink.hasEndpoint ? "set" : "none"} · kill-switch {growth.sink.enabled ? "ON" : "OFF"}</div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title="Growth funnel (measurement)">
          <div className="flex flex-col gap-1">
            {growth.funnel.map((r) => (
              <div key={r.event} className="flex items-baseline justify-between text-[12px]">
                <span style={{ color: "var(--vault-text-mute)" }}>{r.step}</span>
                <span className="font-mono text-[10.5px]" style={{ color: r.value === NOT_YET_MEASURED ? "var(--vault-text-faint)" : "var(--vault-text)" }}>{r.value === NOT_YET_MEASURED ? "NOT YET MEASURED" : r.value}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>Real counts appear only when a live sink supplies them — never a fabricated zero.</p>
        </Card>
        <Card title="Acquisition source mix">
          <div className="grid grid-cols-2 gap-1">
            {growth.sourceMix.map((r) => (
              <div key={r.step} className="flex items-baseline justify-between text-[11.5px]">
                <span style={{ color: "var(--vault-text-mute)" }}>{r.step}</span>
                <span className="font-mono text-[10px]" style={{ color: r.value === NOT_YET_MEASURED ? "var(--vault-text-faint)" : "var(--vault-text)" }}>{r.value === NOT_YET_MEASURED ? "—" : r.value}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>Coarse buckets only · no cookies · no ad ids. NOT YET MEASURED until the sink is live.</p>
        </Card>
      </div>

      <Card title={`Social operations · ${opsBoard.launchable}/${opsBoard.slots.length} launchable · review only (never auto-posted)`}>
        <div className="flex flex-col gap-2">
          {opsBoard.slots.map((slot) => (
            <div key={slot.slot} className="rounded-lg px-3 py-2" style={{ border: `1px solid ${slot.blocked ? "rgba(242,54,69,0.4)" : "var(--vault-rule)"}`, background: slot.blocked ? "rgba(242,54,69,0.05)" : "rgba(255,255,255,0.015)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12px] font-semibold" style={{ color: "var(--vault-text)" }}>{slot.title}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.06em]" style={{ color: slot.blocked ? "var(--gtp-bank-heat)" : slot.approvalState === "approved" ? "var(--vault-success)" : "var(--vault-text-faint)" }}>{slot.blocked ? `blocked · ${slot.blocked}` : slot.approvalState}</span>
              </div>
              {slot.copy ? <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{slot.copy}</div> : null}
              <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>
                <span>→ {slot.destinationPath ?? "—"}</span>
                {slot.attributed.x ? <span>x: {slot.attributed.x}</span> : null}
                {slot.attributed.discord ? <span>discord: {slot.attributed.discord}</span> : null}
                <span>slate {slot.slateDate ?? "—"} · {slot.freshnessState}</span>
              </div>
              {slot.note ? <div className="mt-1 text-[10px]" style={{ color: "var(--gtp-bank-heat)" }}>{slot.note}</div> : null}
            </div>
          ))}
        </div>
        <p className="mt-2 font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>Approve by editing data/internal/mlb/social/ops-approvals-&lt;date&gt;.json · a human posts by hand · no posting API is wired.</p>
      </Card>

      <Card title="Claude team + playbooks">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 font-mono text-[9px] uppercase" style={{ color: "var(--vault-text-faint)" }}>Roles (hats you put on with a prompt)</div>
            <div className="flex flex-col gap-1">
              {ROLES.map(([r, d]) => (
                <div key={r} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                  <span className="font-semibold" style={{ color: "var(--vault-text)" }}>{r}</span>
                  <span style={{ color: "var(--vault-text-faint)" }}>— {d}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 font-mono text-[9px] uppercase" style={{ color: "var(--vault-text-faint)" }}>Playbooks (in the repo)</div>
            <div className="flex flex-col gap-1">
              {DOCS.map(([label, p]) => (
                <div key={p} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                  <span style={{ color: "var(--vault-text-mute)" }}>{label}</span>
                  <code className="font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>{p}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

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
