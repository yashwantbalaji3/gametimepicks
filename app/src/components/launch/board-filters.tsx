"use client";

/**
 * /launch work-board filters (Program 155 · Release C; URL-state Program 167 · Release B) —
 * PRESENTATION ONLY.
 *
 * The board stays a pure function of committed receipts; this component filters the already-
 * generated cards in the browser and can mutate NOTHING — no network writes, no storage writes.
 * Filters are URL STATE (?sport=&dept=&priority=&state=&q=&ticket=), so a filtered view is a
 * stable deep link an operator can share; closing work still requires source receipts. The URL is
 * read once after mount (static export — the server render carries no filter state, so hydration
 * cannot mismatch) and written with replaceState (no history spam).
 * Keyboard: every filter is a real <button>/<input> with visible focus; Reset restores everything;
 * a zero-results state says which filters caused it instead of rendering an empty void.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export interface BoardTicket {
  id: string; title: string; sport: string; department: string;
  priority: "P0" | "P1" | "P2"; owner: string; state: string;
  sinceProgram?: string | null; evidence?: string | null; blocker?: string | null;
  nextAction: string; acceptance: string; horizon?: string;
}

const STATES = ["IN_PROGRESS", "READY", "NEW", "BLOCKED", "REALITY_GATED"] as const;
const PARAM_KEYS = ["sport", "dept", "priority", "state", "q", "ticket"] as const;

export default function BoardFilters({ tickets }: { tickets: BoardTicket[] }) {
  const [sport, setSport] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const hydratedFromUrl = useRef(false);

  // Read the deep link once after mount; write it back on every change thereafter.
  useEffect(() => {
    if (!hydratedFromUrl.current) {
      hydratedFromUrl.current = true;
      const p = new URLSearchParams(window.location.search);
      if (p.get("sport")) setSport(p.get("sport"));
      if (p.get("dept")) setDepartment(p.get("dept"));
      if (p.get("priority")) setPriority(p.get("priority"));
      if (p.get("state")) setState(p.get("state"));
      if (p.get("q")) setQ(p.get("q") ?? "");
      if (p.get("ticket")) setTicket(p.get("ticket"));
      return;
    }
    const p = new URLSearchParams(window.location.search);
    const next: Record<string, string | null> = { sport, dept: department, priority, state, q: q || null, ticket };
    for (const k of PARAM_KEYS) {
      if (next[k]) p.set(k, String(next[k]));
      else p.delete(k);
    }
    const qs = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, [sport, department, priority, state, q, ticket]);

  const sports = useMemo(() => [...new Set(tickets.map((t) => t.sport))].sort(), [tickets]);
  const departments = useMemo(() => [...new Set(tickets.map((t) => t.department))].sort(), [tickets]);

  const needle = q.trim().toLowerCase();
  const filtered = tickets.filter((t) =>
    (sport == null || t.sport === sport) &&
    (department == null || t.department === department) &&
    (priority == null || t.priority === priority) &&
    (state == null || t.state === state) &&
    (ticket == null || t.id === ticket) &&
    (needle === "" || t.title.toLowerCase().includes(needle) || t.id.toLowerCase().includes(needle) ||
      (t.nextAction ?? "").toLowerCase().includes(needle) || (t.blocker ?? "").toLowerCase().includes(needle)));

  const active = [sport && `sport=${sport}`, department && `dept=${department}`, priority && priority, state && state, ticket && `ticket=${ticket}`, needle && `“${q.trim()}”`].filter(Boolean).join(" · ");
  const chip = (label: string, on: boolean, toggle: () => void) => (
    <button
      key={label}
      onClick={toggle}
      aria-pressed={on}
      className="lc-chip"
      style={{
        font: "inherit", fontSize: 11.5, padding: "3px 10px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-border-strong)"}`,
        background: on ? "rgba(255, 205, 112, 0.12)" : "transparent",
        color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div role="group" aria-label="Work-board filters" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 10 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--vault-text-mute)" }}>
          <span className="sr-only">Search cards</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search title · id · action · blocker"
            className="lc-chip"
            style={{ font: "inherit", fontSize: 11.5, padding: "3px 10px", borderRadius: 999, border: "1px solid var(--vault-border-strong)", background: "transparent", color: "var(--vault-text)", minWidth: 210 }}
          />
        </label>
        <span aria-hidden style={{ color: "var(--vault-border-strong)" }}>|</span>
        {sports.map((s) => chip(s, sport === s, () => setSport(sport === s ? null : s)))}
        <span aria-hidden style={{ color: "var(--vault-border-strong)" }}>|</span>
        {departments.map((d) => chip(d, department === d, () => setDepartment(department === d ? null : d)))}
        <span aria-hidden style={{ color: "var(--vault-border-strong)" }}>|</span>
        {(["P0", "P1", "P2"] as const).map((p) => chip(p, priority === p, () => setPriority(priority === p ? null : p)))}
        <span aria-hidden style={{ color: "var(--vault-border-strong)" }}>|</span>
        {STATES.map((s) => chip(s.replace(/_/g, " "), state === s, () => setState(state === s ? null : s)))}
        <button
          onClick={() => { setSport(null); setDepartment(null); setPriority(null); setState(null); setQ(""); setTicket(null); }}
          className="lc-chip"
          style={{ font: "inherit", fontSize: 11.5, padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--vault-border)", background: "transparent", color: "var(--vault-text-faint)" }}
        >
          Reset
        </button>
        <span style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }} aria-live="polite">
          {filtered.length}/{tickets.length} cards{active ? ` · ${active}` : ""} — the URL is this view&apos;s deep link
        </span>
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
          No cards match {active || "these filters"} — clear a filter or Reset. (Zero matches means the filter combination, never hidden work.)
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
          {STATES.map((st) => {
            const cards = filtered.filter((t) => t.state === st);
            if (state != null && state !== st) return null;
            return (
              <div key={st} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px" }}>
                <h3 style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.08em", color: st === "BLOCKED" ? "var(--vault-danger)" : "var(--vault-text-mute)", margin: "0 0 8px" }}>
                  {st.replace(/_/g, " ")} · {cards.length}
                </h3>
                {cards.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--vault-text-faint)", margin: 0 }}>empty under current filters</p>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                    {cards.map((t) => (
                      <li key={t.id} style={{ borderTop: "1px solid var(--vault-rule)", paddingTop: 8 }}>
                        <details open={ticket === t.id || undefined}>
                          <summary style={{ cursor: "pointer", fontSize: 12.5 }}>
                            <span style={{ color: t.priority === "P0" ? "var(--vault-danger)" : "var(--vault-text-mute)", fontFamily: "monospace", fontSize: 11 }}>{t.priority}</span>{" "}
                            {t.title}
                          </summary>
                          <div style={{ fontSize: 11.5, color: "var(--vault-text-mute)", marginTop: 6, display: "grid", gap: 3 }}>
                            <span style={{ fontFamily: "monospace", color: "var(--vault-text-faint)" }}>
                              <button
                                onClick={() => setTicket(ticket === t.id ? null : t.id)}
                                aria-pressed={ticket === t.id}
                                title={ticket === t.id ? "clear the ticket deep link" : "pin this ticket into the URL as a deep link"}
                                className="lc-chip"
                                style={{ font: "inherit", fontSize: 11, padding: "0 6px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--vault-border)", background: ticket === t.id ? "rgba(255,205,112,0.12)" : "transparent", color: "inherit" }}
                              >
                                {t.id}
                              </button>{" "}
                              · {t.sport} · {t.department}{t.sinceProgram ? ` · since P${t.sinceProgram}` : ""}{t.horizon ? ` · ${t.horizon}` : ""}
                            </span>
                            {t.blocker ? <span>Blocker: {t.blocker}</span> : null}
                            <span>Next: {t.nextAction}</span>
                            <span>Accept: {t.acceptance}</span>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
