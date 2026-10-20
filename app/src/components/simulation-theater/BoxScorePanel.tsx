"use client";
/**
 * Simulation Theater V2 · projected box score dialog (island only).
 *
 * Opened from the transport ("Projected box score", any time — no need to watch to the end) and from the FINAL card
 * ("View projected box score"). A modal dialog on wide screens and a bottom sheet at ≤720 px, both through the shared
 * BottomSheet (role=dialog, aria-modal, useDialogFocus: focus in, Tab contained, Escape closes, focus returned to the
 * opener). Team tabs use the product's shared useRovingTabs model.
 *
 * The numbers are lib/simulation-theater/box-score.mjs `nflBoxScore(sample, manifest)` for the run that is selected,
 * the SAME object the server-rendered table renders. If any invariant fails the dialog says "Box score unavailable" with
 * the reason (fail closed) and shows no table.
 */
import { useId, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import BottomSheet from "./BottomSheet";
import type { Palette, Side } from "./FieldScene";
import type { TheaterManifest, TheaterSample } from "./types";
import { BoxHeader, Composition, PeriodTable, PlayerSections, Provenance, TeamCategoryTable, Watermark } from "./BoxScoreTable";
import type { BoxScore } from "./BoxScoreTable";
import { Unavailable } from "./parts";
import { BOX_SCORE_TITLE, safeNflBoxScore } from "@/lib/simulation-theater/box-score.mjs";
import { useRovingTabs } from "@/components/a11y/use-roving-tabs";

const SIDES: readonly Side[] = ["away", "home"];

function BoxScoreBody({ box, palette }: { box: BoxScore; palette: Palette }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [side, setSide] = useState<Side>("away");
  const tabs = useRovingTabs<Side>({ keys: SIDES, active: side, onChange: setSide, idBase: `${uid}-bx` });
  const team = palette.mode === "team";
  return (
    <div className="stbx stbx-dialog" data-stbx-dialog="" data-stbx-run={box.header.runIndex}>
      <Watermark />
      <BoxHeader box={box} />
      <PeriodTable box={box} />
      <div className="stbx-tabs" {...tabs.listProps} aria-label="Team">
        {SIDES.map((s) => (
          <button
            key={s}
            {...tabs.tabProps(s)}
            className={`stbx-tab${team ? " is-team" : ""}`}
            data-stbx-tab={s}
            data-sheet-initial={s === side ? "" : undefined}
            style={{ "--st-team": palette[s].accent } as CSSProperties}
          >
            <span className="stbx-tabbar" aria-hidden="true" />
            {box.header.teams[s].abbr}
            <span className="stbx-tabscore">{box.header.final[s]}</span>
          </button>
        ))}
      </div>
      <div className="stbx-panel" {...tabs.panelProps(side)}>
        <TeamCategoryTable box={box} side={side} idBase={uid} />
      </div>
      <PlayerSections box={box} />
      <Composition box={box} />
      <Provenance box={box} />
    </div>
  );
}

export default function BoxScoreDialog({ open, onClose, manifest, sample, palette }: {
  open: boolean; onClose: () => void; manifest: TheaterManifest; sample: TheaterSample; palette: Palette;
}) {
  const res = useMemo(() => (open ? safeNflBoxScore(sample, manifest) : null), [open, sample, manifest]);
  return (
    <BottomSheet open={open} title={`${BOX_SCORE_TITLE} · run #${sample.runIndex.toLocaleString("en-US")}`} onClose={onClose} variant="modal">
      {res && res.ok && res.box ? (
        <BoxScoreBody box={res.box as BoxScore} palette={palette} />
      ) : (
        <div data-stbx-dialog="" data-stbx-state="unavailable" data-stbx-error={res?.error?.code ?? "BOX_SCORE_ERROR"}>
          <Unavailable title="Box score unavailable" reason={`No box score is shown rather than a partial or guessed one: ${res?.error?.reason ?? "not computed"}`} />
        </div>
      )}
    </BottomSheet>
  );
}
