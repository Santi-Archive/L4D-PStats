import { z } from "zod";

/**
 * Zod schema for the JSON that the PSTATS VScript addon writes.
 *
 * The governing rule here is that this data is best-effort telemetry from a
 * game engine, not an API contract. The producer builds its nested tables by
 * key as events fire, so:
 *
 *   - a key is absent when the thing never happened (not zero, absent)
 *   - keys we have never seen can appear at any time (new infected type,
 *     a raw classname that failed lookup, "unknown")
 *   - fields the producer added after this file was written must not break
 *     older files, and vice versa
 *
 * So every nested stat table is an open `Record<string, number>`, never an
 * enum, and unknown keys are preserved rather than stripped. A file that is
 * merely unfamiliar should parse; only a file that is structurally wrong
 * should fail.
 */

/** A number that survives the engine handing us a float, a string, or junk. */
const statNumber = z.preprocess((v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return v;
}, z.number());

/**
 * An open-ended stat table: `kills`, `damage_taken`, `grabbed_by`, etc.
 *
 * Never index these against a fixed list of infected types. Non-numeric
 * values are dropped rather than failing the whole file — one bad key in
 * one player's `killed_by` map should not cost you the campaign.
 */
const statTable = z.preprocess((v) => {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}, z.record(z.string(), z.number()));

/** Scalar that defaults when the producer omitted it. */
const count = statNumber.default(0);

/** Directional pair record. Only exists where an interaction happened. */
export const PairSchema = z
  .object({
    ff_damage_to: count,
    ff_damage_from: count,
    revived: count,
    revived_by: count,
    healed: count,
    healed_by: count,
    saved: count,
    saved_by: count,
    shoved: count,
    incapped: count,
    killed: count,
  })
  // Passthrough: a new pair metric in the mod should show up, not vanish.
  .passthrough();

/**
 * One weapon's record, from schema 2's `weapons` table.
 *
 * Same open-table discipline as everywhere else: the mod keys this by the
 * raw `params.weapon` string, so the keys are whatever the engine calls a
 * weapon on the player's build — including things that are not guns at all
 * (`gascan`, `inferno`, `entityflame`, and the throwables). Callers must
 * classify by key rather than assume a fixed roster.
 */
export const WeaponSchema = z
  .object({
    shots: count,
    reloads: count,
    hits: count,
    damage: count,
    kills: count,
    headshots: count,
    ff_damage: count,
    /**
     * How much of this row was attributed by inference rather than read
     * from the event. The mod falls back to the player's last-fired weapon
     * when a kill or damage event carries no weapon field, which is most of
     * them — so this is not a footnote, it is the accuracy of the row.
     */
    inferred: count,
  })
  .passthrough();

export const OffenseSchema = z
  .object({
    shots_fired: count,
    reloads: count,
    total_kills: count,
    witch_oneshots: count,
    ff_damage: count,
    ff_incaps: count,
    ff_kills: count,
    kills: statTable.default({}),
    headshots: statTable.default({}),
    damage_dealt: statTable.default({}),
  })
  .passthrough();

export const DefenseSchema = z
  .object({
    deaths: count,
    incaps: count,
    times_revived: count,
    times_defibbed: count,
    heals_taken: count,
    fall_damage: count,
    damage_taken: statTable.default({}),
    incapped_by: statTable.default({}),
    killed_by: statTable.default({}),
    grabbed_by: statTable.default({}),
  })
  .passthrough();

export const TeamworkSchema = z
  .object({
    revives_given: count,
    heals_given: count,
    pills_given: count,
    defibs_used: count,
    rescues: count,
    saves: count,
    pairs: z.record(z.string(), PairSchema).default({}),
  })
  .passthrough();

export const ActionsSchema = z
  .object({
    shoves: count,
    jumps: count,
    pickups: count,
    car_alarms: count,
    witches_startled: count,
    panic_events: count,
    gun_overheats: count,
    props_broken: count,
    gascans_poured: count,
    tank_rocks_hit_by: count,
    items_used: statTable.default({}),
  })
  .passthrough();

export const PlayerSchema = z
  .object({
    name: z.string().default(""),
    /**
     * May be "" even for a human, when the ID lookup failed and the record
     * is keyed "NAME:whatever". Never identify a player by this field —
     * use the key the record is stored under.
     */
    steamid: z.string().default(""),
    character: z.string().default(""),
    is_bot: z.boolean().default(false),
    playtime_s: count,
    offense: OffenseSchema.default({}),
    defense: DefenseSchema.default({}),
    teamwork: TeamworkSchema.default({}),
    actions: ActionsSchema.default({}),
    /**
     * Per-weapon breakdown. Added by the mod after schema 2 shipped, so it
     * is absent on every older file and defaults to empty rather than
     * being required — an old file must still parse.
     */
    weapons: z.record(z.string(), WeaponSchema).default({}),
  })
  .passthrough();

export const CHAPTER_OUTCOMES = [
  "cleared",
  "wipe",
  "finale_win",
  "in_progress",
] as const;

export type ChapterOutcome = (typeof CHAPTER_OUTCOMES)[number];

export const ChapterSchema = z
  .object({
    map: z.string().default("unknown_map"),
    index: statNumber.default(0),
    started_utc: count,
    playtime_s: count,
    round_starts: count,
    /**
     * Kept as a plain string, not an enum. The mod can record an outcome we
     * have not enumerated, and losing a whole campaign over an unfamiliar
     * outcome string would be absurd. Callers use `isChapterOutcome`.
     */
    outcome: z.string().default("in_progress"),
    players: z.record(z.string(), PlayerSchema).default({}),
  })
  .passthrough();

export const SessionSchema = z
  .object({
    schema: statNumber.default(1),
    session_id: z.string().min(1),
    started_utc: count,
    updated_utc: count,
    /** "c1" for official campaigns, or the raw map name for custom ones. */
    campaign: z.string().default("unknown"),
    /**
     * Raw `mp_gamemode` cvar, with the mod's own "unknown" fallback. Not an
     * enum: mutation/versus/realism/custom mutations all land here verbatim.
     */
    gamemode: z.string().default("unknown"),
    /**
     * Raw `z_difficulty` cvar: "Easy" | "Normal" | "Hard" | "Impossible",
     * or "unknown", or whatever a mod sets it to. Not an enum — see
     * `difficultyLabel` in normalize.ts for display handling.
     */
    difficulty: z.string().default("unknown"),
    playtime_s: count,
    round_starts: count,
    saves: count,
    outcomes: statTable.default({}),
    chapters: z.array(ChapterSchema).default([]),
    totals: z.record(z.string(), PlayerSchema).default({}),
    events_seen: statTable.default({}),
    /**
     * Undocumented in PLAN.md but written by the mod: false for custom and
     * Workshop campaigns, true for Valve's. Absent on older files, so it is
     * optional here and re-derived from the map name during normalization.
     */
    official: z.boolean().optional(),
    /** Mod-internal campaign-continuity flag. Not useful downstream. */
    pending_transition: z.boolean().optional(),
    /**
     * How the mod attributed weapon stats across the whole session:
     * `from_event` read the weapon off the event, `inferred` fell back to
     * the player's last-fired weapon. Absent before per-weapon tracking
     * existed. The UI reports this rather than hiding it — on the sample
     * runs inference is the majority, which is a real caveat on every
     * per-weapon number.
     */
    weapon_attribution: z
      .object({ from_event: count, inferred: count })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type RawSession = z.infer<typeof SessionSchema>;
export type RawChapter = z.infer<typeof ChapterSchema>;
export type RawPlayer = z.infer<typeof PlayerSchema>;
export type RawPair = z.infer<typeof PairSchema>;
export type RawWeapon = z.infer<typeof WeaponSchema>;

export function isChapterOutcome(v: string): v is ChapterOutcome {
  return (CHAPTER_OUTCOMES as readonly string[]).includes(v);
}
