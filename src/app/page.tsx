import Link from "next/link";
import { getReport, pstatsDir } from "@/lib/data.server";
import {
  allTimeMetrics,
  campaignLabel,
  campaignMetrics,
  formatDuration,
  formatNumber,
  formatPercent,
} from "@/lib/metrics";
import { campaignRollups, infectedBreakdown } from "@/lib/breakdowns";
import { difficultyRank } from "@/lib/normalize";
import CampaignRollupTable from "@/components/CampaignRollupTable";
import CasualtyStrip from "@/components/CasualtyStrip";
import InfectedLedger, { InfectedSummary } from "@/components/InfectedLedger";
import TrendChart from "@/components/TrendChart";
import {
  CampaignMark,
  CustomTag,
  DedupeNotice,
  DifficultyStamp,
  Empty,
  FailureNotice,
  PageHeader,
  SectionHead,
  Stat,
  StatusTag,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Overview: every campaign across every run, in one place.
 *
 * This absorbed the old Analysis page. The ordering is deliberate and reads
 * top to bottom as one argument: what the log adds up to, what we have played
 * and how it went, what the pace looks like over time, and what the infection
 * has cost. The most recent run sits at the top because that is what you want
 * when you sit down straight after playing.
 */
export default async function OverviewPage() {
  const report = await getReport();
  const { store } = report;
  const all = allTimeMetrics(store);

  if (store.sessions.length === 0) {
    return (
      <main className="mx-auto max-w-[1400px] px-6 py-16">
        <FailureNotice failures={store.failures} />
        <div className="mt-8">
          <Empty
            title="No campaigns yet"
            body={`Nothing was found in ${pstatsDir()}. Point PSTATS_DIR at your game's ems/pstats folder, or drop some stats files in by hand.`}
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

  const rollups = campaignRollups(store, campaignLabel, difficultyRank);
  const repeated = rollups.filter((r) => r.runs > 1).length;

  // Every player record from every run: the ledger below is the whole log as
  // one fight rather than one campaign at a time.
  const infected = infectedBreakdown(store.sessions.flatMap((s) => s.totals));

  const latest = store.sessions[0]!;
  const latestMetrics = campaignMetrics(latest);

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 pb-24">
      <PageHeader
        eyebrow="Overview"
        title="Every campaign, across every run"
        lede={
          `${rollups.length} campaign${rollups.length === 1 ? "" : "s"} across ` +
          `${all.campaigns} run${all.campaigns === 1 ? "" : "s"}.` +
          (repeated === 0
            ? " Replay one to compare attempts against each other."
            : ` ${repeated} played more than once.`)
        }
      />

      {/* All-time figures. The summary line for everything below. */}
      <section className="rise grid grid-cols-2 gap-x-8 gap-y-9 border-b border-rule py-9 md:grid-cols-5">
        <Stat
          label="Campaigns"
          value={all.campaigns}
          sub={
            all.customCampaigns > 0
              ? `${all.officialCampaigns} official · ${all.customCampaigns} custom`
              : undefined
          }
          size="md"
        />
        <Stat
          label="Finales won"
          value={formatPercent(all.winRate)}
          sub={`${all.completed} of ${all.campaigns}`}
          tone="clear"
          size="md"
        />
        <Stat
          label="Time played"
          value={formatDuration(all.totalPlaytimeS)}
          size="md"
        />
        <Stat
          label="Infected killed"
          value={formatNumber(all.totalKills)}
          size="md"
        />
        <Stat
          label="Friendly fire"
          value={formatNumber(all.totalFfDamage)}
          sub="damage between teammates"
          tone="harm"
          size="md"
        />
      </section>

      {store.failures.length > 0 && (
        <div className="py-6">
          <FailureNotice failures={store.failures} />
        </div>
      )}
      {store.dropped.length > 0 && (
        <div className="py-6">
          <DedupeNotice dropped={store.dropped} />
        </div>
      )}

      {/* Most recent run. One row, not a hero block — the overview is about
          the whole log, and the run detail is one click away. */}
      <section className="py-9">
        <SectionHead
          label="Most recent run"
          note={
            <Link
              href="/campaigns"
              className="transition-colors hover:text-ink-dim"
            >
              All runs →
            </Link>
          }
        />
        <Link
          href={`/campaigns/${encodeURIComponent(latest.sessionId)}`}
          className="link-row block py-4"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex min-w-0 items-start gap-5">
              <CampaignMark
                campaign={latest.campaign}
                label={campaignLabel(latest.campaign, latest.official)}
                height={92}
                className="mt-1"
              />
              <div className="min-w-0">
                <h3 className="display text-[clamp(1.8rem,4vw,2.6rem)] text-ink">
                  {campaignLabel(latest.campaign, latest.official)}
                </h3>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <DifficultyStamp
                    raw={latest.difficulty}
                    label={latest.difficultyDisplay}
                    gamemode={latest.gamemode}
                    size="sm"
                  />
                  <StatusTag complete={latest.complete} wipes={latest.wipes} />
                  {!latest.official && <CustomTag />}
                  <span className="mono text-[0.7rem] text-ink-faint">
                    {formatDuration(latest.playtimeS)}
                  </span>
                  <span className="mono text-[0.7rem] text-ink-faint">
                    {formatNumber(latestMetrics.totalKills)} kills
                  </span>
                </div>
              </div>
            </div>
            <div className="self-center">
              <CasualtyStrip chapters={latestMetrics.chapterLoad} height={48} />
            </div>
          </div>
        </Link>
      </section>

      {/* The campaign table. Sortable and with the run list folded into each
          row, so "how does this campaign go for us" is answerable without
          leaving the page. */}
      <section className="py-9">
        <SectionHead
          label="By campaign"
          note="Most-played first · click a row to see its runs"
        />
        <CampaignRollupTable rollups={rollups} />
      </section>

      {all.trend.length > 1 && (
        <section className="py-9">
          <SectionHead
            label="Team kills per minute, by campaign"
            note="Oldest to newest"
          />
          <TrendChart points={all.trend} />
        </section>
      )}

      {/* What the infection cost, across the whole log. */}
      <section className="py-9">
        <SectionHead
          label="Infected, across every run"
          note={`${rollups.reduce((n, r) => n + r.chapters, 0)} chapters logged`}
        />
        <div className="space-y-8">
          <InfectedSummary breakdown={infected} />
          <InfectedLedger breakdown={infected} />
        </div>
      </section>

      {/* Who plays. The full per-player record lives under Survivors; this is
          the door to it, ranked by the one number everyone looks at first. */}
      <section className="py-9">
        <SectionHead
          label="Survivors"
          note={
            <Link
              href="/survivors"
              className="transition-colors hover:text-ink-dim"
            >
              Full records →
            </Link>
          }
        />
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {all.players.slice(0, 9).map((p) => (
            <Link
              key={p.key}
              href={`/players/${encodeURIComponent(p.key)}`}
              className="link-row flex items-baseline justify-between gap-4 border-b border-rule py-3"
            >
              <span className="min-w-0 truncate text-[0.88rem] text-ink">
                {p.label}
                {p.kind === "bot" && (
                  <span className="eyebrow ml-2 text-ink-faint">bot</span>
                )}
              </span>
              <span className="mono shrink-0 text-[0.78rem] text-ink-dim">
                {formatNumber(p.kills)}
                <span className="ml-1.5 text-ink-faint">kills</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
