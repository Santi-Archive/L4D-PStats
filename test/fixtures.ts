import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseSessionText, type NormalizedSession } from "@/lib/normalize";

/**
 * The real tracker output is the fixture set. PLAN.md says `samples/` and
 * mentions three files; the directory is actually `sample/` and holds four,
 * the fourth being a custom/Workshop campaign.
 */
export const SAMPLE_DIR = path.resolve(__dirname, "../sample");

export const SAMPLES = {
  c1: "2026-09-12_1747-0002_c1_coop.json",
  c2: "2026-09-12_1747-0003_c2_coop.json",
  custom: "2026-09-13_0220-0004_l4d_dam01_riverbank_coop.json",
  current: "_current.json",
} as const;

export function sampleFiles(): string[] {
  return readdirSync(SAMPLE_DIR)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort();
}

export function readSampleText(fileName: string): string {
  return readFileSync(path.join(SAMPLE_DIR, fileName), "utf8");
}

export function readSampleJson(fileName: string): unknown {
  return JSON.parse(readSampleText(fileName));
}

/** Parse a sample, failing the test loudly if it does not parse. */
export function loadSample(fileName: string): NormalizedSession {
  const r = parseSessionText(readSampleText(fileName), {
    origin: "fs",
    fileName,
  });
  if (!r.ok) {
    throw new Error(
      `fixture ${fileName} failed to parse: ${r.error}\n${r.issues.join("\n")}`,
    );
  }
  return r.session;
}

/** First key of an object, asserted present. Keeps tests readable under
 *  noUncheckedIndexedAccess. */
export function firstKey(o: object): string {
  const k = Object.keys(o)[0];
  if (k === undefined) throw new Error("expected at least one key");
  return k;
}

//---------------------------------------------------------------------
// Schema 2: real chapter files from the data directory
//---------------------------------------------------------------------

/**
 * The two No-Mercy chapter files are real mod output, NUL terminator and
 * all. They are the only fixtures for schema 2, so the tests read them
 * from `data/` rather than copying them into `sample/` where they would
 * drift out of sync with the real thing.
 */
export const DATA_DIR = path.resolve(__dirname, "../data");

export const CHAPTER_FILES = {
  ch1: "no-mercy--run-0002--chapter-01.json",
  ch2: "no-mercy--run-0002--chapter-02.json",
} as const;

/**
 * Run 0006, written after the mod gained per-weapon tracking. Run 0002 is
 * kept alongside it on purpose: it is the same format WITHOUT a `weapons`
 * table, so the pair proves both that the new data is read and that a file
 * predating it still parses.
 */
export const WEAPON_CHAPTER_FILES = {
  ch1: "no-mercy--run-0006--chapter-01.json",
  ch2: "no-mercy--run-0006--chapter-02.json",
  ch3: "no-mercy--run-0006--chapter-03.json",
} as const;

export function readChapterText(fileName: string): string {
  return readFileSync(path.join(DATA_DIR, fileName), "utf8");
}
