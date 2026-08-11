import fs from "node:fs";
import path from "node:path";
import { guardInternalRoute } from "@/lib/internal-route-guard";
import { currentEtDate } from "@/lib/freshness";
import { buildCompletionMatrix, ROADMAP_30D } from "@/lib/launch/completion-matrix.mjs";
import { buildWorkBoard } from "@/lib/launch/work-board.mjs";
import BoardFilters from "@/components/launch/board-filters";
import { sportColumn, DEPARTMENT_BUCKETS } from "@/lib/launch/completion-matrix.mjs";
import { SPORT_ASSESSMENTS } from "@/lib/sports/sport-assessments.mjs";
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
 * admin model is exclusion: `guardInternalRoute()` plus `prune-internal-routes.mjs`, which
 * deletes the route from `out/` so it is never deployed. This page reuses that model rather than
 * inventing auth it cannot enforce. A secure authenticated admin surface is a roadmap task, not
 * something to fake here.
 *
 * Everything rendered is DERIVED from the scorecard checklist and launch contract. No number on
 * this page is hand-maintained.
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

  const APP = process.cwd();
  const readJson = (rel: string) => {
    try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data", rel), "utf8")); } catch { return null; }
  };
  const board = readJson(`mlb/boards/${etDate}.json`);
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
  const covered = board ? new Set(board.leans.map((l: { gamePk: number }) => l.gamePk)).size : null;

  const tasks = departments.flatMap((d) => d.tasks);
  const engineering = tasks.filter((t) => t.owner_type === "ENGINEERING");
  const founder = tasks.filter((t) => t.owner_type === "FOUNDER");
  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 } as Record<string, number>;
  const byPriority = (a: { priority: string }, b: { priority: string }) => rank[a.priority] - rank[b.priority];

  const tone = (s: string) =>
    s === "PASS" || s === "HEALTHY" || s === "PRODUCTION_PROVEN" ? "var(--gtp-success-on-dark, #7ee2a8)"
    : s === "FAIL" || s === "BLOCKED" ? "var(--vault-danger, #f23645)"
    : s === "PARTIAL" || s === "WATCH" || s === "AT_RISK" ? "var(--vault-gold-bright)"
    : "var(--vault-text-mute)";

  const Cell = ({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) => (
    <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: mono ? "var(--font-mono, monospace)" : undefined, verticalAlign: "top" }}>{children}</td>
  );
  const Head = ({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) => (
    <th scope="col" style={{ padding: "7px 10px", textAlign: align, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)", fontWeight: 600 }}>{children}</th>
  );

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 72px" }}>
      <header style={{ marginBottom: 26 }}>
        <p style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--vault-gold-bright)", marginBottom: 6 }}>
          Internal · not deployed publicly
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>Launch Command Center</h1>
        <p style={{ color: "var(--vault-text-mute)", fontSize: 13, marginTop: 6 }}>
          Slate {etDate} · schema v{SCHEMA_VERSION} · every figure derived from the scorecard checklist and launch gates — nothing here is hand-maintained.
        </p>
      </header>

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
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
          </>
        ) : (
          <p style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
            No ledger artifact — run <code>npm run admin:ledger</code>. This says &ldquo;not generated&rdquo;, never &ldquo;all healthy&rdquo;.
          </p>
        )}
      </section>

      {/* ── Product truth — cross-surface figure reconciliation, rendered verbatim (P160 · A) ── */}
      <section aria-labelledby="product-truth" style={{ marginBottom: 30 }}>
        <h2 id="product-truth" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Product truth</h2>
        {productTruth ? (
          <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
            {productTruth.totals.facts} owned facts reconciled ·{" "}
            <strong style={{ color: productTruth.totals.p0 === 0 ? "var(--gtp-success-on-dark, #7ee2a8)" : "var(--vault-danger)" }}>
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
            — <strong style={{ color: routeInventory.totals.p0 === 0 ? "var(--gtp-success-on-dark, #7ee2a8)" : "var(--vault-danger)" }}>
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

      {/* ── Work board — tickets DERIVED from receipts; closing happens only when the receipt
             lands in committed truth and the generator re-runs (Program 153 · Release E) ──── */}
      <section aria-labelledby="board" style={{ marginBottom: 30 }}>
        <h2 id="board" style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Work board</h2>
        <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
          {workBoard.counts.engineering} engineering cards · {workBoard.founderQueue.length} founder-owned · {workBoard.counts.blocked} blocked.
          Cards are generated from gate assessments and the roadmap — there is no checkbox; a card closes when its receipt
          changes the committed truth. Today&apos;s P0s: {workBoard.sprints.today.map((t) => t.id).join(", ") || "none"}.
        </p>
        {/* Filters + columns are CLIENT presentation over the pure board — filtering mutates
            nothing (Program 155 · Release C). */}
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
                          style={{ color: st.status === "PROVEN" ? "var(--gtp-success-on-dark, #7ee2a8)" : st.status === "PARTIAL" ? "var(--vault-gold-bright)" : st.status === "BLOCKED_EXTERNAL" ? "var(--vault-danger)" : "var(--vault-text-faint)" }}
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
            ● proven · ◐ partial (receipts, no percentage credit) · ✕ blocked external · ○ unproven — hover a cell for its receipt or blocker.
          </p>
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

      {/* ── Model registry — the four-sport private research index, rendered VERBATIM
             (Program 157 · Release A). Missing card fields say INCOMPLETE, never a substitute. ── */}
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

      {/* ── Department × Sport completion matrix — derived from the twelve-stage gate ── */}
      <section aria-labelledby="matrix" style={{ marginBottom: 30 }}>
        <h2 id="matrix" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Department × Sport completion</h2>
        {(() => {
          const m = buildCompletionMatrix(SPORT_ASSESSMENTS);
          return (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <caption style={{ captionSide: "top", textAlign: "left", fontSize: 11, color: "var(--vault-text-faint)", paddingBottom: 6 }}>
                Every percentage is proven-stages / total-stages from the sport gate — no cell is hand-set. Hover a cell for its stage receipts on the artifact.
              </caption>
              <thead>
                <tr>
                  <Head>Department</Head>
                  {m.sports.map((sp) => <Head key={sp}>{sp.toUpperCase()}</Head>)}
                </tr>
              </thead>
              <tbody>
                {m.buckets.map((b) => (
                  <tr key={b.id}>
                    <Cell>{b.name}</Cell>
                    {m.sports.map((sp) => {
                      const cell = m.matrix[sp][b.id];
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
          );
        })()}
      </section>

      {/* ── 30-day roadmap — committed data, horizons with acceptance tests ─────────── */}
      <section aria-labelledby="roadmap" style={{ marginBottom: 30 }}>
        <h2 id="roadmap" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>30-day roadmap</h2>
        {ROADMAP_30D.map((h) => (
          <div key={h.horizon} style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--vault-text-faint)", marginBottom: 6 }}>{h.horizon.replace(/_/g, " ")}</h3>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {h.items.map((i) => (
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
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
          </>
        ) : (
          <p style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
            No alpha artifact yet — run <code>node scripts/internal-alpha-day.mjs</code>. This says
            &ldquo;not generated&rdquo;, never &ldquo;day 1 passing&rdquo;.
          </p>
        )}
      </section>

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
            Derived from the launch gates below, never from the engineering score. Platform completion of{" "}
            {h.platformEngineering.pct}% cannot by itself produce a public go — {gates.filter((g) => g.status !== "PASS").length} gates are
            not passing, and {gates.filter((g) => g.owner === "FOUNDER" && g.status !== "PASS").length} of those are founder-owned.
          </p>
        </div>
      </section>

      {/* ── Today ───────────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="today" style={{ marginBottom: 30 }}>
        <h2 id="today" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Today</h2>
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

      {/* ── Departments ─────────────────────────────────────────────────────────────── */}
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

      {/* ── Sports ──────────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="sports" style={{ marginBottom: 30 }}>
        <h2 id="sports" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Sport product completeness (archive view)</h2>
        <p style={{ fontSize: 12, color: "var(--vault-text-mute)", marginBottom: 10 }}>
          The percentage here measures how complete each sport&apos;s BUILT product/archive is — it is NOT model or launch
          readiness. Readiness truth is the 12-stage gate matrix above (derived, never typed): a sport can be
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

      {/* ── Queues ──────────────────────────────────────────────────────────────────── */}
      <section aria-labelledby="queues">
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
                          <span style={{ color: t.priority === "P0" ? "var(--vault-danger, #f23645)" : "var(--vault-text-faint)", fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>{t.priority}</span>{" "}
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
    </main>
  );
}
