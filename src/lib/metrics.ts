import type {
  NormalizedChapter,
  NormalizedPlayer,
  NormalizedSession,
} from "./normalize";
import type { StatsStore } from "./store";

/**
 * Every derived number in the app. PLAN.md section 5: pages read from here
 * rather than doing arithmetic in JSX.
 *
 * Two rules throughout:
 *   - Never divide without guarding the denominator. Sparse telemetry means
 *     zero shots, zero deaths and zero chapters all really happen.
 *   - Never invent a stat the schema cannot support. Where PLAN.md asked for
 *     something underivable, the honest nearby metric is named differently
 *     and documented as such.
 */

export const NO_VALUE = null;
export type Maybe = number | null;

function ratio(numerator: number, denominator: number): Maybe {
  if (denominator <= 0) return NO_VALUE;
  return numerator / denominator;
}

export function sumTable(t: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(t)) n += v;
  return n;
}

/** Infected types that are "specials", for splitting charts off common. */
export const SPECIALS = [
  "smoker",
  "boomer",
  "hunter",
  "spitter",
  "jockey",
  "charger",
  "tank",
  "witch",
] as const;

export type Special = (typeof SPECIALS)[number];

/**
 * Consistent colour slot per infected type, so "hunter" is always the same
 * thing visually (PLAN.md section 6). Keys not listed fall back to neutral.
 */
export const INFECTED_COLOR: Record<string, string> = {
  common: "#4a4a52",
  smoker: "#6b9e78",
  boomer: "#8a7f3d",
  hunter: "#7d6ba8",
  spitter: "#a8a03d",
  jockey: "#a86b8f",
  charger: "#a87048",
  tank: "#b2553f",
  witch: "#b0517a",
};

export function infectedColor(key: string): string {
  return INFECTED_COLOR[key] ?? "#3a3a42";
}

/** Split a kill/damage table into common, specials, and anything unexpected. */
export function splitByKind(t: Record<string, number>): {
  common: number;
  specials: { key: string; value: number }[];
  other: { key: string; value: number }[];
} {
  const specials: { key: string; value: number }[] = [];
  const other: { key: string; value: number }[] = [];
  let common = 0;
  for (const [key, value] of Object.entries(t)) {
    if (value === 0) continue;
    if (key === "common") common += value;
    else if ((SPECIALS as readonly string[]).includes(key)) {
      specials.push({ key, value });
    } else other.push({ key, value });
  }
  specials.sort((a, b) => b.value - a.value);
  other.sort((a, b) => b.value - a.value);
  return { common, specials, other };
}

//---------------------------------------------------------------------
// Per-player metrics
//---------------------------------------------------------------------

export interface PlayerMetrics {
  key: string;
  label: string;
  kind: NormalizedPlayer["kind"];
  character: string;
  playtimeS: number;
  minutes: number;

  kills: number;
  /** Sum of the kills table; should equal `kills` but is computed separately. */
  killsFromTable: number;
  /** The open kills table itself, for per-type charts. */
  rawKills: Record<string, number>;
  /** The open headshots table, for per-type headshot rates. */
  rawHeadshots: Record<string, number>;
  commonKills: number;
  specialKills: number;
  killsPerMinute: Maybe;

  headshots: number;
  /** Guarded: the two tables are keyed independently and can disagree. */
  headshotRate: Maybe;

  shotsFired: number;
  /**
   * Kills per shot. A ROUGH proxy only: `shots_fired` counts weapon_fire,
   * which includes melee swings and thrown items. Label it with a caveat.
   */
  killsPerShot: Maybe;

  damageDealt: number;
  deaths: number;
  incaps: number;
  timesRevived: number;
  timesDefibbed: number;

  revivesGiven: number;
  /** revives_given / times_revived. Null when never revived. */
  reviveRatio: Maybe;

  /**
   * First aid kits spent by this player.
   *
   * `items_used.first_aid_kit` where the file carries it, falling back to
   * `heals_given` where it does not. The kit is counted on heal_success,
   * which fires only for the kit -- pills and adrenaline raise their own
   * events -- so one heal is one kit, and every file recorded to date takes
   * the fallback. Same rule as `throwableBreakdown`, kept in step with it.
   */
  medkits: number;

  ffDamage: number;
  ffIncaps: number;
  ffKills: number;
  /** FF damage per hour of this player's own playtime. */
  ffPerHour: Maybe;

  damageTaken: number;
  /** The special that actually hurt this player most. */
  topThreat: ThreatEntry | null;
  threats: ThreatEntry[];
}

export interface ThreatEntry {
  key: string;
  damage: number;
  grabs: number;
  incaps: number;
  kills: number;
  /**
   * Composite threat score, used only to rank the list.
   *
   * Outcomes dominate damage, deliberately. A tank that chipped 900 damage
   * off you is less of a threat than a hunter that actually killed you, so
   * deaths and incaps are scored on their own tier above the damage term
   * rather than competing with it numerically. Damage only breaks ties
   * within a tier. The weights are a judgement call, not from the game.
   */
  score: number;
}

/**
 * Rank what is actually dangerous to a player, from damage_taken +
 * grabbed_by + incapped_by + killed_by (PLAN.md section 5).
 */
export function threatProfile(p: NormalizedPlayer): ThreatEntry[] {
  const keys = new Set<string>([
    ...Object.keys(p.defense.damage_taken),
    ...Object.keys(p.defense.grabbed_by),
    ...Object.keys(p.defense.incapped_by),
    ...Object.keys(p.defense.killed_by),
  ]);

  const entries: ThreatEntry[] = [];
  for (const raw of keys) {
    // grabbed_by carries "smoker" and "smoker_escaped" as separate keys;
    // fold the escape variants into the base source.
    const key = raw.replace(/_escaped$/, "");
    if (key === "teammate" || key === "fall" || key === "world") {
      // Real damage sources, but not *threats* in the infected sense. They
      // show up in their own places (friendly fire, environment).
      continue;
    }
    const existing = entries.find((e) => e.key === key);
    const damage = p.defense.damage_taken[raw] ?? 0;
    const grabs = p.defense.grabbed_by[raw] ?? 0;
    const incaps = p.defense.incapped_by[raw] ?? 0;
    const kills = p.defense.killed_by[raw] ?? 0;
    if (existing) {
      existing.damage += damage;
      existing.grabs += grabs;
      existing.incaps += incaps;
      existing.kills += kills;
    } else {
      entries.push({ key, damage, grabs, incaps, kills, score: 0 });
    }
  }

  // Tier the score so an outcome can never be outweighed by raw damage:
  // deaths sit above incaps, which sit above grabs, which sit above damage.
  // Within a tier the damage term decides the order.
  const maxDamage = Math.max(
    1,
    ...entries.map((e) => e.damage),
  );
  for (const e of entries) {
    const damageTerm = e.damage / maxDamage; // 0..1, tie-breaker only
    e.score =
      e.kills * 1_000_000 +
      e.incaps * 10_000 +
      e.grabs * 100 +
      damageTerm;
  }
  entries.sort((a, b) => b.score - a.score);
  return entries.filter((e) => e.score > 0);
}

/**
 * Every spelling `items_used` uses for the first aid kit.
 *
 * `breakdowns.ts` owns the full item vocabulary and folds these onto one key
 * via `canonicalItemKey`, but it imports from this module, so importing it
 * back would close a cycle. The kit is the only item this module counts, so
 * the three spellings are repeated here rather than inverting the dependency
 * -- keep the two in step if the mod ever adds a fourth.
 */
const KIT_KEYS = ["first_aid_kit", "medkit", "first_aid", "health_kit"] as const;

/** Kits spent: the recorded count where present, else one per heal. */
function medkitsUsed(p: NormalizedPlayer): number {
  let n = 0;
  for (const k of KIT_KEYS) n += p.actions.items_used[k] ?? 0;
  // Files predating the kit counter carry heals but no kit key. One heal is
  // one kit, so the count is recoverable rather than simply absent.
  return n > 0 ? n : p.teamwork.heals_given;
}

export function playerMetrics(p: NormalizedPlayer): PlayerMetrics {
  const minutes = p.playtime_s / 60;
  const killsFromTable = sumTable(p.offense.kills);
  const headshots = sumTable(p.offense.headshots);
  const { common, specials } = splitByKind(p.offense.kills);
  const specialKills = specials.reduce((a, s) => a + s.value, 0);
  const threats = threatProfile(p);

  return {
    key: p.key,
    label: p.label,
    kind: p.kind,
    character: p.character,
    playtimeS: p.playtime_s,
    minutes,

    kills: p.offense.total_kills,
    killsFromTable,
    rawKills: p.offense.kills,
    rawHeadshots: p.offense.headshots,
    commonKills: common,
    specialKills,
    killsPerMinute: ratio(p.offense.total_kills, minutes),

    headshots,
    headshotRate: ratio(headshots, killsFromTable),

    shotsFired: p.offense.shots_fired,
    killsPerShot: ratio(p.offense.total_kills, p.offense.shots_fired),

    damageDealt: sumTable(p.offense.damage_dealt),
    deaths: p.defense.deaths,
    incaps: p.defense.incaps,
    timesRevived: p.defense.times_revived,
    timesDefibbed: p.defense.times_defibbed,

    revivesGiven: p.teamwork.revives_given,
    reviveRatio: ratio(p.teamwork.revives_given, p.defense.times_revived),

    medkits: medkitsUsed(p),

    ffDamage: p.offense.ff_damage,
    ffIncaps: p.offense.ff_incaps,
    ffKills: p.offense.ff_kills,
    ffPerHour: ratio(p.offense.ff_damage, p.playtime_s / 3600),

    damageTaken: sumTable(p.defense.damage_taken),
    topThreat: threats[0] ?? null,
    threats,
  };
}

//---------------------------------------------------------------------
// Per-campaign metrics
//---------------------------------------------------------------------

export interface CampaignMetrics {
  sessionId: string;
  chapterCount: number;
  /**
   * Extra round starts beyond one per chapter. This is a count of restarts,
   * NOT a count of chapters: a single chapter started three times
   * contributes two. `retriedChapters` is the per-chapter figure.
   */
  retries: number;
  /** How many distinct chapters were started more than once. */
  retriedChapters: number;
  players: PlayerMetrics[];
  totalKills: number;
  totalFfDamage: number;
  totalDeaths: number;
  totalIncaps: number;
  /** Team kills per minute of campaign wall time. */
  teamKillsPerMinute: Maybe;
  /** Per-chapter incap counts, for the casualty strip. */
  chapterLoad: ChapterLoad[];
}

export interface ChapterLoad {
  index: number;
  map: string;
  outcome: NormalizedChapter["outcome"];
  playtimeS: number;
  incaps: number;
  deaths: number;
  kills: number;
  ffDamage: number;
  /** Retried at least once. */
  retried: boolean;
}

export function chapterLoad(c: NormalizedChapter): ChapterLoad {
  let incaps = 0;
  let deaths = 0;
  let kills = 0;
  let ffDamage = 0;
  for (const p of c.players) {
    incaps += p.defense.incaps;
    deaths += p.defense.deaths;
    kills += p.offense.total_kills;
    ffDamage += p.offense.ff_damage;
  }
  return {
    index: c.index,
    map: c.map,
    outcome: c.outcome,
    playtimeS: c.playtime_s,
    incaps,
    deaths,
    kills,
    ffDamage,
    retried: c.round_starts > 1,
  };
}

export function campaignMetrics(s: NormalizedSession): CampaignMetrics {
  const players = s.totals.map(playerMetrics);
  const load = s.chapters.map(chapterLoad);
  return {
    sessionId: s.sessionId,
    chapterCount: s.chapters.length,
    retries: Math.max(0, s.roundStarts - s.chapters.length),
    retriedChapters: s.chapters.filter((c) => c.round_starts > 1).length,
    players,
    totalKills: players.reduce((a, p) => a + p.kills, 0),
    totalFfDamage: players.reduce((a, p) => a + p.ffDamage, 0),
    totalDeaths: players.reduce((a, p) => a + p.deaths, 0),
    totalIncaps: players.reduce((a, p) => a + p.incaps, 0),
    teamKillsPerMinute: ratio(
      players.reduce((a, p) => a + p.kills, 0),
      s.playtimeS / 60,
    ),
    chapterLoad: load,
  };
}

/**
 * Chapters in which this player was never incapped and never died.
 *
 * NOT the "survival rate" PLAN.md section 5 asks for: chapter `outcome` is
 * team-wide and there is no per-player survived flag, so a true survival
 * rate is not derivable. This is the honest nearby metric -- name it
 * "clean chapters" in the UI, never "survival rate".
 */
export function cleanChapters(
  s: NormalizedSession,
  playerKey: string,
): { clean: number; played: number; rate: Maybe } {
  let clean = 0;
  let played = 0;
  for (const c of s.chapters) {
    const p = c.playersByKey[playerKey];
    if (!p) continue;
    played += 1;
    if (p.defense.incaps === 0 && p.defense.deaths === 0) clean += 1;
  }
  return { clean, played, rate: ratio(clean, played) };
}

//---------------------------------------------------------------------
// All-time metrics
//---------------------------------------------------------------------

export interface AllTimeMetrics {
  campaigns: number;
  completed: number;
  /** Completed campaigns / campaigns. */
  winRate: Maybe;
  totalPlaytimeS: number;
  totalKills: number;
  totalFfDamage: number;
  totalWipes: number;
  officialCampaigns: number;
  customCampaigns: number;
  players: AggregatePlayer[];
  /** Per-campaign trend, oldest first, for the kills-per-minute chart. */
  trend: TrendPoint[];
}

export interface AggregatePlayer extends PlayerMetrics {
  campaigns: number;
  /** Aggregate clean-chapter count across every campaign. */
  cleanChapters: number;
  chaptersPlayed: number;
  cleanRate: Maybe;
}

export interface TrendPoint {
  sessionId: string;
  campaign: string;
  label: string;
  official: boolean;
  difficulty: string;
  startedUtc: number;
  killsPerMinute: Maybe;
  ffDamage: number;
  wipes: number;
  complete: boolean;
}

/**
 * Fold a player's records from many campaigns into one.
 *
 * Summing `totals` across sessions is correct -- each session's totals are
 * that campaign's chapters summed, and sessions are already deduped by
 * session_id. What would be wrong is re-summing totals *within* a campaign
 * (PLAN.md section 1.3), which we never do.
 */
function foldPlayers(sessions: NormalizedSession[]): AggregatePlayer[] {
  interface Acc {
    base: NormalizedPlayer;
    campaigns: number;
    clean: number;
    played: number;
  }
  const acc = new Map<string, Acc>();

  for (const s of sessions) {
    for (const p of s.totals) {
      const cur = acc.get(p.key);
      const cc = cleanChapters(s, p.key);
      if (!cur) {
        acc.set(p.key, {
          base: structuredClone(p),
          campaigns: 1,
          clean: cc.clean,
          played: cc.played,
        });
        continue;
      }
      cur.campaigns += 1;
      cur.clean += cc.clean;
      cur.played += cc.played;
      mergePlayer(cur.base, p);
    }
  }

  const out: AggregatePlayer[] = [];
  for (const a of acc.values()) {
    const m = playerMetrics(a.base);
    out.push({
      ...m,
      campaigns: a.campaigns,
      cleanChapters: a.clean,
      chaptersPlayed: a.played,
      cleanRate: ratio(a.clean, a.played),
    });
  }
  out.sort((a, b) => b.kills - a.kills);
  return out;
}

/** Sum numeric leaves of `src` into `dst`; newest label wins. */
function mergePlayer(dst: NormalizedPlayer, src: NormalizedPlayer): void {
  addInto(
    dst as unknown as Record<string, unknown>,
    src as unknown as Record<string, unknown>,
  );
  dst.label = src.label || dst.label;
  dst.character = src.character || dst.character;
}

function addInto(
  dst: Record<string, unknown>,
  src: Record<string, unknown>,
): void {
  for (const [k, v] of Object.entries(src)) {
    if (k === "key" || k === "kind" || k === "label") continue;
    if (typeof v === "number") {
      const cur = dst[k];
      dst[k] = typeof cur === "number" ? cur + v : v;
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const cur = dst[k];
      const next =
        cur !== null && typeof cur === "object" && !Array.isArray(cur)
          ? (cur as Record<string, unknown>)
          : {};
      addInto(next, v as Record<string, unknown>);
      dst[k] = next;
    }
  }
}

export function allTimeMetrics(store: StatsStore): AllTimeMetrics {
  const sessions = store.sessions;
  const completed = sessions.filter((s) => s.complete).length;

  // Oldest first for the trend line.
  const chronological = [...sessions].sort((a, b) =>
    a.sortKey.localeCompare(b.sortKey),
  );

  const trend: TrendPoint[] = chronological.map((s) => {
    const kills = s.totals.reduce((a, p) => a + p.offense.total_kills, 0);
    return {
      sessionId: s.sessionId,
      campaign: s.campaign,
      label: campaignLabel(s.campaign, s.official),
      official: s.official,
      difficulty: s.difficultyLabel,
      startedUtc: s.startedUtc,
      killsPerMinute: ratio(kills, s.playtimeS / 60),
      ffDamage: s.totals.reduce((a, p) => a + p.offense.ff_damage, 0),
      wipes: s.wipes,
      complete: s.complete,
    };
  });

  return {
    campaigns: sessions.length,
    completed,
    winRate: ratio(completed, sessions.length),
    totalPlaytimeS: sessions.reduce((a, s) => a + s.playtimeS, 0),
    totalKills: sessions.reduce(
      (a, s) => a + s.totals.reduce((x, p) => x + p.offense.total_kills, 0),
      0,
    ),
    totalFfDamage: sessions.reduce(
      (a, s) => a + s.totals.reduce((x, p) => x + p.offense.ff_damage, 0),
      0,
    ),
    totalWipes: sessions.reduce((a, s) => a + s.wipes, 0),
    officialCampaigns: sessions.filter((s) => s.official).length,
    customCampaigns: sessions.filter((s) => !s.official).length,
    players: foldPlayers(sessions),
    trend,
  };
}

//---------------------------------------------------------------------
// Friendly fire
//---------------------------------------------------------------------

export interface FfCell {
  from: string;
  to: string;
  damage: number;
  incaps: number;
  kills: number;
}

export interface FfMatrix {
  /** Player keys, in a stable display order. */
  keys: string[];
  labels: Record<string, string>;
  /** cell[from][to]; missing pairs are zero, which is real, not absent. */
  cell: Record<string, Record<string, FfCell>>;
  max: number;
  worst: FfCell | null;
}

/**
 * Build the directional N x N matrix. `teamwork.pairs` only exists where an
 * interaction happened, so every absent pair is a genuine zero and must
 * render as an empty cell rather than a gap (PLAN.md section 5).
 */
export function ffMatrix(sessions: NormalizedSession[]): FfMatrix {
  const labels: Record<string, string> = {};
  const cell: Record<string, Record<string, FfCell>> = {};
  const order = new Map<string, number>();

  for (const s of sessions) {
    for (const p of s.totals) {
      labels[p.key] = p.label;
      order.set(p.key, (order.get(p.key) ?? 0) + p.playtime_s);
      for (const [other, pr] of Object.entries(p.teamwork.pairs)) {
        const row = (cell[p.key] ??= {});
        const c = (row[other] ??= {
          from: p.key,
          to: other,
          damage: 0,
          incaps: 0,
          kills: 0,
        });
        c.damage += pr.ff_damage_to;
        c.incaps += pr.incapped;
        c.kills += pr.killed;
      }
    }
  }

  const keys = [...order.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  let max = 0;
  let worst: FfCell | null = null;
  for (const from of keys) {
    for (const to of keys) {
      const c = cell[from]?.[to];
      if (!c) continue;
      if (c.damage > max) max = c.damage;
      if (!worst || c.damage > worst.damage) worst = c;
    }
  }

  return { keys, labels, cell, max, worst };
}

//---------------------------------------------------------------------
// Formatting
//---------------------------------------------------------------------

/** "c1" -> "Dead Center". Custom maps keep their raw name. */
export const CAMPAIGN_NAMES: Record<string, string> = {
  c1: "Dead Center",
  c2: "Dark Carnival",
  c3: "Swamp Fever",
  c4: "Hard Rain",
  c5: "The Parish",
  c6: "The Passing",
  c7: "The Sacrifice",
  c8: "No Mercy",
  c9: "Crash Course",
  c10: "Death Toll",
  c11: "Dead Air",
  c12: "Blood Harvest",
  c13: "Cold Stream",
  c14: "The Last Stand",
};

export function campaignLabel(campaign: string, official: boolean): string {
  if (official && CAMPAIGN_NAMES[campaign]) return CAMPAIGN_NAMES[campaign]!;
  return prettifyMapName(campaign);
}

/** "l4d_dam01_riverbank" -> "Dam01 Riverbank". Best effort for custom maps. */
export function prettifyMapName(raw: string): string {
  return raw
    .replace(/^l4d[0-9]?_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Chapter label: "c1m2_streets" -> "Streets". Custom maps best effort. */
export function chapterLabel(map: string): string {
  const official = /^c\d+m\d+_(.+)$/.exec(map);
  if (official?.[1]) return prettifyMapName(official[1]);
  return prettifyMapName(map);
}

/**
 * Durations always carry their seconds. A chapter that took 3m 47s is not
 * "3m" -- rounding it away hides exactly the variation between runs that the
 * chapter tables exist to show.
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0)
    return `${h}h ${String(m).padStart(2, "0")}m ${String(r).padStart(2, "0")}s`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

/**
 * Kept as an alias so existing call sites stay valid: precision is now the
 * only behaviour, so there is nothing left for this to do differently.
 */
export const formatDurationPrecise = formatDuration;

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** A metric that may not exist renders as an em dash, never as 0. */
export function formatMaybe(v: Maybe, digits = 2, suffix = ""): string {
  if (v === null) return "—";
  return v.toFixed(digits) + suffix;
}

export function formatPercent(v: Maybe, digits = 0): string {
  if (v === null) return "—";
  return (v * 100).toFixed(digits) + "%";
}

export function formatDate(utc: number): string {
  if (utc <= 0) return "No timestamp";
  return new Date(utc * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
