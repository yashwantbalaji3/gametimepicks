/**
 * SEAT REGISTRY — resolve a role's configured seat to something that can run, or refuse.
 *
 * Fails closed: a paid seat is refused by budget (policy.checkSeat) before its stub is even reached, and the stub
 * itself refuses. Phase 1 can therefore only run `fake`, `manual:*` and deterministic code.
 */
import { REASON } from "../contracts/index.mjs";
import { checkSeat } from "../orchestrator/policy.mjs";
import { fakeSeat } from "./fake.mjs";
import { manualSeat } from "./manual.mjs";
import { STUB_SEATS, stubSeat } from "./stubs.mjs";

export function resolveSeat(seat, { env = {}, spentUsd = 0 } = {}) {
  if (STUB_SEATS[seat]) {
    const budget = checkSeat(seat, { env, spentUsd });
    if (!budget.ok) return { ok: false, code: REASON.SEAT_NOT_ENABLED, detail: `${seat}: ${STUB_SEATS[seat].note}; enabled at ${STUB_SEATS[seat].enabledAt}. ${budget.detail}` };
    return { ok: true, runner: stubSeat(seat) };
  }
  if (seat === "fake") return { ok: true, runner: fakeSeat };
  if (seat.startsWith("manual:")) return { ok: true, runner: manualSeat(seat) };
  return { ok: false, code: REASON.SEAT_NOT_ENABLED, detail: `unknown seat ${seat}` };
}
