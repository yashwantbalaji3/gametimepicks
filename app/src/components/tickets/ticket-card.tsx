/**
 * TicketCard — the shared sportsbook-style paper slip container used across pick surfaces.
 * Lava/violet/gold top stripe, header (risk + sport + status pills, title, prominent odds price),
 * optional stake → projected return line, leg list (children), and an optional footer.
 * Pure presentation; all values passed in (no fabrication).
 */
import type { ReactNode } from "react";
import OddsPill, { type OddsTone } from "./odds-pill";
import StatusPill, { type TicketStatus } from "./status-pill";
import RiskPill from "./risk-pill";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TicketCard({
  title, subtitle, sport, risk, status, odds, oddsTone = "gold", stake, projectedReturn,
  accent = "lava", children, footer,
}: {
  title: string;
  subtitle?: string;
  sport?: string;
  risk?: string;
  status?: TicketStatus;
  odds?: number | null;
  oddsTone?: OddsTone;
  stake?: number;
  projectedReturn?: number;
  accent?: "lava" | "violet" | "gold";
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const stripe = accent === "violet" ? "#8b7bf0" : accent === "gold" ? "var(--vault-gold)" : "var(--gtp-bank-heat)";
  return (
    <div className="overflow-hidden rounded-xl" style={{ background: "var(--vault-surface, rgba(255,255,255,0.02))", border: "1px solid var(--vault-border)", borderTop: `2px solid ${stripe}` }}>
      <div className="flex flex-wrap items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {risk ? <RiskPill risk={risk} /> : null}
            {sport ? (
              <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)", fontSize: 9.5 }}>{sport}</span>
            ) : null}
            {status ? <StatusPill status={status} /> : null}
          </div>
          <div className="mt-1.5 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700, lineHeight: 1.15 }}>{title}</div>
          {subtitle ? <div className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>{subtitle}</div> : null}
        </div>
        {odds != null ? <div className="shrink-0"><OddsPill odds={odds} tone={oddsTone} size="lg" /></div> : null}
      </div>
      {(stake != null || projectedReturn != null) ? (
        <div className="px-4 pb-1 font-mono text-[12.5px]">
          {stake != null ? <span style={{ color: "var(--vault-text)" }}>{usd(stake)}</span> : null}
          {stake != null && projectedReturn != null ? <span style={{ color: "var(--vault-text-faint)" }}> → </span> : null}
          {projectedReturn != null ? <span style={{ color: stripe, fontWeight: 700 }}>{usd(projectedReturn)}</span> : null}
          <span className="ml-1.5 uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>projected</span>
        </div>
      ) : null}
      {children ? <div className="px-4 pb-1">{children}</div> : null}
      {footer ? <div className="px-4 py-3" style={{ borderTop: "1px solid var(--vault-border)" }}>{footer}</div> : null}
    </div>
  );
}
