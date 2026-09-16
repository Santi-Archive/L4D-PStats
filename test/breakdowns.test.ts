import { describe, expect, it } from "vitest";
import {
  campaignAnalysis,
  campaignRollups,
  chapterAnalysis,
  infectedBreakdown,
  infectedLabel,
  itemLabel,
  playerIncidents,
  playerInfectedBreakdowns,
  playerThrowableBreakdowns,
  playerWeaponBreakdowns,
  throwableBreakdown,
  weaponBreakdown,
  weaponKind,
  weaponLabel,
  canonicalItemKey,
} from "@/lib/breakdowns";
import { campaignLabel } from "@/lib/metrics";
import { difficultyRank, type NormalizedPlayer } from "@/lib/normalize";
import { buildStore } from "@/lib/store";
import { parseFileText, assembleRuns, type ChapterParseSuccess } from "@/lib/normalize";
import {
  CHAPTER_FILES,
  WEAPON_CHAPTER_FILES,
  readChapterText,
  loadSample,
  SAMPLES,
} from "./fixtures";

/**
 * The breakdowns run against the real No-Mercy run, so the expected numbers
 * below are the ones actually in those two files. A change in the mod's
 * output that silently alters a total will fail here rather than quietly
 * render a wrong chart.
 */

function chapterResult(fileName: string): ChapterParseSuccess {
  const r = parseFileText(readChapterText(fileName), { origin: "fs", fileName });
  if (!r.ok || !("kind" in r)) throw new Error("expected a chapter result");
  return r;
}

const run = assembleRuns([
  chapterResult(CHAPTER_FILES.ch1),
  chapterResult(CHAPTER_FILES.ch2),
])[0]!;

/** Run 0006: the same format, written after per-weapon tracking landed. */
const weaponRun = assembleRuns([
  chapterResult(WEAPON_CHAPTER_FILES.ch1),
  chapterResult(WEAPON_CHAPTER_FILES.ch2),
  chapterResult(WEAPON_CHAPTER_FILES.ch3),
])[0]!;

/** Minimal player record for the arithmetic-only tests. */
function player(over: {
  kills?: Record<string, number>;
  headshots?: Record<string, number>;
  damage_dealt?: Record<string, number>;
  damage_taken?: Record<string, number>;
  incapped_by?: Record<string, number>;
  killed_by?: Record<string, number>;
  grabbed_by?: Record<string, number>;
  incaps?: number;
  witches_startled?: number;
  tank_rocks_hit_by?: number;
  items_used?: Record<string, number>;
  shots_fired?: number;
  reloads?: number;
  total_kills?: number;
  playtime_s?: number;
}) {
  return {
    offense: {
      kills: over.kills ?? {},
      headshots: over.headshots ?? {},
      damage_dealt: over.damage_dealt ?? {},
      shots_fired: over.shots_fired ?? 0,
      reloads: over.reloads ?? 0,
      total_kills: over.total_kills ?? 0,
    },
    defense: {
      damage_taken: over.damage_taken ?? {},
      incapped_by: over.incapped_by ?? {},
      killed_by: over.killed_by ?? {},
      grabbed_by: over.grabbed_by ?? {},
      incaps: over.incaps ?? 0,
    },
    actions: {
      items_used: over.items_used ?? {},
      witches_startled: over.witches_startled ?? 0,
      tank_rocks_hit_by: over.tank_rocks_hit_by ?? 0,
    },
    playtime_s: over.playtime_s ?? 60,
  };
}

/** `playerIncidents` needs the identity fields the splits share. */
function victim(
  label: string,
  over: Parameters<typeof player>[0] = {},
): ReturnType<typeof player> & {
  key: string;
  label: string;
  kind: "human" | "bot" | "unresolved";
  character: string;
} {
  return {
    ...player(over),
    key: `KEY:${label}`,
    label,
    kind: "human",
    character: "",
  };
}

describe("infectedLabel", () => {
  it("titles the known types", () => {
    expect(infectedLabel("hunter")).toBe("Hunter");
    expect(infectedLabel("common")).toBe("Common");
  });

  it("humanizes an unknown key rather than showing a raw slug", () => {
    expect(infectedLabel("some_new_thing")).toBe("Some New Thing");
  });

  it("survives an empty key", () => {
    expect(infectedLabel("")).toBe("");
  });
});

describe("infectedBreakdown", () => {
  it("separates specials from common and from everything else", () => {
    const b = infectedBreakdown([
      player({
        kills: { common: 50, hunter: 2 },
        damage_taken: { world: 15, hunter: 40 },
      }),
    ]);
    expect(b.commonKills).toBe(50);
    expect(b.totalSpecialKills).toBe(2);
    expect(b.specials.map((r) => r.key)).toEqual(["hunter"]);
    expect(b.other.map((r) => r.key)).toEqual(["world"]);
  });

  it("splits grabs from escapes so a pin is not double-counted", () => {
    // grabbed_by holds both under one table: "jockey" and "jockey_escaped".
    const b = infectedBreakdown([
      player({ grabbed_by: { jockey: 3, jockey_escaped: 2 } }),
    ]);
    const jockey = b.specials.find((r) => r.key === "jockey")!;
    expect(jockey.grabs).toBe(3);
    expect(jockey.escapes).toBe(2);
    expect(jockey.escapeRate).toBeCloseTo(2 / 3);
    // The escape key must not become a row of its own.
    expect(b.other.some((r) => r.key.includes("escaped"))).toBe(false);
  });

  it("clamps headshot rate, since kills and headshots are keyed separately", () => {
    const b = infectedBreakdown([
      player({ kills: { hunter: 1 }, headshots: { hunter: 4 } }),
    ]);
    expect(b.specials[0]!.headshotRate).toBe(1);
  });

  it("returns null rather than zero for a rate with no denominator", () => {
    const b = infectedBreakdown([player({ damage_taken: { hunter: 10 } })]);
    expect(b.specials[0]!.headshotRate).toBeNull();
    expect(b.specials[0]!.escapeRate).toBeNull();
    expect(b.specials[0]!.damagePerKill).toBeNull();
  });

  it("drops rows that are entirely zero", () => {
    const b = infectedBreakdown([player({ kills: { hunter: 0 } })]);
    expect(b.specials).toHaveLength(0);
  });

  it("folds explosion kills into the common row", () => {
    const b = infectedBreakdown([
      player({ kills: { common: 10, common_by_explosion: 5 } }),
    ]);
    expect(b.common?.kills).toBe(15);
    expect(b.other.some((r) => r.key === "common_by_explosion")).toBe(false);
  });

  it("ranks by what a special cost the team, not by how many were killed", () => {
    // A charger that incapped someone outranks a boomer killed many times.
    const b = infectedBreakdown([
      player({
        kills: { boomer: 20, charger: 1 },
        incapped_by: { charger: 1 },
      }),
    ]);
    expect(b.specials[0]!.key).toBe("charger");
  });

  it("sums across every player passed in", () => {
    const b = infectedBreakdown([
      player({ kills: { hunter: 1 } }),
      player({ kills: { hunter: 2 } }),
    ]);
    expect(b.specials[0]!.kills).toBe(3);
  });

  it("matches the real run's totals", () => {
    const b = infectedBreakdown(run.totals);
    // 489 total kills across the run: 470 common, 19 specials.
    expect(b.commonKills).toBe(470);
    expect(b.totalSpecialKills).toBe(19);
    expect(b.specialShare).toBeCloseTo(19 / 489);
  });

  it("puts the witch first: it is the only thing that incapped anyone", () => {
    const b = infectedBreakdown(run.totals);
    expect(b.specials[0]!.key).toBe("witch");
    expect(b.specials[0]!.incapsCaused).toBe(1);
  });

  it("handles an empty roster", () => {
    const b = infectedBreakdown([]);
    expect(b.specials).toEqual([]);
    expect(b.common).toBeNull();
    expect(b.specialShare).toBeNull();
  });
});

describe("throwableBreakdown", () => {
  it("splits throwables from consumables", () => {
    const b = throwableBreakdown(
      [player({ items_used: { pipe_bomb: 2, molotov: 1, pain_pills: 3 } })],
      2,
    );
    expect(b.totalThrown).toBe(3);
    expect(b.totalConsumed).toBe(3);
    expect(b.throwables.map((r) => r.key)).toEqual(["pipe_bomb", "molotov"]);
    expect(b.consumables.map((r) => r.key)).toEqual(["pain_pills"]);
  });

  it("computes each row's share of its own group", () => {
    const b = throwableBreakdown(
      [player({ items_used: { pipe_bomb: 3, molotov: 1 } })],
      1,
    );
    expect(b.throwables[0]!.share).toBeCloseTo(0.75);
  });

  it("routes an unrecognized item to other rather than dropping it", () => {
    const b = throwableBreakdown([player({ items_used: { future_grenade: 2 } })], 1);
    expect(b.other.map((r) => r.key)).toEqual(["future_grenade"]);
  });

  it("reports per-chapter rate, and null when there are no chapters", () => {
    expect(
      throwableBreakdown([player({ items_used: { molotov: 4 } })], 2).thrownPerChapter,
    ).toBe(2);
    expect(
      throwableBreakdown([player({ items_used: { molotov: 4 } })], 0).thrownPerChapter,
    ).toBeNull();
  });

  it("surfaces explosion kills, the one throwable outcome that is recorded", () => {
    const b = throwableBreakdown(
      [player({ kills: { common_by_explosion: 7 } })],
      1,
    );
    expect(b.commonKilledByExplosion).toBe(7);
  });

  it("reports nothing used for the real run, which logged no items", () => {
    const b = throwableBreakdown(run.totals, run.chapters.length);
    expect(b.totalThrown).toBe(0);
    expect(b.throwables).toEqual([]);
  });

  it("labels the bile jar by its in-game name", () => {
    expect(itemLabel("vomitjar")).toBe("Bile bomb");
  });

  it("counts first aid kits alongside the other consumables", () => {
    const b = throwableBreakdown(
      [player({ items_used: { first_aid_kit: 2, pain_pills: 1 } })],
      1,
    );
    expect(b.consumables.map((r) => r.key)).toEqual([
      "first_aid_kit",
      "pain_pills",
    ]);
    expect(b.totalConsumed).toBe(3);
    expect(itemLabel("first_aid_kit")).toBe("First aid kit");
  });

  it("keeps the consumable order stable: kit, pills, adrenaline, defib", () => {
    // Ties must not reorder the slots; the roster order is the slot order.
    const b = throwableBreakdown(
      [
        player({
          items_used: {
            defibrillator: 1,
            adrenaline: 1,
            pain_pills: 1,
            first_aid_kit: 1,
          },
        }),
      ],
      1,
    );
    expect(b.consumables.map((r) => r.key)).toEqual([
      "first_aid_kit",
      "pain_pills",
      "adrenaline",
      "defibrillator",
    ]);
  });

  it("folds the engine's alternate spellings onto one item row", () => {
    // params.weapon spelling varies by build; two names are still one item.
    const b = throwableBreakdown(
      [player({ items_used: { medkit: 1, first_aid: 1, pills: 2 } })],
      1,
    );
    const kit = b.consumables.find((r) => r.key === "first_aid_kit")!;
    expect(kit.count).toBe(2);
    expect(b.consumables.find((r) => r.key === "pain_pills")!.count).toBe(2);
    expect(b.other).toEqual([]);
    expect(canonicalItemKey("medkit")).toBe("first_aid_kit");
  });

  it("backfills kits from heals on files written before kits were counted", () => {
    const b = throwableBreakdown(
      [
        {
          ...player({}),
          teamwork: { heals_given: 3, pills_given: 0 },
        },
      ],
      1,
    );
    expect(b.kitsBackfilled).toBe(true);
    expect(b.consumables.find((r) => r.key === "first_aid_kit")!.count).toBe(3);
    expect(b.healsGiven).toBe(3);
  });

  it("does not backfill when the file already counts kits", () => {
    const b = throwableBreakdown(
      [
        {
          ...player({ items_used: { first_aid_kit: 1 } }),
          teamwork: { heals_given: 5, pills_given: 0 },
        },
      ],
      1,
    );
    // The recorded count wins; heals must not inflate it.
    expect(b.kitsBackfilled).toBe(false);
    expect(b.consumables.find((r) => r.key === "first_aid_kit")!.count).toBe(1);
  });

  it("reads kits from the real run, which healed but predates the counter", () => {
    const b = throwableBreakdown(weaponRun.totals, weaponRun.chapters.length);
    // Run 0006 logged heals; kits are recovered from them.
    expect(b.healsGiven).toBeGreaterThan(0);
    expect(b.kitsBackfilled).toBe(true);
    expect(b.consumables.find((r) => r.key === "first_aid_kit")!.count).toBe(
      b.healsGiven,
    );
  });

  it("counts the throwables the real run actually threw", () => {
    const b = throwableBreakdown(weaponRun.totals, weaponRun.chapters.length);
    expect(b.throwables.find((r) => r.key === "pipe_bomb")!.count).toBe(1);
    expect(b.consumables.find((r) => r.key === "pain_pills")!.count).toBe(2);
  });
});

describe("weaponLabel and weaponKind", () => {
  it("names the weapons the mod actually emits", () => {
    expect(weaponLabel("shotgun_chrome")).toBe("Chrome shotgun");
    expect(weaponLabel("rifle_ak47")).toBe("AK-47");
    expect(weaponLabel("smg")).toBe("SMG");
  });

  it("humanizes a weapon it has never seen rather than showing a slug", () => {
    expect(weaponLabel("rifle_future_gun")).toBe("Rifle Future Gun");
  });

  it("separates guns from melee, thrown items and fire", () => {
    expect(weaponKind("autoshotgun")).toBe("firearm");
    expect(weaponKind("melee")).toBe("melee");
    expect(weaponKind("pipe_bomb")).toBe("throwable");
    // Fire and gas cans record damage without being weapons you aim.
    expect(weaponKind("inferno")).toBe("environmental");
    expect(weaponKind("gascan")).toBe("environmental");
  });
});

describe("weaponBreakdown", () => {
  /** One weapon row, as the mod writes it. */
  interface Weapon {
    shots: number;
    reloads: number;
    hits: number;
    damage: number;
    kills: number;
    headshots: number;
    ff_damage: number;
    inferred: number;
  }

  /**
   * A player carrying a per-weapon table. Only the fields a given test
   * cares about need naming; the rest default to zero, which is what the
   * mod writes for a weapon that never did that thing.
   */
  function armed(weapons: Record<string, Partial<Weapon>>) {
    const full: Record<string, Weapon> = {};
    for (const [k, w] of Object.entries(weapons)) {
      full[k] = {
        shots: 0,
        reloads: 0,
        hits: 0,
        damage: 0,
        kills: 0,
        headshots: 0,
        ff_damage: 0,
        inferred: 0,
        ...w,
      };
    }
    return {
      offense: {
        shots_fired: 0,
        reloads: 0,
        total_kills: 0,
        kills: {} as Record<string, number>,
        headshots: {} as Record<string, number>,
      },
      weapons: full,
    };
  }

  it("reports per-weapon data as unavailable on files that predate it", () => {
    const b = weaponBreakdown(run.totals, run.weaponAttribution);
    expect(b.perWeaponAvailable).toBe(false);
    expect(b.all).toEqual([]);
    expect(b.damage).toBeNull();
    expect(b.unavailableReason).toMatch(/predate/);
  });

  it("still reports the shooting totals on those older files", () => {
    const b = weaponBreakdown(run.totals, run.weaponAttribution);
    expect(b.shotsFired).toBe(4308);
    expect(b.reloads).toBe(227);
    expect(b.kills).toBe(489);
  });

  it("builds rows from the real run's weapons table", () => {
    const b = weaponBreakdown(weaponRun.totals, weaponRun.weaponAttribution);
    expect(b.perWeaponAvailable).toBe(true);
    expect(b.all.length).toBeGreaterThan(0);
    // Ranked by kills, so the top row is the run's most lethal weapon.
    expect(b.topByKills!.kills).toBeGreaterThanOrEqual(b.all[1]!.kills);
  });

  it("groups the real run's non-guns out of the firearm list", () => {
    const b = weaponBreakdown(weaponRun.totals, weaponRun.weaponAttribution);
    const keys = (rows: typeof b.all) => rows.map((r) => r.key);
    // Wob threw a pipe bomb and burned things in chapter 2.
    expect(keys(b.throwables)).toContain("pipe_bomb");
    expect(keys(b.environmental)).toEqual(
      expect.arrayContaining(["inferno", "entityflame"]),
    );
    // None of those may appear as a firearm.
    for (const k of ["pipe_bomb", "inferno", "entityflame", "gascan"]) {
      expect(keys(b.firearms)).not.toContain(k);
    }
    expect(keys(b.melee)).toContain("melee");
  });

  it("sums one weapon across players and chapters", () => {
    const b = weaponBreakdown([
      armed({ smg: { kills: 2, damage: 100, shots: 10, hits: 5 } }),
      armed({ smg: { kills: 3, damage: 50, shots: 10, hits: 5 } }),
    ]);
    const smg = b.all.find((r) => r.key === "smg")!;
    expect(smg.kills).toBe(5);
    expect(smg.damage).toBe(150);
    expect(smg.shots).toBe(20);
  });

  it("clamps hit rate: one shotgun blast lands many pellets", () => {
    const b = weaponBreakdown([armed({ autoshotgun: { shots: 10, hits: 80 } })]);
    expect(b.all[0]!.accuracy).toBe(1);
  });

  it("clamps a weapon's headshot rate to 100%", () => {
    const b = weaponBreakdown([armed({ smg: { kills: 1, headshots: 4 } })]);
    expect(b.all[0]!.headshotRate).toBe(1);
  });

  it("guards every per-row ratio against a zero denominator", () => {
    // Fire deals damage with no shots and no kills recorded.
    const b = weaponBreakdown([armed({ inferno: { damage: 24, hits: 3 } })]);
    const fire = b.all[0]!;
    expect(fire.accuracy).toBeNull();
    expect(fire.damagePerShot).toBeNull();
    expect(fire.damagePerKill).toBeNull();
    expect(fire.killsPerShot).toBeNull();
    expect(fire.headshotRate).toBeNull();
  });

  it("drops a row that recorded nothing at all", () => {
    const b = weaponBreakdown([armed({ dual_pistols: {} })]);
    expect(b.all).toEqual([]);
    expect(b.perWeaponAvailable).toBe(false);
  });

  it("reports the inferred share, the main caveat on every row", () => {
    const b = weaponBreakdown([armed({ smg: { kills: 1 } })], {
      fromEvent: 1,
      inferred: 3,
    });
    expect(b.inferredShare).toBe(0.75);
  });

  it("returns a null inferred share when the mod recorded no tally", () => {
    expect(weaponBreakdown([armed({ smg: { kills: 1 } })], null).inferredShare)
      .toBeNull();
    expect(
      weaponBreakdown([armed({ smg: { kills: 1 } })], {
        fromEvent: 0,
        inferred: 0,
      }).inferredShare,
    ).toBeNull();
  });

  it("folds an alternate spelling onto one row", () => {
    const b = weaponBreakdown([
      armed({ pipe_bomb: { shots: 1 }, pipe_bomb_projectile: { shots: 2 } }),
    ]);
    expect(b.all).toHaveLength(1);
    expect(b.all[0]!.shots).toBe(3);
  });

  it("computes each row's share of the scope", () => {
    const b = weaponBreakdown([
      armed({ smg: { kills: 3, damage: 75 }, pistol: { kills: 1, damage: 25 } }),
    ]);
    expect(b.all.find((r) => r.key === "smg")!.killShare).toBeCloseTo(0.75);
    expect(b.all.find((r) => r.key === "smg")!.damageShare).toBeCloseTo(0.75);
  });

  it("handles an empty roster", () => {
    const b = weaponBreakdown([]);
    expect(b.all).toEqual([]);
    expect(b.topByKills).toBeNull();
    expect(b.topByDamage).toBeNull();
    expect(b.killsPerShot).toBeNull();
  });
});

describe("chapterAnalysis", () => {
  const ch1 = chapterAnalysis(run.chapters[0]!);
  const ch2 = chapterAnalysis(run.chapters[1]!);

  it("reads the chapter's identity and outcome", () => {
    expect(ch1.index).toBe(1);
    expect(ch1.map).toBe("c8m1_apartment");
    expect(ch1.outcome).toBe("cleared");
    expect(ch2.outcome).toBe("in_progress");
  });

  it("flags a retried chapter from round_starts", () => {
    // The apartment was started three times.
    expect(ch1.retried).toBe(true);
    expect(ch1.roundStarts).toBe(3);
    expect(ch2.retried).toBe(false);
  });

  it("totals the team's kills and damage for the chapter", () => {
    expect(ch1.kills).toBe(312);
    expect(ch2.kills).toBe(177);
  });

  it("counts casualties", () => {
    expect(ch1.incaps).toBe(0);
    expect(ch2.incaps).toBe(1);
    expect(ch2.deaths).toBe(0);
  });

  it("computes rates per minute, guarded", () => {
    expect(ch1.killsPerMinute).toBeCloseTo(312 / (384.099 / 60), 1);
    const empty = chapterAnalysis({
      ...run.chapters[0]!,
      playtime_s: 0,
      players: [],
      playersByKey: {},
    });
    expect(empty.killsPerMinute).toBeNull();
  });

  it("names the worst threat by damage taken", () => {
    // The witch did 45 of the 187 damage in the subway and caused the incap.
    expect(ch2.worstThreat?.key).toBe("witch");
  });

  it("counts pins without counting their escapes", () => {
    // Chapter 1: Francis was grabbed by a jockey and a smoker, Zoey by a
    // hunter. Three pins, all escaped -- escapes must not inflate the count.
    expect(ch1.grabs).toBe(3);
  });
});

describe("campaignAnalysis", () => {
  const a = campaignAnalysis(run);

  it("analyses every chapter", () => {
    expect(a.chapters).toHaveLength(2);
  });

  it("names the hardest chapter by casualties", () => {
    expect(a.hardestChapter?.map).toBe("c8m2_subway");
  });

  it("only considers cleared chapters for the fastest", () => {
    // The subway is shorter but is still running, so it cannot be "fastest".
    expect(a.fastestChapter?.map).toBe("c8m1_apartment");
  });

  it("counts retried chapters", () => {
    expect(a.retriedChapters).toBe(1);
  });

  it("computes the damage traded ratio", () => {
    expect(a.totalDamageTaken).toBe(23 + 187);
    expect(a.damageRatio).toBeCloseTo(a.totalDamageDealt / a.totalDamageTaken);
  });

  it("returns null ratios and no chapters for an empty session", () => {
    const empty = campaignAnalysis({ ...run, chapters: [], totals: [] });
    expect(empty.chapters).toEqual([]);
    expect(empty.hardestChapter).toBeNull();
    expect(empty.fastestChapter).toBeNull();
    expect(empty.damageRatio).toBeNull();
  });
});

describe("campaignRollups", () => {
  it("groups runs of the same campaign together", () => {
    const store = buildStore([
      { ok: true, session: run },
      { ok: true, session: loadSample(SAMPLES.c1) },
      { ok: true, session: loadSample(SAMPLES.c2) },
    ]);
    const rollups = campaignRollups(store, campaignLabel, difficultyRank);
    const byCampaign = Object.fromEntries(rollups.map((r) => [r.campaign, r]));
    expect(Object.keys(byCampaign).sort()).toEqual(["c1", "c2", "c8"]);
    expect(byCampaign.c8!.runs).toBe(1);
    expect(byCampaign.c8!.chapters).toBe(2);
  });

  it("reports completion as a guarded rate", () => {
    const store = buildStore([{ ok: true, session: run }]);
    const [r] = campaignRollups(store, campaignLabel, difficultyRank);
    // The No-Mercy run never reached a finale.
    expect(r!.completed).toBe(0);
    expect(r!.completionRate).toBe(0);
  });

  it("keeps the hardest difficulty played", () => {
    const store = buildStore([
      { ok: true, session: { ...run, difficulty: "Easy", difficultyLabel: "Easy" } },
      {
        ok: true,
        session: {
          ...run,
          sessionId: "other",
          difficulty: "Impossible",
          difficultyLabel: "Expert",
        },
      },
    ]);
    const [r] = campaignRollups(store, campaignLabel, difficultyRank);
    expect(r!.hardestDifficulty).toBe("Expert");
  });

  it("returns nothing for an empty store", () => {
    expect(campaignRollups(buildStore([]), campaignLabel, difficultyRank)).toEqual([]);
  });
});

describe("per-player views reuse the same arithmetic", () => {
  it("breaks down a single player's record", () => {
    const wob = run.totals.find((p) => p.label === "Wob") as NormalizedPlayer;
    const b = infectedBreakdown([wob]);
    expect(b.commonKills).toBe(207);
    expect(b.totalSpecialKills).toBe(10);
  });

  it("gives a bot the same treatment as a human", () => {
    const bill = run.totals.find((p) => p.label === "Bill") as NormalizedPlayer;
    const b = infectedBreakdown([bill]);
    expect(b.commonKills).toBe(80);
  });
});

/**
 * The per-player splits. The property that matters for all three is that the
 * rows sum to the roster total sitting next to them: these are splits of the
 * same arithmetic, not a second implementation, and a table whose rows do not
 * add up to its own footer would be worse than no table.
 */
/**
 * The victim side. The properties that matter here are that each event is
 * read from the table that actually records it, and that a damage figure is
 * never allowed to masquerade as an event count.
 */
describe("playerIncidents", () => {
  it("names each contact event from the survivor's side", () => {
    const rows = playerIncidents([
      victim("Wob", {
        grabbed_by: { hunter: 2, smoker: 1, jockey: 3, charger: 1 },
      }),
    ]);
    const labels = rows[0]!.incidents.map((i) => i.label);
    expect(labels).toContain("Pounced");
    expect(labels).toContain("Hooked");
    expect(labels).toContain("Ridden");
    expect(labels).toContain("Pummelled");
  });

  it("counts a boomer vomit as a vomit, not as a grab", () => {
    const rows = playerIncidents([
      victim("Wob", { grabbed_by: { boomer_vomit: 4 } }),
    ]);
    const vomit = rows[0]!.incidents.find((i) => i.label === "Vomited on");
    expect(vomit?.count).toBe(4);
    // Coloured as a boomer even though the table key is boomer_vomit.
    expect(vomit?.key).toBe("boomer");
  });

  it("reads the damage-signature types as damage, not as events", () => {
    const rows = playerIncidents([
      victim("Wob", { damage_taken: { spitter: 60, tank: 200 } }),
    ]);
    const spat = rows[0]!.incidents.find((i) => i.label === "Spat on");
    expect(spat?.unit).toBe("damage");
    expect(spat?.count).toBe(60);
    // Damage must not inflate the contact tally.
    expect(rows[0]!.totalIncidents).toBe(0);
  });

  it("counts only contact events in the incident total", () => {
    const rows = playerIncidents([
      victim("Wob", {
        grabbed_by: { hunter: 2, jockey: 1 },
        damage_taken: { spitter: 500 },
      }),
    ]);
    expect(rows[0]!.totalIncidents).toBe(3);
  });

  it("excludes world, fall and friendly fire from infected damage", () => {
    const rows = playerIncidents([
      victim("Wob", {
        damage_taken: { hunter: 40, fall: 200, teammate: 90, world: 10 },
        killed_by: { hunter: 1, teammate: 1 },
      }),
    ]);
    expect(rows[0]!.damageFromInfected).toBe(40);
    expect(rows[0]!.deathsToInfected).toBe(1);
  });

  it("never reports an escape rate, since the mod double-writes pins", () => {
    const rows = playerIncidents([
      victim("Wob", { grabbed_by: { hunter: 3, hunter_escaped: 3 } }),
    ]);
    // The escape key must not become a column of its own.
    expect(rows[0]!.incidents.map((i) => i.label)).toEqual(["Pounced"]);
    expect(rows[0]!.totalIncidents).toBe(3);
  });

  it("picks up the counters that live on actions", () => {
    const rows = playerIncidents([
      victim("Wob", { witches_startled: 2, tank_rocks_hit_by: 1 }),
    ]);
    expect(rows[0]!.witchesStartled).toBe(2);
    expect(rows[0]!.tankRocksHit).toBe(1);
  });

  it("ranks the worst-hit player first", () => {
    const rows = playerIncidents([
      victim("Fine", { grabbed_by: { hunter: 1 } }),
      victim("Dead", { killed_by: { charger: 2 }, incaps: 1 }),
      victim("Downed", { incaps: 3 }),
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Dead", "Downed", "Fine"]);
  });

  it("gives every player in the real run a row", () => {
    const rows = playerIncidents(run.totals);
    expect(rows).toHaveLength(run.totals.length);
    expect(rows.map((r) => r.key).sort()).toEqual(
      run.totals.map((p) => p.key).sort(),
    );
  });

  it("sums incaps back to the roster's own count", () => {
    const rows = playerIncidents(run.totals);
    expect(rows.reduce((n, r) => n + r.incaps, 0)).toBe(
      run.totals.reduce((n, p) => n + p.defense.incaps, 0),
    );
  });
});

describe("playerInfectedBreakdowns", () => {
  it("gives every player in the roster a row", () => {
    const rows = playerInfectedBreakdowns(run.totals);
    expect(rows).toHaveLength(run.totals.length);
    expect(rows.map((r) => r.key).sort()).toEqual(
      run.totals.map((p) => p.key).sort(),
    );
  });

  it("matches the single-player breakdown exactly", () => {
    const rows = playerInfectedBreakdowns(run.totals);
    const wob = rows.find((r) => r.label === "Wob")!;
    expect(wob.breakdown.commonKills).toBe(207);
    expect(wob.breakdown.totalSpecialKills).toBe(10);
  });

  it("sums back to the roster total", () => {
    const rows = playerInfectedBreakdowns(run.totals);
    const team = infectedBreakdown(run.totals);
    expect(rows.reduce((n, r) => n + r.breakdown.commonKills, 0)).toBe(
      team.commonKills,
    );
    expect(rows.reduce((n, r) => n + r.breakdown.totalSpecialKills, 0)).toBe(
      team.totalSpecialKills,
    );
  });

  it("computes each player's share of the team's specials", () => {
    const rows = playerInfectedBreakdowns(run.totals);
    const shares = rows
      .map((r) => r.specialShareOfTeam)
      .filter((s): s is number => s !== null);
    expect(shares.reduce((n, s) => n + s, 0)).toBeCloseTo(1);
  });

  it("ranks by specials killed, not by total kills", () => {
    // A player who killed one special outranks one who only shot common.
    const rows = playerInfectedBreakdowns([
      { ...player({ kills: { common: 500 } }), key: "a", label: "Horde", kind: "human" as const, character: "" },
      { ...player({ kills: { hunter: 1 } }), key: "b", label: "Spec", kind: "human" as const, character: "" },
    ]);
    expect(rows[0]!.label).toBe("Spec");
  });

  it("carries the bot flag through so the table can mark it", () => {
    const rows = playerInfectedBreakdowns(run.totals);
    expect(rows.find((r) => r.label === "Bill")!.kind).toBe("bot");
  });

  it("returns a null share rather than zero when the team killed none", () => {
    const rows = playerInfectedBreakdowns([
      { ...player({ kills: { common: 5 } }), key: "a", label: "A", kind: "human" as const, character: "" },
    ]);
    expect(rows[0]!.specialShareOfTeam).toBeNull();
  });

  it("handles an empty roster", () => {
    expect(playerInfectedBreakdowns([])).toEqual([]);
  });
});

describe("playerThrowableBreakdowns", () => {
  it("attributes each item to the player who used it", () => {
    const rows = playerThrowableBreakdowns(
      [
        { ...player({ items_used: { pipe_bomb: 2 } }), key: "a", label: "A", kind: "human" as const, character: "" },
        { ...player({ items_used: { pain_pills: 1 } }), key: "b", label: "B", kind: "human" as const, character: "" },
      ],
      2,
    );
    const a = rows.find((r) => r.label === "A")!;
    const b = rows.find((r) => r.label === "B")!;
    expect(a.breakdown.totalThrown).toBe(2);
    expect(a.breakdown.totalConsumed).toBe(0);
    expect(b.breakdown.totalConsumed).toBe(1);
  });

  it("sums back to the roster total", () => {
    const roster = [
      { ...player({ items_used: { pipe_bomb: 2, pain_pills: 1 } }), key: "a", label: "A", kind: "human" as const, character: "" },
      { ...player({ items_used: { molotov: 1 } }), key: "b", label: "B", kind: "human" as const, character: "" },
    ];
    const rows = playerThrowableBreakdowns(roster, 2);
    const team = throwableBreakdown(roster, 2);
    expect(rows.reduce((n, r) => n + r.breakdown.totalThrown, 0)).toBe(
      team.totalThrown,
    );
    expect(rows.reduce((n, r) => n + r.breakdown.totalConsumed, 0)).toBe(
      team.totalConsumed,
    );
  });

  it("ranks by how much a player actually spent", () => {
    const rows = playerThrowableBreakdowns(
      [
        { ...player({}), key: "a", label: "Empty", kind: "human" as const, character: "" },
        { ...player({ items_used: { molotov: 3 } }), key: "b", label: "Loaded", kind: "human" as const, character: "" },
      ],
      1,
    );
    expect(rows[0]!.label).toBe("Loaded");
  });

  it("keeps a row for a player who used nothing", () => {
    // "Brought nothing to this fight" is a real finding, not an absence.
    const rows = playerThrowableBreakdowns(
      [{ ...player({}), key: "a", label: "Empty", kind: "human" as const, character: "" }],
      1,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.totalUsed).toBe(0);
  });

  it("measures every player against the scope's own chapter count", () => {
    // Not a per-player chapter count: the rows must stay comparable.
    const rows = playerThrowableBreakdowns(
      [{ ...player({ items_used: { molotov: 4 } }), key: "a", label: "A", kind: "human" as const, character: "" }],
      2,
    );
    expect(rows[0]!.breakdown.thrownPerChapter).toBe(2);
  });
});

describe("playerWeaponBreakdowns", () => {
  it("splits the real run's shooting totals per player", () => {
    const rows = playerWeaponBreakdowns(run.totals, run.weaponAttribution);
    expect(rows).toHaveLength(run.totals.length);
    expect(rows.reduce((n, r) => n + r.breakdown.shotsFired, 0)).toBe(4308);
    expect(rows.reduce((n, r) => n + r.breakdown.kills, 0)).toBe(489);
  });

  it("ranks by kills", () => {
    const rows = playerWeaponBreakdowns(run.totals, run.weaponAttribution);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.breakdown.kills).toBeGreaterThanOrEqual(
        rows[i]!.breakdown.kills,
      );
    }
  });

  it("names each player's own top weapon on a file that has the table", () => {
    const rows = playerWeaponBreakdowns(
      weaponRun.totals,
      weaponRun.weaponAttribution,
    );
    const armed = rows.filter((r) => r.breakdown.perWeaponAvailable);
    expect(armed.length).toBeGreaterThan(0);
    for (const r of armed) expect(r.breakdown.topByKills).not.toBeNull();
  });

  it("passes the session attribution through to every row unchanged", () => {
    // Inference is a property of how the addon recorded the run, not of the
    // player, so every row carries the same caveat.
    const rows = playerWeaponBreakdowns(run.totals, {
      fromEvent: 1,
      inferred: 3,
    });
    for (const r of rows) expect(r.breakdown.inferredShare).toBe(0.75);
  });

  it("reports per-weapon as unavailable per player on older files", () => {
    const rows = playerWeaponBreakdowns(run.totals, run.weaponAttribution);
    for (const r of rows) {
      expect(r.breakdown.perWeaponAvailable).toBe(false);
      expect(r.breakdown.all).toEqual([]);
    }
  });

  it("handles an empty roster", () => {
    expect(playerWeaponBreakdowns([])).toEqual([]);
  });
});

describe("retries vs retried chapters", () => {
  it("counts restarts and replayed chapters as different numbers", async () => {
    const { campaignMetrics } = await import("@/lib/metrics");
    const m = campaignMetrics(run);
    // The apartment was started 3 times and the subway once: 4 round starts
    // across 2 chapters is 2 extra starts, but only ONE chapter was replayed.
    // Labelling the first figure "chapters replayed" was the bug.
    expect(m.retries).toBe(2);
    expect(m.retriedChapters).toBe(1);
  });
});
