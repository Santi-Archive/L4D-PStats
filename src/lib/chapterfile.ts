import { z } from "zod";
import { PlayerSchema, type RawSession } from "./schema";

/**
 * Schema 2: one file per chapter, not one file per campaign.
 *
 * The mod changed shape. Schema 1 wrote a whole session — a `chapters`
 * array plus precomputed `totals` — into a single file that was rewritten
 * as the run progressed. Schema 2 writes each chapter to its own file
 * (`No-Mercy--Run-0002--Chapter-01.json`, main.nut:480) and never writes a
 * campaign-level file at all. The campaign only exists as the set of files
 * that share a run.
 *
 * Rather than teach every downstream consumer about two shapes, this module
 * adapts schema 2 back into the schema-1 `RawSession` the rest of the app
 * already understands: group the chapter files of one run, sort them, and
 * hand back a session whose `chapters` array is what the mod would have
 * written had it still written sessions. `normalizeSession` then recomputes
 * totals from those chapters exactly as before, so the metrics layer, the
 * pages and the tests need no schema-2 branch anywhere.
 *
 * The join key is `run` + `session_id` (main.nut:494). Both are carried on
 * every chapter file of a playthrough precisely so the files can be
 * reassembled; `run` alone would collide across separate game sessions that
 * happened to reach the same sequence number.
 */

/** A number that survives a float, a numeric string, or junk. */
const statNumber = z.preprocess((v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return v;
}, z.number());

const count = statNumber.default(0);

const RosterEntrySchema = z
  .object({
    key: z.string().default(""),
    name: z.string().default(""),
    character: z.string().default(""),
    is_bot: z.boolean().default(false),
  })
  .passthrough();

/**
 * A single chapter file.
 *
 * `chapter_number` is the number in the map name ("c8m2_subway" -> 2) and is
 * the one to display. `chapter_index` is the chapter's position in the run.
 * They diverge on custom campaigns, where the map name carries no number and
 * the mod falls back to the index (main.nut:482).
 */
export const ChapterFileSchema = z
  .object({
    schema: statNumber.default(2),
    session_id: z.string().min(1),
    run: count,
    sequence: count,

    campaign: z.string().default("unknown"),
    campaign_name: z.string().default(""),
    official: z.boolean().optional(),
    gamemode: z.string().default("unknown"),
    difficulty: z.string().default("unknown"),
    event_route: z.string().default(""),

    chapter_number: count,
    chapter_index: count,
    map: z.string().default("unknown_map"),
    outcome: z.string().default("in_progress"),
    playtime_s: count,
    round_starts: count,

    /** Maps covered by this run so far, in order. */
    run_maps: z.array(z.string()).default([]),
    /** True once the run reached a finale or was abandoned. */
    run_closed: z.boolean().default(false),
    roster: z.array(RosterEntrySchema).default([]),

    players: z.record(z.string(), PlayerSchema).default({}),

    /** Per-chapter weapon attribution tally; summed across the run. */
    weapon_attribution: z
      .object({ from_event: count, inferred: count })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type RawChapterFile = z.infer<typeof ChapterFileSchema>;

/**
 * Does this JSON look like a schema-2 chapter file?
 *
 * Tested on shape, not on the `schema` field. A file is a chapter file when
 * it carries a top-level `map` and `players` but no `chapters` array — that
 * is true regardless of what version number the mod stamps on it, which
 * matters because the version is the thing most likely to change next.
 */
export function isChapterFile(json: unknown): boolean {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return false;
  }
  const o = json as Record<string, unknown>;
  if (Array.isArray(o.chapters)) return false;
  return typeof o.map === "string" && typeof o.players === "object";
}

/** The key that identifies the run a chapter file belongs to. */
export function runKey(f: RawChapterFile): string {
  return `${f.session_id}#${f.run}`;
}

/**
 * Order chapters within a run.
 *
 * `chapter_index` is the run's own ordering and is authoritative. The map
 * name is only a tiebreak, because a run that revisits a map (a restart
 * after a wipe) produces two files with the same number.
 */
function compareChapterFiles(a: RawChapterFile, b: RawChapterFile): number {
  if (a.chapter_index !== b.chapter_index) {
    return a.chapter_index - b.chapter_index;
  }
  if (a.chapter_number !== b.chapter_number) {
    return a.chapter_number - b.chapter_number;
  }
  return a.map.localeCompare(b.map);
}

/**
 * Fold the chapter files of one run into the session shape schema 1 used.
 *
 * Campaign-level scalars are read from the newest file rather than the
 * first. A run's difficulty or gamemode can legitimately change mid-run
 * (a player alters a cvar between chapters), and the last chapter is the
 * state the run ended in — the same "newer wins" rule `mergeInto` already
 * applies to player names.
 *
 * `totals` is deliberately left empty: `normalizeSession` recomputes it
 * from `chapters`, and an empty `totalsRaw` is the honest representation of
 * a format that never wrote totals to begin with.
 */
export function foldRun(files: RawChapterFile[]): RawSession | null {
  if (files.length === 0) return null;

  const sorted = [...files].sort(compareChapterFiles);
  const last = sorted[sorted.length - 1];
  if (last === undefined) return null;

  const chapters = sorted.map((f) => ({
    map: f.map,
    // Display number where the map name has one, run position otherwise.
    index: f.chapter_number > 0 ? f.chapter_number : f.chapter_index,
    started_utc: 0,
    playtime_s: f.playtime_s,
    round_starts: f.round_starts,
    outcome: f.outcome,
    players: f.players,
  }));

  // Outcomes are a tally in schema 1 and a per-chapter string in schema 2.
  // Rebuild the tally, mapping "cleared" to the "map_cleared" key the mod
  // used (events.nut) so `complete` and `wipes` keep working untouched.
  const outcomes: Record<string, number> = {};
  for (const f of sorted) {
    const key = f.outcome === "cleared" ? "map_cleared" : f.outcome;
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }

  const playtime = sorted.reduce((n, f) => n + f.playtime_s, 0);
  const roundStarts = sorted.reduce((n, f) => n + f.round_starts, 0);

  // Attribution is a tally, so it sums across chapters like any other
  // counter. Left undefined when no chapter carried one, so an older run
  // reports "unknown" rather than a fabricated zero-inference record.
  const attributed = sorted.filter((f) => f.weapon_attribution !== undefined);
  const weaponAttribution =
    attributed.length > 0
      ? {
          from_event: attributed.reduce(
            (n, f) => n + (f.weapon_attribution?.from_event ?? 0),
            0,
          ),
          inferred: attributed.reduce(
            (n, f) => n + (f.weapon_attribution?.inferred ?? 0),
            0,
          ),
        }
      : undefined;

  return {
    schema: last.schema,
    session_id: last.session_id,
    // Schema 2 carries no wall clock at all. Ordering falls back to the
    // session id, and `timeApproximate` reports that to the UI.
    started_utc: 0,
    updated_utc: 0,
    campaign: last.campaign,
    gamemode: last.gamemode,
    difficulty: last.difficulty,
    playtime_s: playtime,
    round_starts: roundStarts,
    saves: 0,
    outcomes,
    chapters,
    totals: {},
    events_seen: {},
    official: last.official,
    weapon_attribution: weaponAttribution,
  } as RawSession;
}
