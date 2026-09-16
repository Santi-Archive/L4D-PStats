import type { InfectedBreakdown, InfectedRow } from "@/lib/breakdowns";
import { formatNumber, formatPercent, infectedColor } from "@/lib/metrics";

/**
 * The Infected Ledger: every special infected as one row.
 *
 * Plain figures, no bar. The ratio the old damage-traded bar encoded is
 * readable straight off the two damage columns now that they sit next to
 * each other, and dropping it gives the row back the width the exact numbers
 * were competing for.
 *
 * Incaps and deaths are separate columns rather than one "casualties" cell:
 * a charger that has incapacitated someone four times and a witch that has
 * killed once are not the same event, and collapsing them hid which it was.
 *
 * This is the companion to the Casualty Strip. The strip answers "where did
 * the run go wrong"; the ledger answers "what did it cost us, and to whom".
 */

/** A row where the left bar is meaningful — something actually hit back. */
function hasCost(r: InfectedRow): boolean {
  return r.damageTaken > 0 || r.incapsCaused > 0 || r.killsCaused > 0;
}

/**
 * Row padding, as one decision.
 *
 * `compact` is what the player profile uses to keep the ledger inside the
 * one-viewport summary budget. It is purely vertical — no figure is dropped
 * and no type size changes, so the compact table says exactly what the
 * roomy one says.
 */
const pad = (compact: boolean) => (compact ? "py-1.5" : "py-2.5");

export function InfectedLedgerRow({
  row,
  compact = false,
}: {
  row: InfectedRow;
  compact?: boolean;
}) {
  const color = infectedColor(row.key);
  const p = pad(compact);

  return (
    <tr className="group">
      <th scope="row" className={`${p} pr-3 text-left font-normal`}>
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0"
            style={{ background: color }}
          />
          <span className="text-[0.85rem] text-ink">{row.label}</span>
        </span>
      </th>

      <td className={`mono ${p} text-[0.75rem] text-ink-dim`}>
        {row.kills > 0 ? formatNumber(row.kills) : <Dash />}
      </td>
      <td className={`mono ${p} text-[0.75rem] text-ink-mute`}>
        {formatPercent(row.headshotRate)}
      </td>
      <td className={`mono ${p} text-[0.75rem] text-ink-dim`}>
        {row.damageDealt > 0 ? formatNumber(row.damageDealt) : <Dash />}
      </td>
      <td
        className={`mono ${p} text-[0.75rem] ${
          hasCost(row) ? "text-harm/85" : "text-ink-faint"
        }`}
      >
        {row.damageTaken > 0 ? formatNumber(row.damageTaken) : <Dash />}
      </td>
      {/* The escape count is a footnote on the pin count. Stacked it costs a
          second line on every row that has one, which is the difference
          between fitting the viewport and not, so the compact table sets it
          inline instead — `whitespace-nowrap` is what kept the roomy version
          from wrapping it across three lines. */}
      <td className={`mono ${p} text-[0.75rem] whitespace-nowrap`}>
        {row.grabs > 0 ? (
          <>
            <span className="text-ink-dim">{row.grabs}</span>
            {row.escapes > 0 &&
              (compact ? (
                <span className="ml-1.5 text-[0.62rem] text-ink-faint">
                  ({row.escapes} free)
                </span>
              ) : (
                <span className="mt-0.5 block text-[0.62rem] text-ink-faint">
                  {row.escapes} broke free
                </span>
              ))}
          </>
        ) : (
          <Dash />
        )}
      </td>
      <td
        className={`mono ${p} text-[0.75rem] ${
          row.incapsCaused > 0 ? "text-harm" : "text-ink-faint"
        }`}
      >
        {row.incapsCaused > 0 ? formatNumber(row.incapsCaused) : <Dash />}
      </td>
      <td
        className={`mono ${p} text-[0.75rem] ${
          row.killsCaused > 0 ? "text-harm" : "text-ink-faint"
        }`}
      >
        {row.killsCaused > 0 ? formatNumber(row.killsCaused) : <Dash />}
      </td>
    </tr>
  );
}

/** A missing value is an em dash, never a zero. They are different claims. */
function Dash() {
  return <span className="text-ink-faint">—</span>;
}

export default function InfectedLedger({
  breakdown,
  showCommon = true,
  compact = false,
}: {
  breakdown: InfectedBreakdown;
  showCommon?: boolean;
  /** Tighter rows, for the player profile's one-viewport summary. */
  compact?: boolean;
}) {
  const rows = [...breakdown.specials];
  const p = pad(compact);
  if (rows.length === 0 && breakdown.other.length === 0 && !breakdown.common) {
    return (
      <p className="py-6 text-[0.82rem] text-ink-mute">
        No infected recorded in this scope.
      </p>
    );
  }

  return (
    <div className="scroll-slim -mx-6 overflow-x-auto px-6">
      <table className="data-table w-full min-w-[720px]">
        <caption className="sr-only">
          Special infected: kills, damage both ways, pins, incaps and deaths
        </caption>
        <thead>
          <tr>
            {/* The name column absorbs the slack. Without the old bar there
                is far more width than the figures need, and letting the
                table distribute it evenly pushed each number away from its
                own heading. */}
            <th scope="col" className="w-full !text-left">
              Special
            </th>
            <th scope="col">Killed</th>
            <th scope="col">HS%</th>
            <th scope="col" title="Damage the team dealt to this type">
              Dmg dealt
            </th>
            <th scope="col" title="Damage this type dealt to the team">
              Dmg taken
            </th>
            <th scope="col" title="Pounces, tongues, rides and carries">
              Pins
            </th>
            <th scope="col" title="Survivors this type incapacitated">
              Casualties
            </th>
            <th scope="col" title="Survivors this type killed outright">
              Deaths
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <InfectedLedgerRow key={r.key} row={r} compact={compact} />
          ))}
        </tbody>
        {(showCommon && breakdown.common) || breakdown.other.length > 0 ? (
          <tfoot>
            {showCommon && breakdown.common && (
              <tr className="border-t border-rule-bright">
                <th scope="row" className={`${p} pr-3 text-left font-normal`}>
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0"
                      style={{ background: infectedColor("common") }}
                    />
                    <span className="text-[0.85rem] text-ink-dim">
                      Common horde
                    </span>
                  </span>
                </th>
                <td className={`mono ${p} text-[0.75rem] text-ink-dim`}>
                  {formatNumber(breakdown.common.kills)}
                </td>
                <td className={`mono ${p} text-[0.75rem] text-ink-mute`}>
                  {formatPercent(breakdown.common.headshotRate)}
                </td>
                <td className={`mono ${p} text-[0.75rem] text-ink-dim`}>
                  {formatNumber(breakdown.common.damageDealt)}
                </td>
                <td className={`mono ${p} text-[0.75rem] text-ink-faint`}>
                  {breakdown.common.damageTaken > 0
                    ? formatNumber(breakdown.common.damageTaken)
                    : "—"}
                </td>
                {/* The horde does not pin, and its incaps and kills are
                    filed against the individual types that caused them. */}
                <td />
                <td />
                <td />
              </tr>
            )}
            {/*
              The non-infected damage sources — world, fall, drowning,
              teammate, boomer vomit. Each is really one figure (damage
              taken) wearing a full row: in the roomy table they print five
              rows that are dashes in every other column.

              Compact folds them onto a single line, which is the largest
              honest saving available here — nothing is hidden, the same
              numbers are in the same order, they just stop each claiming a
              row of their own.
            */}
            {compact ? (
              <tr className="border-t border-rule">
                <th
                  scope="row"
                  colSpan={8}
                  className={`${p} pr-3 text-left font-normal`}
                >
                  <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                    <span className="eyebrow shrink-0">Other damage</span>
                    {breakdown.other.map((r) => (
                      <span
                        key={r.key}
                        className="inline-flex items-baseline gap-1.5"
                      >
                        <span className="text-[0.75rem] text-ink-mute">
                          {r.label}
                        </span>
                        <span className="mono text-[0.75rem] text-harm/70">
                          {r.damageTaken > 0
                            ? formatNumber(r.damageTaken)
                            : "—"}
                        </span>
                        {/* A death or incap from one of these is rare and
                            worth calling out where it happens. */}
                        {r.killsCaused > 0 && (
                          <span className="mono text-[0.68rem] text-harm">
                            {r.killsCaused}d
                          </span>
                        )}
                        {r.incapsCaused > 0 && (
                          <span className="mono text-[0.68rem] text-harm/85">
                            {r.incapsCaused}i
                          </span>
                        )}
                      </span>
                    ))}
                  </span>
                </th>
              </tr>
            ) : (
              breakdown.other.map((r) => (
                <tr key={r.key} className="text-ink-mute">
                  <th scope="row" className={`${p} pr-3 text-left font-normal`}>
                    <span className="pl-[1.25rem] text-[0.82rem]">
                      {r.label}
                    </span>
                  </th>
                  <td className={`mono ${p} text-[0.75rem]`}>
                    {r.kills > 0 ? formatNumber(r.kills) : "—"}
                  </td>
                  <td />
                  <td className={`mono ${p} text-[0.75rem]`}>
                    {r.damageDealt > 0 ? formatNumber(r.damageDealt) : "—"}
                  </td>
                  <td className={`mono ${p} text-[0.75rem] text-harm/70`}>
                    {r.damageTaken > 0 ? formatNumber(r.damageTaken) : "—"}
                  </td>
                  <td />
                  <td className={`mono ${p} text-[0.75rem]`}>
                    {r.incapsCaused > 0 ? (
                      <span className="text-harm">{r.incapsCaused}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`mono ${p} text-[0.75rem]`}>
                    {r.killsCaused > 0 ? (
                      <span className="text-harm">{r.killsCaused}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/**
 * Headline numbers for the infected scope. Kept separate from the ledger so
 * a page can use one without the other.
 */
export function InfectedSummary({
  breakdown,
  compact = false,
}: {
  breakdown: InfectedBreakdown;
  /**
   * Lays the three figures out on one line, value and label side by side,
   * instead of stacking each label under its number. Costs a third of the
   * height and reads the same at this size.
   */
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex flex-wrap gap-x-8 gap-y-2" : "flex flex-wrap gap-x-10 gap-y-6"}>
      <Metric
        value={formatNumber(breakdown.totalSpecialKills)}
        label="Specials killed"
        compact={compact}
      />
      <Metric
        value={formatNumber(breakdown.commonKills)}
        label="Common killed"
        compact={compact}
      />
      <Metric
        value={formatPercent(breakdown.specialShare, 1)}
        label="Share that were specials"
        compact={compact}
      />
    </div>
  );
}

function Metric({
  value,
  label,
  compact = false,
}: {
  value: string;
  label: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-baseline gap-2">
        <span className="metric text-[1.15rem] text-ink">{value}</span>
        <span className="eyebrow">{label}</span>
      </div>
    );
  }
  return (
    <div>
      <div className="metric text-[1.6rem] text-ink">{value}</div>
      <div className="eyebrow mt-1.5">{label}</div>
    </div>
  );
}
