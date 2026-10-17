# Ashfall Level II — Iteration A: THE RISING DEEP（上升逃亡）

You previously built Level II "The Storm Below" on this branch (commit d30de29).
The playtester verdict: it feels too similar to Level 1 — same downward stroll,
same pacing. Your job now: change the CORE VERB of Level 2. It becomes an
**ascent escape**: the deep floods behind you and the water never stops rising.

Work in this repo on the current branch (`ashfall-level2-codex`). Level 1 must
remain byte-identical in behavior (its `level.js` stays untouched; the campaign
handoff L1 → L2 stays). No new npm dependencies. Do not push, do not deploy,
do not touch `main`.

## The transformation

1. **Direction flip.** Level 2 is now climbed, not descended. The player enters
   at the BOTTOM (where the Warden fell) and escapes UPWARD through the same
   three zones in reverse elevation: IV Drowned Aqueduct (bottom — the flood's
   source) → V Glass Archive → VI Storm Crown (top, boss arena). Rework the
   Level 2 layout data into an upward path: platforms, stairs and ledges must
   form a climbable route using the existing movement physics (jump height /
   distance budgets from Level 1/2 — no pixel-perfect jumps; the widest gaps
   keep mid ledges). Reuse the existing `art2.js` scenery, palettes, props and
   lights — this is a re-choreography of your Level 2, not a new art set.
2. **The rising water.** A flood line starts below the player and rises
   continuously for the whole level:
   - Speed tuned in bands per zone: comfortably slower than a steady climb in
     zone IV, brisker in V, fastest in VI — but always escapable at normal
     play pace without rushing every jump.
   - Touching the water: heavy damage + immediate respawn at the last
     checkpoint, with the water reset to just below that checkpoint (no
     death-spiral). Dying to enemies also resets the water to the checkpoint
     baseline.
   - Brief grace: the water pauses ~3s after each checkpoint activation and
     ~5s at level start.
   - Render it unmistakably: dark flood surface with foam/ripple line, screen-
     edge warning tint + audio cue as it nears the player's height. It must
     read instantly, including on mobile.
3. **Encounters adapted.** Keep the enemy roster and counts roughly as-is, but
   placements serve the climb: ambushes become "hold the high ground" gate
   fights on refuge platforms (the water holds at the gate's floor while the
   seal is active — being locked in a room that floods is not fun). Checkpoints
   ≥5, medkits ≥6, both existing upgrades (Salvaged Edge, Storm Mantle) stay.
4. **Boss.** The Tempest Warden arena is at the TOP. During phase 1 the water
   keeps rising until it locks just below the arena floor (soft pressure, not
   an instant-kill timer); phase 2 the water locks and the conduit-grid
   lightning works as before. The arena must still be winnable at the pace
   your playtest bot plays.
5. **Unchanged contracts.** Direct entry `/play/ashfall?ashfall-level=2` still
   works; campaign L1 → L2 handoff, carry-over stats, final victory settle,
   restart semantics — all as you built them. HUD gains a slim water-proximity
   indicator (distance to the flood line), visible only in Level 2.

## Verification (must all be real, run them)

- `npm run build` passes; `npm test` passes (update/add tests for: water rise
  + checkpoint reset, touch-water respawn, gate-hold flooding pause).
- Playtest bot completes Level 2 start-to-finish (direct entry) AND the full
  campaign L1 → L2, zero runtime errors: extend
  `node scripts/ashfall-playtest.mjs --level=2 --shots` usage as needed — the
  bot must climb at human pace, not teleport.
- Screenshots (desktop + mobile): water chase mid-zone IV, gate hold, boss
  phase 1 with water locked below the arena.
- Then ONE self-iteration round: play/read your own results, fix the biggest
  feel problem you find (pacing, fairness, readability), re-run the checks.

## Deliverables

- Commit(s) on this branch; every commit message ends with:
  `Built-By: Codex (gpt-6-astra)`
- Write `NOTES-L2A.md`: what changed mechanically, water-speed tuning numbers,
  how the bot verified completability, iteration-round findings, known limits.
- End your final message with the line: L2A_DONE
