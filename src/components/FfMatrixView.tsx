"use client";

import { useState } from "react";
import { formatNumber, type FfMatrix } from "@/lib/metrics";

/**
 * The N x N friendly-fire heatmap.
 *
 * Hand-built rather than a chart library (PLAN.md section 2). Two rules from
 * section 5 drive the rendering:
 *   - pairs only exist where an interaction happened, so an absent pair is a
 *     real zero and renders as an empty cell, not a gap
 *   - the diagonal is not a zero, it is not applicable at all, and must look
 *     different from a genuine zero
 */
export default function FfMatrixView({
  allTime,
  perCampaign,
  options,
}: {
  allTime: FfMatrix;
  perCampaign: Record<string, FfMatrix>;
  options: { sessionId: string; label: string; difficulty: string }[];
}) {
  const [scope, setScope] = useState<string>("all");
  const m = scope === "all" ? allTime : (perCampaign[scope] ?? allTime);

  return (
    <div>
      {/* Scope switch */}
      <div className="scroll-slim mb-8 -mx-6 overflow-x-auto px-6">
        <div className="flex min-w-max gap-px">
          <ScopeButton
            active={scope === "all"}
            onClick={() => setScope("all")}
            label="All time"
          />
          {options.map((o) => (
            <ScopeButton
              key={o.sessionId}
              active={scope === o.sessionId}
              onClick={() => setScope(o.sessionId)}
              label={o.label}
              sub={o.difficulty}
            />
          ))}
        </div>
      </div>

      {m.keys.length === 0 ? (
        <p className="py-8 text-[0.85rem] text-ink-mute">
          No friendly fire recorded in this campaign.
        </p>
      ) : (
        <>
          <Summary m={m} />
          <Matrix m={m} />
          <Ledger m={m} />
        </>
      )}
    </div>
  );
}

function ScopeButton({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-[7rem] border-t-2 px-4 py-2.5 text-left transition-colors ${
        active
          ? "border-t-harm bg-raised text-ink"
          : "border-t-transparent text-ink-mute hover:bg-raised/60 hover:text-ink-dim"
      }`}
    >
      <div className="truncate text-[0.8rem]">{label}</div>
      {sub && (
        <div className="mono mt-0.5 text-[0.6rem] text-ink-faint">{sub}</div>
      )}
    </button>
  );
}

/**
 * The plain-language line PLAN.md section 5 asks for. Written as a finding
 * in a report, not as a joke -- the numbers are funny enough on their own.
 */
function Summary({ m }: { m: FfMatrix }) {
  const worst = m.worst;
  if (!worst || worst.damage === 0) return null;

  const back = m.cell[worst.to]?.[worst.from]?.damage ?? 0;
  const shooter = m.labels[worst.from] ?? worst.from;
  const victim = m.labels[worst.to] ?? worst.to;

  return (
    <div className="mb-8 border-l-2 border-harm pl-5">
      <p className="text-[1rem] leading-relaxed text-ink-dim">
        <span className="text-ink">{shooter}</span> has put{" "}
        <span className="mono text-harm">{formatNumber(worst.damage)}</span>{" "}
        damage into <span className="text-ink">{victim}</span>
        {back > 0 ? (
          <>
            ; <span className="text-ink">{victim}</span> has returned{" "}
            <span className="mono text-ink-dim">{formatNumber(back)}</span>.
          </>
        ) : (
          <>, and has taken nothing back.</>
        )}
      </p>
      {(worst.incaps > 0 || worst.kills > 0) && (
        <p className="mt-2 text-[0.8rem] text-ink-mute">
          That includes {worst.incaps} incapacitation
          {worst.incaps === 1 ? "" : "s"}
          {worst.kills > 0 && ` and ${worst.kills} outright kill${worst.kills === 1 ? "" : "s"}`}
          .
        </p>
      )}
    </div>
  );
}

function Matrix({ m }: { m: FfMatrix }) {
  return (
    <div className="scroll-slim overflow-x-auto">
      <table className="border-collapse">
        <caption className="sr-only">
          Friendly fire damage. Rows are the player who dealt damage, columns
          the player who received it.
        </caption>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-ground px-3 pb-2 text-left">
              <span className="eyebrow">shooter ↓ / hit →</span>
            </th>
            {m.keys.map((k) => (
              <th key={k} scope="col" className="px-1 pb-2 align-bottom">
                <div className="mx-auto w-[4.5rem] truncate text-center text-[0.72rem] text-ink-dim">
                  {m.labels[k] ?? k}
                </div>
              </th>
            ))}
            <th scope="col" className="px-3 pb-2 align-bottom">
              <span className="eyebrow">dealt</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {m.keys.map((from) => {
            const dealt = m.keys.reduce(
              (a, to) => a + (m.cell[from]?.[to]?.damage ?? 0),
              0,
            );
            return (
              <tr key={from}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-ground px-3 py-1 text-left text-[0.78rem] font-normal text-ink-dim"
                >
                  <div className="w-[6rem] truncate">
                    {m.labels[from] ?? from}
                  </div>
                </th>

                {m.keys.map((to) => {
                  const self = from === to;
                  const c = m.cell[from]?.[to];
                  const dmg = c?.damage ?? 0;
                  // Intensity is the only visual encoding; the harm hue is
                  // fixed, so four players never turn into a muddy palette.
                  const intensity = m.max > 0 ? dmg / m.max : 0;
                  return (
                    <td key={to} className="p-[2px]">
                      <div
                        className={`flex h-11 w-[4.5rem] items-center justify-center border ${
                          self
                            ? "border-rule/60 bg-transparent"
                            : "border-rule"
                        }`}
                        style={
                          self
                            ? undefined
                            : {
                                background:
                                  dmg > 0
                                    ? `color-mix(in srgb, #d94f3d ${Math.round(
                                        8 + intensity * 72,
                                      )}%, #0a0a0b)`
                                    : "transparent",
                              }
                        }
                        title={
                          self
                            ? "A player cannot shoot themselves in this metric"
                            : `${m.labels[from] ?? from} → ${
                                m.labels[to] ?? to
                              }: ${formatNumber(dmg)} damage${
                                c?.incaps ? `, ${c.incaps} incap` : ""
                              }${c?.kills ? `, ${c.kills} killed` : ""}`
                        }
                      >
                        {self ? (
                          <span
                            className="text-ink-faint/40"
                            aria-label="not applicable"
                          >
                            ·
                          </span>
                        ) : (
                          <span
                            className={`mono text-[0.78rem] ${
                              dmg === 0
                                ? "text-ink-faint/50"
                                : intensity > 0.45
                                  ? "text-white"
                                  : "text-ink"
                            }`}
                          >
                            {dmg === 0 ? "0" : formatNumber(dmg)}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}

                <td className="px-3 text-right">
                  <span className="mono text-[0.8rem] text-ink-dim">
                    {formatNumber(dealt)}
                  </span>
                </td>
              </tr>
            );
          })}

          <tr>
            <th
              scope="row"
              className="sticky left-0 z-10 bg-ground px-3 pt-2 text-left"
            >
              <span className="eyebrow">taken</span>
            </th>
            {m.keys.map((to) => {
              const taken = m.keys.reduce(
                (a, from) => a + (m.cell[from]?.[to]?.damage ?? 0),
                0,
              );
              return (
                <td key={to} className="px-1 pt-2 text-center">
                  <span className="mono text-[0.8rem] text-ink-dim">
                    {formatNumber(taken)}
                  </span>
                </td>
              );
            })}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Net balance per pair, which is what people actually argue about. */
function Ledger({ m }: { m: FfMatrix }) {
  const pairs: {
    a: string;
    b: string;
    aToB: number;
    bToA: number;
    net: number;
  }[] = [];

  for (let i = 0; i < m.keys.length; i++) {
    for (let j = i + 1; j < m.keys.length; j++) {
      const a = m.keys[i]!;
      const b = m.keys[j]!;
      const aToB = m.cell[a]?.[b]?.damage ?? 0;
      const bToA = m.cell[b]?.[a]?.damage ?? 0;
      if (aToB === 0 && bToA === 0) continue;
      pairs.push({ a, b, aToB, bToA, net: Math.abs(aToB - bToA) });
    }
  }
  pairs.sort((x, y) => y.net - x.net);

  if (pairs.length === 0) return null;

  const mutual = pairs.filter((p) => p.aToB > 0 && p.bToA > 0);
  const oneWay = pairs.filter((p) => p.aToB === 0 || p.bToA === 0);
  const worstTotal = Math.max(...pairs.map((p) => Math.max(p.aToB, p.bToA)));

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-2">
        <h3 className="eyebrow">Net balance, by pair</h3>
        <span className="text-[0.7rem] text-ink-mute">
          {mutual.length > 0
            ? "Mutual exchanges first"
            : "Every exchange here is one-way"}
        </span>
      </div>

      <ul className="divide-y divide-rule/70">
        {[...mutual, ...oneWay].map((p) => {
          const aWins = p.aToB >= p.bToA;
          const shooter = aWins ? p.a : p.b;
          const target = aWins ? p.b : p.a;
          const dealt = Math.max(p.aToB, p.bToA);
          const returned = Math.min(p.aToB, p.bToA);
          const isMutual = returned > 0;
          const total = dealt + returned;

          return (
            <li key={`${p.a}-${p.b}`} className="py-3.5">
              <div className="flex items-baseline justify-between gap-4 text-[0.85rem]">
                <span className="text-ink-dim">
                  <span className="text-ink">
                    {m.labels[shooter] ?? shooter}
                  </span>
                  <span className="text-ink-faint"> → </span>
                  <span className="text-ink">
                    {m.labels[target] ?? target}
                  </span>
                </span>
                <span className="mono text-[0.78rem]">
                  <span className="text-harm">{formatNumber(dealt)}</span>
                  {isMutual ? (
                    <>
                      <span className="text-ink-faint"> · returned </span>
                      <span className="text-ink-dim">
                        {formatNumber(returned)}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-faint"> · nothing back</span>
                  )}
                </span>
              </div>

              {/*
                A one-way exchange has no ratio to show, so it gets a plain
                magnitude bar against the worst pair. Only a mutual exchange
                earns the split bar -- otherwise every row reads 100% and the
                bar carries no information at all.
              */}
              {isMutual ? (
                <div className="mt-2 flex h-[5px] w-full overflow-hidden bg-sunken">
                  <div
                    className="bg-harm"
                    style={{ width: `${(dealt / total) * 100}%` }}
                  />
                  <div
                    className="bg-ink-faint/50"
                    style={{ width: `${(returned / total) * 100}%` }}
                  />
                </div>
              ) : (
                <div className="mt-2 h-[5px] w-full bg-sunken">
                  <div
                    className="h-full bg-harm/70"
                    style={{
                      width: `${worstTotal > 0 ? (dealt / worstTotal) * 100 : 0}%`,
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
