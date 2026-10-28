/* GTP CEO console — renders orchestrator.state() and sends founder actions. No framework, no external requests. */
(() => {
  "use strict";

  const SUGGESTIONS = [
    "Team, prepare GameTimePicks' NFL postgame recap content for last night's games. Identify content opportunities, draft graphics and captions, and report what needs my approval.",
    "Team, add a Copy caption button and a live 280-character counter to each caption in the Approvals card. Have ChatGPT write the engineering spec, have Claude Code plan and implement it in an isolated working copy, verify it independently, and show me the result before anything is kept.",
    "Team, analyze today's biggest NFL conversations on X and identify three opportunities for GameTimePicks to contribute useful content.",
    "Team, review GameTimePicks' current NFL social-content opportunities and propose an improved weekly X content plan.",
    "Team, turn the revised weekly plan into a seven-day content calendar covering NFL, NBA, MLB, UFC and EPL.",
    "Team, prepare today's content queue from the approved calendar.",
    "Team, what should our next product improvement be for the Results page?",
    "status",
    "Pause publishing",
  ];
  const STUB_SEATS = { "api:openai": "CP5", "api:anthropic": "CP5", "api:xai": "CP5", "mcp:chatgpt": "Phase 3", "mcp:claude": "Phase 3", "mcp:grok": "Phase 3" };
  const ROLE_ICON = {
    "chief-of-staff": "CoS", "prompt-architect": "PA", "product-strategist": "PS", "social-strategy": "SS",
    "engineering": "ENG", "integrity-reviewer": "IR", "creative-renderer": "CR", "publisher": "PUB", "growth-analyst": "GA", "verifier": "QA",
    "social-intelligence": "GROK", "content-strategist": "GPT",
  };

  /** Phone views (≤760 px): one section at a time behind a bottom tab bar. Desktop shows everything at once. */
  const VIEWS = [
    { id: "chat", label: "Chat", ico: "◆" },
    { id: "queue", label: "Queue", ico: "▤" },
    { id: "decisions", label: "Approvals", ico: "✓" },
    { id: "tasks", label: "Tasks", ico: "≡" },
    { id: "history", label: "Activity", ico: "⟲" },
    { id: "team", label: "Team", ico: "☰" },
  ];
  const savedView = (() => { try { return localStorage.getItem("gtp-cc-view"); } catch { return null; } })();
  const ui = { last: "", choice: {}, drafts: {}, state: null, view: VIEWS.some((v) => v.id === savedView) ? savedView : "chat" };
  const captionTextMap = new Map();
  const $ = (id) => document.getElementById(id);
  /** Ledger numbers are rendered through Number(): a non-number can never become markup. */
  const num = (x) => Number(x);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
  const title = (role) => ui.state?.seats?.[role]?.title ?? role;

  const Auth = window.GTPAuth;
  async function post(url, body) {
    let payload = body ?? {};
    try {
      payload = await Auth.withStepUp(url, payload);
    } catch (err) {
      return { ok: false, code: err.code ?? "STEP_UP_CANCELLED", detail: "Face ID / Touch ID confirmation was not completed" };
    }
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-CC-Console": "1" }, body: JSON.stringify(payload), credentials: "same-origin" });
    if (res.status === 401) { showAuth("Your session ended. Sign in again."); return { ok: false, code: "NOT_AUTHENTICATED" }; }
    return res.json();
  }

  const APP_OF = { "manual:chatgpt": "ChatGPT", "manual:claude": "Claude", "manual:grok": "Grok" };
  function seatTag(seat, simulated) {
    if (seat === "deterministic") return `<span class="tag det">deterministic code</span>`;
    if (seat === "cli:claude-code") return `<span class="tag claude">Claude Code CLI · your subscription</span>`;
    if (seat?.startsWith("manual:")) return `<span class="tag seat-manual">${esc(APP_OF[seat] ?? seat)} · your app, pasted by you</span>`;
    if (seat === "fake") return `<span class="tag sim">${simulated === false ? "fake" : "simulated agent output"}</span>`;
    return `<span class="tag">${esc(seat)}</span>`;
  }

  function artifactBody(c) {
    const a = c.artifact ?? {};
    switch (c.artifactType) {
      case "engineering-brief":
        if (!a.objective) return "";
        return `<div class="body"><b>Objective.</b> ${esc(a.objective)}</div>
          <div class="section muted">Constraints</div><ul>${(a.constraints ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          <div class="section muted">Acceptance criteria</div><ul>${(a.acceptanceCriteria ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      case "feasibility-report":
        return `<div class="kv"><span>Slate</span><span>${esc(a.slateDate)}</span><span>Games gated</span><span>${num(a.gamesChecked)}</span>
          <span>Eligible</span><span>${(a.eligible ?? []).length}</span><span>Refused</span><span>${(a.refused ?? []).length}</span>
          <span>Drafting</span><span>${esc(a.chosen ? `${a.chosen.matchup} (${a.chosen.eventId})` : "none")}</span></div>
          ${(a.notFeasibleNow ?? []).length ? `<div class="section muted">Not feasible yet</div><ul>${a.notFeasibleNow.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`;
      case "content-angles":
        return `<ol>${(a.angles ?? []).map((x) => `<li><b>${esc(x.angle)}</b> <span class="muted">${esc(x.why ?? "")}</span></li>`).join("")}</ol>
          ${a.tone ? `<div class="body"><b>Tone.</b> ${esc(a.tone)}</div>` : ""}`;
      case "integrity-verdict":
        return `<div class="body">${a.pass ? `<span class="check-ok">PASS</span>` : `<span class="check-bad">REFUSED</span>`} · event ${esc(a.eventId)}</div>
          ${(a.warnings ?? []).length ? `<ul class="warns">${a.warnings.map((w) => `<li>${esc(w.code)}: ${esc(w.detail)}</li>`).join("")}</ul>` : ""}`;
      case "engineering-spec":
        return `<div class="body"><b>Objective.</b> ${esc(a.objective)}</div>
          ${list("User stories", a.userStories)}${list("Files in scope", a.filesInScope)}${list("Acceptance criteria", a.acceptanceCriteria)}${list("Non-goals", a.nonGoals)}`;
      case "implementation-plan":
        return `<div class="section muted">Files Claude will change</div><ul>${(a.files ?? []).map((f) => `<li><code>${esc(f.path)}</code> — ${esc(f.change)}</li>`).join("")}</ul>
          ${list("Steps", a.steps)}${list("Risks", a.risks)}${list("Test plan", a.testPlan)}`;
      case "engineering-result":
        return `${list("Files Claude says it changed", a.filesChanged)}${list("Notes", a.notes)}<div class="muted">Claude's own report. The Verifier checks it independently below.</div>`;
      case "verification":
        return verificationBody(a);
      case "gtp-facts":
        return `<div class="muted">${num(a.games?.length ?? 0)} settled game(s) from ${esc(a.slateDate)} · the only GameTimePicks numbers the team may use</div>`;
      case "x-research":
        return `<ol class="findings">${(a.findings ?? []).map((f) => `<li><b>${esc(f.topic)}</b> — ${esc(f.summary)}
          <div class="links">${(f.sources ?? []).map((src) => xLink(src.url, src.author)).join(" ")}</div></li>`).join("")}</ol>
          ${list("Caveats", a.caveats)}<div class="muted">Grok's findings. Links are as cited; open them before relying on a claim.</div>`;
      case "evidence-check":
        return `<ul>${(a.findings ?? []).map((f) => `<li><span class="${f.verdict === "SOURCE-LINKED" ? "check-ok" : "check-bad"}">${esc(f.verdict)}</span> ${esc(f.topic)} · ${num(f.linkedPosts?.length ?? 0)} cited post(s)</li>`).join("")}</ul><div class="muted">${esc(a.method)}</div>`;
      case "content-proposals":
        return `<ol class="findings">${(a.proposals ?? []).map((p) => `<li><span class="tag">${esc(p.type)}</span> on finding ${num(p.findingIndex)}${p.replyToUrl ? ` · reply to ${xLink(p.replyToUrl)}` : ""}<div class="caption">${esc(p.text)}</div><div class="muted">${esc(p.rationale)}</div></li>`).join("")}</ol>`;
      case "content-check":
        return `<ul>${(a.results ?? []).map((r) => `<li>Draft ${num(r.index) + 1}: ${r.ok ? `<span class="check-ok">passes</span>` : `<span class="check-bad">held back</span> — ${(r.problems ?? []).map((p) => esc(`${p.code} ${p.detail}`)).join("; ")}`}</li>`).join("")}</ul>`;
      case "content-plan":
        return planTable(a);
      case "calendar-facts": {
        const t = (a.grid?.slots ?? []).reduce((m, x) => ({ ...m, [x.status]: (m[x.status] ?? 0) + 1 }), {});
        return `<div class="kv"><span>Window</span><span>${esc(a.grid?.window?.from)} → ${esc(a.grid?.window?.to)} (US Eastern)</span>
          <span>Data</span><span>${esc(a.facts?.source?.label)} · ${num(a.facts?.files?.length ?? 0)} files hashed</span>
          <span>Opportunities</span><span>${num(a.grid?.slots?.length ?? 0)} · ${num(t.READY ?? 0)} ready · ${num(t.NEEDS_VERIFICATION ?? 0)} verify · ${num(t.BLOCKED ?? 0)} blocked</span>
          ${a.base ? `<span>Reuses</span><span>${esc(a.base.commandId)} (Grok research, ChatGPT plan, Claude Code review)</span>` : ""}</div>
          <ul>${Object.entries(a.facts?.sports ?? {}).map(([sp, v]) => `<li><b>${esc(sp)}</b> · ${esc(v.capability.state)} · ${num(v.events.length)} event(s), ${num(v.results.length)} recent result(s)</li>`).join("")}</ul>`;
      }
      case "content-calendar-draft":
        return `<div class="body">${esc(a.summary)}</div><div class="muted">${num(a.picks?.length ?? 0)} picks${a.additions?.length ? ` · ${num(a.additions.length)} additions` : ""}</div>`;
      case "calendar-check":
        return `<div class="muted">${num(a.calendar?.totals?.slots ?? 0)} opportunities · ${num(a.calendar?.totals?.READY ?? 0)} ready · ${num(a.calendar?.totals?.NEEDS_VERIFICATION ?? 0)} verify · ${num(a.calendar?.totals?.BLOCKED ?? 0)} blocked · ${num(a.problems?.length ?? 0)} draft problem(s). The full calendar is in Approvals.</div>`;
      case "post-queue": {
        const by = (st) => (a.packages ?? []).filter((p) => p.status === st).length;
        return `<div class="kv"><span>Day</span><span>${esc(a.date)} (US Eastern)</span><span>From</span><span>approved calendar ${esc(a.calendar?.decisionId)} · digest re-checked</span>
          <span>Data</span><span>${esc(a.dataLabel)}${a.dataCommittedAt ? ` · committed ${esc(time(a.dataCommittedAt))}` : ""}</span>
          <span>Posts</span><span>${num((a.packages ?? []).length)} · ${num(by("READY"))} ready · ${num(by("NEEDS_VERIFICATION"))} verify · ${num(by("BLOCKED"))} blocked · ${num((a.skipped ?? []).length)} not queued</span></div>
          <button type="button" class="btn small goto" data-goto="queue">Open the queue</button>`;
      }
      case "feasibility-review":
        return `<div class="body">${esc(a.summary)}</div><ul>${(a.automationSteps ?? []).map((x) => `<li><b>${esc(x.step)}</b> — reuses ${esc(x.reuses)}; new: ${esc(x.newWork)}; risk: ${esc(x.risk)}</li>`).join("")}</ul>${list("Tests", a.tests)}${list("Open questions", a.openQuestions)}`;
      case "strategy-note":
        return a.recommendation ? `<div class="body"><b>Recommendation.</b> ${esc(a.recommendation)}</div><ul>${(a.rationale ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
      default:
        return "";
    }
  }

  function list(label, items) {
    return items?.length ? `<div class="section muted">${esc(label)}</div><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  }

  function verificationBody(a) {
    const t = a.tests ?? {};
    return `<div class="kv">
        <span>Changed files</span><span>${(a.files ?? []).map((f) => `<span class="${f.inScope ? "check-ok" : "check-bad"}">${esc(f.status)} ${esc(f.file)}</span>`).join("<br>") || "none"}</span>
        <span>Scope</span><span>${a.outOfScope?.length ? `<span class="check-bad">OUT OF SCOPE: ${esc(a.outOfScope.join(", "))}</span>` : `<span class="check-ok">all inside console/ and tests/</span>`}</span>
        <span>Tests (run by the orchestrator)</span><span>${t.ok ? `<span class="check-ok">passed</span>` : `<span class="check-bad">FAILED</span>`} · ${num(t.pass)} pass · ${num(t.fail)} fail · ${Math.round((t.durationMs ?? 0) / 1000)} s</span>
        <span>Your checkout</span><span>${a.checkoutUnchanged === false ? `<span class="check-bad">changed</span>` : `<span class="check-ok">unchanged</span>`}</span>
        <span>Working copy</span><span><code>${esc(a.workcopy?.dir)}</code> · ${esc(a.workcopy?.branch)}</span>
      </div>
      ${a.screenshots?.length ? `<div class="shots">${a.screenshots.map((x) => `<figure><img src="/media/${encodeURIComponent(x.file)}" alt="${esc(x.name)} screenshot of the changed console" data-zoom><figcaption>${esc(x.name)} · ${num(x.width)}px${x.overflow > 0 ? ` · <span class="check-bad">overflow ${num(x.overflow)}px</span>` : ""}</figcaption></figure>`).join("")}</div>` : ""}
      ${a.screenError ? `<div class="warns">Screenshots failed: ${esc(a.screenError)}</div>` : ""}
      ${t.failing?.length ? `<ul class="warns">${t.failing.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
      <details><summary>Diff (${(a.files ?? []).length} file(s))</summary><pre class="diff">${esc(a.diff || "(no changes)")}</pre></details>
      <details><summary>Test output</summary><pre>${esc(t.tail ?? "")}</pre></details>`;
  }

  /** A link only when it is a specific public X post; anything else is shown as inert text. */
  const X_POST = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{5,25}(?:[/?#][^\s"'<>]*)?$/;
  function xLink(url, label) {
    const u = String(url ?? "");
    return X_POST.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label || u.replace(/^https:\/\/(www\.)?/, ""))}</a>` : `<span class="check-bad" title="not a specific X post">${esc(u)}</span>`;
  }

  function planTable(a) {
    return `<div class="body">${esc(a.summary)}</div><div class="plan-table">${(a.weekly ?? []).map((d) => `<div><b>${esc(d.day)}</b> · ${esc(d.format)}<br>${esc(d.theme)}<div class="muted">data: ${esc(d.dataSource)}${d.example ? ` · e.g. “${esc(d.example)}”` : ""}</div></div>`).join("")}</div>${list("KPIs", a.kpis)}${list("Risks", a.risks)}`;
  }

  const EXEC_CLASS = { "REAL CONNECTED AGENT": "real", "MANUAL PROVIDER HANDOFF": "manual", "SIMULATED AGENT OUTPUT": "sim", "DETERMINISTIC AUTOMATION": "det", "UNAVAILABLE / NOT CONFIGURED": "na" };
  const execTag = (e) => (e ? `<span class="tag exec exec-${EXEC_CLASS[e] ?? "na"}">${esc(e)}</span>` : "");

  function runLine(r, cost) {
    if (!r) return "";
    return `<div class="runline">Session <code>${esc(r.sessionId ?? "?")}</code> · ${esc(r.model ?? "")}${r.effort ? ` · effort ${esc(r.effort)}` : ""} · ${Math.round((r.durationMs ?? 0) / 1000)} s · ${esc(r.numTurns ?? "?")} turns${r.lookups != null ? ` · ${num(r.lookups)} file lookups` : ""} ·
      est. usage $${num(cost?.estUsageUsd ?? 0).toFixed(2)} (API-equivalent, from your Max allowance; cash $0) ·
      tokens ${num(cost?.tokensIn ?? 0)} in / ${num(cost?.tokensOut ?? 0)} out · <a href="/${esc(r.rawLog)}" target="_blank" rel="noopener">raw log</a></div>`;
  }

  function contributionCard(c) {
    if (c.artifactType === "consolidated-report") return "";
    const cost = c.cost ? `$${num(c.cost.usd)}` : "$0";
    return `<div class="msg">
      <div class="who"><span class="tag">${esc(ROLE_ICON[c.role] ?? "")}</span><b>${esc(title(c.role))}</b>${execTag(c.execution)}${seatTag(c.seat, c.simulated)}
        ${c.contractValid === false ? `<span class="tag" style="color:var(--danger)">contract not met</span>` : ""}
        <span class="tag cost">${cost}</span><span>${time(c.at)}</span></div>
      <div class="body">${esc(c.summary)}</div>
      ${runLine(c.run, c.cost)}
      ${artifactBody(c)}
      <details><summary>Artifact (${esc(c.artifactType)})</summary><pre>${esc(JSON.stringify(c.artifact, null, 2))}</pre></details>
    </div>`;
  }

  function deliverableCard(d, captions) {
    if (d.kind !== "graphic") return "";
    return `<div class="msg">
      <div class="who"><span class="tag">CR</span><b>Creative Renderer</b><span class="tag det">deliverable</span><span>${time(d.at)}</span></div>
      <div class="deliverable">
        <img src="/media/${encodeURIComponent(d.file)}" alt="${esc(d.altText)}" data-zoom>
        <div>
          <div class="muted">${esc(d.template)} · ${num(d.width)}×${num(d.height)} · sha256 ${esc(d.sha256.slice(0, 12))}…</div>
          ${(captions?.variants ?? []).map((v) => `<div class="caption"><div class="meta">Caption ${esc(v.id)} · ${esc(v.tone)} · ${v.text.length} chars ·
            ${v.check?.ok ? `<span class="check-ok">validator ✓</span>` : `<span class="check-bad">validator ✗ ${esc((v.check?.problems ?? []).map((p) => p.code).join(", "))}</span>`}
            ${captions.simulated ? ` · <span style="color:var(--warn)">template (fake seat)</span>` : ""}</div>${esc(v.text)}</div>`).join("")}
        </div>
      </div>
    </div>`;
  }

  function runCard(task, lines) {
    const live = task.status === "RUNNING";
    return `<div class="msg run ${live ? "live" : ""}">
      <div class="who"><span class="tag">${esc(ROLE_ICON[task.ownerRole] ?? "")}</span><b>${esc(title(task.ownerRole))}</b>${seatTag(task.seat)}
        <span class="status ${esc(task.status)}">${esc(task.status)}</span><span>${esc(task.title ?? "")}</span></div>
      <ol class="progress">${lines.slice(-14).map((l) => `<li><span class="t">${time(l.at)}</span>${esc(l.line)}</li>`).join("")}</ol>
      ${lines.length > 14 ? `<div class="muted">${lines.length - 14} earlier line(s) in Activity</div>` : ""}
      ${live ? `<div class="muted">● running — Pause or Stop now cancels it</div>` : ""}
    </div>`;
  }

  function reportCard(r) {
    const list = (label, items) => (items?.length ? `<div class="section">${label}</div><ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
    return `<div class="msg report">
      <div class="who"><span class="tag">CoS</span><b>Chief of Staff</b><span class="tag sim">consolidated report</span><span>${time(r.at)}</span></div>
      <h3>${esc(r.headline)}</h3>
      ${list("What the team did", r.lines)}
      ${list("Deliverables", r.deliverables)}
      ${list("Needs your decision", r.decisionsNeeded)}
      ${r.decisionsNeeded?.length ? `<button type="button" class="btn primary small goto mobile-only" data-goto="decisions">Review in Approvals</button>` : ""}
      ${list("Blocked or refused (by policy)", r.refusals)}
      ${list("Warnings", r.warnings)}
      ${r.usage ? `<div class="section">Claude Code usage</div><div class="body">${num(r.usage.claudeRuns)} run(s) · ${num(r.usage.durationS)} s · est. $${num(r.usage.estUsageUsd).toFixed(2)} of your Max allowance. ${esc(r.usage.note)}</div>` : ""}
      ${r.cost ? `<div class="section">Cost</div><div class="body">$${num(r.cost.usd)} · ${esc(r.cost.note ?? "")}</div>` : ""}
    </div>`;
  }

  function waitingCard(t) {
    const draft = ui.drafts[t.taskId] ?? "";
    return `<div class="msg waiting">
      <div class="who"><span class="tag">${esc(ROLE_ICON[t.ownerRole] ?? "")}</span><b>${esc(title(t.ownerRole))}</b>${seatTag(t.seat)}<span>waiting for you</span></div>
      <div class="body">This role is seated in <b>${esc(t.app ?? t.seat)}</b>. Copy the prompt into <b>your own ${esc(t.app ?? "app")}</b>, then paste its whole answer below. No API is called; the answer must match the required JSON shape before it can go to gate ${t.expectedArtifactType === "engineering-spec" ? "G1" : "review"}.</div>
      <details open><summary>Prompt to copy</summary><pre id="prompt-${esc(t.taskId)}">${esc(t.prompt)}</pre></details>
      <div class="row" style="margin-top:8px"><button class="btn small" data-copy="${esc(t.taskId)}">Copy prompt</button></div>
      <textarea data-draft="${esc(t.taskId)}" rows="5" style="width:100%;margin-top:8px" placeholder="Paste the answer (with its \`\`\`json block) here">${esc(draft)}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn primary small" data-submit="${esc(t.taskId)}">Record answer</button></div>
    </div>`;
  }

  function renderThread(s) {
    if (!s.commands.length) {
      return `<div class="empty"><h1>Give the team an objective.</h1>
        <p>Every role below runs locally on a free seat (simulated or pasted by you). Nothing is posted, nothing is spent: the publisher is a mock and the budget is $0.</p></div>`;
    }
    const out = [];
    for (const c of s.commands) {
      out.push(`<div class="msg ceo"><div class="who"><b>You (CEO)</b><span>${time(c.at)}</span><span class="tag">intent ${esc(c.intent)}</span></div><div class="body">${esc(c.text)}</div></div>`);
      if (c.plan) {
        out.push(`<div class="msg"><div class="who"><span class="tag">CoS</span><b>Chief of Staff</b><span class="tag sim">plan</span><span>${time(c.at)}</span></div>
          <div class="body">Here is how the team will handle this. Limits: ≤${num(c.plan.limits.maxHops)} delegation hops, ≤${num(c.plan.limits.maxTasks)} tasks, $${num(c.plan.limits.budgetUsd)} budget.</div>
          <ul class="plan">${c.plan.steps.map((st) => `<li><span class="n">${num(st.n)}</span><span><b>${esc(st.roleTitle)}</b> — ${esc(st.title)} <span class="tag ${st.seat.startsWith("manual:") ? "seat-manual" : ""}">seat ${esc(st.seat)}</span>${st.via ? ` <span class="muted">(handed over by ${esc(st.via)})</span>` : ""}</span></li>`).join("")}</ul></div>`);
      }
      const captions = c.deliverables.find((d) => d.kind === "captions");
      const events = [
        ...c.contributions.map((x) => ({ at: x.at, html: contributionCard(x) })),
        ...c.refusals.map((x) => ({ at: x.at, html: `<div class="msg refusal"><div class="who"><b>${x.decisionId ? "Publisher" : "Orchestrator"}</b><span class="tag" style="color:var(--warn)">${esc(x.code)}</span><span>${time(x.at)}</span></div>
          <div class="body">${x.decisionId ? `Publisher refused to send the approved draft: ${esc(x.detail)}. Nothing left this machine.` : x.fromRole ? `${esc(title(x.fromRole))} proposed handing work to ${esc(title(x.toRole))}${x.proposal ? ` (“${esc(x.proposal)}”)` : ""}. Refused: ${esc(x.detail)}. It goes into the report for you instead.` : esc(x.detail)}</div>
          ${runLine(x.run, x.cost)}
          ${x.partialOutput ? `<details><summary>Partial output — diagnostic only (${num(x.partialOutput.attempts)} attempt(s), last one ${x.partialOutput.schemaValid ? "matched the schema" : "did not match the schema"})</summary>
            <div class="warns">${esc(x.partialOutput.note)}</div><pre>${esc(JSON.stringify(x.partialOutput.artifact, null, 2))}</pre></details>` : ""}</div>` })),
        ...c.deliverables.map((x) => ({ at: x.at, html: deliverableCard(x, captions) })),
        ...c.reports.map((x) => ({ at: x.at, html: reportCard(x) })),
        ...c.tasks.filter((t) => t.status === "AWAITING_INPUT").map((t) => ({ at: t.updatedAt, html: waitingCard(t) })),
        ...c.tasks.filter((t) => c.progress.some((p) => p.taskId === t.taskId)).map((t) => {
          const lines = c.progress.filter((p) => p.taskId === t.taskId);
          return { at: lines[0].at, html: runCard(t, lines) };
        }),
      ].sort((a, b) => a.at.localeCompare(b.at));
      for (const e of events) out.push(e.html);
      const running = c.tasks.find((t) => t.status === "RUNNING" || t.status === "QUEUED");
      if (running) out.push(`<div class="muted" style="padding:4px 2px">● ${esc(title(running.ownerRole))} is working…</div>`);
    }
    return out.join("");
  }

  const isOpen = (d) => (d.kind === "gate" || d.kind === "proposal" ? !d.resolution : !d.receipt && d.resolution?.verdict !== "reject");

  function gateSubject(d) {
    const x = d.subject ?? {};
    if (d.subjectType === "engineering-spec") return `<div class="body"><b>Objective.</b> ${esc(x.objective)}</div>${list("Acceptance criteria", x.acceptanceCriteria)}${list("Files in scope", x.filesInScope)}`;
    if (d.subjectType === "implementation-plan") return `<div class="body">${esc(x.plan?.summary)}</div><div class="section muted">Files</div><ul>${(x.plan?.files ?? []).map((f) => `<li><code>${esc(f.path)}</code> — ${esc(f.change)}</li>`).join("")}</ul>${list("Risks", x.plan?.risks)}`;
    if (d.subjectType === "verification") {
      const shots = ui.state.commands.flatMap((c) => c.contributions).filter((c) => c.artifactType === "verification").at(-1)?.artifact;
      return `<div class="body">Branch <code>${esc(x.branch)}</code> · ${(x.files ?? []).length} file(s): ${(x.files ?? []).map((f) => `<span class="${f.inScope ? "check-ok" : "check-bad"}">${esc(f.file)}</span>`).join(", ")}</div>
        ${shots ? `<div class="kv"><span>Tests</span><span>${shots.tests?.ok ? `<span class="check-ok">passed (${num(shots.tests.pass)})</span>` : `<span class="check-bad">FAILED (${num(shots.tests?.fail)})</span>`}</span></div>` : ""}
        ${shots?.screenshots?.length ? `<div class="shots">${shots.screenshots.map((sh) => `<figure><img src="/media/${encodeURIComponent(sh.file)}" alt="${esc(sh.name)}" data-zoom><figcaption>${esc(sh.name)}</figcaption></figure>`).join("")}</div>` : ""}`;
    }
    return "";
  }

  function gateCard(d) {
    const r = d.resolution;
    return `<div class="decision gate">
      <div class="q">${esc(d.question)}</div>
      ${gateSubject(d)}
      ${(d.warnings ?? []).length ? `<ul class="warns">${d.warnings.map((w) => `<li>${esc(w.code)}: ${esc(w.detail)}</li>`).join("")}</ul>` : ""}
      <div class="muted">Bound to sha256 ${esc(d.subjectDigest.slice(0, 16))}… · founder only</div>
      ${r ? `<div class="${r.verdict === "approve" || r.verdict === "keep" ? "receipt" : "blocked"}">${esc(d.gate)} · ${esc(r.verdict.toUpperCase())} by you at ${esc(time(r.approvedAt))}</div>`
        : `<div class="row actions" style="margin-top:8px">${d.options.map((o) => `<button class="btn ${o.id === "approve" || o.id === "keep" ? "primary" : o.id === "discard" || o.id === "reject" ? "" : ""}" data-gate="${esc(d.decisionId)}" data-verdict="${esc(o.id)}" ${o.allowed ? "" : "disabled title=\"not available\""}>${esc(o.label)}</button>`).join("")}</div>`}
    </div>`;
  }

  const STATUS_LABEL = { READY: "Ready", NEEDS_VERIFICATION: "Needs verification", BLOCKED: "Blocked" };
  function sourceItem(ref) {
    const u = String(ref ?? "");
    return /^https:\/\//.test(u) ? xLink(u) : `<code>${esc(u)}</code>`;
  }
  function calendarBody(x, d) {
    const c = x.calendar ?? {};
    const exportFile = ui.state.commands.find((k) => k.commandId === d.commandId)?.deliverables?.find((v) => v.kind === "calendar-export")?.file;
    const dates = [...new Set((c.slots ?? []).map((s) => s.date))];
    const day = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
    return `<div class="body">${esc(c.summary)}</div>
      <div class="cal-totals"><span class="st st-READY">${num(c.totals?.READY ?? 0)} ready</span><span class="st st-NEEDS_VERIFICATION">${num(c.totals?.NEEDS_VERIFICATION ?? 0)} need verification</span><span class="st st-BLOCKED">${num(c.totals?.BLOCKED ?? 0)} blocked</span><span class="muted">${num(c.totals?.chosen ?? 0)} chosen by ChatGPT · ${esc(c.window?.from)} → ${esc(c.window?.to)}</span></div>
      <div class="muted">${esc(c.rule)}</div>
      ${dates.map((date) => `<details class="cal-day" ${date === dates[0] ? "open" : ""}><summary><b>${esc(day(date))}</b> · ${num(c.slots.filter((s) => s.date === date).length)} opportunities</summary>
        ${c.slots.filter((s) => s.date === date).map((s) => `<div class="slot ${s.chosen ? "chosen" : ""}">
          <div class="slot-head"><span class="st st-${esc(s.status)}">${esc(STATUS_LABEL[s.status] ?? s.status)}</span><span class="tag">${esc(s.sport)}</span><span class="tag">${esc(s.format)}</span>${s.chosen ? `<span class="tag exec exec-real">P${num(s.priority)}</span>` : ""}</div>
          <div><b>${esc(s.opportunity)}</b>${s.angle && s.angle !== s.opportunity ? ` — ${esc(s.angle)}` : ""}</div>
          ${s.draft ? `<div class="caption">${esc(s.draft)}</div>` : ""}
          <div class="kv"><span>Purpose</span><span>${esc(s.purpose)}</span><span>Window</span><span>${esc(s.publishWindow)}</span><span>Agent</span><span>${esc(s.responsibleAgent)}</span><span>Evidence</span><span>${esc(s.evidenceRequired)}</span>
            ${s.reasons?.length ? `<span>Why</span><span>${esc(s.reasons.join("; "))}${s.unblocksWhen ? ` · unblocks when ${esc(s.unblocksWhen)}` : ""}</span>` : ""}</div>
          ${s.facts?.length ? `<details><summary>Facts (${num(s.facts.length)})</summary><ul>${s.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>` : ""}
          ${s.sourceRefs?.length ? `<details><summary>Sources (${num(s.sourceRefs.length)})</summary><div class="links">${s.sourceRefs.map(sourceItem).join(" ")}</div></details>` : ""}
        </div>`).join("")}</details>`).join("")}
      ${(x.backlog ?? []).length ? `<details class="cal-day"><summary><b>Implementation backlog</b> · ${num(x.backlog.length)} items</summary><ol>${x.backlog.map((b) => `<li><b>${esc(b.item)}</b> — ${esc(b.owner)}; depends on ${esc(b.dependsOn)}${b.acceptance ? `; ${esc(b.acceptance)}` : ""}</li>`).join("")}</ol></details>` : ""}
      <div class="muted">Data commit <code>${esc(String(x.dataCommit ?? "working tree").slice(0, 12))}</code>${x.base ? ` · reuses ${esc(x.base)}` : ""}${exportFile ? ` · <a href="/${esc(exportFile)}" target="_blank" rel="noopener">Markdown export</a>` : ""}</div>`;
  }

  function proposalCard(d) {
    const r = d.resolution;
    const x = d.subject ?? {};
    const body = d.subjectType === "content-calendar" ? calendarBody(x, d) : d.subjectType === "content-proposal"
      ? `<div class="caption">${esc(x.proposal?.text)}</div><div class="muted">${esc(x.proposal?.type)} · ${esc(x.proposal?.rationale)}</div>
         ${x.finding ? `<div class="section muted">Based on Grok's finding</div><div class="body">${esc(x.finding.topic)} — ${esc(x.finding.summary)}</div><div class="links">${(x.finding.sources ?? []).map((src) => xLink(src.url, src.author)).join(" ")}</div>` : ""}`
      : `${planTable(x.plan ?? {})}${x.feasibility ? `<div class="section muted">Claude Code's automation review</div><div class="body">${esc(x.feasibility.summary)}</div>` : `<div class="muted">No Claude Code review (see the report for why).</div>`}`;
    const label = { approve: "APPROVED AS A DRAFT (not published)", reject: "REJECTED", revise: "REVISION REQUESTED", defer: "DEFERRED" };
    return `<div class="decision gate">
      <div class="q">${esc(d.question)}</div>${body}
      <div class="muted">Bound to sha256 ${esc(d.subjectDigest.slice(0, 16))}… · approving records a draft; nothing is posted</div>
      ${r ? `<div class="${r.verdict === "approve" ? "receipt" : "blocked"}">${esc(label[r.verdict] ?? r.verdict)} at ${esc(time(r.approvedAt))}${r.note ? ` · “${esc(r.note)}”` : ""}</div>`
        : `<div class="row actions" style="margin-top:8px">${d.options.map((o) => `<button class="btn ${o.id === "approve" ? "primary" : ""}" data-gate="${esc(d.decisionId)}" data-verdict="${esc(o.id)}">${esc(o.label)}</button>`).join("")}</div>`}
    </div>`;
  }

  // ── D1 content queue ──────────────────────────────────────────────────────────────────────────────────────
  const LIFE_LABEL = { invalidated: "Approval invalidated · content changed", drafted: "Needs your decision", approved: "Approved · post it yourself", scheduled: "Scheduled by you", published: "Published by you", rejected: "Rejected", revise: "Revision requested", deferred: "Deferred", superseded: "Superseded" };
  const postOpen = (p) => p.lifecycle === "drafted";
  /** X's weighted length (same rules as contracts/post-queue.mjs xLength): emoji 2, light ranges 1, others 2. */
  const LIGHT = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
  function xLen(text) {
    let n = 0;
    for (const { segment } of new Intl.Segmenter("en", { granularity: "grapheme" }).segment(String(text))) {
      if (/\p{Extended_Pictographic}/u.test(segment)) { n += 2; continue; }
      for (const ch of segment) { const cp = ch.codePointAt(0); if (cp === 0xfe0f || cp === 0x200d) continue; n += LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2; }
    }
    return n;
  }
  const draftVal = (k) => esc(ui.drafts[k] ?? "");
  function evidenceList(pkg) {
    const ref = (r) => (typeof r === "string" ? r : r ? `${r.path ?? ""}${r.forecastId ? `#${r.forecastId}` : ""}${r.commit ? `@${String(r.commit).slice(0, 12)}` : ""}${r.sha256 ? ` · ${String(r.sha256).slice(0, 12)}` : ""}` : "");
    return `<details><summary>Evidence (${num(pkg.claims?.length ?? 0)} facts)</summary><ul class="evidence">${(pkg.claims ?? []).map((c) => `<li><b>${esc(c.display)}</b> <span class="muted">${esc(c.key)} · ${esc(ref(c.evidenceRef))}</span></li>`).join("")}</ul>
      ${(pkg.evidence ?? []).length ? `<div class="muted">${pkg.evidence.map((e) => `${esc(e.label)}: ${esc(e.ref)}`).join("<br>")}</div>` : ""}</details>`;
  }
  function postCaptions(p) {
    const decided = p.resolution;
    const chosen = ui.choice[p.decisionId] ?? decided?.captionId ?? p.options.find((o) => o.check?.ok)?.captionId;
    return p.options.map((o) => {
      captionTextMap.set(`${p.decisionId}:${o.captionId}`, o.text);
      const n = xLen(o.text);
      const approvedThis = decided?.verdict === "approve" && decided.captionId === o.captionId;
      if (decided && decided.verdict === "approve" && !approvedThis) return "";
      return `<label class="option ${chosen === o.captionId ? "selected" : ""}">
        <input type="radio" name="opt-${esc(p.decisionId)}" value="${esc(o.captionId)}" ${chosen === o.captionId ? "checked" : ""} ${decided || !o.check?.ok ? "disabled" : ""} data-choose="${esc(p.decisionId)}">
        <div><div class="txt xpost">${esc(o.text)}</div>
        <div class="meta">${approvedThis ? `<b class="check-ok">APPROVED</b> · ` : ""}Caption ${esc(o.captionId)} · ${esc(o.tone)}${o.source === "chatgpt-calendar-draft" ? " · ChatGPT's wording" : " · template from the evidence"} · ${o.check?.ok ? `<span class="check-ok">check ✓</span>` : `<span class="check-bad">check ✗ ${esc((o.check?.problems ?? []).map((x) => `${x.code} ${x.detail}`).join("; "))}</span>`}</div>
        <span class="caption-counter${n > 280 ? " over" : ""}" title="X-weighted length (emoji count 2)">${num(n)}/280 on X</span>
        <button type="button" class="btn small" data-copy-caption="${esc(p.decisionId)}:${esc(o.captionId)}">Copy caption</button></div>
      </label>`;
    }).join("");
  }
  function postActions(p) {
    const pkg = p.package;
    const id = esc(p.decisionId);
    if (p.lifecycle === "superseded") return `<div class="muted">A newer queue proposed this post again; decide there.</div>`;
    if (p.lifecycle === "drafted") {
      const designOk = p.designApproved !== false;
      const ready = designOk && (pkg.status === "READY" || pkg.kind === "x-reply" || pkg.kind === "td-top3");
      const why = !designOk ? "Approve the design first" : `Not approvable: ${esc(STATUS_LABEL[pkg.status] ?? pkg.status)}`;
      return `${pkg.kind === "x-reply" ? `<label class="confirm"><input type="checkbox" data-confirm="${id}" ${ui.drafts[`confirm:${p.decisionId}`] ? "checked" : ""}> I opened the cited posts and they say what the finding claims</label>` : ""}
        ${pkg.kind === "td-top3" ? `<label class="confirm"><input type="checkbox" data-avail="${id}" ${ui.drafts[`avail:${p.decisionId}`] ? "checked" : ""}> I confirmed all three players are active and in their expected roles</label>` : ""}
        <div class="row actions">
          <button class="btn ${ready ? "primary" : ""}" data-post-approve="${id}" ${ready ? "" : "disabled"}>${ready ? "Approve this caption" : why}</button>
          <button class="btn" data-post-verdict="reject" data-post="${id}">Reject</button>
          <button class="btn" data-post-verdict="revise" data-post="${id}">Revise</button>
          <button class="btn" data-post-verdict="defer" data-post="${id}">Defer</button>
        </div>`;
    }
    if (p.lifecycle === "approved" || p.lifecycle === "scheduled") {
      return `<div class="receipt">Approved caption ${esc(p.resolution.captionId)} at ${esc(time(p.resolution.approvedAt))}${p.resolution.sourcesConfirmed ? " · you confirmed the cited posts" : ""} · digest ${esc(p.resolution.approvedExactDigest.slice(0, 12))}…<br>Post it yourself on X${pkg.media ? " with the graphic" : ""}, then record the link.${p.schedule ? `<br>Scheduled by you for ${esc(new Date(p.schedule.scheduledFor).toLocaleString())}` : ""}</div>
        ${pkg.media ? `<a class="btn small" href="/media/${encodeURIComponent(pkg.media.file)}" download>Download graphic</a>` : ""}
        <div class="field"><label for="xurl-${id}">X link of your post</label><input id="xurl-${id}" type="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://x.com/…/status/…" data-draft="xurl:${id}" value="${draftVal(`xurl:${p.decisionId}`)}"></div>
        <div class="row actions"><button class="btn" data-post-record="verify" data-post="${id}">Check before posting</button><button class="btn primary" data-post-record="publish" data-post="${id}">Record X link</button></div>
        ${(() => { const c = p.checks.filter((x) => x.phase === "pre-publish").at(-1); return c ? `<div class="${c.status === "READY" ? "receipt" : "blocked"}">Checked ${esc(time(c.checkedAt))}: ${esc(c.status)}${c.reasons?.length ? ` — ${esc(c.reasons.join("; "))}` : ""}</div>` : ""; })()}
        ${p.lifecycle === "approved" ? `<div class="field"><label for="sched-${id}">Or: scheduled in X for</label><input id="sched-${id}" type="datetime-local" data-draft="sched:${id}" value="${draftVal(`sched:${p.decisionId}`)}"></div>
        <div class="row"><button class="btn small" data-post-record="schedule" data-post="${id}">Mark scheduled</button></div>` : ""}`;
    }
    if (p.lifecycle === "published") {
      const r = p.receipt;
      const m = p.engagement.at(-1)?.metrics;
      return `<div class="receipt">✓ Posted by you · ${xLink(r.canonicalUrl)}<br>${esc(new Date(r.publishedAt).toLocaleString())} · caption ${esc(r.captionId)} · digest ${esc(r.bundleDigest.slice(0, 12))}…<br>${esc(r.verification)}</div>
        ${(r.warnings ?? []).length ? `<ul class="warns">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
        ${p.checks.map((c) => `<div class="${c.status === "CONFIRMED" ? "receipt" : "blocked"}">After kickoff: ${esc(c.status)} — ${esc(c.reasons?.[0])} <span class="muted">(${esc(c.basis)})</span></div>`).join("")}
        <details ${m ? "" : "open"}><summary>Engagement${m ? `: ${Object.entries(m).map(([k, v]) => `${esc(k)} ${num(v)}`).join(" · ")}` : ""}</summary>
          <div class="metrics">${["impressions", "likes", "reposts", "replies", "bookmarks"].map((k) => `<label>${esc(k)}<input type="number" inputmode="numeric" min="0" step="1" data-draft="m:${id}:${k}" value="${draftVal(`m:${p.decisionId}:${k}`)}"></label>`).join("")}</div>
          <div class="row"><button class="btn small" data-post-record="engagement" data-post="${id}">Save numbers</button><span class="muted">From X analytics, entered by you; not verified.</span></div>
        </details>`;
    }
    return `<div class="blocked">${esc(LIFE_LABEL[p.lifecycle])}${p.resolution?.note ? ` · “${esc(p.resolution.note)}”` : ""}</div>`;
  }
  function postCard(p) {
    const pkg = p.package;
    return `<article class="post decision ${postOpen(p) ? "open" : ""}" id="post-${esc(p.decisionId)}">
      <div class="slot-head"><span class="st st-${esc(pkg.status)}">${esc(STATUS_LABEL[pkg.status] ?? pkg.status)}</span><span class="tag life life-${esc(p.lifecycle)}">${esc(LIFE_LABEL[p.lifecycle])}</span><span class="tag">${esc(pkg.sport)}</span><span class="tag">${esc(pkg.format ?? pkg.kind)}</span>${pkg.priority === 3 ? `<span class="tag">catch-up</span>` : ""}${pkg.template ? `<span class="tag ${p.designApproved ? "life-published" : "life-drafted"}" title="design ${esc(pkg.template)} · ${esc(pkg.assetManifest)}">${esc(pkg.template)}${p.designApproved ? " · design ✓" : " · design not approved"}</span>` : ""}</div>
      <div class="q">${esc(pkg.title)}</div>
      ${pkg.media ? `<img src="/media/${encodeURIComponent(pkg.media.file)}" alt="${esc(pkg.media.altText)}" data-zoom loading="lazy">` : `<div class="muted">Text post (no graphic).</div>`}
      ${(pkg.reasons ?? []).length ? `<ul class="warns">${pkg.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      ${pkg.featured?.length ? `<div class="muted">Featured in the caption: ${pkg.featured.map((f) => `<b>${esc(f.name ?? "none")}</b> (${esc(f.team)}) — ${esc(f.basis)}`).join(" · ")}. A caption highlight, not a model ranking.</div>` : ""}
      ${pkg.xSources?.length ? `<div class="section muted">Open these first</div><div class="links">${pkg.xSources.map((u) => xLink(u)).join(" ")}</div>` : ""}
      ${postCaptions(p)}
      ${evidenceList(pkg)}
      ${postActions(p)}
    </article>`;
  }
  function renderQueue(s) {
    const posts = (s.posts ?? []).filter((p) => p.lifecycle !== "superseded");
    const open = posts.filter(postOpen).length;
    const queues = s.commands.filter((c) => c.intent === "daily-queue").map((c) => ({ c, q: c.contributions.find((x) => x.artifactType === "post-queue")?.artifact, file: c.deliverables.find((d) => d.kind === "queue-export")?.file })).filter((x) => x.q);
    if (!posts.length && !queues.length) return `<h2>Content queue <span class="count">0</span></h2><div class="muted">No queue yet. Ask: “Team, prepare today's content queue from the approved calendar.” Approving the calendar authorized no post; each post gets its own decision here.</div>`;
    // Today first (US Eastern), then upcoming days, then earlier ones; the first day with open posts starts expanded.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    const all = [...new Set(posts.map((p) => p.date))].sort();
    const dates = [...all.filter((d) => d >= today), ...all.filter((d) => d < today).reverse()];
    // Up next: every open upcoming post (priority 1), soonest start first, ahead of anything else; catch-up last.
    const startOf = (k) => k.startUtc ?? k.verification?.kickoffUtc ?? k.kickoffUtc ?? k.tipUtc ?? k.firstKickoffUtc ?? "9999";
    const upNext = posts.filter((p) => postOpen(p) && p.package.priority === 1).sort((a, b) => String(startOf(a.package)).localeCompare(String(startOf(b.package))) || a.postId.localeCompare(b.postId));
    const upIds = new Set(upNext.map((p) => p.decisionId));
    const inv = s.inventory;
    const openDay = dates.find((d) => posts.some((p) => p.date === d && postOpen(p))) ?? dates[0];
    const latest = queues.at(-1);
    const counts = posts.reduce((m, p) => ({ ...m, [p.lifecycle]: (m[p.lifecycle] ?? 0) + 1 }), {});
    const dz = s.design;
    const designBar = dz ? `<div class="${dz.approved ? "receipt" : "blocked"}">Graphic design <b>${esc(dz.template)}</b> · ${esc(dz.assetManifest)}: ${dz.approved ? `approved ${esc(time(dz.approvedAt))} — design only; every post still needs its own approval` : "not approved yet — V2.1 posts can't be approved for publishing until it is"}
      ${dz.approved ? "" : `<div class="row" style="margin-top:6px"><button class="btn" data-design="1">Approve this design version</button></div>`}</div>` : "";
    return `<h2>Content queue <span class="count">${num(open)} open</span></h2>${designBar}
      ${inv ? `<div class="muted">Open: ${num(inv.open)} · ${num(inv.byStatus.READY ?? 0)} ready · ${num(inv.byStatus.NEEDS_VERIFICATION ?? 0)} need verification · ${num(inv.byStatus.BLOCKED ?? 0)} blocked · ${num(inv.graphics)} with graphics</div>` : ""}
      ${upNext.length ? `<details class="cal-day" open><summary><b>Up next</b> · ${num(upNext.length)} upcoming post(s), soonest first</summary>${upNext.map(postCard).join("")}</details>` : ""}
      <div class="cal-totals">${Object.entries(counts).map(([k, v]) => `<span class="tag life life-${esc(k)}">${esc(LIFE_LABEL[k])} ${num(v)}</span>`).join("")}</div>
      <div class="muted">Each post is approved on its own and published by you on X; the Command Center never posts.${latest?.file ? ` · <a href="/${esc(latest.file)}" target="_blank" rel="noopener">Queue export</a>` : ""}</div>
      ${dates.map((d) => `<details class="cal-day" ${d === openDay && !upNext.length ? "open" : ""}><summary><b>${esc(new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }))}</b> · ${num(posts.filter((p) => p.date === d).length)} post(s) · ${num(posts.filter((p) => p.date === d && postOpen(p)).length)} open</summary>
        ${posts.filter((p) => p.date === d && !upIds.has(p.decisionId) && p.package.priority !== 3).sort((a, b) => (a.package.priority ?? 2) - (b.package.priority ?? 2)).map(postCard).join("")}</details>`).join("")}
      ${posts.some((p) => p.package.priority === 3) ? `<details class="cal-day"><summary><b>Catch-up (older results)</b> · ${num(posts.filter((p) => p.package.priority === 3).length)}</summary>${posts.filter((p) => p.package.priority === 3).map(postCard).join("")}</details>` : ""}
      ${latest?.q?.skipped?.length ? `<details class="cal-day"><summary><b>Not in the ${esc(latest.q.date)} queue</b> · ${num(latest.q.skipped.length)}</summary><ul>${latest.q.skipped.map((x) => `<li><span class="st st-${esc(x.status)}">${esc(STATUS_LABEL[x.status] ?? x.status)}</span> ${esc(x.sport)} · ${esc(x.opportunity)} — <span class="muted">${esc(x.reason)}</span></li>`).join("")}</ul></details>` : ""}`;
  }

  function renderDecisions(s) {
    const items = s.decisions.slice().reverse();
    const open = items.filter(isOpen).length;
    if (!items.length) return `<h2>Decisions <span class="count">0</span></h2><div class="muted">Nothing needs you yet.</div>`;
    return `<h2>Decisions <span class="count">${open} open</span></h2>` + items.map((d) => {
      if (d.kind === "gate") return gateCard(d);
      if (d.kind === "proposal") return proposalCard(d);
      const chosen = ui.choice[d.decisionId] ?? d.resolution?.captionId ?? d.recommended;
      const decided = d.resolution;
      for (const k of [...captionTextMap.keys()]) { if (k.startsWith(`${d.decisionId}:`)) captionTextMap.delete(k); }
      return `<div class="decision">
        <div class="q">${esc(d.question)}</div>
        <img src="/media/${encodeURIComponent(d.media.file)}" alt="${esc(d.media.altText)}" data-zoom>
        ${d.options.map((o) => { captionTextMap.set(`${d.decisionId}:${o.captionId}`, o.text); const cpCount = xLen(o.text); const over = cpCount > 280; return `<label class="option ${chosen === o.captionId ? "selected" : ""}">
          <input type="radio" name="opt-${esc(d.decisionId)}" value="${esc(o.captionId)}" ${chosen === o.captionId ? "checked" : ""} ${decided ? "disabled" : ""} data-choose="${esc(d.decisionId)}">
          <div><div class="txt xpost">${esc(o.text)}</div>
          <div class="meta">${decided?.captionId === o.captionId && decided.verdict === "approve" ? `<b class="check-ok">APPROVED</b> · ` : ""}Caption ${esc(o.captionId)} · ${esc(o.tone)}${d.recommended === o.captionId ? " · recommended" : ""} · ${o.check?.ok ? "validator ✓" : "validator ✗"} · digest ${esc(o.digest.slice(0, 12))}…</div>
          <span class="caption-counter${over ? " over" : ""}" aria-label="${cpCount} of 280 characters">${cpCount}/280</span>
          <button type="button" class="btn small" data-copy-caption="${esc(d.decisionId)}:${esc(o.captionId)}" aria-label="Copy caption ${esc(o.captionId)}">Copy caption</button></div>
        </label>`; }).join("")}
        ${(d.warnings ?? []).length ? `<ul class="warns">${d.warnings.map((w) => `<li>${esc(w.code)}: ${esc(w.detail)}</li>`).join("")}</ul>` : ""}
        <div class="muted">${esc(d.note)}</div>
        ${d.receipt ? `<div class="receipt">✓ ${esc(d.receipt.state)} via ${esc(d.receipt.provider)} · ${esc(d.receipt.providerPostId)}<br>caption ${esc(d.resolution?.captionId)} · approved ${esc(time(d.resolution?.approvedAt))} · cost $${num(d.receipt.costUsd)}<br>digest ${esc(d.receipt.bundleDigest.slice(0, 16))}…</div>`
          : d.resolution?.verdict === "reject" ? `<div class="blocked">Rejected by you.</div>`
          : `${d.blocked ? `<div class="blocked">Approved, not sent: ${esc(d.blocked.code)} — ${esc(d.blocked.detail)}</div>` : ""}
             <div class="row actions" style="margin-top:8px">
               <button class="btn primary" data-approve="${esc(d.decisionId)}">${decided ? "Retry publish (mock)" : "Approve & publish (mock)"}</button>
               ${decided ? "" : `<button class="btn" data-reject="${esc(d.decisionId)}">Reject</button>`}
             </div>`}
      </div>`;
    }).join(`<hr style="border:0;border-top:1px solid var(--border);margin:12px 0">`);
  }

  function renderClaude(s) {
    const e = s.engineering ?? {};
    const pf = e.lastPreflight;
    const b = e.billing;
    return `<div class="claude-box">
      <div class="switch"><div><b>Claude Code</b><div class="muted">Engineering runs on your Claude subscription through the local CLI.</div></div>
        <button class="btn danger small" data-stop ${e.activeRuns?.length ? "" : "disabled"}>Stop now</button></div>
      <div class="kv">
        <span>Billing check</span><span>${b ? `<span class="check-ok">${esc(b.statement)}</span>` : `<span class="check-bad">Not confirmed — Claude Code is locked</span>`}</span>
        <span>Preflight</span><span>${pf ? (pf.ok ? `<span class="check-ok">OK</span> · CLI ${esc(pf.evidence?.cliVersion)} · ${esc(pf.evidence?.authMethod)} · ${esc(pf.evidence?.subscriptionType)} · no API key · ${esc(time(pf.at))}` : `<span class="check-bad">REFUSED</span> · ${esc(pf.detail)}`) : "not run yet"}</span>
        <span>Running now</span><span>${e.activeRuns?.length ? e.activeRuns.map((r) => `pid ${num(r.pid)}`).join(", ") : "none"}</span>
        <span>Usage so far</span><span>${num(e.claudeUsage?.runs ?? 0)} run(s) · ${Math.round((e.claudeUsage?.durationMs ?? 0) / 1000)} s · est. $${num(e.claudeUsage?.estUsageUsd ?? 0).toFixed(2)} of your allowance · cash $0</span>
        <span>Limits</span><span>plan ${esc(e.limits?.plan)} · build ${esc(e.limits?.build)} · ${esc(e.limits?.perCommand)} per command</span>
      </div>
      ${b ? "" : `<div class="attest">
        <div class="muted">Open claude.ai → Settings → Usage. Confirm usage credits (extra usage) are off, or capped. Then record it here:</div>
        <div class="row" style="margin-top:6px"><button class="btn small primary" data-attest="off">Usage credits are OFF</button>
          <input id="cap-usd" type="number" min="0" step="1" placeholder="$ cap" aria-label="Monthly cap in dollars" style="width:90px">
          <button class="btn small" data-attest="capped">Capped at this amount</button></div></div>`}
      ${Auth.hosted ? `<div class="muted" style="margin-top:8px">Preflight runs on the worker before every Claude Code run.</div>` : `<div class="row" style="margin-top:8px"><button class="btn small" data-preflight>Run preflight now</button></div>`}
    </div>`;
  }

  function renderControls(s) {
    const pct = s.budget.limitUsd > 0 ? Math.min(100, (100 * s.budget.spentUsd) / s.budget.limitUsd) : 0;
    return `<h2>Controls</h2>
      <div class="switch"><div><b>Publishing</b><div class="muted">${s.paused ? "Paused: every send is refused at the boundary." : "Enabled — mock publisher only."}</div></div>
        <button class="btn ${s.paused ? "primary" : "danger"} small" data-pause="${s.paused ? "0" : "1"}">${s.paused ? "Resume" : "Pause all"}</button></div>
      <div class="kv"><span>Budget</span><span>$${num(s.budget.spentUsd)} of $${num(s.budget.limitUsd)}${s.budget.limitUsd === 0 ? " · paid seats locked" : ""}</span>
        <span>Publisher</span><span>${esc(s.publisher.name)} · network ${s.publisher.network ? "yes" : "none"}</span>
        <span>Mode</span><span>${esc(s.phase)}</span></div>
      <div class="meter"><i style="width:${pct}%"></i></div>
      <div class="row" style="margin-top:10px">${Auth.hosted
        ? `<button class="btn small" data-logout>Sign out</button><button class="btn small" data-logout-all>Sign out everywhere</button><button class="btn small" data-add-passkey>Add a backup passkey</button>`
        : `<button class="btn small" data-reset>Reset demo</button>`}</div>
      ${renderClaude(s)}`;
  }

  const STATUS_CLASS = { CONNECTED: "check-ok", AVAILABLE: "check-ok", CONFIGURED: "warn", ERROR: "check-bad", BLOCKED: "muted", "NOT CONFIGURED": "muted", "NOT USED": "muted" };
  function renderProviders(s) {
    return `<h2>Providers</h2>${(s.providers ?? []).map((p) => `<div class="provider">
      <div class="provider-head"><b>${esc(p.name)}</b><span class="muted">${esc(p.roles.join(" · "))}</span></div>
      ${p.integrations.map((i) => `<div class="integration">
        <div class="row"><span class="${STATUS_CLASS[i.status] ?? ""}"><b>${esc(i.status)}</b></span> <span>${esc(i.label)}</span> ${execTag(i.execution)}${i.whenConnected && i.whenConnected !== i.execution ? `<span class="muted">when connected: ${esc(i.whenConnected)}</span>` : ""}</div>
        <div class="kv"><span>Runs</span><span>${esc(i.mode)}</span><span>Billing</span><span>${esc(i.billing)}</span><span>Limits</span><span>${esc(i.limits)}</span>
          ${i.lastTest ? `<span>Last test</span><span>${i.lastTest.ok ? "OK" : "FAILED"} · ${esc(time(i.lastTest.at))} · ${esc(i.lastTest.detail)}</span>` : ""}
          ${i.error ? `<span>Needs attention</span><span class="check-bad">${esc(i.error)}</span>` : ""}
          ${i.founderAction ? `<span>Your action</span><span>${esc(i.founderAction)}</span>` : ""}</div>
        ${i.id.startsWith("api:") && i.id !== "api:anthropic" && i.status !== "NOT CONFIGURED" ? `<button class="btn small" data-provider-test="${esc(i.id)}">Test connection (free)</button>` : ""}
      </div>`).join("")}
    </div>`).join("")}`;
  }

  function renderTeam(s) {
    const rows = Object.entries(s.seats).map(([role, r]) => {
      if (r.seat === "deterministic") return `<div class="team-row"><span>${esc(r.title)}</span><span class="tag det">deterministic</span></div>`;
      const opts = [...r.options.map((o) => `<option value="${esc(o)}" ${o === r.seat ? "selected" : ""}>${esc(o)}</option>`),
        ...Object.entries(STUB_SEATS).filter(([o]) => !r.options.includes(o)).map(([o, cp]) => `<option value="${esc(o)}" disabled>${esc(o)} · ${esc(cp)}</option>`)].join("");
      return `<div class="team-row"><span>${esc(r.title)}</span><select data-seat="${esc(role)}" aria-label="Seat for ${esc(r.title)}">${opts}</select></div>`;
    }).join("");
    return `${renderProviders(s)}<h2>Team seats</h2>${rows}<div class="muted" style="margin-top:6px">manual:* = you paste the prompt into your own ChatGPT/Claude/Grok. api:* seats can be chosen once that provider is connected above, with a monthly cap.</div>`;
  }

  function renderTasks(s) {
    const c = s.commands.at(-1);
    if (!c) return `<h2>Tasks</h2><div class="muted">No command yet.</div>`;
    return `<h2>Tasks <span class="count">${c.tasks.length}</span></h2>` + c.tasks.map((t) =>
      `<div class="task"><span class="status ${esc(t.status)}">${esc(t.status)}</span><span>${esc(title(t.ownerRole))} <span class="muted">hop ${num(t.hop)}</span></span><span class="muted">${esc(t.seat)}</span></div>`).join("");
  }

  function renderHistory(s) {
    return `<h2>Action history <span class="count">${s.history.length}</span></h2><div class="hist">${s.history.slice().reverse().map((h) =>
      `<div><span class="t">${time(h.at)}</span>${esc(h.line)}</div>`).join("")}</div>`;
  }

  function renderBadges(s) {
    return [
      `<span class="badge ok">dry run</span>`,
      `<span class="badge ${s.budget.limitUsd === 0 ? "ok" : "warn"}">budget $${num(s.budget.limitUsd)}</span>`,
      `<span class="badge ok">publisher: ${esc(s.publisher.name)}</span>`,
      s.paused ? `<span class="badge danger">publishing paused</span>` : `<span class="badge">publishing enabled (mock)</span>`,
      `<span class="badge warn">demo-grade approvals</span>`,
    ].join("");
  }

  function renderTabbar(s) {
    const open = s.decisions.filter(isOpen).length;
    const c = s.commands.at(-1);
    const active = c ? c.tasks.filter((t) => ["QUEUED", "RUNNING", "AWAITING_INPUT"].includes(t.status)).length : 0;
    const dots = { decisions: open, tasks: active, queue: (s.posts ?? []).filter((p) => p.lifecycle === "drafted").length };
    return VIEWS.map((v) => `<button type="button" class="tab" data-tab="${v.id}" ${ui.view === v.id ? 'aria-current="page"' : ""}>
      <span class="ico" aria-hidden="true">${v.ico}</span>${esc(v.label)}${dots[v.id] ? `<span class="dot" aria-label="${dots[v.id]} pending">${dots[v.id]}</span>` : ""}</button>`).join("");
  }

  function setView(view) {
    ui.view = view;
    document.body.dataset.view = view;
    try { localStorage.setItem("gtp-cc-view", view); } catch { /* private mode: view resets on reload */ }
    if (ui.state) $("tabbar").innerHTML = renderTabbar(ui.state);
  }

  function render(s) {
    const thread = $("thread");
    const pauseTop = $("pause-top");
    pauseTop.dataset.pause = s.paused ? "0" : "1";
    pauseTop.textContent = s.paused ? "Paused · Resume" : "Pause all";
    pauseTop.className = `btn small pause-top mobile-only ${s.paused ? "paused" : "live"}`;
    pauseTop.setAttribute("aria-pressed", String(s.paused));
    $("tabbar").innerHTML = renderTabbar(s);
    const stopTop = $("stop-top");
    stopTop.hidden = !(s.engineering?.activeRuns?.length);
    const atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    $("badges").innerHTML = renderBadges(s);
    thread.innerHTML = renderThread(s);
    $("queue").innerHTML = renderQueue(s);
    $("decisions").innerHTML = renderDecisions(s);
    $("controls").innerHTML = renderControls(s);
    $("team").innerHTML = renderTeam(s);
    $("tasks").innerHTML = renderTasks(s);
    $("history").innerHTML = renderHistory(s);
    if (atBottom) thread.scrollTop = thread.scrollHeight;
  }

  /**
   * Local: poll every 0.7 s. Hosted: every 3 s while the page is visible and something is moving, easing to 15 s
   * when nothing has changed for a minute, and not at all while hidden — every poll wakes the database.
   */
  const poller = { timer: null, quietSince: Date.now(), running: false };
  function nextDelay() {
    if (!Auth.hosted) return 700;
    return Date.now() - poller.quietSince > 60_000 ? 15_000 : 3000;
  }
  async function poll() {
    poller.timer = null;
    if (!poller.running || (Auth.hosted && document.hidden)) return;
    try {
      const res = await fetch("/api/state", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) return showAuth("Sign in with your passkey.");
      const text = await res.text();
      if (text !== ui.last) {
        ui.last = text;
        ui.state = JSON.parse(text);
        poller.quietSince = Date.now();
        render(ui.state);
      }
    } catch { /* server restarting; try again */ }
    poller.timer = setTimeout(poll, nextDelay());
  }
  function startPolling() {
    poller.running = true;
    poller.quietSince = Date.now();
    if (!poller.timer) poll();
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && poller.running && !poller.timer) { poller.quietSince = Date.now(); poll(); }
  });
  /** Any action the founder takes makes the next minute "busy" again. */
  document.addEventListener("click", () => { poller.quietSince = Date.now(); if (poller.running && poller.timer && Auth.hosted) { clearTimeout(poller.timer); poller.timer = setTimeout(poll, 600); } }, true);

  // ── hosted sign-in ──
  function showAuth(msg, mode) {
    poller.running = false;
    document.body.classList.add("signed-out");
    $("auth").hidden = false;
    $("auth-msg").textContent = msg ?? "";
    const m = mode ?? (ui.authStatus?.hasPasskey ? "login" : "setup");
    $("auth-login").hidden = m !== "login";
    $("auth-setup").hidden = m !== "setup";
    $("auth-new-passkey").hidden = m !== "recovered";
    $("auth-recover").hidden = m !== "login";
    $("auth-codes").hidden = m !== "codes";
  }
  function signedIn() {
    document.body.classList.remove("signed-out");
    $("auth").hidden = true;
    startPolling();
  }
  async function authAction(t) {
    t.disabled = true;
    try {
      if (t.dataset.login !== undefined) { await Auth.login(); return signedIn(); }
      if (t.dataset.register !== undefined) {
        const r = await Auth.register({ setupToken: $("setup-token").value.trim(), label: $("passkey-label").value.trim() || "passkey" });
        ui.authStatus = { hasPasskey: true };
        if (r.recoveryCodes) { $("recovery-codes").textContent = r.recoveryCodes.join("\n"); return showAuth("Passkey created.", "codes"); }
        return signedIn();
      }
      if (t.dataset.registerRecovery !== undefined) { await Auth.register({ label: $("new-passkey-label").value.trim() || "passkey" }); return signedIn(); }
      if (t.dataset.recover !== undefined) {
        const r = await Auth.recover($("recovery-code").value.trim());
        return showAuth(`Recovery code accepted (${r.remaining ?? "?"} left). Every other session was signed out. Create a replacement passkey now.`, "recovered");
      }
      if (t.dataset.codesSaved !== undefined) { $("recovery-codes").textContent = ""; return signedIn(); }
    } catch (err) {
      $("auth-msg").textContent = { SETUP_TOKEN_REQUIRED: "That setup token is not right.", RECOVERY_CODE_INVALID: "That recovery code is not valid.", RATE_LIMITED: "Too many attempts. Wait a few minutes.", NotAllowedError: "The passkey prompt was cancelled." }[err.code ?? err.name] ?? `Could not complete that (${err.code ?? err.name ?? "error"}).`;
    } finally {
      t.disabled = false;
    }
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-login],[data-register],[data-register-recovery],[data-recover],[data-codes-saved]");
    if (t) authAction(t);
  });

  // ── events ──
  $("chips").innerHTML = SUGGESTIONS.map((s, i) => `<button type="button" class="chip" data-chip="${i}">${esc(s.length > 60 ? s.slice(0, 58) + "…" : s)}</button>`).join("");
  $("composer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("input").value.trim();
    if (!text) return;
    $("input").value = "";
    await post("/api/command", { text });
  });
  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("composer").requestSubmit(); }
  });

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-chip],[data-approve],[data-reject],[data-pause],[data-reset],[data-logout],[data-logout-all],[data-add-passkey],[data-copy],[data-copy-caption],[data-submit],[data-zoom],[data-tab],[data-goto],[data-gate],[data-attest],[data-preflight],[data-stop],[data-provider-test],[data-post-approve],[data-post-verdict],[data-post-record],[data-design],.lightbox");
    if (!t) return;
    if (t.dataset.gate) {
      const d = ui.state.decisions.find((x) => x.decisionId === t.dataset.gate);
      let note;
      if (t.dataset.verdict === "revise") {
        note = prompt("What should change?");
        if (!note) return;
      }
      t.disabled = true;
      const r = await post("/api/decide", { decisionId: d.decisionId, verdict: t.dataset.verdict, digest: d.subjectDigest, ...(note ? { note } : {}) });
      if (r.ok && r.next) alert(r.next);
      if (!r.ok && !r.duplicate) alert(`${r.code}: ${r.detail ?? ""}`);
      return;
    }
    if (t.dataset.postApprove) {
      const p = ui.state.posts.find((x) => x.decisionId === t.dataset.postApprove);
      const captionId = ui.choice[p.decisionId] ?? p.options.find((o) => o.check?.ok)?.captionId;
      const opt = p.options.find((o) => o.captionId === captionId);
      if (!opt) return alert("Choose a caption that passes its check.");
      t.disabled = true;
      const r = await post("/api/decide", { decisionId: p.decisionId, verdict: "approve", captionId, digest: opt.digest,
        ...(p.package.kind === "x-reply" ? { sourcesConfirmed: Boolean(ui.drafts[`confirm:${p.decisionId}`]) } : {}),
        ...(p.package.kind === "td-top3" ? { availabilityConfirmed: Boolean(ui.drafts[`avail:${p.decisionId}`]) } : {}) });
      if (r.ok && r.next) alert(r.next);
      if (!r.ok && !r.duplicate) { t.disabled = false; alert(`${r.code}: ${r.detail ?? ""}`); }
      return;
    }
    if (t.dataset.design) {
      const dz = ui.state.design;
      if (!confirm(`Approve the graphic design ${dz.template} (${dz.assetManifest})? This approves the visual design only — no post.`)) return;
      const r = await post("/api/design", { template: dz.template, assetManifest: dz.assetManifest });
      if (!r.ok && !r.duplicate) alert(`${r.code}: ${r.detail ?? ""}`);
      return;
    }
    if (t.dataset.postVerdict) {
      let note;
      if (t.dataset.postVerdict === "revise") { note = prompt("What should change?"); if (!note) return; }
      const r = await post("/api/decide", { decisionId: t.dataset.post, verdict: t.dataset.postVerdict, ...(note ? { note } : {}) });
      if (!r.ok && !r.duplicate) alert(`${r.code}: ${r.detail ?? ""}`);
      return;
    }
    if (t.dataset.postRecord) {
      const id = t.dataset.post;
      const action = t.dataset.postRecord;
      const body = { decisionId: id, action };
      if (action === "publish") body.url = ui.drafts[`xurl:${id}`] ?? "";
      if (action === "schedule") { const v = ui.drafts[`sched:${id}`]; if (!v) return alert("Pick the time you scheduled it for."); body.scheduledFor = new Date(v).toISOString(); }
      if (action === "engagement") body.metrics = Object.fromEntries(["impressions", "likes", "reposts", "replies", "bookmarks"].map((k) => [k, ui.drafts[`m:${id}:${k}`] ?? ""]));
      t.disabled = true;
      const r = await post("/api/post", body);
      if (action === "verify") { t.disabled = false; alert(r.ok ? "Current: matches the latest published version and passed its freshness checks. Post now." : `Do not post: ${r.detail ?? r.code}`); return; }
      if (!r.ok && !r.duplicate) { t.disabled = false; alert(`${r.code}: ${r.detail ?? ""}`); }
      else if (r.receipt?.warnings?.length) alert(`Recorded, with warnings:\n${r.receipt.warnings.join("\n")}`);
      return;
    }
    if (t.dataset.providerTest) {
      t.disabled = true;
      const r = await post("/api/provider-test", { integration: t.dataset.providerTest });
      alert(r.ok ? `Connected: ${r.detail}` : `Not connected: ${r.detail ?? r.code}`);
      return;
    }
    if (t.dataset.attest) {
      const capUsd = $("cap-usd")?.value;
      if (t.dataset.attest === "capped" && !(Number(capUsd) >= 0 && capUsd !== "")) return alert("Enter the cap in dollars first.");
      const r = await post("/api/attest", { usageCredits: t.dataset.attest, capUsd });
      if (!r.ok) alert(`${r.code}: ${r.detail ?? ""}`);
      return;
    }
    if (t.dataset.preflight !== undefined) return post("/api/preflight");
    if (t.dataset.stop !== undefined) return post("/api/stop");
    if (t.dataset.tab) return setView(t.dataset.tab);
    if (t.dataset.goto) return setView(t.dataset.goto);
    if (t.classList.contains("lightbox")) return t.remove();
    if (t.dataset.zoom !== undefined) {
      const box = document.createElement("div");
      box.className = "lightbox";
      const img = document.createElement("img");
      img.src = t.getAttribute("src");
      img.alt = t.getAttribute("alt") ?? "";
      box.appendChild(img);
      return document.body.appendChild(box);
    }
    if (t.dataset.chip !== undefined) { $("input").value = SUGGESTIONS[Number(t.dataset.chip)]; return $("input").focus(); }
    if (t.dataset.approve) {
      const d = ui.state.decisions.find((x) => x.decisionId === t.dataset.approve);
      const captionId = d.resolution?.captionId ?? ui.choice[d.decisionId] ?? d.recommended;
      const opt = d.options.find((o) => o.captionId === captionId);
      t.disabled = true;
      return post("/api/decide", { decisionId: d.decisionId, verdict: "approve", captionId, digest: opt.digest });
    }
    if (t.dataset.reject) return post("/api/decide", { decisionId: t.dataset.reject, verdict: "reject" });
    if (t.dataset.pause !== undefined) return post("/api/pause", { paused: t.dataset.pause === "1" });
    if (t.dataset.reset !== undefined) { ui.drafts = {}; ui.choice = {}; return post("/api/reset"); }
    if (t.dataset.logout !== undefined) { await Auth.logout(); ui.last = ""; return showAuth("Signed out.", "login"); }
    if (t.dataset.logoutAll !== undefined) {
      if (!confirm("Sign out on every device, including this one?")) return;
      await Auth.logoutAll(); ui.last = ""; return showAuth("Signed out everywhere.", "login");
    }
    if (t.dataset.addPasskey !== undefined) {
      const label = prompt("Name the backup passkey (e.g. Mac):", "Mac");
      if (!label) return;
      try { await Auth.addPasskey(label.slice(0, 60)); alert("Backup passkey added. Other sessions were signed out."); } catch (err) { alert(`Could not add it (${err.code ?? err.name}).`); }
      return;
    }
    if (t.dataset.copy) {
      const text = document.getElementById(`prompt-${t.dataset.copy}`)?.textContent ?? "";
      try { await navigator.clipboard.writeText(text); t.textContent = "Copied"; } catch { t.textContent = "Select and copy the prompt above"; }
      return;
    }
    if (t.dataset.copyCaption !== undefined) {
      const text = captionTextMap.get(t.dataset.copyCaption);
      if (text === undefined) return;
      const orig = t.textContent;
      try {
        if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(text);
        t.textContent = "Copied!";
      } catch {
        t.textContent = "Copy failed";
      }
      setTimeout(() => { if (t.isConnected) t.textContent = orig; }, 2000);
      return;
    }
    if (t.dataset.submit) {
      const text = ui.drafts[t.dataset.submit] ?? "";
      if (!text.trim()) return;
      t.disabled = true;
      return post("/api/manual", { taskId: t.dataset.submit, text });
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.dataset.draft) ui.drafts[e.target.dataset.draft] = e.target.value;
  });
  document.addEventListener("change", (e) => {
    if (e.target.dataset.confirm) ui.drafts[`confirm:${e.target.dataset.confirm}`] = e.target.checked;
    if (e.target.dataset.avail) ui.drafts[`avail:${e.target.dataset.avail}`] = e.target.checked;
  });
  document.addEventListener("change", (e) => {
    if (e.target.dataset.choose) {
      ui.choice[e.target.dataset.choose] = e.target.value;
      render(ui.state);
    }
    if (e.target.dataset.seat) post("/api/seat", { role: e.target.dataset.seat, seat: e.target.value });
  });

  setView(ui.view);
  (async () => {
    let st = { hosted: false };
    try { st = await Auth.status(); } catch { /* local console */ }
    ui.authStatus = st;
    if (!st.hosted) return startPolling();
    document.body.classList.add("hosted");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (st.authenticated) return signedIn();
    if (st.recovery) return showAuth("Recovery session: create a replacement passkey.", "recovered");
    showAuth(st.hasPasskey ? "Sign in with your passkey." : "First setup: enter the one-time setup token, then create your passkey.");
  })();
})();
