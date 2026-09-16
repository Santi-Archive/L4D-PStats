import type { PlayerIncidents } from "@/lib/breakdowns";
import { formatNumber, infectedColor } from "@/lib/metrics";
import { BotTag, rowFocus } from "./ui";

/**
 * What the infection did to each player: the victim side of the ledger.
 *
 * Every other infected table on the page counts what the survivors killed.
 * This one counts what happened to them — who got pounced, hooked, ridden,
 * pummelled, vomited on, and what it cost in incaps and deaths.
 *
 * Two things this table deliberately does NOT do:
 *
 * Escape rates. `grabbed_by` writes a `<kind>_escaped` key at exactly the pin
 * count for hunter and smoker and never writes one for jockey or charger.
 * That is the mod double-writing the pin, not a real 100% breakout rate, so
 * no escape column is published. `breakdowns.ts` documents this at source.
 *
 * A single "pins" total. The mod files a boomer vomit in `grabbed_by` beside
 * hunter pounces, and never files spitter acid there at all because it is
 * damage rather than contact. One combined number would be a category the
 * telemetry never recorded, so each event keeps its own column and the
 * damage-signature types are marked as damage.
 */

/** A missing value is an em dash, never a zero. They are different claims. */
function Dash() {
  return <span className="text-ink-faint">—</span>;
}

export default function PlayerIncidentBreakdown({
  rows,
  selected = null,
}: {
  rows: PlayerIncidents[];
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

  // Only the incident kinds that actually happened to somebody here. The
  // column order is taken from the first row that has each one, which is
  // already canonical because `playerIncidents` builds them in a fixed order.
  const columns: { key: string; label: string; unit: "events" | "damage" }[] =
    [];
  for (const r of rows) {
    for (const i of r.incidents) {
      if (!columns.some((c) => c.label === i.label)) {
        columns.push({ key: i.key, label: i.label, unit: i.unit });
      }
    }
  }
  columns.sort(
    (a, b) => Number(a.unit === "damage") - Number(b.unit === "damage"),
  );

  const countFor = (row: PlayerIncidents, label: string): number =>
    row.incidents.find((i) => i.label === label)?.count ?? 0;

  const anyWitches = rows.some((r) => r.witchesStartled > 0);
  const anyRocks = rows.some((r) => r.tankRocksHit > 0);

  const worst = Math.max(1, ...rows.map((r) => r.totalIncidents));

  return (
    <div className="scroll-slim -mx-6 overflow-x-auto px-6">
      <table className="data-table w-full min-w-[760px]">
        <caption className="sr-only">
          What the infection did to each player: grabs, incaps and deaths
        </caption>
        <thead>
          <tr>
            <th scope="col" className="!text-left">
              Player
            </th>
            <th scope="col" title="Every contact event this player was caught by">
              Caught
            </th>
            {columns.map((c) => (
              <th
                key={c.label}
                scope="col"
                title={
                  c.unit === "damage"
                    ? `Damage taken from ${c.key} — this type has no contact table, so damage is the only record`
                    : undefined
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0"
                    style={{ background: infectedColor(c.key) }}
                  />
                  {c.label}
                  {c.unit === "damage" && (
                    <span className="text-ink-faint"> (dmg)</span>
                  )}
                </span>
              </th>
            ))}
            {anyWitches && (
              <th scope="col" title="Witches this player startled">
                Startled
              </th>
            )}
            {anyRocks && (
              <th scope="col" title="Tank rocks that connected">
                Rocks
              </th>
            )}
            <th scope="col" title="Times put down, from any cause">
              Incaps
            </th>
            <th scope="col" title="Deaths caused by infected; falls and friendly fire excluded">
              Deaths
            </th>
            <th scope="col" title="Damage taken from infected only">
              Dmg taken
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
                {r.totalIncidents > 0 ? (
                  formatNumber(r.totalIncidents)
                ) : (
                  <Dash />
                )}
                <span className="mt-1 flex h-[3px] w-full bg-sunken" aria-hidden>
                  <span
                    className="h-full"
                    style={{
                      width: `${(r.totalIncidents / worst) * 100}%`,
                      background: "var(--color-harm-dim)",
                    }}
                  />
                </span>
              </td>

              {columns.map((c) => {
                const n = countFor(r, c.label);
                return (
                  <td
                    key={c.label}
                    className="mono py-2.5 text-[0.75rem] text-ink-dim"
                  >
                    {n > 0 ? formatNumber(n) : <Dash />}
                  </td>
                );
              })}

              {anyWitches && (
                <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
                  {r.witchesStartled > 0 ? r.witchesStartled : <Dash />}
                </td>
              )}
              {anyRocks && (
                <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
                  {r.tankRocksHit > 0 ? r.tankRocksHit : <Dash />}
                </td>
              )}

              <td
                className={`mono py-2.5 text-[0.75rem] ${
                  r.incaps > 0 ? "text-harm/85" : "text-ink-faint"
                }`}
              >
                {r.incaps > 0 ? formatNumber(r.incaps) : <Dash />}
              </td>
              <td
                className={`mono py-2.5 text-[0.75rem] ${
                  r.deathsToInfected > 0 ? "text-harm" : "text-ink-faint"
                }`}
              >
                {r.deathsToInfected > 0 ? (
                  formatNumber(r.deathsToInfected)
                ) : (
                  <Dash />
                )}
              </td>
              <td className="mono py-2.5 text-[0.75rem] text-ink-mute">
                {r.damageFromInfected > 0 ? (
                  formatNumber(r.damageFromInfected)
                ) : (
                  <Dash />
                )}
              </td>
            </tr>
          ))}
        </tbody>
        {/* A totals row under a single row restates it verbatim. The player
            page renders exactly one row, so the footer is suppressed there
            rather than printing every figure twice. */}
        <tfoot className={rows.length < 2 ? "hidden" : undefined}>
          <tr className="border-t border-rule-bright">
            <th scope="row" className="py-2.5 pr-3 text-left font-normal">
              <span className="text-[0.82rem] text-ink-dim">Team</span>
            </th>
            <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
              {formatNumber(rows.reduce((n, r) => n + r.totalIncidents, 0))}
            </td>
            {columns.map((c) => {
              const n = rows.reduce((sum, r) => sum + countFor(r, c.label), 0);
              return (
                <td
                  key={c.label}
                  className="mono py-2.5 text-[0.75rem] text-ink-dim"
                >
                  {n > 0 ? formatNumber(n) : "—"}
                </td>
              );
            })}
            {anyWitches && (
              <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
                {rows.reduce((n, r) => n + r.witchesStartled, 0) || "—"}
              </td>
            )}
            {anyRocks && (
              <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
                {rows.reduce((n, r) => n + r.tankRocksHit, 0) || "—"}
              </td>
            )}
            <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
              {formatNumber(rows.reduce((n, r) => n + r.incaps, 0))}
            </td>
            <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
              {formatNumber(rows.reduce((n, r) => n + r.deathsToInfected, 0))}
            </td>
            <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
              {formatNumber(
                rows.reduce((n, r) => n + r.damageFromInfected, 0),
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
