import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { guardInternalRoute } from "@/lib/internal-route-guard";
import { currentEtDate } from "@/lib/freshness";
import { buildCompletionMatrix, ROADMAP_30D } from "@/lib/launch/completion-matrix.mjs";
import { buildExecutiveHealth } from "@/lib/launch/executive-health.mjs";
import { buildWorkBoard } from "@/lib/launch/work-board.mjs";
import { activationReadiness } from "@/lib/launch/activation-readiness.mjs";
import { buildTodayBoard, topActions } from "@/lib/launch/today-board.mjs";
import { ENGINES, ASSURED_ROUTES } from "@/lib/launch/browser-assurance.mjs";
import { RELEASE_HISTORY } from "@/lib/launch/release-history.mjs";
import { withCountdown, REALITY_GATED_WATCHES } from "@/lib/launch/watches.mjs";
import { founderActionSheet } from "@/lib/launch/shared-blockers.mjs";
import { buildClosurePackets, executionQueue } from "@/lib/launch/closure-packets.mjs";
import { RUNBOOKS, LIFECYCLE_LANES, validateRunbooks } from "@/lib/launch/runbook-registry.mjs";
import { FOUNDER_DECISIONS } from "@/lib/launch/founder-decisions.mjs";
import { readCurrentEvents, readProductReceipt, readRouteInventory, readEplCalibrationAuthority, readLadderReceipts } from "@/lib/launch/closure-packet-sources.mjs";
import { ALLOWED_CHOICES } from "@/lib/launch/founder-response.mjs";
import { IA_SECTIONS } from "@/lib/launch/ia-contract.mjs";
import { buildUiuxEvidence, P184_BASELINE } from "@/lib/launch/uiux-evidence.mjs";
import { buildProductExperience } from "@/lib/launch/product-experience.mjs";
import { buildSimulationExperience } from "@/lib/launch/simulation-experience.mjs";
import { buildDailyProductOps, buildForwardCoveragePanel } from "@/lib/launch/daily-product-ops.mjs";
import { WALKED_ROUTES, PAPER_ONLY_CEILINGS, CONTENT_CONTRACT_VERSION } from "@/lib/launch/public-content-contract.mjs";
import BoardFilters from "@/components/launch/board-filters";
import { sportColumn, DEPARTMENT_BUCKETS } from "@/lib/launch/completion-matrix.mjs";
import { SPORT_ASSESSMENTS } from "@/lib/sports/sport-assessments.mjs";
import { deriveOddsAvailability } from "@/lib/sports/odds/availability.mjs";
import { classifyOddsSecret } from "@/lib/sports/odds/snapshot-contract.mjs";
import { deriveReadinessRegistry } from "@/lib/sports/prediction-factory.mjs";
import {
  buildDepartments,
  buildSports,
  buildLaunchGates,
  recommendation,
  headlines,
  SCHEMA_VERSION,
} from "@/lib/launch/launch-contract.mjs";

export const metadata = { title: "Launch Command Center · GameTimePicks", robots: { index: false, follow: false } };

/**
 * FOUNDER LAUNCH COMMAND CENTER — internal only.
 *
 * SECURITY POSTURE (deliberate, and the reason there is no login here): the site is
 * `output: "export"`. There is no server, no session, and therefore no place to put real
 * authentication — a "login" on a static export is decoration. The repository's actual, proven
 * admin model is exclusion (`guardInternalRoute()` + `prune-internal-routes.mjs`) for the public
 * project, plus the SEPARATE host-protected internal deployment (docs/ADMIN_DEPLOYMENT_GTP_OPS.md)
 * where authentication is enforced by the host BEFORE any content bytes are served.
 *
 * Everything rendered is DERIVED from the scorecard checklist and launch contract. No number on
 * this page is hand-maintained. The shell is task-first (Program 167 · Release B): a persistent
 * left nav at desktop widths, a scrollable group strip on mobile, and the operator's daily loop
 * (Observe → Verify → Build → Release → Close) directly under Overview. Receipts close work.
 */
export default function LaunchCommandCenter() {
  guardInternalRoute();

  const etDate = currentEtDate();
  const h = headlines();
  const gates = buildLaunchGates();
  const rec = recommendation(gates);
  const departments = buildDepartments();
  const sports = buildSports();
  const workBoard = buildWorkBoard();
  const buildNowIso = new Date().toISOString(); // build-time clock: freshness is re-derived per render of the artifact, same convention as etDate
  const watches = withCountdown(buildNowIso);
  const todayBoard = buildTodayBoard({ board: workBoard, nowIso: buildNowIso });
  const top3 = topActions({ board: workBoard, nowIso: buildNowIso, limit: 3 });
  const allCards = [...Object.values(workBoard.columns).flat(), ...workBoard.founderQueue];
  const openP0 = allCards.filter((t) => t.priority === "P0").length;
  const openP1 = allCards.filter((t) => t.priority === "P1").length;
  // Sprint-week lanes derive from the build clock — never hard-coded calendar copy.
  const weekOf = (offset: number) => {
    const d = new Date(Date.parse(buildNowIso) + offset * 7 * 86400_000);
    return d.toISOString().slice(0, 10);
  };
  const SPRINT_LANES = [
    { week: `Week 1 · from ${weekOf(0)}`, theme: "Operational results + public comprehension", horizons: ["NOW", "DAYS_3_7"] },
    { week: `Week 2 · from ${weekOf(1)}`, theme: "Live-input + shadow readiness", horizons: ["WEEK_2"] },
    { week: `Week 3 · from ${weekOf(2)}`, theme: "Settlement, model cards, recovery", horizons: ["WEEKS_3_4"] },
    { week: `Week 4 · from ${weekOf(3)}`, theme: "Public-beta assurance", horizons: ["LATER"] },
  ];

  const APP = process.cwd();
  const readJson = (rel: string) => {
    try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data", rel), "utf8")); } catch { return null; }
  };

  /* Two axes, never conflated (P206): engineering readiness vs activation tier. */
  const readiness = activationReadiness();

  /*
   * The operating record's identity card (P203 · Release A). The record is GENERATED
   * (scripts/ops/build-operating-record.mjs) from the committed register; this card renders its
   * as-of stamp, program, register count and checksum FROM THE FILE ITSELF, so a stale record can
   * never silently look current here — if the file is missing or unparseable that state renders
   * in words instead.
   */
  const operatingRecord = (() => {
    try {
      const doc = fs.readFileSync(path.join(APP, "..", "data/internal/launch/operating-record.html"), "utf8");
      const gen = doc.match(/<span>Generated ([^<]+)<\/span><span>([^<]+)<\/span>/);
      const end = doc.match(/<!-- OPERATING-RECORD-END expected=(\d+) first=([^ ]+) last=([^ ]+) -->/);
      if (!end) return { state: "INVALID" as const, note: "end marker missing — regenerate before trusting any copy of the record" };
      const sha = crypto.createHash("sha256").update(doc).digest("hex").slice(0, 16);
      /* The FINAL-FILE checksum (P204 R-A): the verified PDF's own sha256 from the verifier's
         receipt — the bytes a person downloads, not only the source HTML. Absent receipt renders
         as unverified in words. */
      let pdfSha256: string | null = null;
      let integrity: "VERIFIED" | "MISMATCH" | "UNVERIFIED" = "UNVERIFIED";
      let contentAddressed: string | null = null;
      try {
        const receipt = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/launch/operating-record-pdf-receipt.json"), "utf8"));
        pdfSha256 = typeof receipt.pdfSha256 === "string" ? receipt.pdfSha256.slice(0, 16) : null;
        /*
         * ARTIFACT INTEGRITY (P205 R-A): the card is red the moment the DEPLOYABLE bytes disagree
         * with the verifier's receipt — the exact false-positive class the P0 named. Three-way
         * check: receipt sha ↔ the content-addressed console copy's actual bytes ↔ the manifest.
         */
        if (pdfSha256) {
          contentAddressed = `operating-record-${pdfSha256}.pdf`;
          const served = fs.readFileSync(path.join(APP, "public/data/admin", contentAddressed));
          const servedSha = crypto.createHash("sha256").update(served).digest("hex");
          const manifest = JSON.parse(fs.readFileSync(path.join(APP, "public/data/admin/operating-record-manifest.json"), "utf8"));
          integrity = servedSha === receipt.pdfSha256 && manifest.pdfSha256 === receipt.pdfSha256 ? "VERIFIED" : "MISMATCH";
        }
      } catch { integrity = "UNVERIFIED"; }
      return { state: "OK" as const, generatedAt: gen?.[1] ?? "unknown", program: gen?.[2] ?? "unknown", releases: Number(end[1]), first: end[2], last: end[3], sha, pdfSha256, integrity, contentAddressed };
    } catch {
      return { state: "MISSING" as const, note: "data/internal/launch/operating-record.html has not been generated" };
    }
  })();

  /*
   * Closure packets (P196 · Release A): the completion control plane. Built at page build from the
   * SAME authorities every other section reads — a contradiction THROWS here and fails the build,
   * which is the point: this page cannot render a contradiction as a warning chip.
   */
  const closure = buildClosurePackets({
    assessments: SPORT_ASSESSMENTS,
    tickets: allCards,
    watches: [...REALITY_GATED_WATCHES],
    founderGates: founderActionSheet().map((b) => ({ ...b, sport: b.id.match(/blocker-(mlb|nfl|epl|ufc|nba)/)?.[1] ?? null })),
    currentEvents: readCurrentEvents({ appDir: APP, nowIso: buildNowIso }),
    productReceipt: readProductReceipt({ appDir: APP }),
    routeInventory: readRouteInventory({ appDir: APP }),
    calibrationAuthorities: { epl: readEplCalibrationAuthority({ appDir: APP }) },
    ladderReceipts: readLadderReceipts({ appDir: APP }),
    nowIso: buildNowIso,
  });
  const closureQueue = executionQueue(closure);
  const board = readJson(`mlb/boards/${etDate}.json`);
  // Protected money integrity — rendered from the artifact the sole settlement writer owns.
  // This page can only READ it; a mismatch against expectations is a stop-and-inspect incident.
  const money = readJson("mr-dub/daily-portfolio.json");
  // Evidence ledger (Program 144 · Release B). Rendered, never recomputed — the ledger generator
  // owns classification and contradiction detection; this page shows its output verbatim so the
  // command center and the artifact can never disagree.
  const ledger = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data/admin/evidence-ledger.json"), "utf8")); }
    catch { return null; }
  })();

  // Internal Alpha progress. Read from the artifact the generator commits — this page renders it,
  // it never recomputes it, so /launch and ops/internal-alpha can never disagree.
  const productTruth = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/audits/product-truth-v1.json"), "utf8")); }
    catch { return null; }
  })();

  /* P211 · Release F: Daily Product Operations + Forward Coverage — rendered verbatim from the
     one writer's dated artifacts; absence types as the finding. */
  const dailyOps = buildDailyProductOps({ appDir: APP });
  const forwardCov = buildForwardCoveragePanel({ appDir: APP });

  /* Program 185 · the UI/UX audit, derived from its committed artifact — never typed here. */
  const uiux = buildUiuxEvidence();
  const px = buildProductExperience();
  const sx = buildSimulationExperience();
  const routeInventory = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/audits/route-inventory-v1.json"), "utf8")); }
    catch { return null; }
  })();

  const modelRegistry = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/model-registry-v1.json"), "utf8")); }
    catch { return null; }
  })();

  const alpha = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(APP, "..", "ops/internal-alpha/latest.json"), "utf8")); }
    catch { return null; }
  })();

  // NFL lane (Program 171 · Release G). Every field is DERIVED by build-nfl-lane-status.mjs from
  // committed receipts; a missing artifact renders UNKNOWN here, never green.
  const nflLane = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data/admin/nfl-lane.json"), "utf8")); }
    catch { return null; }
  })();

  // Executive health (Program 172 · Release J): nine lanes, each derived from a receipt and
  // carrying the path that proves it. Worst-of overall — one incident is never averaged away.
  const readRoot = (rel: string) => { try { return JSON.parse(fs.readFileSync(path.join(APP, "..", rel), "utf8")); } catch { return null; } };
  const health = (() => {
    try {
      return buildExecutiveHealth({
        nowIso: buildNowIso,
        etDate,
        adminStatus: readJson("admin/status.json"),
        productReceipt: readRoot(`data/internal/products/receipts/${etDate}.json`),
        nflLane,
        nflStatus: readJson("nfl/model-status.json"),
        settlementReceipt: readRoot(`data/internal/nfl/settlement/${etDate}.json`),
        buildInfo: readJson("build-info.json"),
      });
    } catch { return null; }
  })();
  const covered = board ? new Set(board.leans.map((l: { gamePk: number }) => l.gamePk)).size : null;

  const tasks = departments.flatMap((d) => d.tasks);
  const engineering = tasks.filter((t) => t.owner_type === "ENGINEERING");
  const founder = tasks.filter((t) => t.owner_type === "FOUNDER");
  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 } as Record<string, number>;
  const byPriority = (a: { priority: string }, b: { priority: string }) => rank[a.priority] - rank[b.priority];

  const tone = (s: string) =>
    s === "PASS" || s === "HEALTHY" || s === "PRODUCTION_PROVEN" ? "var(--gtp-success-on-dark)"
    : s === "FAIL" || s === "BLOCKED" ? "var(--vault-danger, var(--vault-loss-red))"
    : s === "PARTIAL" || s === "WATCH" || s === "AT_RISK" ? "var(--vault-gold-bright)"
    : "var(--vault-text-mute)";

  const Cell = ({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) => (
    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: mono ? "var(--font-mono, monospace)" : undefined, verticalAlign: "top" }}>{children}</td>
  );
  const Head = ({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) => (
    <th scope="col" style={{ padding: "7px 10px", textAlign: align, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)", fontWeight: 600 }}>{children}</th>
  );

  const completionMatrix = buildCompletionMatrix(SPORT_ASSESSMENTS);
  const gateTotal = DEPARTMENT_BUCKETS.flatMap((b) => b.stages).length;
  const nOf12 = (sp: string) => {
    const col = sportColumn(SPORT_ASSESSMENTS[sp as keyof typeof SPORT_ASSESSMENTS]);
    const stages = DEPARTMENT_BUCKETS.flatMap((b) => col[b.id].stages);
    return { proven: stages.filter((st: { status: string }) => st.status === "PROVEN").length, total: gateTotal, stages };
  };

  const navRule = "Receipts close work — a browser action can close nothing here.";

  // Odds lane (Program 167 · Release C): one fail-closed classifier per expansion sport. No
  // contract snapshots are committed yet, so states derive from secret presence + receipts —
  // honestly different per environment (the key lives in CI, not local builds).
  const oddsSecret = classifyOddsSecret(process.env);
  const oddsLane = Object.fromEntries(
    (["nfl", "ufc", "epl", "nba"] as const).map((sp) => [
      sp,
      deriveOddsAvailability({ sport: sp, nowIso: buildNowIso, secretState: oddsSecret.state as "PRESENT" | "BLOCKED_EXTERNAL" | "CONFIG_INVALID" }),
    ]),
  );

  return (
    <>
      {/* Shell styles: media queries and :focus-visible cannot be inline styles. Classes only —
          no global tag rules — so nothing outside /launch is touched. */}
      <style>{`
        .lc-shell { max-width: 1420px; margin: 0 auto; padding: 0 20px 72px; }
        .lc-sidebar { display: none; }
        .lc-tabs { position: sticky; top: 0; z-index: 5; background: var(--vault-bg, #14100c); border-bottom: 1px solid var(--vault-border); margin: 0 -20px; padding: 8px 20px; display: flex; gap: 14px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .lc-tabs a, .lc-sidebar a { font-size: 11.5px; text-decoration: none; color: var(--vault-text-mute); white-space: nowrap; padding: 2px; border-radius: 4px; }
        .lc-tabs a:hover, .lc-sidebar a:hover { color: var(--vault-text); }
        .lc-chip:focus-visible, .lc-tabs a:focus-visible, .lc-sidebar a:focus-visible, .lc-skip:focus-visible { outline: 2px solid var(--vault-gold-bright); outline-offset: 2px; }
        .lc-skip { position: absolute; left: -9999px; }
        .lc-skip:focus-visible { position: static; display: inline-block; padding: 4px 10px; }
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
        @media (min-width: 1100px) {
          .lc-shell { display: grid; grid-template-columns: 216px minmax(0, 1fr); gap: 0 28px; }
          .lc-tabs { display: none; }
          .lc-sidebar { display: block; position: sticky; top: 0; align-self: start; max-height: 100vh; overflow-y: auto; padding: 18px 0 24px; border-right: 1px solid var(--vault-border); }
          .lc-sidebar nav { display: grid; gap: 7px; padding-right: 14px; }
          .lc-topbar, .lc-content { grid-column: 2; }
        }
      `}</style>

      <div className="lc-shell">
        <a href="#lc-content" className="lc-skip">Skip to console content</a>

        {/* ── Persistent left nav (desktop) — rendered FROM the IA contract so menu and truth
               cannot drift; the same contract renders the mobile strip below. ─────────────── */}
        <aside className="lc-sidebar" aria-label="Command center navigation">
          <p style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--vault-gold-bright)", margin: "0 0 10px" }}>
            Command center
          </p>
          <nav aria-label="Command center sections">
            {IA_SECTIONS.map((g) => (
              <a key={g.group} href={`#${g.anchors[0]}`} title={`authority: ${g.authority}`}>
                {g.group}
              </a>
            ))}
          </nav>
          <p style={{ fontSize: 10.5, color: "var(--vault-text-faint)", marginTop: 14, paddingRight: 14, lineHeight: 1.5 }}>{navRule}</p>
        </aside>

        <div className="lc-content" id="lc-content">
          {/* ── Compact top bar: environment · commit · as-of · freshness convention ────── */}
          <header className="lc-topbar" style={{ margin: "18px 0 8px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "baseline" }}>
              <p style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--vault-gold-bright)", margin: 0 }}>
                Internal · not deployed publicly
              </p>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", border: "1px solid var(--vault-border-strong)", borderRadius: 999, padding: "1px 8px", color: "var(--vault-text-mute)" }}>
                env: {process.env.NEXT_PUBLIC_BUILD_ENV || "internal build"} · read-only
              </span>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", border: "1px solid var(--vault-border-strong)", borderRadius: 999, padding: "1px 8px", color: "var(--vault-text-mute)" }}>
                commit {process.env.NEXT_PUBLIC_BUILD_SHA || "unstamped"}
              </span>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-faint)" }}>
                as of {buildNowIso} (build clock; freshness re-derives from artifacts)
              </span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 6 }}>Launch Command Center</h1>
            <p style={{ color: "var(--vault-text-mute)", fontSize: 13, marginTop: 6 }}>
              Slate {etDate} · schema v{SCHEMA_VERSION} · every figure derived from committed evidence owners — nothing here is hand-maintained. A browser action can close nothing; receipts close work.
            </p>
          </header>

          {/* Mobile group strip — same contract, scrollable, keyboard-reachable. */}
          <nav className="lc-tabs" aria-label="Command center sections (mobile)">
            {IA_SECTIONS.map((g) => (
              <a key={g.group} href={`#${g.anchors[0]}`} title={`authority: ${g.authority}`}>
                {g.group}
              </a>
            ))}
          </nav>

          <main>
            {/* ════ OVERVIEW ══════════════════════════════════════════════════════════════ */}
            {/* ── Health strip (P162 · Release C): the console's first row. Every tile links to
                   the evidence section it summarizes — a tile is a doorway, never the proof. ── */}
            <section id="health" aria-label="Health strip" style={{ margin: "18px 0 26px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                {[
                  { href: "#ledger", label: "Evidence ledger", value: ledger ? `${ledger.counts?.HEALTHY ?? 0} healthy · ${(ledger.contradictions ?? []).length} contradictions` : "not generated", bad: !ledger || (ledger.contradictions ?? []).length > 0 },
                  { href: "#product-truth", label: "Product truth", value: productTruth ? `${productTruth.totals.facts} facts · ${productTruth.totals.p0} P0` : "not generated", bad: !productTruth || productTruth.totals.p0 > 0 },
                  { href: "#routes-assurance", label: "Routes + boundary", value: routeInventory ? `${routeInventory.totals.routes} routes · ${routeInventory.totals.internal} internal excluded · ${routeInventory.totals.p0} P0` : "not generated", bad: !routeInventory || routeInventory.totals.p0 > 0 },
                  { href: "#today-queue", label: "Protected money", value: money ? `$${Number(money.activeBankroll).toLocaleString("en-US", { minimumFractionDigits: 2 })} · exposure $${Number(money.openExposure).toFixed(0)}` : "artifact unreadable — inspect", bad: !money || Number(money.openExposure) !== 0 },
                  { href: "#board", label: "Open P0 / P1", value: `${openP0} P0 · ${openP1} P1`, bad: openP0 > 0 },
                  { href: "#board", label: "Engineering WIP", value: `${(workBoard.columns.IN_PROGRESS ?? []).length} in progress`, bad: false },
                  { href: "#queues", label: "Founder queue", value: `${workBoard.founderQueue.length} waiting on founder`, bad: false },
                  { href: "#watches", label: "Next observation", value: watches[0] ? `${watches[0].sport.toUpperCase()} · ${watches[0].due ? "due now" : `${watches[0].hoursUntil}h`}` : "none", bad: false },
                ].map((t) => (
                  <a key={t.label} href={t.href} style={{ display: "block", padding: "10px 12px", borderRadius: 10, textDecoration: "none", border: `1px solid ${t.bad ? "var(--vault-danger-dim, color-mix(in srgb, var(--vault-danger) 40%, transparent))" : "var(--vault-border)"}`, background: "var(--vault-panel)" }}>
                    <span style={{ display: "block", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{t.label}</span>
                    <span style={{ display: "block", marginTop: 4, fontSize: 12.5, fontWeight: 600, color: t.bad ? "var(--vault-danger)" : "var(--vault-text)" }}>{t.value}</span>
                  </a>
                ))}
              </div>
            </section>

            {/* ── Executive health strip (P172-J): nine lanes, each DERIVED from a receipt and
                 carrying the path that proves it. Ordered worst-first so one incident is never
                 buried under greens; overall is worst-of, never an average. ──────────────── */}
            {health ? (
              <section aria-labelledby="exec-health" style={{ marginBottom: 26 }}>
                <h2 id="exec-health" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                  Executive health · <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12, color: tone(health.overall === "HEALTHY" ? "PASS" : health.overall === "INCIDENT" ? "FAIL" : "PARTIAL") }}>{health.overall}</span>
                </h2>
                <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "var(--vault-text-mute)" }}>
                  Worst-of across nine lanes for {health.etDate}. Every state is derived from the evidence path shown; a lane with no receipt reads UNKNOWN, never green.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
                  {health.ordered.map((l: { id: string; label: string; state: string; detail: string; evidence: string; nextAction: string | null }) => (
                    <div key={l.id} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "9px 11px" }}>
                      <p style={{ margin: 0, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <strong style={{ fontSize: 12.5 }}>{l.label}</strong>
                        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10.5, color: tone(l.state === "HEALTHY" ? "PASS" : l.state === "INCIDENT" ? "FAIL" : l.state === "HOLDING" ? "" : "PARTIAL") }}>{l.state}</span>
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 11.5, lineHeight: 1.45, color: "var(--vault-text-mute)" }}>{l.detail}</p>
                      {l.nextAction ? <p style={{ margin: "4px 0 0", fontSize: 11, lineHeight: 1.4, color: "var(--vault-gold)" }}>→ {l.nextAction}</p> : null}
                      <p style={{ margin: "4px 0 0", fontSize: 10, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-faint)", wordBreak: "break-all" }}>{l.evidence}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* ── Executive overview: four SEPARATE headlines ─────────────────────────────── */}
            <section aria-labelledby="exec" style={{ marginBottom: 30 }}>
              <h2 id="exec" style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Executive overview</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {[
                  ["Platform engineering", h.platformEngineering],
                  ["Live product readiness", h.liveProductReadiness],
                  ["Business / GTM", h.businessGtm],
                  ["Overall company", h.overallCompany],
                ].map(([label, v]) => {
                  const val = v as { pct: number; basis: string };
                  return (
                    <div key={label as string} style={{ border: "1px solid var(--vault-border)", borderRadius: 12, padding: "14px 16px" }}>
                      <p style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--vault-text-faint)" }}>{label as string}</p>
                      <p style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>{val.pct}%</p>
                      <p style={{ fontSize: 11, color: "var(--vault-text-mute)", marginTop: 4, lineHeight: 1.45 }}>{val.basis}</p>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 14, border: "1px solid var(--vault-border-strong)", borderRadius: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--vault-text-faint)" }}>Launch recommendation</p>
                <p style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: tone(rec === "PUBLIC_GO" ? "PASS" : "PARTIAL") }}>{rec.replace(/_/g, " ")}</p>
                <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginTop: 6, lineHeight: 1.5 }}>
                  Derived from the launch gates in Sports, never from the engineering score. Platform completion of{" "}
                  {h.platformEngineering.pct}% cannot by itself produce a public go — {gates.filter((g) => g.status !== "PASS").length} gates are
                  not passing, and {gates.filter((g) => g.owner === "FOUNDER" && g.status !== "PASS").length} of those are founder-owned.
                </p>
              </div>
            </section>

            {/* ════ TODAY ═════════════════════════════════════════════════════════════════ */}
            {/* ── The operator's daily loop — top actions first, then the five phases. All of it
                   is buildTodayBoard()/topActions() over the SAME board — no second truth store. */}
            <section aria-labelledby="today-queue" style={{ marginBottom: 30 }}>
              <h2 id="today-queue" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Today · the operating loop</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                Observe → Verify → Build → Release → Close. Cards are the work board&apos;s own (same ids), grouped by state;
                the countdown comes from the committed watches. Nothing here can be checked off — receipts close work.
              </p>

              <div style={{ border: "1px solid var(--vault-border-strong)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-gold-bright)" }}>
                  Top three actions, in order
                </p>
                <ol style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 6 }}>
                  {top3.map((a) => (
                    <li key={a.id} style={{ fontSize: 12.5 }}>
                      <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10.5, color: a.priority === "P0" ? "var(--vault-danger)" : "var(--vault-text-faint)" }}>
                        {a.phase} · {a.priority}
                      </span>{" "}
                      <strong>{a.title}</strong>
                      <span style={{ display: "block", color: "var(--vault-text-mute)", fontSize: 12 }}>Do: {a.nextAction}</span>
                      <span style={{ display: "block", color: "var(--vault-text-faint)", fontSize: 11 }}>Closes with: {a.acceptance}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
                {todayBoard.phases.map((ph) => (
                  <div key={ph.id} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px" }}>
                    <h3 style={{ margin: 0, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--vault-text-mute)" }}>
                      {ph.title} · {ph.cards.length}{"founderQueueCount" in ph ? ` (+${(ph as { founderQueueCount: number }).founderQueueCount} founder)` : ""}
                    </h3>
                    <p style={{ margin: "4px 0 8px", fontSize: 11, color: "var(--vault-text-faint)" }}>{ph.question}</p>
                    {"standing" in ph ? (
                      <p style={{ margin: 0, fontSize: 11.5, color: "var(--vault-text-mute)", lineHeight: 1.5 }}>
                        {(ph as { standing: string }).standing} <a href="#history" style={{ color: "var(--vault-gold-bright)" }}>Release History →</a>
                      </p>
                    ) : ph.cards.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 11.5, color: "var(--vault-text-faint)" }}>empty — nothing in this phase right now, which is an answer, not an outage</p>
                    ) : (
                      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 7 }}>
                        {ph.cards.slice(0, 6).map((c) => (
                          <li key={c.id} style={{ borderTop: "1px solid var(--vault-rule)", paddingTop: 6 }}>
                            <details>
                              <summary style={{ cursor: "pointer", fontSize: 12 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 10.5, color: c.priority === "P0" ? "var(--vault-danger)" : "var(--vault-text-faint)" }}>{c.priority}</span>{" "}
                                {c.title}
                                {"watch" in c && (c as { watch: { due: boolean; overdue: boolean; hoursUntil: number } | null }).watch ? (
                                  <span style={{ fontFamily: "monospace", fontSize: 10.5, color: (c as { watch: { overdue: boolean } }).watch.overdue ? "var(--vault-danger)" : (c as { watch: { due: boolean } }).watch.due ? "var(--vault-gold-bright)" : "var(--vault-text-faint)" }}>
                                    {" "}· {(c as { watch: { overdue: boolean; due: boolean; hoursUntil: number } }).watch.overdue ? "OVERDUE" : (c as { watch: { due: boolean } }).watch.due ? "DUE" : `in ${(c as { watch: { hoursUntil: number } }).watch.hoursUntil}h`}
                                  </span>
                                ) : null}
                              </summary>
                              <div style={{ fontSize: 11.5, color: "var(--vault-text-mute)", marginTop: 5, display: "grid", gap: 2 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 10.5, color: "var(--vault-text-faint)" }}>{c.id} · {c.sport} · owner {c.owner}{c.horizon ? ` · ${c.horizon}` : ""}</span>
                                {c.blocker ? <span>Blocker: {c.blocker}</span> : null}
                                <span>Next: {c.nextAction}</span>
                                <span>Accept: {c.acceptance}</span>
                                {c.evidence ? <span style={{ color: "var(--vault-text-faint)" }}>Evidence: {c.evidence}</span> : null}
                              </div>
                            </details>
                          </li>
                        ))}
                        {ph.cards.length > 6 ? (
                          <li style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
                            +{ph.cards.length - 6} more — <a href="#board" style={{ color: "var(--vault-gold-bright)" }}>filter the full board</a>
                          </li>
                        ) : null}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* ── Today's slate (MLB reference pipeline) ──────────────────────────────────── */}
            <section aria-labelledby="today" style={{ marginBottom: 30 }}>
              <h2 id="today" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Today&apos;s slate</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <caption className="sr-only">Current slate state for {etDate}</caption>
                <tbody>
                  {[
                    ["Slate date", etDate],
                    ["Scheduled events", board ? String(board.games.length) : "no board"],
                    ["Events with market coverage", board ? `${covered} of ${board.games.length}` : "—"],
                    ["Official rows", board ? String(board.leans.length) : "—"],
                    ["Board generated", board?.generatedAt ?? "—"],
                    ["Odds credits", board?.credits ? `${board.credits.before} → ${board.credits.after} (spent ${board.credits.spent})` : "—"],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <Cell>{k}</Cell>
                      <Cell mono>{v}</Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* ════ DAILY PRODUCT OPERATIONS (P211 R-F) ═══════════════════════════════════ */}
            <section aria-labelledby="daily-ops" style={{ marginBottom: 30 }}>
              <h2 id="daily-ops" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Daily Product Operations · Bank Builder & Moonshot</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                Rendered verbatim from the daily receipt writer&apos;s artifact ({dailyOps.present ? `${dailyOps.date} · generated ${dailyOps.generatedAt}` : "absent"}) — lifecycle states typed by the closed machine, policy versions frozen in R-B, nothing hand-set.
              </p>
              {dailyOps.present ? (
                <>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <caption className="sr-only">Daily signature-product lifecycle for {dailyOps.date}</caption>
                    <thead>
                      <tr>{["Product", "Lifecycle", "Policy", "Evaluated", "Rejected", "Exposure", "Last transition"].map((h) => <Head key={h}>{h}</Head>)}</tr>
                    </thead>
                    <tbody>
                      {dailyOps.products.map((p: any) => (
                        <tr key={p.product}>
                          <Cell>{p.label}</Cell>
                          <Cell mono>{p.state}{p.incident ? ` · ${p.incident}` : ""}</Cell>
                          <Cell mono>{p.policyVersion}</Cell>
                          <Cell mono>{String(p.evaluated)}</Cell>
                          <Cell mono>{String(p.rejected)}</Cell>
                          <Cell mono>{`$${p.exposure.toFixed(2)}`}</Cell>
                          <Cell mono>{p.lastTransition ?? "—"}</Cell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: 11, color: "var(--vault-text-mute)", marginTop: 6 }} className="font-mono">
                    watchdog: {dailyOps.watchdog.length ? dailyOps.watchdog.map((a: any) => `${a.product}:${a.kind}`).join(" · ") : "quiet — no missing evaluation, no stale card, no overdue result, no open incident"}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 12, color: "var(--vault-loss-red)" }} className="font-mono">{dailyOps.finding}</p>
              )}
            </section>

            {/* ════ FORWARD COVERAGE (P211 R-F) ═══════════════════════════════════════════ */}
            <section aria-labelledby="forward-cov" style={{ marginBottom: 30 }}>
              <h2 id="forward-cov" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Forward Coverage · by sport</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                What each sport actually covers ahead of now — scheduled vs priced vs generated vs started — reconciled by construction to the canonical artifacts the public surfaces read ({forwardCov.present ? `${forwardCov.date} · generated ${forwardCov.generatedAt}` : "absent"}).
              </p>
              {forwardCov.present ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <caption className="sr-only">Forward coverage for {forwardCov.date}</caption>
                  <thead>
                    <tr>{["Sport", "State", "Scheduled", "Priced", "Generated", "Started", "Findings"].map((h) => <Head key={h}>{h}</Head>)}</tr>
                  </thead>
                  <tbody>
                    {forwardCov.sports.map((sp: any) => (
                      <tr key={sp.sport}>
                        <Cell mono>{sp.sport.toUpperCase()}</Cell>
                        <Cell mono>{sp.state}</Cell>
                        <Cell mono>{sp.counts ? String(sp.counts.scheduled) : "—"}</Cell>
                        <Cell mono>{sp.counts ? String(sp.counts.priced) : "—"}</Cell>
                        <Cell mono>{sp.counts ? String(sp.counts.generated) : "—"}</Cell>
                        <Cell mono>{sp.counts ? String(sp.counts.started) : "—"}</Cell>
                        <Cell>{sp.findings.length ? sp.findings.join(" | ") : sp.reason ?? "clean"}</Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ fontSize: 12, color: "var(--vault-text-mute)" }} className="font-mono">{forwardCov.finding}</p>
              )}
            </section>

            {/* ════ UX ASSURANCE (P213 R-G) ═══════════════════════════════════════════════ */}
            <section aria-labelledby="ux-assurance" style={{ marginBottom: 30 }}>
              <h2 id="ux-assurance" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>UX Assurance · public-content contract v{CONTENT_CONTRACT_VERSION}</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                The page-by-page walk&apos;s editorial decisions, rendered from the versioned contract the
                boilerplate ratchet enforces ({Object.keys(PAPER_ONLY_CEILINGS).length} routes under ceilings). Nothing here is hand-set.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <caption className="sr-only">Walked public routes and their copy decisions</caption>
                <thead>
                  <tr>{["Route", "Purpose", "First action", "Decisions", "Measured"].map((h) => <Head key={h}>{h}</Head>)}</tr>
                </thead>
                <tbody>
                  {WALKED_ROUTES.map((r: any) => (
                    <tr key={r.route}>
                      <Cell mono>{r.route}</Cell>
                      <Cell>{r.purpose}</Cell>
                      <Cell mono>{r.firstAction ?? "—"}</Cell>
                      <Cell>{r.pending ? r.pending : r.decisions.length ? r.decisions.map((d: any) => `${d.decision}: ${d.block}`).join(" · ") : "no changes needed"}</Cell>
                      <Cell mono>{r.measured?.routeWordsBefore != null ? `${r.measured.routeWordsBefore}${r.measured.routeWordsAfter != null ? `→${r.measured.routeWordsAfter}` : ""} words` : "—"}</Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* ════ SPORTS ════════════════════════════════════════════════════════════════ */}
            {/* ── Per-league pipeline state: N/12 first, then the archive view. ───────────── */}
            <section aria-labelledby="sports" style={{ marginBottom: 30 }}>
              <h2 id="sports" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Sports · pipeline state</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8, marginBottom: 14 }}>
                {(["mlb", "nfl", "ufc", "epl", "nba"] as const).map((sp) => {
                  const g = nOf12(sp);
                  const nextStage = g.stages.find((st: { status: string }) => st.status !== "PROVEN");
                  return (
                    <div key={sp} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ margin: 0, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <strong style={{ fontSize: 13 }}>{sp.toUpperCase()}</strong>
                        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12, color: g.proven === g.total ? "var(--gtp-success-on-dark)" : "var(--vault-text-mute)" }}>{g.proven}/{g.total}</span>
                      </p>
                      <p style={{ margin: "5px 0 0", fontSize: 11, color: "var(--vault-text-mute)", lineHeight: 1.45 }}>
                        {g.proven === g.total ? "every gate stage proven — the live reference pipeline" : nextStage ? <>next gate: <strong>{nextStage.id}</strong> ({nextStage.status})</> : "—"}
                      </p>
                      <p style={{ margin: "5px 0 0", fontSize: 10.5, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-faint)" }} title={sp === "mlb" ? "MLB odds run the proven daily pipeline with its own credit guards" : oddsLane[sp].reason}>
                        odds lane: {sp === "mlb" ? "LIVE (own guarded pipeline)" : oddsLane[sp].state}
                      </p>
                    </div>
                  );
                })}
              </div>
              {/* NFL lane (P171-G) — the event-window operator screen. Every value below is
                  DERIVED from a committed receipt by build-nfl-lane-status.mjs; absent evidence
                  renders UNKNOWN. Nothing here is typed by hand and nothing is actionable from
                  the browser: receipts close work. */}
              {nflLane ? (
                <div style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                  <p style={{ margin: 0, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13 }}>NFL lane · event window</strong>
                    <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10.5, color: "var(--vault-text-faint)" }}>derived {nflLane.generatedAt}</span>
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 12 }}>
                    {nflLane.nextWindow?.matchup
                      ? <>next: <strong>{nflLane.nextWindow.matchup}</strong> {nflLane.nextWindow.kickoffUtc} (T−{nflLane.nextWindow.hoursToKickoff}h) · {nflLane.nextWindow.eventsInWindow} events ahead</>
                      : <span style={{ color: "var(--vault-text-mute)" }}>{nflLane.nextWindow?.detail ?? "UNKNOWN"}</span>}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8, marginTop: 10 }}>
                    {[
                      ["freshness", Object.entries(nflLane.freshness).map(([k, v]) => `${k}:${(v as { state: string }).state}`).join(" · ")],
                      ["markets", nflLane.markets?.state === "CAPTURED" ? `${nflLane.markets.events} events · ${nflLane.markets.books} books · ${nflLane.markets.capturedAt}` : nflLane.markets?.detail ?? "UNKNOWN"],
                      ["credits", nflLane.credits?.detail ?? "UNKNOWN"],
                      ["artifacts", nflLane.currentArtifacts?.detail ?? "UNKNOWN"],
                      ["models", Object.entries(nflLane.models).map(([k, v]) => `${k}:${(v as { state: string }).state}`).join(" · ")],
                      ["props promotion", Object.entries(nflLane.models?.playerProps?.promotion ?? {}).map(([k, v]) => `${k.replace("player_", "")}:${v}`).join(" · ") || "UNKNOWN"],
                      ["vault", nflLane.vault?.state ? `${nflLane.vault.state} ${nflLane.vault.date ?? ""} · ${nflLane.vault.corrections} correction(s)` : "UNKNOWN"],
                      ["gate", `${nflLane.gate.detail}${nflLane.gate.nextGate ? ` · next: ${nflLane.gate.nextGate}` : ""}`],
                      ["cadence", `${nflLane.cadence.state} — ${nflLane.cadence.detail}`],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{label}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 11.5, lineHeight: 1.45, color: "var(--vault-text-mute)", fontFamily: "var(--font-mono, monospace)" }}>{value as string}</p>
                      </div>
                    ))}
                  </div>
                  <ul style={{ margin: "10px 0 0", paddingLeft: 16, fontSize: 11.5, color: "var(--vault-text-mute)", lineHeight: 1.5 }}>
                    {nflLane.blockers.map((b: { id: string; state: string; detail: string }) => (
                      <li key={b.id}><strong style={{ color: tone(b.state === "FOUNDER_ACTION" ? "PARTIAL" : "") }}>{b.id}</strong> · {b.state} — {b.detail}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p style={{ fontSize: 11.5, color: "var(--vault-text-mute)", marginBottom: 14 }}>
                  NFL lane: UNKNOWN — no derived status artifact on disk (run scripts/nfl/build-nfl-lane-status.mjs).
                </p>
              )}

              {/* All-sport readiness registry (P167-H) — rendered VERBATIM; six independent axes,
                  never a merged score, never sorted by metric (cross-sport ranking is banned). */}
              {(() => {
                const reg = deriveReadinessRegistry();
                return (
                  <div style={{ marginBottom: 14, overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", minWidth: 860 }}>
                      <caption style={{ captionSide: "top", textAlign: "left", fontSize: 11, color: "var(--vault-text-faint)", paddingBottom: 6 }}>
                        Readiness axes (independent, never collapsed): a sport may be replay-validated and shadow-ready while its
                        current-shadow axis stays honestly false. Hover a cell for its receipt or reason; the same text ships in the
                        registry artifact.
                      </caption>
                      <thead><tr><Head>Sport</Head><Head>Variant</Head>{reg.axes.map((a) => <Head key={a}>{a.replace(/_/g, " ")}</Head>)}</tr></thead>
                      <tbody>
                        {Object.entries(reg.sports).map(([sp, entry]) => (
                          <tr key={sp}>
                            <Cell mono>{sp.toUpperCase()}</Cell>
                            <Cell><span style={{ fontSize: 11 }}>{entry.outputVariant}</span></Cell>
                            {reg.axes.map((a) => {
                              const v = (entry.axes as Record<string, { state: boolean; receipt?: string; reason?: string }>)[a];
                              return (
                                <Cell key={a} mono>
                                  <span title={v.receipt ?? v.reason} style={{ color: v.state ? "var(--gtp-success-on-dark)" : "var(--vault-text-faint)" }}>
                                    {v.state ? "●" : "○"}
                                  </span>
                                </Cell>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--vault-text-mute)" }}>Every axis receipt/reason in words (never hover-only)</summary>
                      <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 11.5, color: "var(--vault-text-mute)", display: "grid", gap: 3 }}>
                        {Object.entries(reg.sports).flatMap(([sp, entry]) =>
                          reg.axes.map((a) => {
                            const v = (entry.axes as Record<string, { state: boolean; receipt?: string; reason?: string }>)[a];
                            return <li key={`${sp}-${a}`}><code>{sp}.{a}</code> {v.state ? "●" : "○"} — {v.receipt ?? v.reason}</li>;
                          }),
                        )}
                      </ul>
                    </details>
                  </div>
                );
              })()}
              <h3 style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Product/archive completeness (NOT readiness)</h3>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                The percentage here measures how complete each sport&apos;s BUILT product/archive is — it is NOT model or launch
                readiness. Readiness truth is the 12-stage gate matrix (derived, never typed): a sport can be
                &quot;100% complete&quot; as an archive while standing at 1/12 gate stages. Completion and launch state stay
                separate columns for the same reason.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                  <caption className="sr-only">Sport product/archive completeness versus live readiness (readiness truth is the gate matrix)</caption>
                  <thead><tr><Head>Sport</Head><Head align="right">Product complete</Head><Head>Launch state</Head><Head>Live readiness</Head><Head align="right">Gaps</Head><Head>Note</Head></tr></thead>
                  <tbody>
                    {sports.map((s) => (
                      <tr key={s.name}>
                        <Cell>{s.name}</Cell>
                        <Cell mono>{s.completionPct === null ? "n/a" : `${s.completionPct}%`}</Cell>
                        <Cell>{s.launchState}</Cell>
                        <Cell><span style={{ color: s.liveReadiness === "N_A_ARCHIVED" ? "var(--vault-text-faint)" : tone("PARTIAL") }}>{s.liveReadiness === "N_A_ARCHIVED" ? "N/A (archived)" : s.liveReadiness}</span></Cell>
                        <Cell mono>{s.gaps.length}</Cell>
                        <Cell><span style={{ color: "var(--vault-text-mute)" }}>{s.note}</span></Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Launch gates ────────────────────────────────────────────────────────────── */}
            <section aria-labelledby="gates" style={{ marginBottom: 30 }}>
              <h2 id="gates" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Launch gates</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                  <caption className="sr-only">Nine public-launch gates with status, owner and blocker</caption>
                  <thead><tr><Head>Gate</Head><Head>Status</Head><Head>Owner</Head><Head>Evidence / blocker</Head></tr></thead>
                  <tbody>
                    {gates.map((g) => (
                      <tr key={g.id}>
                        <Cell>{g.name}</Cell>
                        <Cell><span style={{ color: tone(g.status), fontWeight: 700 }}>{g.status}</span></Cell>
                        <Cell>{g.owner}</Cell>
                        <Cell>{g.blocker ? <><strong>Blocker:</strong> {g.blocker}<br /></> : null}<span style={{ color: "var(--vault-text-mute)" }}>{g.evidence}</span></Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Closure packets — the completion control plane (P196 · Release A) ───────── */}
            <section aria-labelledby="closure" style={{ marginBottom: 30 }}>
              {/* P203: the record's identity — a stale record can never silently look current. */}
              <div style={{ border: "1px solid var(--vault-border-strong)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12.5 }}>
                <span className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>Operating record</span>
                {operatingRecord.state === "OK" ? (
                  <p style={{ margin: "4px 0 0" }}>
                    <a href="https://claude.ai/code/artifact/fe4dba67-9441-48ff-a803-8c745a0aec6b" style={{ color: "var(--gtp-bank-cta)" }}>Published artifact</a>
                    <span style={{ color: "var(--vault-text-mute)" }}> · generated {operatingRecord.generatedAt} · {operatingRecord.program} · {operatingRecord.releases} releases ({operatingRecord.first} → {operatingRecord.last})</span>
                    {" · "}
                    {operatingRecord.contentAddressed ? (
                      <a href={`/data/admin/${operatingRecord.contentAddressed}`} style={{ color: "var(--gtp-bank-cta)" }}>verified PDF ({operatingRecord.pdfSha256}…)</a>
                    ) : (
                      <span style={{ color: "var(--vault-warn)" }}>pdf UNVERIFIED — run verify-operating-record-pdf</span>
                    )}
                    {" · "}
                    <span style={{ color: operatingRecord.integrity === "VERIFIED" ? "var(--vault-success)" : "var(--vault-danger, var(--vault-danger))", fontWeight: 700 }}>
                      integrity {operatingRecord.integrity}
                    </span>
                  </p>
                ) : (
                  <p style={{ margin: "4px 0 0", color: "var(--vault-warn)" }}>{operatingRecord.state}: {operatingRecord.note}</p>
                )}
              </div>
              {readiness ? (
                <div style={{ border: "1px solid var(--vault-border-strong)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12.5 }}>
                  <span className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>Activation readiness · two axes</span>
                  {Object.entries(readiness.sports).map(([sport, r]) => (
                    <p key={sport} style={{ margin: "4px 0 0" }}>
                      <strong style={{ textTransform: "uppercase" }}>{sport}</strong>
                      <span style={{ color: "var(--vault-text-mute)" }}> · {r.proven}/{r.applicable} stages · tier {r.tier} · engineering {r.engineeringReady ? "READY — nothing left to build" : "OPEN"}</span>
                      {r.parked.length ? (
                        <span style={{ color: "var(--vault-text-faint)" }}> · parked: {r.parked.map((g: { id: string; owner: string }) => `${g.id} (${g.owner})`).join(", ")}</span>
                      ) : null}
                    </p>
                  ))}
                </div>
              ) : null}
              <h2 id="closure" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Closure packets · completion control plane</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                One derived packet per sport over the twelve-stage gate: counts, public tier, current event, product receipts and whose
                move each gap is. Percentages are generated; contradictions fail this page&apos;s build rather than rendering.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                  <caption className="sr-only">Per-sport closure packets: gate counts, public tier, current event and next engineering move</caption>
                  <thead><tr><Head>Sport</Head><Head>Gate</Head><Head>Public tier</Head><Head>Current event</Head><Head>Products</Head><Head>Next engineering move</Head></tr></thead>
                  <tbody>
                    {Object.values(closure.sports).map((p: any) => {
                      const next = closureQueue.engineering.find((q: any) => q.sport === p.sport);
                      return (
                        <tr key={p.sport}>
                          <Cell><strong>{p.sport.toUpperCase()}</strong></Cell>
                          <Cell><span style={{ fontFamily: "var(--font-mono, monospace)" }}>{p.counts.proven}/{p.counts.applicable}</span> <span style={{ color: "var(--vault-text-faint)" }}>({p.counts.partial}p · {p.counts.unproven}u{p.counts.blocked ? ` · ${p.counts.blocked}b` : ""})</span></Cell>
                          <Cell><span style={{ color: p.publicClaims.tier === "LIVE_ELIGIBLE" ? "var(--gtp-success-on-dark)" : "var(--vault-text-mute)", fontWeight: 600 }}>{p.publicClaims.tier}</span></Cell>
                          <Cell><span style={{ color: p.currentEvent.state === "CURRENT" ? "var(--gtp-success-on-dark)" : p.currentEvent.state === "STALE" ? "var(--gtp-warn-on-dark)" : "var(--vault-text-mute)", fontWeight: 600 }}>{p.currentEvent.state}</span><br /><span style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{p.currentEvent.detail}</span></Cell>
                          <Cell>{p.products.length === 0 ? <span style={{ color: "var(--vault-text-faint)" }}>none by design</span> : p.products.map((pr: any) => (
                            <span key={pr.lane} style={{ display: "block", fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-mute)" }}>{pr.lane}: {pr.state}{pr.asOf ? ` @ ${pr.asOf}` : ""}</span>
                          ))}</Cell>
                          <Cell>{next ? <><strong>{next.stage}</strong> — {next.action.length > 110 ? next.action.slice(0, 107) + "…" : next.action}</> : <span style={{ color: "var(--vault-text-faint)" }}>none — remaining gaps are reality- or founder-gated</span>}</Cell>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, fontWeight: 700, margin: "14px 0 4px" }}>Dependency-ordered engineering queue (top 10 of {closureQueue.engineering.length})</p>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: "var(--vault-text-mute)", lineHeight: 1.55 }}>
                {closureQueue.engineering.slice(0, 10).map((q: any) => (
                  <li key={`${q.sport}-${q.stage}`}><strong>[{q.sport}] {q.stage}</strong> ({q.status}) — {q.action.length > 130 ? q.action.slice(0, 127) + "…" : q.action}</li>
                ))}
              </ol>
              <p style={{ fontSize: 11, color: "var(--vault-text-faint)", marginTop: 8 }}>
                {closureQueue.realityWatch.length} reality-gated stage(s) held as watches · {closureQueue.founderQueue.length} founder-gated ·
                regenerate the committed artifact with <code>npx tsx scripts/ops/build-closure-packets.mjs --now &lt;ISO&gt; --check</code>
              </p>
            </section>

            {/* ════ FOUNDER ═══════════════════════════════════════════════════════════════ */}
            {/* ── Shared-blocker control plane (P164): seven launch blockers, once each, with the
                   founder's exact residual action — never exported publicly. ─────────────── */}
            <section aria-labelledby="founder-actions" style={{ marginBottom: 30 }}>
              <h2 id="founder-actions" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Founder Action Sheet</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                Every shared launch blocker exactly once, dependency-ordered. Engineering states are verified against code; a blocker closes only on a real post-action receipt.
              </p>

              {/* ── The five open gate decisions (P199 · Release D): one-to-one with the generated
                     founder queue (guard-enforced), copy-paste tokens, consequences stated, and a
                     read-only dry-run per card. Answers are decisions, never secrets. ─────────── */}
              <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 6px" }}>Reply Box · five gate decisions, one sitting</p>
              <ul style={{ margin: "0 0 14px", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {FOUNDER_DECISIONS.map((d, i) => (
                  <li key={d.id} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px" }}>
                    <p style={{ margin: 0, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 12.5 }}>{i + 1}. {d.title}</strong>
                      <span className="font-mono" style={{ fontSize: 10, color: "var(--vault-text-faint)" }}>[{d.queueItem}] · {d.expectedTime}</span>
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--vault-text-mute)" }}>{d.question}</p>
                    <p className="font-mono" style={{ margin: "5px 0 0", fontSize: 10.5 }}>
                      {d.answerTokens.map((t) => <code key={t} style={{ border: "1px solid var(--vault-rule)", borderRadius: 4, padding: "1px 5px", marginRight: 6 }}>{t}</code>)}
                    </p>
                    <p style={{ margin: "5px 0 0", fontSize: 10.5, color: "var(--vault-text-faint)", lineHeight: 1.5 }}>{d.consequence}</p>
                    <p className="font-mono" style={{ margin: "5px 0 0", fontSize: 9.5, color: "var(--vault-text-faint)" }}>dry-run: {d.validation} · {d.neverShare}</p>
                  </li>
                ))}
              </ul>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {founderActionSheet().map((r, i) => (
                  <li key={r.id} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", alignItems: "baseline" }}>
                      <span style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-faint)" }}>{i + 1}</span>
                      <strong style={{ fontSize: 13 }}>{r.title}</strong>
                      <span style={{ fontSize: 10, fontFamily: "var(--font-mono, monospace)", color: r.state === "ENGINEERING_READY_FOR_FOUNDER" ? "var(--vault-gold-bright)" : "var(--vault-text-mute)" }}>{r.state}</span>
                      <span style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>effort: {r.founderEffort}</span>
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--vault-text-mute)" }}>{r.action}</p>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 11.5, color: "var(--vault-text-mute)", display: "grid", gap: 2 }}>
                      {r.values.map((v) => (
                        <li key={v.name}><code>{v.name}</code> — {v.format} · <em>{v.where}</em>{v.neverShare && v.neverShare !== "—" ? <span style={{ color: "var(--vault-danger)" }}> · never share: {v.neverShare}</span> : null}</li>
                      ))}
                    </ul>
                    <p style={{ margin: "6px 0 0", fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-faint)" }}>
                      answer with: {(ALLOWED_CHOICES[r.id as keyof typeof ALLOWED_CHOICES] ?? []).join(" | ")} · form: docs/FOUNDER_RESPONSE_FORM.md
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-faint)" }}>accept: {r.acceptance}</p>
                  </li>
                ))}
              </ul>
            </section>

            {/* ── Queues ──────────────────────────────────────────────────────────────────── */}
            <section aria-labelledby="queues" style={{ marginBottom: 30 }}>
              <h2 id="queues" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Action queues</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                {[["Founder queue", founder], ["Engineering queue", engineering]].map(([label, list]) => {
                  const items = (list as typeof tasks).slice().sort(byPriority);
                  return (
                    <div key={label as string}>
                      <h3 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--vault-text-faint)", marginBottom: 8 }}>
                        {label as string} ({items.length})
                      </h3>
                      {items.length === 0 ? (
                        <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>Nothing outstanding.</p>
                      ) : (
                        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                          {items.map((t) => (
                            <li key={t.id} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px" }}>
                              <p style={{ fontSize: 12.5, fontWeight: 600 }}>
                                <span style={{ color: t.priority === "P0" ? "var(--vault-danger, var(--vault-loss-red))" : "var(--vault-text-faint)", fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>{t.priority}</span>{" "}
                                {t.title}
                              </p>
                              <p style={{ fontSize: 11, color: "var(--vault-text-mute)", marginTop: 3 }}>
                                {t.department} · {t.status} · evidence {t.evidence_freshness.toLowerCase()}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ════ WORK BOARD ════════════════════════════════════════════════════════════ */}
            {/* ── Tickets DERIVED from receipts; closing happens only when the receipt lands in
                   committed truth and the generator re-runs (Program 153 · Release E) ─────── */}
            <section aria-labelledby="board" style={{ marginBottom: 30 }}>
              <h2 id="board" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Work board</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                {workBoard.counts.engineering} engineering cards · {workBoard.founderQueue.length} founder-owned · {workBoard.counts.blocked} blocked.
                Cards are generated from gate assessments and the roadmap — there is no checkbox; a card closes when its receipt
                changes the committed truth. Today&apos;s P0s: {workBoard.sprints.today.map((t) => t.id).join(", ") || "none"}.
              </p>
              {/* Filters + columns are CLIENT presentation over the pure board — filtering mutates
                  nothing; the filter set is URL state, so any view is a stable deep link
                  (Program 155 · Release C; Program 167 · Release B). */}
              <BoardFilters tickets={[...Object.values(workBoard.columns).flat()] as never[]} />

              {/* Pipeline lanes — per sport, every gate stage's state IN WORDS, derived from the same
                  assessments the matrix uses. PROVEN earns the only filled glyph; PARTIAL is visible and
                  earns nothing (Program 155 · Release C). */}
              <div style={{ marginTop: 16, overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", minWidth: 900 }}>
                  <caption className="sr-only">Per-sport pipeline lanes: gate-stage states, derived from committed assessments</caption>
                  <thead>
                    <tr>
                      <Head>Sport</Head>
                      {DEPARTMENT_BUCKETS.flatMap((b) => b.stages).map((st) => <Head key={st}>{st}</Head>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(["mlb", "nfl", "nba", "epl", "ufc"] as const).map((sp) => {
                      const col = sportColumn(SPORT_ASSESSMENTS[sp]);
                      const stages = DEPARTMENT_BUCKETS.flatMap((b) => col[b.id].stages);
                      return (
                        <tr key={sp}>
                          <Cell mono>{sp.toUpperCase()}</Cell>
                          {stages.map((st) => (
                            <Cell key={st.id} mono>
                              <span
                                title={st.evidence ?? st.blocker ?? "no receipt"}
                                style={{ color: st.status === "PROVEN" ? "var(--gtp-success-on-dark)" : st.status === "PARTIAL" ? "var(--vault-gold-bright)" : st.status === "BLOCKED_EXTERNAL" ? "var(--vault-danger)" : "var(--vault-text-faint)" }}
                              >
                                {st.status === "PROVEN" ? "●" : st.status === "PARTIAL" ? "◐" : st.status === "BLOCKED_EXTERNAL" ? "✕" : "○"}
                              </span>
                            </Cell>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p style={{ fontSize: 11, color: "var(--vault-text-faint)", marginTop: 6 }}>
                  ● proven · ◐ partial (receipts, no percentage credit) · ✕ blocked external · ○ unproven — every non-proven stage&apos;s
                  receipt or blocker is written out below (hover shows the same text, but never only on hover).
                </p>
              </div>

              {/* Every non-PROVEN stage IN WORDS — progressive disclosure, never hover-only. */}
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {(["mlb", "nfl", "nba", "epl", "ufc"] as const).map((sp) => {
                  const col = sportColumn(SPORT_ASSESSMENTS[sp]);
                  const open = DEPARTMENT_BUCKETS.flatMap((b) => col[b.id].stages).filter((st: { status: string }) => st.status !== "PROVEN");
                  return (
                    <details key={sp}>
                      <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
                        {sp.toUpperCase()} — {open.length === 0 ? "all stages proven" : `${open.length} non-proven stage(s), each with its receipt state or blocker`}
                      </summary>
                      {open.length > 0 ? (
                        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--vault-text-mute)", display: "grid", gap: 4 }}>
                          {open.map((st: { id: string; status: string; evidence: string | null; blocker: string | null }) => (
                            <li key={st.id}>
                              <code>{st.id}</code> · {st.status} — {st.blocker ?? st.evidence ?? "no receipt yet"}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </details>
                  );
                })}
              </div>

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--vault-text-mute)" }}>
                  Founder queue ({workBoard.founderQueue.length}) — separated, engineering never stalls on these
                </summary>
                <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 6 }}>
                  {workBoard.founderQueue.map((t) => (
                    <li key={t.id} style={{ fontSize: 12.5, borderTop: "1px solid var(--vault-rule)", paddingTop: 6 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--vault-text-faint)" }}>{t.priority} {t.id}</span> · {t.title}
                      <div style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>Accept: {t.acceptance}</div>
                    </li>
                  ))}
                </ul>
              </details>
            </section>

            {/* ════ SPRINTS ═══════════════════════════════════════════════════════════════ */}
            <section aria-labelledby="sprints" style={{ marginBottom: 30 }}>
              <h2 id="sprints" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Sprint lanes</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                Dated lanes derive from the build clock; items carry their horizon from the committed roadmap. WIP guidance: one
                P0 at a time; a lane holding more cards than a week fits is a dependency-risk signal, not a target.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                {SPRINT_LANES.map((lane) => {
                  const items = allCards.filter((t) => t.horizon && lane.horizons.includes(t.horizon));
                  return (
                    <div key={lane.week} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-gold-bright)" }}>{lane.week}</p>
                      <p style={{ margin: "3px 0 2px", fontSize: 12, fontWeight: 600 }}>{lane.theme}</p>
                      <p style={{ margin: "0 0 6px", fontSize: 10.5, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-faint)" }}>{items.length} card(s) in lane</p>
                      {items.length ? (
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--vault-text-mute)", display: "grid", gap: 3 }}>
                          {items.map((t) => <li key={t.id}>{t.title}{t.evidence?.startsWith("depends on:") ? <span style={{ color: "var(--vault-text-faint)" }}> · {t.evidence}</span> : null}</li>)}
                        </ul>
                      ) : (
                        <p style={{ margin: 0, fontSize: 12, color: "var(--vault-text-faint)" }}>No roadmap items carry this horizon yet.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ════ ROADMAP ═══════════════════════════════════════════════════════════════ */}
            <section aria-labelledby="roadmap" style={{ marginBottom: 30 }}>
              <h2 id="roadmap" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>30-day roadmap</h2>
              {ROADMAP_30D.map((hz) => (
                <div key={hz.horizon} style={{ marginBottom: 14 }}>
                  <h3 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--vault-text-faint)", marginBottom: 6 }}>{hz.horizon.replace(/_/g, " ")}</h3>
                  <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                    {hz.items.map((i) => (
                      <li key={i.outcome} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "8px 12px" }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600 }}>
                          <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: i.owner === "FOUNDER" ? tone("PARTIAL") : "var(--vault-text-faint)" }}>{i.owner}</span>{" "}
                          {i.outcome}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--vault-text-mute)", marginTop: 2 }}>
                          {i.department} · {i.sport}{i.dependency ? ` · needs: ${i.dependency}` : ""} · accept: {i.acceptance}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px" }}>
                <p style={{ margin: 0, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>Real event calendar (from committed watches)</p>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--vault-text-mute)", display: "grid", gap: 3 }}>
                  {watches.map((w) => (
                    <li key={w.id}><span style={{ fontFamily: "var(--font-mono, monospace)" }}>{w.observeAtUtc}</span> — {w.title}</li>
                  ))}
                </ul>
              </div>
            </section>

            {/* ════ DEPARTMENTS ═══════════════════════════════════════════════════════════ */}
            <section aria-labelledby="depts" style={{ marginBottom: 30 }}>
              <h2 id="depts" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Department readiness</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
                  <caption className="sr-only">All 16 departments with completion, health, proof level and open tasks</caption>
                  <thead><tr><Head>Department</Head><Head align="right">Weight</Head><Head align="right">Complete</Head><Head>Health</Head><Head>Proof</Head><Head>Confidence</Head><Head align="right">Open tasks</Head></tr></thead>
                  <tbody>
                    {departments.map((d) => (
                      <tr key={d.id}>
                        <Cell>{d.name}</Cell>
                        <Cell mono>{d.companyWeight}</Cell>
                        <Cell mono>{d.completionPct}%</Cell>
                        <Cell><span style={{ color: tone(d.health), fontWeight: 600 }}>{d.health}</span></Cell>
                        <Cell><span style={{ color: tone(d.proof) }}>{d.proof}</span></Cell>
                        <Cell>{d.confidence} ({d.evidenceFreshPct}% fresh)</Cell>
                        <Cell mono>{d.tasks.length}</Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Department × Sport completion matrix — derived from the twelve-stage gate ── */}
            <section aria-labelledby="matrix" style={{ marginBottom: 30 }}>
              <h2 id="matrix" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Department × Sport completion</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <caption style={{ captionSide: "top", textAlign: "left", fontSize: 11, color: "var(--vault-text-faint)", paddingBottom: 6 }}>
                  Every percentage is proven-stages / total-stages from the sport gate — no cell is hand-set. The written-out
                  receipts and blockers live in the Work Board&apos;s per-sport stage details.
                </caption>
                <thead>
                  <tr>
                    <Head>Department</Head>
                    {completionMatrix.sports.map((sp) => <Head key={sp}>{sp.toUpperCase()}</Head>)}
                  </tr>
                </thead>
                <tbody>
                  {completionMatrix.buckets.map((b) => (
                    <tr key={b.id}>
                      <Cell>{b.name}</Cell>
                      {completionMatrix.sports.map((sp) => {
                        const cell = completionMatrix.matrix[sp][b.id];
                        const blocked = cell.stages.find((st: { status: string; blocker: string | null }) => st.status === "BLOCKED_EXTERNAL");
                        return (
                          <Cell key={sp} mono>
                            <span style={{ color: cell.pct === 100 ? tone("PASS") : cell.pct === 0 ? "var(--vault-text-faint)" : tone("PARTIAL") }}>
                              {cell.pct == null ? "N/A" : `${cell.pct}%`}
                            </span>
                            <span style={{ color: "var(--vault-text-faint)", fontSize: 10 }}> {cell.proven}/{cell.total}</span>
                            {blocked ? <span style={{ display: "block", color: "var(--vault-text-faint)", fontSize: 10 }}>blocked: founder</span> : null}
                          </Cell>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* ════ INCIDENTS & WATCHES ═══════════════════════════════════════════════════ */}
            {/* ── Reality-gated watches: the next receipts only reality can supply ─────────── */}
            <section aria-labelledby="watches" style={{ marginBottom: 30 }}>
              <h2 id="watches" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Reality-gated watches</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                Time-gated observations with their evidence and the productive work that proceeds meanwhile. A due watch is an instruction to inspect, never an incident.
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {watches.map((w) => (
                  <li key={w.id} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", alignItems: "baseline" }}>
                      <strong style={{ fontSize: 13 }}>{w.title}</strong>
                      <span style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: w.overdue ? "var(--vault-danger)" : w.due ? "var(--vault-gold-bright)" : "var(--vault-text-mute)" }}>
                        {w.overdue ? "OVERDUE — the observation was missed; record it or move the watch" : w.due ? "DUE — inspect now" : `in ${w.hoursUntil}h`} · {w.observeAtUtc}
                      </span>
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--vault-text-mute)" }}>Inspect: {w.evidenceToInspect}</p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--vault-text-faint)" }}>Meanwhile: {w.productiveBefore}</p>
                  </li>
                ))}
              </ul>
            </section>

            {/* ── Evidence ledger: states, freshness, contradictions ─────────────────────── */}
            <section aria-labelledby="ledger" style={{ marginBottom: 30 }}>
              <h2 id="ledger" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Evidence ledger</h2>
              {ledger ? (
                <>
                  <p style={{ color: "var(--vault-text-mute)", fontSize: 12.5, marginBottom: 10 }}>
                    {ledger.entries.length} entries · {ledger.contradictionCount} contradiction(s) · generated {ledger.now}
                    {" · "}
                    {Object.entries(ledger.counts as Record<string, number>).filter(([, n]) => n > 0).map(([st, n]) => `${st} ${n}`).join(" · ")}
                  </p>
                  <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                    <caption style={{ captionSide: "top", textAlign: "left", fontSize: 11, color: "var(--vault-text-faint)", paddingBottom: 6 }}>
                      Severity-first: incidents and unknowns lead. NO_PLAY and OFF_SEASON are answers, not failures.
                    </caption>
                    <thead><tr><Head>State</Head><Head>Subject</Head><Head>Evidence</Head><Head>Age</Head><Head>Owner</Head></tr></thead>
                    <tbody>
                      {(ledger.entries as Array<{ id: string; state: string; subject: string; evidence: string; ageHours: number | null; owner: string; remediation: string | null }>).map((e) => (
                        <tr key={e.id}>
                          <Cell mono>
                            <span style={{ color: tone(e.state === "HEALTHY" ? "PASS" : e.state === "INCIDENT" ? "FAIL" : e.state === "UNKNOWN" || e.state === "STALE" ? "PARTIAL" : "NA") }}>
                              {e.state}
                            </span>
                          </Cell>
                          <Cell>{e.subject}</Cell>
                          <Cell>
                            {e.evidence}
                            {e.remediation ? <span style={{ display: "block", color: "var(--vault-text-faint)", fontSize: 11 }}>→ {e.remediation}</span> : null}
                          </Cell>
                          <Cell mono>{e.ageHours != null ? `${e.ageHours}h` : "—"}</Cell>
                          <Cell mono>{e.owner}</Cell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              ) : (
                <p style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
                  No ledger artifact — run <code>npm run admin:ledger</code>. This says &ldquo;not generated&rdquo;, never &ldquo;all healthy&rdquo;.
                </p>
              )}
            </section>

            {/* ════ EVIDENCE ══════════════════════════════════════════════════════════════ */}
            {/* ── Product truth — cross-surface figure reconciliation, rendered verbatim (P160 · A) ── */}
            <section aria-labelledby="product-truth" style={{ marginBottom: 30 }}>
              <h2 id="product-truth" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Product truth</h2>
              {productTruth ? (
                <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
                  {productTruth.totals.facts} owned facts reconciled ·{" "}
                  <strong style={{ color: productTruth.totals.p0 === 0 ? "var(--gtp-success-on-dark)" : "var(--vault-danger)" }}>
                    {productTruth.totals.contradictions} contradictions ({productTruth.totals.p0} P0)
                  </strong>
                  {" · "}{productTruth.totals.exceptions} documented exception(s) applied · generated {productTruth.generatedAt}.
                  {productTruth.contradictions.length > 0 ? ` Top: ${productTruth.contradictions.slice(0, 3).map((c: { id: string }) => c.id).join(", ")}` : " Every repeated public figure agrees with its authoritative owner."}
                </p>
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
                  No product-truth artifact — run <code>node scripts/audits/build-product-truth.mjs</code>. This says &ldquo;not generated&rdquo;, never &ldquo;all consistent&rdquo;.
                </p>
              )}
            </section>

            {/* ── Route assurance — the three-layer inventory, rendered verbatim (P159 · Release A) ── */}
            <section aria-labelledby="routes-assurance" style={{ marginBottom: 30 }}>
              <h2 id="routes-assurance" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Route assurance</h2>
              {routeInventory ? (
                <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
                  {routeInventory.totals.routes} routes reconciled across source · ownership table · built export
                  ({routeInventory.totals.public} public · {routeInventory.totals.redirects} redirects · {routeInventory.totals.internal} internal · {routeInventory.totals.archive} archive)
                  — <strong style={{ color: routeInventory.totals.p0 === 0 ? "var(--gtp-success-on-dark)" : "var(--vault-danger)" }}>
                    {routeInventory.totals.findings} findings, {routeInventory.totals.p0} P0
                  </strong> · generated {routeInventory.generatedAt}.
                  {routeInventory.findings.length > 0 ? ` Top: ${routeInventory.findings.slice(0, 3).map((f: { id: string }) => f.id).join(", ")}` : " Every active route has an owner, purpose, and build proof."}
                </p>
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
                  No inventory artifact — run <code>node scripts/audits/build-route-inventory.mjs</code>. This says &ldquo;not generated&rdquo;, never &ldquo;all clean&rdquo;.
                </p>
              )}
            </section>

            {/* ── Browser assurance — the committed CONTRACT; the proof is every quality-gate run
                   executing route-assurance.spec.ts on all three engines (P161 · Release C). ── */}
            <section aria-labelledby="browser-assurance" style={{ marginBottom: 30 }}>
              <h2 id="browser-assurance" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Browser assurance</h2>
              <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)", marginBottom: 8 }}>
                {ASSURED_ROUTES.length} high-traffic routes render-proven on {ENGINES.join(" · ")} against the built export,
                every quality-gate run (e2e/route-assurance.spec.ts). Baseline everywhere: HTTP 200, visible body, zero
                console/page errors after hydration. Live gate, not a snapshot — a committed result would rot with the next artifact.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--vault-text-mute)", display: "grid", gap: 3 }}>
                {ASSURED_ROUTES.map((r) => (
                  <li key={r.route}><code>{r.route}</code> — {r.proves}</li>
                ))}
              </ul>
            </section>

            {/* ── UI/UX audit — Program 185. Every figure DERIVES from the committed baseline
                   artifact; nothing here is typed. The charter asks that an operator can see the
                   route matrix, the drift counts and the migration progress WITHOUT reading code
                   or handoff prose, so the reasoning stays in the artifact and the numbers come
                   here. If the artifact is absent the section says so and shows no figures. ── */}
            <section aria-labelledby="uiux" style={{ marginBottom: 30 }}>
              {/* ── PRODUCT EXPERIENCE (P208 · Release I) — the public IA and program state, derived ── */}
              <h2 id="product-experience" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Product experience (P208)</h2>
              {!px.available ? (
                <p style={{ fontSize: 12, color: "var(--vault-warn)" }}>{px.note}</p>
              ) : (
                <div style={{ marginBottom: 18 }}>
                  <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 8 }}>
                    Public nav contract (derived from <code>src/lib/navigation.ts</code> — never hand-kept here):{" "}
                    {px.primaries.map((d) => d.label).join(" · ")} · surfaces{" "}
                    {px.surfaces.map((s) => `${s.surface} ${s.destinations}`).join(" / ")}
                  </p>
                  <p style={{ fontSize: 12, marginBottom: 8 }}>
                    Findings open: <strong style={{ color: px.open.p0 + px.open.p1 > 0 ? "var(--vault-warn)" : "var(--vault-success)" }}>
                    {px.open.p0} P0 · {px.open.p1} P1</strong> · {px.open.p2} P2 backlog
                  </p>
                  <div style={{ display: "grid", gap: 4, marginBottom: 10 }}>
                    {px.findings.map((f: { id: string; sev: string; surface: string; finding: string; resolvedBy: string | null }) => (
                      <div key={f.id} style={{ fontSize: 11.5, display: "flex", gap: 8, alignItems: "baseline" }}>
                        <code style={{ color: f.resolvedBy ? "var(--vault-success)" : "var(--vault-warn)", minWidth: 26 }}>{f.id}</code>
                        <span style={{ color: "var(--vault-text-faint)", minWidth: 22 }}>{f.sev}</span>
                        <span style={{ color: "var(--vault-text-mute)", flex: 1 }}>{f.surface}: {f.finding}…</span>
                        <span style={{ color: f.resolvedBy ? "var(--vault-success)" : "var(--vault-text-faint)", whiteSpace: "nowrap" }}>{f.resolvedBy ?? "open"}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>
                    Payload budgets (enforced by the page-weight guard):{" "}
                    {px.budgets.map((b) => `${b.route.replace("/index.html", "") || "/"} ≤${b.kb}KB`).join(" · ")}
                    {px.screenshotSets.length ? <> · screenshot sets: {px.screenshotSets.join(", ")}</> : null}
                  </p>
                </div>
              )}

              {/* ── SIMULATION EXPERIENCE (P209 · Release J) — journey state, derived ── */}
              <h2 id="simulation-experience" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Simulation experience (P209)</h2>
              <div style={{ marginBottom: 18 }}>
                {sx.day.available && sx.day.totals && sx.day.sections ? (
                  <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 6 }}>
                    Day selector: {sx.day.dates} dates in window {sx.day.window} · today {sx.day.today} — {sx.day.totals.events} events,
                    {" "}{sx.day.totals.ready} report-ready, {sx.day.totals.settled} settled ·{" "}
                    {sx.day.sections.map((s: { sport: string; events: number; empty: string | null }) => `${s.sport} ${s.events}${s.empty ? ` (${s.empty.toLowerCase().replaceAll("_", " ")})` : ""}`).join(" / ")}
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--vault-warn)" }}>{sx.day.note}</p>
                )}
                {sx.themes.available && sx.themes.registered ? (
                  <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 6 }}>
                    Scenes: {sx.themes.registered.map((t: { sport: string; scene: string }) => `${t.sport}→${t.scene}`).join(" · ")} · unknown sport→{sx.themes.fallback}
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--vault-warn)" }}>{sx.themes.note}</p>
                )}
                <p style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>
                  State machine: {sx.machine.phases} phases, terminals {sx.machine.terminals.join("/")} — unearned terminals fail closed.
                  Guards: {sx.guards.map((g: string) => g.split("/").pop()).join(", ")}
                </p>
              </div>

              <h2 id="uiux" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>UI/UX audit &amp; migration</h2>
              {!uiux.available ? (
                <p style={{ fontSize: 12, color: "var(--vault-warn)" }}>{uiux.note}</p>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                    Derived from <code>data/internal/uiux/baseline.json</code>
                    {uiux.generatedAt ? ` · generated ${String(uiux.generatedAt).slice(0, 10)}` : ""} ·
                    baseline measured {P184_BASELINE.measuredAt} @ <code>{P184_BASELINE.commit}</code>
                  </p>

                  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 14 }}>
                    {[
                      { l: "Raw colour literals", v: `${uiux.literals.now}`, s: uiux.literals.removed != null ? `${uiux.literals.removed} removed · −${uiux.literals.pctRemoved}% from ${uiux.literals.baseline}` : "" },
                      { l: "Files carrying them", v: `${uiux.literals.files}`, s: `from ${P184_BASELINE.filesWithRawColors}` },
                      { l: "Semantic tokens", v: `${uiux.literals.tokens}`, s: uiux.literals.tokensAdded != null ? `+${uiux.literals.tokensAdded} since baseline` : "" },
                      { l: "Dead links", v: `${uiux.routeMatrix.deadLinks}`, s: `from ${P184_BASELINE.deadLinks}` },
                    ].map((t) => (
                      <div key={t.l} style={{ border: "1px solid var(--vault-rule)", borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--vault-text-faint)" }}>{t.l}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--vault-text)" }}>{t.v}</div>
                        {t.s ? <div style={{ fontSize: 11, color: "var(--vault-text-mute)" }}>{t.s}</div> : null}
                      </div>
                    ))}
                  </div>

                  <h3 style={{ fontSize: 12.5, fontWeight: 700, margin: "4px 0 6px" }}>
                    Drift by class — only the first row is migration work
                  </h3>
                  <div style={{ overflowX: "auto", marginBottom: 14 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                      <thead><tr><Head>Class</Head><Head align="right">Count</Head><Head>Disposition</Head></tr></thead>
                      <tbody>
                        {uiux.classes.map((c: { key: string; label: string; value: number; action: string }) => (
                          <tr key={c.key}>
                            <Cell>{c.label}</Cell>
                            <Cell>{c.value}</Cell>
                            <Cell>{c.action}</Cell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <h3 style={{ fontSize: 12.5, fontWeight: 700, margin: "4px 0 6px" }}>Route matrix</h3>
                  <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                    {uiux.routeMatrix.total} routes · {uiux.routeMatrix.exported} exported ·{" "}
                    {uiux.routeMatrix.redirects} redirects · {uiux.routeMatrix.internalPruned} internal pruned from the
                    public export ({uiux.routeMatrix.internalRoutes.join(", ")}) ·{" "}
                    {uiux.routeMatrix.navSources} navigation sources,{" "}
                    {uiux.routeMatrix.navOffContract} off the shared contract ·{" "}
                    {uiux.routeMatrix.orphans} orphans (internal by design)
                  </p>

                  {uiux.queue.length > 0 ? (
                    <>
                      <h3 style={{ fontSize: 12.5, fontWeight: 700, margin: "4px 0 6px" }}>
                        Next migration work — reachable files only, ranked
                      </h3>
                      <ul style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: "0 0 14px", paddingLeft: 18 }}>
                        {uiux.queue.map((q: { file: string; drift: number }) => (
                          <li key={q.file}><code>{q.file}</code> — {q.drift}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  <h3 style={{ fontSize: 12.5, fontWeight: 700, margin: "4px 0 6px" }}>Evidence</h3>
                  <ul style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: 0, paddingLeft: 18 }}>
                    {uiux.evidenceRefs.map((r: string) => (<li key={r}>{r}</li>))}
                  </ul>
                </>
              )}
            </section>

            {/* ── Model registry — the four-sport private research index, rendered VERBATIM ── */}
            <section aria-labelledby="registry" style={{ marginBottom: 30 }}>
              <h2 id="registry" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Model registry (private research)</h2>
              {modelRegistry ? (
                <>
                  <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                    {modelRegistry.entries.length} entries · generated {modelRegistry.generatedAt} · {modelRegistry.comparabilityNote}
                  </p>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                      <thead><tr><Head>Sport</Head><Head>Outcome space</Head><Head align="right">Primary (log loss · n)</Head><Head>Coverage</Head><Head>Card</Head><Head>Activation</Head></tr></thead>
                      <tbody>
                        {(modelRegistry.entries as Array<{ sport: string; outcomeTaxonomy: string; metrics: { primary: { logLoss: number; n: number }; abstention?: { coverage: number } }; artifactRefs: { modelCard: string | null }; publicActivation: string }>).map((e) => (
                          <tr key={e.sport}>
                            <Cell mono>{e.sport.toUpperCase()}</Cell>
                            <Cell>{e.outcomeTaxonomy}</Cell>
                            <Cell mono>{e.metrics.primary.logLoss} · {e.metrics.primary.n}</Cell>
                            <Cell mono>{e.metrics.abstention ? `${Math.round(e.metrics.abstention.coverage * 1000) / 10}%` : "full"}</Cell>
                            <Cell>{e.artifactRefs.modelCard ? "v1" : <span style={{ color: "var(--vault-gold-bright)" }}>INCOMPLETE</span>}</Cell>
                            <Cell mono><span style={{ color: "var(--vault-text-faint)" }}>{e.publicActivation.slice(0, 3)}</span></Cell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
                  No registry artifact — run <code>node scripts/research/build-model-registry.mjs</code>. This says &ldquo;not generated&rdquo;, never &ldquo;all healthy&rdquo;.
                </p>
              )}
            </section>

            {/* ── Release history: shipped programs as auditable outcomes, pruned from lanes ── */}
            <section aria-labelledby="history" style={{ marginBottom: 30 }}>
              <h2 id="history" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Release history</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                {RELEASE_HISTORY.filter((r) => r.commit).length} recorded releases. A guard proves none of these still occupies an active lane; a missing receipt says UNRECORDED in words.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
                  <thead><tr>
                    <Head>Program</Head><Head>Commit</Head><Head>Date</Head><Head>Departments</Head><Head>Outcome</Head><Head>Defects found shipping</Head>
                  </tr></thead>
                  <tbody>
                    {RELEASE_HISTORY.map((r) => (
                      <tr key={`${r.program}-${r.release}`}>
                        <Cell mono>{r.program} · {r.release}</Cell>
                        <Cell mono>{r.commit ?? "—"}</Cell>
                        <Cell mono>{r.date}</Cell>
                        <Cell>{r.departments.join(" · ")}</Cell>
                        <Cell>{r.outcome}</Cell>
                        <Cell>{r.defectsFound ?? "—"}</Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Internal Alpha window ───────────────────────────────────────────────────── */}
            <section aria-labelledby="alpha" style={{ marginBottom: 30 }}>
              <h2 id="alpha" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Internal Alpha</h2>
              {alpha ? (
                <>
                  <p style={{ color: "var(--vault-text-mute)", fontSize: 12.5, marginBottom: 10 }}>
                    Day <strong style={{ color: "var(--vault-text)" }}>{alpha.day}</strong> of 7 · window {alpha.window?.start} → {alpha.window?.end} ·
                    sha <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{alpha.sourceSha}</span> ·
                    verdict <strong style={{ color: tone(alpha.verdict === "PASS" ? "PASS" : alpha.verdict === "FAIL" ? "FAIL" : "PARTIAL") }}>{alpha.verdict}</strong>
                    {" · "}
                    {alpha.tally?.PASS ?? 0} pass · {alpha.tally?.FAIL ?? 0} fail · {alpha.tally?.BLOCKED ?? 0} blocked · {alpha.tally?.UNKNOWN ?? 0} unknown
                  </p>
                  <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                    <caption style={{ captionSide: "top", textAlign: "left", fontSize: 11, color: "var(--vault-text-faint)", paddingBottom: 6 }}>
                      Day {alpha.day} criteria. Blocked items are founder-owned and do not fail the day.
                    </caption>
                    <thead><tr><Head>Criterion</Head><Head>Result</Head><Head>Evidence</Head><Head>Owner</Head><Head>Next check</Head></tr></thead>
                    <tbody>
                      {(alpha.criteria ?? []).map((x: { id: string; name: string; result: string; evidence: string; owner: string; nextCheck: string }) => (
                        <tr key={x.id}>
                          <Cell>{x.name}</Cell>
                          <Cell><span style={{ color: tone(x.result === "BLOCKED" ? "PARTIAL" : x.result) }}>{x.result}</span></Cell>
                          <Cell>{x.evidence}</Cell>
                          <Cell mono>{x.owner}</Cell>
                          <Cell>{x.nextCheck}</Cell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              ) : (
                <p style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
                  No alpha artifact yet — run <code>node scripts/internal-alpha-day.mjs</code>. This says
                  &ldquo;not generated&rdquo;, never &ldquo;day 1 passing&rdquo;.
                </p>
              )}
            </section>

            {/* ════ RUNBOOKS & TRANSITION ═════════════════════════════════════════════════ */}
            {/* ── Runbooks: what to do when — each entry names its doc and trigger ─────────── */}
            <section id="runbooks" aria-labelledby="runbooks-h" style={{ marginBottom: 30 }}>
              <h2 id="runbooks-h" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Runbooks</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--vault-text-mute)", display: "grid", gap: 3 }}>
                <li><code>docs/OPS_WATCHERS.md</code> — gate watchers: one target, bounded, superseded exits; zero owned watchers at close</li>
                <li><code>docs/DAILY_OPS.md</code> — the MLB daily production loop (protected reference pipeline)</li>
                <li><code>scripts/ops/verify-cadence-receipts.mjs --run &lt;id&gt; --before &lt;run headSha&gt;</code> — the one command after every scheduled cadence</li>
                <li><code>docs/NFL_CORRECTIONS_RUNBOOK.md</code> — score corrections, status regressions, first-join verification (Aug 13+)</li>
                <li><code>docs/EPL_CORRECTIONS_RUNBOOK.md</code> — kickoff moves, latest-wins policy, the Aug-21 first-FT checklist</li>
                <li><code>docs/FOUNDER_RESPONSE_FORM.md</code> + <code>scripts/ops/founder-orchestrate.mjs</code> — the seven-answer flow (read-only)</li>
                <li><code>docs/ADMIN_ACCESS_DECISION.md</code> + <code>docs/ADMIN_DEPLOYMENT_GTP_OPS.md</code> + <code>scripts/ops/verify-admin-access.mjs</code> — private-deployment verification and redeploy runbook</li>
                <li>Stale artifact / failed cadence / source outage → the receipt verifier names the failing class; last-known-good stands by design; never hand-edit an artifact</li>
                <li>Protected-money mismatch → STOP; the only writer is nightly-settle; verify md5s and inspect its run log — never repair by hand</li>
              </ul>

              {/* ── The sport × lifecycle registry (P198 · Release D): who runs each lane, when,
                     what quiet looks like, how to recover, where the receipt lands. Guarded: every
                     named workflow/script must exist; every sport answers every lane. ─────────── */}
              <p style={{ fontSize: 12, fontWeight: 700, margin: "16px 0 6px" }}>Sport × lifecycle registry (validated: {validateRunbooks().length === 0 ? "clean" : "PROBLEMS"})</p>
              <div style={{ display: "grid", gap: 8 }}>
                {Object.entries(RUNBOOKS).map(([sport, lanes]) => (
                  <details key={sport} style={{ border: "1px solid var(--vault-border)", borderRadius: 8, padding: "6px 10px" }}>
                    <summary style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>
                      {sport.toUpperCase()} — {Object.values(lanes).filter((e: any) => !e.na).length} operated lanes · {Object.values(lanes).filter((e: any) => e.na).length} N_A
                    </summary>
                    <div style={{ overflowX: "auto", marginTop: 6 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, minWidth: 780 }}>
                        <thead><tr>{["lane", "runs", "when", "quiet", "recover", "receipt"].map((h) => (
                          <th key={h} scope="col" style={{ textAlign: "left", padding: "3px 6px", color: "var(--vault-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9 }}>{h}</th>
                        ))}</tr></thead>
                        <tbody>
                          {LIFECYCLE_LANES.map((lane) => {
                            const e: any = (lanes as any)[lane];
                            return (
                              <tr key={lane} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                                <td style={{ padding: "3px 6px", fontWeight: 600 }}>{lane}</td>
                                {e.na
                                  ? <td colSpan={5} style={{ padding: "3px 6px", color: "var(--vault-text-faint)" }}>N_A — {e.why}</td>
                                  : ["runs", "when", "quiet", "recover", "receipt"].map((f) => (
                                      <td key={f} style={{ padding: "3px 6px", color: "var(--vault-text-mute)" }}>{e[f]}</td>
                                    ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </section>

            {/* ── Transition readiness (Dhruv onboarding) — documentation ONLY; nothing here
                   transfers accounts, credentials, or control (possible Aug-30 event, PLANNED). ── */}
            <section id="transition" aria-labelledby="transition-h" style={{ marginBottom: 30 }}>
              <h2 id="transition-h" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Transition readiness · Dhruv onboarding</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 8 }}>
                Read-only orientation. No ownership, account, credential, or control transfer has occurred or is authorized by this page; the Aug-30 possibility is PLANNED_EXTERNAL.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--vault-text-mute)", display: "grid", gap: 3 }}>
                <li><strong>System in one line:</strong> an educational, paper-only sports analytics platform — MLB is the live 12/12 reference pipeline; NFL/UFC/EPL/NBA have receipt-derived schedule/results foundations and private research only; publicActivation is OFF everywhere non-MLB.</li>
                <li><strong>Daily rhythm:</strong> scheduled captures ~13:00-14:15 UTC → one verification command (see Runbooks) → watches/incidents on this page → releases ship through the quality gate → receipts close work.</li>
                <li><strong>Owner types:</strong> ENGINEERING (this console&apos;s lanes) · FOUNDER (the seven-blocker sheet above) · REALITY (time-gated watches) — founder actions never block engineering lanes.</li>
                <li><strong>Provider inventory (names only, no credentials):</strong> MLB StatsAPI (free) · ESPN public scoreboards/injuries (free, attributed snapshots) · openfootball (public domain) · The Odds API (paid, credit-guarded, dormant for non-MLB until authorized) · Vercel (hosting) · GitHub Actions (automation).</li>
                <li><strong>Environment names (values live in dashboards, never here):</strong> ODDS_API_KEY (CI) · GTP_SUPPORT_* ·(unset) · NEXT_PUBLIC_ANALYTICS_* (unset = hard off).</li>
                <li><strong>Escalation:</strong> protected-money mismatch → stop-and-inspect (runbook) · public/private leak → P0, prune + redeploy · provider outage → last-known-good stands, watch the next cadence.</li>
                <li><strong>Transfer checklist (ALL not-started, deliberately):</strong> documentation ✓in-progress here · account/service inventory (names only) ✓above · access model → the admin-access blocker · backup/export, credential rotation, billing/domain ownership, old-access revocation → FUTURE, each its own gated step.</li>
                <li><strong>Sharing rule:</strong> the protected internal deployment (host-authenticated, see Runbooks) is the only shareable surface; Dhruv&apos;s own host identity is a founder-owned invite — never a shared password, never a URL whose only protection is obscurity.</li>
              </ul>
            </section>

            {/* ════ ONBOARDING ════════════════════════════════════════════════════════════ */}
            {/* ── The sanitized operator guide (Program 167 · Release B): how to RUN the system,
                   for a new operator's first day. Static, versioned, zero secrets — the transition
                   section above covers transfer state; this covers operating skill. ────────── */}
            <section id="onboarding" aria-labelledby="onboarding-h" style={{ marginBottom: 30 }}>
              <h2 id="onboarding-h" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Onboarding · operate this system safely</h2>
              <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
                For a new operator&apos;s first day. Everything here is names and procedure — no credentials, no tokens, no private URLs.
              </p>
              <div style={{ display: "grid", gap: 10 }}>
                <details open>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>1 · Architecture in five sentences</summary>
                  <p style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: "6px 0 0", lineHeight: 1.6 }}>
                    The public site is a static export — every page is built from committed JSON artifacts; there is no server and no database.
                    Scheduled GitHub Actions capture schedules, injuries, results and odds into <code>public/data/</code>, and the ONE authorized
                    settlement writer (nightly-settle) is the only process that may touch money artifacts. Models are private research: their
                    artifacts live under internal paths and are pruned from the public build by <code>prune-internal-routes.mjs</code>. This console
                    is that same codebase built with internal routes kept, deployed separately behind host authentication. Every figure on every
                    surface is DERIVED from an artifact with a named owner — if a number cannot cite its artifact, the number is wrong by definition.
                  </p>
                </details>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>2 · State vocabulary (say the state, never a vibe)</summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--vault-text-mute)", display: "grid", gap: 3 }}>
                    <li><strong>Sections:</strong> ACTIVE · EMPTY (an answer, not an outage) · STALE (dated evidence says its age) · UNKNOWN (unreadable source, never green) · INCIDENT (danger + owner) · REALITY_GATED (time-gated, never urgent-styled).</li>
                    <li><strong>Gate stages:</strong> PROVEN (receipt) · PARTIAL (receipts, no credit) · BLOCKED_EXTERNAL (named blocker) · UNPROVEN.</li>
                    <li><strong>Cards:</strong> NEW · READY · IN_PROGRESS · BLOCKED · REALITY_GATED — a card closes only when its receipt lands in committed truth.</li>
                    <li><strong>Model readiness axes (independent, never collapsed):</strong> CONTRACT_READY (fixtures+tests) · REPLAY_VALIDATED (historical) · SHADOW_READY (real inputs assemble) · CURRENT_SHADOW_PROVEN (pre-start artifact) · SETTLEMENT_PROVEN · PUBLIC_ELIGIBLE (the twelve-stage gate + founder activation).</li>
                    <li><strong>Money:</strong> paper-only, educational. A live sportsbook market proves availability — never accuracy, profitability or qualification.</li>
                  </ul>
                </details>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>3 · The daily loop (what Today renders)</summary>
                  <p style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: "6px 0 0", lineHeight: 1.6 }}>
                    <strong>Observe</strong> due watches (real-world receipts land on their own clock) → <strong>Verify</strong> the scheduled cadence
                    with the one receipt-verifier command (Runbooks) — never by eyeballing green checkmarks → <strong>Build</strong> the top unblocked
                    card → <strong>Release</strong> through the full gate (tests · typecheck · build · diff review · secret scan · deployed verification)
                    → <strong>Close</strong> only what a receipt or founder decision closes. Empty phases are answers. If a phase surprises you, the
                    incident section and the evidence ledger are the first two clicks.
                  </p>
                </details>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>4 · Provider & cost rules (the ones that cost real money)</summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--vault-text-mute)", display: "grid", gap: 3 }}>
                    <li>The Odds API is the ONLY paid provider (~$30/mo budget). Credit-bearing calls require a distinct founder authorization receipt in the repository — a passing test, a live market, or urgency is never authorization.</li>
                    <li>Dry-run first, always: <code>scripts/ops/odds-canary.mjs --sport &lt;one&gt;</code> is zero-credit without <code>--authorized</code>, refuses broad scopes, and self-redacts. Credit floor 50; unexpected cost = stop, not retry.</li>
                    <li>MLB StatsAPI, ESPN scoreboards/injuries and openfootball are free — but every capture still records source, capture time and terms posture; a scraped fact without a timestamp is not evidence.</li>
                    <li>Never mint identity from display names; joins go through canonical ids + alias tables, and ambiguity quarantines rather than guesses.</li>
                  </ul>
                </details>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>5 · Incidents — first five minutes</summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--vault-text-mute)", display: "grid", gap: 3 }}>
                    <li>Name the incident class (source outage · stale market · event mismatch · ambiguous identity · late replacement · post-start evidence · credit floor · duplicate writer · correction pending · public/internal leak · protected-money mismatch).</li>
                    <li>Containment before diagnosis for leaks (prune + redeploy) and money mismatches (STOP; nightly-settle is the only writer; verify md5s).</li>
                    <li>Never auto-repair official results, frozen predictions or protected money. Last-known-good stands by design; corrections append lineage, they never rewrite.</li>
                    <li>Every incident carries severity, owner, containment, safe-retry/no-retry and rollback before anyone touches a fix.</li>
                  </ul>
                </details>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>6 · Protected truth & safe sharing</summary>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--vault-text-mute)", display: "grid", gap: 3 }}>
                    <li>Protected money artifacts (<code>mr-dub/</code>) change through nightly-settle ONLY. The health strip renders them read-only; a mismatch is a P0 stop-and-inspect.</li>
                    <li><code>vp/</code> planning material and <code>test-results/</code> are founder/cowork-owned — never staged, cleaned or committed with code.</li>
                    <li>Public boundary: /launch, /ops, /preview and all internal data are pruned from the public export and proven 404 in production every gate run.</li>
                    <li>Sharing: the host-authenticated internal deployment is the only shareable surface. No screenshots of secrets, no URLs-as-security, no credentials in chat, git, logs or docs — environment variable NAMES are fine, values never.</li>
                  </ul>
                </details>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>7 · First-day guided tour (15 minutes, read-only)</summary>
                  <ol style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 12, color: "var(--vault-text-mute)", display: "grid", gap: 3 }}>
                    <li>Overview → read the health strip left to right; anything red links to its evidence section.</li>
                    <li>Today → the top three actions and the five phases; open one card and read its next action + acceptance.</li>
                    <li>Sports → each league&apos;s N/12 and next gate; note MLB is the only live pipeline.</li>
                    <li>Work Board → filter to one sport, pin a ticket, notice the URL is now a shareable deep link.</li>
                    <li>Incidents & Watches → what is time-gated right now and what to inspect when it lands.</li>
                    <li>Evidence → ledger, product truth, route assurance: where green claims cite their receipts.</li>
                    <li>Runbooks → skim titles only; know where they live before you need one.</li>
                    <li>End by NOT changing anything: the console is read-only by design, and that is the lesson.</li>
                  </ol>
                </details>
              </div>
            </section>
          </main>
        </div>
      </div>
    </>
  );
}
