# Ashfall: twenty guardians

## Independent review and adjudication

Independent reviewer: `/root/design_review`, 2026-10-18. The reviewer's delivered findings are archived here before implementation; its full report is `../ASHFALL-CAMPAIGN-REVIEW.md`.

> Existing combat already includes hit-stop, three-hit combos, knockback, armor fracture, adaptive procedural music, parry/dodge cues and checkpoints. The principal risk is cloning seventeen long Warden levels with inflated HP. Prefer five acts of four stages, shorter combat lessons, explicit signature patterns, progress separated by difficulty and clearer feedback. Replace hardcoded 1/2/3 selection, storage and completion contracts.

Adopt all of these recommendations. Preserve the three shipped maps and their identity, then add seventeen shorter authored encounters. Bosses share the existing three articulated chassis, with distinct ornaments, identities, phase scripts and teaching cues; do not claim twenty independently animated models. Independent review is separate from implementation; gameplay balance still requires empirical checks.

## Product fit / playable slice

Build inside the existing Ashfall cabinet. Audience: a player seeking a satisfying browser action campaign on keyboard or touch. Job: choose a challenge, understand an attack, counter it, earn an upgrade and continue. Riskiest assumption: authored pattern variety and repeated mastery stay enjoyable across twenty stages. Ordinary-input simulation and human-visible browser interaction prove operability, not retention.

P0: twenty reachable stages and twenty named boss encounters; Easy/Normal/Hard; full forward progression; recoverable local progress; honest results; readable responsive selection; EN/zh-CN controls and story. P1: momentum/overdrive, readable impact numbers, distinct success/defense cues, music ducking, forge choices, five scene motifs. P2: additional unique boss skeletons and bespoke illustrations after play evidence.

Highest-return 20%: clear boss tells + satisfying counter/reward + short next-stage loop. Deferred: online leaderboard migration (new scores stay local), cloud saves, multiplayer, new rendering engine, voice acting. Their cost does not prove the combat loop. Existing three levels remain longer authored episodes; do not silently compress them.

## Implementation brief

- `campaign.js`: authored stage and act data, map construction and theme-art adapters. Reuse existing level capability interface; art builders are the seam. No new engine.
- `progress.js`: validated versioned difficulty records and boundary resume state. Optional storage failure leaves play possible and displays a save warning. Never overwrite old records.
- `game.js`: difficulty rules, deterministic new boss phase sequences, damage feedback, momentum, forge effects and cue lifecycle. Keep simulation authoritative at 60 Hz.
- `ui.js`: five act tabs with four level choices, native difficulty selection, detail/story/boss lesson, Start and Resume; interlude rewards and final results. DOM redraw only on meaningful state changes; preserve focus and scroll.
- Verification: geometry/reachability, all sixty level/difficulty launches and boss completion contracts, ordinary-input all-twenty campaign run, representative hard/easy runs, existing unit/E2E suite, responsive browser evidence, public build identity and asset checks.

## UI tokens and lifecycle

Reuse Georgia for dramatic headings; system-ui for controls, labels and body. Root 16px; body 1rem/1.5, meta .8125rem/1.5, title clamp(1.5rem,4vw,2.5rem)/1.2; weights 400/700/800. Canvas #090e14; surface #12171b; selected #32271b; ink #f4e8d5; muted #b4c4cd; gold #f0cd96 with ink #1b1712; cyan #aee6ff; border #76604a; warning #ffda9a. Core ink/surface and gold/action pairs target 7:1; measured in verification. Spacing 4/8/12/16/24px, control radius 6px, panel 8px. No new shadows. 48px minimum controls and 3px cyan focus with 4px offset. Reading/control surfaces are solid.

No ambient DOM motion. Input hover opacity 120ms, press transform 80ms only when applicable; reduced motion removes camera shake and full-screen flashes. Essential telegraphs retain shape and text; pulse disabled in reduced motion. Canvas impact effects have bounded counts/lifetimes, cancel on death/reset, never delay controls. Music ducks on confirmed high-impact events; audio respects mute, pause, visibility and teardown.

State matrix, both languages: title/selection, loading, playing, paused, death/checkpoint retry, interlude/reward, finale, unavailable storage. Network/reconnect and sending are inapplicable to the local game loop. Save status distinguishes memory-only fallback from persisted progress. No account requirement. Background-tab return freezes simulation and audio.

Phone portrait: selector follows normal document flow and scrolls; landscape: readable compact selector. Gameplay remains horizontal with existing touch controls. Canvas status is supplemented with fixed CSS-size cues. Long copy wraps at 320px; no phase copy in live combat regions beyond short instructions. No external assets/dependencies added. Existing shell comments/analytics are outside this change.

## Evidence boundary

Baseline: commit a33bed5, 107 unit tests passing. Existing Level I ordinary-input seeded bot: complete in 142 simulation seconds, zero deaths, zero runtime errors. Browser observed original selection and attack pose on production. Automated bot is a deterministic control policy, not a human playtest or proof of engagement.

Full review adjudication: adopted all P0 recommendations and the twenty-row content acceptance rule. P1 momentum is included because it connects confirmed hits to a bounded reward; no extra attack control is introduced. P2 ornaments are included only as low-cost procedural boss identity. Deferred bespoke rigs, cloud/mid-fight saves, external soundtrack and engagement claims exactly as reviewed. No overrides of recovery/fairness gates. This addendum precedes implementation.

Inherited budget exception: the unchanged shared arcade stylesheet is 27.57 KB before Ashfall's injected styles, already above the skill's site-wide 25 KB target. This release keeps Ashfall's own injected CSS at about 10.8 KB. A cross-cabinet stylesheet reduction is deferred because it would require unrelated UI regression scope; no claim that the total site CSS meets 25 KB. The full build remains a 21-game shared shell.
