"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CampaignRollup } from "@/lib/breakdowns";
import {
  formatDuration,
  formatNumber,
  formatPercent,
} from "@/lib/metrics";
import { CustomTag, DifficultyStamp } from "./ui";

/**
 * Every campaign, one row each, with its runs folded inside.
 *
 * The old analysis page put this table at the top and then repeated every
 * campaign again underneath as a stack of run lists, which meant scrolling
 * past the whole log to compare two rows of the table. Folding the runs into
 * their own row keeps both readings without the page growing with the log.
 *
 * Sorting is allowed here — unlike the chapter table, where order is the
 * sequence the run actually had, campaigns have no inherent order.
 */

type SortKey =
  | "label"
  | "runs"
  | "completionRate"
  | "chapters"
  | "playtimeS"
  | "kills"
  | "incaps"
  | "deaths"
  | "wipes";

const COLUMNS: {
  key: SortKey;
  label: string;
  title?: string;
}[] = [
  { key: "runs", label: "Runs" },
  { key: "completionRate", label: "Completed" },
  { key: "chapters", label: "Chapters" },
  { key: "playtimeS", label: "Time" },
  { key: "kills", label: "Kills" },
  { key: "incaps", label: "Incaps" },
  { key: "deaths", label: "Deaths" },
  { key: "wipes", label: "Wipes" },
];

export default function CampaignRollupTable({
  rollups,
}: {
  rollups: CampaignRollup[];
}) {
  const [sort, setSort] = useState<SortKey>("runs");
  const [asc, setAsc] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const sorted = [...rollups].sort((a, b) => {
      if (sort === "label") return a.label.localeCompare(b.label);
      const av = a[sort];
      const bv = b[sort];
      // A campaign never completed has a null rate; that is not a low rate,
      // so it sorts last either way.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (bv as number) - (av as number);
    });
    return asc ? sorted.reverse() : sorted;
  }, [rollups, sort, asc]);

  function toggle(key: SortKey) {
    if (key === sort) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(false);
    }
  }

  function ariaSort(key: SortKey): "ascending" | "descending" | "none" {
    if (key !== sort) return "none";
    return asc ? "ascending" : "descending";
  }

  if (rollups.length === 0) {
    return (
      <p className="py-6 text-[0.82rem] text-ink-mute">
        No campaigns recorded yet.
      </p>
    );
  }

  return (
    <div className="scroll-slim -mx-6 overflow-x-auto px-6">
      <table className="data-table w-full min-w-[920px]">
        <caption className="sr-only">
          Each campaign with runs, completion, time and casualties. Sortable,
          and each row expands to list its runs.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              aria-sort={ariaSort("label")}
              className="cursor-pointer select-none !text-left"
              onClick={() => toggle("label")}
            >
              Campaign
              <SortMark active={sort === "label"} asc={asc} />
            </th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                title={c.title}
                aria-sort={ariaSort(c.key)}
                className="cursor-pointer select-none"
                onClick={() => toggle(c.key)}
              >
                {c.label}
                <SortMark active={sort === c.key} asc={asc} />
              </th>
            ))}
            <th scope="col" className="!text-left">
              Hardest
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const expanded = open === r.campaign;
            return [
              <tr key={r.campaign}>
                <th scope="row" className="py-3 pr-3 text-left font-normal">
                  <button
                    onClick={() => setOpen(expanded ? null : r.campaign)}
                    aria-expanded={expanded}
                    className="flex items-center gap-2.5 text-left transition-colors hover:text-clear"
                  >
                    <span
                      aria-hidden
                      className={`mono shrink-0 text-[0.6rem] text-ink-faint transition-transform ${
                        expanded ? "rotate-90" : ""
                      }`}
                    >
                      ▶
                    </span>
                    <span className="text-[0.88rem] text-ink">{r.label}</span>
                    {!r.official && <CustomTag />}
                  </button>
                  <span className="mono mt-0.5 block pl-[1.1rem] text-[0.62rem] text-ink-faint">
                    {r.campaign}
                  </span>
                </th>
                <td className="mono py-3 text-[0.78rem] text-ink-dim">
                  {r.runs}
                </td>
                <td className="mono py-3 text-[0.78rem]">
                  <span
                    className={r.completed > 0 ? "text-clear" : "text-ink-mute"}
                  >
                    {r.completed}
                  </span>
                  <span className="ml-2 text-ink-faint">
                    {formatPercent(r.completionRate)}
                  </span>
                </td>
                <td className="mono py-3 text-[0.78rem] text-ink-dim">
                  {r.chapters}
                </td>
                <td className="mono py-3 text-[0.78rem] text-ink-dim">
                  {formatDuration(r.playtimeS)}
                </td>
                <td className="mono py-3 text-[0.78rem] text-ink-dim">
                  {formatNumber(r.kills)}
                </td>
                <td className="mono py-3 text-[0.78rem] text-ink-dim">
                  {r.incaps > 0 ? r.incaps : <Dash />}
                </td>
                <td
                  className={`mono py-3 text-[0.78rem] ${
                    r.deaths > 0 ? "text-harm" : "text-ink-faint"
                  }`}
                >
                  {r.deaths > 0 ? r.deaths : <Dash />}
                </td>
                <td
                  className={`mono py-3 text-[0.78rem] ${
                    r.wipes > 0 ? "text-harm" : "text-ink-faint"
                  }`}
                >
                  {r.wipes > 0 ? r.wipes : <Dash />}
                </td>
                <td className="py-3 !text-left">
                  <DifficultyStamp
                    raw={r.hardestDifficulty}
                    label={r.hardestDifficulty}
                    size="sm"
                  />
                </td>
              </tr>,

              expanded && (
                <tr key={`${r.campaign}-runs`} className="!bg-sunken">
                  <td colSpan={COLUMNS.length + 2} className="!text-left">
                    <ul className="divide-y divide-rule py-1">
                      {r.sessions.map((s) => {
                        const deaths = s.totals.reduce(
                          (n, p) => n + p.defense.deaths,
                          0,
                        );
                        return (
                          <li key={s.sessionId}>
                            <Link
                              href={`/campaigns/${encodeURIComponent(s.sessionId)}`}
                              className="link-row flex flex-wrap items-center gap-x-5 gap-y-2 py-2.5 pl-[1.1rem]"
                            >
                              <span className="mono text-[0.68rem] text-ink-faint">
                                {s.sessionId}
                              </span>
                              <span className="text-[0.78rem] text-ink-dim">
                                {s.chapters.length} chapter
                                {s.chapters.length === 1 ? "" : "s"}
                              </span>
                              <span className="mono text-[0.72rem] text-ink-mute">
                                {formatDuration(s.playtimeS)}
                              </span>
                              <DifficultyStamp
                                raw={s.difficulty}
                                label={s.difficultyDisplay}
                                gamemode={s.gamemode}
                                size="sm"
                              />
                              <span
                                className={`eyebrow ${
                                  s.complete ? "text-clear" : "text-ink-mute"
                                }`}
                              >
                                {s.complete ? "Complete" : "Unfinished"}
                              </span>
                              {deaths > 0 && (
                                <span className="eyebrow text-harm">
                                  {deaths} death{deaths === 1 ? "" : "s"}
                                </span>
                              )}
                              {s.wipes > 0 && (
                                <span className="eyebrow text-harm">
                                  {s.wipes} wipe{s.wipes === 1 ? "" : "s"}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortMark({ active, asc }: { active: boolean; asc: boolean }) {
  return (
    <span
      className={`ml-1 inline-block transition-opacity ${
        active ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden
    >
      {asc ? "↑" : "↓"}
    </span>
  );
}

/** A missing value is an em dash, never a zero. They are different claims. */
function Dash() {
  return <span className="text-ink-faint">—</span>;
}
