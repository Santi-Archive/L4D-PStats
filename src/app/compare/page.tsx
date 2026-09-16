import Link from "next/link";
import { getReport } from "@/lib/data.server";
import {
  allTimeMetrics,
  formatDuration,
  formatMaybe,
  formatNumber,
  formatPercent,
  type AggregatePlayer,
} from "@/lib/metrics";
import { infectedLabel, throwableBreakdown } from "@/lib/breakdowns";
import { Empty, PageHeader, SectionHead } from "@/components/ui";
import CompareControls, {
  type CompareOption,
} from "@/components/CompareControls";
import CompareTable from "@/components/CompareTable";
import { tally, type CompareGroup, type CompareRow } from "@/lib/compare";
import type { StatsStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Two players, side by side.
 *
 * The player page answers "how does this person play"; this one answers
 * "which of these two is better at what", which the roster table can only
 * approximate by making you scan two rows twenty columns wide.
 *
 * Both sides are career totals over every run each player appears in -- NOT
 * over the runs they share. Restricting to shared runs would be a different
 * and much smaller question, and the header says which one is on screen.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const { store } = await getReport();
  const all = allTimeMetrics(store);

  const options: CompareOption[] = all.players.map((p) => ({
    key: p.key,
    label: p.label,
    kind: p.kind,
    campaigns: p.campaigns,
  }));

  const keyA = firstParam(sp["a"]);
  const keyB = firstParam(sp["b"]);
  // A key from the query string is untrusted: it can name someone who has
  // since been filtered out of the store, so it is resolved rather than
  // assumed. An unknown key reads as "nothing picked", not as an error.
  const a = all.players.find((p) => p.key === keyA) ?? null;
  const b = all.players.find((p) => p.key === keyB) ?? null;

  if (all.players.length < 2) {
    return (
      <main className="mx-auto w-full max-w-[1400px] px-6 pb-24">
        <PageHeader eyebrow="Compare" title="Not enough players yet" />
        <div className="py-12">
          <Empty
            title="Two players are needed"
            body="A comparison needs two records. Play another campaign, or load more files."
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

  const groups = a && b ? buildGroups(store, a, b) : null;
  const score = groups ? tally(groups) : null;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 pb-24">
      <PageHeader
        eyebrow="Compare"
        title={a && b ? `${a.label} vs ${b.label}` : "Pick two players"}
        lede={
          a && b
            ? "Career totals across every run each player appears in, not only the runs they played together."
            : "Choose a player on each side to put their records against each other."
        }
      />

      <section className="border-b border-rule py-7">
        <CompareControls options={options} a={a?.key ?? null} b={b?.key ?? null} />
      </section>

      {!groups || !a || !b || !score ? (
        <div className="py-14">
          <Empty
            title={a || b ? "One more to go" : "Nobody selected"}
            body={
              a || b
                ? `${(a ?? b)!.label} is ready. Pick someone on the other side to see the comparison.`
                : "Use the two selectors above. The comparison appears here, and the page address holds your picks so it can be shared."
            }
          />
        </div>
      ) : (
        <>
          {/* The headline is the tally, because the table below is long
              enough that "who won more rows" is genuinely hard to see by
              eye — and it is stated as a row count rather than a verdict,
              since the rows are not weighted against each other. */}
          <section className="rise grid grid-cols-3 items-end gap-6 border-b border-rule py-7">
            <Side player={a} led={score.a} total={score.a + score.b} align="left" />
            <div className="text-center">
              <div className="eyebrow text-ink-faint">leads</div>
              <div className="mono mt-1 text-[0.7rem] text-ink-mute">
                {score.a === score.b
                  ? "dead even"
                  : `${score.a > score.b ? a.label : b.label} ahead`}
              </div>
            </div>
            <Side player={b} led={score.b} total={score.a + score.b} align="right" />
          </section>

          <section className="py-8">
            <SectionHead
              label="Head to head"
              note="Leading side marked on each row"
            />
            <CompareTable groups={groups} labelA={a.label} labelB={b.label} />
          </section>

          <p className="max-w-3xl text-[0.75rem] leading-relaxed text-ink-mute">
            Rows are counted, not weighted: leading on ten small rows is not
            the same as leading on the one that matters to you. Rates depend
            on how much each player has played, and a metric neither player
            has data for is a tie rather than a zero.
          </p>
        </>
      )}
    </main>
  );
}

/** One player's side of the headline. */
function Side({
  player,
  led,
  total,
  align,
}: {
  player: AggregatePlayer;
  led: number;
  total: number;
  align: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <Link
        href={`/players/${encodeURIComponent(player.key)}`}
        className="display text-[clamp(1.1rem,2.2vw,1.6rem)] text-ink transition-colors hover:text-clear"
      >
        {player.label}
      </Link>
      <div className="metric mt-1.5 text-[1.9rem] text-ink">{led}</div>
      <div className="mono mt-0.5 text-[0.68rem] text-ink-faint">
        of {total} row{total === 1 ? "" : "s"} · {player.campaigns} campaign
        {player.campaigns === 1 ? "" : "s"}
      </div>
    </div>
  );
}

/** First value of a query param that may repeat. */
function firstParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function ratioOf(n: number, d: number): number | null {
  if (d <= 0) return null;
  return n / d;
}

function row(
  label: string,
  better: CompareRow["better"],
  a: number | null,
  b: number | null,
  format: (v: number) => string,
  extra: Partial<CompareRow> = {},
): CompareRow {
  return {
    label,
    better,
    aValue: a,
    bValue: b,
    a: a === null ? "—" : format(a),
    b: b === null ? "—" : format(b),
    ...extra,
  };
}

/**
 * Every row of the comparison.
 *
 * Grouped the way the player page is: what they did, what happened to them,
 * what they spent. Each row declares its own direction — see `CompareTable`
 * for why nothing is assumed to be better when larger.
 */
function buildGroups(
  store: StatsStore,
  a: AggregatePlayer,
  b: AggregatePlayer,
): CompareGroup[] {
  const itemsA = playerItems(store, a.key);
  const itemsB = playerItems(store, b.key);
  const sharedCount = sharedSessions(store, a.key, b.key).length;

  return [
    {
      label: "Scope",
      rows: [
        row("Campaigns", "none", a.campaigns, b.campaigns, formatNumber, {
          title: "Runs this player appears in",
          aSub: sharedCount > 0 ? `${sharedCount} shared` : undefined,
          bSub: sharedCount > 0 ? `${sharedCount} shared` : undefined,
        }),
        row("Time played", "none", a.playtimeS, b.playtimeS, formatDuration),
        row("Chapters", "none", a.chaptersPlayed, b.chaptersPlayed, formatNumber),
      ],
    },
    {
      label: "Killing",
      rows: [
        row("Kills", "high", a.kills, b.kills, formatNumber),
        row("Kills / min", "high", a.killsPerMinute, b.killsPerMinute, (v) =>
          v.toFixed(2),
        ),
        row("Special kills", "high", a.specialKills, b.specialKills, formatNumber, {
          title:
            "Smoker, boomer, hunter, spitter, jockey, charger, tank and witch",
          aSub: `${formatPercent(ratioOf(a.specialKills, a.kills), 1)} of kills`,
          bSub: `${formatPercent(ratioOf(b.specialKills, b.kills), 1)} of kills`,
        }),
        row("Common kills", "high", a.commonKills, b.commonKills, formatNumber),
        row("Headshot rate", "high", a.headshotRate, b.headshotRate, (v) =>
          formatPercent(v, 1),
        {
          title:
            "Headshots divided by kills. The two tables are keyed independently, so treat as approximate.",
          aSub: `${formatNumber(a.headshots)} headshots`,
          bSub: `${formatNumber(b.headshots)} headshots`,
        }),
        row("Damage dealt", "high", a.damageDealt, b.damageDealt, formatNumber),
      ],
    },
    {
      label: "Staying alive",
      rows: [
        row("Deaths", "low", a.deaths, b.deaths, formatNumber),
        row("Incaps", "low", a.incaps, b.incaps, formatNumber),
        row("Damage taken", "low", a.damageTaken, b.damageTaken, formatNumber),
        row("Clean chapters", "high", a.cleanRate, b.cleanRate, (v) =>
          formatPercent(v, 0),
        {
          title: "Chapters this player finished with no incap and no death",
          aSub: `${a.cleanChapters} of ${a.chaptersPlayed}`,
          bSub: `${b.cleanChapters} of ${b.chaptersPlayed}`,
        }),
        // Not a number, so it is stated rather than run through `row`: there
        // is no direction in which "hunter" beats "charger".
        {
          label: "Worst threat",
          title: "The infected type that did this player the most harm",
          better: "none",
          aValue: null,
          bValue: null,
          a: a.topThreat ? infectedLabel(a.topThreat.key) : "—",
          b: b.topThreat ? infectedLabel(b.topThreat.key) : "—",
        },
      ],
    },
    {
      label: "Supporting",
      rows: [
        row("Revives given", "high", a.revivesGiven, b.revivesGiven, formatNumber),
        row("Times revived", "low", a.timesRevived, b.timesRevived, formatNumber),
        // Deliberately no better direction. Spending a kit can mean
        // carelessness or good self-management and the data cannot tell
        // which, so the counts are shown and neither side is awarded it.
        row("Medkits used", "none", a.medkits, b.medkits, formatNumber, {
          title: "First aid kits spent",
          aSub: `${formatMaybe(ratioOf(a.medkits, a.campaigns), 1)} per campaign`,
          bSub: `${formatMaybe(ratioOf(b.medkits, b.campaigns), 1)} per campaign`,
        }),
        row("Throwables used", "none", itemsA.thrown, itemsB.thrown, formatNumber, {
          title: "Pipe bombs, molotovs and bile bombs",
        }),
        row("Pills & adrenaline", "none", itemsA.pickMeUps, itemsB.pickMeUps, formatNumber),
      ],
    },
    {
      label: "Friendly fire",
      rows: [
        row("FF damage", "low", a.ffDamage, b.ffDamage, formatNumber),
        row("FF per hour", "low", a.ffPerHour, b.ffPerHour, (v) => v.toFixed(0), {
          title: "Friendly fire damage per hour of this player's own playtime",
        }),
        row("Teammates incapped", "low", a.ffIncaps, b.ffIncaps, formatNumber),
        row("Teammates killed", "low", a.ffKills, b.ffKills, formatNumber),
      ],
    },
  ];
}

/** Sessions both players appear in. Context for the scope note. */
function sharedSessions(store: StatsStore, a: string, b: string) {
  return store.sessions.filter((s) => s.totalsByKey[a] && s.totalsByKey[b]);
}

/**
 * Item totals for one player.
 *
 * `AggregatePlayer` folds the open stat tables, but `items_used` is read
 * through `throwableBreakdown` everywhere else in the app, so it is read
 * that way here too rather than being summed a second, divergent way.
 */
function playerItems(store: StatsStore, key: string) {
  const records = store.sessions
    .map((s) => s.totalsByKey[key])
    .filter((p): p is NonNullable<typeof p> => p !== undefined);
  const bd = throwableBreakdown(records);
  const pickMeUps = bd.consumables
    .filter((r) => r.key === "pain_pills" || r.key === "adrenaline")
    .reduce((n, r) => n + r.count, 0);
  return { thrown: bd.totalThrown, pickMeUps };
}
