/* GTP CEO console — renders orchestrator.state() and sends founder actions. No framework, no external requests. */
(() => {
  "use strict";

  const SUGGESTIONS = [
    "Team, prepare GameTimePicks' NFL postgame recap content for last night's games. Identify content opportunities, draft graphics and captions, and report what needs my approval.",
    "Team, add a Copy caption button and a live 280-character counter to each caption in the Approvals card. Have ChatGPT write the engineering spec, have Claude Code plan and implement it in an isolated working copy, verify it independently, and show me the result before anything is kept.",
    "Team, what should our next product improvement be for the Results page?",
    "status",
    "Pause publishing",
  ];
  const STUB_SEATS = { "api:openai": "CP5", "api:anthropic": "CP5", "api:xai": "CP5", "mcp:chatgpt": "Phase 3", "mcp:claude": "Phase 3", "mcp:grok": "Phase 3" };
  const ROLE_ICON = {
    "chief-of-staff": "CoS", "prompt-architect": "PA", "product-strategist": "PS", "social-strategy": "SS",
    "engineering": "ENG", "integrity-reviewer": "IR", "creative-renderer": "CR", "publisher": "PUB", "growth-analyst": "GA", "verifier": "QA",
  };

  /** Phone views (≤760 px): one section at a time behind a bottom tab bar. Desktop shows everything at once. */
  const VIEWS = [
    { id: "chat", label: "Chat", ico: "◆" },
    { id: "decisions", label: "Approvals", ico: "✓" },
    { id: "tasks", label: "Tasks", ico: "≡" },
    { id: "history", label: "Activity", ico: "⟲" },
    { id: "team", label: "Team", ico: "☰" },
  ];
  const savedView = (() => { try { return localStorage.getItem("gtp-cc-view"); } catch { return null; } })();
  const ui = { last: "", choice: {}, drafts: {}, state: null, view: VIEWS.some((v) => v.id === savedView) ? savedView : "chat" };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
  const title = (role) => ui.state?.seats?.[role]?.title ?? role;

  async function post(url, body) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-CC-Console": "1" }, body: JSON.stringify(body ?? {}) });
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
        return `<div class="kv"><span>Slate</span><span>${esc(a.slateDate)}</span><span>Games gated</span><span>${a.gamesChecked}</span>
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
        <span>Tests (run by the orchestrator)</span><span>${t.ok ? `<span class="check-ok">passed</span>` : `<span class="check-bad">FAILED</span>`} · ${t.pass} pass · ${t.fail} fail · ${Math.round((t.durationMs ?? 0) / 1000)} s</span>
        <span>Your checkout</span><span>${a.checkoutUnchanged === false ? `<span class="check-bad">changed</span>` : `<span class="check-ok">unchanged</span>`}</span>
        <span>Working copy</span><span><code>${esc(a.workcopy?.dir)}</code> · ${esc(a.workcopy?.branch)}</span>
      </div>
      ${a.screenshots?.length ? `<div class="shots">${a.screenshots.map((x) => `<figure><img src="/media/${encodeURIComponent(x.file)}" alt="${esc(x.name)} screenshot of the changed console" data-zoom><figcaption>${esc(x.name)} · ${x.width}px${x.overflow > 0 ? ` · <span class="check-bad">overflow ${x.overflow}px</span>` : ""}</figcaption></figure>`).join("")}</div>` : ""}
      ${a.screenError ? `<div class="warns">Screenshots failed: ${esc(a.screenError)}</div>` : ""}
      ${t.failing?.length ? `<ul class="warns">${t.failing.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
      <details><summary>Diff (${(a.files ?? []).length} file(s))</summary><pre class="diff">${esc(a.diff || "(no changes)")}</pre></details>
      <details><summary>Test output</summary><pre>${esc(t.tail ?? "")}</pre></details>`;
  }

  function runLine(r, cost) {
    if (!r) return "";
    return `<div class="runline">Session <code>${esc(r.sessionId ?? "?")}</code> · ${esc(r.model ?? "")}${r.effort ? ` · effort ${esc(r.effort)}` : ""} · ${Math.round((r.durationMs ?? 0) / 1000)} s · ${r.numTurns ?? "?"} turns${r.lookups != null ? ` · ${r.lookups} file lookups` : ""} ·
      est. usage $${(cost?.estUsageUsd ?? 0).toFixed(2)} (API-equivalent, from your Max allowance; cash $0) ·
      tokens ${cost?.tokensIn ?? 0} in / ${cost?.tokensOut ?? 0} out · <a href="/${esc(r.rawLog)}" target="_blank" rel="noopener">raw log</a></div>`;
  }

  function contributionCard(c) {
    if (c.artifactType === "consolidated-report") return "";
    const cost = c.cost ? `$${c.cost.usd}` : "$0";
    return `<div class="msg">
      <div class="who"><span class="tag">${esc(ROLE_ICON[c.role] ?? "")}</span><b>${esc(title(c.role))}</b>${seatTag(c.seat, c.simulated)}
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
          <div class="muted">${esc(d.template)} · ${d.width}×${d.height} · sha256 ${esc(d.sha256.slice(0, 12))}…</div>
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
      ${r.usage ? `<div class="section">Claude Code usage</div><div class="body">${r.usage.claudeRuns} run(s) · ${r.usage.durationS} s · est. $${r.usage.estUsageUsd.toFixed(2)} of your Max allowance. ${esc(r.usage.note)}</div>` : ""}
      ${r.cost ? `<div class="section">Cost</div><div class="body">$${r.cost.usd} · ${esc(r.cost.note ?? "")}</div>` : ""}
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
          <div class="body">Here is how the team will handle this. Limits: ≤${c.plan.limits.maxHops} delegation hops, ≤${c.plan.limits.maxTasks} tasks, $${c.plan.limits.budgetUsd} budget.</div>
          <ul class="plan">${c.plan.steps.map((st) => `<li><span class="n">${st.n}</span><span><b>${esc(st.roleTitle)}</b> — ${esc(st.title)} <span class="tag ${st.seat.startsWith("manual:") ? "seat-manual" : ""}">seat ${esc(st.seat)}</span>${st.via ? ` <span class="muted">(handed over by ${esc(st.via)})</span>` : ""}</span></li>`).join("")}</ul></div>`);
      }
      const captions = c.deliverables.find((d) => d.kind === "captions");
      const events = [
        ...c.contributions.map((x) => ({ at: x.at, html: contributionCard(x) })),
        ...c.refusals.map((x) => ({ at: x.at, html: `<div class="msg refusal"><div class="who"><b>${x.decisionId ? "Publisher" : "Orchestrator"}</b><span class="tag" style="color:var(--warn)">${esc(x.code)}</span><span>${time(x.at)}</span></div>
          <div class="body">${x.decisionId ? `Publisher refused to send the approved draft: ${esc(x.detail)}. Nothing left this machine.` : x.fromRole ? `${esc(title(x.fromRole))} proposed handing work to ${esc(title(x.toRole))}${x.proposal ? ` (“${esc(x.proposal)}”)` : ""}. Refused: ${esc(x.detail)}. It goes into the report for you instead.` : esc(x.detail)}</div>
          ${runLine(x.run, x.cost)}
          ${x.partialOutput ? `<details><summary>Partial output — diagnostic only (${x.partialOutput.attempts} attempt(s), last one ${x.partialOutput.schemaValid ? "matched the schema" : "did not match the schema"})</summary>
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

  const isOpen = (d) => (d.kind === "gate" ? !d.resolution : !d.receipt && d.resolution?.verdict !== "reject");

  function gateSubject(d) {
    const x = d.subject ?? {};
    if (d.subjectType === "engineering-spec") return `<div class="body"><b>Objective.</b> ${esc(x.objective)}</div>${list("Acceptance criteria", x.acceptanceCriteria)}${list("Files in scope", x.filesInScope)}`;
    if (d.subjectType === "implementation-plan") return `<div class="body">${esc(x.plan?.summary)}</div><div class="section muted">Files</div><ul>${(x.plan?.files ?? []).map((f) => `<li><code>${esc(f.path)}</code> — ${esc(f.change)}</li>`).join("")}</ul>${list("Risks", x.plan?.risks)}`;
    if (d.subjectType === "verification") {
      const shots = ui.state.commands.flatMap((c) => c.contributions).filter((c) => c.artifactType === "verification").at(-1)?.artifact;
      return `<div class="body">Branch <code>${esc(x.branch)}</code> · ${(x.files ?? []).length} file(s): ${(x.files ?? []).map((f) => `<span class="${f.inScope ? "check-ok" : "check-bad"}">${esc(f.file)}</span>`).join(", ")}</div>
        ${shots ? `<div class="kv"><span>Tests</span><span>${shots.tests?.ok ? `<span class="check-ok">passed (${shots.tests.pass})</span>` : `<span class="check-bad">FAILED (${shots.tests?.fail})</span>`}</span></div>` : ""}
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

  function renderDecisions(s) {
    const items = s.decisions.slice().reverse();
    const open = items.filter(isOpen).length;
    if (!items.length) return `<h2>Decisions <span class="count">0</span></h2><div class="muted">Nothing needs you yet.</div>`;
    return `<h2>Decisions <span class="count">${open} open</span></h2>` + items.map((d) => {
      if (d.kind === "gate") return gateCard(d);
      const chosen = ui.choice[d.decisionId] ?? d.resolution?.captionId ?? d.recommended;
      const decided = d.resolution;
      return `<div class="decision">
        <div class="q">${esc(d.question)}</div>
        <img src="/media/${encodeURIComponent(d.media.file)}" alt="${esc(d.media.altText)}" data-zoom>
        ${d.options.map((o) => `<label class="option ${chosen === o.captionId ? "selected" : ""}">
          <input type="radio" name="opt-${esc(d.decisionId)}" value="${esc(o.captionId)}" ${chosen === o.captionId ? "checked" : ""} ${decided ? "disabled" : ""} data-choose="${esc(d.decisionId)}">
          <div><div class="txt">${esc(o.text)}</div>
          <div class="meta">${decided?.captionId === o.captionId && decided.verdict === "approve" ? `<b class="check-ok">APPROVED</b> · ` : ""}Caption ${esc(o.captionId)} · ${esc(o.tone)}${d.recommended === o.captionId ? " · recommended" : ""} · ${o.check?.ok ? "validator ✓" : "validator ✗"} · digest ${esc(o.digest.slice(0, 12))}…</div></div>
        </label>`).join("")}
        ${(d.warnings ?? []).length ? `<ul class="warns">${d.warnings.map((w) => `<li>${esc(w.code)}: ${esc(w.detail)}</li>`).join("")}</ul>` : ""}
        <div class="muted">${esc(d.note)}</div>
        ${d.receipt ? `<div class="receipt">✓ ${esc(d.receipt.state)} via ${esc(d.receipt.provider)} · ${esc(d.receipt.providerPostId)}<br>caption ${esc(d.resolution?.captionId)} · approved ${esc(time(d.resolution?.approvedAt))} · cost $${d.receipt.costUsd}<br>digest ${esc(d.receipt.bundleDigest.slice(0, 16))}…</div>`
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
        <span>Running now</span><span>${e.activeRuns?.length ? e.activeRuns.map((r) => `pid ${r.pid}`).join(", ") : "none"}</span>
        <span>Usage so far</span><span>${e.claudeUsage?.runs ?? 0} run(s) · ${Math.round((e.claudeUsage?.durationMs ?? 0) / 1000)} s · est. $${(e.claudeUsage?.estUsageUsd ?? 0).toFixed(2)} of your allowance · cash $0</span>
        <span>Limits</span><span>plan ${esc(e.limits?.plan)} · build ${esc(e.limits?.build)} · ${esc(e.limits?.perCommand)} per command</span>
      </div>
      ${b ? "" : `<div class="attest">
        <div class="muted">Open claude.ai → Settings → Usage. Confirm usage credits (extra usage) are off, or capped. Then record it here:</div>
        <div class="row" style="margin-top:6px"><button class="btn small primary" data-attest="off">Usage credits are OFF</button>
          <input id="cap-usd" type="number" min="0" step="1" placeholder="$ cap" aria-label="Monthly cap in dollars" style="width:90px">
          <button class="btn small" data-attest="capped">Capped at this amount</button></div></div>`}
      <div class="row" style="margin-top:8px"><button class="btn small" data-preflight>Run preflight now</button></div>
    </div>`;
  }

  function renderControls(s) {
    const pct = s.budget.limitUsd > 0 ? Math.min(100, (100 * s.budget.spentUsd) / s.budget.limitUsd) : 0;
    return `<h2>Controls</h2>
      <div class="switch"><div><b>Publishing</b><div class="muted">${s.paused ? "Paused: every send is refused at the boundary." : "Enabled — mock publisher only."}</div></div>
        <button class="btn ${s.paused ? "primary" : "danger"} small" data-pause="${s.paused ? "0" : "1"}">${s.paused ? "Resume" : "Pause all"}</button></div>
      <div class="kv"><span>Budget</span><span>$${s.budget.spentUsd} of $${s.budget.limitUsd}${s.budget.limitUsd === 0 ? " · paid seats locked" : ""}</span>
        <span>Publisher</span><span>${esc(s.publisher.name)} · network ${s.publisher.network ? "yes" : "none"}</span>
        <span>Mode</span><span>${esc(s.phase)}</span></div>
      <div class="meter"><i style="width:${pct}%"></i></div>
      <div class="row" style="margin-top:10px"><button class="btn small" data-reset>Reset demo</button></div>
      ${renderClaude(s)}`;
  }

  function renderTeam(s) {
    const rows = Object.entries(s.seats).map(([role, r]) => {
      if (r.seat === "deterministic") return `<div class="team-row"><span>${esc(r.title)}</span><span class="tag det">deterministic</span></div>`;
      const opts = [...r.options.map((o) => `<option value="${esc(o)}" ${o === r.seat ? "selected" : ""}>${esc(o)}</option>`),
        ...Object.entries(STUB_SEATS).map(([o, cp]) => `<option value="${esc(o)}" disabled>${esc(o)} · ${esc(cp)}</option>`)].join("");
      return `<div class="team-row"><span>${esc(r.title)}</span><select data-seat="${esc(role)}" aria-label="Seat for ${esc(r.title)}">${opts}</select></div>`;
    }).join("");
    return `<h2>Team seats</h2>${rows}<div class="muted" style="margin-top:6px">manual:* = you paste the prompt into your own ChatGPT/Claude/Grok. API and MCP seats unlock at CP5 / Phase 3.</div>`;
  }

  function renderTasks(s) {
    const c = s.commands.at(-1);
    if (!c) return `<h2>Tasks</h2><div class="muted">No command yet.</div>`;
    return `<h2>Tasks <span class="count">${c.tasks.length}</span></h2>` + c.tasks.map((t) =>
      `<div class="task"><span class="status ${esc(t.status)}">${esc(t.status)}</span><span>${esc(title(t.ownerRole))} <span class="muted">hop ${t.hop}</span></span><span class="muted">${esc(t.seat)}</span></div>`).join("");
  }

  function renderHistory(s) {
    return `<h2>Action history <span class="count">${s.history.length}</span></h2><div class="hist">${s.history.slice().reverse().map((h) =>
      `<div><span class="t">${time(h.at)}</span>${esc(h.line)}</div>`).join("")}</div>`;
  }

  function renderBadges(s) {
    return [
      `<span class="badge ok">dry run</span>`,
      `<span class="badge ${s.budget.limitUsd === 0 ? "ok" : "warn"}">budget $${s.budget.limitUsd}</span>`,
      `<span class="badge ok">publisher: ${esc(s.publisher.name)}</span>`,
      s.paused ? `<span class="badge danger">publishing paused</span>` : `<span class="badge">publishing enabled (mock)</span>`,
      `<span class="badge warn">demo-grade approvals</span>`,
    ].join("");
  }

  function renderTabbar(s) {
    const open = s.decisions.filter(isOpen).length;
    const c = s.commands.at(-1);
    const active = c ? c.tasks.filter((t) => ["QUEUED", "RUNNING", "AWAITING_INPUT"].includes(t.status)).length : 0;
    const dots = { decisions: open, tasks: active };
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
    $("decisions").innerHTML = renderDecisions(s);
    $("controls").innerHTML = renderControls(s);
    $("team").innerHTML = renderTeam(s);
    $("tasks").innerHTML = renderTasks(s);
    $("history").innerHTML = renderHistory(s);
    if (atBottom) thread.scrollTop = thread.scrollHeight;
  }

  async function poll() {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const text = await res.text();
      if (text !== ui.last) {
        ui.last = text;
        ui.state = JSON.parse(text);
        render(ui.state);
      }
    } catch { /* server restarting; try again */ }
    setTimeout(poll, 700);
  }

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
    const t = e.target.closest("[data-chip],[data-approve],[data-reject],[data-pause],[data-reset],[data-copy],[data-submit],[data-zoom],[data-tab],[data-goto],[data-gate],[data-attest],[data-preflight],[data-stop],.lightbox");
    if (!t) return;
    if (t.dataset.gate) {
      const d = ui.state.decisions.find((x) => x.decisionId === t.dataset.gate);
      t.disabled = true;
      const r = await post("/api/decide", { decisionId: d.decisionId, verdict: t.dataset.verdict, digest: d.subjectDigest });
      if (!r.ok && !r.duplicate) alert(`${r.code}: ${r.detail ?? ""}`);
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
      box.innerHTML = `<img src="${t.getAttribute("src")}" alt="${esc(t.getAttribute("alt"))}">`;
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
    if (t.dataset.copy) {
      const text = document.getElementById(`prompt-${t.dataset.copy}`)?.textContent ?? "";
      try { await navigator.clipboard.writeText(text); t.textContent = "Copied"; } catch { t.textContent = "Select and copy the prompt above"; }
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
    if (e.target.dataset.choose) {
      ui.choice[e.target.dataset.choose] = e.target.value;
      render(ui.state);
    }
    if (e.target.dataset.seat) post("/api/seat", { role: e.target.dataset.seat, seat: e.target.value });
  });

  setView(ui.view);
  poll();
})();
