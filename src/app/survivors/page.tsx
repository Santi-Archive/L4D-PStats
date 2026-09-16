import Link from "next/link";
import { getReport, pstatsDir } from "@/lib/data.server";
import {
  allTimeMetrics,
  formatDuration,
  formatMaybe,
  formatNumber,
  formatPercent,
} from "@/lib/metrics";
import { infectedLabel } from "@/lib/breakdowns";
import PlayerTable from "@/components/PlayerTable";
import { Empty, PageHeader, SectionHead, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Survivors: the roster across every run.
 *
 * This is an index, not a record. The record is the player page, which
 * already carries the weapon, infected, item and incident breakdowns for one
 * player — so this page's job is to rank everyone and get out of the way.
 */
export default async function SurvivorsPage() {
  const { store } = await getReport();
  const all = allTimeMetrics(store);

  const humans = all.players.filter((p) => p.kind !== "bot");
  const bots = all.players.length - humans.length;

  if (all.players.length === 0) {
    return (
      <main className="mx-auto w-full max-w-[1400px] px-6 pb-24">
        <PageHeader eyebrow="Survivors" title="Nobody on record yet" />
        <div className="py-12">
          <Empty
            title="No players yet"
            body={`Nothing was found in ${pstatsDir()}. Play a campaign with the addon running, or load files by hand.`}
            action={
              <Link
                href="/load"
                className="eyebrow border border-rule-bright px-4 py-2 text-ink-dim transition-colors hover:border-ink-faint hover:text-ink"
              >
                Load files
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  // Aggregate team figures, so the table below has something to be a share of.
  const totalRevives = all.players.reduce((n, p) => n + p.revivesGiven, 0);
  const totalDeaths = all.players.reduce((n, p) => n + p.deaths, 0);
  const totalIncaps = all.players.reduce((n, p) => n + p.incaps, 0);

  // A record with no kills and no casualties is a bot that was swapped out
  // before anything happened to it. It stays in the table above, where the
  // zeros are a fact about the run, and is kept out of the cards below.
  const carded = all.players.filter(
    (p) => p.kills > 0 || p.deaths > 0 || p.incaps > 0,
  );

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 pb-24">
      <PageHeader
        eyebrow="Survivors"
        title="Everyone who has played"
        lede={
          `${humans.length} player${humans.length === 1 ? "" : "s"} across ` +
          `${all.campaigns} run${all.campaigns === 1 ? "" : "s"}` +
          (bots > 0
            ? `, plus ${bots} bot${bots === 1 ? "" : "s"}. Open a name for their full record.`
            : ". Open a name for their full record.")
        }
      />

      <section className="rise grid grid-cols-2 gap-x-8 gap-y-9 border-b border-rule py-9 md:grid-cols-5">
        <Stat label="Survivors" value={humans.length} size="md" />
        <Stat
          label="Time played"
          value={formatDuration(all.totalPlaytimeS)}
          sub="wall clock, all runs"
          size="md"
        />
        <Stat
          label="Revives given"
          value={formatNumber(totalRevives)}
          tone="clear"
          size="md"
        />
        <Stat label="Incaps" value={formatNumber(totalIncaps)} size="md" />
        <Stat
          label="Deaths"
          value={formatNumber(totalDeaths)}
          tone={totalDeaths > 0 ? "harm" : "neutral"}
          size="md"
        />
      </section>

      <section className="py-9">
        <SectionHead label="All-time roster">
          <div className="flex items-baseline gap-4 text-[0.7rem] text-ink-mute">
            <span>Sortable · click a name for the full record</span>
            <Link
              href="/compare"
              className="eyebrow text-ink-mute transition-colors hover:text-ink-dim"
            >
              Compare two
            </Link>
          </div>
        </SectionHead>
        <PlayerTable players={all.players} showCampaigns />
      </section>

      {/* The cards repeat names already in the table above, so they earn
          their place by carrying what the table cannot: each player's own
          worst threat, and the rate figures that need two lines to read. */}
      <section className="py-9">
        <SectionHead
          label="At a glance"
          note="Ranked by kills · players with a recorded fight"
        />
        {/* Idle bots that were swapped out in the first seconds of a run have
            a row in the table above, where a zero is information, but a card
            of nothing but zeros is not worth the width. The border grid is
            drawn per card rather than as a background so a short last row
            never leaves a filled empty cell. */}
        <div className="grid grid-cols-1 border-t border-l border-rule sm:grid-cols-2 lg:grid-cols-3">
          {carded.map((p) => (
            <Link
              key={p.key}
              href={`/players/${encodeURIComponent(p.key)}`}
              className="group border-r border-b border-rule p-5 transition-colors hover:bg-raised"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="display truncate text-[1.25rem] text-ink transition-colors group-hover:text-clear">
                  {p.label}
                </span>
                {p.kind === "bot" && (
                  <span className="eyebrow shrink-0 text-ink-faint">bot</span>
                )}
              </div>

              <div className="mono mt-1 text-[0.65rem] text-ink-faint">
                {p.campaigns} campaign{p.campaigns === 1 ? "" : "s"} ·{" "}
                {formatDuration(p.playtimeS)}
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3">
                <Figure label="Kills" value={formatNumber(p.kills)} />
                <Figure label="K/min" value={formatMaybe(p.killsPerMinute, 2)} />
                <Figure label="HS%" value={formatPercent(p.headshotRate, 0)} />
                <Figure
                  label="Deaths"
                  value={formatNumber(p.deaths)}
                  tone={p.deaths > 0 ? "harm" : undefined}
                />
                <Figure label="Incaps" value={formatNumber(p.incaps)} />
                <Figure
                  label="Revives"
                  value={formatNumber(p.revivesGiven)}
                  tone={p.revivesGiven > 0 ? "clear" : undefined}
                />
              </dl>

              {p.topThreat && (
                <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-rule pt-3">
                  <span className="eyebrow">Worst threat</span>
                  <span className="text-[0.75rem] text-ink-dim">
                    {infectedLabel(p.topThreat.key)}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "harm" | "clear";
}) {
  return (
    <div>
      <dd
        className={`mono text-[0.85rem] ${
          tone === "harm"
            ? "text-harm"
            : tone === "clear"
              ? "text-clear"
              : "text-ink"
        }`}
      >
        {value}
      </dd>
      <dt className="eyebrow mt-0.5 !text-[0.55rem]">{label}</dt>
    </div>
  );
}
