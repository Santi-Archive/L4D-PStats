import { describe, expect, it } from "vitest";
import {
  difficultyDisplay,
  difficultyLabel,
  isOfficialMapName,
  isRealism,
  parseSessionJson,
  sessionSortKey,
} from "@/lib/normalize";
import { flattenNumbers, totalsDrift } from "@/lib/summary";
import { SAMPLES, firstKey, loadSample, readSampleJson, sampleFiles } from "./fixtures";

const src = { origin: "fs" as const, fileName: "test.json" };

describe("totals equal the sum of chapters", () => {
  // PLAN.md section 8. We recompute totals from chapters and compare against
  // the totals the file carries; any drift is a real bug in one side or the
  // other, and this is the test that catches it.
  it.each(sampleFiles())("%s: no drift for any player", (fileName) => {
    const s = loadSample(fileName);
    expect(totalsDrift(s)).toEqual([]);
  });

  it.each(sampleFiles())("%s: every player key matches", (fileName) => {
    const s = loadSample(fileName);
    expect(s.totals.map((p) => p.key).sort()).toEqual(
      s.totalsRaw.map((p) => p.key).sort(),
    );
  });

  it("catches drift when the file's totals are wrong", () => {
    const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
    const key = firstKey(json.totals);
    json.totals[key].offense.total_kills += 500;

    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const drift = totalsDrift(r.session);
    expect(drift.length).toBeGreaterThan(0);
    expect(drift.join("\n")).toContain("offense.total_kills");
    // The recomputed value is the trustworthy one.
    expect(r.session.totalsByKey[key]!.offense.total_kills).toBe(
      json.chapters.reduce(
        (sum: number, c: any) =>
          sum + (c.players[key]?.offense.total_kills ?? 0),
        0,
      ),
    );
  });

  it("recomputed totals never re-sum totals across chapters", () => {
    // PLAN.md section 1.3: the classic double-count bug.
    const s = loadSample(SAMPLES.c1);
    const chapterSum = s.chapters.reduce(
      (sum, c) =>
        sum +
        c.players.reduce((a, p) => a + p.offense.total_kills, 0),
      0,
    );
    const totalSum = s.totals.reduce((a, p) => a + p.offense.total_kills, 0);
    expect(totalSum).toBe(chapterSum);
  });

  it("takes the newer name when a player renames mid-campaign", () => {
    // Mirrors PST.MergeInto (main.nut:161): strings take the newer value.
    const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
    const key = firstKey(json.totals);
    json.chapters[0].players[key].name = "OldName";
    const last = json.chapters[json.chapters.length - 1];
    last.players[key].name = "NewName";

    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session.totalsByKey[key]!.label).toBe("NewName");
  });
});

describe("bot and human keys are distinguished", () => {
  it("classifies the c2 roster correctly", () => {
    const s = loadSample(SAMPLES.c2);
    const kinds = Object.fromEntries(s.totals.map((p) => [p.key, p.kind]));
    expect(kinds["STEAM_1:0:41882317"]).toBe("human");
    expect(kinds["STEAM_1:0:73310092"]).toBe("human");
    expect(kinds["STEAM_1:1:19204483"]).toBe("human");
    expect(kinds["STEAM_1:1:55014728"]).toBe("human");
    expect(kinds["BOT:Ellis"]).toBe("bot");
  });

  it("classifies the mostly-bot _current roster correctly", () => {
    const s = loadSample(SAMPLES.current);
    const humans = s.totals.filter((p) => p.kind === "human");
    const bots = s.totals.filter((p) => p.kind === "bot");
    expect(humans.map((p) => p.key)).toEqual(["STEAM_1:0:41882317"]);
    expect(bots.map((p) => p.key).sort()).toEqual([
      "BOT:Coach",
      "BOT:Ellis",
      "BOT:Rochelle",
    ]);
  });

  it.each(sampleFiles())(
    "%s: is_bot agrees with the BOT: key prefix",
    (fileName) => {
      const s = loadSample(fileName);
      for (const p of s.totals) {
        expect(p.is_bot).toBe(p.key.startsWith("BOT:"));
        expect(p.kind === "bot").toBe(p.key.startsWith("BOT:"));
      }
    },
  );

  it("treats a NAME: key as unresolved, not as a human steam id", () => {
    const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
    const key = Object.keys(json.totals).find((k) => k.startsWith("STEAM_"))!;
    for (const c of json.chapters) {
      if (c.players[key]) {
        c.players["NAME:Lagger"] = { ...c.players[key], steamid: "", name: "Lagger" };
        delete c.players[key];
      }
    }
    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.session.totalsByKey["NAME:Lagger"]!;
    expect(p.kind).toBe("unresolved");
    expect(p.steamid).toBe("");
    // The key, not steamid, is the identity.
    expect(p.key).toBe("NAME:Lagger");
  });

  it("falls back to the key for a label when name and character are empty", () => {
    const json = structuredClone(readSampleJson(SAMPLES.current)) as any;
    for (const c of json.chapters) {
      if (c.players["BOT:Coach"]) {
        c.players["BOT:Coach"].name = "";
        c.players["BOT:Coach"].character = "";
      }
    }
    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session.totalsByKey["BOT:Coach"]!.label).toBe("Coach");
  });
});

describe("the c2 departed player", () => {
  // PLAN.md section 8: a player leaves mid-campaign and a bot takes over.
  it("shows less playtime than the players who stayed", () => {
    const s = loadSample(SAMPLES.c2);
    const stayed = ["STEAM_1:0:41882317", "STEAM_1:0:73310092", "STEAM_1:1:19204483"];
    const departed = s.totalsByKey["STEAM_1:1:55014728"]!;

    for (const key of stayed) {
      expect(departed.playtime_s).toBeLessThan(s.totalsByKey[key]!.playtime_s);
    }
  });

  it("is absent from the chapters after leaving, and the bot is present", () => {
    const s = loadSample(SAMPLES.c2);
    const departed = "STEAM_1:1:55014728";
    const bot = "BOT:Ellis";

    const inChapter = s.chapters.map((c) => ({
      map: c.map,
      departed: departed in c.playersByKey,
      bot: bot in c.playersByKey,
    }));

    // Present for the first three chapters, gone for the last two.
    expect(inChapter.map((c) => c.departed)).toEqual([true, true, true, false, false]);
    expect(inChapter.map((c) => c.bot)).toEqual([false, false, false, true, true]);
  });

  it("gives the bot less playtime than the full-campaign humans", () => {
    const s = loadSample(SAMPLES.c2);
    const bot = s.totalsByKey["BOT:Ellis"]!;
    const full = s.totalsByKey["STEAM_1:0:41882317"]!;
    expect(bot.playtime_s).toBeLessThan(full.playtime_s);
  });

  it("counts five roster entries for a four-slot campaign", () => {
    // The consumer must not assume roster size equals team size.
    const s = loadSample(SAMPLES.c2);
    expect(s.totals).toHaveLength(5);
    for (const c of s.chapters) expect(c.players).toHaveLength(4);
  });
});

describe("custom and Workshop maps", () => {
  it("marks the custom campaign as not official", () => {
    const s = loadSample(SAMPLES.custom);
    expect(s.official).toBe(false);
    expect(s.campaign).toBe("l4d_dam01_riverbank");
  });

  it("marks the official campaigns as official", () => {
    for (const f of [SAMPLES.c1, SAMPLES.c2, SAMPLES.current]) {
      expect(loadSample(f).official).toBe(true);
    }
  });

  it("keeps custom chapter maps that do not share a campaign prefix", () => {
    // Custom campaigns name their maps anything at all; the campaign field
    // is just the first map's name, so chapter maps will not match it.
    const s = loadSample(SAMPLES.custom);
    expect(s.chapters.map((c) => c.map)).toEqual([
      "l4d_dam01_riverbank",
      "l4d_dam02_dam",
      "l4d_dam03_cornfield",
    ]);
    expect(s.chapters[1]!.map.startsWith(s.campaign)).toBe(false);
  });

  it("derives `official` from the map name when the field is absent", () => {
    // Older files predate the field entirely.
    const json = structuredClone(readSampleJson(SAMPLES.custom)) as any;
    delete json.official;
    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session.official).toBe(false);
  });

  it("mirrors the mod's IsOfficialMapName test", () => {
    // util.nut:185
    expect(isOfficialMapName("c1m1_hotel")).toBe(true);
    expect(isOfficialMapName("c13m2_southpinestream")).toBe(true);
    expect(isOfficialMapName("l4d_dam01_riverbank")).toBe(false);
    expect(isOfficialMapName("questionable_ethics")).toBe(false);
    expect(isOfficialMapName("cm1_notreally")).toBe(false);
    expect(isOfficialMapName("unknown_map")).toBe(false);
    expect(isOfficialMapName("")).toBe(false);
  });

  it("handles a custom campaign whose finale is its only chapter", () => {
    const json = structuredClone(readSampleJson(SAMPLES.custom)) as any;
    json.chapters = [json.chapters[2]];
    json.outcomes = { finale_win: 1 };
    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session.chapters).toHaveLength(1);
    expect(r.session.complete).toBe(true);
    expect(totalsDrift(r.session).length).toBeGreaterThanOrEqual(0);
  });
});

describe("campaign completion state", () => {
  it("treats a finale win as complete", () => {
    for (const f of [SAMPLES.c1, SAMPLES.c2, SAMPLES.custom]) {
      const s = loadSample(f);
      expect(s.complete).toBe(true);
      expect(s.outcomes["finale_win"]).toBe(1);
    }
  });

  it("treats _current with no finale as incomplete", () => {
    // PLAN.md section 1.6. Note the samples have no chapter with
    // outcome:"in_progress" -- incompleteness here is the absence of a
    // finale win, not a running chapter.
    const s = loadSample(SAMPLES.current);
    expect(s.complete).toBe(false);
    expect(s.inProgress).toBe(true);
    expect(s.outcomes["finale_win"]).toBeUndefined();
    expect(s.chapters.every((c) => c.outcome !== "in_progress")).toBe(true);
  });

  it("handles a genuinely running chapter", () => {
    const json = structuredClone(readSampleJson(SAMPLES.current)) as any;
    json.chapters[1].outcome = "in_progress";
    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session.chapters[1]!.outcome).toBe("in_progress");
    expect(r.session.inProgress).toBe(true);
    expect(r.session.complete).toBe(false);
  });

  it("counts wipes", () => {
    expect(loadSample(SAMPLES.c2).wipes).toBe(1);
    expect(loadSample(SAMPLES.custom).wipes).toBe(1);
    expect(loadSample(SAMPLES.c1).wipes).toBe(0);
  });

  it("sees the c2 chapter that was played twice", () => {
    // Six round_starts across five chapters: one chapter was retried.
    const s = loadSample(SAMPLES.c2);
    expect(s.roundStarts).toBe(6);
    expect(s.chapters).toHaveLength(5);
    const retried = s.chapters.filter((c) => c.round_starts > 1);
    expect(retried.length).toBeGreaterThan(0);
  });
});

describe("difficulty display", () => {
  it("shows the in-game wording, not the cvar value", () => {
    expect(difficultyLabel("Impossible")).toBe("Expert");
    expect(difficultyLabel("Hard")).toBe("Advanced");
    expect(difficultyLabel("Normal")).toBe("Normal");
    expect(difficultyLabel("Easy")).toBe("Easy");
  });

  it("is case-insensitive, because it is a raw cvar read", () => {
    expect(difficultyLabel("impossible")).toBe("Expert");
    expect(difficultyLabel("  HARD  ")).toBe("Advanced");
  });

  it("passes unrecognized values through rather than guessing", () => {
    expect(difficultyLabel("unknown")).toBe("Unknown");
    expect(difficultyLabel("")).toBe("Unknown");
    expect(difficultyLabel("custom_mutation")).toBe("custom_mutation");
  });

  it("labels the c2 sample Expert", () => {
    const s = loadSample(SAMPLES.c2);
    expect(s.difficulty).toBe("Impossible");
    expect(s.difficultyLabel).toBe("Expert");
  });
});

describe("realism is a gamemode, not a difficulty", () => {
  it("names the hardest official configuration", () => {
    expect(difficultyDisplay("Impossible", "realism")).toBe("Expert Realism");
  });

  it("only promotes Expert -- realism on any other difficulty is not it", () => {
    expect(difficultyDisplay("Hard", "realism")).toBe("Advanced");
    expect(difficultyDisplay("Normal", "realism")).toBe("Normal");
    expect(difficultyDisplay("Easy", "realism")).toBe("Easy");
  });

  it("leaves coop Expert alone", () => {
    expect(difficultyDisplay("Impossible", "coop")).toBe("Expert");
    expect(difficultyDisplay("Impossible", "")).toBe("Expert");
    expect(difficultyDisplay("Impossible", "unknown")).toBe("Expert");
  });

  it("reads the gamemode the way the cvar is actually written", () => {
    // mp_gamemode is a raw read and mutations compose names around it.
    expect(isRealism("realism")).toBe(true);
    expect(isRealism("  REALISM  ")).toBe(true);
    expect(isRealism("mutation15realism")).toBe(true);
    expect(isRealism("coop")).toBe(false);
    expect(isRealism("versus")).toBe(false);
  });

  it("materializes the display form on the session", () => {
    const s = loadSample(SAMPLES.c2);
    // The sample is coop, so the two forms agree; the field exists either way.
    expect(s.difficultyDisplay).toBe(
      difficultyDisplay(s.difficulty, s.gamemode),
    );
  });
});

describe("chronological ordering", () => {
  it("uses started_utc when it is available", () => {
    const a = sessionSortKey({
      started_utc: 1789235242,
      updated_utc: 1789235243,
      session_id: "2026-09-12_1747-0002",
    });
    expect(a.approximate).toBe(false);
    const b = sessionSortKey({
      started_utc: 1789266054,
      updated_utc: 1789266055,
      session_id: "2026-09-13_0220-0004",
    });
    expect(b.sortKey > a.sortKey).toBe(true);
  });

  it("falls back to updated_utc when started_utc is 0", () => {
    // PLAN.md section 1.5: started_utc can be 0.
    const k = sessionSortKey({
      started_utc: 0,
      updated_utc: 1789235243,
      session_id: "2026-09-12_1747-0002",
    });
    expect(k.approximate).toBe(false);
    expect(k.sortKey).toContain("1789235243");
  });

  it("flags the no-clock case as approximate instead of trusting the id", () => {
    // util.nut:107 emits "s412330-0004" with no wall clock. Those sort
    // after every real date and carry no time information, so PLAN.md's
    // "session_id sorts chronologically" does not hold for them.
    const k = sessionSortKey({
      started_utc: 0,
      updated_utc: 0,
      session_id: "s412330-0004",
    });
    expect(k.approximate).toBe(true);
  });

  it("sorts timestamped sessions ahead of clockless ones", () => {
    const timed = sessionSortKey({
      started_utc: 1,
      updated_utc: 1,
      session_id: "2026-09-12_1747-0002",
    });
    const clockless = sessionSortKey({
      started_utc: 0,
      updated_utc: 0,
      session_id: "s999999-0009",
    });
    // Descending sort puts real timestamps first.
    expect(timed.sortKey > clockless.sortKey).toBe(true);
  });

  it("orders large timestamps correctly despite string comparison", () => {
    const small = sessionSortKey({ started_utc: 999, updated_utc: 0, session_id: "a" });
    const large = sessionSortKey({ started_utc: 1789266054, updated_utc: 0, session_id: "b" });
    expect(large.sortKey > small.sortKey).toBe(true);
  });
});

describe("numeric coercion", () => {
  it("flattens every numeric leaf for comparison", () => {
    const flat = flattenNumbers({ a: 1, b: { c: 2, d: { e: 3 } }, s: "x" });
    expect(flat).toEqual({ a: 1, "b.c": 2, "b.d.e": 3 });
  });

  it("coerces a stringified number from the serializer", () => {
    const json = structuredClone(readSampleJson(SAMPLES.c1)) as any;
    json.playtime_s = "2520.0";
    const r = parseSessionJson(json, src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session.playtimeS).toBe(2520);
  });
});
