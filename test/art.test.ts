import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { campaignPoster, chapterStill, survivorPortrait } from "@/lib/art";
import { CAMPAIGN_NAMES } from "@/lib/metrics";

/**
 * The art tables are filenames written by hand, so the only test that
 * matters is whether they point at files that exist. A typo in a slug is
 * invisible in review and shows up as a silently broken image.
 */

const PUBLIC = path.resolve(__dirname, "../public");

/**
 * Custom campaigns that have art, by the raw id the mod writes for them.
 * Mirrors `CUSTOM_POSTER` in art.ts; a new custom poster is added in both
 * places, which is what makes the "uses every poster" test bite.
 */
const CUSTOM_CAMPAIGNS = ["l4d_dam01_riverbank"];

function served(src: string): string {
  return path.join(PUBLIC, src.replace(/^\//, ""));
}

describe("campaign posters", () => {
  it("resolves to a file that exists, for every campaign that has one", () => {
    const missing: string[] = [];
    for (const campaign of Object.keys(CAMPAIGN_NAMES)) {
      const art = campaignPoster(campaign);
      if (art && !existsSync(served(art.src))) missing.push(art.src);
    }
    expect(missing).toEqual([]);
  });

  it("resolves a custom campaign's poster to a file that exists", () => {
    // Custom campaigns have no cN id, so they key off the raw campaign
    // string the mod writes -- the first map's name.
    const art = campaignPoster("l4d_dam01_riverbank");
    expect(art?.src).toBe("/assets/campaigns/dam-it.png");
    expect(existsSync(served(art!.src))).toBe(true);
  });

  it("uses every poster in the directory", () => {
    // Catches the opposite error from the test above: art that was added to
    // the folder but never wired up, which no page would ever reveal. Custom
    // posters are included, since a file dropped in for a Workshop campaign
    // and never added to the table is the likeliest version of this mistake.
    const used = new Set(
      [...Object.keys(CAMPAIGN_NAMES), ...CUSTOM_CAMPAIGNS]
        .map((c) => campaignPoster(c)?.src)
        .filter((s): s is string => s !== undefined)
        .map((s) => path.basename(s)),
    );
    const onDisk = readdirSync(path.join(PUBLIC, "assets/campaigns"));
    expect([...onDisk].filter((f) => !used.has(f))).toEqual([]);
  });

  it("returns null for a campaign with no poster, rather than a bad path", () => {
    // The normal case for a Workshop campaign: no art, and a null that the
    // call site turns into its lettered fallback.
    expect(campaignPoster("l4d_someones_workshop_map")).toBeNull();
    expect(campaignPoster("c99")).toBeNull();
    expect(campaignPoster("")).toBeNull();
  });

  it("gives every poster the same box, so a row of them lines up", () => {
    const ratios = new Set(
      [...Object.keys(CAMPAIGN_NAMES), ...CUSTOM_CAMPAIGNS]
        .map((c) => campaignPoster(c))
        .filter((a): a is NonNullable<typeof a> => a !== null)
        .map((a) => a.width / a.height),
    );
    expect(ratios.size).toBe(1);
  });
});

describe("chapter stills", () => {
  it("resolves every chapter of every official campaign to a real file", () => {
    const missing: string[] = [];
    for (const campaign of Object.keys(CAMPAIGN_NAMES)) {
      const n = Number(campaign.slice(1));
      for (let chapter = 1; chapter <= 5; chapter += 1) {
        const art = chapterStill(`c${n}m${chapter}_whatever`);
        if (art && !existsSync(served(art.src))) missing.push(art.src);
      }
    }
    expect(missing).toEqual([]);
  });

  it("uses every still in the directory", () => {
    const used = new Set<string>();
    for (const campaign of Object.keys(CAMPAIGN_NAMES)) {
      const n = Number(campaign.slice(1));
      for (let chapter = 1; chapter <= 6; chapter += 1) {
        const art = chapterStill(`c${n}m${chapter}_x`);
        if (art) used.add(path.basename(art.src));
      }
    }
    const onDisk = readdirSync(path.join(PUBLIC, "assets/chapters"));
    expect([...onDisk].filter((f) => !used.has(f))).toEqual([]);
  });

  it("reads the chapter number from the map name, not the caller", () => {
    expect(chapterStill("c1m2_streets")?.src).toContain("dead-center-02--");
    expect(chapterStill("c8m5_rooftop")?.src).toContain("no-mercy-05--");
  });

  it("returns null for a custom map rather than guessing", () => {
    expect(chapterStill("l4d_dam01_riverbank")).toBeNull();
    expect(chapterStill("")).toBeNull();
    expect(chapterStill("c1_nomapnumber")).toBeNull();
  });

  it("returns null for a chapter number the campaign does not have", () => {
    // Dead Center is four chapters; a fifth would be a made-up filename.
    expect(chapterStill("c1m5_invented")).toBeNull();
    expect(chapterStill("c9m9_invented")).toBeNull();
    expect(chapterStill("c1m0_invented")).toBeNull();
  });

  it("gives every still the same box, whatever the capture was", () => {
    // The files on disk are not uniform -- they were captured by hand and
    // land anywhere from 335x156 to 343x164. The box they render into has
    // to be, or a column of stills comes out ragged.
    const ratios = new Set<number>();
    for (const campaign of Object.keys(CAMPAIGN_NAMES)) {
      const n = Number(campaign.slice(1));
      for (let chapter = 1; chapter <= 6; chapter += 1) {
        const art = chapterStill(`c${n}m${chapter}_x`);
        if (art) ratios.add(art.width / art.height);
      }
    }
    expect(ratios.size).toBe(1);
  });
});

describe("survivor portraits", () => {
  it("resolves all eight survivors to files that exist", () => {
    const names = [
      "Bill",
      "Coach",
      "Ellis",
      "Francis",
      "Louis",
      "Nick",
      "Rochelle",
      "Zoey",
    ];
    const missing: string[] = [];
    for (const n of names) {
      const art = survivorPortrait(n);
      if (!art) missing.push(`${n}: no art`);
      else if (!existsSync(served(art.src))) missing.push(art.src);
    }
    expect(missing).toEqual([]);
  });

  it("uses every portrait in the directory", () => {
    const used = new Set(
      ["bill", "coach", "ellis", "francis", "louis", "nick", "rochelle", "zoey"]
        .map((n) => survivorPortrait(n)?.src)
        .filter((s): s is string => s !== undefined)
        .map((s) => path.basename(s)),
    );
    const onDisk = readdirSync(path.join(PUBLIC, "assets/characters"));
    expect([...onDisk].filter((f) => !used.has(f))).toEqual([]);
  });

  it("is case and whitespace insensitive, as the mod's spelling varies", () => {
    expect(survivorPortrait("COACH")?.src).toBe("/assets/characters/coach.png");
    expect(survivorPortrait(" Nick ")?.src).toBe("/assets/characters/nick.png");
  });

  it("returns null for an unknown or empty character", () => {
    expect(survivorPortrait("")).toBeNull();
    expect(survivorPortrait("Chell")).toBeNull();
  });

  it("gives every portrait a square box, so inline rows stay even", () => {
    const names = [
      "bill",
      "coach",
      "ellis",
      "francis",
      "louis",
      "nick",
      "rochelle",
      "zoey",
    ];
    for (const n of names) {
      const art = survivorPortrait(n);
      expect(art?.width).toBe(art?.height);
    }
  });
});
