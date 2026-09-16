import type { ChapterAnalysis } from "@/lib/breakdowns";
import {
  formatDuration,
  formatMaybe,
  formatNumber,
  infectedColor,
} from "@/lib/metrics";
import { OutcomeTag } from "./ui";

/**
 * Chapter comparison.
 *
 * Chapters are a real sequence, so they are numbered and kept in order —
 * sorting this table would destroy the thing it is for. The comparison that
 * matters is *rate*, not total: a long quiet chapter and a short brutal one
 * produce similar totals and completely different rates, and the rate is
 * what tells you which one nearly ended the run.
 */

/** Small inline bar used inside a table cell, scaled across the column. */
function CellBar({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: "neutral" | "harm";
}) {
  const pct = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <span className="mt-1 flex h-[3px] w-full bg-sunken" aria-hidden>
      <span
        className="h-full"
        style={{
          width: `${pct}%`,
          background:
            tone === "harm" ? "var(--color-harm)" : "var(--color-ink-faint)",
        }}
      />
    </span>
  );
}

export default function ChapterAnalysisTable({
  chapters,
}: {
  chapters: ChapterAnalysis[];
}) {
  if (chapters.length === 0) {
    return (
      <p className="py-6 text-[0.82rem] text-ink-mute">
        No chapters recorded yet.
      </p>
    );
  }

  const maxKpm = Math.max(...chapters.map((c) => c.killsPerMinute ?? 0));
  const maxDtpm = Math.max(...chapters.map((c) => c.damageTakenPerMinute ?? 0));
  const maxTime = Math.max(...chapters.map((c) => c.playtimeS));
  // The damage columns are scaled within themselves, not against each other:
  // dealt is an order of magnitude larger than taken on any surviving run,
  // and one shared scale would flatten the taken bars into nothing.
  const maxDealt = Math.max(...chapters.map((c) => c.damageDealt));
  const maxTaken = Math.max(...chapters.map((c) => c.damageTaken));

  return (
    <div className="scroll-slim -mx-6 overflow-x-auto px-6">
      <table className="data-table w-full min-w-[1080px]">
        <caption className="sr-only">
          Every chapter in this run, in play order, with pace and cost
        </caption>
        <thead>
          <tr>
            <th scope="col" className="!text-left">
              Chapter
            </th>
            <th scope="col" className="!text-left">
              Outcome
            </th>
            <th scope="col">Time</th>
            <th scope="col">Kills</th>
            <th scope="col">Specials</th>
            <th scope="col" title="Total damage the team dealt in this chapter">
              Dmg dealt
            </th>
            <th
              scope="col"
              title="Total damage the team took in this chapter"
            >
              Dmg taken
            </th>
            <th scope="col">Kills / min</th>
            <th scope="col">Dmg taken / min</th>
            <th scope="col">Pins</th>
            <th scope="col">Casualties</th>
            <th scope="col" className="!text-left">
              Worst threat
            </th>
          </tr>
        </thead>
        <tbody>
          {chapters.map((c) => {
            const casualties = c.incaps + c.deaths;
            return (
              <tr key={`${c.index}-${c.map}`}>
                <th scope="row" className="py-3 pr-3 text-left font-normal">
                  <span className="flex items-baseline gap-2.5">
                    {/* Numbering earns its place: chapters are ordered. */}
                    <span className="mono text-[0.68rem] text-ink-faint">
                      {String(c.index).padStart(2, "0")}
                    </span>
                    <span className="text-[0.85rem] text-ink">{c.label}</span>
                    {c.retried && (
                      <span
                        className="eyebrow text-harm"
                        title={`Started ${c.roundStarts} times`}
                      >
                        {c.roundStarts}×
                      </span>
                    )}
                  </span>
                  <span className="mono mt-0.5 block text-[0.62rem] text-ink-faint">
                    {c.map}
                  </span>
                </th>
                <td className="py-3 !text-left">
                  <OutcomeTag outcome={c.outcome} />
                </td>
                <td className="mono py-3 text-[0.75rem] text-ink-dim">
                  {formatDuration(c.playtimeS)}
                  <CellBar value={c.playtimeS} max={maxTime} tone="neutral" />
                </td>
                <td className="mono py-3 text-[0.75rem] text-ink-dim">
                  {formatNumber(c.kills)}
                </td>
                <td className="mono py-3 text-[0.75rem] text-ink-dim">
                  {c.specialKills > 0 ? formatNumber(c.specialKills) : "—"}
                </td>
                <td className="mono py-3 text-[0.75rem] text-ink-dim">
                  {c.damageDealt > 0 ? formatNumber(c.damageDealt) : "—"}
                  <CellBar
                    value={c.damageDealt}
                    max={maxDealt}
                    tone="neutral"
                  />
                </td>
                <td
                  className={`mono py-3 text-[0.75rem] ${
                    c.damageTaken > 0 ? "text-harm/85" : "text-ink-faint"
                  }`}
                >
                  {c.damageTaken > 0 ? formatNumber(c.damageTaken) : "—"}
                  <CellBar value={c.damageTaken} max={maxTaken} tone="harm" />
                </td>
                <td className="mono py-3 text-[0.75rem] text-ink-dim">
                  {formatMaybe(c.killsPerMinute, 1)}
                  <CellBar
                    value={c.killsPerMinute ?? 0}
                    max={maxKpm}
                    tone="neutral"
                  />
                </td>
                <td className="mono py-3 text-[0.75rem] text-ink-dim">
                  {formatMaybe(c.damageTakenPerMinute, 1)}
                  <CellBar
                    value={c.damageTakenPerMinute ?? 0}
                    max={maxDtpm}
                    tone="harm"
                  />
                </td>
                <td className="mono py-3 text-[0.75rem] text-ink-dim">
                  {c.grabs > 0 ? c.grabs : "—"}
                </td>
                <td className="mono py-3 text-[0.75rem]">
                  {casualties > 0 ? (
                    <span className="text-harm">
                      {c.incaps > 0 && `${c.incaps} incap`}
                      {c.incaps > 0 && c.deaths > 0 && " · "}
                      {c.deaths > 0 && `${c.deaths} died`}
                    </span>
                  ) : (
                    <span className="text-ink-faint">clean</span>
                  )}
                </td>
                <td className="py-3 !text-left">
                  {c.worstThreat ? (
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0"
                        style={{ background: infectedColor(c.worstThreat.key) }}
                      />
                      <span className="text-[0.8rem] text-ink-dim">
                        {c.worstThreat.label}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[0.8rem] text-ink-faint">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
