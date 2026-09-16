import { describe, expect, it } from "vitest";
import {
  allTimeMetrics,
  campaignLabel,
  campaignMetrics,
  chapterLabel,
  cleanChapters,
  ffMatrix,
  formatDuration,
  formatMaybe,
  formatPercent,
  playerMetrics,
  prettifyMapName,
  splitByKind,
  sumTable,
  threatProfile,
} from "@/lib/metrics";
import { buildStore } from "@/lib/store";
import { parseSessionText } from "@/lib/normalize";
import { SAMPLES, loadSample, readSampleText, sampleFiles } from "./fixtures";

function store() {
  return buildStore(
    sampleFiles().map((fileName) =>
      parseSessionText(readSampleText(fileName), { origin: "fs", fileName }),
    ),
  );
}

describe("guarded division", () => {
  // Sparse telemetry means every denominator can genuinely be zero. A
  // missing value must be null, never 0 or NaN or Infinity.
  it("returns null rather than dividing by zero", () => {
    const s = loadSample(SAMPLES.c1);
    const p = { ...s.totals[0]!, playtime_s: 0 };
    const m = playerMetrics(p);
    expect(m.killsPerMinute).toBeNull();
    expect(m.ffPerHour).toBeNull();
  });

  it("returns null for kills per shot when nothing was fired", () => {
    const s = loadSample(SAMPLES.c1);
    const base = s.totals[0]!;
    const p = {
      ...base,
      offense: { ...base.offense, shots_fired: 0 },
    };
    expect(playerMetrics(p).killsPerShot).toBeNull();
  });

  it("returns null for revive ratio when never revived", () => {
    const s = loadSample(SAMPLES.c1);
    const base = s.totals[0]!;
    const p = {
      ...base,
      defense: { ...base.defense, times_revived: 0 },
    };
    expect(playerMetrics(p).reviveRatio).toBeNull();
  });

  it("returns null for headshot rate with no kills", () => {
    const s = loadSample(SAMPLES.c1);
    const base = s.totals[0]!;
    const p = {
      ...base,
      offense: { ...base.offense, kills: {}, headshots: {} },
    };
    expect(playerMetrics(p).headshotRate).toBeNull();
  });

  it("formats a missing value as an em dash, never as zero", () => {
    expect(formatMaybe(null)).toBe("—");
    expect(formatPercent(null)).toBe("—");
    expect(formatMaybe(0, 2)).toBe("0.00");
  });

  it("never produces NaN or Infinity anywhere in the samples", () => {
    for (const f of sampleFiles()) {
      const s = loadSample(f);
      for (const p of s.totals.map(playerMetrics)) {
        for (const [k, v] of Object.entries(p)) {
          if (typeof v === "number") {
            expect(Number.isFinite(v), `${f} ${p.key} ${k}`).toBe(true);
          }
        }
      }
    }
  });
});

describe("kill tables", () => {
  it("splits common from specials and keeps unknown keys", () => {
    const split = splitByKind({
      common: 300,
      hunter: 5,
      tank: 1,
      some_future_special: 2,
      zero_key: 0,
    });
    expect(split.common).toBe(300);
    expect(split.specials.map((s) => s.key)).toEqual(["hunter", "tank"]);
    // An unrecognized key is surfaced, not silently dropped.
    expect(split.other.map((o) => o.key)).toEqual(["some_future_special"]);
    // Zero entries are omitted from the chart rows.
    expect(
      [...split.specials, ...split.other].some((x) => x.key === "zero_key"),
    ).toBe(false);
  });

  it("agrees with total_kills for every sample player", () => {
    for (const f of sampleFiles()) {
      const s = loadSample(f);
      for (const p of s.totals) {
        const m = playerMetrics(p);
        expect(m.killsFromTable, `${f} ${p.key}`).toBe(m.kills);
        expect(m.commonKills + m.specialKills).toBeLessThanOrEqual(m.kills);
      }
    }
  });

  it("sums an open table", () => {
    expect(sumTable({ a: 1, b: 2, c: 3 })).toBe(6);
    expect(sumTable({})).toBe(0);
  });
});

describe("threat profile", () => {
  it("folds the _escaped grab variants into the base source", () => {
    const s = loadSample(SAMPLES.c1);
    const kuya = s.totalsByKey["STEAM_1:0:41882317"]!;
    // The raw data carries both "smoker" and "smoker_escaped".
    expect(kuya.defense.grabbed_by["smoker"]).toBeGreaterThan(0);
    expect(kuya.defense.grabbed_by["smoker_escaped"]).toBeGreaterThan(0);

    const threats = threatProfile(kuya);
    const keys = threats.map((t) => t.key);
    // One smoker entry, not two.
    expect(keys.filter((k) => k === "smoker")).toHaveLength(1);
    expect(keys).not.toContain("smoker_escaped");
  });

  it("excludes teammate, fall and world as infected threats", () => {
    const s = loadSample(SAMPLES.c1);
    const kuya = s.totalsByKey["STEAM_1:0:41882317"]!;
    expect(kuya.defense.damage_taken["teammate"]).toBeGreaterThan(0);

    const keys = threatProfile(kuya).map((t) => t.key);
    expect(keys).not.toContain("teammate");
    expect(keys).not.toContain("fall");
    expect(keys).not.toContain("world");
  });

  it("ranks a killer above a source that only chipped damage", () => {
    const s = loadSample(SAMPLES.c1);
    const base = s.totals[0]!;
    const p = {
      ...base,
      defense: {
        ...base.defense,
        damage_taken: { hunter: 10, tank: 900 },
        grabbed_by: {},
        incapped_by: {},
        killed_by: { hunter: 1 },
      },
    };
    const threats = threatProfile(p);
    // A death outweighs raw damage.
    expect(threats[0]!.key).toBe("hunter");
  });

  it("identifies a top threat for every sample player who took damage", () => {
    const s = loadSample(SAMPLES.c2);
    for (const p of s.totals) {
      const m = playerMetrics(p);
      if (m.damageTaken > 0) {
        expect(m.topThreat, p.key).not.toBeNull();
      }
    }
  });
});

describe("clean chapters", () => {
  // NOT survival rate: chapter outcome is team-wide and there is no
  // per-player survived flag, so this counts chapters with no incap and no
  // death instead. The naming matters.
  it("counts only chapters with no incap and no death", () => {
    const s = loadSample(SAMPLES.c1);
    const key = "STEAM_1:0:41882317";
    const r = cleanChapters(s, key);
    expect(r.played).toBe(s.chapters.length);

    let expected = 0;
    for (const c of s.chapters) {
      const p = c.playersByKey[key]!;
      if (p.defense.incaps === 0 && p.defense.deaths === 0) expected += 1;
    }
    expect(r.clean).toBe(expected);
  });

  it("only counts chapters the player actually appeared in", () => {
    // The c2 departed player left after chapter 3.
    const s = loadSample(SAMPLES.c2);
    const r = cleanChapters(s, "STEAM_1:1:55014728");
    expect(r.played).toBe(3);
    expect(s.chapters.length).toBe(5);
  });

  it("returns a null rate for a player who played nothing", () => {
    const s = loadSample(SAMPLES.c1);
    const r = cleanChapters(s, "STEAM_9:9:99999999");
    expect(r.played).toBe(0);
    expect(r.rate).toBeNull();
  });
});

describe("medkits", () => {
  // The kit is counted on heal_success, which fires only for the kit --
  // pills and adrenaline raise their own events. Files predating the
  // counter carry heals but no kit key, so one heal stands in for one kit.
  it("falls back to heals where the file carries no kit key", () => {
    const s = loadSample(SAMPLES.c1);
    const base = s.totals[0]!;
    const p = {
      ...base,
      actions: { ...base.actions, items_used: { pain_pills: 3 } },
      teamwork: { ...base.teamwork, heals_given: 4 },
    };
    expect(playerMetrics(p).medkits).toBe(4);
  });

  it("prefers a recorded kit count over the heal fallback", () => {
    const s = loadSample(SAMPLES.c1);
    const base = s.totals[0]!;
    const p = {
      ...base,
      actions: { ...base.actions, items_used: { first_aid_kit: 2 } },
      teamwork: { ...base.teamwork, heals_given: 9 },
    };
    expect(playerMetrics(p).medkits).toBe(2);
  });

  it("folds the engine's alternate spellings onto one count", () => {
    const s = loadSample(SAMPLES.c1);
    const base = s.totals[0]!;
    const p = {
      ...base,
      actions: { ...base.actions, items_used: { medkit: 1, health_kit: 2 } },
      teamwork: { ...base.teamwork, heals_given: 9 },
    };
    expect(playerMetrics(p).medkits).toBe(3);
  });

  it("is zero, not null, for a player who spent none", () => {
    const s = loadSample(SAMPLES.c1);
    const base = s.totals[0]!;
    const p = {
      ...base,
      actions: { ...base.actions, items_used: {} },
      teamwork: { ...base.teamwork, heals_given: 0 },
    };
    expect(playerMetrics(p).medkits).toBe(0);
  });
});

describe("campaign metrics", () => {
  it("counts retries from round_starts above chapter count", () => {
    // c2 has 6 round starts across 5 chapters: one retry.
    const m = campaignMetrics(loadSample(SAMPLES.c2));
    expect(m.chapterCount).toBe(5);
    expect(m.retries).toBe(1);

    const c1 = campaignMetrics(loadSample(SAMPLES.c1));
    expect(c1.retries).toBe(0);
  });

  it("team totals equal the sum of the roster", () => {
    for (const f of sampleFiles()) {
      const s = loadSample(f);
      const m = campaignMetrics(s);
      expect(m.totalKills).toBe(
        s.totals.reduce((a, p) => a + p.offense.total_kills, 0),
      );
      expect(m.totalDeaths).toBe(
        s.totals.reduce((a, p) => a + p.defense.deaths, 0),
      );
    }
  });

  it("builds one chapter-load entry per chapter, in play order", () => {
    const s = loadSample(SAMPLES.c2);
    const m = campaignMetrics(s);
    expect(m.chapterLoad).toHaveLength(5);
    expect(m.chapterLoad.map((c) => c.index)).toEqual([1, 2, 3, 4, 5]);
    expect(m.chapterLoad.map((c) => c.map)).toEqual(
      s.chapters.map((c) => c.map),
    );
  });

  it("flags the replayed chapter in the casualty strip data", () => {
    const m = campaignMetrics(loadSample(SAMPLES.c2));
    expect(m.chapterLoad.some((c) => c.retried)).toBe(true);
  });
});

describe("all-time metrics", () => {
  it("aggregates a player across campaigns by summing session totals", () => {
    const st = store();
    const all = allTimeMetrics(st);
    const kuya = all.players.find((p) => p.key === "STEAM_1:0:41882317")!;

    expect(kuya.campaigns).toBe(4);
    const expectedKills = st.sessions.reduce(
      (a, s) => a + (s.totalsByKey["STEAM_1:0:41882317"]?.offense.total_kills ?? 0),
      0,
    );
    expect(kuya.kills).toBe(expectedKills);
  });

  it("does not double-count within a campaign", () => {
    // The bug PLAN.md section 1.3 warns about: totals must not be re-summed
    // against their own chapters.
    const st = store();
    const all = allTimeMetrics(st);
    const perSessionSum = st.sessions.reduce(
      (a, s) => a + s.totals.reduce((x, p) => x + p.offense.total_kills, 0),
      0,
    );
    expect(all.totalKills).toBe(perSessionSum);
    expect(all.players.reduce((a, p) => a + p.kills, 0)).toBe(perSessionSum);
  });

  it("computes win rate from completed campaigns", () => {
    const all = allTimeMetrics(store());
    expect(all.campaigns).toBe(4);
    // Three finale wins; _current has none.
    expect(all.completed).toBe(3);
    expect(all.winRate).toBeCloseTo(0.75, 5);
  });

  it("separates official from custom campaigns", () => {
    const all = allTimeMetrics(store());
    expect(all.officialCampaigns).toBe(3);
    expect(all.customCampaigns).toBe(1);
  });

  it("orders the trend oldest first", () => {
    const all = allTimeMetrics(store());
    expect(all.trend).toHaveLength(4);
    for (let i = 1; i < all.trend.length; i++) {
      expect(all.trend[i]!.startedUtc).toBeGreaterThanOrEqual(
        all.trend[i - 1]!.startedUtc,
      );
    }
    expect(all.trend[0]!.campaign).toBe("c1");
    expect(all.trend[3]!.campaign).toBe("l4d_dam01_riverbank");
  });

  it("gives an empty store zeroed totals and a null win rate", () => {
    const all = allTimeMetrics(buildStore([]));
    expect(all.campaigns).toBe(0);
    expect(all.totalKills).toBe(0);
    expect(all.winRate).toBeNull();
    expect(all.players).toEqual([]);
  });

  it("aggregates clean chapters across campaigns", () => {
    const all = allTimeMetrics(store());
    const kuya = all.players.find((p) => p.key === "STEAM_1:0:41882317")!;
    // 4 + 5 + 3 + 2 chapters = 14 played.
    expect(kuya.chaptersPlayed).toBe(14);
    expect(kuya.cleanChapters).toBeLessThanOrEqual(kuya.chaptersPlayed);
  });
});

describe("friendly fire matrix", () => {
  it("is directional", () => {
    const m = ffMatrix(store().sessions);
    const a = "STEAM_1:1:55014728";
    const b = "STEAM_1:0:41882317";
    const aToB = m.cell[a]?.[b]?.damage ?? 0;
    const bToA = m.cell[b]?.[a]?.damage ?? 0;
    expect(aToB).toBeGreaterThan(0);
    // In these fixtures every pair fires only one way.
    expect(bToA).toBe(0);
  });

  it("treats an absent pair as a real zero, not a gap", () => {
    const m = ffMatrix(store().sessions);
    // Every key pair is addressable; missing cells read as 0 downstream.
    for (const from of m.keys) {
      for (const to of m.keys) {
        const dmg = m.cell[from]?.[to]?.damage ?? 0;
        expect(Number.isFinite(dmg)).toBe(true);
      }
    }
  });

  it("matches the raw pair totals from the files", () => {
    const st = store();
    const m = ffMatrix(st.sessions);
    const from = "STEAM_1:1:55014728";
    const to = "STEAM_1:0:41882317";
    const expected = st.sessions.reduce(
      (a, s) =>
        a + (s.totalsByKey[from]?.teamwork.pairs[to]?.ff_damage_to ?? 0),
      0,
    );
    expect(m.cell[from]?.[to]?.damage).toBe(expected);
  });

  it("identifies the worst offender", () => {
    const m = ffMatrix(store().sessions);
    expect(m.worst).not.toBeNull();
    expect(m.worst!.damage).toBe(m.max);
  });

  it("includes bots, which also shoot teammates", () => {
    const m = ffMatrix(store().sessions);
    expect(m.keys).toContain("BOT:Ellis");
  });

  it("handles an empty session list", () => {
    const m = ffMatrix([]);
    expect(m.keys).toEqual([]);
    expect(m.worst).toBeNull();
    expect(m.max).toBe(0);
  });
});

describe("labels", () => {
  it("names official campaigns", () => {
    expect(campaignLabel("c1", true)).toBe("Dead Center");
    expect(campaignLabel("c5", true)).toBe("The Parish");
  });

  it("keeps custom campaign names readable without inventing one", () => {
    expect(campaignLabel("l4d_dam01_riverbank", false)).toBe(
      "Dam01 Riverbank",
    );
    // Never claim a Valve name for a custom map that happens to be "c1".
    expect(campaignLabel("l4d_dam01_riverbank", false)).not.toContain("Dead");
  });

  it("does not apply a Valve name to an unofficial campaign", () => {
    expect(campaignLabel("c1", false)).toBe("C1");
  });

  it("labels chapters from both official and custom maps", () => {
    expect(chapterLabel("c1m2_streets")).toBe("Streets");
    expect(chapterLabel("c2m5_concert")).toBe("Concert");
    expect(chapterLabel("l4d_dam02_dam")).toBe("Dam02 Dam");
  });

  it("prettifies a raw map name", () => {
    expect(prettifyMapName("l4d_dam01_riverbank")).toBe("Dam01 Riverbank");
    expect(prettifyMapName("unknown_map")).toBe("Unknown Map");
  });

  it("formats durations without lying about precision", () => {
    expect(formatDuration(0)).toBe("0m 00s");
    expect(formatDuration(540)).toBe("9m 00s");
    expect(formatDuration(227)).toBe("3m 47s");
    expect(formatDuration(4380)).toBe("1h 13m 00s");
    expect(formatDuration(4397)).toBe("1h 13m 17s");
  });
});
