"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/metrics";

/**
 * Kills per minute by campaign over time (PLAN.md section 5). One of the
 * few places a real chart library earns its keep -- everything else here is
 * hand-built CSS.
 *
 * Deliberately single-series and unfilled: no gradient area, no dots on
 * every point, no second axis. The interesting signal is the shape.
 */
export default function TrendChart({ points }: { points: TrendPoint[] }) {
  const data = points.map((p, i) => ({
    ...p,
    i,
    kpm: p.killsPerMinute ?? 0,
    // Campaigns without a usable rate should not read as a dip to zero.
    hasRate: p.killsPerMinute !== null,
  }));

  return (
    <div className="h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid
            stroke="#1e1e22"
            strokeDasharray="0"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{
              fill: "#6e6e78",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
            }}
            stroke="#1e1e22"
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{
              fill: "#6e6e78",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
            }}
            stroke="#1e1e22"
            tickLine={false}
            width={38}
          />
          <Tooltip
            cursor={{ stroke: "#2c2c33" }}
            contentStyle={{
              background: "#121214",
              border: "1px solid #2c2c33",
              borderRadius: 0,
              fontSize: 12,
            }}
            labelStyle={{ color: "#ededf0", fontWeight: 500 }}
            formatter={(v: number, _n, item) => {
              const p = item.payload as (typeof data)[number];
              return [p.hasRate ? v.toFixed(2) : "no data", "kills/min"];
            }}
          />
          <Line
            type="monotone"
            dataKey="kpm"
            stroke="#d94f3d"
            strokeWidth={2}
            dot={{ r: 3, fill: "#0a0a0b", stroke: "#d94f3d", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: "#d94f3d", stroke: "#0a0a0b" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
