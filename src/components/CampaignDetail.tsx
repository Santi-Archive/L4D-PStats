"use client";

import { useState } from "react";
import type { NormalizedSession } from "@/lib/normalize";
import {
  type CampaignMetrics,
  type PlayerMetrics,
  chapterLabel,
  chapterLoad,
  formatDate,
  formatDuration,
  formatDurationPrecise,
  formatMaybe,
  formatNumber,
  playerMetrics,
} from "@/lib/metrics";
import {
  campaignAnalysis,
  chapterAnalysis,
  infectedBreakdown,
  playerIncidents,
  playerInfectedBreakdowns,
  playerThrowableBreakdowns,
  playerWeaponBreakdowns,
  throwableBreakdown,
  weaponBreakdown,
} from "@/lib/breakdowns";
import CasualtyStrip, { CasualtyLegend } from "./CasualtyStrip";
import ChapterAnalysisTable from "./ChapterAnalysis";
import InfectedLedger, { InfectedSummary } from "./InfectedLedger";
import { ThrowablePanel, WeaponPanel } from "./LoadoutPanels";
import PlayerIncidentBreakdown from "./PlayerIncidentBreakdown";
import PlayerInfectedBreakdown from "./PlayerInfectedBreakdown";
import {
  PlayerItemBreakdown,
  PlayerWeaponBreakdown,
} from "./PlayerLoadoutBreakdown";
import PlayerTable from "./PlayerTable";
import {
  CampaignMark,
  ChapterStill,
  Crumb,
  CustomTag,
  DifficultyStamp,
  OutcomeTag,
  SectionHead,
  Stat,
  StatusTag,
} from "./ui";

/**
 * Campaign detail. Header, chapter tabs, and a campaign-totals tab.
 *
 * Chapter views are computed from `chapters` directly and the totals tab
 * from the recomputed campaign totals -- never by re-summing totals
 * (PLAN.md section 1.3).
 */
export default function CampaignDetail({
  session,
  metrics,
  title,
}: {
  session: NormalizedSession;
  metrics: CampaignMetrics;
  title: string;
}) {
  // -1 is the campaign-totals tab.
  const [tab, setTab] = useState<number>(-1);
  const [view, setView] = useState<ViewKey>("roster");
  // Null is the whole team. Selecting a player focuses every table below on
  // them without hiding the rest -- see `ScopeViews`.
  const [selected, setSelected] = useState<string | null>(null);
  const chapter = tab >= 0 ? session.chapters[tab] : null;

  const players = chapter
    ? chapter.players.map(playerMetrics)
    : metrics.players;

  // The raw records, not the metrics view: the breakdowns read the open
  // stat tables directly, and a chapter scope must use that chapter's
  // records rather than the campaign totals.
  const rosterPlayers = chapter ? chapter.players : session.totals;
  const analysis = chapter
    ? chapterAnalysis(chapter)
    : campaignAnalysis(session);

  // A selected player who never played this chapter has no row here. That is
  // a real state (joined late, left early), so it is reported rather than
  // silently falling back to the team -- see the notice below.
  const focused = selected
    ? (players.find((p) => p.key === selected) ?? null)
    : null;
  const missingHere = selected !== null && focused === null;

  // The headline numbers follow the selection: with a player focused these
  // are that player's, not the team's, so the stats and the tables underneath
  // never describe two different things at once.
  const counted = focused ? [focused] : players;
  const scopeKills = counted.reduce((a, p) => a + p.kills, 0);
  const scopeIncaps = counted.reduce((a, p) => a + p.incaps, 0);
  const scopeDeaths = counted.reduce((a, p) => a + p.deaths, 0);
  const scopeFf = counted.reduce((a, p) => a + p.ffDamage, 0);
  // Play time is the one stat that does not sum: a player's own time in the
  // scope is theirs, while the team's is the wall clock, not four times it.
  const scopeTime = focused
    ? focused.playtimeS
    : chapter
      ? chapter.playtime_s
      : session.playtimeS;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 pb-24">
      <div className="pt-8">
        <Crumb href="/campaigns" label="All campaigns" />
      </div>

      {/* Header */}
      <header className="rise border-b border-rule py-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          {/* The poster is the one full-size image in the app. It earns the
              room here because this page is about one campaign and nothing
              else, and it is the fastest way to know which run you opened.
              It is hidden on narrow screens, where the width belongs to the
              numbers. */}
          <div className="flex items-end gap-6">
            <CampaignMark
              campaign={session.campaign}
              label={title}
              height={148}
              className="hidden sm:block"
            />
            <div>
              <h1 className="display text-[clamp(2.2rem,5.5vw,4rem)] text-ink">
                {title}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                <DifficultyStamp
                  raw={session.difficulty}
                  label={session.difficultyDisplay}
                  gamemode={session.gamemode}
                />
                <StatusTag complete={session.complete} wipes={session.wipes} />
                {!session.official && <CustomTag />}
                <span className="mono text-[0.7rem] text-ink-faint">
                  {session.gamemode}
                </span>
                <span className="mono text-[0.7rem] text-ink-faint">
                  {formatDate(session.startedUtc)}
                </span>
                {session.timeApproximate && (
                  <span
                    className="eyebrow text-ink-faint"
                    title="This file had no wall-clock timestamp, so its position in time is inferred from its session id."
                  >
                    time approximate
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-6">
            <Stat
              label="Duration"
              value={formatDuration(session.playtimeS)}
              size="sm"
            />
            <Stat
              label="Chapters"
              value={metrics.chapterCount}
              sub={
                metrics.retriedChapters > 0
                  ? `${metrics.retriedChapters} replayed`
                  : undefined
              }
              size="sm"
            />
            <Stat
              label="Team kills"
              value={formatNumber(metrics.totalKills)}
              size="sm"
            />
            <Stat
              label="Incaps"
              value={formatNumber(metrics.totalIncaps)}
              size="sm"
            />
            <Stat
              label="Deaths"
              value={formatNumber(metrics.totalDeaths)}
              tone={metrics.totalDeaths > 0 ? "harm" : "neutral"}
              size="sm"
            />
          </div>
        </div>

        <div className="mt-8">
          <CasualtyStrip chapters={metrics.chapterLoad} height={64} />
        </div>
        <div className="mt-5">
          <CasualtyLegend />
        </div>

        {/* Roster line. Bots marked, departures visible via playtime.
            Each name is a filter: clicking one focuses every table below on
            that player, clicking it again clears. */}
        <div className="mt-7 flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="eyebrow mr-3">Roster</span>
          {metrics.players.map((p) => {
            const partial = p.playtimeS < session.playtimeS * 0.95;
            const active = selected === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setSelected(active ? null : p.key)}
                aria-pressed={active}
                className={`flex items-baseline gap-1.5 border px-2.5 py-1 text-[0.82rem] transition-colors ${
                  active
                    ? "border-rule-bright bg-raised"
                    : "border-transparent hover:border-rule hover:bg-raised/50"
                }`}
                title={
                  partial
                    ? `Played ${formatDuration(p.playtimeS)} of ${formatDuration(session.playtimeS)}`
                    : `Show only ${p.label}`
                }
              >
                <span
                  className={
                    p.kind === "bot"
                      ? "text-ink-mute"
                      : active
                        ? "text-ink"
                        : "text-ink-dim"
                  }
                >
                  {p.label}
                </span>
                {p.character && (
                  <span className="mono text-[0.62rem] text-ink-faint">
                    {p.character}
                  </span>
                )}
                {p.kind === "bot" && (
                  <span className="eyebrow text-ink-faint">bot</span>
                )}
                {partial && p.kind !== "bot" && (
                  <span className="eyebrow text-harm/70">
                    {formatDuration(p.playtimeS)}
                  </span>
                )}
              </button>
            );
          })}
          {selected !== null && (
            <button
              onClick={() => setSelected(null)}
              className="eyebrow ml-2 px-2 py-1 text-ink-mute transition-colors hover:text-ink-dim"
            >
              Clear filter
            </button>
          )}
        </div>
      </header>

      {/* Chapter tabs. Chapters are a real sequence, so numbering earns it. */}
      <div
        className="scroll-slim -mx-6 mt-8 overflow-x-auto px-6"
        role="tablist"
        aria-label="Chapters"
      >
        <div className="flex min-w-max gap-px border-b border-rule">
          <TabButton
            active={tab === -1}
            onClick={() => setTab(-1)}
            label="Campaign totals"
            sub={`${metrics.chapterCount} chapters`}
          />
          {session.chapters.map((c, i) => {
            const load = chapterLoad(c);
            return (
              <TabButton
                key={`${c.index}-${c.map}`}
                active={tab === i}
                onClick={() => setTab(i)}
                index={c.index}
                label={chapterLabel(c.map)}
                sub={formatDuration(c.playtime_s)}
                outcome={c.outcome}
                harm={load.deaths > 0}
              />
            );
          })}
        </div>
      </div>

      {/* Scope summary for the selected tab */}
      <section className="py-8">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
          {/* Aligned to the top of the still rather than its baseline: the
              text beside it is three stacked rows, not one line, so a
              baseline match left the eyebrow floating and the outcome tag
              hanging below the image. Top alignment gives the block a
              shared edge with the art at any text length. */}
          <div className="flex items-start gap-5">
            {/* The chapter's own loading screen, so the selected tab is
                recognisable as a place and not just a name. Only chapters
                have one -- the campaign-totals tab is not a place. */}
            {chapter && (
              <ChapterStill
                map={chapter.map}
                label={chapterLabel(chapter.map)}
                width={168}
                className="hidden sm:block"
              />
            )}
            <div className="min-w-0">
              <div className="eyebrow">
                {chapter ? `Chapter ${chapter.index}` : "Whole campaign"}
                {focused && ` · ${focused.label} only`}
              </div>
              <h2 className="display mt-1.5 text-[1.8rem] leading-tight text-ink">
                {chapter ? chapterLabel(chapter.map) : "Campaign totals"}
              </h2>
              {chapter && (
                /* Outcome, engine name and the replay count. These wrap as
                   a group instead of riding one line, so a long map name
                   or a replayed chapter never pushes a tag out of view. */
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <OutcomeTag
                    outcome={chapter.outcome}
                    raw={chapter.outcomeRaw}
                  />
                  {chapter.round_starts > 1 && (
                    <span className="eyebrow text-harm">
                      replayed {chapter.round_starts}×
                    </span>
                  )}
                  <span
                    className="mono truncate text-[0.68rem] text-ink-faint"
                    title="Engine map name"
                  >
                    {chapter.map}
                  </span>
                </div>
              )}
              {missingHere && (
                <p className="mt-3 max-w-md text-[0.78rem] leading-relaxed text-ink-mute">
                  That player has no record in this chapter, so the numbers below
                  are the whole team&rsquo;s. They may have joined later or left
                  before it started.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-9 gap-y-5">
            <Stat
              label="Time"
              value={formatDurationPrecise(scopeTime)}
              size="sm"
            />
            <Stat label="Kills" value={formatNumber(scopeKills)} size="sm" />
            <Stat label="Incaps" value={formatNumber(scopeIncaps)} size="sm" />
            <Stat
              label="Deaths"
              value={formatNumber(scopeDeaths)}
              tone={scopeDeaths > 0 ? "harm" : "neutral"}
              size="sm"
            />
            <Stat
              label="FF damage"
              value={formatNumber(scopeFf)}
              tone={scopeFf > 0 ? "harm" : "neutral"}
              size="sm"
            />
          </div>
        </div>
      </section>

      {/* Breakdowns for the selected scope */}
      <ScopeViews
        view={view}
        setView={setView}
        players={players}
        rosterPlayers={rosterPlayers}
        scopeLabel={chapter ? chapterLabel(chapter.map) : "the campaign"}
        chapterCount={chapter ? 1 : metrics.chapterCount}
        weaponAttribution={session.weaponAttribution}
        analysis={analysis}
        isChapter={chapter !== null}
        selected={focused ? focused.key : null}
        onSelect={setSelected}
      />

    </main>
  );
}

function TabButton({
  active,
  onClick,
  label,
  sub,
  index,
  outcome,
  harm,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
  index?: number;
  outcome?: string;
  harm?: boolean;
}) {
  const accent =
    outcome === "wipe"
      ? "border-t-harm"
      : outcome === "finale_win"
        ? "border-t-clear"
        : "border-t-transparent";

  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-w-[8.5rem] border-t-2 px-4 py-3 text-left transition-colors ${accent} ${
        active
          ? "bg-raised text-ink"
          : "text-ink-mute hover:bg-raised/60 hover:text-ink-dim"
      }`}
    >
      <div className="flex items-baseline gap-2">
        {index !== undefined && (
          <span className="mono text-[0.6rem] text-ink-faint">
            {String(index).padStart(2, "0")}
          </span>
        )}
        <span className="truncate text-[0.85rem]">{label}</span>
      </div>
      <div className="mono mt-1 flex items-center gap-1.5 text-[0.62rem] text-ink-faint">
        {sub}
        {harm && <span className="text-harm">●</span>}
      </div>
    </button>
  );
}

//---------------------------------------------------------------------
// Breakdown views
//---------------------------------------------------------------------

type ViewKey = "roster" | "infected" | "chapters" | "loadout";

/**
 * The breakdowns, behind one row of view switches.
 *
 * These are alternative readings of the same scope rather than a sequence,
 * so they are named, not numbered — the numbering on the chapter tabs above
 * means something (chapters really are ordered) and reusing it here would
 * make it decorative.
 *
 * The chapter view is hidden while a single chapter is selected: comparing
 * one chapter against itself is not a comparison.
 */
function ScopeViews({
  view,
  setView,
  players,
  rosterPlayers,
  scopeLabel,
  chapterCount,
  weaponAttribution,
  analysis,
  isChapter,
  selected,
  onSelect,
}: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  players: PlayerMetrics[];
  rosterPlayers: NormalizedSession["totals"];
  scopeLabel: string;
  chapterCount: number;
  weaponAttribution?: NormalizedSession["weaponAttribution"];
  analysis: ReturnType<typeof campaignAnalysis> | ReturnType<typeof chapterAnalysis>;
  isChapter: boolean;
  /** Focused player, or null for the whole team. */
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const infected = infectedBreakdown(rosterPlayers);
  const throwables = throwableBreakdown(rosterPlayers, chapterCount);
  const weapons = weaponBreakdown(rosterPlayers, weaponAttribution ?? null);
  const chapters = "chapters" in analysis ? analysis.chapters : [];

  // The same breakdowns split per player. Splits of one arithmetic, not a
  // second one, so every per-player table sums to the total above it.
  const byPlayerInfected = playerInfectedBreakdowns(rosterPlayers);
  const byPlayerIncidents = playerIncidents(rosterPlayers);
  const byPlayerItems = playerThrowableBreakdowns(rosterPlayers, chapterCount);
  const byPlayerWeapons = playerWeaponBreakdowns(
    rosterPlayers,
    weaponAttribution ?? null,
  );

  const views: { key: ViewKey; label: string; note: string }[] = [
    { key: "roster", label: "Roster", note: `${players.length} survivors` },
    {
      key: "infected",
      label: "Infected",
      note: `${infected.totalSpecialKills} specials`,
    },
    ...(isChapter
      ? []
      : [
          {
            key: "chapters" as const,
            label: "Chapters",
            note: `${chapters.length} played`,
          },
        ]),
    {
      key: "loadout",
      label: "Weapons & items",
      note: weapons.perWeaponAvailable
        ? `${weapons.all.length} weapon${weapons.all.length === 1 ? "" : "s"}`
        : `${formatNumber(weapons.shotsFired)} shots`,
    },
  ];

  // A chapter scope has no chapter comparison, so a stale selection must
  // fall back rather than render nothing.
  const active = views.some((v) => v.key === view) ? view : "roster";

  return (
    <div className="mt-4">
      <div
        className="scroll-slim -mx-6 overflow-x-auto px-6"
        role="tablist"
        aria-label="Breakdown"
      >
        <div className="flex min-w-max gap-6 border-b border-rule">
          {views.map((v) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={active === v.key}
              onClick={() => setView(v.key)}
              className={`relative -mb-px border-b-2 pb-2.5 text-left transition-colors ${
                active === v.key
                  ? "border-b-ink text-ink"
                  : "border-b-transparent text-ink-mute hover:text-ink-dim"
              }`}
            >
              <span className="text-[0.85rem]">{v.label}</span>
              <span className="mono ml-2 text-[0.62rem] text-ink-faint">
                {v.note}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-8">
        {active === "roster" && (
          <PlayerTable
            players={players}
            selected={selected}
            onSelect={onSelect}
          />
        )}

        {active === "infected" && (
          <div className="space-y-8">
            <InfectedSummary breakdown={infected} />
            <InfectedLedger breakdown={infected} />

            {/* Who handled what. The ledger above is the team's fight; this
                is the same fight attributed to the people in it. */}
            <section className="pt-2">
              <SectionHead
                label="By player"
                note="Specials first — common kills track trigger time"
              />
              <PlayerInfectedBreakdown
                rows={byPlayerInfected}
                selected={selected}
              />
            </section>

            {/* The same fight from the other side: not who killed what, but
                who the infection actually landed on. */}
            <section className="pt-2">
              <SectionHead
                label="What happened to them"
                note="Grabs, incaps and deaths per player"
              />
              <PlayerIncidentBreakdown
                rows={byPlayerIncidents}
                selected={selected}
              />
            </section>

            <p className="text-[0.78rem] leading-relaxed text-ink-faint">
              Pins count hunter pounces, smoker tongues, jockey rides and
              charger carries. Breaking free without help is counted
              separately, so a pin is never double-counted as its own escape.
              Per-player rows sum to the team totals above them.
            </p>
          </div>
        )}

        {active === "chapters" && (
          <div className="space-y-6">
            <ChapterAnalysisTable chapters={chapters} />
            <p className="text-[0.78rem] leading-relaxed text-ink-faint">
              Rates are per minute of that chapter&rsquo;s own play time, so a
              short brutal chapter and a long quiet one stay comparable.
              Chapters keep their play order; sorting them would destroy the
              sequence the run actually had.
            </p>
          </div>
        )}

        {active === "loadout" && (
          <div className="space-y-12">
            <div className="grid gap-12 lg:grid-cols-2">
              <section>
                <SectionHead
                  label="Throwables & items"
                  note={`Used across ${scopeLabel}`}
                />
                <ThrowablePanel breakdown={throwables} />
              </section>
              <section>
                <SectionHead
                  label="Weapons"
                  note={
                    weapons.perWeaponAvailable ? "Per weapon" : "Totals only"
                  }
                />
                <WeaponPanel
                  breakdown={weapons}
                  thrown={throwables.throwables}
                />
              </section>
            </div>

            {/* One player usually carries every pipe bomb, and the team
                weapon total hides two people on completely different guns. */}
            <section>
              <SectionHead
                label="Items by player"
                note="Who actually spent them"
              />
              <PlayerItemBreakdown rows={byPlayerItems} selected={selected} />
            </section>

            <section>
              <SectionHead
                label="Shooting by player"
                note={
                  weapons.perWeaponAvailable
                    ? "Each player's own top weapons"
                    : "Totals only — these files predate per-weapon tracking"
                }
              />
              <PlayerWeaponBreakdown
                rows={byPlayerWeapons}
                perWeaponAvailable={weapons.perWeaponAvailable}
                selected={selected}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
