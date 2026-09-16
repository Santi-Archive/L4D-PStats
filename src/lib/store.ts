import type {
  NormalizedSession,
  ParseFailure,
  ParseResult,
} from "./normalize";

/**
 * The one normalized store both input paths feed. Nothing downstream knows
 * or cares whether a session came off the filesystem or out of the dropzone.
 */

export interface DropDecision {
  sessionId: string;
  /** The file we kept. */
  kept: string;
  /** The file we discarded. */
  dropped: string;
  reason: "higher saves" | "newer updated_utc" | "first seen";
  keptSaves: number;
  droppedSaves: number;
}

export interface StatsStore {
  /** Deduped sessions, newest first. */
  sessions: NormalizedSession[];
  byId: Record<string, NormalizedSession>;
  /** Files that failed to parse, kept so the UI can show a real error. */
  failures: ParseFailure[];
  /** Dedupe decisions, so the UI can explain why a file was ignored. */
  dropped: DropDecision[];
  /** True when any kept session had no usable timestamp. */
  anyTimeApproximate: boolean;
}

/**
 * Decide which of two copies of the same session wins.
 *
 * PLAN.md section 1.4: keep the higher `saves`, tiebreak on `updated_utc`.
 * The mod bumps `saves` on every write (main.nut:393) so it is a monotonic
 * revision counter, which makes it a better signal than the clock -- the
 * clock can be 0 on builds with no wall time.
 *
 * Worth noting this collision is narrower than PLAN.md implies: the archive
 * filename is derived from session_id + campaign + gamemode (main.nut:425)
 * specifically so re-archiving overwrites rather than duplicating. The
 * duplicate only appears while `_current.json` still holds a session that
 * has already been archived.
 */
function preferred(
  a: NormalizedSession,
  b: NormalizedSession,
): { winner: NormalizedSession; loser: NormalizedSession; reason: DropDecision["reason"] } {
  if (a.saves !== b.saves) {
    return a.saves > b.saves
      ? { winner: a, loser: b, reason: "higher saves" }
      : { winner: b, loser: a, reason: "higher saves" };
  }
  if (a.updatedUtc !== b.updatedUtc) {
    return a.updatedUtc > b.updatedUtc
      ? { winner: a, loser: b, reason: "newer updated_utc" }
      : { winner: b, loser: a, reason: "newer updated_utc" };
  }
  // Genuinely indistinguishable: keep whichever we saw first, deterministically.
  return { winner: a, loser: b, reason: "first seen" };
}

/**
 * Build the store from parse results.
 *
 * Accepts results from either origin in one call, so the fs loader and the
 * dropzone can be merged and deduped against each other.
 */
export function buildStore(results: ParseResult[]): StatsStore {
  const byId: Record<string, NormalizedSession> = {};
  const failures: ParseFailure[] = [];
  const dropped: DropDecision[] = [];

  for (const r of results) {
    if (!r.ok) {
      failures.push(r);
      continue;
    }
    const incoming = r.session;
    const existing = byId[incoming.sessionId];
    if (!existing) {
      byId[incoming.sessionId] = incoming;
      continue;
    }
    const { winner, loser, reason } = preferred(existing, incoming);
    byId[incoming.sessionId] = winner;
    dropped.push({
      sessionId: incoming.sessionId,
      kept: winner.source.fileName,
      dropped: loser.source.fileName,
      reason,
      keptSaves: winner.saves,
      droppedSaves: loser.saves,
    });
  }

  const sessions = Object.values(byId).sort((a, b) => {
    if (a.sortKey !== b.sortKey) return b.sortKey.localeCompare(a.sortKey);
    return b.sessionId.localeCompare(a.sessionId);
  });

  return {
    sessions,
    byId,
    failures,
    dropped,
    anyTimeApproximate: sessions.some((s) => s.timeApproximate),
  };
}

export function emptyStore(): StatsStore {
  return {
    sessions: [],
    byId: {},
    failures: [],
    dropped: [],
    anyTimeApproximate: false,
  };
}

/** Merge two stores (for example fs + uploads), rededuping across both. */
export function mergeStores(a: StatsStore, b: StatsStore): StatsStore {
  const results: ParseResult[] = [
    ...a.sessions.map((session) => ({ ok: true as const, session })),
    ...b.sessions.map((session) => ({ ok: true as const, session })),
  ];
  const merged = buildStore(results);
  return {
    ...merged,
    failures: [...a.failures, ...b.failures],
    dropped: [...a.dropped, ...b.dropped, ...merged.dropped],
  };
}
