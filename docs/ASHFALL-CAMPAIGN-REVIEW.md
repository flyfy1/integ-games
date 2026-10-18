# Ashfall campaign expansion — independent design review

Date: 2026-10-18. Reviewer: independent `design_review` agent, separate from implementer.
Status: review complete; dispatcher must record adopted, overridden and deferred recommendations in the implementation brief before coding.

## Product fit and evidence

**Verdict: build inside the existing Ashfall cabinet.** The player wants a satisfying, replayable action campaign with a clear next challenge. The smallest useful outcome is a complete stage: learn a threat, defeat its boss, receive a meaningful reward, then continue or leave with saved progress. Validate this through ordinary input play, stage recovery, and a subsequent return visit. Keep shell navigation, mute, pause and game services; no account, backend, game editor or shared campaign platform is warranted.

Reviewed the current Ashfall engine, registry, UI, audio, progress, types, campaign tests, product/audio contracts and Level II/ascent/three-level briefs and notes. Current source has three substantial levels, three Warden variants, combo timing, hit-stop, knockback, armor breaks, parry and dodge cues, procedural music, touch controls and checkpoints. Existing `NOTES-*` describe past validation, not current production proof. No new browser or physical-device play was performed by this reviewer.

The strongest existing differentiation is Level II's rising-water ascent. Its documented first iteration also demonstrates a key fairness lesson: a won gate needs exit grace, not immediate environmental punishment. Carry that principle into new encounters.

## Proposed scope adjudication

The implementer's proposal is suitable with the conditions below: preserve the original three playable levels; add seventeen shorter authored encounter specifications; organize twenty stages into five acts; reuse three boss chassis while varying attack sequences, arena threats, presentation and story; introduce Easy/Normal/Hard, separate versioned records, boundary resume, capped interlude perks, local procedural themes and a compact bilingual campaign menu.

- **Adopt:** twenty individually addressable stages, five acts, four stage choices per page. Give the selected stage one clear Start action. Show stage number/title, boss and one mechanical descriptor. Keep direct links and unrelated query parameters. Display the active act as well as Previous/Next labels; a full twenty-button wall is unnecessary.
- **Adopt:** preserve the original three layouts/mechanics and their access paths. New content must not silently replace them. Revised story framing may bridge the old third-level finale into a longer journey.
- **Adopt with bounds:** reuse the existing three rigs/chassis. Every stage needs a named boss encounter and a signature attack sequence or arena rule that changes the player's response. Theme, ornament and HP changes alone do not constitute distinct encounter design. Describe the result honestly as twenty boss encounters sharing three chassis, not twenty wholly new boss systems.
- **Adopt with bounds:** seventeen shorter encounter specs should have deliberate enemy placement, safe approach, checkpoint, readable arena and authored pacing. Registry length is not proof of twenty playable levels. Avoid stretching every stage to the originals' 12,000–13,000-pixel length.
- **Adopt:** Easy/Normal/Hard modifies damage pressure and decision time; keep movement and jump geometry stable. Default to Normal. Explain the actual differences in both languages. Save and display difficulty with every result and resume record; do not mix modes or historical three-stage records.
- **Adopt with bounds:** stage-boundary resume is an achievable first persistence contract. Explicitly say that Continue starts the saved stage. Preserve run results, difficulty and perks; do not imply exact mid-fight restoration. Save after a settled clear and after a perk choice, with idempotent advancement. Invalid/denied storage must remain playable and truthfully indicate that saving is unavailable.
- **Adopt with bounds:** edge/guard/reload interlude choices capped at three ranks give a useful campaign reward loop. Show the effect and current rank; explain whether perks last for the run. Test maximum-rank choices, replay, direct starts and checkpoint deaths. Keep old Level II-only upgrade expiration explicit so two sources do not silently double-stack or leak.
- **Adopt:** five procedural scene motifs through the existing art seam; all assets local. A distinct silhouette/prop language, hazard shape, palette and music motif yields more identity than tint alone.

## Priorities and observable completion

### P0 — complete, readable and recoverable campaign

1. **Twenty real encounters:** retain the three originals; give each new stage an authored approach, boss, signature, bilingual story beat and exit. Verify geometry and a viable response to every signature. Attack combinations must leave an actually reachable safe response with ordinary controls. Early stages teach individual patterns before later stages combine them.
2. **Playable campaign flow:** menu → selected difficulty/stage → play → boss clear → reward → next stage → final results. Include pause, death, loading, replay, return to selection, resumed run and invalid-save states. Chapter/act/stage language must not contradict itself. Final completion and score submission happen exactly once under an explicitly versioned eligibility rule; replace existing `1,2,3` and numeric ID assumptions.
3. **Fair difficulty and recovery:** Easy must lower punishment meaningfully without changing jump reach; Hard should require timing without turning ordinary enemies into damage sponges. Retry near the failed challenge. Reset flood, hooks, scheduled events and hazards consistently. No boss pattern or sealed arena may become inescapable after a respawn.
4. **Combat readability:** amplify the distinction between light hit, combo finisher, armor break, stagger, successful evade and kill. Existing effects already cover these foundations. Reserve the strongest feedback for the strongest events, avoid stacking long freezes for multiple pellets, and prioritize readable enemy telegraphs over additional particles. Essential cues remain visible while muted.
5. **Usable controls and bilingual states:** menu fields, help, results, story, save feedback, boss instructions and accessible names require EN/zh-CN coverage. All controls at least 48 CSS px, including landscape actions. Preserve focus across menu updates, native disabled semantics and no selection-triggered auto-start. Readable at 320 px and 200% zoom; let story/results scroll.
6. **Reduced motion and audio:** remove camera displacement under reduced motion rather than the current 30% shake; bound flashes and retain static hit confirmation. Respect shell mute, gesture unlock, pause, route cleanup and resume. Verify bounded audio concurrency and cues under dense combat; an AudioContext reaching `running` does not establish pleasant audible output.

### P1 — sustained reward and identity

- A concise story arc: each act has a concrete objective; stage entry sets the immediate task; boss defeat changes the situation; the next-stage bridge explains why the player continues. Keep text optional to reread and out of active combat. Avoid twenty interchangeable ominous names without consequences.
- Five act identities with alternating traversal and combat pressure, a quieter recovery beat before a boss, and a visible change after victory. Use lower-pressure stages after demanding bosses rather than monotonically increasing every parameter.
- Limited perk choices with clear benefits and no mandatory grind. Show how the chosen reward affects play. Make the final campaign victory feel conclusive and provide useful per-stage records without a twenty-row table dominating a small phone.
- Refine sound by material/action, modest variation and music ducking around key impacts. Use event-driven accents, not constant loudness. The music should make the final phase feel different while warnings remain distinguishable.

### P2 — optional after P0 evidence

- Extra boss ornaments, decorative scenery, optional story recap and richer result presentation.
- Further combo/counter rewards only after the current timings and new difficulty settings survive ordinary-input completion. Do not introduce unrelated combat abilities merely to make a longer feature list.

**Highest-return 20%:** clearly telegraphed boss signatures, responsive differentiated hit/audio feedback, fast fair retries, honest difficulty selection, and saved Continue. These make the existing combat rewarding across twenty encounters. Extra particle count and a larger menu do not substitute for them.

## Content acceptance rule

Before calling the campaign complete, archive a twenty-row content matrix: stage ID/name, act/style, traversal/combat lesson, boss/chassis, signature sequence, required player response, story consequence and verification result. It must expose repetition, not hide it behind names. Reused attacks are acceptable when the ordering, spacing or arena interaction requires a meaningfully different response. Preserve a safe gap and reaction budget in every difficulty; hazard sequences must never demand mutually exclusive dodges simultaneously.

The three existing boss signatures establish useful starting points: foundry armor/close-range pressure, Tempest conduit sidesteps, and Reforged alternating pillars/chain evasion. Build combinations from these legible verbs before introducing more systems. A deterministic boss sequence is useful for learnability and tests, provided repeated cycles do not accidentally become trivial or unavoidable.

## State and verification duties

- Define exact UI tokens, contrast pairs and lifecycle behavior in the brief. Existing inline CSS contains many values and some 44/40-pixel controls; do not claim the current UI already meets the newer skill contract.
- Exercise English and Chinese for title/selection, loading, story, gameplay cues, death/respawn, pause, interlude/reward, final results, resumed run and unavailable storage. Network sending/reconnect can be marked inapplicable to local campaign state; shell score transport must remain truthful.
- Tests should validate externally observable contracts: 20 valid levels with bosses, geometry traversability, difficulty consequences, peril/escape timing, pause/background recovery, save migration and corruption handling, perk caps, handoff cleanup and exactly-once completion.
- Run ordinary-input completion across all new stage families and bosses, plus all twenty stage exits; spot-check representative Easy/Hard runs and at least one full campaign. Separate manipulated screenshot fixtures from proof of completion. A forced boss kill or teleport proves neither combat fairness nor route completion.
- Inspect desktop, 320-pixel portrait and landscape touch views; keyboard focus, control reach, long Chinese strings, zoom, reduced motion and mute. Hear representative impacts/warnings on actual output before claiming audio feel validated. Physical phone ergonomics and broad human engagement remain unverified until observed.
- Compare active-level asset/memory behavior before and after a full campaign. Retain only active art canvases, bound particles/audio nodes, and clean timers/listeners on leave. Verify the deployed build and deep link independently from local tests before claiming public delivery.

## Deferred and residual risks

| Deferred item | Reason | Reconsider when |
| --- | --- | --- |
| Twenty bespoke boss skeletons/animation systems | Large art/runtime expansion is unnecessary for twenty distinct encounters | Playtesting shows reused chassis limit identity despite signature/arena variation |
| Exact mid-fight cross-session saves | Scheduled attacks, RNG, pickups and phase state complicate a safe durable snapshot | Stage-boundary resume is proven and players need finer recovery |
| Backend accounts, cloud saves, leaderboards redesign | Outside the local arcade product contract | A demonstrated cross-device need and explicit service ownership exist |
| Procedural campaign/editor framework | One authored campaign does not justify a platform | A second concrete authoring consumer exists |
| Voice-over, external soundtrack and large raster assets | Distribution/licensing/payload cost without proven value | Story/audio tests show text and procedural score insufficient |
| Claims of “super engaging” based only on bot completion | Bots establish mechanical completion, not preference or replay motivation | Human sessions show understandable failures, voluntary retries and return play |

Residual risk is breadth: twenty stages multiply fairness, save and pacing combinations. The approved scope is credible only with the content matrix and recovery/ordinary-input evidence. Any shortened verification must be disclosed, with the corresponding readiness claim withheld.

## Independent implementation review — 2026-10-18

Read-only review of the completed implementation found three concrete corrections. Line references identify the reviewed working-tree version; the dispatcher should record resolution with regression evidence.

1. **P1 — malformed resume can prevent mount.** `progress.js:28` dereferences each result's `x.id` before checking that the entry is a non-null object. A version-3 Normal resume with `level:2`, `start:1`, valid totals/forge and `results:[null]` throws `TypeError: Cannot read properties of null (reading 'id')`; reproduced through a direct Node import of `loadResume`. Initialization calls this synchronously at `game.js:59`. Reject malformed entries and allow a new game to mount.
2. **P2 — new damage labels do not match applied damage.** `game.js:659–661` confirms an enemy hit before the Level II edge bonus, under-reporting melee damage. `game.js:770–773` confirms boss damage before the phase-one shotgun armor multiplier, over-reporting armor damage. Pass the final target-specific HP/armor damage to hit confirmation and cover both cases.
3. **P2 — inherited property names pass difficulty validation.** `game.js:56–57` and the difficulty action use dictionary truthiness. `constructor`, `toString` and `__proto__` all pass this check, with undefined tuning values; directly evaluating the resulting incoming-damage expression yields `NaN`. A crafted or corrupted URL/setting therefore breaks damage and attack timing. Validate own allowed keys and test invalid URL plus stored difficulty fallback.

No additional concrete reward-duplication or boss-pattern softlock was established by this source review. The implementer reports a full Normal campaign input-only run and Hard stage-XX completion; those remain implementer-supplied evidence, not an independently repeated playtest. Physical-device control comfort and subjective audio/engagement remain outside this review's proof.
