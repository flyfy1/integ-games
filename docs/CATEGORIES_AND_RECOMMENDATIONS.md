# Categories and recommendations

## Product intent

Classification should help a visitor answer two questions quickly: “what kind of play is this?” and “what should I try next?” The home page uses four balanced, mechanic-led categories. Every card and play page also shows two compact traits. Recommendations are editorial, not simply the first games sharing a category.

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
| Pixel Defense | Action & Adventure | `Shooter`, `Waves` | Pocket Survivor, Brick Pulse, Metro Dash, Trap Trail |
| Metro Dash | Action & Adventure | `Runner`, `Endless` | Trap Trail, Sky Flap, Neon Snake, Tiny Wheels |
| Trap Trail | Action & Adventure | `Platformer`, `Levels` | Metro Dash, Pocket Survivor, Tiny Wheels, Pixel Defense |
| Tiny Wheels | Action & Adventure | `Driving`, `Physics` | Metro Dash, Trap Trail, Fruit Orbit, Perfect Stack |
| Pocket Survivor | Action & Adventure | `Survival`, `Upgrades` | Pixel Defense, Trap Trail, Metro Dash, Orbit Knife |

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

- All 20 games have exactly one primary category, exactly two traits, and four valid unique recommendations.
- Every category has at least four games.
- Home filtering, search-within-filter, query persistence, and empty states work on desktop and mobile.
- Every `/play/:slug` page renders the right category, traits, breadcrumb, and four recommendations.
- Typecheck, unit tests, Playwright desktop/mobile smoke tests, production build, and Lighthouse gates pass.
