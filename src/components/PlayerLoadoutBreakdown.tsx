import type { PlayerThrowables, PlayerWeapons } from "@/lib/breakdowns";
import {
  formatMaybe,
  formatNumber,
  formatPercent,
} from "@/lib/metrics";
import { BotTag, rowFocus } from "./ui";

/**
 * Items and weapons, split per player.
 *
 * The roster panels answer "what did this team spend and shoot". These answer
 * who spent and shot it — which is the more useful question for items, where
 * one player typically carries every pipe bomb, and for weapons, where the
 * team total hides that two people were on completely different guns.
 *
 * Both tables show the scope's own rows only. A player who used nothing still
 * gets a row, because "brought nothing to this fight" is a real finding; an
 * item column that nobody touched does not, because an empty column is noise.
 */

function Dash() {
  return <span className="text-ink-faint">—</span>;
}

function PlayerCell({
  label,
  kind,
  character,
}: {
  label: string;
  kind: "human" | "bot" | "unresolved";
  character: string;
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[0.85rem] text-ink">{label}</span>
      {kind === "bot" && <BotTag />}
      {character && (
        <span className="mono text-[0.62rem] text-ink-faint">{character}</span>
      )}
    </span>
  );
}

/**
 * Per-player item use.
 *
 * Columns are derived from what was actually used in this scope, so a run
 * where nobody threw anything collapses to the consumables that were used
 * rather than rendering seven empty columns.
 */
export function PlayerItemBreakdown({
  rows,
  selected = null,
}: {
  rows: PlayerThrowables[];
  /** Focused player. Teammates stay visible but recede. */
  selected?: string | null;
}) {
  const used = new Map<string, string>();
  for (const r of rows) {
    for (const item of [
      ...r.breakdown.throwables,
      ...r.breakdown.consumables,
      ...r.breakdown.other,
    ]) {
      if (item.count > 0) used.set(item.key, item.label);
    }
  }

  if (used.size === 0) {
    return (
      <p className="py-6 text-[0.82rem] text-ink-mute">
        Nobody in this scope used a throwable or a consumable.
      </p>
    );
  }

  const columns = [...used.entries()];
  const countFor = (row: PlayerThrowables, key: string): number => {
    const all = [
      ...row.breakdown.throwables,
      ...row.breakdown.consumables,
      ...row.breakdown.other,
    ];
    return all.find((i) => i.key === key)?.count ?? 0;
  };

  return (
    <div className="scroll-slim -mx-6 overflow-x-auto px-6">
      <table className="data-table w-full min-w-[640px]">
        <caption className="sr-only">
          Each player&rsquo;s throwables and consumables used
        </caption>
        <thead>
          <tr>
            <th scope="col" className="!text-left">
              Player
            </th>
            {columns.map(([key, label]) => (
              <th key={key} scope="col">
                {label}
              </th>
            ))}
            <th scope="col">Total</th>
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
                <PlayerCell
                  label={r.label}
                  kind={r.kind}
                  character={r.character}
                />
              </th>
              {columns.map(([key]) => {
                const n = countFor(r, key);
                return (
                  <td key={key} className="mono py-2.5 text-[0.75rem] text-ink-dim">
                    {n > 0 ? formatNumber(n) : <Dash />}
                  </td>
                );
              })}
              <td className="mono py-2.5 text-[0.75rem] text-ink">
                {r.totalUsed > 0 ? formatNumber(r.totalUsed) : <Dash />}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-rule-bright">
            <th scope="row" className="py-2.5 pr-3 text-left font-normal">
              <span className="text-[0.82rem] text-ink-dim">Team</span>
            </th>
            {columns.map(([key]) => {
              const n = rows.reduce((sum, r) => sum + countFor(r, key), 0);
              return (
                <td key={key} className="mono py-2.5 text-[0.75rem] text-ink-dim">
                  {n > 0 ? formatNumber(n) : "—"}
                </td>
              );
            })}
            <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
              {formatNumber(rows.reduce((n, r) => n + r.totalUsed, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * Per-player shooting.
 *
 * On files that predate per-weapon tracking this still has something to say —
 * shots, reloads and headshot rate are per-player totals the addon always
 * recorded — so the table renders either way and the top-weapon columns
 * simply fall back to an em dash.
 */
export function PlayerWeaponBreakdown({
  rows,
  perWeaponAvailable,
  selected = null,
}: {
  rows: PlayerWeapons[];
  perWeaponAvailable: boolean;
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

  return (
    <div className="scroll-slim -mx-6 overflow-x-auto px-6">
      <table className="data-table w-full min-w-[760px]">
        <caption className="sr-only">
          Each player&rsquo;s shooting totals and most-used weapons
        </caption>
        <thead>
          <tr>
            <th scope="col" className="!text-left">
              Player
            </th>
            <th scope="col">Kills</th>
            <th scope="col">Shots</th>
            <th scope="col">Reloads</th>
            <th
              scope="col"
              title="Headshots divided by kills. The two tables are keyed independently, so treat as approximate."
            >
              HS%
            </th>
            {perWeaponAvailable && (
              <>
                <th scope="col" className="!text-left">
                  Most kills
                </th>
                <th scope="col" className="!text-left">
                  Most damage
                </th>
                <th scope="col">Weapon dmg</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = r.breakdown;
            return (
              <tr
                key={r.key}
                className={`${r.kind === "bot" ? "row-bot" : ""} ${rowFocus(
                  r.key,
                  selected,
                )}`}
              >
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  <PlayerCell
                    label={r.label}
                    kind={r.kind}
                    character={r.character}
                  />
                </th>
                <td className="mono py-2.5 text-[0.75rem] text-ink">
                  {b.kills > 0 ? formatNumber(b.kills) : <Dash />}
                </td>
                <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
                  {b.shotsFired > 0 ? formatNumber(b.shotsFired) : <Dash />}
                </td>
                <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
                  {b.reloads > 0 ? formatNumber(b.reloads) : <Dash />}
                </td>
                <td className="mono py-2.5 text-[0.75rem] text-ink-mute">
                  {formatPercent(b.headshotRate, 1)}
                </td>
                {perWeaponAvailable && (
                  <>
                    <td className="py-2.5 !text-left text-[0.8rem] text-ink-dim">
                      {b.topByKills ? (
                        <span>
                          {b.topByKills.label}
                          <span className="mono ml-2 text-[0.66rem] text-ink-faint">
                            {formatNumber(b.topByKills.kills)}
                          </span>
                        </span>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="py-2.5 !text-left text-[0.8rem] text-ink-dim">
                      {b.topByDamage ? (
                        <span>
                          {b.topByDamage.label}
                          <span className="mono ml-2 text-[0.66rem] text-ink-faint">
                            {formatNumber(b.topByDamage.damage)}
                          </span>
                        </span>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="mono py-2.5 text-[0.75rem] text-ink-dim">
                      {b.damage !== null && b.damage > 0 ? (
                        formatNumber(b.damage)
                      ) : (
                        <Dash />
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
