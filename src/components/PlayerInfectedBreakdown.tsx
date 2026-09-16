import type { PlayerInfected } from "@/lib/breakdowns";
import { SPECIALS } from "@/lib/metrics";
import {
  formatMaybe,
  formatNumber,
  formatPercent,
  infectedColor,
} from "@/lib/metrics";
import { BotTag, rowFocus } from "./ui";

/**
 * Who fought what: the infected ledger split per player.
 *
 * The team ledger answers "what did the infection cost us". This answers the
 * question immediately after it — which is not "who killed most", but who was
 * handling the *specials* while everyone else fed on the horde. So specials
 * get a column each, common gets one column at the end, and the ordering is
 * by specials rather than by total kills.
 *
 * A column exists only when something in this scope actually happened to that
 * type. Rendering all eight specials always would make a No Mercy run look
 * mostly empty and bury the two columns that carry the run.
 */

/** A missing value is an em dash, never a zero. They are different claims. */
function Dash() {
  return <span className="text-ink-faint">—</span>;
}

export default function PlayerInfectedBreakdown({
  rows,
  selected = null,
}: {
  rows: PlayerInfected[];
  /** Focused player. Teammates stay visible but recede. */
  selected?: string | null;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-[0.82rem] text-ink-mute">
        No players in this scope.
      </p>
    );
  }

  // Only the specials that appear somewhere in this scope, in the canonical
  // roster order so the column positions stay stable between chapters.
  const present = (SPECIALS as readonly string[]).filter((key) =>
    rows.some((r) => r.breakdown.specials.some((s) => s.key === key)),
  );

  const killsFor = (row: PlayerInfected, key: string): number =>
    row.breakdown.specials.find((s) => s.key === key)?.kills ?? 0;

  // Footer totals, summed from the rows themselves so the table visibly adds
  // up. These equal the roster-scoped breakdown by construction.
  const teamSpecials = rows.reduce(
    (n, r) => n + r.breakdown.totalSpecialKills,
    0,
  );
  const teamCommon = rows.reduce((n, r) => n + r.breakdown.commonKills, 0);
  const maxSpecials = Math.max(1, ...rows.map((r) => r.breakdown.totalSpecialKills));

  return (
    <div className="scroll-slim -mx-6 overflow-x-auto px-6">
      <table className="data-table w-full min-w-[720px]">
        <caption className="sr-only">
          Each player&rsquo;s kills by infected type, specials first
        </caption>
        <thead>
          <tr>
            <th scope="col" className="!text-left">
              Player
            </th>
            <th scope="col" title="Special infected killed by this player">
              Specials
            </th>
            <th scope="col" title="Share of the team's special kills">
              Share
            </th>
            {present.map((key) => (
              <th key={key} scope="col">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0"
                    style={{ background: infectedColor(key) }}
                  />
                  {/* The full name is in the ledger above; abbreviate here so
                      eight columns still fit without a horizontal scroll. */}
                  {infectedAbbr(key)}
                </span>
              </th>
            ))}
            <th scope="col">Common</th>
            <th scope="col" title="Special infected killed per minute of this player's own play time">
              Spec / min
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className={`${r.kind === "bot" ? "row-bot" : ""} ${rowFocus(
                r.key,
                selected,
              )}`}
            >
              <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                <span className="flex items-baseline gap-2">
                  <span className="text-[0.85rem] text-ink">{r.label}</span>
                  {r.kind === "bot" && <BotTag />}
                  {r.character && (
                    <span className="mono text-[0.62rem] text-ink-faint">
                      {r.character}
                    </span>
                  )}
                </span>
              </th>
              <td className="mono py-2.5 text-[0.75rem] text-ink">
                {r.breakdown.totalSpecialKills > 0 ? (
                  formatNumber(r.breakdown.totalSpecialKills)
                ) : (
                  <Dash />
                )}
                <span className="mt-1 flex h-[3px] w-full bg-sunken" aria-hidden>
                  <span
                    className="h-full"
                    style={{
                      width: `${
                        (r.breakdown.totalSpecialKills / maxSpecials) * 100
                      }%`,
                      background: "var(--color-ink-faint)",
                    }}
                  />
                </span>
              </td>
              <td className="mono py-2.5 text-[0.75rem] text-ink-mute">
                {formatPercent(r.specialShareOfTeam)}
              </td>
              {present.map((key) => {
                const n = killsFor(r, key);
                return (
                  <td
                    key={key}
                    className="mono py-2.5 text-[0.75rem] text-ink-dim"
                  >
                    {n > 0 ? formatNumber(n) : <Dash />}
                  </td>
                );
              })}
              <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
                {r.breakdown.commonKills > 0 ? (
                  formatNumber(r.breakdown.commonKills)
                ) : (
                  <Dash />
                )}
              </td>
              <td className="mono py-2.5 text-[0.75rem] text-ink-mute">
                {formatMaybe(r.breakdown.specialsPerMinute, 2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-rule-bright">
            <th scope="row" className="py-2.5 pr-3 text-left font-normal">
              <span className="text-[0.82rem] text-ink-dim">Team</span>
            </th>
            <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
              {formatNumber(teamSpecials)}
            </td>
            <td />
            {present.map((key) => {
              const n = rows.reduce((sum, r) => sum + killsFor(r, key), 0);
              return (
                <td key={key} className="mono py-2.5 text-[0.75rem] text-ink-dim">
                  {n > 0 ? formatNumber(n) : "—"}
                </td>
              );
            })}
            <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
              {formatNumber(teamCommon)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * Short column headings. The colour swatch plus three letters is enough to
 * identify a type that is already named in full in the ledger above.
 */
const ABBR: Record<string, string> = {
  smoker: "Smk",
  boomer: "Bmr",
  hunter: "Hun",
  spitter: "Spt",
  jockey: "Jky",
  charger: "Chg",
  tank: "Tank",
  witch: "Witch",
};

function infectedAbbr(key: string): string {
  return ABBR[key] ?? key.slice(0, 3);
}
