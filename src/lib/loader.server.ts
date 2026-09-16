import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  assembleRuns,
  parseFileText,
  type ChapterParseSuccess,
  type ParseResult,
} from "./normalize";
import { buildStore, emptyStore, type StatsStore } from "./store";

/**
 * Server-side reader for the PSTATS output directory.
 *
 * Intended use is a symlink, so the app reads live game output:
 *   ln -s "/path/to/Left 4 Dead 2/left4dead2/ems/pstats" ./data
 *
 * Server-only: imports node:fs. Never import from a client component.
 */

export const PSTATS_DIR_DEFAULT = "./data";

export function pstatsDir(): string {
  const configured = process.env.PSTATS_DIR?.trim();
  return configured && configured !== "" ? configured : PSTATS_DIR_DEFAULT;
}

export interface LoadReport {
  store: StatsStore;
  /** Absolute directory actually read. */
  dir: string;
  /** True when the directory does not exist -- an empty state, not an error. */
  missing: boolean;
  /** Files considered, in read order. */
  filesRead: string[];
  /** Directory-level problem, e.g. permissions. */
  dirError?: string;
}

/**
 * Read and parse every .json file in the directory.
 *
 * `_current.json` is read last so that, when it duplicates an archive, the
 * archive is the one already in the map -- the dedupe rule then decides on
 * `saves` rather than on read order. Ordering is not load-bearing, but it
 * keeps the "first seen" tiebreak stable.
 */
export async function loadFromDisk(dir = pstatsDir()): Promise<LoadReport> {
  // The path is user-configured by design (it points at a symlink into the
  // game folder), so the bundler cannot statically scope it. There is no
  // deploy target here -- PLAN.md section 9 -- so the tracing warning this
  // would otherwise raise is moot.
  const abs = path.resolve(/* turbopackIgnore: true */ process.cwd(), dir);

  let entries: string[];
  try {
    const st = await stat(abs);
    if (!st.isDirectory()) {
      return {
        store: emptyStore(),
        dir: abs,
        missing: true,
        filesRead: [],
        dirError: `${abs} is not a directory`,
      };
    }
    entries = await readdir(abs);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    const missing = err.code === "ENOENT";
    return {
      store: emptyStore(),
      dir: abs,
      missing,
      filesRead: [],
      dirError: missing
        ? undefined
        : `Could not read ${abs}: ${err.message}`,
    };
  }

  const jsonFiles = entries
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort((a, b) => {
      // Archives first, _current.json last.
      const ac = a === "_current.json" ? 1 : 0;
      const bc = b === "_current.json" ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return a.localeCompare(b);
    });

  // Two passes, because schema 2 writes one file per chapter and a chapter
  // is not a session. Whole-session files (schema 1) normalize as they are
  // read; chapter files are held back and joined by run once the directory
  // has been read in full.
  const results: ParseResult[] = [];
  const chapterFiles: ChapterParseSuccess[] = [];

  for (const fileName of jsonFiles) {
    const full = path.join(abs, fileName);
    try {
      const text = await readFile(full, "utf8");
      const parsed = parseFileText(text, { origin: "fs", fileName });
      if (parsed.ok && "kind" in parsed) chapterFiles.push(parsed);
      else results.push(parsed);
    } catch (e) {
      results.push({
        ok: false,
        fileName,
        origin: "fs",
        error: `Could not read file: ${(e as Error).message}`,
        issues: [],
      });
    }
  }

  for (const session of assembleRuns(chapterFiles)) {
    results.push({ ok: true, session });
  }

  return {
    store: buildStore(results),
    dir: abs,
    missing: false,
    filesRead: jsonFiles,
  };
}
