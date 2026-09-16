/**
 * Campaign posters, chapter stills and survivor portraits.
 *
 * Art is decoration over data, so every lookup here is allowed to fail and
 * every call site has to survive it returning null. A custom campaign, a
 * Workshop map, a survivor the mod spelled differently, a file someone
 * renamed -- all of these are normal, and none of them may break a page that
 * is fundamentally about numbers.
 *
 * The mapping is by identity, never by prettified label: `campaignLabel`
 * exists for reading and would send "Dead Center" through a slugifier to
 * arrive back at a filename, which breaks the moment a label is reworded.
 * Campaigns key off the `cN` id the mod writes, chapters off the engine map
 * name, and survivors off the character string.
 */

export interface Art {
  /** Served path, root-relative. */
  src: string;
  /**
   * The *display box* ratio, not the file's intrinsic size.
   *
   * The source art is not uniform -- posters run from 461x622 to 1106x1474,
   * stills wobble between 335x156 and 343x164, portraits between 109x112 and
   * 119x120 -- because they were captured from different places at different
   * times. Handing `next/image` each file's real size would faithfully
   * reproduce that mess on screen, which is the opposite of what a grid of
   * campaigns wants: rows that do not line up read as a bug even when every
   * individual image is correct.
   *
   * So each kind declares one ratio, every call site renders into a box of
   * that ratio, and `object-cover` absorbs the difference by cropping. The
   * numbers below are ratios that happen to be written at a plausible pixel
   * scale; nothing reads them as a promise about bytes on disk.
   */
  width: number;
  height: number;
}

//---------------------------------------------------------------------
// Campaign posters
//---------------------------------------------------------------------

/**
 * `cN` to poster file stem.
 *
 * The keys are the mod's campaign ids, the same ones `CAMPAIGN_NAMES` in
 * metrics.ts is keyed by. All fourteen official campaigns have a poster.
 */
const CAMPAIGN_POSTER: Record<string, string> = {
  c1: "dead-center",
  c2: "dark-carnival",
  c3: "swamp-fever",
  c4: "hard-rain",
  c5: "the-parish",
  c6: "the-passing",
  c7: "the-sacrifice",
  c8: "no-mercy",
  c9: "crash-course",
  c10: "death-toll",
  c11: "dead-air",
  c12: "blood-harvest",
  c13: "cold-stream",
  c14: "the-last-stand",
};

/**
 * Custom campaigns that happen to have a poster, keyed by the raw campaign
 * id the mod writes for them.
 *
 * Custom campaigns have no `cN` id -- the mod falls back to the first map's
 * name, so Dam It arrives as "l4d_dam01_riverbank". That string is the only
 * stable handle there is, so it is what the table is keyed on.
 *
 * This table is expected to stay mostly empty. Finding art for a Workshop
 * campaign is manual work with no guarantee of a result, so the honest
 * default for a custom campaign is still no poster -- `campaignPoster`
 * returns null and the call site draws its lettered fallback. Adding one
 * later means dropping a file in `public/assets/campaigns/` and adding a
 * line here; nothing else has to change.
 */
const CUSTOM_POSTER: Record<string, string> = {
  l4d_dam01_riverbank: "dam-it",
};

/**
 * Poster extensions, since the set mixes jpeg and png.
 *
 * Carried as data rather than probed at runtime: this module is imported by
 * server components that must not touch the filesystem per render, and a
 * wrong extension is a missing image rather than a crash.
 */
const POSTER_EXT: Record<string, string> = {
  "dark-carnival": "png",
  "cold-stream": "png",
  "dam-it": "png",
};

/**
 * The poster box: 3:4.
 *
 * The files themselves are not 3:4 -- they range from 1:1.28 to 1:1.35 --
 * and that spread is exactly what this constant exists to hide. Every
 * poster renders into a 3:4 box and is cropped to fit, so a row of
 * campaigns has one silhouette instead of fourteen near-misses.
 */
const POSTER_RATIO = { width: 3, height: 4 };

export function campaignPoster(campaign: string): Art | null {
  const stem = CAMPAIGN_POSTER[campaign] ?? CUSTOM_POSTER[campaign];
  if (stem === undefined) return null;
  const ext = POSTER_EXT[stem] ?? "jpeg";
  return {
    src: `/assets/campaigns/${stem}.${ext}`,
    ...POSTER_RATIO,
  };
}

//---------------------------------------------------------------------
// Chapter stills
//---------------------------------------------------------------------

/**
 * Chapter files are named `<campaign-slug>-<NN>--<name>.png`, so a still is
 * addressable by campaign and chapter number alone -- the trailing name is
 * for humans reading the directory and is not parsed.
 *
 * The slug is NOT always the poster stem: the chapter set says `last-stand`
 * where the poster says `the-last-stand`. Keeping a separate table is the
 * honest fix; deriving one from the other would encode that inconsistency
 * as a rule.
 */
const CHAPTER_SLUG: Record<string, string> = {
  c1: "dead-center",
  c2: "dark-carnival",
  c3: "swamp-fever",
  c4: "hard-rain",
  c5: "the-parish",
  c6: "the-passing",
  c7: "the-sacrifice",
  c8: "no-mercy",
  c9: "crash-course",
  c10: "death-toll",
  c11: "dead-air",
  c12: "blood-harvest",
  c13: "cold-stream",
  c14: "last-stand",
};

/** How many stills exist per campaign, so a bad number yields null. */
const CHAPTER_COUNT: Record<string, number> = {
  c1: 4,
  c2: 5,
  c3: 4,
  c4: 5,
  c5: 5,
  c6: 3,
  c7: 3,
  c8: 5,
  c9: 2,
  c10: 5,
  c11: 5,
  c12: 5,
  c13: 4,
  c14: 2,
};

/** The filename tail after `<slug>-<NN>--`, which varies per chapter. */
const CHAPTER_NAME: Record<string, readonly string[]> = {
  c1: ["hotel", "streets", "mall", "atrium"],
  c2: ["highway", "fairground", "coaster", "barns", "concert"],
  c3: ["plank-country", "swamp", "shanty-town", "plantation"],
  c4: [
    "milltown",
    "sugar-mill",
    "mill-escape",
    "return-to-town",
    "town-escape",
  ],
  c5: ["waterfront", "park", "cemetery", "quarter", "bridge"],
  c6: ["riverbank", "underground", "port"],
  c7: ["docks", "barge", "port"],
  c8: [
    "the-apartments",
    "the-subway",
    "the-sewers",
    "the-hospital",
    "rooftop-finale",
  ],
  c9: ["the-alleys", "the-truck-depot-finale"],
  c10: [
    "the-turnpike",
    "the-drains",
    "the-church",
    "the-town",
    "boathouse-finale",
  ],
  c11: [
    "the-greenhouse",
    "the-crane",
    "the-construction-site",
    "the-terminal",
    "runway-finale",
  ],
  c12: [
    "the-woods",
    "the-tunnel",
    "the-bridge",
    "the-train-station",
    "farmhouse-finale",
  ],
  c13: [
    "alpine-creek",
    "south-pine-stream",
    "memorial-bridge",
    "cut-throat-creek",
  ],
  c14: ["the-junkyard", "lighthouse-finale"],
};

/**
 * The still box: 21:10, near enough to the 2:1 the captures aim at.
 *
 * The files land between 335x156 and 343x164 -- all hand-captured, none
 * exactly alike. Pinning the box here and cropping to it is what makes a
 * column of chapter stills share an edge, which is the whole point: the
 * stills sit next to each other far more often than they sit alone.
 */
const STILL_RATIO = { width: 21, height: 10 };

/**
 * The still for one chapter.
 *
 * `map` is the engine name the mod writes ("c1m2_streets"). The campaign and
 * chapter number are read back out of it rather than taken from the caller,
 * because the map name is the one field that is always present and always
 * self-consistent -- a chapter's `index` is its position in the run, which a
 * restarted or skipped chapter can desync from the number in its own name.
 */
export function chapterStill(map: string): Art | null {
  const m = /^c(\d+)m(\d+)(?:_|$)/.exec(map);
  if (!m) return null; // A custom map. Normal, not an error.
  const campaign = `c${m[1]}`;
  const number = Number(m[2]);
  const slug = CHAPTER_SLUG[campaign];
  const names = CHAPTER_NAME[campaign];
  const count = CHAPTER_COUNT[campaign];
  if (slug === undefined || names === undefined || count === undefined) {
    return null;
  }
  if (!Number.isInteger(number) || number < 1 || number > count) return null;
  const name = names[number - 1];
  if (name === undefined) return null;
  const nn = String(number).padStart(2, "0");
  return {
    src: `/assets/chapters/${slug}-${nn}--${name}.png`,
    ...STILL_RATIO,
  };
}

//---------------------------------------------------------------------
// Survivor portraits
//---------------------------------------------------------------------

/**
 * The eight playable survivors.
 *
 * Keyed on the lowercased character string the mod writes. Anything else --
 * an empty character, a modded survivor, a name the mod spells differently
 * -- resolves to null and the call site falls back to initials, which is why
 * no entry here is load-bearing.
 */
const PORTRAITS = new Set([
  "bill",
  "coach",
  "ellis",
  "francis",
  "louis",
  "nick",
  "rochelle",
  "zoey",
]);

/**
 * The portrait box: square.
 *
 * The files are square-ish but not square (109x113, 117x120, 118x118...).
 * Portraits appear inline in table rows where a pixel of drift in either
 * direction shows up as a ragged column, so the box is exactly 1:1 and the
 * image covers it.
 */
const PORTRAIT_RATIO = { width: 1, height: 1 };

export function survivorPortrait(character: string): Art | null {
  const key = character.trim().toLowerCase();
  if (!PORTRAITS.has(key)) return null;
  return {
    src: `/assets/characters/${key}.png`,
    ...PORTRAIT_RATIO,
  };
}
