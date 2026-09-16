import { describe, expect, it } from "vitest";
import { parseSessionJson, parseSessionText } from "@/lib/normalize";
import { SessionSchema } from "@/lib/schema";
import { SAMPLES, firstKey, loadSample, readSampleJson, sampleFiles } from "./fixtures";

const src = { origin: "fs" as const, fileName: "test.json" };

describe("all samples parse", () => {
  it("finds every sample file", () => {
    // Guards against the fixtures being renamed or moved out from under us.
    expect(sampleFiles()).toEqual([
      SAMPLES.c1,
      SAMPLES.c2,
      SAMPLES.custom,
      SAMPLES.current,
    ]);
  });

  it.each(sampleFiles())("%s parses without error", (fileName) => {
    const r = parseSessionJson(readSampleJson(fileName), {
      origin: "fs",
      fileName,
    });
    expect(r.ok, r.ok ? "" : `${r.error}: ${r.issues.join("; ")}`).toBe(true);
  });

  it.each(sampleFiles())("%s keeps its session_id and chapters", (fileName) => {
    const s = loadSample(fileName);
    expect(s.sessionId).toMatch(/\S/);
    expect(s.chapters.length).toBeGreaterThan(0);
    for (const c of s.chapters) {
      expect(c.players.length).toBeGreaterThan(0);
    }
  });
});

describe("open-ended stat tables", () => {
  it("parses unknown keys in kills rather than failing", () => {
    const base = readSampleJson(SAMPLES.c1) as Record<string, unknown>;
    const json = structuredClone(base) as any;
    const key = firstKey(json.chapters[0].players);
    const kills = json.chapters[0].players[key].offense.kills;
    // Things the mod can genuinely emit: a raw classname, a compound
    // source, an explicit unknown, and a future infected type.
    kills["infected_special_zombie"] = 3;
    kills["common_by_explosion"] = 12;
    kills["unknown"] = 1;
    kills["some_future_special"] = 7;

    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.session.chapters[0]!.playersByKey[key]!;
    expect(p.offense.kills["infected_special_zombie"]).toBe(3);
    expect(p.offense.kills["common_by_explosion"]).toBe(12);
    expect(p.offense.kills["unknown"]).toBe(1);
    expect(p.offense.kills["some_future_special"]).toBe(7);
  });

  it("accepts unknown keys in every open table", () => {
    const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
    const key = firstKey(json.chapters[0].players);
    const p = json.chapters[0].players[key];
    p.offense.headshots["mystery"] = 2;
    p.offense.damage_dealt["mystery"] = 40;
    p.defense.damage_taken["radiation"] = 9;
    p.defense.incapped_by["mystery"] = 1;
    p.defense.killed_by["mystery"] = 1;
    p.defense.grabbed_by["mystery_escaped"] = 4;
    p.actions.items_used["upgrade_pack_incendiary"] = 1;

    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = r.session.chapters[0]!.playersByKey[key]!;
    expect(out.defense.damage_taken["radiation"]).toBe(9);
    expect(out.defense.grabbed_by["mystery_escaped"]).toBe(4);
    expect(out.actions.items_used["upgrade_pack_incendiary"]).toBe(1);
  });

  it("preserves unknown keys on a pair record", () => {
    const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
    const key = firstKey(json.chapters[0].players);
    const pairs = json.chapters[0].players[key].teamwork.pairs;
    const other = firstKey(pairs);
    pairs[other]["future_metric"] = 5;

    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pr = r.session.chapters[0]!.playersByKey[key]!.teamwork.pairs[other]!;
    expect((pr as Record<string, unknown>)["future_metric"]).toBe(5);
  });

  it("tolerates an absent sub-table entirely", () => {
    const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
    const key = firstKey(json.chapters[0].players);
    delete json.chapters[0].players[key].offense.kills;
    delete json.chapters[0].players[key].defense.grabbed_by;
    delete json.chapters[0].players[key].actions;

    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.session.chapters[0]!.playersByKey[key]!;
    expect(p.offense.kills).toEqual({});
    expect(p.defense.grabbed_by).toEqual({});
    expect(p.actions.shoves).toBe(0);
  });

  it("does not fail the file over one non-numeric stat value", () => {
    const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
    const key = firstKey(json.chapters[0].players);
    json.chapters[0].players[key].offense.kills["broken"] = "not a number";
    json.chapters[0].players[key].offense.kills["common"] = 100;

    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const kills = r.session.chapters[0]!.playersByKey[key]!.offense.kills;
    expect(kills["broken"]).toBeUndefined();
    expect(kills["common"]).toBe(100);
  });
});

describe("difficulty and gamemode are not enums", () => {
  // The mod reads these straight off cvars with an "unknown" fallback
  // (util.nut:216 / util.nut:211), so an enum here would reject real files.
  it.each([
    "unknown",
    "Impossible",
    "hard",
    "somemutation_difficulty",
    "",
  ])("accepts difficulty %j", (difficulty) => {
    const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
    json.difficulty = difficulty;
    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
  });

  it.each(["coop", "realism", "mutation15", "unknown", "versus"])(
    "accepts gamemode %j",
    (gamemode) => {
      const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
      json.gamemode = gamemode;
      const r = parseSessionJson(json, src);
      expect(r.ok).toBe(true);
    },
  );

  it("accepts an unrecognized chapter outcome without losing it", () => {
    const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
    json.chapters[0].outcome = "some_new_outcome";
    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Falls back to a safe known value, but keeps the original for display.
    expect(r.session.chapters[0]!.outcome).toBe("in_progress");
    expect(r.session.chapters[0]!.outcomeRaw).toBe("some_new_outcome");
  });
});

describe("bad input produces a readable error, not a crash", () => {
  it("rejects non-JSON text", () => {
    const r = parseSessionText("<html>not json</html>", src);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Not valid JSON/);
  });

  it("rejects JSON that is not a PSTATS file", () => {
    const r = parseSessionJson({ hello: "world" }, src);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Does not look like a PSTATS file/);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it("rejects a file with no session_id", () => {
    const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
    delete json.session_id;
    expect(parseSessionJson(json, src).ok).toBe(false);
  });

  it("never throws on arbitrary junk", () => {
    for (const junk of [null, 0, "", [], [1, 2], true, { chapters: 5 }]) {
      expect(() => parseSessionJson(junk, src)).not.toThrow();
    }
  });

  it("accepts a minimal file with only a session_id", () => {
    // Defaults must carry a sparse file rather than rejecting it.
    const r = SessionSchema.safeParse({ session_id: "s123456-0001" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.chapters).toEqual([]);
    expect(r.data.difficulty).toBe("unknown");
  });
});
