"use client";
/**
 * The "Advanced" explorer on /build/custom, loaded on first open (P257).
 *
 * The explorer used to be rendered into the page — every eligible leg twice over (server markup + client
 * payload) inside a collapsed disclosure — so the page grew with every game on the slate. It now fetches
 * its data the first time the reader opens it. The count is stated before loading, a failure says so and
 * offers a retry, and the explorer itself is unchanged.
 */
import { useCallback, useRef, useState, type ComponentProps } from "react";
import ParlaysExplorer from "@/components/parlays/parlays-explorer";

export const EXPLORER_SLATE_URL = "/data/build/explorer-slate.json";

type ExplorerProps = ComponentProps<typeof ParlaysExplorer>;
type LoadState = "idle" | "loading" | "ready" | "error";

export default function LazyParlaysExplorer({ eligibleCount }: { eligibleCount: number }) {
  const [state, setState] = useState<LoadState>("idle");
  const [data, setData] = useState<ExplorerProps | null>(null);
  const started = useRef(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(EXPLORER_SLATE_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body?.slate) throw new Error("no slate in the explorer file");
      setData({ slate: body.slate, coverage: body.coverage ?? undefined });
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  return (
    <details
      className="rounded-xl"
      style={{ border: "1px solid var(--vault-border)", background: "var(--vault-wash-faint)" }}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && !started.current) {
          started.current = true;
          void load();
        }
      }}
    >
      <summary className="cursor-pointer select-none px-4 py-3 text-[13px]" style={{ color: "var(--vault-text-mute)", minHeight: 44 }}>
        Advanced — card-builder coverage &amp; the full eligible-leg pool ({eligibleCount} {eligibleCount === 1 ? "leg" : "legs"}, by risk). Tap to expand.
      </summary>
      <div className="px-1 pb-2 pt-1">
        {state === "idle" || state === "loading" ? (
          <p role="status" className="px-3 py-3 text-[13px]" style={{ margin: 0, color: "var(--vault-text-mute)" }}>
            Loading the full eligible-leg pool…
          </p>
        ) : null}
        {state === "error" ? (
          <div role="alert" className="px-3 py-3 flex flex-wrap items-center gap-3 text-[13px]" style={{ color: "var(--vault-text)" }}>
            <span>The eligible-leg pool didn&rsquo;t load. The builder above still has every leg.</span>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md px-3 py-2"
              style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)", minHeight: 44 }}
            >
              Try again
            </button>
          </div>
        ) : null}
        {state === "ready" && data ? <ParlaysExplorer slate={data.slate} coverage={data.coverage} /> : null}
      </div>
    </details>
  );
}
