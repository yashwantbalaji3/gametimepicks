"use client";
/**
 * BuildMyCardProvider — ephemeral client state for the "Build My Card"
 * flow on /parlay-lab.
 *
 * Holds the ordered list of selected ParlaySlips (deduped by slipId)
 * plus the toggle/remove/clear actions. State is in-memory only — no
 * localStorage, no auth, no persistence on day one (see design doc §4.1
 * + §9 open question 1). A refresh clears the card; that's intentional
 * for the prototype.
 *
 * The context ships with a no-op default value so components that read
 * it OUTSIDE a provider (e.g. ParlayTicketCard rendered on /results)
 * still work — they just see an empty, disabled selection. That keeps
 * the selection affordance strictly opt-in: only surfaces wrapped in
 * this provider AND passed `selectable` light up.
 *
 * All state transitions delegate to the pure helpers in
 * `@/lib/selected-slips` so the logic stays unit-tested.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ParlaySlip } from "@/lib/parlay-suggested";
import {
  clearSlips,
  deselectSlip,
  isSlipSelected,
  toggleSlip,
} from "@/lib/selected-slips";

export interface BuildMyCardValue {
  /** Whether a real provider is mounted. False for the no-op default. */
  enabled: boolean;
  /** Selected slips in selection order (newest last). */
  selected: ParlaySlip[];
  /** Number of selected slips. */
  count: number;
  isSelected: (slipId: string) => boolean;
  /** Add when absent / remove when present. Deduped by slipId. */
  toggle: (slip: ParlaySlip) => void;
  /** Remove a slip by id. */
  remove: (slipId: string) => void;
  /** Clear the whole selection. */
  clearAll: () => void;
}

const NOOP_VALUE: BuildMyCardValue = {
  enabled: false,
  selected: [],
  count: 0,
  isSelected: () => false,
  toggle: () => {},
  remove: () => {},
  clearAll: () => {},
};

const BuildMyCardContext = createContext<BuildMyCardValue>(NOOP_VALUE);

export function BuildMyCardProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ParlaySlip[]>([]);

  const toggle = useCallback((slip: ParlaySlip) => {
    setSelected((prev) => toggleSlip(prev, slip));
  }, []);

  const remove = useCallback((slipId: string) => {
    setSelected((prev) => deselectSlip(prev, slipId));
  }, []);

  const clearAll = useCallback(() => {
    setSelected(clearSlips());
  }, []);

  const isSelected = useCallback(
    (slipId: string) => isSlipSelected(selected, slipId),
    [selected],
  );

  const value = useMemo<BuildMyCardValue>(
    () => ({
      enabled: true,
      selected,
      count: selected.length,
      isSelected,
      toggle,
      remove,
      clearAll,
    }),
    [selected, isSelected, toggle, remove, clearAll],
  );

  return (
    <BuildMyCardContext.Provider value={value}>
      {children}
    </BuildMyCardContext.Provider>
  );
}

/** Read the Build My Card selection. Safe to call outside a provider —
 *  returns the disabled no-op value in that case. */
export function useBuildMyCard(): BuildMyCardValue {
  return useContext(BuildMyCardContext);
}
