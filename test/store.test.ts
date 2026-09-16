import { describe, expect, it } from "vitest";
import { parseSessionJson, type ParseResult } from "@/lib/normalize";
import { buildStore, emptyStore, mergeStores } from "@/lib/store";
import { SAMPLES, readSampleJson, readSampleText, sampleFiles } from "./fixtures";
import { parseSessionText } from "@/lib/normalize";

function fsResult(fileName: string): ParseResult {
  return parseSessionText(readSampleText(fileName), { origin: "fs", fileName });
}

function allSamples(): ParseResult[] {
  return sampleFiles().map(fsResult);
}

describe("the store from all four samples", () => {
  it("keeps all four, since no two share a session_id", () => {
    // Worth being explicit: PLAN.md section 8 asks for a dedupe test where
    // _current.json and an archive share a session_id, but no sample pair
    // actually collides -- _current is session 0004 / campaign c5, which no
    // archive carries. The collision is covered synthetically below.
    const store = buildStore(allSamples());
    expect(store.sessions).toHaveLength(4);
    expect(store.dropped).toEqual([]);
    expect(store.failures).toEqual([]);
    expect(store.sessions.map((s) => s.sessionId).sort()).toEqual([
      "2026-09-12_1747-0002",
      "2026-09-12_1747-0003",
      "2026-09-12_1747-0004",
      "2026-09-13_0220-0004",
    ]);
  });

  it("sorts newest first", () => {
    const store = buildStore(allSamples());
    expect(store.sessions[0]!.sessionId).toBe("2026-09-13_0220-0004");
    for (let i = 1; i < store.sessions.length; i++) {
      expect(
        store.sessions[i - 1]!.sortKey >= store.sessions[i]!.sortKey,
      ).toBe(true);
    }
  });

  it("indexes by session id", () => {
    const store = buildStore(allSamples());
    expect(store.byId["2026-09-13_0220-0004"]!.campaign).toBe(
      "l4d_dam01_riverbank",
    );
  });

  it("reports no approximate timestamps for the samples", () => {
    expect(buildStore(allSamples()).anyTimeApproximate).toBe(false);
  });

  it("recurs the same four steam ids across files, for aggregation", () => {
    const store = buildStore(allSamples());
    const counts = new Map<string, number>();
    for (const s of store.sessions) {
      for (const p of s.totals) {
        counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
      }
    }
    expect(counts.get("STEAM_1:0:41882317")).toBe(4);
    expect(counts.get("STEAM_1:0:73310092")).toBe(3);
    expect(counts.get("STEAM_1:1:19204483")).toBe(3);
    expect(counts.get("STEAM_1:1:55014728")).toBe(3);
  });
});

describe("dedupe by session_id", () => {
  // PLAN.md section 1.4: keep the copy with the higher `saves`, tiebreak on
  // `updated_utc`. Built synthetically because no sample pair collides.
  function duplicatePair(
    aSaves: number,
    bSaves: number,
    aUpdated = 1000,
    bUpdated = 1000,
  ): ParseResult[] {
    const base = readSampleJson(SAMPLES.c1) as any;
    const archive = structuredClone(base);
    archive.saves = aSaves;
    archive.updated_utc = aUpdated;
    const current = structuredClone(base);
    current.saves = bSaves;
    current.updated_utc = bUpdated;
    return [
      parseSessionJson(archive, {
        origin: "fs",
        fileName: "2026-09-12_1747-0002_c1_coop.json",
      }),
      parseSessionJson(current, { origin: "fs", fileName: "_current.json" }),
    ];
  }

  it("keeps the copy with the higher saves", () => {
    const store = buildStore(duplicatePair(88, 120));
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]!.saves).toBe(120);
    expect(store.sessions[0]!.source.fileName).toBe("_current.json");
    expect(store.dropped).toHaveLength(1);
    expect(store.dropped[0]!.reason).toBe("higher saves");
    expect(store.dropped[0]!.dropped).toBe("2026-09-12_1747-0002_c1_coop.json");
  });

  it("keeps the archive when it has the higher saves", () => {
    const store = buildStore(duplicatePair(200, 47));
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]!.saves).toBe(200);
    expect(store.sessions[0]!.source.fileName).toBe(
      "2026-09-12_1747-0002_c1_coop.json",
    );
  });

  it("is insensitive to the order the files arrive in", () => {
    const forward = buildStore(duplicatePair(88, 120));
    const reversed = buildStore(duplicatePair(88, 120).reverse());
    expect(reversed.sessions).toHaveLength(1);
    expect(reversed.sessions[0]!.saves).toBe(forward.sessions[0]!.saves);
    expect(reversed.sessions[0]!.source.fileName).toBe(
      forward.sessions[0]!.source.fileName,
    );
  });

  it("tiebreaks on updated_utc when saves are equal", () => {
    const store = buildStore(duplicatePair(88, 88, 1000, 2000));
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]!.updatedUtc).toBe(2000);
    expect(store.dropped[0]!.reason).toBe("newer updated_utc");
  });

  it("keeps exactly one copy when both are identical", () => {
    const store = buildStore(duplicatePair(88, 88, 1000, 1000));
    expect(store.sessions).toHaveLength(1);
    expect(store.dropped[0]!.reason).toBe("first seen");
  });

  it("does not double-count a deduped campaign in all-time totals", () => {
    // The bug PLAN.md section 1.4 is actually guarding against.
    const store = buildStore(duplicatePair(88, 120));
    const allTimeKills = store.sessions
      .flatMap((s) => s.totals)
      .reduce((a, p) => a + p.offense.total_kills, 0);
    const single = store.sessions[0]!.totals.reduce(
      (a, p) => a + p.offense.total_kills,
      0,
    );
    expect(allTimeKills).toBe(single);
  });

  it("dedupes three copies down to the best one", () => {
    const base = readSampleJson(SAMPLES.c1) as any;
    const mk = (saves: number, fileName: string) => {
      const j = structuredClone(base);
      j.saves = saves;
      return parseSessionJson(j, { origin: "fs", fileName });
    };
    const store = buildStore([mk(10, "a.json"), mk(99, "b.json"), mk(50, "c.json")]);
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]!.saves).toBe(99);
    expect(store.dropped).toHaveLength(2);
  });

  it("dedupes an upload against a filesystem copy", () => {
    const base = readSampleJson(SAMPLES.c1) as any;
    const fsCopy = structuredClone(base);
    fsCopy.saves = 88;
    const upCopy = structuredClone(base);
    upCopy.saves = 140;

    const fs = buildStore([
      parseSessionJson(fsCopy, { origin: "fs", fileName: "archive.json" }),
    ]);
    const up = buildStore([
      parseSessionJson(upCopy, { origin: "upload", fileName: "friend.json" }),
    ]);
    const merged = mergeStores(fs, up);

    expect(merged.sessions).toHaveLength(1);
    expect(merged.sessions[0]!.saves).toBe(140);
    expect(merged.sessions[0]!.source.origin).toBe("upload");
  });
});

describe("failures are kept, not thrown", () => {
  it("collects bad files alongside good ones", () => {
    const results: ParseResult[] = [
      ...allSamples(),
      parseSessionJson({ nope: true }, { origin: "upload", fileName: "bad.json" }),
    ];
    const store = buildStore(results);
    expect(store.sessions).toHaveLength(4);
    expect(store.failures).toHaveLength(1);
    expect(store.failures[0]!.fileName).toBe("bad.json");
  });

  it("keeps failures when merging stores", () => {
    const good = buildStore(allSamples());
    const bad = buildStore([
      parseSessionJson(null, { origin: "upload", fileName: "junk.json" }),
    ]);
    const merged = mergeStores(good, bad);
    expect(merged.sessions).toHaveLength(4);
    expect(merged.failures).toHaveLength(1);
  });
});

describe("empty store", () => {
  it("is a valid empty state, not an error", () => {
    const store = emptyStore();
    expect(store.sessions).toEqual([]);
    expect(store.failures).toEqual([]);
    expect(buildStore([]).sessions).toEqual([]);
  });
});
