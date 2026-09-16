# Data layer — build notes

Schema, loader, dropzone, normalization and dedupe (PLAN.md section 7,
step 1). The UI layer notes are in the second half of this file.

## Running it

```bash
npm run dev        # http://localhost:3000
npm test           # 218 tests
npm run typecheck
```

`PSTATS_DIR` is set to `./data` in `.env.local`, which holds real schema-2
chapter files. `./sample` still holds the older schema-1 session files and
both formats load side by side. For live game data, point it at a symlink:

```bash
ln -s "/path/to/Left 4 Dead 2/left4dead2/ems/pstats" ./data
```

## Files

| File | Role |
|---|---|
| `src/lib/schema.ts` | zod schema. Permissive by design. |
| `src/lib/normalize.ts` | Raw → `NormalizedSession`. Recomputes totals. |
| `src/lib/store.ts` | Dedupe by `session_id`, merged store, ordering. |
| `src/lib/loader.server.ts` | `PSTATS_DIR` directory reader. Server-only. |
| `src/lib/uploads.ts` | Dropzone parsing + `localStorage` cache. |
| `src/lib/summary.ts` | Text rendering, used by the tests + diagnostics. |
| `src/lib/metrics.ts` | Every derived number. Pages do no arithmetic. |
| `src/lib/chapterfile.ts` | Schema 2 → schema-1 `RawSession`. Run folding. |
| `src/lib/breakdowns.ts` | Infected, throwables, weapons, chapter, campaign. |

## Where PLAN.md and the data disagreed

Recorded here so the next step does not re-litigate them.

1. **`sample/`, not `samples/`, and four files, not three.** The fourth is
   `2026-09-13_0220-0004_l4d_dam01_riverbank_coop.json`: a custom/Workshop
   campaign, `official: false`, Hard, 3 chapters, one wipe, finale win. It is
   the most important fixture for the custom-map requirement.

2. **`difficulty` and `gamemode` are not enums.** Both are raw cvar reads
   with an `"unknown"` fallback (`util.nut:216`, `util.nut:211`). Parsed as
   `z.string()`. The cvar says `Impossible`; the game says **Expert**, and
   `Hard` displays as **Advanced** — see `difficultyLabel`.

3. **No sample pair shares a `session_id`,** so the dedupe case from
   PLAN.md section 8 has no real fixture. `_current.json` is session
   `...-0004` / campaign `c5`, which no archive carries. Also note the
   archive filename is derived from `session_id + campaign + gamemode`
   (`main.nut:425`) *specifically* so re-archiving overwrites rather than
   duplicating — the collision only exists while `_current.json` still holds
   an already-archived session. Covered with synthetic fixtures in
   `test/store.test.ts` and a real on-disk case in `test/loader.test.ts`.

4. **`_current.json` is `c5`/Normal/1 human + 3 bots/2 chapters, and both
   chapters are `cleared`.** No sample anywhere has a chapter with
   `outcome: "in_progress"`. Incompleteness here is the *absence of a
   finale win*, not a running chapter. Both signals are supported;
   `in_progress` is covered synthetically.

5. **The `session_id` sort fallback (section 1.5) does not hold.**
   `util.nut:107` emits `s412330-0004` with no wall clock. Those sort after
   every `2026-*` id and carry no time information. Ordering is
   `started_utc` → `updated_utc` → `session_id`, with `timeApproximate`
   exposed so the UI can say the order is a guess.

6. **Two undocumented top-level fields:** `official` and
   `pending_transition`, present only on the custom-map file. `official` is
   the custom-vs-Valve signal; it is optional and re-derived from the map
   name (`isOfficialMapName`, mirroring `util.nut:185`) when absent.

## Deliberate deviation: totals are recomputed

PLAN.md section 1.3 says to read the file's `totals`. Verified byte-exact
against the sum of chapters for all four samples — every scalar and every
open-map key.

Kept anyway, but **`totals` is recomputed from `chapters`** and the file's
version is preserved as `totalsRaw`. Reasons:

- A file caught mid-write, or a future change to the mod's merge rule, would
  desync silently, and a campaign-totals tab disagreeing with the sum of its
  own chapter tabs is a miserable bug to chase.
- Recomputing turns the invariant into a test (`totalsDrift`) rather than an
  assumption.

The recompute reproduces `PST.MergeInto` (`main.nut:161`) exactly, including
the rule that **strings and bools take the newer value** — a player who
renames mid-campaign shows their final name. That is why the two stay
identical rather than diverging on names.

## Stats requested on later pages that are NOT derivable

Flag before designing those pages.

- **"Survival rate (chapters cleared without going down)"** — not
  derivable. Chapters carry per-player `incaps`/`deaths` counts, but the
  `outcome` is team-wide; there is no per-player "survived this chapter"
  field. The honest nearby metric is *chapters in which this player was
  never incapped or killed* — call it "clean chapters", not survival rate.
- **"Kills per shot as an accuracy proxy"** — `shots_fired` counts
  `weapon_fire`, which includes melee swings and throwables. Computable, but
  the label needs a caveat.
- **Headshot % per type** — `headshots` and `kills` are independently keyed
  maps, so a type can carry headshots with zero kills in the same table.
  Guard ratios against exceeding 100% rather than assuming the invariant.
- **Sparse fields.** `witch_oneshots` is 0 in every sample;
  `rescues`, `saves`, `pills_given`, `defibs_used` are 0 or near-0. Don't
  design columns around them.

## Consumer rules the types now enforce

- `NormalizedPlayer.key` is the identity. `steamid` is `""` for bots and for
  the `NAME:` fallback — never key off it.
- Every nested stat table is `Record<string, number>`; unknown keys parse
  and are preserved. Never index a fixed list.
- Roster size is not team size: c2 has 5 roster entries for a 4-slot
  campaign (a player left, a bot took over).
- A bad file becomes a `ParseFailure` in `store.failures` with a readable
  message. One corrupt file never takes down the directory.

---

# UI layer — design notes

Steps 2–6 of PLAN.md section 7: metrics module, campaign detail, overview,
player profile, friendly-fire matrix, design pass.

## Visual direction

PLAN.md section 6 pins most of the axes (near-black, one accent, no
gradients/glass/glow, tabular numerals, minimal rules, desktop-first), so
the remaining freedom went into typeface pairing, the structural device, and
the signature element. The reference point is a survival-horror **field
manual** rather than a gamer dashboard — L4D2's own vernacular is stencilled
military lettering and medical triage charts, not neon.

**Colour.** `#d94f3d` (harm) is reserved for friendly fire, deaths, incaps
and wipes. `#5eead4` (clear) is reserved for cleared chapters and revives.
Everything else is neutral grey. Players are never colour-coded by identity —
four-player palettes go muddy — so position plus label does that work.

**Type.** Oswald for display (condensed, stencil-adjacent, uppercase, used
only for names and headline numbers), Geist Sans for UI, Geist Mono for keys,
map slugs and Steam IDs.

**Signature: the Casualty Strip** (`src/components/CasualtyStrip.tsx`). One
band per campaign; each chapter is a segment whose width is its real
duration, tinted by outcome, with a tick per incap and a heavier tick per
death. It answers the question you actually have after a session: where did
this run go wrong? It encodes real structure — chapters are genuinely
ordered, durations genuinely vary, casualties genuinely cluster.

**The deliberate risk: the difficulty overprint.** Difficulty is a stencil
*stamp*, not a badge, and contrast climbs with rank — Expert gets rotation
plus a double rule in the harm tone; Easy is barely there. Section 6 demands
that an Expert run with wipes not look like a Normal walkthrough, and type-
as-texture delivers that without gradients or glow.

## Design decisions worth keeping

- **Numbering is only used where order is real.** Chapters are a sequence, so
  `01/02/03` earns its place on the tabs and strip. No decorative numbering
  anywhere else.
- **A missing value renders as an em dash, never 0.** "No shots fired" and
  "0% accuracy" are different claims. `formatMaybe`/`formatPercent` enforce
  this, and nulls always sort last regardless of direction.
- **FF damage is toned relative to the table.** Everyone clips a teammate
  eventually; colouring every non-zero row red says nothing. Only the worst
  half of the visible range gets the warm tone.
- **The friendly-fire ledger distinguishes one-way from mutual.** In these
  fixtures every pair only fires one way, so a split bar would read 100% on
  every row and carry no information. One-way rows get a magnitude bar
  instead; only a genuine exchange gets the split.
- **The legend appears where the strip is the subject**, not on the overview
  hero where the ticks read fine alone.
- **Per-player breakdowns are splits, never a second implementation.**
  `playerInfectedBreakdowns` and friends call the same `infectedBreakdown` /
  `throwableBreakdown` / `weaponBreakdown` with a one-player roster, because
  those already take an array and treat one record and a whole roster
  identically. A per-player column computed a second way would eventually
  disagree with the total beside it, and a table whose rows do not sum to its
  own footer is worse than no table. Tests assert the sum both ways.
- **Playtime is the one thing that does not sum across players.** The roster
  breakdowns take the *max* (players share wall-clock time, they do not
  accumulate it), so a per-player rate like `specialsPerMinute` is against
  that player's own clock. Correct per row, wrong for a footer — which is why
  the per-player tables carry the rate and the team rate stays with the
  roster-scoped call.
- **Per-player item and infected columns are derived from the scope.** Only
  types and items that actually appear get a column: rendering all eight
  specials always would make a No Mercy run look mostly empty and bury the
  two columns carrying the run. A player who used *nothing* still gets a row,
  because "brought nothing to this fight" is a real finding.

## Threat score: ranking vs magnitude

`threatProfile` tiers its score so outcomes can never be outweighed by raw
damage — a hunter that killed you ranks above a tank that chipped 900 off
you. A test caught the original flat weighting getting this backwards.

Because the score is tiered, **its magnitude is meaningless as a bar
length**, so the player page's bars encode `damage` (a real quantity) while
`score` only sets the order. Don't wire bars to `score`.

## Still not derivable — do not add these

Unchanged from the data-layer findings, and now reflected in the UI:

- There is **no survival rate**. The player page says "Clean chapters"
  (chapters with no incap and no death) because chapter outcome is team-wide
  and no per-player survived flag exists. Keep the name honest.
- **Kills per shot is labelled a rough proxy, not accuracy**, with the
  `weapon_fire` caveat stated on the page rather than buried here.
- Headshot rate is guarded against exceeding 100% since the two tables are
  keyed independently.

## Verified

- 257 tests pass (`npm test`); `npm run typecheck` and `next build` clean.
- No horizontal page overflow at 390 / 768 / 1440. Wide content (tables, the
  FF matrix) scrolls inside its own container; `html` never does.
- One `h1` per page, `aria-sort` on every sortable header, a real
  tablist/tab/aria-selected structure on chapter tabs, visible focus rings,
  `prefers-reduced-motion` respected.
- Empty state, parse-failure state and dedupe notice all render as designed
  (verified against a directory containing a truncated file and a non-PSTATS
  file alongside a good one).

---

# Schema 2 — one file per chapter

The addon in `scripts/pstats_addon.vpk` writes a different format from the
one the `sample/` fixtures use. Extracted and read the VScript source to
confirm, rather than inferring from two files.

## What changed

Schema 1 wrote a whole session per file: a `chapters` array plus a
precomputed `totals` map, rewritten on every save. **Schema 2 writes one
file per chapter** (`No-Mercy--Run-0002--Chapter-01.json`, `main.nut:480`)
and never writes a campaign-level file at all. A campaign exists only as the
set of files sharing a run.

- **Join key is `run` + `session_id`** (`main.nut:494`). `run` alone
  collides across game sessions that reach the same sequence number.
- `chapter_number` is from the map name (`c8m2_subway` → 2) and is what to
  display; `chapter_index` is position in the run. They diverge on custom
  campaigns, where the mod falls back to the index (`main.nut:482`).
- There is **no wall clock anywhere** in schema 2 — no `started_utc`, no
  `updated_utc`, no `saves`. Ordering falls back to `session_id` and
  `timeApproximate` is always true. Dedupe-by-`saves` cannot apply.

`src/lib/chapterfile.ts` adapts schema 2 back into the schema-1
`RawSession` shape, so the metrics layer, every page and all the original
tests needed no schema-2 branch. `normalizeSession` then recomputes totals
from the folded chapters exactly as before.

## The bug that made every real file unreadable

**Squirrel's `StringToFile` appends a NUL terminator.** Every file the mod
writes ends `}\0`, and `JSON.parse` rejects it at the byte after the closing
brace. The old loader therefore failed on 100% of real output while passing
all its tests, because the hand-made `sample/` fixtures had been cleaned.
`stripFileArtifacts` removes a trailing NUL and a leading BOM; both are
producer artefacts, not content.

Worth noting the failure mode was silent in a second way: once the NUL is
stripped, the permissive `SessionSchema` *accepts* a chapter file and
returns a session with **zero chapters**, because schema 2 has no `chapters`
key. A file that parses to nothing is worse than one that fails, so
`isChapterFile` tests shape (`map` + `players`, no `chapters`) rather than
the `schema` number — the version is the thing most likely to change next.

## Weapon breakdowns are NOT derivable — do not add them

Flagged because it was explicitly requested and the slot now exists in the
UI as an empty state.

`params.weapon` is read at **exactly one place** in the whole addon:
`OnGameEvent_weapon_fire`, `events.nut:496`. The value is kept only when it
names one of three throwables (`::PST.THROWABLES`, `events.nut:479`) and is
discarded otherwise. There is no per-weapon kills table, no per-weapon
damage, and no weapon field on any kill or damage event. `shots_fired` is a
single undifferentiated counter that also counts melee swings and throws.

So per-weapon kills, damage and accuracy cannot be recovered from these
files at all. `weaponBreakdown` reports the totals that do exist and states
the gap plus the mod change that would close it. **Do not synthesise a
weapon table from the global shot counter.**

## Other producer facts worth keeping

- `items_used` is one table holding two different kinds of thing:
  throwables counted on `weapon_fire`, and consumables (`pain_pills`,
  `adrenaline`, `defibrillator`) counted on their own events. Split for
  display — "threw 4 pipe bombs" and "took 2 pills" answer different
  questions.
- `grabbed_by` stores a pin and its escape in the same table, the escape
  under a `<kind>_escaped` key (`PinFree`, `events.nut`). Splitting it is
  mandatory or every pin double-counts as its own escape.
- `common_by_explosion` is a separate kill key, folded into the common row.
  It is the only throwable *outcome* recorded, and it is **not attributed to
  the thrower**.
- Witch damage is recorded as taken but not as dealt, so a witch row shows
  kills with an em-dash for damage dealt. That is real, not a bug.

## A metric that was mislabelled

`campaignMetrics.retries` counts **extra round starts**, not chapters. The
real run has 4 round starts across 2 chapters, so `retries` is 2 while only
**one** chapter was actually replayed. The header had been rendering it as
"2 replayed". Added `retriedChapters` for the per-chapter figure and pointed
the label at it.

## Verified

- 218 tests pass; `npm run typecheck` and `next build` clean.
- No horizontal page overflow at 390 / 768 / 1440 on any route. Tables and
  the nav scroll inside their own containers; `html` never does.
- One `h1` per page, `aria-selected` on every tab, a caption or `aria-label`
  on every table.
