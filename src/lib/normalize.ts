import {
  SessionSchema,
  isChapterOutcome,
  type ChapterOutcome,
  type RawPlayer,
  type RawSession,
} from "./schema";
import {
  ChapterFileSchema,
  foldRun,
  isChapterFile,
  runKey,
  type RawChapterFile,
} from "./chapterfile";

/**
 * Turns a parsed raw session into the shape the UI actually wants.
 *
 * Three jobs:
 *   1. Give every player record its key, so downstream code can never be
 *      tempted to identify a player by `steamid` (which is "" for the
 *      NAME: fallback and for bots).
 *   2. Recompute campaign totals from the chapters rather than trusting the
 *      totals written into the file. See the note on `totals` below.
 *   3. Fill in the things the producer leaves implicit: whether the campaign
 *      is official, whether it finished, how to order it in time.
 */

export type PlayerKind = "human" | "bot" | "unresolved";

export interface NormalizedPlayer extends RawPlayer {
  /** The record key: "STEAM_1:0:...", "BOT:Coach", or "NAME:whatever". */
  key: string;
  kind: PlayerKind;
  /** Best available display name; never empty. */
  label: string;
}

export interface NormalizedChapter {
  map: string;
  index: number;
  started_utc: number;
  playtime_s: number;
  round_starts: number;
  outcome: ChapterOutcome;
  /** Outcome string exactly as written, even if unrecognized. */
  outcomeRaw: string;
  players: NormalizedPlayer[];
  playersByKey: Record<string, NormalizedPlayer>;
}

export interface SessionSource {
  /** "fs" for the server directory reader, "upload" for the dropzone. */
  origin: "fs" | "upload";
  /** File name as found, e.g. "_current.json". */
  fileName: string;
}

export interface NormalizedSession {
  schema: number;
  sessionId: string;
  campaign: string;
  gamemode: string;
  /** Raw z_difficulty value, as written. */
  difficulty: string;
  /** Display form: "Impossible" becomes "Expert", the in-game wording. */
  difficultyLabel: string;
  /**
   * Difficulty read together with the gamemode: Expert on a realism server
   * is "Expert Realism". Materialized here so no call site has to remember
   * to pass both fields; `difficultyLabel` stays the difficulty alone.
   */
  difficultyDisplay: string;
  startedUtc: number;
  updatedUtc: number;
  playtimeS: number;
  roundStarts: number;
  saves: number;
  outcomes: Record<string, number>;
  eventsSeen: Record<string, number>;
  chapters: NormalizedChapter[];
  /**
   * Campaign totals, recomputed from `chapters`.
   *
   * PLAN.md says to read the file's own `totals`. It is in fact byte-exact
   * against the sum of chapters in every sample, and the mod regenerates it
   * on every save. But a file caught mid-write, or any future change to the
   * merge rule in the mod, would silently desync it -- and a campaign-totals
   * tab that disagrees with the sum of its own chapter tabs is a miserable
   * bug to chase. Recomputing is free, and it turns the invariant into a
   * test rather than an assumption. `totalsRaw` keeps the file's version for
   * exactly that comparison.
   */
  totals: NormalizedPlayer[];
  totalsByKey: Record<string, NormalizedPlayer>;
  /** The file's own `totals`, parsed but not recomputed. */
  totalsRaw: NormalizedPlayer[];
  /** True for Valve's cNmN campaigns, false for custom/Workshop. */
  official: boolean;
  /** A campaign is only complete once a finale has been won. */
  complete: boolean;
  /** Any chapter still running, or the campaign never reached a finale. */
  inProgress: boolean;
  wipes: number;
  /** Sort key for chronological ordering. See `sessionSortKey`. */
  sortKey: string;
  /** True when no wall-clock time was available and ordering is a guess. */
  timeApproximate: boolean;
  /** Where this came from, so the UI can explain a dedupe decision. */
  source: SessionSource;
  /**
   * How the mod attributed per-weapon stats, when it recorded that at all.
   * Null on files written before per-weapon tracking, which is how the UI
   * tells "no inference" apart from "unknown".
   */
  weaponAttribution: { fromEvent: number; inferred: number } | null;
}

/**
 * Valve's naming test, mirroring PST.U.IsOfficialMapName in util.nut:185.
 * Used only as a fallback when the file predates the `official` field.
 */
export function isOfficialMapName(mapname: string): boolean {
  return /^c\d+m/.test(mapname);
}

/** L4D2 shows "Expert"; the z_difficulty cvar says "Impossible". */
export function difficultyLabel(raw: string): string {
  switch (raw.trim().toLowerCase()) {
    case "easy":
      return "Easy";
    case "normal":
      return "Normal";
    case "hard":
      return "Advanced";
    case "impossible":
      return "Expert";
    case "":
    case "unknown":
      return "Unknown";
    default:
      return raw;
  }
}

/**
 * Realism is a gamemode, not a difficulty.
 *
 * `z_difficulty` keeps saying "Impossible" on an Expert Realism run; the only
 * thing that changes is `mp_gamemode`. So the two fields have to be read
 * together to name that run, and callers that only have a difficulty string
 * (the campaign rollups, which span runs of different gamemodes) keep using
 * `difficultyLabel` on its own.
 */
export function isRealism(gamemode: string): boolean {
  return gamemode.trim().toLowerCase().includes("realism");
}

/**
 * Display name for a difficulty + gamemode pair. "Expert Realism" is the
 * in-game wording for the hardest official configuration, and it is a real
 * step above plain Expert, so it gets its own name rather than a footnote.
 */
export function difficultyDisplay(raw: string, gamemode: string): string {
  const label = difficultyLabel(raw);
  return isRealism(gamemode) && difficultyRank(raw) === 4
    ? "Expert Realism"
    : label;
}

/** Rank for sorting and for emphasising a hard run. 0 when unknown. */
export function difficultyRank(raw: string): number {
  switch (raw.trim().toLowerCase()) {
    case "easy":
      return 1;
    case "normal":
      return 2;
    case "hard":
      return 3;
    case "impossible":
      return 4;
    default:
      return 0;
  }
}

function classifyPlayer(key: string, p: RawPlayer): PlayerKind {
  if (p.is_bot || key.startsWith("BOT:")) return "bot";
  if (key.startsWith("NAME:")) return "unresolved";
  return "human";
}

function displayLabel(key: string, p: RawPlayer): string {
  if (p.name.trim() !== "") return p.name;
  if (p.character.trim() !== "") return p.character;
  if (key.startsWith("BOT:") || key.startsWith("NAME:")) {
    return key.slice(key.indexOf(":") + 1) || key;
  }
  return key;
}

function normalizePlayer(key: string, p: RawPlayer): NormalizedPlayer {
  return {
    ...p,
    key,
    kind: classifyPlayer(key, p),
    label: displayLabel(key, p),
  };
}

/** Humans first, then unresolved, then bots; by playtime within each group. */
export function comparePlayers(
  a: NormalizedPlayer,
  b: NormalizedPlayer,
): number {
  const rank = { human: 0, unresolved: 1, bot: 2 } as const;
  if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind];
  if (b.playtime_s !== a.playtime_s) return b.playtime_s - a.playtime_s;
  return a.label.localeCompare(b.label);
}

function normalizePlayerMap(m: Record<string, RawPlayer>): NormalizedPlayer[] {
  return Object.entries(m)
    .map(([key, p]) => normalizePlayer(key, p))
    .sort(comparePlayers);
}

function byKey(players: NormalizedPlayer[]): Record<string, NormalizedPlayer> {
  const out: Record<string, NormalizedPlayer> = {};
  for (const p of players) out[p.key] = p;
  return out;
}

/**
 * Deep-sum `src` into `dst`, reproducing PST.MergeInto (main.nut:161):
 * numbers add, tables merge recursively, and strings/bools take the NEWER
 * value. That last rule matters -- a player who renames mid-campaign shows
 * their final name in totals, and we must match it so our recomputed totals
 * stay identical to the file's.
 */
function mergeInto(
  dst: Record<string, unknown>,
  src: Record<string, unknown>,
): void {
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === "number") {
      const cur = dst[k];
      dst[k] = typeof cur === "number" ? cur + v : v;
    } else if (Array.isArray(v)) {
      if (!(k in dst)) dst[k] = v;
    } else if (v !== null && typeof v === "object") {
      const cur = dst[k];
      const next =
        cur !== null && typeof cur === "object" && !Array.isArray(cur)
          ? (cur as Record<string, unknown>)
          : {};
      mergeInto(next, v as Record<string, unknown>);
      dst[k] = next;
    } else {
      dst[k] = v; // name, character, is_bot, steamid: newer wins
    }
  }
}

/** Recompute campaign totals from the chapter records. */
export function computeTotals(session: RawSession): Record<string, RawPlayer> {
  const totals: Record<string, Record<string, unknown>> = {};
  for (const ch of session.chapters) {
    for (const [key, rec] of Object.entries(ch.players)) {
      const slot = (totals[key] ??= {});
      mergeInto(slot, rec as unknown as Record<string, unknown>);
    }
  }
  return totals as unknown as Record<string, RawPlayer>;
}

/**
 * Chronological sort key.
 *
 * PLAN.md says to fall back to `session_id`, which sorts lexicographically
 * into chronological order. That holds for the timestamped form, but
 * util.nut:107 emits "s412330-0004" when the build has no wall clock, and
 * those sort after every real date while carrying no time information at
 * all. So prefer any real timestamp, fall back to the id only then, and
 * flag the result as approximate so the UI can say so.
 */
export function sessionSortKey(s: {
  started_utc: number;
  updated_utc: number;
  session_id: string;
}): { sortKey: string; approximate: boolean } {
  const stamp = s.started_utc > 0 ? s.started_utc : s.updated_utc;
  if (stamp > 0) {
    return {
      sortKey: `1:${String(stamp).padStart(12, "0")}`,
      approximate: false,
    };
  }
  return { sortKey: `0:${s.session_id}`, approximate: true };
}

export function normalizeSession(
  raw: RawSession,
  source: SessionSource,
): NormalizedSession {
  const chapters: NormalizedChapter[] = raw.chapters.map((ch) => {
    const players = normalizePlayerMap(ch.players);
    return {
      map: ch.map,
      index: ch.index,
      started_utc: ch.started_utc,
      playtime_s: ch.playtime_s,
      round_starts: ch.round_starts,
      outcome: isChapterOutcome(ch.outcome) ? ch.outcome : "in_progress",
      outcomeRaw: ch.outcome,
      players,
      playersByKey: byKey(players),
    };
  });

  const totals = normalizePlayerMap(computeTotals(raw));
  const totalsRaw = normalizePlayerMap(raw.totals);

  const firstMap = chapters[0]?.map ?? raw.campaign;
  const official = raw.official ?? isOfficialMapName(firstMap);

  const complete = (raw.outcomes["finale_win"] ?? 0) > 0;
  const anyChapterRunning = chapters.some((c) => c.outcome === "in_progress");
  const { sortKey, approximate } = sessionSortKey(raw);

  return {
    schema: raw.schema,
    sessionId: raw.session_id,
    campaign: raw.campaign,
    gamemode: raw.gamemode,
    difficulty: raw.difficulty,
    difficultyLabel: difficultyLabel(raw.difficulty),
    difficultyDisplay: difficultyDisplay(raw.difficulty, raw.gamemode),
    startedUtc: raw.started_utc,
    updatedUtc: raw.updated_utc,
    playtimeS: raw.playtime_s,
    roundStarts: raw.round_starts,
    saves: raw.saves,
    outcomes: raw.outcomes,
    eventsSeen: raw.events_seen,
    chapters,
    totals,
    totalsByKey: byKey(totals),
    totalsRaw,
    official,
    complete,
    inProgress: anyChapterRunning || !complete,
    wipes: raw.outcomes["wipe"] ?? 0,
    sortKey,
    timeApproximate: approximate,
    source,
    weaponAttribution: raw.weapon_attribution
      ? {
          fromEvent: raw.weapon_attribution.from_event,
          inferred: raw.weapon_attribution.inferred,
        }
      : null,
  };
}

//---------------------------------------------------------------------
// Parsing entry point
//---------------------------------------------------------------------

export interface ParseSuccess {
  ok: true;
  session: NormalizedSession;
}

export interface ParseFailure {
  ok: false;
  fileName: string;
  origin: "fs" | "upload";
  /** Readable, per PLAN.md section 2: a bad file gets an error, not a blank page. */
  error: string;
  issues: string[];
}

export type ParseResult = ParseSuccess | ParseFailure;

/**
 * A schema-2 chapter file, parsed but not yet joined to its run.
 *
 * A single chapter is not a session, so it cannot be normalized on its own.
 * The loader collects these and calls `assembleRuns` once it has seen every
 * file in the directory.
 */
export interface ChapterParseSuccess {
  ok: true;
  kind: "chapter";
  file: RawChapterFile;
  source: SessionSource;
}

export type FileParseResult = ParseResult | ChapterParseSuccess;

/** Parse one already-decoded JSON value. Never throws. */
export function parseSessionJson(
  json: unknown,
  source: SessionSource,
): ParseResult {
  const result = SessionSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    return {
      ok: false,
      fileName: source.fileName,
      origin: source.origin,
      error: `Does not look like a PSTATS file (${issues.length} problem${
        issues.length === 1 ? "" : "s"
      })`,
      issues: issues.slice(0, 20),
    };
  }
  return { ok: true, session: normalizeSession(result.data, source) };
}

/**
 * Strip what the game appends to a file that is otherwise valid JSON.
 *
 * Squirrel's StringToFile writes a trailing NUL terminator, so every file
 * the mod produces ends `}\0` and fails JSON.parse outright at the byte
 * after the closing brace. A UTF-8 BOM gets the same treatment: both are
 * producer artefacts, not content, and neither should cost the user a file.
 */
export function stripFileArtifacts(text: string): string {
  return text.replace(/^﻿/, "").replace(/\0+$/, "").trim();
}

/** Parse one file's text. Never throws. */
export function parseSessionText(
  text: string,
  source: SessionSource,
): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(stripFileArtifacts(text));
  } catch (e) {
    return {
      ok: false,
      fileName: source.fileName,
      origin: source.origin,
      error: `Not valid JSON: ${(e as Error).message}`,
      issues: [],
    };
  }
  return parseSessionJson(json, source);
}

//---------------------------------------------------------------------
// Schema 2: chapter files
//---------------------------------------------------------------------

/**
 * Parse one file of either shape.
 *
 * Schema 1 files normalize immediately. Schema 2 chapter files cannot —
 * a chapter is not a session — so they come back as `kind: "chapter"` for
 * `assembleRuns` to join once the whole directory has been read.
 */
export function parseFileText(
  text: string,
  source: SessionSource,
): FileParseResult {
  let json: unknown;
  try {
    json = JSON.parse(stripFileArtifacts(text));
  } catch (e) {
    return {
      ok: false,
      fileName: source.fileName,
      origin: source.origin,
      error: `Not valid JSON: ${(e as Error).message}`,
      issues: [],
    };
  }

  if (isChapterFile(json)) {
    const result = ChapterFileSchema.safeParse(json);
    if (!result.success) {
      const issues = result.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      );
      return {
        ok: false,
        fileName: source.fileName,
        origin: source.origin,
        error: `Does not look like a PSTATS chapter file (${issues.length} problem${
          issues.length === 1 ? "" : "s"
        })`,
        issues: issues.slice(0, 20),
      };
    }
    return { ok: true, kind: "chapter", file: result.data, source };
  }

  return parseSessionJson(json, source);
}

/**
 * Join parsed chapter files into sessions, one per run.
 *
 * The source recorded against the assembled session is the last chapter's
 * file, since that is the file whose campaign-level scalars `foldRun` keeps.
 */
export function assembleRuns(
  chapters: ChapterParseSuccess[],
): NormalizedSession[] {
  const runs = new Map<string, ChapterParseSuccess[]>();
  for (const c of chapters) {
    const key = runKey(c.file);
    const bucket = runs.get(key);
    if (bucket) bucket.push(c);
    else runs.set(key, [c]);
  }

  const out: NormalizedSession[] = [];
  for (const bucket of runs.values()) {
    const raw = foldRun(bucket.map((c) => c.file));
    const last = bucket[bucket.length - 1];
    if (raw === null || last === undefined) continue;
    out.push(normalizeSession(raw, last.source));
  }
  return out;
}
