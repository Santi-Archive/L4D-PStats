import { describe, expect, it } from "vitest";
import {
  ChapterFileSchema,
  foldRun,
  isChapterFile,
  runKey,
  type RawChapterFile,
} from "@/lib/chapterfile";
import {
  assembleRuns,
  parseFileText,
  stripFileArtifacts,
  type ChapterParseSuccess,
} from "@/lib/normalize";
import { CHAPTER_FILES, readChapterText, readSampleText, SAMPLES } from "./fixtures";

/**
 * Schema 2 is the format the mod actually writes now. These tests run
 * against the real files in `data/`, unedited, so anything the producer
 * does that a hand-written fixture would smooth over still gets caught.
 */

const src = { origin: "fs", fileName: "x.json" } as const;

function parseChapter(fileName: string): RawChapterFile {
  const text = readChapterText(fileName);
  const r = ChapterFileSchema.safeParse(JSON.parse(stripFileArtifacts(text)));
  if (!r.success) throw new Error(`fixture did not parse: ${r.error.message}`);
  return r.data;
}

describe("stripFileArtifacts", () => {
  it("removes the NUL terminator Squirrel's StringToFile appends", () => {
    // This is the bug that made every real file unreadable: the byte after
    // the closing brace is \0, and JSON.parse rejects it outright.
    expect(() => JSON.parse('{"a":1}\0')).toThrow();
    expect(JSON.parse(stripFileArtifacts('{"a":1}\0'))).toEqual({ a: 1 });
  });

  it("removes a UTF-8 BOM", () => {
    expect(JSON.parse(stripFileArtifacts('﻿{"a":1}'))).toEqual({ a: 1 });
  });

  it("leaves clean text untouched", () => {
    expect(stripFileArtifacts('{"a":1}')).toBe('{"a":1}');
  });

  it("handles the real files, which all end in a NUL", () => {
    for (const f of Object.values(CHAPTER_FILES)) {
      const raw = readChapterText(f);
      expect(raw.endsWith("\0")).toBe(true);
      expect(() => JSON.parse(raw)).toThrow();
      expect(() => JSON.parse(stripFileArtifacts(raw))).not.toThrow();
    }
  });
});

describe("isChapterFile", () => {
  it("recognizes a real chapter file", () => {
    const json = JSON.parse(stripFileArtifacts(readChapterText(CHAPTER_FILES.ch1)));
    expect(isChapterFile(json)).toBe(true);
  });

  it("rejects a schema-1 session file, which has a chapters array", () => {
    const json = JSON.parse(readSampleText(SAMPLES.c1));
    expect(isChapterFile(json)).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isChapterFile(null)).toBe(false);
    expect(isChapterFile([])).toBe(false);
    expect(isChapterFile("hello")).toBe(false);
  });

  it("keys off shape, not the schema number, so a version bump still parses", () => {
    expect(isChapterFile({ schema: 99, map: "c1m1", players: {} })).toBe(true);
  });
});

describe("ChapterFileSchema", () => {
  it("parses the real files", () => {
    const ch1 = parseChapter(CHAPTER_FILES.ch1);
    expect(ch1.session_id).toBe("0002_s988921");
    expect(ch1.run).toBe(2);
    expect(ch1.map).toBe("c8m1_apartment");
    expect(ch1.chapter_number).toBe(1);
    expect(ch1.outcome).toBe("cleared");
    expect(Object.keys(ch1.players)).toHaveLength(4);
  });

  it("keeps the in_progress outcome on the running chapter", () => {
    expect(parseChapter(CHAPTER_FILES.ch2).outcome).toBe("in_progress");
  });

  it("preserves unknown top-level keys rather than stripping them", () => {
    const r = ChapterFileSchema.parse({
      session_id: "s1",
      map: "c1m1",
      players: {},
      some_future_field: 42,
    });
    expect((r as Record<string, unknown>).some_future_field).toBe(42);
  });

  it("requires a session_id, since it is half the join key", () => {
    expect(ChapterFileSchema.safeParse({ map: "c1m1", players: {} }).success).toBe(
      false,
    );
  });
});

describe("runKey", () => {
  it("joins on session_id and run together", () => {
    const ch1 = parseChapter(CHAPTER_FILES.ch1);
    const ch2 = parseChapter(CHAPTER_FILES.ch2);
    expect(runKey(ch1)).toBe(runKey(ch2));
  });

  it("separates runs that share a sequence number across sessions", () => {
    const a = ChapterFileSchema.parse({ session_id: "a", run: 2, map: "m", players: {} });
    const b = ChapterFileSchema.parse({ session_id: "b", run: 2, map: "m", players: {} });
    expect(runKey(a)).not.toBe(runKey(b));
  });
});

describe("foldRun", () => {
  it("returns null for an empty run", () => {
    expect(foldRun([])).toBeNull();
  });

  it("folds the two real chapters into one session in order", () => {
    const s = foldRun([
      parseChapter(CHAPTER_FILES.ch2),
      parseChapter(CHAPTER_FILES.ch1),
    ]);
    expect(s).not.toBeNull();
    expect(s!.chapters).toHaveLength(2);
    // Sorted by chapter_index regardless of the order they arrived in.
    expect(s!.chapters.map((c) => c.map)).toEqual([
      "c8m1_apartment",
      "c8m2_subway",
    ]);
    expect(s!.campaign).toBe("c8");
    expect(s!.session_id).toBe("0002_s988921");
  });

  it("sums playtime and round starts across chapters", () => {
    const s = foldRun([
      parseChapter(CHAPTER_FILES.ch1),
      parseChapter(CHAPTER_FILES.ch2),
    ])!;
    expect(s.playtime_s).toBeCloseTo(384.099 + 153.533, 3);
    // Chapter 1 was restarted twice: 3 round starts plus 1.
    expect(s.round_starts).toBe(4);
  });

  it("rebuilds the outcome tally, mapping cleared to map_cleared", () => {
    const s = foldRun([
      parseChapter(CHAPTER_FILES.ch1),
      parseChapter(CHAPTER_FILES.ch2),
    ])!;
    expect(s.outcomes).toEqual({ map_cleared: 1, in_progress: 1 });
  });

  it("leaves totals empty so normalizeSession recomputes them", () => {
    const s = foldRun([parseChapter(CHAPTER_FILES.ch1)])!;
    expect(s.totals).toEqual({});
  });

  it("takes campaign scalars from the last chapter, not the first", () => {
    const a = ChapterFileSchema.parse({
      session_id: "s", run: 1, chapter_index: 1, map: "c1m1", players: {},
      difficulty: "Easy",
    });
    const b = ChapterFileSchema.parse({
      session_id: "s", run: 1, chapter_index: 2, map: "c1m2", players: {},
      difficulty: "Impossible",
    });
    expect(foldRun([a, b])!.difficulty).toBe("Impossible");
  });

  it("falls back to chapter_index when the map name carries no number", () => {
    // Custom campaigns: ChapterNumberOf returns 0, so the mod writes the
    // run position instead and the display must follow.
    const f = ChapterFileSchema.parse({
      session_id: "s", run: 1, chapter_number: 0, chapter_index: 3,
      map: "l4d_dam01_riverbank", players: {},
    });
    expect(foldRun([f])!.chapters[0]!.index).toBe(3);
  });
});

describe("parseFileText", () => {
  it("returns a chapter result for a schema-2 file", () => {
    const r = parseFileText(readChapterText(CHAPTER_FILES.ch1), src);
    expect(r.ok).toBe(true);
    expect("kind" in r && r.kind).toBe("chapter");
  });

  it("still normalizes a schema-1 session file directly", () => {
    const r = parseFileText(readSampleText(SAMPLES.c1), src);
    expect(r.ok).toBe(true);
    expect("kind" in r).toBe(false);
  });

  it("reports unparseable JSON as a readable failure, not a throw", () => {
    const r = parseFileText("{not json", src);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Not valid JSON/);
  });
});

describe("assembleRuns", () => {
  function chapterResult(fileName: string): ChapterParseSuccess {
    const r = parseFileText(readChapterText(fileName), { origin: "fs", fileName });
    if (!r.ok || !("kind" in r)) throw new Error("expected a chapter result");
    return r;
  }

  it("joins the two real chapter files into a single run", () => {
    const runs = assembleRuns([
      chapterResult(CHAPTER_FILES.ch1),
      chapterResult(CHAPTER_FILES.ch2),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.chapters).toHaveLength(2);
    expect(runs[0]!.campaign).toBe("c8");
  });

  it("recomputes campaign totals from the joined chapters", () => {
    const runs = assembleRuns([
      chapterResult(CHAPTER_FILES.ch1),
      chapterResult(CHAPTER_FILES.ch2),
    ]);
    const wob = runs[0]!.totals.find((p) => p.label === "Wob");
    // 140 kills in the apartment plus 77 in the subway.
    expect(wob?.offense.total_kills).toBe(217);
  });

  it("reports the run as in progress while a chapter is still running", () => {
    const runs = assembleRuns([
      chapterResult(CHAPTER_FILES.ch1),
      chapterResult(CHAPTER_FILES.ch2),
    ]);
    expect(runs[0]!.complete).toBe(false);
    expect(runs[0]!.inProgress).toBe(true);
  });

  it("flags ordering as approximate, since schema 2 carries no clock", () => {
    const runs = assembleRuns([chapterResult(CHAPTER_FILES.ch1)]);
    expect(runs[0]!.timeApproximate).toBe(true);
  });

  it("keeps separate runs apart", () => {
    const mk = (sid: string, run: number, idx: number): ChapterParseSuccess => ({
      ok: true,
      kind: "chapter",
      file: ChapterFileSchema.parse({
        session_id: sid, run, chapter_index: idx, map: `c1m${idx}`, players: {},
      }),
      source: { origin: "fs", fileName: `${sid}-${idx}.json` },
    });
    const runs = assembleRuns([mk("a", 1, 1), mk("a", 1, 2), mk("b", 1, 1)]);
    expect(runs).toHaveLength(2);
  });

  it("returns nothing for no input", () => {
    expect(assembleRuns([])).toEqual([]);
  });
});
