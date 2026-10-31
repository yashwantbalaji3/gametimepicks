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

  /** One section at a time: a sidebar on wide screens; on phones and tablets a bottom bar (daily four + More). */
  const VIEWS = [
    { id: "overview", label: "Overview", ico: "◉", bar: true },
    { id: "queue", label: "Review", ico: "✓", bar: true },
    { id: "publishing", label: "Publishing", ico: "↗", bar: true },
    { id: "reports", label: "Reports", ico: "▥", bar: true },
    { id: "calendar", label: "Calendar", ico: "▦" },
    { id: "team", label: "AI Team", ico: "◆" },
    { id: "ops", label: "Operations", ico: "⚙" },
  ];
  /** Old section names (links in earlier reports, saved views) land on their new home. */
  const VIEW_ALIAS = { chat: "team", decisions: "team", tasks: "team", history: "ops", approvals: "queue" };
  const viewId = (v) => (VIEWS.some((x) => x.id === v) ? v : VIEW_ALIAS[v] ?? "overview");
  const savedView = (() => { try { return localStorage.getItem("gtp-cc-view"); } catch { return null; } })();
  const ui = { last: "", choice: {}, drafts: {}, editing: {}, pendingRender: false, state: null, view: viewId(savedView),
    filter: { status: "auto", sport: "all", source: "all", group: "tonight" }, expanded: null, calMode: "week", calDay: null, pubTab: "all" };
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
      ${r.decisionsNeeded?.length ? `<button type="button" class="btn primary small goto" data-goto="decisions">Review the decisions</button>` : ""}
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
  const LIFE_LABEL = { invalidated: "Approval invalidated · content changed", drafted: "Needs your decision", approved: "Approved", scheduled: "Scheduled", published: "Published", rejected: "Rejected", revise: "Revision requested", deferred: "Deferred", superseded: "Superseded" };
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
    const chosen = ui.choice[p.decisionId] ?? decided?.captionId ?? (p.options.filter((o) => o.source === "caption-edit" && o.check?.ok).at(-1) ?? p.options.find((o) => o.check?.ok))?.captionId;
    return p.options.map((o) => {
      captionTextMap.set(`${p.decisionId}:${o.captionId}`, o.text);
      const n = xLen(o.text);
      const approvedThis = decided?.verdict === "approve" && decided.captionId === o.captionId;
      if (decided && decided.verdict === "approve" && !approvedThis) return "";
      return `<label class="option ${chosen === o.captionId ? "selected" : ""}">
        <input type="radio" name="opt-${esc(p.decisionId)}" value="${esc(o.captionId)}" ${chosen === o.captionId ? "checked" : ""} ${decided || !o.check?.ok ? "disabled" : ""} data-choose="${esc(p.decisionId)}">
        <div><div class="txt xpost">${esc(o.text)}</div>
        <div class="meta">${approvedThis ? `<b class="check-ok">APPROVED</b> · ` : ""}Caption ${esc(o.captionId)} · ${esc(o.tone)}${o.source === "chatgpt-calendar-draft" ? " · ChatGPT's wording" : o.source === "caption-edit" ? " · edited wording, checked like the rest" : " · template from the evidence"} · ${o.check?.ok ? `<span class="check-ok">check ✓</span>` : `<span class="check-bad">check ✗ ${esc((o.check?.problems ?? []).map((x) => `${x.code} ${x.detail}`).join("; "))}</span>`}</div>
        <span class="caption-counter${n > 280 ? " over" : ""}" title="X-weighted length (emoji count 2)">${num(n)}/280 on X</span>
        <button type="button" class="btn small" data-copy-caption="${esc(p.decisionId)}:${esc(o.captionId)}">Copy caption</button>
        ${editable(p) ? `<button type="button" class="btn small" data-caption-open="${esc(p.decisionId)}" data-based-on="${esc(o.captionId)}" aria-label="Edit caption ${esc(o.captionId)}">Edit</button>` : ""}</div>
      </label>`;
    }).join("") + captionEditor(p);
  }
  const editable = (p) => p.lifecycle === "drafted";
  /** The edit box: a new caption option is saved (and checked) on the server; nothing is approved by saving. */
  function captionEditor(p) {
    const ed = ui.editing[p.decisionId];
    if (!ed || !editable(p)) return "";
    const key = `edit:${p.decisionId}`;
    const n = xLen(ui.drafts[key] ?? "");
    return `<div class="caption-editor">
      <label class="muted" for="ce-${esc(p.decisionId)}">Edit caption ${esc(ed.basedOn)} — saved as a new caption; approve it separately</label>
      <textarea id="ce-${esc(p.decisionId)}" data-draft="${esc(key)}" data-caption-edit="${esc(p.decisionId)}" rows="6" maxlength="1000">${esc(ui.drafts[key] ?? "")}</textarea>
      <div class="row"><span class="caption-counter${n > 280 ? " over" : ""}" data-caption-count="${esc(p.decisionId)}">${num(n)}/280 on X</span></div>
      <div class="row actions"><button type="button" class="btn primary" data-caption-save="${esc(p.decisionId)}">Save as new caption</button>
        <button type="button" class="btn" data-caption-cancel="${esc(p.decisionId)}">Cancel</button></div>
    </div>`;
  }
  /** Imported: the approved calendar's time, else the proposed one, else the package's recommendation; the founder can type any time. */
  function importSchedule(s, p, id) {
    const plan = s.contentPlan ?? {};
    const at = (plan.approved?.items ?? []).find((i) => i.decisionId === p.decisionId && Date.parse(i.at) > Date.now())?.at ?? (plan.items ?? []).find((i) => i.decisionId === p.decisionId)?.at ?? p.package.suggestedPublishAt;
    const label = at ? `${dayLabel(etDay(new Date(at))).split(" · ")[0]} ${etTime(at)}` : "";
    return `<button class="btn small primary" data-pub="schedule" data-post="${id}" ${at ? `data-at="${esc(at)}"` : "disabled"}>${at ? `Schedule for ${esc(label)}` : "No suggested time"}</button>
      <input class="sched" type="datetime-local" aria-label="Pick another time" data-draft="pubat:${id}" value="${draftVal(`pubat:${p.decisionId}`)}"><button class="btn small" data-pub="schedule" data-post="${id}" data-at-from="pubat:${id}">Schedule at this time</button>`;
  }
  // ── founder revisions: the existing Revise decision, with structure in its note (contracts/revision-requests.mjs) ──
  const versionsOf = (s, p) => (s.posts ?? []).filter((q) => q.package?.imported?.dedupeId === p.package.imported?.dedupeId);
  const latestVersion = (s, p) => versionsOf(s, p).at(-1);
  function revParse(note) {
    const m = String(note ?? "").match(/^\[revision scope=(\S+) type=(\S+) image=(\S+)\]\s*([\s\S]*)$/);
    return m ? { scope: m[1], type: m[2], image: m[3], text: m[4] } : { scope: "image", type: "visual", image: "all", text: String(note ?? "") };
  }
  const REV_TYPES = [["visual", "Visual: layout, type, colors, logo"], ["caption", "Caption wording"], ["line", "Sportsbook line presentation"], ["data", "Data: a number looks wrong"]];
  function revisionForm(p) {
    const id = esc(p.decisionId), n = imagesOf(p.package).length;
    const pick = (k, d) => ui.drafts[`${k}:${p.decisionId}`] ?? d;
    return `<div class="section">Request changes</div>
      <div class="field"><label for="rev-${id}">What should change? Plain English is fine.</label><textarea id="rev-${id}" rows="4" maxlength="900" data-draft="revt:${id}">${draftVal(`revt:${p.decisionId}`)}</textarea></div>
      <div class="row actions">
        <select aria-label="Applies to" data-draft="revs:${id}"><option value="image" ${pick("revs", "image") === "image" ? "selected" : ""}>This graphic only</option><option value="template" ${pick("revs", "image") === "template" ? "selected" : ""}>The shared template</option></select>
        <select aria-label="Kind of change" data-draft="revk:${id}">${REV_TYPES.map(([k, l]) => `<option value="${k}" ${pick("revk", "visual") === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
        ${n > 1 ? `<select aria-label="Which image" data-draft="revi:${id}"><option value="all">All ${num(n)} images</option>${imagesOf(p.package).map((_, i) => `<option value="${i + 1}" ${String(pick("revi", "all")) === String(i + 1) ? "selected" : ""}>Image ${i + 1}</option>`).join("")}</select>` : ""}
        <button class="btn" data-rev-submit="${id}">Send revision request</button>
      </div>`;
  }
  /** Feedback history and, once a revised draft has arrived, the old and new images side by side. */
  function revisionPanel(s, p) {
    if (!p.package.imported) return "";
    const all = versionsOf(s, p);
    const asks = all.filter((q) => q.resolution?.verdict === "revise");
    if (!asks.length) return "";
    const latest = all.at(-1);
    const state = (q) => (q !== latest ? "Completed" : s.revisionStatus?.[p.package.imported.dedupeId]?.status === "IN_PROGRESS" ? "In progress at Launch Readiness" : "Pending: waiting for Launch Readiness");
    const before = asks.at(-1).package, after = p.package;
    const compare = latest !== asks.at(-1) && p === latest ? `<div class="section">Before and after</div><div class="gallery" data-gallery="cmp-${esc(p.decisionId)}">
      ${[[before, "Before"], [after, "After"]].flatMap(([k, l]) => imagesOf(k).map((m, i) => `<figure><img src="/media/${encodeURIComponent(m.file)}" alt="${esc(l)}" data-zoom data-index="${i}" loading="lazy"><figcaption>${esc(l)}${imagesOf(k).length > 1 ? ` · image ${i + 1}` : ""}</figcaption></figure>`)).join("")}</div>` : "";
    return `<div class="section">Your revision requests</div><ul class="rows">${asks.map((q) => { const n = revParse(q.resolution.note); return `<li><span class="grow"><b>${esc(state(q))}</b> · ${esc(n.scope === "template" ? "shared template" : "this graphic")}, ${esc(n.type)}${n.image !== "all" ? `, image ${esc(n.image)}` : ""}<br>${esc(n.text)}</span><span class="t">${esc(time(q.resolution.approvedAt))}</span></li>`; }).join("")}</ul>${compare}`;
  }
  const TRULY_UNSUPPORTED = new Set(["lr-live-update", "lr-unsupported"]);
  /**
   * The reasons that hold a post TODAY. Blockers are stored when a package is imported, so this reads the code, not the
   * stored wording: an authorization given since then doesn't keep showing. A real-line version uses the same projections
   * as its model-only version, so that version's data hold applies to it too.
   */
  function currentBlockers(s, p) {
    const pkg = p.package, m = pkg.imported ?? {};
    const listOf = (a) => (a ?? []).map((x) => x.detail ?? `${x.playerId} ${x.market}: ${x.verdict}`);
    const out = [];
    for (const b of pkg.blockers ?? []) {
      if (b.code === "NBA_BOARDS_NOT_AUTHORIZED_FOR_SOCIAL") continue; // founder 2026-10-30: the category is authorized
      if (b.code === "LINE_RIGHTS_NOT_VERIFIED" && s.marketRights?.active) continue; // cleared by the founder's recorded authorization
      if (b.code === "LINE_RIGHTS_NOT_VERIFIED") out.push({ title: "Provider rights", detail: "Shows real sportsbook data. The provider's terms allow websites and apps and don't address social media, so this needs their written answer. Private review only." });
      else if (b.code === "PROJECTION_ANOMALY_REVIEW") out.push({ title: "Data correction required", detail: `${pkg.sport === "NBA" ? "Held for the NBA v0.1 minutes defect" : "Held by Launch Readiness's projection check"}. Publishing stays held, but you can review, caption and revise the design. Flagged here:`, items: listOf(m.anomalies) });
      else out.push({ title: b.code.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()), detail: b.detail });
    }
    if (isMarket(p) && !out.some((b) => b.title === "Data correction required")) {
      const board = String(m.variant ?? "");
      const twin = (s.posts ?? []).find((q) => q.package?.imported && q.lifecycle !== "superseded" && q.package.imported.anomalyCheck === "REVIEW" && (pkg.kind === "lr-nba-boxscore" ? q.package.kind === "lr-nba-players" && String(q.package.eventId) === String(pkg.eventId) : q.package.kind === pkg.kind && q.package.imported.variant === `${board}-model`));
      if (twin) out.push({ title: "Data correction required", detail: "Held for the NBA v0.1 minutes defect: it uses the same projections as the model-only version. Publishing stays held, but you can review, caption and revise the design. Flagged here:", items: listOf(twin.package.imported.anomalies) });
    }
    return out;
  }
  /** What an imported post needs the founder to see before deciding. */
  function importPanel(s, p) {
    const pkg = p.package, m = pkg.imported;
    if (!m) return "";
    const v = m.verification ?? {}, f = m.freshness ?? {}, plan = (s.contentPlan?.items ?? []).find((i) => i.decisionId === p.decisionId);
    const start = startOfPkg(pkg);
    const blockers = currentBlockers(s, p);
    const rows = [
      ["Sport / event", `${esc(pkg.sport)} · ${esc(pkg.title.split(":")[0])}`],
      ...(pkg.eventId ? [["Game ID", `<code>${esc(pkg.eventId)}</code>`]] : []),
      ["Category", `${esc(pkg.format ?? pkg.kind)}${m.variant && !pkg.eventId ? ` · ${esc(m.variant)}` : ""}`],
      ["Package", `<code>${esc(m.dedupeId)}</code>`],
      ["Event date", start ? `${esc(dayLabel(etDay(new Date(start))))} · ${esc(etTime(start))}` : esc(pkg.date)],
      ["Forecast version", `${esc(m.modelVersion ?? "official forecast")}${m.snapshotId ? ` · <code>${esc(String(m.snapshotId).slice(0, 12))}</code>` : ""}`],
      ["Forecast snapshot", (m.snapshotRefs ?? []).length ? `${num(m.snapshotRefs.length)} file(s) · data commit <code>${esc(String(pkg.dataCommit ?? "—").slice(0, 10))}</code> · ${m.provenance?.verified ? "matches its commit" : esc(m.provenance?.detail ?? "not checked")}` : "—"],
      ["Data verification", `${v.passed ? "Passed" : "Not passed"}${v.cellsVerified != null ? ` · ${num(v.cellsVerified)} cells checked` : ""}`],
      ...(["lr-nba-players", "lr-nba-top5", "lr-nfl-game-players", "lr-nfl-top5"].includes(pkg.kind) ? [["Anomaly check", { PASS: "Passed", REVIEW: "Needs review" }[m.anomalyCheck] ?? "Not run yet: check the projections yourself"]] : []),
      ["Availability", (m.caveats ?? []).length ? esc(m.caveats.join("; ")) : "No caveat in the package: re-checked before any send"],
      ["Freshness", `${f.ageHours != null ? `${esc(f.ageHours)} h old · ` : ""}${esc(f.rule ?? "")}`],
      ...(m.quote ? [["Lines quoted", esc(m.quote)]] : []),
      ["Status", `${esc(m.eligibilityClass ?? "—")} · ${p.resolution?.verdict === "approve" ? "approved" : "founder review"}`],
      ["Publishing window", m.window?.closesAt ? `until ${esc(dayLabel(etDay(new Date(m.window.closesAt))).split(" · ")[0])} ${esc(etTime(m.window.closesAt))}${plan ? ` · calendar slot ${esc(etTime(plan.at))}` : ""}` : "—"],
      ["Clean export", m.socialAuthorized === true ? "Clean image" : p.resolution?.verdict === "approve" ? "Requested: waiting for Launch Readiness" : "Not requested: this is the review copy; approving it requests the clean export"],
      ["Internal review", "Open"],
      ["Public publishing", blockers.length ? `Blocked: ${esc(blockers.map((b) => b.title.toLowerCase()).join(" and "))}` : m.socialAuthorized === true ? "Publishable after your approval" : "After the clean export and your approval of it"],
      ["Recommended time", pkg.suggestedPublishAt ? esc(`${dayLabel(etDay(new Date(pkg.suggestedPublishAt))).split(" · ")[0]} ${etTime(pkg.suggestedPublishAt)}`) : "—"],
      ["Destination", TRULY_UNSUPPORTED.has(pkg.kind) ? "None: not publishable" : "X, through the publisher"],
      ["Design", `${esc(pkg.template ?? "—")} · ${p.designApproved ? "approved" : "waiting for your approval"}`],
    ];
    return `${blockers.map((b) => `<div class="blocked"><b>${esc(b.title)}</b> · ${esc(b.detail)}${(b.items ?? []).length ? `<ul class="warns">${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}</div>`).join("")}
      ${TRULY_UNSUPPORTED.has(pkg.kind) ? `<div class="notice warn">This content type isn't supported by the publisher yet: view only.</div>` : ""}
      <div class="kv">${rows.map(([k, x]) => `<span>${esc(k)}</span><span>${x}</span>`).join("")}</div>`;
  }
  function postActions(p) {
    const pkg = p.package;
    const id = esc(p.decisionId);
    if (p.lifecycle === "superseded") return `<div class="muted">A newer queue proposed this post again; decide there.</div>`;
    if (p.lifecycle === "drafted") {
      const designOk = p.designApproved !== false;
      const held = pkg.imported && currentBlockers(ui.state, p).length > 0;
      const ready = !held && !ui.editing[p.decisionId] && designOk && (pkg.status === "READY" || pkg.kind === "x-reply" || pkg.kind === "td-top3" || (pkg.kind === "nba-game" && pkg.status === "NEEDS_VERIFICATION" && pkg.availabilityCheck?.length));
      const why = held || (pkg.imported && pkg.status === "BLOCKED") ? "Blocked: see the reason above" : ui.editing[p.decisionId] ? "Save or cancel the edit first" : !designOk ? "Approve the design first" : `Not approvable: ${esc(STATUS_LABEL[pkg.status] ?? pkg.status)}`;
      return `${pkg.kind === "x-reply" ? `<label class="confirm"><input type="checkbox" data-confirm="${id}" ${ui.drafts[`confirm:${p.decisionId}`] ? "checked" : ""}> I opened the cited posts and they say what the finding claims</label>` : ""}
        ${pkg.kind === "td-top3" ? `<label class="confirm"><input type="checkbox" data-avail="${id}" ${ui.drafts[`avail:${p.decisionId}`] ? "checked" : ""}> I confirmed all three players are active and in their expected roles</label>` : ""}
        ${pkg.kind === "nba-game" && pkg.availabilityCheck?.length ? `<label class="confirm"><input type="checkbox" data-avail="${id}" ${ui.drafts[`avail:${p.decisionId}`] ? "checked" : ""}> I confirmed the featured players are playing (${esc(pkg.availabilityCheck.join("; "))})</label>` : ""}
        <div class="row actions">
          <button class="btn ${ready ? "primary" : ""}" data-post-approve="${id}" ${ready ? "" : "disabled"}>${ready ? "Approve this caption" : why}</button>
          <button class="btn" data-post-verdict="reject" data-post="${id}">Reject</button>
          ${pkg.imported ? "" : `<button class="btn" data-post-verdict="revise" data-post="${id}">Revise</button>`}
          <button class="btn" data-post-verdict="defer" data-post="${id}">Defer</button>
        </div>${pkg.imported ? revisionForm(p) : ""}`;
    }
    if (p.lifecycle === "revise" && pkg.imported) return `<div class="muted">Sent back for revision. The revised draft will appear here as a new version of this post, with your feedback kept.</div>`;
    if (p.lifecycle === "approved" || p.lifecycle === "scheduled") {
      return `${publishControls(p)}<div class="receipt">Approved caption ${esc(p.resolution.captionId)} at ${esc(time(p.resolution.approvedAt))}${p.resolution.sourcesConfirmed ? " · you confirmed the cited posts" : ""} · digest ${esc(p.resolution.approvedExactDigest.slice(0, 12))}…<br>${PUB_SCHEDULABLE.has(pkg.kind) ? "Approved, not published. Send it with the X publisher above (Live test post or Schedule); a manual post is recorded below." : `Post it yourself on X${pkg.media ? " with the graphic" : ""}, then record the link.`}${p.schedule ? `<br>Scheduled by you for ${esc(new Date(p.schedule.scheduledFor).toLocaleString())}` : ""}</div>
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
      return `<div class="receipt">✓ ${r.provider === "x-api" ? "Sent through the X API" : "Posted manually; link recorded"} · ${xLink(r.canonicalUrl)}<br>${esc(new Date(r.publishedAt).toLocaleString())} · caption ${esc(r.captionId)} · digest ${esc(r.bundleDigest.slice(0, 12))}…<br>${esc(r.verification)}</div>
        ${(r.warnings ?? []).length ? `<ul class="warns">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
        ${p.checks.map((c) => `<div class="${c.status === "CONFIRMED" ? "receipt" : "blocked"}">After kickoff: ${esc(c.status)} — ${esc(c.reasons?.[0])} <span class="muted">(${esc(c.basis)})</span></div>`).join("")}
        <details ${m ? "" : "open"}><summary>Engagement${m ? `: ${Object.entries(m).map(([k, v]) => `${esc(k)} ${num(v)}`).join(" · ")}` : ""}</summary>
          <div class="metrics">${["impressions", "likes", "reposts", "replies", "bookmarks"].map((k) => `<label>${esc(k)}<input type="number" inputmode="numeric" min="0" step="1" data-draft="m:${id}:${k}" value="${draftVal(`m:${p.decisionId}:${k}`)}"></label>`).join("")}</div>
          <div class="row"><button class="btn small" data-post-record="engagement" data-post="${id}">Save numbers</button><span class="muted">From X analytics, entered by you; not verified.</span></div>
        </details>`;
    }
    return `<div class="blocked">${esc(LIFE_LABEL[p.lifecycle])}${p.resolution?.note ? ` · “${esc(p.resolution.note)}”` : ""}</div>`;
  }
  const PUB_SCHEDULABLE = new Set(["nba-game", "pregame-forecast", "td-top3", "top5-board", "top5-daily", "top5-weekly", "lr-results-recap", "lr-nba-tonight", "lr-nfl-roundup", "lr-nfl-mnf", "lr-nba-top5", "lr-nfl-top5", "lr-nba-game-winner", "lr-nfl-game-winner", "lr-nba-players", "lr-nfl-game-players", "lr-nba-boxscore", "lr-nba-game", "lr-nfl-game", "lr-nba-top5-carousel"]);
  /**
   * Display only: an attempt with no recorded outcome during its first 2 minutes is a send in progress ("Sending…");
   * after that it is "Outcome unknown — reconcile". The gate treats both as unknown (never retried) either way.
   */
  const SENDING_MS = 2 * 60_000;
  const sending = (j) => j?.status === "unknown" && j.results.at(-1)?.code === "NO_OUTCOME_RECORDED" && Date.now() - Date.parse(j.results.at(-1).attemptedAt) < SENDING_MS;
  const JOB_LABEL = { scheduled: "Scheduled", dry_run: "Dry run done", published: "Published", refused: "Refused", failed_not_sent: "Failed (not sent)", unknown: "Outcome unknown — reconcile", missed: "Missed (after start)", cancelled: "Cancelled" };
  /** X Publisher V1 controls on an approved post: schedule (default 45 min before tip), dry run, one live test. */
  function publishControls(p) {
    const pkg = p.package;
    if (!PUB_SCHEDULABLE.has(pkg.kind)) return "";
    if (pkg.imported && pkg.imported.socialAuthorized !== true) return `<div class="notice warn">Approved for a clean export. This image carries the review banner, so it can't be scheduled. Launch Readiness delivers the clean version as a new post for your approval.</div>`;
    const pub = ui.state.publishing ?? {};
    const mine = (pub.jobs ?? []).filter((j) => j.decisionId === p.decisionId);
    const open = mine.find((j) => j.status === "scheduled");
    const id = esc(p.decisionId);
    const when = pkg.suggestedPublishAt ? new Date(pkg.suggestedPublishAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
    return `<div class="pubbox"><div class="section">Publish to X ${pub.mode === "live" ? `<span class="tag life-published">LIVE · cap $${esc(pub.capUsd)}/month</span>` : `<span class="tag">DRY RUN</span>`}</div>
      ${mine.slice(0, 4).map((j) => sending(j) ? `<div class="receipt">Sending… — started ${esc(time(j.results.at(-1).attemptedAt))}; the X link appears here when X answers</div>` : `<div class="${["published", "dry_run", "scheduled"].includes(j.status) ? "receipt" : "blocked"}">${esc(JOB_LABEL[j.status] ?? j.status)}${j.status === "scheduled" ? ` for ${esc(new Date(j.dueAt).toLocaleString())}` : ""}${j.results.at(-1)?.detail ? ` — ${esc(j.results.at(-1).detail)}` : ""}${j.results.at(-1)?.canonicalUrl ? ` · ${xLink(j.results.at(-1).canonicalUrl)}` : ""}${j.status === "unknown" ? ` <button class="btn small" data-pub="reconcile" data-job="${esc(j.jobId)}">Reconcile…</button>` : ""}</div>`).join("")}
      <div class="row actions">
        ${open ? `<button class="btn small" data-pub="cancel" data-job="${esc(open.jobId)}">Cancel schedule</button>` : pkg.imported ? importSchedule(ui.state, p, id) : `<button class="btn small primary" data-pub="schedule" data-post="${id}" ${pkg.suggestedPublishAt ? "" : "disabled"}>${when ? `Schedule for ${esc(when)} (45 min before tip)` : "No suggested time"}</button>`}
        <button class="btn small" data-pub="dry-run-now" data-post="${id}">Dry run now</button>
        <button class="btn small" data-pub="live-test" data-post="${id}" data-title="${esc(pkg.title)}" ${pub.x?.connected ? "" : "disabled title=\"Connect X first\""}>Live test post…</button>
      </div></div>`;
  }
  const HOST_NAME = { local: "the Mac console", hosted: "the hosted Command Center" };
  /** Which host may send live; the active one can hand it over (cutover / rollback, docs/hosted-deployment-runbook.md). */
  function hostLine(h) {
    if (!h) return "";
    const other = h.self === "local" ? "hosted" : "local";
    if (h.active !== h.self) return `<div class="blocked"><b>Live sender: ${esc(HOST_NAME[h.active])}.</b> This is ${esc(HOST_NAME[h.self])}: it sends nothing live and leaves the schedule alone (review, approve and edit still work here).</div>`;
    return `<details><summary><b>Live sender: this is it</b> (${esc(HOST_NAME[h.self])}, hand-off #${num(h.generation)})</summary>
      <div class="muted">Only one place sends to X. Handing over stops live sending here at once; the other side starts only after the ledger sync carries the hand-off (runbook). Do this only as part of an approved cutover.</div>
      <button class="btn small" data-pub="publisher-host" data-to="${esc(other)}">Hand live sending to ${esc(HOST_NAME[other])}…</button></details>`;
  }
  function publishingBar(pub) {
    if (!pub) return "";
    const x = pub.x ?? {};
    return `<div class="pubbar ${pub.paused ? "blocked" : "receipt"}">
      <div><b>X publishing${pub.publisherHost && pub.publisherHost.active !== pub.publisherHost.self ? ` (sent by ${esc(HOST_NAME[pub.publisherHost.active])}, not here)` : ""}:</b> ${pub.mode === "live" ? `LIVE (scheduled), cap $${esc(pub.capUsd)}/month, $${esc(pub.spentThisMonthUsd)} spent` : pub.capUsd > 0 ? `Scheduled: DRY RUN · live TEST posts allowed, cap $${esc(pub.capUsd)}/month, $${esc(pub.spentThisMonthUsd)} spent` : "DRY RUN — nothing is sent to X"} · ${pub.paused ? "<b>PAUSED</b>" : "running"} · scheduler ${pub.lastTick ? `ticked ${esc(time(pub.lastTick))}` : `every ${esc(pub.schedulerIntervalSec ?? 30)} s`}</div>
      <div>X account: ${x.connected ? `connected (${esc((x.scopes ?? []).join(", "))}) · token refreshes ${x.refreshable ? "automatically" : "— reconnect needed"}` : x.clientConfigured ? "not connected" : "app Client ID not set (see docs/x-publisher-setup.md)"} · callback <code>${esc(x.redirectUri ?? "")}</code></div>
      ${hostLine(pub.publisherHost)}
      ${x.connected && !(x.scopes ?? []).includes("media.write") ? `<div class="blocked"><b>X did not grant media.write.</b> Images can't be uploaded, so no game post can go out live. Disconnect X, check the app has Read and write permissions in the X Developer Console, then Connect again and allow every permission.</div>` : ""}
      <div class="row actions">
        <button class="btn small ${pub.publishingPaused ? "primary" : ""}" data-pub="${pub.publishingPaused ? "resume" : "pause"}">${pub.publishingPaused ? "Resume publishing" : "Pause publishing"}</button>
        ${x.clientConfigured ? `<button class="btn small" data-pub="${x.connected ? "x-disconnect" : "x-connect"}">${x.connected ? "Disconnect X" : "Connect X account"}</button>` : ""}
        ${pub.mode === "live" ? `<button class="btn small" data-pub="policy-dry">Switch scheduled publishing to dry run</button>` : x.connected ? `${pub.capUsd > 0 ? "" : `<button class="btn small" data-pub="policy-test">Authorize live test posts…</button>`}<button class="btn small" data-pub="policy-live">Authorize scheduled live publishing…</button>` : ""}
      </div>
      ${(pub.alerts ?? []).length ? `<details open><summary><b>${num(pub.alerts.length)} alert(s)</b></summary><ul class="warns">${pub.alerts.map((a) => `<li><b>${esc(a.severity)}</b> ${esc(a.code)} · ${esc(a.postId ?? "")} — ${esc(a.detail)} <span class="muted">${esc(time(a.at))}</span> <button class="btn small" data-pub="ack" data-alert="${esc(a.alertId)}">Acknowledge</button></li>`).join("")}</ul></details>` : ""}
      ${(pub.jobs ?? []).length ? `<details><summary>Publishing jobs (${num(pub.jobs.length)})</summary><ul>${pub.jobs.map((j) => `<li>${esc(JOB_LABEL[j.status] ?? j.status)} · ${esc(j.title ?? j.postId)} · due ${esc(new Date(j.dueAt).toLocaleString())}${j.results.at(-1)?.code ? ` · ${esc(j.results.at(-1).code)}` : ""}</li>`).join("")}</ul></details>` : ""}
    </div>`;
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
               <button class="btn primary" data-approve="${esc(d.decisionId)}">${decided ? "Retry (demo publisher — never posts)" : "Approve (demo publisher — never posts)"}</button>
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
    return `<h2>Controls & account</h2>
      <div class="switch"><div><b>Publishing</b><div class="muted">${s.paused ? "Paused: every send is refused at the boundary." : "Running. Pause stops the AI team and every send at once."}</div></div>
        <button class="btn ${s.paused ? "primary" : "danger"} small" data-pause="${s.paused ? "0" : "1"}">${s.paused ? "Resume" : "Pause all"}</button></div>
      <div class="kv"><span>Paid AI models</span><span>$${num(s.budget.spentUsd)} of $${num(s.budget.limitUsd)}${s.budget.limitUsd === 0 ? " · off (no paid model calls)" : ""}</span>
        <span>Recap demo publisher</span><span>${esc(s.publisher.name)} (never posts; X sending is under Publishing)</span>
        <span>Mode</span><span>${esc(s.phase)}</span></div>
      <div class="meter"><i style="width:${pct}%"></i></div>
      <div class="row" style="margin-top:10px">${Auth.hosted
        ? `<button class="btn small" data-logout>Sign out</button><button class="btn small" data-logout-all>Sign out everywhere</button><button class="btn small" data-add-passkey>Add a backup passkey</button>${s.me?.role === "admin" ? `<button class="btn small" data-new-codes>New recovery codes</button>` : ""}`
        : `<button class="btn small" data-reset>Reset demo</button>`}</div>
      ${s.me ? `<div class="muted" style="margin-top:6px">Signed in as <b>${esc(s.me.displayName)}</b> · ${esc(s.me.role)}</div>` : ""}
      ${s.me?.role === "admin" ? renderAccounts() : ""}
      ${renderClaude(s)}`;
  }

  /** Administrators: people, roles and invites (loaded on demand; changes need Face ID / Touch ID). */
  function renderAccounts() {
    const a = ui.accounts;
    const ROLE_OPTS = ["viewer", "drafter", "approver", "publisher", "admin"];
    return `<details class="accounts" ${ui.accountsOpen ? "open" : ""} data-accounts><summary><b>People and roles</b></summary>
      <div class="muted">Viewer sees · Drafter asks the team · Approver approves and pauses · Publisher schedules and publishes · Admin manages people, X and live publishing. Invite-only; no one can sign up.</div>
      ${a ? `<ul>${a.users.map((u) => `<li><b>${esc(u.displayName)}</b> <span class="muted">${esc(u.id)}</span> · <select data-user-role="${esc(u.id)}">${ROLE_OPTS.map((r) => `<option ${r === u.role ? "selected" : ""}>${r}</option>`).join("")}</select> · ${esc(u.status)} <button class="btn small" data-user-status="${esc(u.id)}" data-to="${u.status === "active" ? "disabled" : "active"}">${u.status === "active" ? "Disable" : "Enable"}</button></li>`).join("")}</ul>
        ${a.invites.length ? `<div class="section">Invites</div><ul>${a.invites.map((i) => `<li>${esc(i.displayName)} · ${esc(i.role)} · ${esc(i.status)} · expires ${esc(new Date(i.expiresAt).toLocaleString())}${i.status === "open" ? ` <button class="btn small" data-invite-revoke="${esc(i.inviteId)}">Revoke</button>` : ""}</li>`).join("")}</ul>` : ""}` : `<button class="btn small" data-accounts-load>Show people</button>`}
      <div class="row"><input id="invite-name" placeholder="Name" maxlength="60"><select id="invite-role">${ROLE_OPTS.map((r) => `<option ${r === "viewer" ? "selected" : ""}>${r}</option>`).join("")}</select><button class="btn small" data-invite-create>Create invite link</button></div>
      ${ui.inviteLink ? `<div class="receipt">Send this link privately; it works once and expires in 72 hours. It won't be shown again.<br><code>${esc(ui.inviteLink)}</code> <button class="btn small" data-copy-invite>Copy</button></div>` : ""}
    </details>`;
  }
  async function loadAccounts() {
    const r = await post("/api/users/list", {});
    if (r.ok) ui.accounts = r;
    render(ui.state);
  }
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-accounts-load],[data-invite-create],[data-invite-revoke],[data-user-status],[data-copy-invite]");
    if (!t) return;
    ui.accountsOpen = true;
    if (t.dataset.accountsLoad !== undefined) return loadAccounts();
    if (t.dataset.copyInvite !== undefined) { await navigator.clipboard?.writeText(ui.inviteLink); return; }
    if (t.dataset.inviteCreate !== undefined) {
      const r = await post("/api/users/invite", { displayName: $("invite-name").value.trim(), role: $("invite-role").value });
      if (!r.ok) return alert(`${r.code}: ${r.detail ?? ""}`);
      ui.inviteLink = r.link;
      return loadAccounts();
    }
    if (t.dataset.inviteRevoke) { await post("/api/users/revoke-invite", { inviteId: t.dataset.inviteRevoke }); return loadAccounts(); }
    if (t.dataset.userStatus) {
      const r = await post("/api/users/update", { userId: t.dataset.userStatus, status: t.dataset.to });
      if (!r.ok) alert(`${r.code}: ${r.detail ?? ""}`);
      return loadAccounts();
    }
  });
  document.addEventListener("change", async (e) => {
    if (!e.target.dataset.userRole) return;
    const r = await post("/api/users/update", { userId: e.target.dataset.userRole, role: e.target.value });
    if (!r.ok) alert(`${r.code}: ${r.detail ?? ""}`);
    loadAccounts();
  });

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

  // ── v3 product views: Overview, Review, Calendar, Publishing, Reports, AI Team, Operations ──────────────────────
  // Everything here is a read of the same state the server returns; approvals, edits and publishing still go through
  // postCaptions / postActions / publishControls (exact digests, step-ups, once-only claims are unchanged).
  const ET = "America/New_York";
  const etDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: ET }).format(d);
  const etTime = (iso) => (iso ? `${new Date(iso).toLocaleTimeString("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" })} ET` : "");
  const dayLabel = (d) => {
    const today = etDay(new Date());
    const tomorrow = etDay(new Date(Date.now() + 864e5));
    const yesterday = etDay(new Date(Date.now() - 864e5));
    const named = d === today ? "Today" : d === tomorrow ? "Tomorrow" : d === yesterday ? "Yesterday" : null;
    const long = new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    return named ? `${named} · ${long}` : long;
  };
  const startOfPkg = (k) => k.tipUtc ?? k.startUtc ?? k.verification?.kickoffUtc ?? k.kickoffUtc ?? k.firstKickoffUtc ?? null;
  const KIND_LABEL = { "nba-game": "Game post", "nba-final": "Final scores", "results-recap": "Results recap", "nfl-recap": "Forecast vs final", "pregame-forecast": "Pregame forecast", "td-top3": "Top 3 TD", "top5-board": "Top 5 board", "top5-weekly": "Weekly Top 5 (whole week)", "top5-daily": "Daily Top 5 (slate)", engagement: "Engagement", explainer: "Explainer", "x-reply": "Reply", "nba-results": "Prediction vs final", "lr-results-recap": "Results recap", "lr-nba-tonight": "NBA tonight", "lr-nfl-roundup": "NFL winners roundup", "lr-nfl-mnf": "Monday Night preview", "lr-nba-top5": "NBA daily Top 5", "lr-nba-top5-carousel": "NBA Top 5 carousel", "lr-nfl-top5": "NFL weekly Top 5", "lr-nba-game-winner": "Game winner", "lr-nfl-game-winner": "Game winner", "lr-nba-game": "Game post", "lr-nfl-game": "Game post", "lr-nba-players": "Projected stat lines", "lr-nfl-game-players": "Player graphic", "lr-nba-boxscore": "Player box score (real lines)", "lr-unsupported": "Unsupported" };
  const SPORTS = ["NBA", "NFL", "MLB", "UFC", "EPL"];
  const sportChip = (sp) => `<span class="sport sport-${esc(String(sp ?? "").toLowerCase())}">${esc(sp ?? "—")}</span>`;
  const jobsOf = (s, p) => (s.publishing?.jobs ?? []).filter((j) => j.decisionId === p.decisionId);
  const imagesOf = (pkg) => (pkg.mediaSet?.length ? pkg.mediaSet : pkg.media ? [pkg.media] : []);
  const claimOf = (pkg, key) => (pkg.claims ?? []).find((c) => c.key === key)?.display ?? null;

  /**
   * One status per post a person can read at a glance. "Sent" needs a real X receipt (a dry run is never sent);
   * a pregame post whose event has started can no longer be sent ("Expired") — the server enforces the same rule.
   */
  function postStatus(s, p) {
    const job = jobsOf(s, p).at(-1);
    const start = startOfPkg(p.package);
    if (p.receipt) return p.receipt.provider === "x-api" ? { key: "sent", label: "Sent", cls: "ok" } : { key: "sent", label: "Posted manually", cls: "ok" };
    if (sending(job)) return { key: "scheduled", label: "Sending…", cls: "info" };
    if (job && ["unknown", "refused", "failed_not_sent", "missed"].includes(job.status)) return { key: "problem", label: JOB_LABEL[job.status], cls: "bad" };
    if (p.lifecycle === "superseded") return { key: "other", label: "Superseded", cls: "dim" };
    if (["rejected", "revise", "deferred", "invalidated"].includes(p.lifecycle)) return { key: "other", label: LIFE_LABEL[p.lifecycle], cls: "dim" };
    if (start && Date.parse(start) <= Date.now() && PUB_SCHEDULABLE.has(p.package.kind)) return { key: "expired", label: "Expired · started", cls: "dim" };
    if (job?.status === "scheduled") return { key: "scheduled", label: `Scheduled ${etTime(job.dueAt)}`, cls: "info" };
    if (p.lifecycle === "approved" || p.lifecycle === "scheduled") return { key: "approved", label: job?.status === "dry_run" ? "Approved · dry run OK" : "Approved", cls: "info" };
    if (p.lifecycle === "revise" && p.package.imported) return { key: "revision", label: s.revisionStatus?.[p.package.imported.dedupeId]?.status === "IN_PROGRESS" ? "Revision in progress" : "Revision requested", cls: "info" };
    if (p.lifecycle === "drafted" && p.package.imported && p.package.status !== "BLOCKED" && versionsOf(s, p).some((q) => q.resolution?.verdict === "revise")) return { key: "needs", label: "Revised draft ready", cls: "warn" };
    if (p.lifecycle === "drafted" && p.package.imported && (p.package.status === "BLOCKED" || currentBlockers(s, p).length)) { const b = currentBlockers(s, p); return { key: "blocked", label: b.some((x) => x.title === "Data correction required") ? "Data correction required before publishing" : b.length ? `Held · ${b.map((x) => x.title.toLowerCase()).join(" + ")}` : "Held", cls: "warn" }; }
    if (p.lifecycle === "drafted" && p.package.imported) return { key: "needs", label: p.package.imported.socialAuthorized === true ? "Final approval required" : "Ready for founder review", cls: "warn" };
    if (p.lifecycle === "approved" && p.package.imported && p.package.imported.socialAuthorized !== true) return { key: "approved", label: "Clean export requested", cls: "info" };
    if (p.lifecycle === "drafted") return { key: "needs", label: p.package.status === "NEEDS_VERIFICATION" ? "Needs decision · verify" : p.package.status === "BLOCKED" ? "Blocked" : "Needs decision", cls: p.package.status === "BLOCKED" ? "bad" : "warn" };
    return { key: "other", label: LIFE_LABEL[p.lifecycle] ?? p.lifecycle, cls: "dim" };
  }
  const pill = (st) => `<span class="pill pill-${st.cls}">${esc(st.label)}</span>`;

  function counts(s) {
    // a review copy replaced by its clean export is the same content record: only the current version is listed
    // so is a version sent back for revision, once its revised draft has arrived
    const posts = (s.posts ?? []).filter((p) => p.lifecycle !== "superseded" && !(p.lifecycle === "invalidated" && p.package.imported) && !(p.lifecycle === "revise" && p.package.imported && latestVersion(s, p) !== p));
    const by = { needs: [], revision: [], blocked: [], approved: [], scheduled: [], sent: [], expired: [], problem: [], other: [] };
    for (const p of posts) by[postStatus(s, p).key].push(p);
    const today = etDay(new Date());
    const month = today.slice(0, 7);
    const receipts = posts.filter((p) => p.receipt);
    return { posts, by, today, sentToday: receipts.filter((p) => etDay(new Date(p.receipt.publishedAt)) === today).length, sentMonth: receipts.filter((p) => etDay(new Date(p.receipt.publishedAt)).startsWith(month)).length, viaApi: receipts.filter((p) => p.receipt.provider === "x-api").length, receipts };
  }

  /** The one sentence about who may send to X, from this host's point of view. Never claims more than the state says. */
  function senderSentence(pub) {
    if (!pub) return "Publishing state unavailable.";
    const h = pub.publisherHost;
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    const where = h && h.active !== h.self ? `${cap(HOST_NAME[h.active])} sends to X; this ${HOST_NAME[h.self].replace(/^the /, "")} reviews, approves and edits but sends nothing.` : `This ${h ? HOST_NAME[h.self].replace(/^the /, "") : "console"} is the live X sender.`;
    const mode = pub.publishingPaused ? "Publishing is paused." : pub.mode === "live" ? "Scheduled posts go out live." : "Scheduled posts are dry runs (nothing is sent).";
    return `${where} ${mode}`;
  }

  function renderStatusline(s) {
    const pub = s.publishing ?? {};
    const h = pub.publisherHost;
    const sender = h ? (h.active === h.self ? "Live sender: here" : `Live sender: ${h.active === "local" ? "Mac" : "hosted"}`) : null;
    return [
      s.paused || pub.publishingPaused ? `<span class="spill bad">${s.paused ? "Paused" : "Publishing paused"}</span>` : "",
      sender ? `<span class="spill">${esc(sender)}</span>` : "",
      pub.mode ? `<span class="spill ${pub.mode === "live" ? "ok" : ""}">X ${pub.mode === "live" ? "live" : "dry run"} · $${num(pub.spentThisMonthUsd ?? 0).toFixed(2)} of $${num(pub.capUsd ?? 0)}</span>` : "",
    ].join("");
  }

  const pageHead = (title, sub, right = "") => `<div class="page-head"><div><h2 class="h2">${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${right}</div>`;
  const kpi = (label, value, note, go, cls = "") => `<${go ? `button type="button" data-goto="${go}"` : "div"} class="kpi ${cls}"><div class="kpi-v">${value}</div><div class="kpi-l">${esc(label)}</div>${note ? `<div class="kpi-n">${note}</div>` : ""}</${go ? "button" : "div"}>`;
  const PREP_TEXT = "Team, prepare today's content queue from the approved calendar.";

  function renderOverview(s) {
    const c = counts(s);
    const pub = s.publishing ?? {};
    const pct = pub.capUsd > 0 ? Math.min(100, (100 * (pub.spentThisMonthUsd ?? 0)) / pub.capUsd) : 0;
    const upcoming = [...c.by.needs, ...c.by.approved, ...c.by.scheduled]
      .map((p) => ({ p, at: jobsOf(s, p).find((j) => j.status === "scheduled")?.dueAt ?? p.package.suggestedPublishAt ?? startOfPkg(p.package) }))
      .sort((a, b) => String(a.at ?? "9").localeCompare(String(b.at ?? "9"))).slice(0, 6);
    const todays = c.posts.filter((p) => p.date === c.today);
    const events = new Map();
    // events only (a start time), not engagement or recap posts about the day
    for (const p of todays) { if (!startOfPkg(p.package)) continue; const k = p.package.eventId ?? p.package.title.split(":")[0]; if (!events.has(k)) events.set(k, p); }
    const slate = SPORTS.concat(["Other"]).map((sp) => [sp, [...events.values()].filter((p) => (SPORTS.includes(p.package.sport) ? p.package.sport : "Other") === sp)]).filter(([, v]) => v.length);
    const rep = resultsByDay(s).find((d) => d.withFinal > 0);
    const cmds = s.commands.slice(-4).reverse();
    const problems = c.by.problem.length + (pub.alerts ?? []).length;
    return `${pageHead(dayLabel(c.today), esc(senderSentence(pub)))}
      <div class="kpis">
        ${kpi("Need your decision", num(c.by.needs.length), c.by.needs.length ? "Open Review" : "Nothing waiting", "queue", c.by.needs.length ? "warn" : "")}
        ${kpi("Approved, not sent", num(c.by.approved.length), c.by.scheduled.length ? `${num(c.by.scheduled.length)} scheduled` : "none scheduled", "publishing")}
        ${kpi("Sent to X", num(c.sentToday), `today · ${num(c.sentMonth)} this month · ${num(c.receipts.length)} all time`, "publishing", "ok")}
        ${kpi("Problems", num(problems), problems ? "failed, unknown or alerts" : "none", "publishing", problems ? "bad" : "")}
        <div class="kpi"><div class="kpi-v">$${num(pub.spentThisMonthUsd ?? 0).toFixed(2)}</div><div class="kpi-l">X spend this month</div><div class="meter"><i style="width:${pct}%"></i></div><div class="kpi-n">cap $${num(pub.capUsd ?? 0)} · ${s.budget.limitUsd > 0 ? `paid AI models $${num(s.budget.spentUsd)} of $${num(s.budget.limitUsd)}` : "paid AI models off"}</div></div>
      </div>
      <div class="grid2">
        <section class="card"><h3>Next up</h3>${upcoming.length ? `<ul class="rows">${upcoming.map(({ p, at }) => `<li><button type="button" class="rowlink" data-open-post="${esc(p.decisionId)}"><span class="t">${esc(at ? `${dayLabel(etDay(new Date(at))).split(" · ")[0]} ${etTime(at)}` : "—")}</span>${sportChip(p.package.sport)}<span class="grow">${esc(p.package.title.split(":")[0])} <span class="muted">${esc(KIND_LABEL[p.package.kind] ?? "")}</span></span>${pill(postStatus(s, p))}</button></li>`).join("")}</ul>` : `<div class="empty-s">Nothing upcoming. ${c.by.needs.length ? "" : "Prepare a queue to get started."}</div>`}</section>
        <section class="card"><h3>Today's slate <span class="muted">· events with prepared posts</span></h3>${slate.length ? slate.map(([sp, ps]) => `<div class="slate"><div class="slate-h">${sportChip(sp)} <span class="muted">${num(ps.length)} event(s)</span></div><ul class="rows">${ps.sort((a, b) => String(startOfPkg(a.package)).localeCompare(String(startOfPkg(b.package)))).map((p) => `<li><span class="t">${esc(etTime(startOfPkg(p.package)) || "—")}</span><span class="grow">${esc(p.package.title.split(":")[0])}</span></li>`).join("")}</ul></div>`).join("")
          : `<div class="empty-s">No queue has been prepared for today yet.${s.me && s.me.role === "viewer" ? "" : ` <button type="button" class="btn small primary" data-command="${esc(PREP_TEXT)}">Prepare today's queue</button>`}</div>`}</section>
        <section class="card"><h3>Publishing</h3><div class="kv">
          <span>Live sender</span><span>${esc(pub.publisherHost ? HOST_NAME[pub.publisherHost.active] : "—")}${pub.publisherHost && pub.publisherHost.active !== pub.publisherHost.self ? " (not this server)" : ""}</span>
          <span>Mode</span><span>${pub.publishingPaused ? "Paused" : pub.mode === "live" ? "Live (scheduled posts)" : "Dry run"}</span>
          <span>History</span><span>${num(c.viaApi)} sent through the X API · ${num(c.receipts.length - c.viaApi)} posted manually</span>
          <span>X account here</span><span>${pub.x?.connected ? "connected" : "not connected on this server"}</span>
          ${pub.queuePrep ? `<span>Daily queue</span><span>${pub.queuePrep.enabled ? `prepared ${esc(pub.queuePrep.timeEt)} ET${pub.queuePrep.activeHere ? "" : " (by the live sender)"}` : "prepared on request"}</span>` : ""}
        </div><button type="button" class="btn small" data-goto="publishing">Open Publishing</button></section>
        <section class="card"><h3>Prediction results</h3>${rep ? `<div class="bigstat"><b>${num(rep.correct)} of ${num(rep.withFinal)}</b> predicted winners correct · ${esc(dayLabel(rep.date))}</div><div class="muted">One day of results — not a long-term accuracy figure.${rep.withFinal < rep.games.length ? ` ${num(rep.games.length - rep.withFinal)} game(s) without a final in the ledger yet.` : ""}</div>`
          : `<div class="empty-s">No finals matched to predictions in the ledger yet. Results appear after the next queue build brings in the finals.</div>`}<button type="button" class="btn small" data-goto="reports">Open Reports</button></section>
        <section class="card wide"><h3>AI team</h3>${cmds.length ? `<ul class="rows">${cmds.map((cm) => { const done = cm.tasks.filter((t) => t.status === "DONE").length; const live = cm.tasks.filter((t) => ["QUEUED", "RUNNING", "AWAITING_INPUT"].includes(t.status)).length; return `<li><span class="t">${esc(dayLabel(etDay(new Date(cm.at ?? Date.now()))).split(" · ")[0])}</span><span class="grow">${esc(String(cm.text).slice(0, 110))}</span><span class="pill pill-${live ? "info" : "dim"}">${live ? `${num(live)} working` : `${num(done)}/${num(cm.tasks.length)} done`}</span></li>`; }).join("")}</ul>` : `<div class="empty-s">No requests yet.</div>`}<button type="button" class="btn small" data-goto="team">Open AI Team</button></section>
      </div>`;
  }

  // ── Review & approvals: compact cards, one expanded at a time, prev/next, full-screen gallery ──
  const REVIEW_FILTERS = [["needs", "Needs decision"], ["blocked", "Blocked"], ["revision", "Revisions"], ["approved", "Approved"], ["scheduled", "Scheduled"], ["sent", "Sent"], ["expired", "Expired"], ["problem", "Problems"], ["all", "All"]];
  const isMarket = (p) => p.package.imported?.rights === "QUOTE_ON_SOCIAL" || p.package.privateReview === true;
  /** The slate a post belongs to: a recap is reviewed on the day of the slate it leads into. */
  const slateOf = (p) => p.package.imported?.recommendation?.slateEtDate ?? p.package.date;
  /** Today's workspace: this slate, plus the recap of the slate before it, whatever window that recap now carries. */
  /** The coming Sunday's NFL posts. Eastern dates, so the clock change never moves a game to another day. */
  function isNflSunday(p) {
    if (p.package.sport !== "NFL" || !p.package.imported || !["NFL_GAME_POST", "NFL_SUNDAY_WINNERS", "NFL_WEEKLY_TOP5"].includes(p.package.imported.contentType)) return false;
    const t = Date.parse(p.package.tipUtc ?? ""), d = new Date(t);
    return Number.isFinite(t) && t > Date.now() - 864e5 && d.toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" }) === "Sunday";
  }
  function onTonight(p) {
    const today = etDay(new Date());
    if (p.package.sport !== "NBA") return false;
    if (p.package.kind === "lr-results-recap") return p.package.date === etDay(new Date(Date.parse(`${today}T12:00:00Z`) - 864e5));
    return slateOf(p) === today;
  }
  const IMPORT_GROUPS = [
    ["tonight", "NBA Today", (p) => onTonight(p) && isPrimary(p)],
    ["nflsun", "NFL Sunday", (p) => isNflSunday(p)],
    ["all", "Everything", () => true],
    ["key", "Tonight's key posts", (p) => !isMarket(p) && p.package.sport === "NBA" && ["lr-results-recap", "lr-nba-tonight", "lr-nba-top5", "lr-nba-top5-carousel"].includes(p.package.kind)],
    ["winners", "NBA winners", (p) => p.package.kind === "lr-nba-game-winner"],
    ["stats", "NBA stat lines", (p) => p.package.kind === "lr-nba-players"],
    ["private", "Real lines (private)", (p) => isMarket(p)],
    ["nfl", "NFL", (p) => p.package.sport === "NFL"],
  ];
  const importRank = (p) => { const v = String(p.package.imported?.variant ?? "").replace(/-model$/, ""); return ({ "lr-results-recap": 0, "lr-nba-tonight": 1, "lr-nba-top5-carousel": 2, "lr-nba-top5": 2 + Math.max(0, ["pts", "reb", "ast"].indexOf(v)), "lr-nba-game": 6 })[p.package.kind] ?? 9; };
  /** The one version shown in the workspace per slot; the others stay available as alternates. */
  function isPrimary(p) {
    const m = p.package.imported ?? {}, posts = ui.state?.posts ?? [];
    const has = (type, test) => posts.some((q) => q.package?.imported?.contentType === type && q.package.date === p.package.date && q.lifecycle !== "superseded" && test(q));
    if (m.contentType === "NBA_TONIGHT") return m.variant === "ml" || !has("NBA_TONIGHT", (q) => q.package.imported.variant === "ml");
    if (m.contentType === "NBA_DAILY_TOP5") return !/-model$/.test(String(m.variant)) && !has("NBA_TOP5_CAROUSEL", () => true);
    const gamePost = has("NBA_GAME_POST", (q) => String(q.package.eventId) === String(p.package.eventId));
    if (m.contentType === "NBA_GAME_WINNER") return !gamePost && (/-ml$/.test(String(m.variant)) || !has("NBA_GAME_WINNER", (q) => q.package.imported.variant === `${p.package.eventId}-ml`));
    if (m.contentType === "NBA_BOXSCORE") return !gamePost;
    if (m.contentType === "NBA_PLAYER_STATS") return false;
    return true;
  }
  /** Where a post sits in the workspace, in the founder's words. */
  function wsSection(s, p) {
    const st = postStatus(s, p), m = p.package.imported;
    if (st.key === "sent") return "published";
    if (st.key === "scheduled") return "scheduled";
    if (st.key === "revision") return "revision";
    if (st.key === "expired") return "expired";
    if (p.lifecycle === "approved") return "clean";
    if (st.label === "Revised draft ready") return "revised";
    if (st.label === "Final approval required") return "final";
    if (currentBlockers(s, p).some((b) => b.title === "Data correction required")) return "data";
    return p.lifecycle === "drafted" && !currentBlockers(s, p).length ? "ready" : "other";
  }
  const WS_SECTIONS = [["final", "Final approval required"], ["revised", "Revised draft ready"], ["ready", "Ready for founder review"], ["clean", "Clean export requested"], ["revision", "Revision requested"], ["data", "Data correction required before publishing"], ["scheduled", "Scheduled"], ["published", "Published"], ["expired", "Expired"], ["other", "Held"]];
  /** Every scheduled post with its exact Eastern and UTC time and its images. */
  function timeline(s) {
    const jobs = (s.publishing?.jobs ?? []).filter((j) => j.status === "scheduled").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    if (!jobs.length) return "";
    return `<div class="section">Publishing timeline · ${num(jobs.length)}</div><ul class="rows">${jobs.map((j) => { const p = (s.posts ?? []).find((q) => q.decisionId === j.decisionId); return `<li><span class="t">${esc(new Date(j.dueAt).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }))} ET</span><span class="grow">${esc(j.title)} · ${num(p ? imagesOf(p.package).length : 0)} image(s) · ${esc(j.dueAt.slice(11, 16))} UTC</span></li>`; }).join("")}</ul>`;
  }
  function renderNflSunday(s, list) {
    const when = (p) => etTime(p.package.tipUtc);
    const slate = list.filter((p) => p.package.kind !== "lr-nfl-game");
    const games = list.filter((p) => p.package.kind === "lr-nfl-game").sort((a, b) => a.package.tipUtc.localeCompare(b.package.tipUtc));
    const times = [...new Set(games.map(when))];
    return `<div class="workspace"><h2 class="ws-title">NFL Sunday · November 1</h2><div class="muted">${num(games.length)} game post(s), ${num(slate.length)} slate post(s). Saturday quotes are not Sunday prices: check each post's quote time.</div>${timeline(s)}
      ${slate.length ? `<div class="section">Full slate and Top 5</div><div class="rlist">${slate.map((p) => reviewCard(s, p)).join("")}</div>` : ""}
      ${times.map((w) => { const a = games.filter((p) => when(p) === w); return `<div class="section">${esc(w)} · ${num(a.length)}</div><div class="rlist">${a.map((p) => reviewCard(s, p)).join("")}</div>`; }).join("")}</div>`;
  }
  function renderWorkspace(s, c, list) {
    const others = c.posts.filter((p) => p.package.imported && onTonight(p) && !isPrimary(p));
    const byTip = (a, b) => String(startOfPkg(a.package)).localeCompare(String(startOfPkg(b.package)));
    const fallbacks = others.filter((p) => /-ml$/.test(String(p.package.imported.variant)) && p.package.imported.contentType === "NBA_GAME_WINNER").sort(byTip);
    const rest = others.filter((p) => !fallbacks.includes(p));
    const counts = WS_SECTIONS.map(([k, label]) => [label, list.filter((p) => wsSection(s, p) === k).length]).filter(([, n]) => n);
    const title = new Date(`${c.today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    return `<div class="workspace"><h2 class="ws-title">NBA Today · ${esc(title)}</h2>
      ${timeline(s)}
      <div class="muted">${num(list.length)} post(s), ${num(list.reduce((n, p) => n + imagesOf(p.package).length, 0))} graphics · ${counts.map(([l, n]) => `${num(n)} ${esc(l.toLowerCase())}`).join(" · ")}. Everything here can be opened, captioned and revised, whether or not it can be published yet.</div>
      <div class="rlist">${list.map((p) => reviewCard(s, p)).join("")}</div>
      ${fallbacks.length ? `<div class="section">Winner-only alternatives · ${num(fallbacks.length)}</div>
        <div class="muted">One post per game: a winner-only post or its unified post, never both. Approving one holds the other.</div>
        <div class="rlist">${fallbacks.map((p) => reviewCard(s, p)).join("")}</div>` : ""}
      ${rest.length ? `<details class="more"><summary>${num(rest.length)} other version(s): model-only and separate stat graphics</summary><div class="rlist">${rest.map((p) => reviewCard(s, p)).join("")}</div></details>` : ""}
    </div>`;
  }
  /** How the post will look on X: the caption, then its images in order. */
  function xPreview(p, cap) {
    const imgs = imagesOf(p.package);
    return `<div class="section">X post preview</div><div class="xprev"><div class="xprev-h"><b>GameTime Picks</b> <span class="muted">@GameTimePicksHQ</span></div><div class="xprev-t">${esc(cap)}</div>
      <div class="xprev-g n${Math.min(imgs.length, 4)}">${imgs.slice(0, 4).map((m, i) => `<img src="/media/${encodeURIComponent(m.file)}" alt="Image ${i + 1}" loading="lazy">`).join("")}</div><div class="muted">${num(imgs.length)} image(s) in one post</div></div>`;
  }
  function reviewList(s) {
    const c = counts(s);
    const f = ui.filter;
    const status = f.status === "auto" ? (c.by.needs.length ? "needs" : "all") : f.status;
    const group = IMPORT_GROUPS.find(([k]) => k === f.group);
    // a content group shows everything in it, whatever its status, so blocked items are never hidden from view
    if (group && f.group !== "all") {
      const inGroup = c.posts.filter((p) => p.package.imported && group[2](p));
      inGroup.sort((a, b) => importRank(a) - importRank(b) || String(startOfPkg(a.package)).localeCompare(String(startOfPkg(b.package))));
      // the slate workspace is the default only on a day that has one
      if (inGroup.length || f.group !== "tonight") return { c, status, list: inGroup, workspace: f.group === "tonight", nfl: f.group === "nflsun" };
    }
    const list = (status === "all" ? c.posts : [...(c.by[status] ?? []), ...c.posts.filter((p) => p.decisionId === ui.expanded && postStatus(s, p).key !== status)])
      .filter((p) => f.sport === "all" || p.package.sport === f.sport || p.decisionId === ui.expanded)
      .filter((p) => f.source !== "imported" || p.package.imported || p.decisionId === ui.expanded);
    const order = (p) => String(jobsOf(s, p).find((j) => j.status === "scheduled")?.dueAt ?? p.package.suggestedPublishAt ?? startOfPkg(p.package) ?? "9");
    const today = c.today;
    // upcoming days first (soonest first), then earlier days (most recent first)
    list.sort((a, b) => (a.date >= today) !== (b.date >= today) ? (a.date >= today ? -1 : 1)
      : a.date !== b.date ? (a.date >= today ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))
      : (a.package.priority ?? 2) - (b.package.priority ?? 2) || order(a).localeCompare(order(b)));
    return { c, status, list };
  }
  function liveResults(s) {
    const r = s.resultsAutomation; if (!r?.config) return "";
    const c = r.config, tog = (label, patch, on) => `<button class="btn small ${on ? "primary" : ""}" data-ra='${esc(JSON.stringify(patch))}'>${esc(label)}: ${on ? "on" : "off"}</button>`;
    const link = (u, l) => (u ? xLink(u, l) : "");
    return `<details><summary>Live Results Automation · ${c.enabled && !c.paused ? "on" : "off"} · ${esc(Object.entries(r.totals).map(([k, n]) => `${n} ${k}`).join(", ") || "no results yet")}</summary>
      <div class="muted">Mode: ${c.mode === "reply" ? "reply to our post" : "standalone post"} · ${r.authorized ? "authorized" : "not authorized"} · ${num(r.sentToday)} of ${num(c.dailyCap)} sent today · about $${r.costPerPostUsd} per post</div>
      <div class="row actions">${tog("Automation", { enabled: !c.enabled }, c.enabled)}${tog("Emergency pause", { paused: !c.paused }, c.paused)}${tog("NBA", { sports: { NBA: !c.sports.NBA } }, c.sports.NBA)}${tog("NFL", { sports: { NFL: !c.sports.NFL } }, c.sports.NFL)}${tog("Winners", { markets: { winner: !c.markets.winner } }, c.markets.winner)}${tog("Anytime TD", { markets: { anytime_td: !c.markets.anytime_td } }, c.markets.anytime_td)}${tog("Miss posts", { autoMisses: !c.autoMisses }, c.autoMisses)}${tog("Reply mode", { mode: c.mode === "reply" ? "standalone" : "reply" }, c.mode === "reply")}${r.authorized ? "" : `<button class="btn small" data-ra-auth="${esc(r.authorizationText)}">Authorize once…</button>`}</div>
      ${r.monitored.length ? `<div class="section">Monitoring · ${num(r.monitored.length)}</div><ul class="rows">${r.monitored.slice(0, 15).map((m) => `<li><span class="grow">${esc(m.title)} · ${esc(m.market)} · ${esc(m.selection ?? "")}</span></li>`).join("")}</ul>` : ""}
      <div class="section">Outcomes</div><ul class="rows">${r.outcomes.map((o) => `<li><span class="t">${esc(o.status)}</span><span class="grow"><b>${esc(o.title ?? o.key)}</b> · ${esc(o.selection ?? "")} · ${esc(o.eligibility)} ${link(o.parentUrl, "Original")} ${link(o.replyUrl, "Result post")}<br>${esc(o.text ?? "")}</span></li>`).join("")}${r.exceptions.map((x) => `<li><span class="t">Exception</span><span class="grow">${esc(x.detail)}</span></li>`).join("")}</ul></details>`;
  }
  function importBar(s, c) {
    const imp = c.posts.filter((p) => p.package.imported);
    const last = s.lastImport;
    const plan = s.contentPlan ?? { items: [] };
    const blocked = imp.filter((p) => p.package.status === "BLOCKED").length;
    // a design can be approved on its looks even while a post using it is held for data
    const waiting = (s.design?.templates ?? []).filter((t) => !t.approved && t.template.startsWith("gtp-lr-") && imp.some((p) => p.package.template === t.template));
    return `<section class="card"><h3>Launch Readiness packages</h3>
      <div class="muted">${num(imp.length)} imported · ${num(blocked)} blocked · importing approves and schedules nothing${last ? ` · last run ${esc(time(last.at))}: ${Object.entries(last.counts ?? {}).map(([k, n]) => `${num(n)} ${esc(k)}`).join(", ")}` : ""}</div>
      <div class="seg" role="toolbar" aria-label="Show content">${IMPORT_GROUPS.map(([k, label, test]) => `<button type="button" class="segbtn" data-filter-group="${k}" aria-pressed="${(ui.filter.group ?? "all") === k}">${esc(label)}${k !== "all" ? ` <span class="n">${num(imp.filter(test).length)}</span>` : ""}</button>`).join("")}</div>
      ${liveResults(s)}
      <div class="row actions"><button class="btn small" data-import-run>Import packages</button></div>
      ${waiting.length ? `<details><summary>${num(waiting.length)} design version(s) waiting for your approval</summary>
        <div class="muted">Design approval covers the look only. Each post still needs its own approval.</div>
        <ul class="rows">${waiting.map((t) => `<li><span class="grow">${esc(t.label ?? t.template)} <span class="muted">${esc(t.template)}</span></span><button class="btn small" data-design="1" data-design-template="${esc(t.template)}">Approve design</button></li>`).join("")}</ul></details>` : ""}
      ${plan.items.length ? `<details><summary>Proposed content calendar · ${num(plan.items.length)} slot(s)${plan.approved?.current ? " · approved" : ""}</summary>
        <ul class="rows">${plan.items.map((i) => `<li><span class="t">${esc(dayLabel(etDay(new Date(i.at))).split(" · ")[0])} ${esc(etTime(i.at))}</span>${sportChip(i.sport)}<span class="grow">${esc(i.title)}</span></li>`).join("")}</ul>
        ${plan.unslotted.length ? `<div class="muted">${num(plan.unslotted.length)} not slotted, so the account isn't flooded: ${esc(plan.unslotted.slice(0, 4).map((u) => u.title.split(":")[0]).join(", "))}${plan.unslotted.length > 4 ? "…" : ""}</div>` : ""}
        <div class="row actions"><button class="btn small" data-plan-approve="${esc(plan.digest)}" ${plan.approved?.current ? "disabled" : ""}>Approve this calendar (schedules nothing)</button></div></details>` : ""}
    </section>`;
  }
  function renderReview(s) {
    const { c, status, list, workspace, nfl } = reviewList(s);
    const dz = s.design;
    const sports = SPORTS.filter((sp) => c.posts.some((p) => p.package.sport === sp));
    let lastDay = null;
    return `${pageHead("Review & approvals", `${num(c.by.needs.length)} need your decision · ${num(c.by.approved.length + c.by.scheduled.length)} approved · ${num(c.receipts.length)} sent`)}
      ${importBar(s, c)}
      ${(dz?.templates ?? (dz ? [dz] : [])).filter((t) => !t.approved && !t.template.startsWith("gtp-lr-") && (t.template === dz.template || c.posts.some((p) => p.package.template === t.template))).map((t) => `<div class="notice warn">Graphic design <b>${esc(t.template)}</b>${t.label ? ` (${esc(t.label)})` : ""} is not approved yet: its posts can't be approved until it is. <button class="btn small" data-design="1" data-design-template="${esc(t.template)}">Approve this design version</button></div>`).join("")}
      <div class="filters" role="toolbar" aria-label="Filter posts">
        <div class="seg">${REVIEW_FILTERS.map(([k, label]) => `<button type="button" class="segbtn" data-filter-status="${k}" aria-pressed="${status === k}">${esc(label)}${k !== "all" ? ` <span class="n">${num((c.by[k] ?? []).length)}</span>` : ""}</button>`).join("")}</div>
        <div class="seg">${["all", ...sports].map((sp) => `<button type="button" class="segbtn" data-filter-sport="${sp}" aria-pressed="${ui.filter.sport === sp}">${sp === "all" ? "All sports" : esc(sp)}</button>`).join("")}</div>
      </div>
      ${workspace ? renderWorkspace(s, c, list) : nfl ? renderNflSunday(s, list) : list.length ? `<div class="rlist">${list.map((p) => { const head = p.date !== lastDay ? `<div class="rday">${esc(dayLabel(p.date))}</div>` : ""; lastDay = p.date; return head + reviewCard(s, p); }).join("")}</div>`
        : `<div class="empty-s">${status === "needs" ? "Nothing needs your decision right now." : "No posts match this filter."}</div>`}`;
  }
  function reviewCard(s, p) {
    const pkg = p.package;
    const st = postStatus(s, p);
    const imgs = imagesOf(pkg);
    const open = ui.expanded === p.decisionId;
    const chosen = p.resolution?.captionId ?? ui.choice[p.decisionId] ?? p.package.imported?.cleanOf?.captionId ?? (p.options.filter((o) => o.source === "caption-edit" && o.check?.ok).at(-1) ?? p.options.find((o) => o.check?.ok))?.captionId;
    const cap = p.options.find((o) => o.captionId === chosen)?.text ?? p.options[0]?.text ?? "";
    const start = startOfPkg(pkg);
    const postAt = jobsOf(s, p).find((j) => j.status === "scheduled")?.dueAt ?? pkg.suggestedPublishAt;
    const when = [start ? `${pkg.sport === "NBA" ? "Tip" : "Start"} ${etTime(start)}` : "", postAt && PUB_SCHEDULABLE.has(pkg.kind) ? `post ${etTime(postAt)}` : ""].filter(Boolean).join(" · ");
    const winner = claimOf(pkg, "predictedWinner");
    return `<article class="post rcard ${open ? "expanded" : ""} ${st.key === "needs" ? "open" : ""}" id="post-${esc(p.decisionId)}">
      <button type="button" class="rhead" data-expand="${esc(p.decisionId)}" aria-expanded="${open}">
        ${imgs.length ? `<img class="thumb" src="/media/${encodeURIComponent(imgs[0].file)}" alt="" loading="lazy">` : `<span class="thumb thumb-text" aria-hidden="true">Aa</span>`}
        <span class="rmain">
          <span class="rtop">${sportChip(pkg.sport)}<span class="kind">${esc(KIND_LABEL[pkg.kind] ?? pkg.format ?? pkg.kind)}</span>${pkg.imported ? `<span class="kind">${isMarket(p) ? "Real lines · private" : "Model-only"}</span>` : ""}${when ? `<span class="when">${esc(when)}</span>` : ""}</span>
          <span class="rtitle">${esc(pkg.title.split(": ").length > 1 && pkg.kind === "nba-game" ? pkg.title.split(":")[0] : pkg.title)}</span>
          ${winner ? `<span class="rwin">Predicted winner: <b>${esc(winner)}</b></span>` : ""}
          <span class="rcap">${esc(cap)}</span>
        </span>
        ${pill(st)}
      </button>
      ${open ? reviewBody(s, p) : ""}
    </article>`;
  }
  function reviewBody(s, p) {
    const pkg = p.package;
    const imgs = imagesOf(pkg);
    const check = (p.checks ?? []).filter((c) => c.phase === "pre-publish").at(-1);
    return `<div class="rbody">
      ${imgs.length ? `<div class="gallery" data-gallery="${esc(p.decisionId)}">${imgs.map((m, i) => `<figure><img src="/media/${encodeURIComponent(m.file)}" alt="${esc(m.altText ?? "")}" data-zoom data-index="${i}" loading="lazy"><figcaption>${imgs.length > 1 ? `${i + 1} of ${imgs.length}${pkg.kind === "nba-game" ? ` · ${i === 0 ? "Predicted winner" : "Projected stat lines"}` : ""}` : "Graphic"} · <a href="/media/${encodeURIComponent(m.file)}" download>Download</a></figcaption></figure>`).join("")}</div>` : `<div class="muted">Text post — no graphic.</div>`}
      ${pkg.imported ? xPreview(p, p.options.find((o) => o.captionId === (p.resolution?.captionId ?? ui.choice[p.decisionId] ?? pkg.imported?.cleanOf?.captionId ?? (p.options.filter((x) => x.source === "caption-edit" && x.check?.ok).at(-1) ?? p.options.find((x) => x.check?.ok))?.captionId))?.text ?? p.options[0]?.text ?? "") : ""}
      ${importPanel(s, p)}
      ${pkg.featured?.length ? `<div class="muted">Featured in the caption: ${pkg.featured.map((f) => `<b>${esc(f.name ?? "none")}</b> (${esc(f.team)})`).join(" · ")} — a caption highlight, not a ranking.</div>` : ""}
      ${pkg.xSources?.length ? `<div class="section">Open these first</div><div class="links">${pkg.xSources.map((u) => xLink(u)).join(" ")}</div>` : ""}
      <div class="section">Caption${p.options.length > 1 ? "s — choose one" : ""}</div>
      ${postCaptions(p)}
      ${revisionPanel(s, p)}
      <div class="ractions">${postActions(p)}</div>
      <details class="more"><summary>Details, evidence and provenance${(pkg.reasons ?? []).length ? ` · ${num(pkg.reasons.length)} note(s)` : ""}</summary>
        ${(pkg.reasons ?? []).length ? `<ul class="warns">${pkg.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
        <div class="kv">
          ${pkg.eventId ? `<span>Event ID</span><span><code>${esc(pkg.eventId)}</code></span>` : ""}
          ${pkg.dataCommit ? `<span>Data</span><span>commit <code>${esc(String(pkg.dataCommit).slice(0, 10))}</code>${pkg.forecastVersion ? ` · forecast frozen ${esc(new Date(pkg.forecastVersion.frozenAt).toLocaleString())}` : ""}</span>` : ""}
          ${pkg.template ? `<span>Design</span><span>${esc(pkg.template)}${p.designApproved ? " · approved" : " · not approved"}</span>` : ""}
          <span>Freshness</span><span>${check ? `${esc(check.status)} at ${esc(time(check.checkedAt))}` : "re-checked automatically before any send"}</span>
          ${pkg.meterKey ? `<span>Meter</span><span>${esc(pkg.meterKey.replace(/\|/g, " · "))}</span>` : ""}
          <span>Decision</span><span><code>${esc(p.decisionId)}</code></span>
        </div>
        ${evidenceList(pkg)}
      </details>
      <div class="rnav"><button type="button" class="btn small" data-step="-1">‹ Previous</button><button type="button" class="btn small" data-collapse>Close</button><button type="button" class="btn small" data-step="1">Next ›</button></div>
    </div>`;
  }

  // ── Calendar: day / week, sport filter; one row per post with its time and state ──
  function renderCalendar(s) {
    const c = counts(s);
    const base = ui.calDay ?? c.today;
    const days = ui.calMode === "day" ? [base] : Array.from({ length: 7 }, (_, i) => etDay(new Date(Date.parse(`${base}T12:00:00Z`) + i * 864e5)));
    const inRange = c.posts.filter((p) => days.includes(p.date) && (ui.filter.sport === "all" || p.package.sport === ui.filter.sport));
    const shift = (n) => etDay(new Date(Date.parse(`${base}T12:00:00Z`) + n * 864e5));
    return `${pageHead("Content calendar", `${esc(ui.calMode === "day" ? dayLabel(base) : `${dayLabel(days[0]).split(" · ").at(-1)} – ${dayLabel(days[6]).split(" · ").at(-1)}`)} · ${num(inRange.length)} post(s)`,
      `<div class="seg"><button class="segbtn" data-cal-shift="${ui.calMode === "day" ? -1 : -7}" aria-label="Earlier">‹</button><button class="segbtn" data-cal-today>Today</button><button class="segbtn" data-cal-shift="${ui.calMode === "day" ? 1 : 7}" aria-label="Later">›</button></div>`)}
      <div class="filters"><div class="seg">${["week", "day"].map((m) => `<button type="button" class="segbtn" data-cal-mode="${m}" aria-pressed="${ui.calMode === m}">${m === "week" ? "Week" : "Day"}</button>`).join("")}</div>
        <div class="seg">${["all", ...SPORTS].map((sp) => `<button type="button" class="segbtn" data-filter-sport="${sp}" aria-pressed="${ui.filter.sport === sp}">${sp === "all" ? "All sports" : esc(sp)}</button>`).join("")}</div></div>
      <div class="cal ${ui.calMode}">${days.map((d) => {
        const ps = inRange.filter((p) => p.date === d).sort((a, b) => String(startOfPkg(a.package) ?? a.package.suggestedPublishAt ?? "9").localeCompare(String(startOfPkg(b.package) ?? b.package.suggestedPublishAt ?? "9")));
        return `<div class="calday ${d === c.today ? "today" : ""}"><div class="calday-h">${esc(dayLabel(d))} <span class="muted">${num(ps.length)}</span></div>
          ${ps.length ? ps.map((p) => `<button type="button" class="calitem" data-open-post="${esc(p.decisionId)}"><span class="t">${esc(etTime(startOfPkg(p.package) ?? p.package.suggestedPublishAt) || "any time")}</span>${sportChip(p.package.sport)}<span class="grow">${esc(p.package.title.split(":")[0])} <span class="muted">${esc(KIND_LABEL[p.package.kind] ?? p.package.kind)}</span></span>${pill(postStatus(s, p))}</button>`).join("") : `<div class="empty-s">—</div>`}</div>`;
      }).join("")}</div>
      <div class="muted">Posts come from the prepared queues; a day with nothing here has no prepared content yet. Shift ‹ › to move ${ui.calMode === "day" ? "a day" : "a week"}.</div>`;
  }

  // ── Publishing: who sends, mode, money, controls, and every job and receipt ──
  function renderPublishing(s) {
    const pub = s.publishing ?? {};
    const c = counts(s);
    const x = pub.x ?? {};
    const jobs = (pub.jobs ?? []).slice().sort((a, b) => String(b.dueAt).localeCompare(String(a.dueAt)));
    const groups = { scheduled: jobs.filter((j) => j.status === "scheduled"), sent: jobs.filter((j) => j.status === "published"), problems: jobs.filter((j) => ["unknown", "refused", "failed_not_sent", "missed"].includes(j.status)), dry: jobs.filter((j) => j.status === "dry_run"), cancelled: jobs.filter((j) => j.status === "cancelled") };
    const tab = ui.pubTab;
    const manual = c.receipts.filter((p) => p.receipt.provider !== "x-api");
    const pct = pub.capUsd > 0 ? Math.min(100, (100 * (pub.spentThisMonthUsd ?? 0)) / pub.capUsd) : 0;
    const row = (j) => { const r = j.results.at(-1); const p = (s.posts ?? []).find((q) => q.decisionId === j.decisionId); return `<tr><td>${pill(sending(j) ? { label: "Sending…", cls: "info" } : { label: JOB_LABEL[j.status] ?? j.status, cls: j.status === "published" ? "ok" : j.status === "scheduled" ? "info" : groups.problems.includes(j) ? "bad" : "dim" })}</td><td>${sportChip(j.sport ?? p?.package.sport)} ${esc(String(j.title ?? j.postId).split(":")[0])}</td><td>${esc(dayLabel(etDay(new Date(j.dueAt))).split(" · ")[0])} ${esc(etTime(j.dueAt))}</td><td>${r?.canonicalUrl ? xLink(r.canonicalUrl, "View on X") : r?.code ? `<span class="muted">${esc(r.code)}</span>` : ""}${j.status === "unknown" ? ` <button class="btn small" data-pub="reconcile" data-job="${esc(j.jobId)}">Reconcile…</button>` : ""}${j.status === "scheduled" ? ` <button class="btn small" data-pub="cancel" data-job="${esc(j.jobId)}">Cancel</button>` : ""}</td></tr>`; };
    const list = tab === "manual" ? null : groups[tab] ?? jobs;
    return `${pageHead("Publishing", esc(senderSentence(pub)))}
      <div class="kpis">
        ${kpi("Live sender", esc(pub.publisherHost ? (pub.publisherHost.active === "local" ? "Mac console" : "Hosted") : "—"), pub.publisherHost ? (pub.publisherHost.active === pub.publisherHost.self ? "this server sends" : "this server does not send") : "")}
        ${kpi("Mode", pub.publishingPaused ? "Paused" : pub.mode === "live" ? "Live" : "Dry run", pub.mode === "live" ? "scheduled posts go out" : "nothing is sent", null, pub.publishingPaused ? "bad" : pub.mode === "live" ? "ok" : "")}
        <div class="kpi"><div class="kpi-v">$${num(pub.spentThisMonthUsd ?? 0).toFixed(2)}</div><div class="kpi-l">X API spend this month</div><div class="meter"><i style="width:${pct}%"></i></div><div class="kpi-n">hard cap $${num(pub.capUsd ?? 0)} · about $0.045 per two-image post</div></div>
        ${kpi("Sent", num(c.receipts.length), `${num(c.viaApi)} via X API · ${num(manual.length)} manual`, null, "ok")}
        ${kpi("Problems", num(groups.problems.length + (pub.alerts ?? []).length), "unknown outcomes are never retried automatically", null, groups.problems.length ? "bad" : "")}
      </div>
      ${(pub.alerts ?? []).length ? `<section class="card alert"><h3>${num(pub.alerts.length)} alert(s)</h3><ul class="rows">${pub.alerts.map((a) => `<li><span class="pill pill-bad">${esc(a.severity)}</span><span class="grow">${esc(a.code)} · ${esc(a.detail)}</span><span class="t">${esc(time(a.at))}</span><button class="btn small" data-pub="ack" data-alert="${esc(a.alertId)}">Acknowledge</button></li>`).join("")}</ul></section>` : ""}
      <section class="card"><div class="tabs" role="tablist">${[["all", `All (${jobs.length})`], ["scheduled", `Scheduled (${groups.scheduled.length})`], ["sent", `Sent (${groups.sent.length})`], ["problems", `Problems (${groups.problems.length})`], ["dry", `Dry runs (${groups.dry.length})`], ["manual", `Manual posts (${manual.length})`]].map(([k, l]) => `<button type="button" class="segbtn" data-pub-tab="${k}" aria-pressed="${tab === k}">${esc(l)}</button>`).join("")}</div>
        ${list ? (list.length ? `<div class="tablewrap"><table class="tbl"><thead><tr><th>Status</th><th>Post</th><th>Due</th><th>Result</th></tr></thead><tbody>${list.map(row).join("")}</tbody></table></div>` : `<div class="empty-s">No jobs here.</div>`)
          : manual.length ? `<ul class="rows">${manual.map((p) => `<li><span class="grow">${esc(p.package.title)}</span>${xLink(p.receipt.canonicalUrl, "View on X")}</li>`).join("")}</ul>` : `<div class="empty-s">No manual posts recorded.</div>`}
      </section>
      <section class="card"><h3>Controls</h3>
        <div class="kv"><span>X account on this server</span><span>${x.connected ? `connected (${esc((x.scopes ?? []).join(", "))})` : x.clientConfigured ? "not connected" : "not configured on this server (the X app's Client ID isn't set here)"}</span>
          <span>Scheduler</span><span>${pub.lastTick ? `last check ${esc(time(pub.lastTick))}` : `every ${esc(pub.schedulerIntervalSec ?? 30)} s`}${pub.publisherHost && pub.publisherHost.active !== pub.publisherHost.self ? " · idle here (not the live sender)" : ""}</span>
          ${pub.queuePrep ? `<span>Daily queue</span><span>${pub.queuePrep.enabled ? `prepared automatically at ${esc(pub.queuePrep.timeEt)} ET by the live sender${pub.queuePrep.lastRun ? ` · last ${esc(pub.queuePrep.lastRun.date)} ${pub.queuePrep.lastRun.ok ? "✓" : "✕"}` : ""}` : "off — prepared when you ask"}${pub.queuePrep.activeHere ? "" : " · change this on the live sender"}</span>` : ""}
          <span>Safeguards</span><span>each post approved on its own (exact caption, images and data) · once-only sends · never after start · fresh-data re-check before every send · unknown outcomes are reconciled by hand</span></div>
        ${hostLine(pub.publisherHost)}
        ${x.connected && !(x.scopes ?? []).includes("media.write") ? `<div class="notice bad"><b>X did not grant media.write.</b> Disconnect, check the app has Read and write permission, then connect again.</div>` : ""}
        <div class="row actions">
          <button class="btn small ${pub.publishingPaused ? "primary" : ""}" data-pub="${pub.publishingPaused ? "resume" : "pause"}">${pub.publishingPaused ? "Resume publishing" : "Pause publishing"}</button>
          ${x.clientConfigured ? `<button class="btn small" data-pub="${x.connected ? "x-disconnect" : "x-connect"}">${x.connected ? "Disconnect X" : "Connect X account"}</button>` : ""}
          ${pub.mode === "live" ? `<button class="btn small" data-pub="policy-dry">Switch scheduled publishing to dry run</button>` : x.connected ? `${pub.capUsd > 0 ? "" : `<button class="btn small" data-pub="policy-test">Authorize live test posts…</button>`}<button class="btn small" data-pub="policy-live">Authorize scheduled live publishing…</button>` : ""}
          ${pub.queuePrep?.activeHere && s.me?.role !== "viewer" ? `<button class="btn small" data-queue-prep="${pub.queuePrep.enabled ? "off" : "on"}">${pub.queuePrep.enabled ? "Turn off daily preparation" : "Prepare the queue daily…"}</button>` : ""}
        </div>
        <details class="more"><summary>OAuth callback and raw state</summary><div class="kv"><span>Callback</span><span><code>${esc(x.redirectUri ?? "")}</code></span><span>Hand-off #</span><span>${num(pub.publisherHost?.generation ?? 0)}</span></div></details>
      </section>`;
  }

  // ── Reports: predicted winner vs final, from the ledger only (no numbers that aren't recorded there) ──
  const parseFinal = (d) => { const m = /^(.*\S)\s+(\d+)$/.exec(String(d ?? "")); return m ? { team: m[1], pts: Number(m[2]) } : null; };
  function resultsByDay(s) {
    const posts = s.posts ?? [];
    const finals = new Map();
    for (const p of posts) if (p.package.kind === "nba-final" && p.package.eventId) finals.set(String(p.package.eventId), p.package);
    const days = new Map();
    for (const p of posts) {
      if (p.package.kind !== "nba-game" || p.lifecycle === "superseded") continue;
      const g = p.package;
      const f = finals.get(String(g.eventId));
      const away = f && parseFinal(claimOf(f, "final.away"));
      const home = f && parseFinal(claimOf(f, "final.home"));
      const winner = away && home ? (away.pts > home.pts ? away.team : home.team) : null;
      const predicted = claimOf(g, "predictedWinner");
      const row = { matchup: g.title.split(":")[0], predicted, final: away && home ? `${away.team} ${away.pts} – ${home.team} ${home.pts}` : null, correct: winner && predicted ? winner === predicted : null, sent: Boolean(p.receipt), receipt: p.receipt };
      if (!days.has(g.date)) days.set(g.date, []);
      days.get(g.date).push(row);
    }
    // results packages built by the results graphic (when present) carry the full, verified tally
    return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, games]) => ({ date, games, withFinal: games.filter((x) => x.correct !== null).length, correct: games.filter((x) => x.correct === true).length }));
  }
  function renderReports(s) {
    const days = resultsByDay(s);
    const scored = days.filter((d) => d.withFinal);
    const tot = scored.reduce((a, d) => ({ n: a.n + d.withFinal, c: a.c + d.correct }), { n: 0, c: 0 });
    const c = counts(s);
    const eng = c.receipts.map((p) => ({ p, m: p.engagement?.at(-1)?.metrics ?? null }));
    const resultsPosts = c.posts.filter((p) => p.package.kind === "nba-results");
    return `${pageHead("Reports & performance", "Every number here comes from the ledger: published predictions, official finals and receipts. Small samples are labelled as such.")}
      <section class="card"><h3>NBA · predicted winner vs final</h3>
        ${scored.length ? `<div class="bigstat"><b>${num(tot.c)} of ${num(tot.n)}</b> correct across ${num(scored.length)} day(s) with finals${tot.n < 50 ? ` <span class="pill pill-warn">small sample</span>` : ""}</div>` : `<div class="notice">No prediction has its official final in the ledger yet. Finals arrive with the next prepared queue (the results recap step); this page then fills in by itself.</div>`}
        ${days.map((d) => `<details class="rep" ${d === days[0] ? "open" : ""}><summary><b>${esc(dayLabel(d.date))}</b> · ${num(d.games.length)} prediction(s) · ${d.withFinal ? `${num(d.correct)}/${num(d.withFinal)} correct` : "finals not in the ledger yet"}</summary>
          <div class="tablewrap"><table class="tbl"><thead><tr><th>Game</th><th>Predicted winner</th><th>Final</th><th>Result</th><th>X</th></tr></thead><tbody>${d.games.map((g) => `<tr><td>${esc(g.matchup)}</td><td>${esc(g.predicted ?? "—")}</td><td>${esc(g.final ?? "awaiting final")}</td><td>${g.correct === null ? `<span class="pill pill-dim">pending</span>` : g.correct ? `<span class="pill pill-ok">✓ correct</span>` : `<span class="pill pill-bad">✕ missed</span>`}</td><td>${g.receipt ? xLink(g.receipt.canonicalUrl, "post") : ""}</td></tr>`).join("")}</tbody></table></div></details>`).join("") || `<div class="empty-s">No NBA game predictions in the ledger.</div>`}
        <div class="muted">A day of results is not a long-term accuracy claim. Only games with a published pre-tip prediction and an official final are counted.</div>
      </section>
      ${resultsPosts.length ? `<section class="card"><h3>Results graphics</h3><div class="muted">${num(resultsPosts.length)} prediction-vs-final post(s) in the queue — review them in Review.</div><button class="btn small" data-goto="queue">Open Review</button></section>` : ""}
      <section class="card"><h3>Player projections</h3><div class="notice">Not evaluated. Verified box scores aren't in the data yet, so no projection-vs-actual numbers are shown — none are estimated.</div></section>
      <section class="card"><h3>Engagement on sent posts</h3>${eng.length ? `<div class="tablewrap"><table class="tbl"><thead><tr><th>Post</th><th>Sent</th><th>Impressions</th><th>Likes</th><th>Reposts</th><th>Replies</th></tr></thead><tbody>${eng.map(({ p, m }) => `<tr><td>${xLink(p.receipt.canonicalUrl, p.package.title.split(":")[0])}</td><td>${esc(new Date(p.receipt.publishedAt).toLocaleDateString())}</td>${["impressions", "likes", "reposts", "replies"].map((k) => `<td>${m && m[k] !== undefined ? num(m[k]) : `<span class="muted">—</span>`}</td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="muted">Entered by you from X analytics (reading metrics through the X API costs money and is off). Open a sent post in Review to add numbers.</div>` : `<div class="empty-s">Nothing sent yet.</div>`}</section>`;
  }

  // ── AI team: who is connected how, what they are doing ──
  const EXEC_WORD = (i) => ({ real: "connected", manual: "manual hand-off", sim: "simulated", det: "automation" })[EXEC_CLASS[i.execution]] ?? String(i.status ?? "—").toLowerCase();
  function renderAgents(s) {
    const c = s.commands.at(-1);
    return `<h2>Agents</h2>${(s.providers ?? []).map((p) => `<div class="agent"><div class="agent-h"><b>${esc(p.name)}</b><span class="muted">${esc(p.roles.slice(0, 3).join(" · "))}</span></div>
      <div class="row">${p.integrations.map((i) => `<span class="pill pill-${/connected/.test(EXEC_WORD(i)) ? "ok" : /manual/.test(EXEC_WORD(i)) ? "info" : "dim"}" title="${esc(i.label)} · ${esc(i.mode)}">${esc(i.label.split(" (")[0])}: ${esc(EXEC_WORD(i))}</span>`).join("")}</div></div>`).join("")}
      <div class="muted">“Manual hand-off” means you paste the prompt into your own app and paste the answer back. Settings and seats: Operations.</div>
      ${c ? `<div class="section">Latest request</div><div class="muted">${esc(String(c.text).slice(0, 160))}</div>` : ""}`;
  }

  function navCounts(s) {
    const c = counts(s);
    return { queue: c.by.needs.length, publishing: c.by.problem.length + (s.publishing?.alerts ?? []).length, team: (s.commands.at(-1)?.tasks.filter((t) => ["QUEUED", "RUNNING", "AWAITING_INPUT"].includes(t.status)).length ?? 0) + s.decisions.filter(isOpen).length };
  }
  const navItem = (v, n, cls) => `<button type="button" class="${cls}" data-tab="${v.id}" ${ui.view === v.id ? 'aria-current="page"' : ""}><span class="ico" aria-hidden="true">${v.ico}</span><span class="lbl">${esc(v.label)}</span>${n ? `<span class="dot" aria-label="${n} pending">${n}</span>` : ""}</button>`;
  function renderTabbar(s) {
    const n = navCounts(s);
    const more = VIEWS.filter((v) => !v.bar);
    const moreActive = more.some((v) => v.id === ui.view);
    const moreN = more.reduce((a, v) => a + (n[v.id] ?? 0), 0);
    return VIEWS.filter((v) => v.bar).map((v) => navItem(v, n[v.id], "tab")).join("")
      + `<button type="button" class="tab" data-more ${moreActive ? 'aria-current="page"' : ""}><span class="ico" aria-hidden="true">⋯</span><span class="lbl">${moreActive ? esc(VIEWS.find((v) => v.id === ui.view).label) : "More"}</span>${moreN ? `<span class="dot">${moreN}</span>` : ""}</button>`;
  }
  function renderSidenav(s) {
    const n = navCounts(s);
    return VIEWS.map((v) => navItem(v, n[v.id], "navlink")).join("");
  }
  function setView(view) {
    ui.view = viewId(view);
    document.body.dataset.view = ui.view;
    $("page-title").textContent = VIEWS.find((v) => v.id === ui.view).label;
    $("more-sheet").hidden = true;
    try { localStorage.setItem("gtp-cc-view", ui.view); } catch { /* private mode: view resets on reload */ }
    if (ui.state) render(ui.state, true);
    window.scrollTo(0, 0);
    document.querySelector("main")?.scrollTo?.(0, 0);
  }

  function render(s, force = false) {
    if (!ui.landed && (s.posts ?? []).length) {
      ui.landed = true;
      let seen = false;
      try { seen = sessionStorage.getItem("gtp-cc-landed") === "1"; sessionStorage.setItem("gtp-cc-landed", "1"); } catch { /* private mode */ }
      ui.state = ui.state ?? s;
      if (!seen && (s.posts ?? []).some((p) => p.package?.imported && onTonight(p))) { ui.view = "queue"; document.body.dataset.view = "queue"; $("page-title").textContent = VIEWS.find((v) => v.id === "queue").label; }
    }
    // never rebuild the page under someone typing a caption (on a phone that drops the keyboard): catch up on blur
    if (document.activeElement?.dataset?.captionEdit || String(document.activeElement?.dataset?.draft ?? "").startsWith("revt:")) { ui.pendingRender = true; return; }
    ui.pendingRender = false;
    const thread = $("thread");
    const pauseTop = $("pause-top");
    pauseTop.dataset.pause = s.paused ? "0" : "1";
    pauseTop.textContent = s.paused ? "Paused · Resume" : "Pause all";
    pauseTop.className = `btn small pause-top ${s.paused ? "paused" : "live"}`;
    pauseTop.setAttribute("aria-pressed", String(s.paused));
    $("tabbar").innerHTML = renderTabbar(s);
    $("sidenav").innerHTML = renderSidenav(s);
    $("side-foot").innerHTML = s.me ? `<div class="muted">${esc(s.me.displayName)} · ${esc(s.me.role)}</div>` : `<div class="muted">Local console</div>`;
    const stopTop = $("stop-top");
    stopTop.hidden = !(s.engineering?.activeRuns?.length);
    const atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    $("badges").innerHTML = renderStatusline(s);
    $("overview").innerHTML = renderOverview(s);
    keepOpen($("queue"), renderReview(s));
    $("calendar").innerHTML = renderCalendar(s);
    keepOpen($("publishing"), renderPublishing(s));
    keepOpen($("reports"), renderReports(s));
    $("agents").innerHTML = renderAgents(s);
    thread.innerHTML = renderThread(s);
    keepOpen($("decisions"), renderDecisions(s));
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
    $("auth-invite").hidden = m !== "invite";
  }
  /**
   * Re-render a panel without folding the sections the person opened or closed (approving on a phone re-renders the
   * Queue; the day being worked on must stay open). Sections are matched by their title, not their counts.
   */
  function keepOpen(el, html) {
    const key = (d) => `${d.closest("[id]")?.id ?? ""}|${d.querySelector(":scope > summary > b")?.textContent ?? d.querySelector(":scope > summary")?.textContent.replace(/[\d·]+/g, "").trim() ?? ""}`;
    const was = new Map([...el.querySelectorAll("details")].map((d) => [key(d), d.open]));
    el.innerHTML = html;
    for (const d of el.querySelectorAll("details")) if (was.has(key(d))) d.open = was.get(key(d));
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
      if (t.dataset.registerInvite !== undefined) {
        await Auth.register({ inviteToken: ui.inviteToken, label: $("invite-label").value.trim() || "passkey" });
        ui.inviteToken = null;
        return signedIn();
      }
      if (t.dataset.registerRecovery !== undefined) { await Auth.register({ label: $("new-passkey-label").value.trim() || "passkey" }); return signedIn(); }
      if (t.dataset.recover !== undefined) {
        const r = await Auth.recover($("recovery-code").value.trim());
        return showAuth(`Recovery code accepted (${r.remaining ?? "?"} left). Every other session was signed out. Create a replacement passkey now.`, "recovered");
      }
      if (t.dataset.codesSaved !== undefined) {
        if (!confirm("Have you saved all 10 codes in your password manager? They can't be shown again.")) return;
        $("recovery-codes").textContent = ""; return signedIn();
      }
    } catch (err) {
      $("auth-msg").textContent = { INVITE_INVALID: "This invite link is not valid any more (used, revoked or expired). Ask for a new one.", ACCOUNT_DISABLED: "This account is disabled.", SETUP_TOKEN_REQUIRED: "That setup token is not right.", RECOVERY_CODE_INVALID: "That recovery code is not valid.", RATE_LIMITED: "Too many attempts. Wait a few minutes.", NotAllowedError: "The passkey prompt was cancelled." }[err.code ?? err.name] ?? `Could not complete that (${err.code ?? err.name ?? "error"}).`;
    } finally {
      t.disabled = false;
    }
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-login],[data-register],[data-register-invite],[data-register-recovery],[data-recover],[data-codes-saved]");
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

  /** Navigation, filters, cards and the gallery: nothing here changes server state (except an explicit command or setting). */
  function openPost(id) {
    ui.expanded = id;
    const p = ui.state.posts.find((x) => x.decisionId === id);
    if (p) {
      const st = postStatus(ui.state, p).key;
      const status = ui.filter.status === "auto" ? (counts(ui.state).by.needs.length ? "needs" : "all") : ui.filter.status;
      if (status !== "all" && status !== st) ui.filter.status = "all";
      if (ui.filter.sport !== "all" && ui.filter.sport !== p.package.sport) ui.filter.sport = "all";
    }
    if (ui.view !== "queue") setView("queue"); else render(ui.state, true);
    requestAnimationFrame(() => $(`post-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  function gallery(img) {
    const box = img.closest("[data-gallery]");
    const all = box ? [...box.querySelectorAll("img[data-zoom]")] : [img];
    let i = Math.max(0, all.indexOf(img));
    const lb = document.createElement("div");
    lb.className = "lightbox";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-label", "Graphic preview");
    const show = () => {
      lb.innerHTML = `<img src="${esc(all[i].getAttribute("src"))}" alt="${esc(all[i].getAttribute("alt") ?? "")}">
        ${all.length > 1 ? `<button type="button" class="lb-nav prev" data-gal="-1" aria-label="Previous image">‹</button><button type="button" class="lb-nav next" data-gal="1" aria-label="Next image">›</button><div class="lb-count">${i + 1} / ${all.length}</div>` : ""}
        <button type="button" class="lb-close" aria-label="Close">✕</button>`;
    };
    lb.step = (d) => { i = (i + d + all.length) % all.length; show(); };
    let x0 = null;
    lb.addEventListener("touchstart", (ev) => { x0 = ev.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", (ev) => { if (x0 === null) return; const dx = ev.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40 && all.length > 1) { ev.preventDefault(); lb.step(dx < 0 ? 1 : -1); } });
    show();
    document.body.appendChild(lb);
  }
  document.addEventListener("keydown", (e) => {
    const lb = document.querySelector(".lightbox");
    if (!lb) return;
    if (e.key === "Escape") lb.remove();
    if (e.key === "ArrowRight") lb.step?.(1);
    if (e.key === "ArrowLeft") lb.step?.(-1);
  });
  async function navAction(t, e) {
    const d = t.dataset;
    if (d.gal) { e.stopPropagation(); t.closest(".lightbox").step(Number(d.gal)); return true; }
    if (t.classList.contains("lightbox")) { t.remove(); return true; }
    if (d.zoom !== undefined) { e.preventDefault(); gallery(t); return true; }
    if (t.classList.contains("sheet-backdrop")) { if (e.target === t) t.hidden = true; return e.target === t; }
    if (d.more !== undefined) {
      $("more-list").innerHTML = VIEWS.filter((v) => !v.bar).map((v) => navItem(v, navCounts(ui.state)[v.id], "navlink")).join("") + `<button type="button" class="navlink" data-close-sheet><span class="ico">✕</span><span class="lbl">Close</span></button>`;
      $("more-sheet").hidden = false;
      return true;
    }
    if (d.expand) { ui.expanded = ui.expanded === d.expand ? null : d.expand; render(ui.state, true); if (ui.expanded) requestAnimationFrame(() => $(`post-${d.expand}`)?.scrollIntoView({ block: "start", behavior: "smooth" })); return true; }
    if (d.collapse !== undefined) { const id = ui.expanded; ui.expanded = null; render(ui.state, true); $(`post-${id}`)?.scrollIntoView({ block: "nearest" }); return true; }
    if (d.step) {
      const { list } = reviewList(ui.state);
      const at = list.findIndex((p) => p.decisionId === ui.expanded);
      const next = list[at + Number(d.step)];
      if (next) openPost(next.decisionId);
      return true;
    }
    if (d.openPost) { openPost(d.openPost); return true; }
    if (d.filterStatus) { ui.filter.status = d.filterStatus; ui.expanded = null; render(ui.state, true); return true; }
    if (d.filterSport) { ui.filter.sport = d.filterSport; render(ui.state, true); return true; }
    if (d.filterGroup) { ui.filter.group = d.filterGroup; ui.expanded = null; render(ui.state, true); return true; }
    if (d.calShift) { ui.calDay = etDay(new Date(Date.parse(`${ui.calDay ?? etDay(new Date())}T12:00:00Z`) + Number(d.calShift) * 864e5)); render(ui.state, true); return true; }
    if (d.calToday !== undefined) { ui.calDay = null; render(ui.state, true); return true; }
    if (d.calMode) { ui.calMode = d.calMode; render(ui.state, true); return true; }
    if (d.pubTab) { ui.pubTab = d.pubTab; render(ui.state, true); return true; }
    if (d.command) {
      if (!confirm(`Ask the team: “${d.command}”`)) return true;
      const r = await post("/api/command", { text: d.command });
      if (r && r.ok === false) alert(`${r.code ?? "Refused"}${r.detail ? `: ${r.detail}` : ""}`);
      else setView("team");
      return true;
    }
    if (d.queuePrep) {
      const on = d.queuePrep === "on";
      let timeEt = ui.state.publishing?.queuePrep?.timeEt ?? "10:00";
      if (on) { timeEt = prompt("Prepare the content queue every day at (ET, 24-hour HH:MM). Only the live sender prepares it.", timeEt); if (!timeEt) return true; if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeEt.trim())) { alert("Use HH:MM, e.g. 10:00"); return true; } }
      const r = await post("/api/publishing", { action: "queue-prep", enabled: on, timeEt: timeEt.trim() });
      if (r && r.ok === false) alert(`${r.code ?? "Refused"}${r.detail ? `: ${r.detail}` : ""}`);
      return true;
    }
    return false;
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-close-sheet]")) $("more-sheet").hidden = true; });

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-chip],[data-approve],[data-reject],[data-pause],[data-reset],[data-logout],[data-logout-all],[data-add-passkey],[data-new-codes],[data-copy],[data-copy-caption],[data-submit],[data-zoom],[data-tab],[data-goto],[data-gate],[data-attest],[data-preflight],[data-stop],[data-provider-test],[data-post-approve],[data-post-verdict],[data-rev-submit],[data-post-record],[data-design],[data-pub],[data-caption-open],[data-caption-save],[data-caption-cancel],[data-expand],[data-step],[data-collapse],[data-filter-status],[data-filter-sport],[data-filter-group],[data-ra],[data-ra-auth],[data-import-run],[data-plan-approve],[data-open-post],[data-command],[data-more],[data-cal-shift],[data-cal-today],[data-cal-mode],[data-pub-tab],[data-queue-prep],[data-gal],.sheet-backdrop,.lightbox");
    if (!t) return;
    if (await navAction(t, e)) return;
    if (t.dataset.captionOpen) {
      e.preventDefault(); // the button sits inside the option's <label>
      const p = ui.state.posts.find((x) => x.decisionId === t.dataset.captionOpen);
      const base = p?.options.find((o) => o.captionId === t.dataset.basedOn);
      if (!base) return;
      ui.editing[p.decisionId] = { basedOn: base.captionId };
      ui.drafts[`edit:${p.decisionId}`] = base.text;
      render(ui.state);
      const box = $(`ce-${p.decisionId}`);
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); box.scrollIntoView({ block: "center" }); }
      return;
    }
    if (t.dataset.captionCancel) {
      delete ui.editing[t.dataset.captionCancel];
      delete ui.drafts[`edit:${t.dataset.captionCancel}`];
      return render(ui.state);
    }
    if (t.dataset.captionSave) {
      const id = t.dataset.captionSave;
      const ed = ui.editing[id];
      if (!ed) return;
      t.disabled = true;
      const r = await post("/api/caption", { decisionId: id, basedOn: ed.basedOn, text: ui.drafts[`edit:${id}`] ?? "" });
      t.disabled = false;
      if (!r.ok) return alert(`${r.code}: ${r.detail ?? ""}`);
      delete ui.editing[id];
      delete ui.drafts[`edit:${id}`];
      ui.choice[id] = r.option.captionId;
      alert(r.next);
      return;
    }
    if (t.dataset.pub) {
      const a = t.dataset.pub;
      const body = { action: a };
      if (["schedule", "dry-run-now", "live-test"].includes(a)) body.decisionId = t.dataset.post;
      if (a === "schedule" && t.dataset.at) body.at = t.dataset.at;
      if (a === "schedule" && t.dataset.atFrom) {
        const v = ui.drafts[t.dataset.atFrom];
        if (!v) return alert("Pick a time first.");
        body.at = new Date(v).toISOString();
      }
      if (["cancel", "reconcile"].includes(a)) body.jobId = t.dataset.job;
      if (a === "ack") body.alertId = t.dataset.alert;
      if (a === "live-test") {
        if (!confirm(`Send ONE real post to X now?\n\n${t.dataset.title}\n\nIt spends X API credits. A macOS dialog will ask you to confirm again.`)) return;
        body.title = t.dataset.title;
      }
      if (a === "reconcile") {
        const url = prompt("Paste the X link if the post is on X. Leave empty and press OK if it is NOT on X.");
        if (url === null) return;
        if (url.trim()) body.url = url.trim(); else body.notPosted = true;
      }
      if (a === "policy-dry") { body.action = "policy"; body.mode = "dry-run"; }
      if (a === "publisher-host") {
        const words = `I hand live X publishing to the ${t.dataset.to} publisher`;
        const typed = prompt(`This stops live sending here immediately. To hand over, type exactly:\n\n${words}`);
        if (typed === null) return;
        Object.assign(body, { to: t.dataset.to, confirmation: typed });
      }
      if (a === "policy-test") {
        const cap = prompt("Monthly spend cap in US dollars for live TEST posts (1–25). Scheduled publishing stays a dry run:");
        if (!cap) return;
        const words = `I authorize live X test posts up to $${Number(cap)} per month`;
        const typed = prompt(`To authorize, type exactly:\n\n${words}`);
        if (typed === null) return;
        Object.assign(body, { action: "policy", mode: "test-only", capUsd: Number(cap), authorization: typed });
      }
      if (a === "policy-live") {
        const cap = prompt("Monthly spend cap in US dollars for scheduled live publishing (1–25):");
        if (!cap) return;
        const words = `I authorize live X publishing up to $${Number(cap)} per month`;
        const typed = prompt(`To authorize, type exactly:\n\n${words}`);
        if (typed === null) return;
        Object.assign(body, { action: "policy", mode: "live", capUsd: Number(cap), authorization: typed });
      }
      t.disabled = true;
      const r = await post("/api/publishing", body);
      t.disabled = false;
      if (a === "x-connect" && r.ok && r.authorizeUrl) { window.location.assign(r.authorizeUrl); return; }
      if (["dry-run-now", "live-test"].includes(a)) alert(r.state ? `${r.state}${r.code ? ` · ${r.code}` : ""}${r.detail ? ` — ${r.detail}` : ""}${r.canonicalUrl ? `\n${r.canonicalUrl}` : ""}` : `${r.code}: ${r.detail ?? ""}`);
      else if (!r.ok && !r.duplicate && r.state !== "HELD") alert(`${r.code}: ${r.detail ?? ""}`);
      return;
    }
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
      const captionId = ui.choice[p.decisionId] ?? p.package.imported?.cleanOf?.captionId ?? (p.options.filter((o) => o.source === "caption-edit" && o.check?.ok).at(-1) ?? p.options.find((o) => o.check?.ok))?.captionId;
      const opt = p.options.find((o) => o.captionId === captionId);
      if (!opt) return alert("Choose a caption that passes its check.");
      t.disabled = true;
      const r = await post("/api/decide", { decisionId: p.decisionId, verdict: "approve", captionId, digest: opt.digest,
        ...(p.package.kind === "x-reply" ? { sourcesConfirmed: Boolean(ui.drafts[`confirm:${p.decisionId}`]) } : {}),
        ...(p.package.kind === "td-top3" || (p.package.kind === "nba-game" && p.package.availabilityCheck?.length) ? { availabilityConfirmed: Boolean(ui.drafts[`avail:${p.decisionId}`]) } : {}) });
      const viaX = PUB_SCHEDULABLE.has(p.package.kind);
      if (r.ok && r.next) alert(viaX ? "Approved, not published. Nothing has been sent to X.\n\nNext: send it through the X publisher on this card — Live test post… (needs \"Authorize live test posts…\" first) or Schedule for its 45-minute slot (needs \"Authorize scheduled live publishing…\"). Every send re-checks the approval, both images, fresh data and tip-off first." : r.next);
      if (!r.ok && !r.duplicate) { t.disabled = false; alert(`${r.code}: ${r.detail ?? ""}`); }
      return;
    }
    if (t.dataset.importRun !== undefined) {
      const r = await post("/api/import/packages", {});
      if (!r.ok) return alert(`${r.code}: ${r.detail ?? ""}`);
      const bad = (r.results ?? []).filter((x) => x.outcome === "refused" || x.outcome === "held");
      alert(`${Object.entries(r.counts).map(([k, n]) => `${n} ${k}`).join(", ")}. ${r.images} image(s). Nothing was approved or scheduled.${bad.length ? `\n\n${bad.slice(0, 6).map((x) => `${x.dedupeId}: ${x.detail}`).join("\n")}` : ""}`);
      return;
    }
    if (t.dataset.ra) { const r = await post("/api/results-automation", { config: JSON.parse(t.dataset.ra) }); if (!r.ok) alert(`${r.code}: ${r.detail ?? ""}`); return; }
    if (t.dataset.raAuth) {
      const typed = prompt(`One-time authorization. Verified results will post without per-result approval. Type exactly:\n${t.dataset.raAuth}`);
      if (typed == null) return;
      const r = await post("/api/results-automation", { authorization: typed });
      if (!r.ok) alert(`${r.code}: ${r.detail ?? ""}`);
      return;
    }
    if (t.dataset.planApprove) {
      if (!confirm("Approve these proposed times? Nothing is scheduled: each post still needs its own approval and Schedule click.")) return;
      const r = await post("/api/content-plan", { digest: t.dataset.planApprove });
      if (!r.ok) alert(`${r.code}: ${r.detail ?? ""}`);
      return;
    }
    if (t.dataset.design) {
      const all = ui.state.design?.templates ?? [ui.state.design];
      const dz = all.find((x) => x.template === t.dataset.designTemplate) ?? ui.state.design;
      if (!confirm(`Approve the graphic design ${dz.template} (${dz.assetManifest})? This approves the visual design only — no post.`)) return;
      const r = await post("/api/design", { template: dz.template, assetManifest: dz.assetManifest });
      if (!r.ok && !r.duplicate) alert(`${r.code}: ${r.detail ?? ""}`);
      return;
    }
    if (t.dataset.revSubmit) {
      const id = t.dataset.revSubmit;
      const text = String(ui.drafts[`revt:${id}`] ?? "").trim();
      if (!text) return alert("Say what should change first.");
      const note = `[revision scope=${ui.drafts[`revs:${id}`] ?? "image"} type=${ui.drafts[`revk:${id}`] ?? "visual"} image=${ui.drafts[`revi:${id}`] ?? "all"}] ${text}`;
      const r = await post("/api/decide", { decisionId: id, verdict: "revise", note });
      if (!r.ok && !r.duplicate) return alert(`${r.code}: ${r.detail ?? ""}`);
      delete ui.drafts[`revt:${id}`];
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
    if (t.dataset.newCodes !== undefined) {
      if (!confirm("Make 10 new recovery codes? Every unused code you have now stops working. Your passkeys and sessions stay. Face ID / Touch ID confirms.")) return;
      try {
        const codes = await Auth.newRecoveryCodes();
        $("recovery-codes").textContent = codes.join("\n");
        return showAuth("New recovery codes. Your old ones no longer work.", "codes");
      } catch (err) { alert(`No new codes were made (${err.code ?? err.name}).`); }
      return;
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
    if (e.target.dataset.captionEdit) {
      const c = document.querySelector(`[data-caption-count="${CSS.escape(e.target.dataset.captionEdit)}"]`);
      if (c) { const n = xLen(e.target.value); c.textContent = `${n}/280 on X`; c.classList.toggle("over", n > 280); }
    }
  });
  document.addEventListener("focusout", (e) => {
    if (e.target.dataset?.captionEdit && ui.pendingRender) setTimeout(() => { if (!document.activeElement?.dataset?.captionEdit && ui.state) render(ui.state); }, 400); // after a Save/Cancel tap lands
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
    // an invite link: #invite=<token> — taken out of the address bar at once (never sent anywhere but the API)
    const inv = /^#invite=([A-Za-z0-9_-]{30,100})$/.exec(location.hash);
    if (inv) {
      history.replaceState(null, "", location.pathname);
      const info = await Auth.inviteInfo(inv[1]).catch(() => ({ ok: false }));
      if (info.ok) {
        ui.inviteToken = inv[1];
        $("invite-who").textContent = `Invitation for ${info.displayName} · role: ${info.role}. Expires ${new Date(info.expiresAt).toLocaleString()}.`;
        return showAuth("You've been invited to the GameTimePicks Command Center.", "invite");
      }
      return showAuth("This invite link is not valid any more (used, revoked or expired). Ask for a new one.", st.hasPasskey ? "login" : "setup");
    }
    if (st.authenticated) return signedIn();
    if (st.recovery) return showAuth("Recovery session: create a replacement passkey.", "recovered");
    showAuth(st.hasPasskey ? "Sign in with your passkey." : "First setup: enter the one-time setup token, then create your passkey.");
  })();
})();
