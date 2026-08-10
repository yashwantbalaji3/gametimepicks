"use client";

/**
 * /launch work-board filters (Program 155 · Release C) — PRESENTATION ONLY.
 *
 * The board stays a pure function of committed receipts; this component filters the already-
 * generated cards in the browser and can mutate NOTHING — no network writes, no storage writes —.
 * Keyboard: every filter is a real <button> with visible focus; Reset restores everything; a
 * zero-results state says which filters caused it instead of rendering an empty void.
 */
import { useMemo, useState } from "react";

export interface BoardTicket {
  id: string; title: string; sport: string; department: string;
  priority: "P0" | "P1" | "P2"; owner: string; state: string;
  sinceProgram?: string | null; evidence?: string | null; blocker?: string | null;
  nextAction: string; acceptance: string; horizon?: string;
}

const STATES = ["IN_PROGRESS", "READY", "NEW", "BLOCKED"] as const;

export default function BoardFilters({ tickets }: { tickets: BoardTicket[] }) {
  const [sport, setSport] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);

  const sports = useMemo(() => [...new Set(tickets.map((t) => t.sport))].sort(), [tickets]);
  const departments = useMemo(() => [...new Set(tickets.map((t) => t.department))].sort(), [tickets]);

  const filtered = tickets.filter((t) =>
    (sport == null || t.sport === sport) &&
    (department == null || t.department === department) &&
    (priority == null || t.priority === priority));

  const active = [sport && `sport=${sport}`, department && `dept=${department}`, priority && priority].filter(Boolean).join(" · ");
  const chip = (label: string, on: boolean, toggle: () => void) => (
    <button
      key={label}
      onClick={toggle}
      aria-pressed={on}
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
        {sports.map((s) => chip(s, sport === s, () => setSport(sport === s ? null : s)))}
        <span aria-hidden style={{ color: "var(--vault-border-strong)" }}>|</span>
        {departments.map((d) => chip(d, department === d, () => setDepartment(department === d ? null : d)))}
        <span aria-hidden style={{ color: "var(--vault-border-strong)" }}>|</span>
        {(["P0", "P1", "P2"] as const).map((p) => chip(p, priority === p, () => setPriority(priority === p ? null : p)))}
        <button
          onClick={() => { setSport(null); setDepartment(null); setPriority(null); }}
          style={{ font: "inherit", fontSize: 11.5, padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--vault-border)", background: "transparent", color: "var(--vault-text-faint)" }}
        >
          Reset
        </button>
        <span style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>
          {filtered.length}/{tickets.length} cards{active ? ` · ${active}` : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>
          No cards match {active || "these filters"} — clear a filter or Reset. (Zero matches means the filter combination, never hidden work.)
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
          {STATES.map((state) => {
            const cards = filtered.filter((t) => t.state === state);
            return (
              <div key={state} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px" }}>
                <h3 style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.08em", color: state === "BLOCKED" ? "var(--vault-danger)" : "var(--vault-text-mute)", margin: "0 0 8px" }}>
                  {state.replace("_", " ")} · {cards.length}
                </h3>
                {cards.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--vault-text-faint)", margin: 0 }}>empty under current filters</p>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                    {cards.map((t) => (
                      <li key={t.id} style={{ borderTop: "1px solid var(--vault-rule)", paddingTop: 8 }}>
                        <details>
                          <summary style={{ cursor: "pointer", fontSize: 12.5 }}>
                            <span style={{ color: t.priority === "P0" ? "var(--vault-danger)" : "var(--vault-text-mute)", fontFamily: "monospace", fontSize: 11 }}>{t.priority}</span>{" "}
                            {t.title}
                          </summary>
                          <div style={{ fontSize: 11.5, color: "var(--vault-text-mute)", marginTop: 6, display: "grid", gap: 3 }}>
                            <span style={{ fontFamily: "monospace", color: "var(--vault-text-faint)" }}>{t.id} · {t.sport} · {t.department}{t.sinceProgram ? ` · since P${t.sinceProgram}` : ""}</span>
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
