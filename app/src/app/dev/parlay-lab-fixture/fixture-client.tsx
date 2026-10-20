"use client";
/**
 * /dev/parlay-lab-fixture · the client half (DEV ONLY). Renders the REAL TierBoardView + SmartBetslip over fixture
 * models the server page built, with:
 *   · a fixed reader clock: the fixture NOW, or `?now=<ISO>` (so freshness bands — and expired-price hiding — are
 *     reproducible in a browser test);
 *   · `?scenario=none` for the no-qualified day;
 *   · a slip that is never persisted (the reader's real gtp.slip.v2 is untouched);
 *   · the fixture operator allowlist, received as DATA from the server and turned into a predicate here.
 * FIXTURE — not real picks, not real prices.
 */
import { useEffect, useMemo, useState } from "react";
import { TierBoardView, type ParlayLabV2Model } from "@/components/parlays/v2/TierBoard";
import { useSmartSlip } from "@/lib/slip/smart-slip-store";
import { makeOperatorPredicate } from "@/lib/parlays/v2/operators.mjs";
import { smartLegKey } from "@/lib/slip/smart-slip.mjs";

export interface AddableLeg {
  readonly id: string;
  readonly label: string;
  readonly leg: { readonly sport: string; readonly eventId: string; readonly game: string | null; readonly market: string; readonly selection: string; readonly line: number | null; readonly book: string; readonly price: number; readonly capturedAt: string };
}

export default function ParlayLabFixtureClient({ qualified, none, addable, allowedOperators, fixtureNow, label }: {
  qualified: ParlayLabV2Model;
  none: ParlayLabV2Model;
  addable: readonly AddableLeg[];
  allowedOperators: readonly string[];
  fixtureNow: string;
  label: string;
}) {
  const [params, setParams] = useState<{ nowMs: number; nowIso: string; scenario: "qualified" | "none" } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const asked = Date.parse(q.get("now") ?? "");
    const nowMs = Number.isFinite(asked) ? asked : Date.parse(fixtureNow);
    setParams({ nowMs, nowIso: new Date(nowMs).toISOString(), scenario: q.get("scenario") === "none" ? "none" : "qualified" });
  }, [fixtureNow]);

  const slipApi = useSmartSlip({ fixedNowMs: params?.nowMs ?? Date.parse(fixtureNow), persist: false });
  const isVerifiedOperator = useMemo(() => makeOperatorPredicate(allowedOperators), [allowedOperators]);
  const inSlip = new Set(slipApi.slip.legs.map((l) => l.key));

  return (
    <div className="flex flex-col gap-4" data-fixture-ready={params ? "1" : "0"} data-fixture-scenario={params?.scenario ?? ""}>
      <p role="note" data-fixture-banner className="m-0 rounded-[10px] px-3 py-2 font-mono uppercase tracking-[0.12em]"
        style={{ border: "1px solid var(--vault-warn)", color: "var(--vault-warn)", fontSize: 12, fontWeight: 700 }}>
        {label}
      </p>
      <p className="m-0 font-mono" data-fixture-clock={params?.nowIso ?? ""} style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
        Development fixture. Reader clock fixed at {params?.nowIso ?? fixtureNow} (set with ?now=). Scenario: {params?.scenario ?? "qualified"} (?scenario=none for a day with nothing qualifying). Nothing here is saved.
      </p>
      {params ? (
        <TierBoardView model={params.scenario === "none" ? none : qualified} slipApi={slipApi} isVerifiedOperator={isVerifiedOperator}>
          <section aria-labelledby="fixture-add-heading" className="flex flex-col gap-2" data-fixture-add>
            <h3 id="fixture-add-heading" className="m-0 font-display" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 800 }}>
              Fixture legs to add
            </h3>
            <ul className="flex flex-wrap gap-2 list-none m-0 p-0">
              {addable.map((a) => (
                <li key={a.id}>
                  <button type="button" className="vault-press rounded-full px-4" data-add-leg={a.id}
                    disabled={inSlip.has(smartLegKey(a.leg))}
                    style={{ minHeight: 44, border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)", background: "transparent", fontSize: 12, fontWeight: 600 }}
                    onClick={() => slipApi.add(a.leg)}>
                    {a.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </TierBoardView>
      ) : null}
    </div>
  );
}
