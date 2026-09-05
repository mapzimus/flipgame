# Flipgame v111 smartboard UX specification

Status: implementation contract for v111  
Depends on: `docs/v111-contract.md`, revision 1  
Baseline inspected: `index.html`, `css/style.css`, and `js/main.js` at `3a3ace0`

## 1. Purpose and scope

This specification makes the non-gameplay surfaces usable from a shared
smartboard, while keeping them equally usable on a phone or tablet. It covers
Setup, Customize, Stats, Achievements, Online, and Game Over. It does not alter
physics, scoring, event selection, progression thresholds, or Classic rules.

The implementation must use a single responsive component tree. Do not create
a separate smartboard-only page. Every screen must show the global `v111`
badge, respect safe-area insets, remain usable at 200% text zoom, and support
all of these CSS viewport sizes:

- 360 x 740
- 768 x 1024
- 1280 x 720
- 1366 x 768
- 1920 x 1080
- 3840 x 2160 (4K)

“Fits” means that the heading, current context, and primary action are visible
without horizontal page scrolling. A phone may vertically scroll its main
content. At 1280 x 720 and larger, Setup and Game Over must show all eight
players without scrolling the player list. Any scroll region must have a
visible boundary, preserve keyboard reachability, and leave its screen's
primary action outside that region.

## 2. Release-wide rules

### 2.1 Information disclosure

Locked content is a mystery. A locked object, variant, cosmetic, achievement,
Alien feature, Insane Mode, or advanced Physics Lab entry renders as one
focusable tile containing only a lock symbol. Its accessible name is exactly
`Locked`. It must not expose a name, art, silhouette, description, ordinal,
threshold, wins remaining, progress bar, tooltip, `title`, `data-*` value, or
toast that identifies the content or how to earn it. Do not announce the total
number of locked items.

Unlocked content may show its name and details. A just-earned unlock may show
its name and art after the award, but not text such as `Win #42`, `next unlock`,
or a ladder position.

The player-facing UI must never state programmed event odds or the Insane Mode
occurrence rate. Insane Mode's unlocked description is `Special events can
happen on any flip.` Stats may show historical observations only, as defined
in section 6.

### 2.2 Names and identity

- Every name input is labelled `Player name` and presents `14 max` as helper
  text. HTML `maxlength` is only an input hint; `NamePolicy.validate()` is the
  authority because the limit is 14 Unicode grapheme clusters after NFKC
  normalization.
- Validate on blur and on any Create, Join, Start, Apply, or Rematch action.
  If invalid, keep the entered value, block the action, set
  `aria-invalid="true"`, associate the field with the generic message
  `Choose a different name.`, focus the first invalid field, and announce that
  same message in the assertive error region. Do not disclose which safety rule
  matched.
- Duplicate display names are allowed. UI and storage use stable player/seat
  IDs; duplicate names are distinguished in setup by `P1` through `P8` and in
  tables by their color marker plus seat number.
- Render names with `textContent`/text nodes or equivalent escaping. Names may
  never become HTML, CSS selectors, storage keys, URLs, or room codes.
- Exact allowlisted names, including exact-case `Mr. Howe`, pass the same UI
  flow. There is no visible hint that a name has special behavior.

### 2.3 Touch, pointer, and keyboard

- Every actionable target, including icon buttons, radio/checkbox labels,
  swatches, tabs, pagination, and disclosure buttons, has a measured hit box of
  at least 48 x 48 CSS px and at least 8 px separation from a different action.
  The visible control may be smaller only if its non-overlapping hit box is
  48 x 48.
- Hover must never be required. Pointer down must not commit a destructive or
  navigational action; activate on click/pointer up.
- All actions work with touch, mouse, Enter, and Space. Native radio groups
  retain arrow-key behavior. Custom grids use the roving-focus behavior in
  section 10.
- `:focus-visible` is a solid 3 px high-contrast outline with 3 px offset; it
  may not rely on glow or color change alone.
- Text contrast is at least 4.5:1; large display text and meaningful component
  boundaries are at least 3:1. Player color is always paired with a seat/name,
  icon, label, or pattern.
- No target may be hidden underneath the global version badge or a safe-area
  inset.

### 2.4 Shared screen frame

Each covered screen uses this order:

1. A fixed/sticky header containing Back when applicable, an `h1`, and at most
   one contextual action.
2. A `<main>` content region. Only this region scrolls when needed.
3. A sticky action footer when a screen has a primary action.
4. The pointer-transparent `v111` badge at the bottom-right, positioned above
   the safe-area and never over a footer control.

On route entry, focus the `h1` (`tabindex="-1"`) without scrolling the page.
Back returns focus to the exact opener. Browser/Android Back has the same
effect as the visible Back control, except a dirty Customize draft first opens
the discard confirmation. Escape follows the same rule on hardware keyboards.

Status messages use a persistent polite live region. Validation and connection
failures use a persistent assertive region. Adding/removing transient nodes is
not sufficient because it causes inconsistent announcements in WebViews.

## 3. Responsive layout system

Use logical properties so the layout remains valid if localization is added.
The sizes below are CSS pixels.

| Viewport | Header / footer | Content padding and maximum | Default grids | Scroll behavior |
| --- | --- | --- | --- | --- |
| 360 x 740 | 56 / 72 | 12; full width | 1-column forms; 2-column galleries | Main scrolls vertically; header/footer stay visible |
| 768 x 1024 | 64 / 80 | 16; 736 wide | 2-column player grid; 4-column galleries | Main scroll only when content exceeds height |
| 1280 x 720 | 56 / 72 | 16; 1248 wide | 2-column player grid; 6-column galleries | Setup and Game Over do not page-scroll at default text size |
| 1366 x 768 | 64 / 72 | 20; 1326 wide | 2-column player grid; 6-column galleries | Same as 1280, with larger gaps |
| 1920 x 1080 | 72 / 88 | 28; 1640 wide, centered | 2-column player grid; 8-column galleries | No page scroll for the primary state |
| 3840 x 2160 | 104 / 112 | 40; 2560 wide, centered | 2-column player grid; 10-column galleries | Use 64 px primary targets and 24 px body type; no unbounded stretching |

At 900 CSS px and wider, Setup uses a 58/42 split and Stats uses a 240 px
navigation/filter rail plus a fluid results pane. At 1600 px and wider, the
Stats rail is 288 px. At 899 px and narrower, both become one column; Stats
filters become a full-width disclosure above results.

Type uses `clamp()` but does not scale beyond the following: body 16–24 px,
labels 14–20 px, screen titles 28–52 px, and winner display 40–80 px. Paragraph
measure is at most 70 characters. Cards do not stretch wider merely to fill a
4K screen.

## 4. Setup

### 4.1 Information architecture

The header contains the game title and three 48 px utility buttons in this
order: `Stats`, `Achievements`, `Online`. At 360 px they use icon plus short
text and divide one row equally; they must not become a horizontally scrolling
toolbar. There is no teacher/facilitator menu and no UI for forcing events,
editing wins, bulk-changing players, or resetting progression.

The content has two regions:

1. `Players` — two to eight seat cards and `Add player`.
2. `Match` — mode, format, starting lives or mode-specific target, pass
   direction, feel, flick feedback, and CPU difficulty when at least one CPU is
   present.

The footer contains one full-width primary action whose label reflects the
selected format: `Start Classic`, `Start Cup`, or `Start Team Clash`. Practice
is a secondary 48 px action immediately before it. Basic Practice is enabled;
any locked practice/lab choices use the lock-only treatment from section 2.1.

### 4.2 Seat card

Each seat card includes, in reading order:

1. Player-color marker plus `P1`…`P8`.
2. Player name field.
3. `Customize Pn` button showing the selected unlocked object's thumbnail and
   name. The accessible name includes the seat and selected item, for example
   `Customize P3, Bottle`.
4. Human/CPU segmented toggle.
5. `Remove Pn`, for seats 3–8 only.

At 768 px and wider, cards form two columns with four rows for eight players.
At 360 px they form one column. At 1280 x 720, each card is at most 108 px high
and the Players pane shows all eight cards in its 2 x 4 grid; color choice is
moved into Customize so a 12-swatch grid does not lengthen Setup. The `Add
player` action becomes disabled at eight and says `8 player maximum` in
visible helper text; it is removed from tab order while disabled.

Removing a player reindexes visible seat labels but does not change the stable
IDs of surviving players. Focus moves to the previous seat's Remove button, or
to Add player if none remains. A player may not be removed below two in a
competitive match.

### 4.3 Match controls

- `Format` is a three-option segmented group: Classic, Cup, Team Clash.
- Team Clash is enabled only at 2, 4, 6, or 8 players. At an unsupported count,
  leave the option focusable with `aria-disabled="true"`; activation announces
  `Team Clash needs 2, 4, 6, or 8 players.` No automatic player removal is
  allowed.
- Cup presents `Short` and `Full` only. Its lives and sudden-death settings are
  contract-defined and shown as read-only summary text, not editable controls.
- Team Clash presents a read-only summary: `Three flips per team. First to 11.`
  Do not expose implementation or debug controls for cancellation scoring.
- Classic retains the existing starting-life choices and approved options.
- `Mode` shows only unlocked choices. A locked mode is represented by a single
  lock-only tile with no adjacent explanatory copy. The visible unlocked label
  is exactly `INSANE MODE`, never `1 of 3` or any probability description.
- CPU difficulty is hidden, not merely disabled, when every player is Human.
  Revealing it does not move keyboard focus.

Changing format preserves names and customization. If a format invalidates a
control, retain its previous value for when the user returns but exclude it
from the start payload.

### 4.4 Setup focus order and acceptance

Focus order is Stats, Achievements, Online, then each seat card in row-major
order (name, Customize, Human/CPU, Remove), Add player, Match controls in visual
order, Practice, Start. Visual and DOM order must match.

Acceptance checks:

- Eight 14-grapheme names remain distinguishable; names ellipsize only in
  summaries, never in editable fields.
- At 1280 x 720 and larger, P1–P8, the selected format summary, and Start are
  visible simultaneously at default text size.
- At 360 x 740 and 200% text zoom, there is no horizontal page scroll and Start
  remains reachable in the sticky footer.
- Starting with an invalid name focuses the first invalid seat and does not
  partially start a match.

## 5. Customize

Customize is a full screen, not a modal over Setup. Its header reads
`Customize Pn · <player name>` and contains Back. The footer contains `Cancel`
and `Apply`. Selection changes are a draft until Apply; Cancel/Back restores
the entry state. Applying returns to the invoking seat card and announces the
selected unlocked object, variant, and cosmetic.

The content begins with a seat switcher (`Previous player`, current `P#`, `Next
player`) followed by four tabs:

1. `Object`
2. `Variant`
3. `Cosmetic`
4. `Arena` (global, visibly labelled `Applies to everyone`)

Switching players keeps each player's draft. Arena is one shared draft and is
not copied per player. Each tab has one selection, except `Cosmetic`, which
also offers unlocked `None`. Variants show the 12 immediately available
variants for the selected unlocked object. Non-Alien objects use preview art
only; no size/collision claims appear in UI.

Gallery columns are 2, 4, 6, 6, 8, and 10 at the six required viewports in
order. An unlocked tile contains preview, name, and selected indicator. A
locked tile follows section 2.1 and occupies the same dimensions without
revealing art. The selected state uses border plus a check icon and
`aria-pressed="true"`, not color alone.

At 1280 x 720 and larger, the header, tabs, first gallery row, and footer are
all visible; only the gallery scrolls. At 360 x 740, the seat switcher and tabs
wrap to two rows without horizontal scrolling. The active tab is never moved
off screen.

Grid focus uses one tab stop and arrow keys. Home/End move to the first/last
tile in the row; Ctrl+Home/Ctrl+End move to the first/last tile in the grid.
Enter/Space selects an unlocked tile. A locked tile remains arrow-focusable;
activation announces only `Locked`. Changing tabs focuses the selected tile,
or the first unlocked tile if no selection exists.

## 6. Stats

Stats is explicitly labelled `Stats · This device`. Directly beneath it, show
`Stored only on this device.` Stats instrumentation is observational and this
surface must never roll gameplay RNG, construct physics bodies, or change
scores, turns, progression, or achievements.

### 6.1 Included data

The default dataset includes qualifying local and online matches and excludes
forced/test play. A clearly labelled `Include practice` checkbox is off by
default. Forced/test data is never offered as a filter and never appears in
default totals. If imported data is present, it participates only after UUID
deduplication.

The filter rail contains, in order:

- Period: All time, Last 30 days, Last 20 matches.
- Format: All, Classic, Cup, Team Clash.
- Players: All players or one known stable player identity; duplicate names
  include seat/color context.
- `Include practice`.
- `Clear filters`.

Filters update only after `Apply filters` at widths below 900 px; on wider
screens they update immediately and the polite region announces the new flip
count.

### 6.2 Views and exact measures

Tabs are `Overview`, `Players`, `Events`, and `Distributions`.

- Overview shows Recorded flips, Makes, Make rate, Cap landings, Longest make
  streak, and Matches. Make rate is always rendered as all three of count,
  fraction, and percentage, for example `243 makes · 243/500 · 48.6%`.
- Players is a sortable table: player, flips, makes, fraction, percentage, cap
  landings, best streak, and matches. Default sort is flips descending; sort
  state is included in each header's accessible name.
- Events lists discovered event names only. Each row shows observed count,
  `count / eligible recorded flips`, observed percentage, and success outcome
  distribution when applicable. Undiscovered events are absent—there are no
  placeholder rows from which a user could infer names or count.
- Distributions contains observed landing outcomes (upright, cap, miss, other
  contract-defined verdicts), streak length, flips per match, and match
  duration. Every chart is paired with a `View data table` disclosure containing
  the exact bins, counts, fractions, and percentages.

All percentage labels include `Observed`, and the page includes this note:
`Observed results describe games recorded on this device. They are not the
programmed chance of an event or outcome.` Do not display expected values,
theoretical lines, normal denominators, `1 in N`, event registry order, hidden
event names, or Insane probability. A zero denominator renders `No recorded
flips`, never `0%`. Percentages use one decimal below 10%, whole numbers from
10% upward, and preserve the raw counts so rounding cannot mislead.

At 360 px, metric cards are one column and tables use a labelled horizontal
scroll region with a frozen first column. At 768 px they are two columns; at
1280/1366 they are three; at 1920 and 4K they are four. Charts never encode a
result by color alone and expose text equivalents without requiring hover.

### 6.3 Local data actions

A collapsed `Local data` section follows results and is never sticky. It
contains:

- `Export .flipstats.json`.
- `Export CSV`; `Include display names` is off by default, and leaving it off
  pseudonymizes players.
- `Import .flipstats.json`; show files read, new records, duplicates skipped,
  and invalid records rejected before committing. A cancel leaves storage
  unchanged.
- `Delete local statistics`; require a typed `DELETE` confirmation and state
  that progression and achievements are unaffected. This is a general privacy
  control, not an administrator or teacher tool.

Imported/exported data controls are 48 px and keyboard reachable. Never place
raw JSON, UUIDs, or internal database controls in the normal UI.

## 7. Achievements

The header is `Achievements`; optional summary text may say `<n> earned`, but
must not state a denominator or number remaining. The view offers `All` and
`Earned` filters plus category filters whose names are already unlocked public
categories (All, Events, Classic, Cup, Team, Collection, Lab/Stats). Filters do
not reveal individual locked achievements.

Unlocked cards show icon, name, description, and earned date when known. Locked
cards follow section 2.1. They are not sorted in a way that exposes progression
thresholds. Newly earned cards appear first for the current visit and carry a
text `New` badge. There is no reward countdown, incomplete progress bar, reset
button, or shortcut to force its triggering condition.

Grid columns are 2, 4, 6, 6, 8, and 10 for the required viewports. The grid
uses the same roving keyboard behavior as Customize. When `Earned` has no
results, show `No achievements earned in this category yet.` and focus remains
on the active filter. A locked card's tooltip and accessibility tree expose
only `Locked`.

## 8. Online

Online has mutually exclusive `Join/Create` and `Lobby` states. Copy is
general-audience: `Play the same match on different devices using a room code.`
Do not mention school, classroom, teacher, or network implementation details.

### 8.1 Join/Create

Reading and focus order is Back, heading, Player name, Create room, Room code,
Join room. The six-character room-code input uses an uppercase visual style but
accepts pasted lowercase and normalizes it without moving the caret. It has a
visible label; placeholder text is not the label. Enter in the name field moves
to room code only when joining; Create remains an explicit action. Enter in a
complete room code submits Join.

Create/Join disable during the request and retain their width while their label
changes to `Creating…`/`Joining…`. Connection status is announced politely.
Errors appear inline near the relevant action, are announced assertively, do
not clear either input, and return focus only when the error requires editing.
`Try again` is a 48 px button. Never expose relay/debug query strings in error
copy.

### 8.2 Lobby

Lobby order is Back/Leave, heading, room code, `Copy code`, connection status,
player roster, then Start for the host. The code uses tabular text and grouped
letter spacing but is also available as plain text to assistive technology.
Copy announces `Room code copied` without a toast covering controls.

The roster shows up to eight 56 px rows with seat, color marker, name, and text
tags `Host`/`You`. At 1280 x 720 and larger it is a two-column 2 x 4 grid; at
768 x 1024 it is also two columns; at 360 x 740 it is one scrollable list whose
status and footer remain visible. Duplicate names retain seat labels.

Only the host sees Start. It is disabled until two players connect and its
visible reason is `Waiting for at least 2 players`. Guests instead see the
non-action status `Waiting for host to start`. If a player disconnects, keep
their row for the reconnection grace period and label it `Reconnecting`; do not
reorder seats. Leaving returns to Join/Create and returns focus to the name
field. Network play must not expose locked content belonging to another device.

## 9. Game Over and between-round flow

Game Over is a result screen, not a blocking modal. Results are announced once
through a polite live region after the heading receives focus. The winner is
represented by text plus player/team color; confetti or animation is optional
and follows section 11.

The content order is:

1. Result heading (`<name> wins`, `Team <name> wins`, or `Heat <n> complete`).
2. Mode/score summary.
3. Eight-player result table.
4. `This match` observed-stat summary.
5. Any already-earned unlock/achievement notices.

Player rows contain seat/color, name, final lives or mode score, observed makes
as `count/fraction/percentage`, and best streak. Eight rows render in two
columns at 768 px and wider and one column at 360 px. At 1280 x 720, use compact
56 px rows; all eight rows plus the result heading and action footer are visible
without player-list or page scrolling. At 360 px, the main result area scrolls
while the action footer remains available.

Mode-specific behavior:

- Classic: primary action `Rematch`; secondary actions `Rotate first player`,
  `Shuffle order`, and `Change setup`. Rematch uses identical rules and keeps
  customization. Rotate and Shuffle change only next-match order and show the
  proposed order before confirmation.
- Cup, after heat one or two without a series winner: this is a compact heat
  result state, headed `Heat <n> complete`. Show series markers and the next
  opener. Primary action is `Next heat`; there are no Rematch/Shuffle actions.
  Lives reset and opener rotation come from the game contract, not UI state.
- Cup, after a player reaches two heat wins: heading is `<name> wins the Cup`.
  Primary action `New Cup`; secondary `Change setup`. Show all heat results and
  no misleading per-heat survivor as the overall winner.
- Team Clash: heading is `Team <name> wins · <score>–<score>`. Primary action
  `Rematch`; secondary actions `Swap teams` and `Change setup`. Swap Teams shows
  the proposed roster before applying and never changes the 2/4/6/8-player
  constraint.
- Online guest: replace replay actions with `Waiting for host`. Online host may
  start the relevant rematch; every peer sees the same proposed order/team
  change before it begins.

The sticky footer's last action is `Main menu`; it requires confirmation only
if a Cup is unfinished or an online room is still active. No automatic rematch
countdown is allowed. Award reveals occur after result acknowledgement and
before a new match starts; they may identify only content now unlocked and must
not reveal the next locked reward.

## 10. Detailed focus management

Screen-specific focus follows sections 4–9 plus these global behaviors:

- Screen route: heading first programmatically, then the first visible action
  in DOM order on Tab.
- Dialog (discard, delete, leave): focus its heading, trap Tab within it, Escape
  selects Cancel, and restore the opener after close. Destructive confirmation
  is last in DOM/visual order.
- Roving grid: only the active/selected tile has `tabindex="0"`; all others are
  `-1`. Arrow navigation follows visual rows, including across responsive
  reflow. Disabled/locked mystery tiles remain arrow-reachable and announce
  `Locked`, but cannot be selected.
- Tabs: one tab stop for the tablist; Left/Right changes focused tab, Home/End
  move first/last, Enter/Space activates. Focus does not jump into the panel
  until the user Tabs.
- When a player is added, focus their name. When an import finishes, focus its
  result summary. When a result filter empties a grid, focus the filter that
  caused it.
- Sticky headers/footers use `scroll-padding-block` so focused content is never
  covered. Horizontal table scroll never steals vertical page scrolling.
- Do not use positive `tabindex`, focus on hover, or focus movement solely due
  to live data/animation.

## 11. Reduced motion and sensory accessibility

Reduced motion is active when either the in-app setting is on or
`prefers-reduced-motion: reduce` matches. The in-app choice may strengthen, but
never override, an OS reduce request.

When active:

- Screen changes, cards, tabs, lists, charts, trophy/confetti, unlock reveals,
  selection indicators, and toasts transition immediately.
- Disable shake, bounce, pulse, parallax, auto-scrolling, smooth scrolling, and
  animated chart drawing. Show final values and unlock art statically.
- Gameplay physics and scoring stay identical. Essential event state is
  communicated with a persistent text label and static high-contrast visual;
  removing an effect must not make its gameplay impact unknowable.
- No status depends on animation, sound, color, emoji, or canvas alone. Make,
  miss, turn, mode, lock, host, connection, selection, and winner states all
  have text equivalents.

At all settings, avoid flashes or full-screen contrast reversals faster than
three times per second. Audio has a persistent accessible mute control during
play; no non-game screen auto-plays sound.

## 12. Implementation and QA gates

The implementation is accepted only when all checks pass:

1. Automated DOM scan finds no locked tile with text other than the lock glyph
   and no accessible name other than `Locked`; source markup contains no
   threshold or locked-name attributes used by the UI.
2. Automated target scan at every required viewport reports every enabled
   action at least 48 x 48 CSS px (64 px for primary controls at 4K).
3. Playwright keyboard-only paths complete Setup, Customize Apply/Cancel,
   Stats filtering/table disclosure/export/import cancel, Achievements filters,
   Online Create/Join error recovery, and every Game Over branch.
4. Screenshot tests cover 2 and 8 players at all six viewports, standard and
   reduced motion, with 14-grapheme Unicode names and duplicate names. There is
   no horizontal page overflow.
5. At 1280 x 720, 1366 x 768, 1920 x 1080, and 4K, eight-player Setup and Game
   Over show all seats plus their primary action without scrolling the list.
6. Axe or equivalent reports no critical/serious issues; manual checks verify
   focus restoration, live-region announcements, screen-reader lock privacy,
   200% text zoom, high contrast, and touch operation from the board edges.
7. Stats values reconcile exactly with an independently counted fixture.
   Observed screens contain no denominators from the event registry and reveal
   no undiscovered event name.
8. Invalid/control/bidi/obfuscated names and names over 14 graphemes all receive
   the same visible error. Exact allowlisted names work without visible hints.
9. No covered screen contains teacher controls, forced-event controls, unlock
   editing, progression reset, theoretical probability, or third-party
   analytics.
10. The web build and APK display `v111` on each state and produce the same
    layout decisions from the same release commit.

## 13. Baseline gaps implementers must remove

These are observations about the inspected v110 baseline, not approvals to
change gameplay:

- Setup is one narrow, tall card; each player's 12 color swatches make an
  eight-player setup unnecessarily long. The v111 layout moves color into the
  dedicated Customize screen.
- Locked character tiles currently expose a threshold, some locked color
  tooltips expose names, and locked achievements generally expose names and
  descriptions. The locked Insane option exposes both its name/unlock relation
  and, when available, its programmed rate. All conflict with section 2.1 and
  the v111 contract.
- Character unlock reveals currently identify ladder win numbers. Retain the
  earned art/name reveal but remove ladder position text.
- Several current controls are 40 or 44 px and native checkbox/radio visuals
  are 16 or 20 px. Their v111 interactive labels/hit boxes must reach 48 px.
- Records and achievements are embedded at the bottom of Setup. v111 separates
  Stats and Achievements so setup remains usable with eight players.
- Current online copy is classroom-specific and current error copy exposes a
  relay/debug query. Use the general-audience, recovery-oriented copy in
  section 8.

No conflict was found between the requested smartboard behavior and
`docs/v111-contract.md`. Where this document is more specific, it implements
that contract's privacy, local-stats, progression-mystery, version, and
accessibility requirements without changing game rules.
