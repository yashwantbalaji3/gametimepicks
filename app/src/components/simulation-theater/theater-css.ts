/**
 * Simulation Theater V2 styles. Tokens only (globals.css): no raw colour literal may appear here (token ratchet).
 * Turf greens are colour-mixes of --vault-accent-deep ("simulation surfaces") into --bg; THEATER_TURF_MIX names the
 * two percentages so the contrast test can recompute them. Shell transitions use the --motion-* role tokens, so the
 * global reduced-motion block shortens or removes them with no theater-specific override (spec S18).
 */
export const THEATER_TURF_MIX = { a: 26, b: 33 } as const;

/** Theater-scoped custom properties, applied as an inline style on every theater root (component-level definitions). */
export const THEATER_VARS = {
  "--st-turf-a": `color-mix(in srgb, var(--vault-accent-deep) ${THEATER_TURF_MIX.a}%, var(--bg))`,
  "--st-turf-b": `color-mix(in srgb, var(--vault-accent-deep) ${THEATER_TURF_MIX.b}%, var(--bg))`,
  "--st-line": `color-mix(in srgb, var(--lava-text) 62%, transparent)`,
  "--st-line-soft": `color-mix(in srgb, var(--lava-text) 30%, transparent)`,
  "--st-num": `color-mix(in srgb, var(--lava-text) 70%, transparent)`,
  "--st-ball": `color-mix(in srgb, var(--vault-crown) 52%, var(--bg))`,
  "--st-panel": `var(--gtp-card)`,
  "--st-panel-2": `var(--gtp-card-elevated)`,
  "--st-edge": `var(--gtp-card-border)`,
  "--st-text": `var(--lava-text)`,
  "--st-mute": `var(--lava-text-muted)`,
  "--st-faint": `var(--lava-text-faint)`,
} as Record<string, string>;

export const THEATER_CSS = `
.st-root{
  color:var(--st-text);
  font-family:var(--font-display);
  max-width:1200px;margin:0 auto;
}
:root:has(.st-root){scroll-padding-top:72px}
@media (max-width:719px){:root:has(.st-root){scroll-padding-top:60px}}
.st-root *{box-sizing:border-box}
.st-root :focus-visible{outline:2px solid var(--lava-heat);outline-offset:2px;border-radius:6px}
.st-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* banner (role=note) */
.st-banner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 16px;
  padding:9px 14px;border:1px solid color-mix(in srgb, var(--vault-warn) 45%, transparent);border-radius:10px;
  background:color-mix(in srgb, var(--vault-warn) 9%, var(--bg));font-family:var(--font-mono);font-size:11.5px;letter-spacing:.06em;color:var(--st-text)}
.st-banner b{color:var(--vault-warn);font-weight:600;text-transform:uppercase}
.st-devbar{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--st-faint)}
.st-devbar label{display:inline-flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;color:var(--st-mute)}
.st-devbar input{width:18px;height:18px;accent-color:var(--vault-warn)}
.st-devtag{border:1px dashed var(--st-faint);border-radius:999px;padding:2px 8px;text-transform:uppercase;letter-spacing:.1em}

/* sample selector */
.st-samples{margin-top:14px}
.st-samples-head{display:flex;align-items:baseline;gap:10px;font-family:var(--font-mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--st-faint)}
.st-chips{display:flex;gap:8px;margin-top:8px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:thin}
.st-chip{flex:0 0 auto;min-height:44px;display:inline-flex;align-items:center;gap:8px;padding:0 14px;border-radius:999px;
  border:1px solid var(--st-edge);background:var(--st-panel);color:var(--st-mute);font:500 13px var(--font-headline);cursor:pointer;
  transition:background var(--motion-state-change-duration) var(--motion-state-change-easing),border-color var(--motion-state-change-duration) var(--motion-state-change-easing),color var(--motion-state-change-duration) var(--motion-state-change-easing)}
.st-chip:hover{border-color:var(--gtp-card-border-strong);color:var(--st-text)}
.st-chip[aria-checked="true"]{background:color-mix(in srgb, var(--lava-heat) 14%, var(--st-panel));border-color:var(--lava-heat);color:var(--st-text)}
.st-chip[aria-disabled="true"]{opacity:.55;cursor:not-allowed}
.st-chip .st-dot{width:8px;height:8px;border-radius:50%;border:1.5px solid currentColor}
.st-chip[aria-checked="true"] .st-dot{background:var(--lava-heat);border-color:var(--lava-heat)}
.st-chip .st-chip-score{font-family:var(--font-mono);font-size:12px;font-variant-numeric:tabular-nums;color:var(--st-faint)}
.st-chip[aria-checked="true"] .st-chip-score{color:var(--st-mute)}
.st-rule{margin:4px 0 0;font-size:12.5px;color:var(--st-mute);line-height:1.5}
.st-rule .st-mono{font-family:var(--font-mono);font-size:11.5px;color:var(--st-faint)}
.st-samplelabel{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--vault-warn)}

/* main grid */
.st-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;margin-top:14px}
@media (min-width:1024px){.st-grid{grid-template-columns:minmax(0,2fr) minmax(300px,1fr);gap:24px}}
.st-stage{min-width:0;container-type:inline-size}

/* score bug */
.st-bug{position:sticky;top:0;z-index:5;display:flex;align-items:stretch;min-height:64px;border-radius:14px;overflow:hidden;
  background:linear-gradient(180deg, color-mix(in srgb, var(--lava-text) 6%, var(--surface-elevated)) 0%, var(--surface-elevated) 55%, color-mix(in srgb, var(--bg) 40%, var(--surface-elevated)) 100%);
  border:1px solid var(--border-strong);box-shadow:inset 0 1px 0 color-mix(in srgb, var(--lava-text) 10%, transparent),0 10px 24px -14px var(--bg)}
.st-team{display:flex;align-items:center;gap:10px;padding:0 14px 0 0;min-width:0;flex:1 1 0}
.st-team-bar{align-self:stretch;width:6px;flex:0 0 6px;background:var(--st-team)}
.st-team-abbr{font:600 20px/24px var(--font-headline);letter-spacing:.02em;white-space:nowrap}
.st-team-name{display:block;font-size:11px;color:var(--st-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-team-score{margin-left:auto;padding-left:6px;flex:0 0 auto;font:600 32px/36px var(--font-mono);font-variant-numeric:tabular-nums;min-width:2ch;text-align:right}
.st-team-score.is-bump{animation:st-bump var(--motion-number-transition-duration) var(--motion-number-transition-easing)}
@keyframes st-bump{0%{transform:translateY(-35%);opacity:.2}100%{transform:none;opacity:1}}
.st-poss{width:16px;height:10px;flex:0 0 16px;visibility:hidden}
.st-poss.on{visibility:visible}
.st-bug-sep{width:1px;background:var(--border-strong)}
.st-clockbox{display:flex;flex-direction:column;justify-content:center;align-items:flex-end;padding:0 14px;gap:2px;min-width:132px;border-left:1px solid var(--border-strong);
  background:color-mix(in srgb, var(--bg) 35%, transparent)}
.st-clockline{display:flex;align-items:baseline;gap:8px;font:500 16px var(--font-mono);font-variant-numeric:tabular-nums}
.st-clocklabel{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.14em;color:var(--st-faint);text-transform:uppercase}
.st-illus{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.08em;color:var(--vault-warn);text-transform:uppercase;min-height:12px}
.st-statechip{display:flex;align-items:center;padding:0 12px;border-left:1px solid var(--border-strong);font:600 12px var(--font-mono);letter-spacing:.12em;color:var(--st-mute);min-width:84px;justify-content:center}
.st-statechip.on{color:var(--vault-warn)}

/* field card */
.st-fieldcard{margin-top:12px;border-radius:16px;background:var(--st-panel);box-shadow:var(--gtp-card-shadow);border:1px solid var(--st-edge);padding:12px;position:relative}
.st-badge{display:inline-block;font-family:var(--font-mono);font-size:10.5px;letter-spacing:.1em;color:var(--st-text);
  background:color-mix(in srgb, var(--bg) 78%, transparent);border:1px solid var(--border-strong);border-radius:6px;padding:4px 8px}
.st-badge .st-badge-short{display:none}
@media (max-width:359px){.st-badge .st-badge-long{display:none}.st-badge .st-badge-short{display:inline}}
.st-fieldwrap{position:relative;width:100%;margin-top:8px;border-radius:10px;overflow:hidden;border:1px solid var(--border-strong);
  box-shadow:inset 0 2px 12px var(--bg);aspect-ratio:120/53.3;min-height:128px;max-height:none;background:var(--st-turf-a)}
@media (max-width:719px){.st-fieldwrap{min-height:168px}}
@media (max-width:359px){.st-fieldwrap{min-height:140px}}
.st-fieldwrap svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.st-fieldwrap .st-vignette{position:absolute;inset:0;pointer-events:none;background:var(--lava-glow)}
.st-fieldwrap.is-dim .st-dimmer{opacity:.3}
.st-dimmer{position:absolute;inset:0;background:var(--bg);opacity:0;pointer-events:none;transition:opacity var(--motion-state-change-duration) var(--motion-state-change-easing)}
.st-callouts{position:absolute;left:0;right:0;top:10px;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.st-callout{font:600 12px var(--font-headline);letter-spacing:.08em;padding:6px 12px;border-radius:999px;background:color-mix(in srgb, var(--bg) 82%, transparent);
  border:1px solid var(--border-strong);color:var(--st-text);box-shadow:0 6px 16px -8px var(--bg);
  animation:st-in var(--motion-entrance-duration) var(--motion-entrance-easing)}
.st-callout.tone-score{border-color:var(--vault-warn);color:var(--vault-warn)}
.st-callout.tone-stop{border-color:var(--lava-danger);color:var(--lava-danger)}
.st-callout.tone-break{border-color:var(--lava-heat);color:var(--lava-heat)}
.st-callout.tone-roll{font-family:var(--font-mono);font-size:11px;font-weight:500;color:var(--st-mute)}
.st-card{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);font-family:var(--font-mono);font-size:11px;color:var(--st-mute);
  background:color-mix(in srgb, var(--bg) 82%, transparent);border:1px dashed var(--border-strong);border-radius:8px;padding:5px 10px;white-space:nowrap;pointer-events:none}
@keyframes st-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.st-caption{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font-family:var(--font-mono);font-size:10.5px;color:var(--st-faint)}
.st-caption .st-runoff{color:var(--vault-warn)}
.st-legend-ring,.st-legend-ball{display:inline-block;width:9px;height:9px;border-radius:50%;vertical-align:-1px;margin-right:4px}
.st-legend-ring{border:1.5px solid var(--st-mute)}
.st-legend-ball{background:var(--st-ball);border:1px solid var(--st-text)}

/* timeline (one tab stop: toolbar with roving tabindex) */
.st-timeline{margin-top:12px}
.st-tl-head{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--st-faint)}
.st-tl-track{position:relative;display:flex;gap:4px;margin-top:6px;min-height:44px;align-items:stretch}
.st-tl-period{display:flex;flex-direction:column;gap:3px;min-width:0}
.st-tl-plabel{font-family:var(--font-mono);font-size:9.5px;color:var(--st-faint);letter-spacing:.08em;height:11px}
.st-tl-segs{display:flex;gap:2px;flex:1;min-height:30px}
.st-seg{position:relative;flex:1 1 0;min-width:4px;border:0;padding:0;border-radius:3px;cursor:pointer;
  background:color-mix(in srgb, var(--st-off) 34%, var(--st-panel-2));display:flex;align-items:flex-end;justify-content:center;
  color:var(--st-text);font-size:10px;line-height:1;padding-bottom:3px;
  transition:background var(--motion-hover-focus-duration) var(--motion-hover-focus-easing)}
.st-seg.is-done{background:color-mix(in srgb, var(--st-off) 55%, var(--st-panel-2))}
.st-seg.is-current{background:var(--st-off);color:var(--bg);box-shadow:0 0 0 1px var(--st-text) inset}
.st-seg:hover{background:color-mix(in srgb, var(--st-off) 75%, var(--st-panel-2))}
.st-seg .st-tick{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--st-text);opacity:.8;border-radius:1px}
.st-seg .st-ico{pointer-events:none}
.st-tl-cursor{position:absolute;top:12px;bottom:-4px;width:2px;background:var(--lava-heat);pointer-events:none;border-radius:1px;box-shadow:0 0 6px var(--lava-heat)}
.st-tl-key{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font-size:10.5px;color:var(--st-faint);font-family:var(--font-mono)}

/* transport */
.st-transport{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;padding:6px;border-radius:12px;background:var(--st-panel);border:1px solid var(--st-edge)}
.st-btn{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:10px;border:1px solid var(--border-strong);
  background:var(--st-panel-2);color:var(--st-text);cursor:pointer;font:500 13px var(--font-display);padding:0 10px;
  transition:background var(--motion-hover-focus-duration) var(--motion-hover-focus-easing),border-color var(--motion-hover-focus-duration) var(--motion-hover-focus-easing)}
.st-btn:hover{border-color:var(--gtp-card-border-strong)}
.st-btn svg{width:18px;height:18px}
.st-btn.st-play{min-width:56px;background:var(--lava-heat);color:var(--vault-on-accent);border-color:var(--lava-heat)}
.st-btn.st-play:hover{background:var(--vault-accent-mint)}
.st-speeds{display:inline-flex;border:1px solid var(--border-strong);border-radius:10px;overflow:hidden}
.st-speed{min-width:44px;min-height:44px;border:0;background:var(--st-panel-2);color:var(--st-mute);font:500 13px var(--font-mono);cursor:pointer}
.st-speed[aria-checked="true"]{background:color-mix(in srgb, var(--lava-heat) 22%, var(--st-panel-2));color:var(--st-text)}
.st-speed + .st-speed{border-left:1px solid var(--border-strong)}
.st-speedcycle{display:none}
.st-seekrow{display:flex;align-items:center;gap:10px;flex:1 1 260px;min-height:44px;min-width:0}
.st-seek{flex:1;min-width:0;height:44px;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer}
.st-seek::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:linear-gradient(90deg,var(--lava-heat) 0 var(--st-pct,0%),var(--st-panel-2) var(--st-pct,0%) 100%);border:1px solid var(--border-strong)}
.st-seek::-moz-range-track{height:6px;border-radius:3px;background:var(--st-panel-2);border:1px solid var(--border-strong)}
.st-seek::-moz-range-progress{height:6px;border-radius:3px;background:var(--lava-heat)}
.st-seek::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;margin-top:-10px;border-radius:50%;background:var(--lava-text);border:3px solid var(--lava-heat);box-shadow:0 2px 6px var(--bg)}
.st-seek::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:var(--lava-text);border:3px solid var(--lava-heat);box-sizing:border-box}
.st-ptime{font:500 12px var(--font-mono);font-variant-numeric:tabular-nums;color:var(--st-mute);white-space:nowrap}
.st-keys{margin-top:8px;font-size:12px;color:var(--st-mute)}
.st-keys summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;color:var(--st-faint)}
.st-keys dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0 0 8px}
.st-keys dt{font-family:var(--font-mono);color:var(--st-text)}
.st-keys dd{margin:0}
@media (max-width:719px){
  .st-speeds{display:none}
  .st-speedcycle{display:inline-flex}
  .st-transport{gap:8px}
  .st-seekrow{flex-basis:100%}
}

/* side panel */
.st-side{border-radius:16px;background:var(--st-panel);border:1px solid var(--st-edge);box-shadow:var(--gtp-card-shadow);min-width:0;align-self:start}
@media (min-width:1024px){.st-side{position:sticky;top:12px}}
.st-tabs{display:flex;border-bottom:1px solid var(--border-strong)}
.st-tab{flex:1;min-height:44px;border:0;background:transparent;color:var(--st-faint);font:500 13px var(--font-display);cursor:pointer;border-bottom:2px solid transparent;
  transition:color var(--motion-state-change-duration) var(--motion-state-change-easing),border-color var(--motion-state-change-duration) var(--motion-state-change-easing)}
.st-tab[aria-selected="true"]{color:var(--st-text);border-bottom-color:var(--lava-heat)}
.st-tabpanel{padding:14px 16px 16px;font-size:13px;line-height:1.5}
.st-eyebrow{font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--st-faint)}
.st-drivehead{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.st-drivehead h3{margin:2px 0 0;font:600 17px var(--font-headline)}
.st-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:12px 0 0}
.st-kv dt{color:var(--st-faint);font-size:12px}
.st-kv dd{margin:0;font-family:var(--font-mono);font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--st-text)}
.st-note{margin-top:10px;padding:8px 10px;border-left:2px solid var(--vault-warn);background:color-mix(in srgb, var(--vault-warn) 8%, transparent);font-size:12px;color:var(--st-text)}
.st-qlist{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.st-qlist button{width:100%;min-height:44px;text-align:left;border:1px solid var(--border);border-radius:8px;background:var(--st-panel-2);color:var(--st-mute);font:12px var(--font-mono);padding:6px 10px;cursor:pointer;display:flex;gap:10px;align-items:center}
.st-qlist button[aria-current="true"]{border-color:var(--lava-heat);color:var(--st-text)}
.st-ev{margin:0;display:grid;grid-template-columns:1fr;gap:8px}
.st-ev dt{color:var(--st-faint);font-size:11px;font-family:var(--font-mono);letter-spacing:.06em;text-transform:uppercase}
.st-ev dd{margin:0;font-family:var(--font-mono);font-size:12px;word-break:break-word;color:var(--st-text)}
.st-limits{margin:6px 0 0;padding-left:18px;font-size:12px;color:var(--st-mute)}
.st-limits li{margin:3px 0}
.st-hist{display:flex;align-items:flex-end;gap:1px;height:72px;margin-top:6px}
.st-hist span{flex:1;min-width:1px;background:color-mix(in srgb, var(--lava-heat) 45%, transparent);border-radius:1px 1px 0 0}
.st-hist span.is-run{background:var(--vault-warn)}

/* below the scene */
.st-below{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;margin-top:18px}
@media (min-width:1024px){.st-below{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.st-box{border-radius:14px;background:var(--st-panel);border:1px solid var(--st-edge);padding:12px 14px;min-width:0}
.st-box h2{margin:0 0 8px;font:600 15px var(--font-headline)}
.st-scroll{overflow-x:auto}
.st-line{width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:13px;font-variant-numeric:tabular-nums}
.st-line th,.st-line td{padding:6px 8px;text-align:right;border-top:1px solid var(--border-strong)}
.st-line th:first-child,.st-line td:first-child{text-align:left}
.st-line thead th{border-top:0;font-size:10.5px;color:var(--st-faint);letter-spacing:.08em}
.st-transcript summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font:600 14px var(--font-headline)}
.st-transcript ol{margin:6px 0 0;padding-left:26px;font-size:12.5px;line-height:1.6;color:var(--st-mute)}
.st-transcript li[aria-current="true"]{color:var(--st-text)}
.st-unavail{border:1px solid color-mix(in srgb, var(--lava-danger) 50%, transparent);border-radius:12px;padding:14px 16px;background:color-mix(in srgb, var(--lava-danger) 7%, var(--bg));font-size:13px}
.st-unavail h2{margin:0 0 6px;font:600 15px var(--font-headline);color:var(--lava-danger)}
.st-unavail ul{margin:6px 0 0;padding-left:18px;font-family:var(--font-mono);font-size:11.5px;color:var(--st-mute)}

/* score bug and field card follow the STAGE width (container query), not the viewport: the stage is narrower than the
   viewport whenever the site rail or the side panel takes room */
@container (max-width:640px){
  .st-team-name{display:none}
  .st-statechip{min-width:64px;padding:0 8px}
}
@container (max-width:460px){
  .st-bug{min-height:56px;border-radius:12px}
  .st-team{gap:6px;padding-right:8px}
  .st-team-abbr{font-size:16px}
  .st-team-score{font-size:24px;line-height:28px}
  .st-clockbox{min-width:96px;padding:0 10px}
  .st-clockline{font-size:13px}
  .st-statechip{display:none}
  .st-fieldcard{padding:8px;border-radius:12px}
}
@container (max-width:330px){
  .st-bug{min-height:52px}
  .st-team{gap:4px;padding-right:6px}
  .st-poss{width:12px;flex-basis:12px}
  .st-clockbox{min-width:76px;padding:0 8px}
  .st-clocklabel{display:none}
  .st-fieldcard{padding:6px}
}
`;
