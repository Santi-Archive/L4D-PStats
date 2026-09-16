import type {
  ItemRow,
  ThrowableBreakdown,
  WeaponBreakdown,
} from "@/lib/breakdowns";
import { formatMaybe, formatNumber, formatPercent } from "@/lib/metrics";
import { Bar } from "./ui";

/**
 * Throwables, consumables and per-weapon fire.
 *
 * The weapon panel now charts the mod's `weapons` table. Two honesty rules
 * survive from when it could not: the inference share is stated up front
 * rather than buried, because most attributions are inferred from the
 * last-fired weapon; and fire, gas cans and thrown items are grouped apart
 * from guns instead of being ranked beside them. Files written before
 * per-weapon tracking still get the old totals-plus-explanation state.
 */

/** Colours for items. Deliberately outside the infected palette. */
const ITEM_COLOR: Record<string, string> = {
  pipe_bomb: "#8a8f6b",
  molotov: "#b2553f",
  vomitjar: "#6b8a5f",
  first_aid_kit: "#8a5f5f",
  pain_pills: "#7a6f9e",
  adrenaline: "#5f8a9e",
  defibrillator: "#9e5f8a",
};

/** Weapon bars read by class, so a glance separates guns from fire. */
const WEAPON_KIND_COLOR: Record<string, string> = {
  firearm: "#6b7f9e",
  melee: "#8a8f6b",
  throwable: "#b2553f",
  environmental: "#7a6a55",
};

function itemColor(key: string): string {
  return ITEM_COLOR[key] ?? "#3a3a42";
}

function ItemRows({
  rows,
  max,
}: {
  rows: { key: string; label: string; count: number; share: number | null }[];
  max: number;
}) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-4">
            <span className="text-[0.85rem] text-ink-dim">{r.label}</span>
            <span className="mono text-[0.75rem] text-ink-mute">
              {formatNumber(r.count)}
              {r.share !== null && (
                <span className="ml-2 text-ink-faint">
                  {formatPercent(r.share)}
                </span>
              )}
            </span>
          </div>
          <Bar value={r.count} max={max} color={itemColor(r.key)} />
        </li>
      ))}
    </ul>
  );
}

export function ThrowablePanel({
  breakdown,
}: {
  breakdown: ThrowableBreakdown;
}) {
  const nothing =
    breakdown.throwables.length === 0 &&
    breakdown.consumables.length === 0 &&
    breakdown.other.length === 0;

  if (nothing) {
    return (
      <div className="border border-dashed border-rule-bright px-6 py-10 text-center">
        <p className="text-[0.85rem] text-ink-dim">
          No throwables or consumables recorded.
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[0.78rem] leading-relaxed text-ink-mute">
          The addon counts a throwable when it is thrown and a consumable when
          it is used. Nothing was used in this scope — on lower difficulties a
          run often finishes without spending any.
        </p>
      </div>
    );
  }

  const maxThrown = Math.max(1, ...breakdown.throwables.map((r) => r.count));
  const maxUsed = Math.max(1, ...breakdown.consumables.map((r) => r.count));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-x-10 gap-y-5">
        <div>
          <div className="metric text-[1.6rem] text-ink">
            {formatNumber(breakdown.totalThrown)}
          </div>
          <div className="eyebrow mt-1.5">Throwables used</div>
          {breakdown.thrownPerChapter !== null && (
            <div className="mono mt-1 text-[0.7rem] text-ink-faint">
              {formatMaybe(breakdown.thrownPerChapter, 1)} per chapter
            </div>
          )}
        </div>
        <div>
          <div className="metric text-[1.6rem] text-ink">
            {formatNumber(breakdown.totalConsumed)}
          </div>
          <div className="eyebrow mt-1.5">Consumables used</div>
          {breakdown.healsGiven > 0 && (
            <div className="mono mt-1 text-[0.7rem] text-ink-faint">
              {formatNumber(breakdown.healsGiven)} heal
              {breakdown.healsGiven === 1 ? "" : "s"}
              {breakdown.pillsGiven > 0 &&
                `, ${formatNumber(breakdown.pillsGiven)} pills passed`}
            </div>
          )}
        </div>
        {breakdown.commonKilledByExplosion > 0 && (
          <div>
            <div className="metric text-[1.6rem] text-ink">
              {formatNumber(breakdown.commonKilledByExplosion)}
            </div>
            <div className="eyebrow mt-1.5">Killed by explosion</div>
            <div className="mono mt-1 text-[0.7rem] text-ink-faint">
              not attributed to a thrower
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        {breakdown.throwables.length > 0 && (
          <div>
            <h3 className="eyebrow mb-3 border-b border-rule pb-2">Thrown</h3>
            <ItemRows rows={breakdown.throwables} max={maxThrown} />
          </div>
        )}
        {breakdown.consumables.length > 0 && (
          <div>
            <h3 className="eyebrow mb-3 border-b border-rule pb-2">Used</h3>
            <ItemRows rows={breakdown.consumables} max={maxUsed} />
          </div>
        )}
      </div>

      {breakdown.other.length > 0 && (
        <div>
          <h3 className="eyebrow mb-3 border-b border-rule pb-2">
            Other items
          </h3>
          <ItemRows
            rows={breakdown.other}
            max={Math.max(1, ...breakdown.other.map((r) => r.count))}
          />
        </div>
      )}
    </div>
  );
}

function WeaponRows({
  rows,
  max,
}: {
  rows: WeaponBreakdown["all"];
  max: number;
}) {
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-4">
            <span className="text-[0.85rem] text-ink-dim">{r.label}</span>
            <span className="mono text-[0.72rem] text-ink-mute">
              {formatNumber(r.kills)} kills
              <span className="ml-2 text-ink-faint">
                {formatNumber(r.damage)} dmg
              </span>
            </span>
          </div>
          <Bar value={r.kills} max={max} color={WEAPON_KIND_COLOR[r.kind] ?? "#3a3a42"} />
          <div className="mono mt-1 flex flex-wrap gap-x-3 text-[0.66rem] text-ink-faint">
            {r.shots > 0 && <span>{formatNumber(r.shots)} shots</span>}
            {r.accuracy !== null && <span>{formatPercent(r.accuracy)} hit</span>}
            {r.damagePerKill !== null && (
              <span>{formatMaybe(r.damagePerKill, 0)} dmg/kill</span>
            )}
            {r.headshots > 0 && <span>{formatNumber(r.headshots)} hs</span>}
            {r.ffDamage > 0 && (
              <span className="text-harm">{formatNumber(r.ffDamage)} ff</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function WeaponGroup({
  label,
  note,
  rows,
  children,
}: {
  label: string;
  note?: string;
  rows: WeaponBreakdown["all"];
  /** Replaces the default kill-ranked rows, for a group counted another way. */
  children?: React.ReactNode;
}) {
  if (rows.length === 0 && children === undefined) return null;
  const max = Math.max(1, ...rows.map((r) => r.kills));
  return (
    <div>
      <h3 className="eyebrow mb-3 flex items-baseline justify-between gap-3 border-b border-rule pb-2">
        <span>{label}</span>
        {note && <span className="text-[0.62rem] text-ink-faint">{note}</span>}
      </h3>
      {children ?? <WeaponRows rows={rows} max={max} />}
    </div>
  );
}

/**
 * Thrown items, counted rather than scored.
 *
 * The addon does not attribute a throwable's kills or damage to the thrower
 * -- an explosion's kills land in `common_by_explosion`, unattributed -- so
 * the kill and damage columns the other weapon groups carry would read as
 * zero here and be mistaken for "threw one and missed". Uses are the figure
 * the mod actually records, and they come from `items_used`, the same table
 * the Throwables panel counts, so the two sections agree.
 */
function ThrownRows({ rows }: { rows: ItemRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-4">
            <span className="text-[0.85rem] text-ink-dim">{r.label}</span>
            <span className="mono text-[0.75rem] text-ink-mute">
              {formatNumber(r.count)} used
              {r.share !== null && (
                <span className="ml-2 text-ink-faint">
                  {formatPercent(r.share)}
                </span>
              )}
            </span>
          </div>
          <Bar value={r.count} max={max} color={itemColor(r.key)} />
        </li>
      ))}
    </ul>
  );
}

export function WeaponPanel({
  breakdown,
  thrown = [],
}: {
  breakdown: WeaponBreakdown;
  /**
   * Throwable uses from `items_used`. Optional so call sites that have no
   * item table still render the rest of the panel; the Thrown group is
   * simply absent rather than showing zeroed kill columns.
   */
  thrown?: ItemRow[];
}) {
  // Files from before per-weapon tracking keep the old honest empty state.
  if (!breakdown.perWeaponAvailable) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-x-10 gap-y-6">
          <div>
            <div className="metric text-[1.6rem] text-ink">
              {formatNumber(breakdown.shotsFired)}
            </div>
            <div className="eyebrow mt-1.5">Shots fired</div>
          </div>
          <div>
            <div className="metric text-[1.6rem] text-ink">
              {formatNumber(breakdown.reloads)}
            </div>
            <div className="eyebrow mt-1.5">Reloads</div>
            {breakdown.shotsPerReload !== null && (
              <div className="mono mt-1 text-[0.7rem] text-ink-faint">
                {formatMaybe(breakdown.shotsPerReload, 1)} shots between
              </div>
            )}
          </div>
          <div>
            <div className="metric text-[1.6rem] text-ink">
              {formatPercent(breakdown.headshotRate, 1)}
            </div>
            <div className="eyebrow mt-1.5">Headshot rate</div>
          </div>
        </div>

        <div className="border border-dashed border-rule-bright px-6 py-6">
          <h3 className="eyebrow text-ink-dim">
            Per-weapon breakdown unavailable
          </h3>
          <p className="mt-2.5 max-w-2xl text-[0.8rem] leading-relaxed text-ink-mute">
            {breakdown.unavailableReason}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-x-10 gap-y-6">
        <div>
          <div className="metric text-[1.6rem] text-ink">
            {breakdown.topByKills?.label ?? "—"}
          </div>
          <div className="eyebrow mt-1.5">Most kills</div>
          {breakdown.topByKills && (
            <div className="mono mt-1 text-[0.7rem] text-ink-faint">
              {formatNumber(breakdown.topByKills.kills)} of{" "}
              {formatNumber(breakdown.kills)}
            </div>
          )}
        </div>
        <div>
          <div className="metric text-[1.6rem] text-ink">
            {breakdown.topByDamage?.label ?? "—"}
          </div>
          <div className="eyebrow mt-1.5">Most damage</div>
          {breakdown.topByDamage && (
            <div className="mono mt-1 text-[0.7rem] text-ink-faint">
              {formatNumber(breakdown.topByDamage.damage)} dmg
            </div>
          )}
        </div>
        <div>
          <div className="metric text-[1.6rem] text-ink">
            {formatNumber(breakdown.shotsFired)}
          </div>
          <div className="eyebrow mt-1.5">Shots fired</div>
          {breakdown.shotsPerReload !== null && (
            <div className="mono mt-1 text-[0.7rem] text-ink-faint">
              {formatMaybe(breakdown.shotsPerReload, 1)} per reload
            </div>
          )}
        </div>
        <div>
          <div className="metric text-[1.6rem] text-ink">
            {formatPercent(breakdown.headshotRate, 1)}
          </div>
          <div className="eyebrow mt-1.5">Headshot rate</div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <WeaponGroup label="Firearms" rows={breakdown.firearms} />
        <div className="space-y-8">
          <WeaponGroup label="Melee" rows={breakdown.melee} />
          {thrown.length > 0 && (
            <WeaponGroup
              label="Thrown"
              note="uses; kills are not attributed"
              rows={[]}
            >
              <ThrownRows rows={thrown} />
            </WeaponGroup>
          )}
          <WeaponGroup
            label="Fire & environment"
            note="damage with no shots"
            rows={breakdown.environmental}
          />
        </div>
      </div>

      {/*
        Inference is the single biggest caveat on every number above, so it
        is stated in the panel rather than left for the reader to discover.
      */}
      {breakdown.inferredShare !== null && (
        <div className="border border-dashed border-rule-bright px-6 py-5">
          <h3 className="eyebrow text-ink-dim">
            {formatPercent(breakdown.inferredShare)} inferred
          </h3>
          <p className="mt-2.5 max-w-2xl text-[0.8rem] leading-relaxed text-ink-mute">
            Most kill and damage events carry no weapon field, so the addon
            attributes them to whatever the player last fired. That is a good
            guess between weapon swaps and a wrong one across them: treat the
            split between two weapons carried at once as approximate, and the
            totals as sound.
          </p>
        </div>
      )}

      <p className="text-[0.78rem] leading-relaxed text-ink-faint">
        Hit rate is hits per shot, so a shotgun reads high — one blast lands
        many pellets. Thrown items are counted by use: the addon does not
        credit a throwable&rsquo;s kills or damage to whoever threw it.
      </p>
    </div>
  );
}
