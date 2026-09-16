import { notFound } from "next/navigation";
import { getReport } from "@/lib/data.server";
import type { NormalizedPlayer } from "@/lib/normalize";
import {
  allTimeMetrics,
  campaignLabel,
  formatDuration,
  formatMaybe,
  formatNumber,
  formatPercent,
  playerMetrics,
} from "@/lib/metrics";
import {
  CampaignMark,
  Crumb,
  CustomTag,
  DifficultyStamp,
  SectionHead,
  Stat,
  SurvivorMark,
} from "@/components/ui";
import {
  infectedBreakdown,
  playerIncidents,
  throwableBreakdown,
  weaponBreakdown,
} from "@/lib/breakdowns";
import InfectedLedger, { InfectedSummary } from "@/components/InfectedLedger";
import { ThrowablePanel, WeaponPanel } from "@/components/LoadoutPanels";
import PlayerIncidentBreakdown from "@/components/PlayerIncidentBreakdown";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ playerKey: string }>;
}) {
  const { playerKey } = await params;
  const key = decodeURIComponent(playerKey);
  const { store } = await getReport();
  const all = allTimeMetrics(store);

  const agg = all.players.find((p) => p.key === key);
  if (!agg) notFound();

  // Campaigns this player actually appears in.
  const appearances = store.sessions
    .filter((s) => s.totalsByKey[key])
    .map((s) => {
      const p = s.totalsByKey[key]!;
      return { session: s, metrics: playerMetrics(p) };
    });

  // Every record this player has across all runs, for the breakdowns. The
  // aggregate metrics flatten the open stat tables, so the raw records are
  // what the ledger needs.
  const records = appearances.map((a) => a.session.totalsByKey[key]!);
  const infected = infectedBreakdown(records);

  // `playerIncidents` files one row per record, which here would be one row
  // per run. This player's incident history is a single row, so the records
  // are folded into one synthetic record first — summing the open defense
  // tables that the incident columns are built from.
  const folded = foldDefense(records);
  const incidents = playerIncidents(folded ? [folded] : []);
  const throwables = throwableBreakdown(
    records,
    appearances.reduce((n, a) => n + a.session.chapters.length, 0),
  );

  // Attribution is a session-level tally, so sum it across the runs this
  // player actually appears in rather than over the whole store.
  const attributions = appearances
    .map((a) => a.session.weaponAttribution)
    .filter((w): w is NonNullable<typeof w> => w !== null);
  const weapons = weaponBreakdown(
    records,
    attributions.length > 0
      ? {
          fromEvent: attributions.reduce((n, w) => n + w.fromEvent, 0),
          inferred: attributions.reduce((n, w) => n + w.inferred, 0),
        }
      : null,
  );

  return (
    /*
      Section order and vertical rhythm here are deliberate: everything down
      to the end of the Infected Ledger is the "summary" — it is sized to
      land inside one 900px-tall viewport so the whole profile can be read,
      or screenshotted, without scrolling. The per-run detail below the
      ledger is the reward for scrolling, not part of that budget.
    */
    <main className="mx-auto w-full max-w-[1400px] px-6 pb-24">
      <div className="flex items-center justify-between gap-4 pt-4">
        <Crumb href="/survivors" label="All survivors" />
        {/* Slot A arrives filled, so the comparison is one pick away rather
            than two. */}
        <Link
          href={`/compare?a=${encodeURIComponent(key)}`}
          className="eyebrow text-ink-mute transition-colors hover:text-ink-dim"
        >
          Compare with…
        </Link>
      </div>

      <header className="rise border-b border-rule pt-3 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-center gap-4">
            {/* The portrait is the one place the survivor they play is
                stated as a picture rather than a word. It is sized to the
                name block beside it, not to the page. */}
            <SurvivorMark
              character={agg.character}
              label={agg.label}
              size={52}
            />
            <div>
              {/* Eyebrow and Steam ID flank the name on one line each, but
                  tight to it: this block is the largest fixed cost in the
                  summary budget and every row it gives up is a ledger row
                  that gets to stay above the fold. */}
              <div className="eyebrow mb-1.5">
                {agg.kind === "bot"
                  ? "Bot"
                  : agg.kind === "unresolved"
                    ? "No Steam ID — tracked by name"
                    : "Survivor"}
              </div>
              <h1 className="display text-[clamp(1.75rem,3.2vw,2.4rem)] text-ink">
                {agg.label}
              </h1>
              <div className="mono mt-1.5 text-[0.68rem] text-ink-faint">
                {key}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <Stat
              label="Campaigns"
              value={agg.campaigns}
              size="sm"
            />
            <Stat
              label="Time played"
              value={formatDuration(agg.playtimeS)}
              size="sm"
            />
            <Stat
              label="Kills"
              value={formatNumber(agg.kills)}
              size="sm"
            />
          </div>
        </div>
      </header>

      {/* Headline stats */}
      <section className="rise grid grid-cols-2 gap-x-8 gap-y-5 border-b border-rule py-5 md:grid-cols-4 lg:grid-cols-7">
        <Stat
          label="Kills / min"
          value={formatMaybe(agg.killsPerMinute, 2)}
          size="sm"
        />
        <Stat
          label="Headshot rate"
          value={formatPercent(agg.headshotRate, 1)}
          sub={`${formatNumber(agg.headshots)} headshots`}
          size="sm"
        />
        <Stat
          label="Deaths"
          value={formatNumber(agg.deaths)}
          tone={agg.deaths > 0 ? "harm" : "neutral"}
          size="sm"
        />
        <Stat
          label="Incaps"
          value={formatNumber(agg.incaps)}
          size="sm"
        />
        <Stat
          label="Special kills"
          value={formatNumber(agg.specialKills)}
          sub={`${formatPercent(ratioOf(agg.specialKills, agg.kills), 1)} of kills`}
          size="sm"
        />
        <Stat
          label="Clean chapters"
          value={formatPercent(agg.cleanRate)}
          sub={`${agg.cleanChapters} of ${agg.chaptersPlayed}`}
          /* Only read as a good thing when it actually is one. */
          tone={
            agg.cleanRate !== null && agg.cleanRate >= 0.6 ? "clear" : "neutral"
          }
          size="sm"
        />
        <Stat
          label="Medkits / campaign"
          value={formatMaybe(ratioOf(agg.medkits, agg.campaigns), 1)}
          sub={`${formatNumber(agg.medkits)} total`}
          size="sm"
        />
      </section>

      {/*
        Per-campaign trend, above the ledger.

        This is the shortest path from "who is this player" to "what have
        they actually played": the header states their career totals, and
        this table immediately breaks those totals back out per run. The
        ledger is a deeper read that stands on its own, so it follows rather
        than separating the two halves of the same question.
      */}
      <section className="border-b border-rule pt-5 pb-4">
        <SectionHead
          label="Campaign by campaign"
          note={`${appearances.length} appearances`}
          tight
        />
        <div className="scroll-slim overflow-x-auto">
          <table className="data-table data-table-tight">
            <caption className="sr-only">
              This player&rsquo;s totals in each campaign they appear in
            </caption>
            <thead>
              <tr>
                <th scope="col">Campaign</th>
                <th scope="col">Difficulty</th>
                <th scope="col">Time</th>
                <th scope="col">Kills</th>
                <th scope="col" title="Smoker, boomer, hunter, spitter, jockey, charger, tank and witch kills">
                  SI kills
                </th>
                <th scope="col">K/min</th>
                <th scope="col">HS%</th>
                <th scope="col">Deaths</th>
                <th scope="col">Incaps</th>
                <th scope="col">Revives</th>
                <th scope="col" title="First aid kits spent in this campaign">
                  Medkits
                </th>
              </tr>
            </thead>
            <tbody>
              {appearances.map(({ session, metrics }) => (
                <tr key={session.sessionId}>
                  <td>
                    <Link
                      href={`/campaigns/${encodeURIComponent(session.sessionId)}`}
                      className="inline-flex items-center gap-2.5 text-ink transition-colors hover:text-clear"
                    >
                      <CampaignMark
                        campaign={session.campaign}
                        label={campaignLabel(session.campaign, session.official)}
                        height={26}
                      />
                      {campaignLabel(session.campaign, session.official)}
                      {!session.official && <CustomTag />}
                    </Link>
                  </td>
                  <td>
                    <DifficultyStamp
                      raw={session.difficulty}
                      label={session.difficultyDisplay}
                      gamemode={session.gamemode}
                      size="sm"
                    />
                  </td>
                  <td>{formatDuration(metrics.playtimeS)}</td>
                  <td>{formatNumber(metrics.kills)}</td>
                  <td>{formatNumber(metrics.specialKills)}</td>
                  <td>{formatMaybe(metrics.killsPerMinute, 2)}</td>
                  <td>{formatPercent(metrics.headshotRate, 1)}</td>
                  <td className={metrics.deaths > 0 ? "text-harm" : "text-ink-faint"}>
                    {metrics.deaths}
                  </td>
                  <td>{metrics.incaps}</td>
                  <td>{metrics.revivesGiven}</td>
                  <td className={metrics.medkits > 0 ? "text-ink-dim" : "text-ink-faint"}>
                    {formatNumber(metrics.medkits)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/*
        The Infected Ledger replaces the old "kills by type" and "threat
        profile" pair: it carries both directions of the fight in one table,
        so keeping them apart only stated each half twice.

        This is the last section inside the one-viewport summary, and it is
        rendered `compact` so its sixteen-odd rows fit that budget. The
        explanatory note sits below the fold on purpose — the table's own
        column headings already carry it for anyone reading the screenshot.
      */}
      <section className="pt-4 pb-2">
        {/* The three headline figures ride in the header's note slot rather
            than on a line of their own — at compact size they fit beside the
            label, and the row they give back is a ledger row above the fold. */}
        <SectionHead label="Infected ledger" tight>
          <InfectedSummary breakdown={infected} compact />
        </SectionHead>
        <InfectedLedger breakdown={infected} compact />
      </section>

      {/* The victim side of the ledger: not what they killed, but what the
          infection actually landed on them. */}
      <section className="border-t border-rule pt-6 pb-10">
        <SectionHead
          label="What happened to them"
          note="Grabs, incaps and deaths across every run"
        />
        <PlayerIncidentBreakdown rows={incidents} />
      </section>

      {/* Throwables and consumables */}
      <section className="border-t border-rule py-10">
        <SectionHead
          label="Throwables & items"
          note="Used across every run"
        />
        <ThrowablePanel breakdown={throwables} />
      </section>

      {/* Per-weapon breakdown, with the inference caveat inside the panel */}
      <section className="border-t border-rule py-10">
        <SectionHead
          label="Weapons"
          note={weapons.perWeaponAvailable ? "Per weapon" : "Totals only"}
        />
        <WeaponPanel breakdown={weapons} thrown={throwables.throwables} />
      </section>

    </main>
  );
}

/**
 * Guarded divide, for the two rates this page derives from aggregate totals.
 *
 * `metrics.ts` keeps its own `ratio` private and every metric it exports is
 * already divided; these two are page-level framings of existing totals
 * ("per campaign", "share of kills") rather than new metrics, so they are
 * computed here under the same rule: never divide without a denominator.
 */
function ratioOf(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * Sum this player's records from several runs into one.
 *
 * Only the fields the incident breakdown reads are folded: the open defense
 * tables it builds its columns from, plus the two `actions` counters it
 * borrows. A full deep merge lives in `metrics.ts` behind `allTimeMetrics`
 * and is not exported, and duplicating all of it here to reach four tables
 * would be the larger sin.
 */
function foldDefense(
  records: readonly NormalizedPlayer[],
): NormalizedPlayer | null {
  const first = records[0];
  if (first === undefined) return null;

  const out = structuredClone(first);
  for (const r of records.slice(1)) {
    out.defense.incaps += r.defense.incaps;
    addTable(out.defense.damage_taken, r.defense.damage_taken);
    addTable(out.defense.incapped_by, r.defense.incapped_by);
    addTable(out.defense.killed_by, r.defense.killed_by);
    addTable(out.defense.grabbed_by, r.defense.grabbed_by);
    out.actions.witches_startled += r.actions.witches_startled;
    out.actions.tank_rocks_hit_by += r.actions.tank_rocks_hit_by;
    // Playtime is what the scope row reports beside the name.
    out.playtime_s += r.playtime_s;
  }
  return out;
}

/** Add every key of `src` into `dst`, in place. */
function addTable(
  dst: Record<string, number>,
  src: Record<string, number>,
): void {
  for (const [k, v] of Object.entries(src)) {
    dst[k] = (dst[k] ?? 0) + v;
  }
}
