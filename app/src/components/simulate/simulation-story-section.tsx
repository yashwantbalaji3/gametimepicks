/**
 * SimulationStorySection — the server-side mount for the inline story (P308). Renders the story when the adapter
 * built a manifest and a designed one-line state when it refused, with the refusal's own reason — an absent story is
 * honest; a blank space would leave the reader guessing whether something failed.
 */
import type { PresentationResult } from "@/lib/simulate/presentation/types";
import { isPresentable } from "@/lib/simulate/presentation/types";
import SimulationStory from "./simulation-story";

export default function SimulationStorySection({ manifest, id = "simulation-story" }: { manifest: PresentationResult | null | undefined; id?: string }) {
  if (!manifest) return null;
  if (!isPresentable(manifest)) {
    return (
      <p id={id} className="m-0 rounded-[10px] px-3 py-2 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5, border: "1px dashed var(--vault-rule)" }}>
        No simulation story for this event: {manifest.reason}
      </p>
    );
  }
  return (
    <div id={id} className="scroll-mt-24">
      <SimulationStory manifest={manifest} skipHref={`#${id}-end`} />
      {/* the "skip" target: the report continues right here, on this page, whatever the story is doing */}
      <div id={`${id}-end`} aria-hidden="true" />
    </div>
  );
}
