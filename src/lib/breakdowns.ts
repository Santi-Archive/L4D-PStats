import type { NormalizedChapter, NormalizedSession } from "./normalize";
import type { StatsStore } from "./store";
import {
  SPECIALS,
  chapterLabel,
  sumTable,
  type Maybe,
} from "./metrics";

/**
 * Breakdowns: infected, throwables, weapons, chapters and campaigns.
 *
 * Same two rules as `metrics.ts` — never divide without guarding the
 * denominator, and never invent a stat the telemetry cannot support. The
 * second rule does real work here: see `weaponBreakdown`, which reports
 * that the mod does not record what it would need.
 */

function ratio(numerator: number, denominator: number): Maybe {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** Add every key of `src` into `dst`. */
function accumulate(
  dst: Record<string, number>,
  src: Record<string, number>,
): void {
  for (const [k, v] of Object.entries(src)) dst[k] = (dst[k] ?? 0) + v;
}

//---------------------------------------------------------------------
// Special infected and common
//---------------------------------------------------------------------

/**
 * One infected type, viewed from both sides of the fight.
 *
 * Dealt and taken live in the same row on purpose. A hunter you killed
 * twelve times for 40 damage is a different opponent from a hunter you
 * killed twice for 300, and splitting those into two tables hides it.
 */
export interface InfectedRow {
  key: string;
  /** Title-cased for display; the raw key stays for colour lookup. */
  label: string;
  kills: number;
  headshots: number;
  /** Guarded: kills and headshots are independently keyed tables. */
  headshotRate: Maybe;
  damageDealt: number;
  /** Damage this type absorbed per kill of it. */
  damagePerKill: Maybe;
  damageTaken: number;
  /** Times this type put someone into an incapacitated state. */
  incapsCaused: number;
  /** Times this type killed a survivor outright. */
  killsCaused: number;
  /** Pins: hunter pounces, smoker tongues, jockey rides, charger carries. */
  grabs: number;
  /** Pins the survivor broke out of unaided. */
  escapes: number;
  /** Guarded share of pins that ended in an escape. */
  escapeRate: Maybe;
}

const TITLE: Record<string, string> = {
  common: "Common",
  smoker: "Smoker",
  boomer: "Boomer",
  hunter: "Hunter",
  spitter: "Spitter",
  jockey: "Jockey",
  charger: "Charger",
  tank: "Tank",
  witch: "Witch",
  survivor: "Survivor",
  world: "World",
  fall: "Fall",
  teammate: "Teammate",
  common_by_explosion: "Common (explosion)",
  boomer_vomit: "Boomer vomit",
};

export function infectedLabel(key: string): string {
  if (TITLE[key]) return TITLE[key];
  return key
    .split("_")
    .map((w) => (w ? (w[0] ?? "").toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * `grabbed_by` stores pins and escapes in one table, the escape under a
 * "<kind>_escaped" key (events.nut, PinFree). Split it back apart so a
 * pin is never double-counted as its own escape.
 */
function splitGrabs(grabbed: Record<string, number>): {
  grabs: Record<string, number>;
  escapes: Record<string, number>;
} {
  const grabs: Record<string, number> = {};
  const escapes: Record<string, number> = {};
  for (const [k, v] of Object.entries(grabbed)) {
    if (k.endsWith("_escaped")) escapes[k.slice(0, -"_escaped".length)] = v;
    else grabs[k] = v;
  }
  return { grabs, escapes };
}

export interface InfectedBreakdown {
  /** Specials only, heaviest threat first. */
  specials: InfectedRow[];
  /** The common horde as a single row. */
  common: InfectedRow | null;
  /** Anything that is neither: world, fall, teammate, unrecognized keys. */
  other: InfectedRow[];
  totalSpecialKills: number;
  commonKills: number;
  /** Share of all kills that were specials. */
  specialShare: Maybe;
  /** Specials killed per minute of play. */
  specialsPerMinute: Maybe;
}

/**
 * Roll every player's tables into one infected ledger.
 *
 * Pass a single player's record for a personal view, or a whole chapter's
 * roster for a team view; the arithmetic is identical.
 */
export function infectedBreakdown(
  players: readonly {
    offense: { kills: Record<string, number>; headshots: Record<string, number>; damage_dealt: Record<string, number> };
    defense: {
      damage_taken: Record<string, number>;
      incapped_by: Record<string, number>;
      killed_by: Record<string, number>;
      grabbed_by: Record<string, number>;
    };
    playtime_s: number;
  }[],
): InfectedBreakdown {
  const kills: Record<string, number> = {};
  const headshots: Record<string, number> = {};
  const dealt: Record<string, number> = {};
  const taken: Record<string, number> = {};
  const incapped: Record<string, number> = {};
  const killedBy: Record<string, number> = {};
  const grabs: Record<string, number> = {};
  const escapes: Record<string, number> = {};
  let playtime = 0;

  for (const p of players) {
    accumulate(kills, p.offense.kills);
    accumulate(headshots, p.offense.headshots);
    accumulate(dealt, p.offense.damage_dealt);
    accumulate(taken, p.defense.damage_taken);
    accumulate(incapped, p.defense.incapped_by);
    accumulate(killedBy, p.defense.killed_by);
    const split = splitGrabs(p.defense.grabbed_by);
    accumulate(grabs, split.grabs);
    accumulate(escapes, split.escapes);
    playtime = Math.max(playtime, p.playtime_s);
  }

  // Every key seen on either side of the fight gets a row.
  const allKeys = new Set<string>([
    ...Object.keys(kills),
    ...Object.keys(headshots),
    ...Object.keys(dealt),
    ...Object.keys(taken),
    ...Object.keys(incapped),
    ...Object.keys(killedBy),
    ...Object.keys(grabs),
  ]);

  const row = (key: string): InfectedRow => {
    const k = kills[key] ?? 0;
    const hs = headshots[key] ?? 0;
    const g = grabs[key] ?? 0;
    return {
      key,
      label: infectedLabel(key),
      kills: k,
      headshots: hs,
      // Clamped: the tables are independent, so a stray headshot on a type
      // with no recorded kill must not render as 400%.
      headshotRate: k > 0 ? Math.min(hs / k, 1) : null,
      damageDealt: dealt[key] ?? 0,
      damagePerKill: ratio(dealt[key] ?? 0, k),
      damageTaken: taken[key] ?? 0,
      incapsCaused: incapped[key] ?? 0,
      killsCaused: killedBy[key] ?? 0,
      grabs: g,
      escapes: escapes[key] ?? 0,
      escapeRate: g > 0 ? Math.min((escapes[key] ?? 0) / g, 1) : null,
    };
  };

  const specials: InfectedRow[] = [];
  const other: InfectedRow[] = [];
  let common: InfectedRow | null = null;

  for (const key of allKeys) {
    const r = row(key);
    // A row that is all zeroes carries no information.
    if (
      r.kills === 0 &&
      r.damageDealt === 0 &&
      r.damageTaken === 0 &&
      r.grabs === 0 &&
      r.incapsCaused === 0 &&
      r.killsCaused === 0
    ) {
      continue;
    }
    if (key === "common" || key === "common_by_explosion") {
      common = common ? mergeRows(common, r) : { ...r, key: "common", label: "Common" };
    } else if ((SPECIALS as readonly string[]).includes(key)) {
      specials.push(r);
    } else {
      other.push(r);
    }
  }

  // Order specials by what they cost the team, not by how many died: a
  // charger that incapped someone outranks a boomer you shot twelve times.
  specials.sort(
    (a, b) =>
      b.killsCaused - a.killsCaused ||
      b.incapsCaused - a.incapsCaused ||
      b.damageTaken - a.damageTaken ||
      b.kills - a.kills,
  );
  other.sort((a, b) => b.damageTaken - a.damageTaken || b.kills - a.kills);

  const totalSpecialKills = specials.reduce((n, r) => n + r.kills, 0);
  const commonKills = common?.kills ?? 0;

  return {
    specials,
    common,
    other,
    totalSpecialKills,
    commonKills,
    specialShare: ratio(totalSpecialKills, totalSpecialKills + commonKills),
    specialsPerMinute: ratio(totalSpecialKills, playtime / 60),
  };
}

function mergeRows(a: InfectedRow, b: InfectedRow): InfectedRow {
  const kills = a.kills + b.kills;
  const headshots = a.headshots + b.headshots;
  const damageDealt = a.damageDealt + b.damageDealt;
  const grabs = a.grabs + b.grabs;
  const escapes = a.escapes + b.escapes;
  return {
    key: a.key,
    label: a.label,
    kills,
    headshots,
    headshotRate: kills > 0 ? Math.min(headshots / kills, 1) : null,
    damageDealt,
    damagePerKill: ratio(damageDealt, kills),
    damageTaken: a.damageTaken + b.damageTaken,
    incapsCaused: a.incapsCaused + b.incapsCaused,
    killsCaused: a.killsCaused + b.killsCaused,
    grabs,
    escapes,
    escapeRate: grabs > 0 ? Math.min(escapes / grabs, 1) : null,
  };
}

//---------------------------------------------------------------------
// Throwables and items
//---------------------------------------------------------------------

/**
 * `items_used` is one table covering two different kinds of thing:
 * throwables, counted on weapon_fire when the weapon is one of the three
 * the mod recognizes (events.nut:479), and consumables, counted on their
 * own events. They are split here because "threw 4 pipe bombs" and "took 2
 * pills" answer different questions.
 */
export const THROWABLE_KEYS = ["pipe_bomb", "molotov", "vomitjar"] as const;

/**
 * Everything a survivor carries and spends, in slot order: heal first, then
 * the pick-me-ups, then the revive.
 *
 * `first_aid_kit` is counted on heal_success. That event fires only for the
 * kit — pills and adrenaline raise their own events — so a heal is a kit,
 * and it is charged to the player who used it, exactly as pills and defibs
 * are. Older files predate this and simply have no `first_aid_kit` key,
 * which reads as "none used" rather than as a gap.
 */
export const CONSUMABLE_KEYS = [
  "first_aid_kit",
  "pain_pills",
  "adrenaline",
  "defibrillator",
] as const;

const ITEM_LABEL: Record<string, string> = {
  pipe_bomb: "Pipe bomb",
  molotov: "Molotov",
  vomitjar: "Bile bomb",
  first_aid_kit: "First aid kit",
  pain_pills: "Pain pills",
  adrenaline: "Adrenaline",
  defibrillator: "Defibrillator",
  // The engine's own spellings, folded to the canonical key below.
  medkit: "First aid kit",
  first_aid: "First aid kit",
  health_kit: "First aid kit",
};

/**
 * Fold the engine's alternate spellings onto one key.
 *
 * `params.weapon` is whatever the player's build calls the entity, so the
 * same item can arrive under more than one name. Counting those as separate
 * rows would split one item across the chart.
 */
const ITEM_ALIAS: Record<string, string> = {
  medkit: "first_aid_kit",
  first_aid: "first_aid_kit",
  health_kit: "first_aid_kit",
  pills: "pain_pills",
  molotov_projectile: "molotov",
  pipe_bomb_projectile: "pipe_bomb",
  vomitjar_projectile: "vomitjar",
};

export function canonicalItemKey(key: string): string {
  return ITEM_ALIAS[key] ?? key;
}

export function itemLabel(key: string): string {
  return ITEM_LABEL[key] ?? infectedLabel(key);
}

export interface ItemRow {
  key: string;
  label: string
  count: number;
  /** Share of the group this row belongs to. */
  share: Maybe;
}

export interface ThrowableBreakdown {
  throwables: ItemRow[];
  consumables: ItemRow[];
  /** Anything the mod logged that is neither. */
  other: ItemRow[];
  totalThrown: number;
  totalConsumed: number;
  /** Throwables used per chapter, the rate that actually varies. */
  thrownPerChapter: Maybe;
  /**
   * Common killed by explosion. The only throwable *outcome* the mod
   * records, and it is not attributed to the thrower.
   */
  commonKilledByExplosion: number;
  /** Heals performed. One heal is one first aid kit spent. */
  healsGiven: number;
  /** Pills handed to someone else, a subset of the pills row. */
  pillsGiven: number;
  /** True when the kit count came from heals because the file predates it. */
  kitsBackfilled: boolean;
}

export function throwableBreakdown(
  players: readonly {
    actions: { items_used: Record<string, number> };
    offense: { kills: Record<string, number> };
    /**
     * Heals are read for the first-aid-kit backfill. Optional and loosely
     * typed on purpose: callers pass whole player records, but the
     * arithmetic-only tests pass minimal ones, and neither should have to
     * fabricate fields this function only reads opportunistically.
     */
    teamwork?: { heals_given?: number; pills_given?: number };
  }[],
  chapterCount = 0,
): ThrowableBreakdown {
  const used: Record<string, number> = {};
  let explosionKills = 0;
  let healsGiven = 0;
  let pillsGiven = 0;
  for (const p of players) {
    // Canonicalise first, so two spellings of one item share a row.
    for (const [k, v] of Object.entries(p.actions.items_used)) {
      const key = canonicalItemKey(k);
      used[key] = (used[key] ?? 0) + v;
    }
    explosionKills += p.offense.kills["common_by_explosion"] ?? 0;
    healsGiven += p.teamwork?.heals_given ?? 0;
    pillsGiven += p.teamwork?.pills_given ?? 0;
  }

  // Files written before the mod counted kits carry heals but no
  // `first_aid_kit`. One heal is one kit, so the count is recoverable —
  // and doing it here means an old run shows kits instead of a blank.
  const kitsBackfilled = used["first_aid_kit"] === undefined && healsGiven > 0;
  if (kitsBackfilled) used["first_aid_kit"] = healsGiven;

  const pick = (keys: readonly string[]) =>
    keys
      .map((k) => ({ key: k, label: itemLabel(k), count: used[k] ?? 0, share: null as Maybe }))
      .filter((r) => r.count > 0);

  const throwables = pick(THROWABLE_KEYS);
  const consumables = pick(CONSUMABLE_KEYS);
  const known = new Set<string>([...THROWABLE_KEYS, ...CONSUMABLE_KEYS]);
  const other = Object.entries(used)
    .filter(([k, v]) => !known.has(k) && v > 0)
    .map(([k, v]) => ({ key: k, label: itemLabel(k), count: v, share: null as Maybe }));

  const totalThrown = throwables.reduce((n, r) => n + r.count, 0);
  const totalConsumed = consumables.reduce((n, r) => n + r.count, 0);
  for (const r of throwables) r.share = ratio(r.count, totalThrown);
  for (const r of consumables) r.share = ratio(r.count, totalConsumed);

  throwables.sort((a, b) => b.count - a.count);
  consumables.sort((a, b) => b.count - a.count);
  other.sort((a, b) => b.count - a.count);

  return {
    throwables,
    consumables,
    other,
    totalThrown,
    totalConsumed,
    thrownPerChapter: ratio(totalThrown, chapterCount),
    commonKilledByExplosion: explosionKills,
    healsGiven,
    pillsGiven,
    kitsBackfilled,
  };
}

//---------------------------------------------------------------------
// Weapons
//---------------------------------------------------------------------

/**
 * Per-weapon statistics, from schema 2's `weapons` table.
 *
 * Two things about this data have to reach the reader rather than be
 * smoothed over:
 *
 * 1. Most of it is INFERRED. Kill and damage events usually carry no weapon
 *    field, so the mod falls back to whatever the player last fired
 *    (`WeaponFor`, events.nut). On the sample runs that fallback accounts
 *    for the majority of attributions, so a row is a good guess rather than
 *    a measurement -- `inferredShare` says how much of one it is.
 *
 * 2. The table is keyed by the raw engine name, so non-guns land in it:
 *    `gascan` and `pipe_bomb` register a shot when thrown, and `inferno`
 *    and `entityflame` accumulate burn damage with no shots at all. That is
 *    real damage and belongs in the total, but listing it beside an
 *    autoshotgun as though it were a weapon you aim would mislead, so it is
 *    classified out into its own group.
 */

/** Fire and explosion sources: damage with no shots, not a held weapon. */
const ENVIRONMENTAL_WEAPONS = new Set([
  "inferno",
  "entityflame",
  "gascan",
  "propanetank",
  "oxygentank",
  "fireworkcrate",
  "explosion",
  "world",
]);

const WEAPON_LABEL: Record<string, string> = {
  smg: "SMG",
  smg_silenced: "Silenced SMG",
  smg_mp5: "MP5",
  pistol: "Pistol",
  dual_pistols: "Dual pistols",
  pistol_magnum: "Magnum",
  shotgun_chrome: "Chrome shotgun",
  pumpshotgun: "Pump shotgun",
  autoshotgun: "Auto shotgun",
  shotgun_spas: "SPAS shotgun",
  rifle: "M16",
  rifle_ak47: "AK-47",
  rifle_desert: "Desert rifle",
  rifle_sg552: "SG552",
  rifle_m60: "M60",
  sniper_military: "Military sniper",
  sniper_awp: "AWP",
  sniper_scout: "Scout",
  hunting_rifle: "Hunting rifle",
  grenade_launcher: "Grenade launcher",
  melee: "Melee",
  chainsaw: "Chainsaw",
  inferno: "Fire",
  entityflame: "Fire",
  gascan: "Gas can",
};

export function weaponLabel(key: string): string {
  return WEAPON_LABEL[key] ?? infectedLabel(key);
}

/** How a weapon key is grouped for display. */
export type WeaponKind = "firearm" | "melee" | "throwable" | "environmental";

export function weaponKind(key: string): WeaponKind {
  if ((THROWABLE_KEYS as readonly string[]).includes(key)) return "throwable";
  if (ENVIRONMENTAL_WEAPONS.has(key)) return "environmental";
  if (key === "melee" || key === "chainsaw") return "melee";
  return "firearm";
}

export interface WeaponRow {
  key: string;
  label: string;
  kind: WeaponKind;
  shots: number;
  reloads: number;
  hits: number;
  damage: number;
  kills: number;
  headshots: number;
  ffDamage: number;
  /** Hits per shot, clamped: one shotgun blast lands many pellets. */
  accuracy: Maybe;
  damagePerShot: Maybe;
  /** Damage spent per kill with this weapon. */
  damagePerKill: Maybe;
  killsPerShot: Maybe;
  /** Share of the kills made with this weapon that were headshots. */
  headshotRate: Maybe;
  /** Share of all weapon-attributed kills in scope. */
  killShare: Maybe;
  /** Share of all weapon-attributed damage in scope. */
  damageShare: Maybe;
  /** Attributions on this row that were inferred rather than read. */
  inferred: number;
}

export interface WeaponBreakdown {
  /** Guns, heaviest first. */
  firearms: WeaponRow[];
  melee: WeaponRow[];
  /** Throwables, which register a shot when thrown. */
  throwables: WeaponRow[];
  /** Fire, explosions and other non-weapon damage sources. */
  environmental: WeaponRow[];
  /** Every row, already ranked. */
  all: WeaponRow[];
  topByKills: WeaponRow | null;
  topByDamage: WeaponRow | null;

  shotsFired: number;
  reloads: number;
  /** Mean shots between reloads -- a coarse read on weapon class. */
  shotsPerReload: Maybe;
  kills: number;
  /**
   * Kills per shot across everything. A rough proxy only: `shots_fired`
   * counts melee swings and thrown items alongside bullets. The per-weapon
   * rows above are the honest version of this question.
   */
  killsPerShot: Maybe;
  headshots: number;
  headshotRate: Maybe;
  /** Total weapon-attributed damage. Null when no file carried the table. */
  damage: Maybe;

  /** True once any file in scope carried a `weapons` table. */
  perWeaponAvailable: boolean;
  /**
   * Share of attributions inferred from the last-fired weapon rather than
   * read off the event. Null when the mod recorded no tally.
   */
  inferredShare: Maybe;
  /** Shown when `perWeaponAvailable` is false. */
  unavailableReason: string;
}

const NO_PER_WEAPON =
  "These files predate per-weapon tracking. The addon recorded shots, reloads and kills as single totals and kept the weapon name only for throwables, so per-weapon kills and damage cannot be recovered from them. Runs played after the addon update fill this in; older files cannot be backfilled.";

export function weaponBreakdown(
  players: readonly {
    offense: {
      shots_fired: number;
      reloads: number;
      total_kills: number;
      kills: Record<string, number>;
      headshots: Record<string, number>;
    };
    weapons?: Record<
      string,
      {
        shots: number;
        reloads: number;
        hits: number;
        damage: number;
        kills: number;
        headshots: number;
        ff_damage: number;
        inferred: number;
      }
    >;
  }[],
  attribution?: { fromEvent: number; inferred: number } | null,
): WeaponBreakdown {
  let shots = 0;
  let reloads = 0;
  let kills = 0;
  let headshots = 0;

  interface Acc {
    shots: number;
    reloads: number;
    hits: number;
    damage: number;
    kills: number;
    headshots: number;
    ffDamage: number;
    inferred: number;
  }
  const acc = new Map<string, Acc>();

  for (const p of players) {
    shots += p.offense.shots_fired;
    reloads += p.offense.reloads;
    kills += p.offense.total_kills;
    headshots += sumTable(p.offense.headshots);

    for (const [raw, w] of Object.entries(p.weapons ?? {})) {
      // Throwables arrive here under the spellings items_used uses.
      const key = canonicalItemKey(raw);
      const cur = acc.get(key) ?? {
        shots: 0,
        reloads: 0,
        hits: 0,
        damage: 0,
        kills: 0,
        headshots: 0,
        ffDamage: 0,
        inferred: 0,
      };
      cur.shots += w.shots;
      cur.reloads += w.reloads;
      cur.hits += w.hits;
      cur.damage += w.damage;
      cur.kills += w.kills;
      cur.headshots += w.headshots;
      cur.ffDamage += w.ff_damage;
      cur.inferred += w.inferred;
      acc.set(key, cur);
    }
  }

  const totalWeaponKills = [...acc.values()].reduce((n, w) => n + w.kills, 0);
  const totalWeaponDamage = [...acc.values()].reduce((n, w) => n + w.damage, 0);

  const rows: WeaponRow[] = [];
  for (const [key, w] of acc) {
    // A row with no shots, no damage and no kills carries no information.
    if (w.shots === 0 && w.damage === 0 && w.kills === 0) continue;
    rows.push({
      key,
      label: weaponLabel(key),
      kind: weaponKind(key),
      shots: w.shots,
      reloads: w.reloads,
      hits: w.hits,
      damage: w.damage,
      kills: w.kills,
      headshots: w.headshots,
      ffDamage: w.ffDamage,
      accuracy: w.shots > 0 ? Math.min(w.hits / w.shots, 1) : null,
      damagePerShot: ratio(w.damage, w.shots),
      damagePerKill: ratio(w.damage, w.kills),
      killsPerShot: ratio(w.kills, w.shots),
      headshotRate: w.kills > 0 ? Math.min(w.headshots / w.kills, 1) : null,
      killShare: ratio(w.kills, totalWeaponKills),
      damageShare: ratio(w.damage, totalWeaponDamage),
      inferred: w.inferred,
    });
  }

  // Rank by what the weapon actually did: kills first, damage as tiebreak.
  rows.sort(
    (a, b) => b.kills - a.kills || b.damage - a.damage || b.shots - a.shots,
  );

  const byKind = (k: WeaponKind) => rows.filter((r) => r.kind === k);
  const available = rows.length > 0;
  const attributed =
    attribution && attribution.fromEvent + attribution.inferred > 0
      ? attribution
      : null;

  return {
    firearms: byKind("firearm"),
    melee: byKind("melee"),
    throwables: byKind("throwable"),
    environmental: byKind("environmental"),
    all: rows,
    topByKills: rows[0] ?? null,
    topByDamage:
      rows.length > 0
        ? ([...rows].sort((a, b) => b.damage - a.damage)[0] ?? null)
        : null,

    shotsFired: shots,
    reloads,
    shotsPerReload: ratio(shots, reloads),
    kills,
    killsPerShot: ratio(kills, shots),
    headshots,
    headshotRate: kills > 0 ? Math.min(headshots / kills, 1) : null,
    damage: available ? totalWeaponDamage : null,

    perWeaponAvailable: available,
    inferredShare: attributed
      ? attributed.inferred / (attributed.fromEvent + attributed.inferred)
      : null,
    unavailableReason: NO_PER_WEAPON,
  };
}

//---------------------------------------------------------------------
// Chapter analysis
//---------------------------------------------------------------------

export interface ChapterAnalysis {
  index: number;
  map: string;
  label: string;
  outcome: NormalizedChapter["outcome"];
  playtimeS: number;
  /** Retried at least once: round_starts above one. */
  retried: boolean;
  roundStarts: number;

  kills: number;
  specialKills: number;
  commonKills: number;
  damageDealt: number;
  damageTaken: number;
  ffDamage: number;

  incaps: number;
  deaths: number;
  revives: number;
  /** Pins suffered across the team. */
  grabs: number;

  /** Team kills per minute — the pace of the chapter. */
  killsPerMinute: Maybe;
  /** Damage taken per minute — how hard it pushed back. */
  damageTakenPerMinute: Maybe;
  /**
   * Casualties per minute. The comparable difficulty signal: a long quiet
   * chapter and a short brutal one score very differently.
   */
  casualtiesPerMinute: Maybe;
  /** The special that did the most damage to the team here. */
  worstThreat: InfectedRow | null;
  infected: InfectedBreakdown;
}

export function chapterAnalysis(c: NormalizedChapter): ChapterAnalysis {
  const infected = infectedBreakdown(c.players);
  let kills = 0;
  let damageDealt = 0;
  let damageTaken = 0;
  let ffDamage = 0;
  let incaps = 0;
  let deaths = 0;
  let revives = 0;
  let grabs = 0;

  for (const p of c.players) {
    kills += p.offense.total_kills;
    damageDealt += sumTable(p.offense.damage_dealt);
    damageTaken += sumTable(p.defense.damage_taken);
    ffDamage += p.offense.ff_damage;
    incaps += p.defense.incaps;
    deaths += p.defense.deaths;
    revives += p.teamwork.revives_given;
    grabs += splitGrabsCount(p.defense.grabbed_by);
  }

  const minutes = c.playtime_s / 60;
  const worstThreat =
    infected.specials.length > 0
      ? ([...infected.specials].sort(
          (a, b) => b.damageTaken - a.damageTaken || b.incapsCaused - a.incapsCaused,
        )[0] ?? null)
      : null;

  return {
    index: c.index,
    map: c.map,
    label: chapterLabel(c.map),
    outcome: c.outcome,
    playtimeS: c.playtime_s,
    retried: c.round_starts > 1,
    roundStarts: c.round_starts,
    kills,
    specialKills: infected.totalSpecialKills,
    commonKills: infected.commonKills,
    damageDealt,
    damageTaken,
    ffDamage,
    incaps,
    deaths,
    revives,
    grabs,
    killsPerMinute: ratio(kills, minutes),
    damageTakenPerMinute: ratio(damageTaken, minutes),
    casualtiesPerMinute: ratio(incaps + deaths, minutes),
    worstThreat,
    infected,
  };
}

function splitGrabsCount(grabbed: Record<string, number>): number {
  let n = 0;
  for (const [k, v] of Object.entries(grabbed)) {
    if (!k.endsWith("_escaped")) n += v;
  }
  return n;
}

//---------------------------------------------------------------------
// Campaign analysis
//---------------------------------------------------------------------

export interface CampaignAnalysis {
  sessionId: string;
  chapters: ChapterAnalysis[];
  infected: InfectedBreakdown;
  throwables: ThrowableBreakdown;
  weapons: WeaponBreakdown;

  /** Chapter that cost the team the most, by casualties then damage taken. */
  hardestChapter: ChapterAnalysis | null;
  /** Chapter cleared fastest, among those actually cleared. */
  fastestChapter: ChapterAnalysis | null;
  /** Chapters that needed more than one attempt. */
  retriedChapters: number;

  totalDamageDealt: number;
  totalDamageTaken: number;
  /** Damage dealt per point taken. Above 1 means the team traded up. */
  damageRatio: Maybe;
}

export function campaignAnalysis(s: NormalizedSession): CampaignAnalysis {
  const chapters = s.chapters.map(chapterAnalysis);
  const infected = infectedBreakdown(s.totals);
  const throwables = throwableBreakdown(s.totals, s.chapters.length);
  const weapons = weaponBreakdown(s.totals, s.weaponAttribution);

  const totalDamageDealt = chapters.reduce((n, c) => n + c.damageDealt, 0);
  const totalDamageTaken = chapters.reduce((n, c) => n + c.damageTaken, 0);

  const hardest =
    chapters.length > 0
      ? ([...chapters].sort(
          (a, b) =>
            b.deaths - a.deaths ||
            b.incaps - a.incaps ||
            b.damageTaken - a.damageTaken,
        )[0] ?? null)
      : null;

  const cleared = chapters.filter(
    (c) => c.outcome === "cleared" || c.outcome === "finale_win",
  );
  const fastest =
    cleared.length > 0
      ? ([...cleared].sort((a, b) => a.playtimeS - b.playtimeS)[0] ?? null)
      : null;

  return {
    sessionId: s.sessionId,
    chapters,
    infected,
    throwables,
    weapons,
    hardestChapter: hardest,
    fastestChapter: fastest,
    retriedChapters: chapters.filter((c) => c.retried).length,
    totalDamageDealt,
    totalDamageTaken,
    damageRatio: ratio(totalDamageDealt, totalDamageTaken),
  };
}

//---------------------------------------------------------------------
// Per-player splits
//---------------------------------------------------------------------

/**
 * The breakdowns above answer "what did this cost us". These answer "who".
 *
 * Every function here is a *split*, not new arithmetic: it calls the same
 * breakdown with a one-player roster. That is deliberate and load-bearing —
 * a per-player column computed a second way would eventually disagree with
 * the total sitting next to it, and a table whose rows do not sum to its own
 * footer is worse than no table. `infectedBreakdown` already documents that
 * a single record and a whole roster take the identical path.
 *
 * The one thing that does NOT simply sum across players is playtime: the
 * roster forms take the max (players share wall-clock time, they do not
 * accumulate it), so a per-minute rate is per that player's own clock. That
 * is the right denominator for a player and the wrong one for a sum, which
 * is why these carry the per-player rate and leave the team rate to the
 * roster-scoped call.
 */

/** Identity fields every per-player row carries, for display and keying. */
export interface PlayerScope {
  key: string;
  label: string;
  kind: "human" | "bot" | "unresolved";
  character: string;
  playtimeS: number;
}

/** Minimal shape the splits need to identify a record. Normalized players fit. */
interface IdentifiablePlayer {
  key: string;
  label: string;
  kind: "human" | "bot" | "unresolved";
  character: string;
  playtime_s: number;
}

function scopeOf(p: IdentifiablePlayer): PlayerScope {
  return {
    key: p.key,
    label: p.label,
    kind: p.kind,
    character: p.character,
    playtimeS: p.playtime_s,
  };
}

export interface PlayerInfected extends PlayerScope {
  breakdown: InfectedBreakdown;
  /** This player's share of the roster's special kills. */
  specialShareOfTeam: Maybe;
  /** This player's share of the roster's damage dealt to infected. */
  damageShareOfTeam: Maybe;
}

/**
 * One infected ledger per player, ranked by what they actually killed.
 *
 * The team shares are computed against the roster total rather than against
 * the sum of the rows, so they stay honest if a record is ever filtered out
 * of the list upstream.
 */
export function playerInfectedBreakdowns<T extends IdentifiablePlayer>(
  players: readonly (T & Parameters<typeof infectedBreakdown>[0][number])[],
): PlayerInfected[] {
  const team = infectedBreakdown(players);
  const teamDealt =
    team.specials.reduce((n, r) => n + r.damageDealt, 0) +
    (team.common?.damageDealt ?? 0) +
    team.other.reduce((n, r) => n + r.damageDealt, 0);

  const rows = players.map((p) => {
    const breakdown = infectedBreakdown([p]);
    const dealt =
      breakdown.specials.reduce((n, r) => n + r.damageDealt, 0) +
      (breakdown.common?.damageDealt ?? 0) +
      breakdown.other.reduce((n, r) => n + r.damageDealt, 0);
    return {
      ...scopeOf(p),
      breakdown,
      specialShareOfTeam: ratio(
        breakdown.totalSpecialKills,
        team.totalSpecialKills,
      ),
      damageShareOfTeam: ratio(dealt, teamDealt),
    };
  });

  // Specials first: this table is about who handled the threats, and common
  // kills are largely a function of who was holding the trigger longest.
  rows.sort(
    (a, b) =>
      b.breakdown.totalSpecialKills - a.breakdown.totalSpecialKills ||
      b.breakdown.commonKills - a.breakdown.commonKills,
  );
  return rows;
}

//---------------------------------------------------------------------
// What the infection did to each player
//---------------------------------------------------------------------

/**
 * One kind of thing that happens *to* a survivor, counted per player.
 *
 * Deliberately one entry per distinct event rather than a rolled-up "pins"
 * number, because the source tables do not agree on what a pin is: a boomer
 * vomit is recorded in `grabbed_by` beside hunter pounces despite not being
 * a grab at all, and spitter acid never reaches `grabbed_by` because it is
 * damage rather than contact. Summing them would invent a category the mod
 * never recorded.
 */
export interface IncidentKind {
  /** The infected type this came from, for colour lookup. */
  key: string;
  /** "Pounced", "Hooked" — the verb from the survivor's side. */
  label: string;
  count: number;
  /**
   * What `count` actually measures. A spitter has no contact table, so the
   * only evidence it touched you is damage — which is not an event tally and
   * must never be rendered or summed as though it were one.
   */
  unit: "events" | "damage";
}

export interface PlayerIncidents extends PlayerScope {
  incidents: IncidentKind[];
  /** Times put into an incapacitated state, by any cause. */
  incaps: number;
  /** Deaths caused by an infected, excluding falls and friendly fire. */
  deathsToInfected: number;
  /** Damage taken from infected only; world, fall and teammate excluded. */
  damageFromInfected: number;
  /** Witches this player startled. Sourced from `actions`, not `defense`. */
  witchesStartled: number;
  /** Tank rocks that connected. Also from `actions`. */
  tankRocksHit: number;
  /** Every incident summed: the column the table sorts on. */
  totalIncidents: number;
}

/**
 * The verb for each contact event, keyed by the table it is read from.
 *
 * `grabbed_by` mixes true pins with the boomer vomit, so the vomit is named
 * for what it is instead of being called a grab.
 */
const GRAB_VERB: Record<string, string> = {
  hunter: "Pounced",
  smoker: "Hooked",
  jockey: "Ridden",
  charger: "Pummelled",
  boomer_vomit: "Vomited on",
};

/** Types whose signature attack is damage rather than contact. */
const HIT_VERB: Record<string, string> = {
  spitter: "Spat on",
  tank: "Hit by tank",
};

/** Causes in the damage tables that are not infected at all. */
const NOT_INFECTED = new Set(["world", "fall", "teammate", "survivor"]);

/**
 * What the infection did to each player, as a per-player split.
 *
 * Reads the victim-side tables (`grabbed_by`, `incapped_by`, `killed_by`,
 * `damage_taken`) plus the two counters on `actions` that describe things a
 * player walked into rather than had done to them.
 *
 * Escapes are read but not reported. In every sample to hand `grabbed_by`
 * writes `<kind>_escaped` at exactly the pin count for hunter and smoker and
 * never writes it for jockey or charger, which is the mod double-writing the
 * pin rather than four survivors breaking free of every single pounce. A
 * 100% escape rate is not a statistic, so this does not publish one.
 */
export function playerIncidents<T extends IdentifiablePlayer>(
  players: readonly (T & {
    defense: {
      damage_taken: Record<string, number>;
      incapped_by: Record<string, number>;
      killed_by: Record<string, number>;
      grabbed_by: Record<string, number>;
      incaps: number;
    };
    actions?: { witches_startled?: number; tank_rocks_hit_by?: number };
  })[],
): PlayerIncidents[] {
  const rows = players.map((p) => {
    const { grabs } = splitGrabs(p.defense.grabbed_by);
    const incidents: IncidentKind[] = [];

    // Contact events, in the canonical roster order so a column never moves
    // between players.
    for (const [key, label] of Object.entries(GRAB_VERB)) {
      const n = grabs[key] ?? 0;
      if (n > 0) {
        incidents.push({ key: baseKey(key), label, count: n, unit: "events" });
      }
    }
    // Damage-signature types: there is no contact table for these, so the
    // only honest reading is the damage they landed.
    for (const [key, label] of Object.entries(HIT_VERB)) {
      const n = p.defense.damage_taken[key] ?? 0;
      if (n > 0) incidents.push({ key, label, count: n, unit: "damage" });
    }

    let damageFromInfected = 0;
    for (const [k, v] of Object.entries(p.defense.damage_taken)) {
      if (!NOT_INFECTED.has(k)) damageFromInfected += v;
    }
    let deathsToInfected = 0;
    for (const [k, v] of Object.entries(p.defense.killed_by)) {
      if (!NOT_INFECTED.has(k)) deathsToInfected += v;
    }

    // Events before damage rows: mixing the two orderings would rank a
    // 512-damage spitter above a charger that pummelled you twice.
    incidents.sort(
      (a, b) =>
        Number(a.unit === "damage") - Number(b.unit === "damage") ||
        b.count - a.count,
    );

    return {
      ...scopeOf(p),
      incidents,
      incaps: p.defense.incaps,
      deathsToInfected,
      damageFromInfected,
      witchesStartled: p.actions?.witches_startled ?? 0,
      tankRocksHit: p.actions?.tank_rocks_hit_by ?? 0,
      // Damage-signature rows carry a damage total, not an event count, so
      // they are excluded from the incident tally rather than inflating it.
      totalIncidents: incidents
        .filter((i) => i.unit === "events")
        .reduce((n, i) => n + i.count, 0),
    };
  });

  // Worst-hit first: this table is about who the infection actually landed
  // on, so incaps and deaths outrank raw contact count.
  rows.sort(
    (a, b) =>
      b.deathsToInfected - a.deathsToInfected ||
      b.incaps - a.incaps ||
      b.totalIncidents - a.totalIncidents ||
      b.damageFromInfected - a.damageFromInfected,
  );
  return rows;
}

/** `boomer_vomit` is a boomer for colouring purposes. */
function baseKey(key: string): string {
  return key === "boomer_vomit" ? "boomer" : key;
}

export interface PlayerThrowables extends PlayerScope {
  breakdown: ThrowableBreakdown;
  /** Throwables plus consumables: the row's reason to exist. */
  totalUsed: number;
}

/**
 * One item ledger per player.
 *
 * `chapterCount` is the scope's chapter count, passed through unchanged so
 * each player's per-chapter rate is measured against the same run length the
 * roster total uses — dividing by a per-player chapter count would make the
 * rows incomparable to each other and to the footer.
 */
export function playerThrowableBreakdowns<T extends IdentifiablePlayer>(
  players: readonly (T & Parameters<typeof throwableBreakdown>[0][number])[],
  chapterCount = 0,
): PlayerThrowables[] {
  const rows = players.map((p) => {
    const breakdown = throwableBreakdown([p], chapterCount);
    return {
      ...scopeOf(p),
      breakdown,
      totalUsed: breakdown.totalThrown + breakdown.totalConsumed,
    };
  });
  rows.sort(
    (a, b) =>
      b.totalUsed - a.totalUsed ||
      b.breakdown.totalThrown - a.breakdown.totalThrown,
  );
  return rows;
}

export interface PlayerWeapons extends PlayerScope {
  breakdown: WeaponBreakdown;
}

/**
 * One weapon ledger per player.
 *
 * Attribution is a session-level tally with no per-player split, so it is
 * passed through whole: the inferred share is a property of how the addon
 * recorded the run, not of the player, and every row carries the same caveat.
 */
export function playerWeaponBreakdowns<T extends IdentifiablePlayer>(
  players: readonly (T & Parameters<typeof weaponBreakdown>[0][number])[],
  attribution?: { fromEvent: number; inferred: number } | null,
): PlayerWeapons[] {
  const rows = players.map((p) => ({
    ...scopeOf(p),
    breakdown: weaponBreakdown([p], attribution),
  }));
  rows.sort(
    (a, b) =>
      b.breakdown.kills - a.breakdown.kills ||
      b.breakdown.shotsFired - a.breakdown.shotsFired,
  );
  return rows;
}

//---------------------------------------------------------------------
// Per-campaign aggregation across runs
//---------------------------------------------------------------------

export interface CampaignRollup {
  /** "c8", or the map name for a custom campaign. */
  campaign: string;
  label: string;
  official: boolean;
  runs: number;
  /** Runs that reached a finale win. */
  completed: number;
  completionRate: Maybe;
  chapters: number;
  playtimeS: number;
  wipes: number;
  deaths: number;
  incaps: number;
  kills: number;
  /** Hardest difficulty this campaign was played on, by rank. */
  hardestDifficulty: string;
  sessions: NormalizedSession[];
}

/**
 * Group every run by campaign.
 *
 * Keyed on `campaign` rather than the display name so a custom campaign
 * whose name collides with an official one stays separate.
 */
export function campaignRollups(
  store: StatsStore,
  labelFor: (campaign: string, official: boolean) => string,
  rankFor: (difficulty: string) => number,
): CampaignRollup[] {
  const groups = new Map<string, NormalizedSession[]>();
  for (const s of store.sessions) {
    const bucket = groups.get(s.campaign);
    if (bucket) bucket.push(s);
    else groups.set(s.campaign, [s]);
  }

  const out: CampaignRollup[] = [];
  for (const [campaign, sessions] of groups) {
    let chapters = 0;
    let playtimeS = 0;
    let wipes = 0;
    let deaths = 0;
    let incaps = 0;
    let kills = 0;
    let completed = 0;
    let bestRank = -1;
    let hardest = "Unknown";

    for (const s of sessions) {
      chapters += s.chapters.length;
      playtimeS += s.playtimeS;
      wipes += s.wipes;
      if (s.complete) completed += 1;
      for (const p of s.totals) {
        deaths += p.defense.deaths;
        incaps += p.defense.incaps;
        kills += p.offense.total_kills;
      }
      const rank = rankFor(s.difficulty);
      if (rank > bestRank) {
        bestRank = rank;
        hardest = s.difficultyLabel;
      }
    }

    const first = sessions[0];
    if (first === undefined) continue;

    out.push({
      campaign,
      label: labelFor(campaign, first.official),
      official: first.official,
      runs: sessions.length,
      completed,
      completionRate: ratio(completed, sessions.length),
      chapters,
      playtimeS,
      wipes,
      deaths,
      incaps,
      kills,
      hardestDifficulty: hardest,
      sessions,
    });
  }

  out.sort((a, b) => b.runs - a.runs || b.playtimeS - a.playtimeS);
  return out;
}
