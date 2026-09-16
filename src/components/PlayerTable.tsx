"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { survivorPortrait } from "@/lib/art";
import {
  formatMaybe,
  formatNumber,
  formatPercent,
  formatDuration,
  type PlayerMetrics,
} from "@/lib/metrics";
import { BotTag, SurvivorMark, rowFocus } from "./ui";

/**
 * The shared per-player table. Sortable, bots toggleable (PLAN.md section 5).
 *
 * Right-aligned numbers, tabular figures, no vertical rules, hover highlight.
 * A column whose value cannot exist shows an em dash rather than a zero --
 * "no shots fired" and "0% accuracy" are different claims.
 */

type SortKey =
  | "label"
  | "kills"
  | "killsPerMinute"
  | "headshotRate"
  | "damageDealt"
  | "damageTaken"
  | "deaths"
  | "incaps"
  | "revivesGiven"
  | "ffDamage"
  | "playtimeS";

interface Column {
  key: SortKey;
  label: string;
  title?: string;
  render: (p: PlayerMetrics) => React.ReactNode;
  /** `rows` is the visible set, so a tone can be relative to the table. */
  tone?: (p: PlayerMetrics, rows: PlayerMetrics[]) => string;
}

const COLUMNS: Column[] = [
  {
    key: "kills",
    label: "Kills",
    render: (p) => formatNumber(p.kills),
  },
  {
    key: "killsPerMinute",
    label: "K/min",
    render: (p) => formatMaybe(p.killsPerMinute, 1),
  },
  {
    key: "headshotRate",
    label: "HS%",
    title: "Headshots divided by kills. Both tables are keyed independently, so treat as approximate.",
    render: (p) => formatPercent(p.headshotRate),
  },
  {
    key: "damageDealt",
    label: "Dmg dealt",
    title: "Total damage dealt to infected across this scope",
    render: (p) => (p.damageDealt > 0 ? formatNumber(p.damageDealt) : "—"),
    tone: (p) => (p.damageDealt > 0 ? "text-ink-dim" : "text-ink-faint"),
  },
  {
    key: "damageTaken",
    label: "Dmg taken",
    title: "Total damage this player received",
    render: (p) => (p.damageTaken > 0 ? formatNumber(p.damageTaken) : "—"),
    // Damage taken is the cost side of the row, so it carries the harm tone
    // — but only at the top of the range, the same rule friendly fire uses.
    // Everyone takes chip damage; colouring all of it red says nothing.
    tone: (p, rows) => {
      if (p.damageTaken === 0) return "text-ink-faint";
      const worst = Math.max(...rows.map((r) => r.damageTaken));
      return p.damageTaken >= worst * 0.5 ? "text-harm/85" : "text-ink-dim";
    },
  },
  {
    key: "deaths",
    label: "Deaths",
    render: (p) => formatNumber(p.deaths),
    tone: (p) => (p.deaths > 0 ? "text-harm" : "text-ink-faint"),
  },
  {
    key: "incaps",
    label: "Incaps",
    render: (p) => formatNumber(p.incaps),
    tone: (p) => (p.incaps > 0 ? "text-ink" : "text-ink-faint"),
  },
  {
    key: "revivesGiven",
    label: "Revives",
    title: "Revives given to teammates",
    render: (p) => formatNumber(p.revivesGiven),
  },
  {
    key: "ffDamage",
    label: "FF dmg",
    title: "Friendly fire damage dealt",
    render: (p) => formatNumber(p.ffDamage),
    // Everyone clips a teammate eventually, so colouring every non-zero row
    // red says nothing. Only the worst half of the range gets the warm tone.
    tone: (p, rows) => {
      if (p.ffDamage === 0) return "text-ink-faint";
      const worst = Math.max(...rows.map((r) => r.ffDamage));
      return p.ffDamage >= worst * 0.5 ? "text-harm" : "text-ink-dim";
    },
  },
  {
    key: "playtimeS",
    label: "Time",
    render: (p) => formatDuration(p.playtimeS),
  },
];

export default function PlayerTable({
  players,
  linkPlayers = true,
  showCampaigns = false,
  selected = null,
  onSelect,
}: {
  /**
   * Rows may carry a `campaigns` count (AggregatePlayer does); the column is
   * only shown when `showCampaigns` is set. Kept as a data field rather than
   * a render callback so this stays serializable across the server boundary.
   */
  players: (PlayerMetrics & { campaigns?: number })[];
  linkPlayers?: boolean;
  showCampaigns?: boolean;
  /** Focused player. Teammates stay visible but recede. */
  selected?: string | null;
  /**
   * When given, a row is also a filter control. Omitted on the pages where
   * there is nothing to filter (the all-time roster), and the table stays a
   * plain table there rather than growing dead click targets.
   */
  onSelect?: (key: string | null) => void;
}) {
  const [sort, setSort] = useState<SortKey>("kills");
  const [asc, setAsc] = useState(false);
  const [showBots, setShowBots] = useState(true);

  const hasBots = players.some((p) => p.kind === "bot");

  const rows = useMemo(() => {
    const filtered = showBots
      ? players
      : players.filter((p) => p.kind !== "bot");
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "label") return a.label.localeCompare(b.label);
      const av = a[sort];
      const bv = b[sort];
      // Nulls always sort last, regardless of direction: a missing value is
      // not a low value.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (bv as number) - (av as number);
    });
    return asc ? sorted.reverse() : sorted;
  }, [players, sort, asc, showBots]);

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

  return (
    <div>
      {hasBots && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={() => setShowBots((v) => !v)}
            className="eyebrow transition-colors hover:text-ink-dim"
            aria-pressed={!showBots}
          >
            {showBots ? "Hide bots" : "Show bots"}
          </button>
        </div>
      )}

      {/* min-w-0 so this actually scrolls inside a flex/grid parent
          rather than forcing the page wider. */}
      <div className="scroll-slim min-w-0 overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">
            Per-player totals for this scope. Sortable by every column.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                aria-sort={ariaSort("label")}
                className="cursor-pointer"
                onClick={() => toggle("label")}
              >
                Player
              </th>
              {showCampaigns && (
                <th scope="col">Camps</th>
              )}
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
                  <span
                    className={`ml-1 inline-block transition-opacity ${
                      sort === c.key ? "opacity-100" : "opacity-0"
                    }`}
                    aria-hidden
                  >
                    {asc ? "↑" : "↓"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.key}
                className={`${p.kind === "bot" ? "row-bot" : ""} ${rowFocus(
                  p.key,
                  selected,
                )}`}
              >
                <td>
                  <div className="flex items-center gap-2">
                    {/* The filter toggle is its own control rather than a
                        click handler on the row: a <tr> cannot be tabbed to,
                        and the row already holds a link to the player page.
                        One target per action, both reachable by keyboard. */}
                    {onSelect && (
                      <button
                        onClick={() =>
                          onSelect(selected === p.key ? null : p.key)
                        }
                        aria-pressed={selected === p.key}
                        title={
                          selected === p.key
                            ? "Clear the filter"
                            : `Show only ${p.label}`
                        }
                        className={`shrink-0 leading-none transition-colors ${
                          selected === p.key
                            ? "text-clear"
                            : "text-ink-faint hover:text-ink-dim"
                        }`}
                      >
                        <span aria-hidden>{selected === p.key ? "◉" : "○"}</span>
                        <span className="sr-only">
                          {selected === p.key
                            ? `Clear filter on ${p.label}`
                            : `Show only ${p.label}`}
                        </span>
                      </button>
                    )}
                    {/* The portrait says which survivor they played, which
                        the `character` column used to say in words. It is
                        self-aligned so a two-line name does not drag it
                        off the baseline of the row. */}
                    <SurvivorMark
                      character={p.character}
                      label={p.label}
                      size={20}
                    />
                    {linkPlayers && p.kind !== "bot" ? (
                      <Link
                        href={`/players/${encodeURIComponent(p.key)}`}
                        className="text-ink transition-colors hover:text-clear"
                      >
                        {p.label}
                      </Link>
                    ) : (
                      <span>{p.label}</span>
                    )}
                    {p.kind === "bot" && <BotTag />}
                    {p.kind === "unresolved" && (
                      <span
                        className="eyebrow text-ink-faint"
                        title="Steam ID lookup failed; tracked by name"
                      >
                        no id
                      </span>
                    )}
                    {/* The character is on the portrait's tooltip now, so
                        naming it again here would be the same fact twice.
                        It stays for a survivor with no art, which is the
                        only case where the picture cannot say it. */}
                    {p.character && !survivorPortrait(p.character) && (
                      <span className="mono text-[0.65rem] text-ink-faint">
                        {p.character}
                      </span>
                    )}
                  </div>
                </td>
                {showCampaigns && (
                  <td className="text-ink-dim">{p.campaigns ?? "—"}</td>
                )}
                {COLUMNS.map((c) => (
                  <td key={c.key} className={c.tone?.(p, rows) ?? ""}>
                    {c.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="py-8 text-center text-[0.8rem] text-ink-mute">
          No players to show. Turn bots back on to see this roster.
        </p>
      )}
    </div>
  );
}
