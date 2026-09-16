import { parseSessionText, type ParseResult } from "./normalize";
import { buildStore, type StatsStore } from "./store";

/**
 * Client-side path: files dragged in from anywhere (a friend's machine, a
 * copy off a server). Parsed in the browser and cached in localStorage so a
 * refresh does not lose them.
 *
 * We persist the raw file text, not the normalized objects: the schema and
 * normalization will keep changing, and re-parsing on load means a cache
 * written by an older build cannot poison a newer one.
 */

export const UPLOADS_KEY = "pstats.uploads.v1";

export interface StoredUpload {
  fileName: string;
  text: string;
  /** When it was dropped in, ms since epoch. */
  addedAt: number;
}

export async function readDroppedFiles(
  files: readonly File[],
): Promise<StoredUpload[]> {
  const jsonish = files.filter(
    (f) => f.name.toLowerCase().endsWith(".json") || f.type === "application/json",
  );
  return Promise.all(
    jsonish.map(async (f) => ({
      fileName: f.name,
      text: await f.text(),
      addedAt: Date.now(),
    })),
  );
}

export function parseUploads(uploads: readonly StoredUpload[]): ParseResult[] {
  return uploads.map((u) =>
    parseSessionText(u.text, { origin: "upload", fileName: u.fileName }),
  );
}

export function storeFromUploads(uploads: readonly StoredUpload[]): StatsStore {
  return buildStore(parseUploads(uploads));
}

//---------------------------------------------------------------------
// localStorage persistence. All guarded: private windows and blocked
// site data make these throw, and that must not take the page down.
//---------------------------------------------------------------------

export function loadStoredUploads(): StoredUpload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(UPLOADS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (u): u is StoredUpload =>
        typeof u === "object" &&
        u !== null &&
        typeof (u as StoredUpload).fileName === "string" &&
        typeof (u as StoredUpload).text === "string",
    );
  } catch {
    return [];
  }
}

export function saveStoredUploads(uploads: readonly StoredUpload[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(UPLOADS_KEY, JSON.stringify(uploads));
    return true;
  } catch {
    // Quota exceeded, or storage blocked. The uploads still work for this
    // session; they just will not survive a refresh.
    return false;
  }
}

export function clearStoredUploads(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(UPLOADS_KEY);
  } catch {
    /* nothing useful to do */
  }
}

/** Replace any existing entry with the same file name. */
export function mergeUploads(
  existing: readonly StoredUpload[],
  incoming: readonly StoredUpload[],
): StoredUpload[] {
  const byName = new Map(existing.map((u) => [u.fileName, u]));
  for (const u of incoming) byName.set(u.fileName, u);
  return [...byName.values()];
}
