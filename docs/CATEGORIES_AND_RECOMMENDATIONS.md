# Categories and recommendations

## Product intent

Classification should help a visitor answer two questions quickly: “what kind of play is this?” and “what should I try next?” The home page uses four balanced, mechanic-led categories. Every card and play page also shows two compact traits. Recommendations are editorial, not simply the first games sharing a category.

## Listed arcade (2026-11-10)

The catalog still installs 26 modules, but the arcade lists only the ten in `featuredSlugs` (`src/core/catalog.ts`), in this order: Ashfall, Pelican Pedal, Tank Brawl, Pocket Survivor, Block Drop, Fruit Orbit, Merge 2048, Geo Quiz, Tank Clash, Pad Pals. The other sixteen are hidden from the home grid, search, category counts, "Continue playing" and recommendations; their direct links keep working.

Listed categories: Puzzle & Strategy (Merge 2048, Geo Quiz), Match & Build (Block Drop, Fruit Orbit), Quick Reflex (Tank Brawl, Pocket Survivor, Pad Pals), Action & Adventure (Ashfall, Pelican Pedal, Tank Clash). Tank Brawl and Pocket Survivor moved to Quick Reflex because their rounds and runs are short. `recommendationsFor` returns only listed games: the editorial picks that are still listed, topped up in arcade order to four. The table below records the original 26-game editorial picks and is historical for hidden games.

## Primary categories

| Key | Label | Promise |
| --- | --- | --- |
| `puzzle-strategy` | Puzzle & Strategy | Think, plan, remember, or deduce. |
| `match-build` | Match & Build | Combine pieces, clear patterns, and build upward. |
| `quick-reflex` | Quick Reflex | Short runs driven by timing and reactions. |
| `action-adventure` | Action & Adventure | Move through worlds, hazards, and escalating challenges. |

## Game taxonomy and editorial recommendations

Recommendations are ordered. Show the first four, excluding the current game. The first two should feel very close; the last two should introduce a useful adjacent mechanic.

| Game | Primary category | Traits | Recommended next |
| --- | --- | --- | --- |
| Merge 2048 | Puzzle & Strategy | `Merge`, `Endless` | Fruit Orbit, Hexa Fit, Block Drop, Calm Sudoku |
| Pocket Mines | Puzzle & Strategy | `Logic`, `Calm` | Calm Sudoku, Memory Flip, Word Trail, Hexa Fit |
| Daily Solitaire | Puzzle & Strategy | `Cards`, `Calm` | Calm Sudoku, Pocket Mines, Merge 2048, Memory Flip |
| Calm Sudoku | Puzzle & Strategy | `Numbers`, `Calm` | Pocket Mines, Daily Solitaire, Word Trail, Merge 2048 |
| Word Trail | Puzzle & Strategy | `Words`, `Calm` | Memory Flip, Calm Sudoku, Pocket Mines, Bubble Pop |
| Memory Flip | Puzzle & Strategy | `Memory`, `Calm` | Word Trail, Pocket Mines, Calm Sudoku, Perfect Stack |
| Hexa Fit | Puzzle & Strategy | `Spatial`, `Lines` | Merge 2048, Block Drop, Bubble Pop, Fruit Orbit |
| Block Drop | Match & Build | `Lines`, `Endless` | Hexa Fit, Fruit Orbit, Merge 2048, Perfect Stack |
| Perfect Stack | Match & Build | `Timing`, `Endless` | Block Drop, Orbit Knife, Sky Flap, Fruit Orbit |
| Fruit Orbit | Match & Build | `Merge`, `Physics` | Merge 2048, Bubble Pop, Hexa Fit, Tiny Wheels |
| Bubble Pop | Match & Build | `Aim`, `Match` | Fruit Orbit, Hexa Fit, Brick Pulse, Word Trail |
| Neon Snake | Quick Reflex | `Classic`, `Endless` | Sky Flap, Orbit Knife, Brick Pulse, Metro Dash |
| Sky Flap | Quick Reflex | `One-touch`, `Endless` | Neon Snake, Orbit Knife, Perfect Stack, Metro Dash |
| Brick Pulse | Quick Reflex | `Classic`, `Aim` | Pixel Defense, Bubble Pop, Neon Snake, Orbit Knife |
| Orbit Knife | Quick Reflex | `Timing`, `One-touch` | Perfect Stack, Sky Flap, Brick Pulse, Neon Snake |
| Pad Pals | Quick Reflex | `Kids`, `Controller` | Memory Flip, Sky Flap, Neon Snake, Geo Quiz |
| Pixel Defense | Action & Adventure | `Shooter`, `Waves` | Pocket Survivor, Brick Pulse, Metro Dash, Trap Trail |
| Metro Dash | Action & Adventure | `Runner`, `Endless` | Trap Trail, Sky Flap, Neon Snake, Tiny Wheels |
| Trap Trail | Action & Adventure | `Platformer`, `Levels` | Metro Dash, Pocket Survivor, Tiny Wheels, Pixel Defense |
| Tiny Wheels | Action & Adventure | `Driving`, `Physics` | Metro Dash, Trap Trail, Fruit Orbit, Perfect Stack |
| Pocket Survivor | Action & Adventure | `Survival`, `Upgrades` | Pixel Defense, Trap Trail, Metro Dash, Orbit Knife |
| Ashfall | Action & Adventure | `Story`, `Boss` | Pocket Survivor, Trap Trail, Pixel Defense, Metro Dash |
| Tank Clash | Action & Adventure | `Two-Player`, `Tactical` | Pixel Defense, Pocket Survivor, Ashfall, Pad Pals |
| Tank Brawl | Action & Adventure | `Two-Player`, `Party` | Tank Clash, Pocket Survivor, Pixel Defense, Ashfall |
| Pelican Pedal | Action & Adventure | `Platformer`, `Physics` | Trap Trail, Metro Dash, Tiny Wheels, Ashfall |

## Page behavior

### Home

- Keep `All games` as the default filter and show the four categories with game counts.
- A category filter updates the section title, one-line promise, result count, and URL query (`?category=...`) so the view is shareable and survives refresh/back navigation.
- Search works within the active category. A clear empty state explains that no games matched.
- Each card shows its primary category as an eyebrow and two traits as chips. The mechanic remains useful supporting copy; score status remains visible.
- Continue Playing cards use the same taxonomy presentation as the main grid.

### Game page

- Show a breadcrumb: `All games / Category / Game` with the category returning to the filtered home view.
- Place the two trait chips beside the category above the game title.
- Replace the generic `Keep exploring` block with `Recommended next`, a short contextual line, and four editorial cards.
- Recommendation cards use the same category and trait treatment as home cards.
- The recommendation list must never include the current game, contain duplicates, or point to a missing catalog entry.

### Responsive and accessibility

- Filters and traits may scroll horizontally on narrow screens without hiding focus indicators.
- Category controls expose pressed state; result updates use a polite live region.
- Breadcrumbs have a navigation label, cards retain descriptive accessible names, and all interactive targets remain at least 40px high.

## Acceptance checks

- All 26 games have exactly one primary category, exactly two traits, and four valid unique recommendations.
- Every category has at least four games.
- Home filtering, search-within-filter, query persistence, and empty states work on desktop and mobile.
- Every `/play/:slug` page renders the right category, traits, breadcrumb, and four recommendations.
- Typecheck, unit tests, Playwright desktop/mobile smoke tests, production build, and Lighthouse gates pass.
