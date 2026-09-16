import type { NormalizedSession } from "./normalize";
import type { StatsStore } from "./store";

/**
 * A plain-text rendering of the store, for the step-1 debug dump.
 *
 * A raw JSON.stringify of the whole store is thousands of lines and proves
 * nothing at a glance. This prints the things that would actually be wrong
 * if the data layer were broken: rosters, keys, bot/human split, outcomes,
 * the totals-vs-chapters invariant, and every dedupe decision.
 */

function hms(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}h${String(m).padStart(2, "0")}m${String(r).padStart(2, "0")}s`
    : `${m}m${String(r).padStart(2, "0")}s`;
}

function utc(t: number): string {
  return t > 0 ? new Date(t * 1000).toISOString().replace(".000Z", "Z") : "0 (no clock)";
}

function topKeys(t: Record<string, number>, n = 6): string {
  const entries = Object.entries(t)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "(none)";
  const head = entries.slice(0, n).map(([k, v]) => `${k}=${v}`);
  const rest = entries.length - head.length;
  return head.join(" ") + (rest > 0 ? ` (+${rest} more)` : "");
}

/** Deep-compare the recomputed totals against the file's own totals. */
export function totalsDrift(s: NormalizedSession): string[] {
  const drift: string[] = [];
  const rawByKey = new Map(s.totalsRaw.map((p) => [p.key, p]));
  const keys = new Set([
    ...s.totals.map((p) => p.key),
    ...s.totalsRaw.map((p) => p.key),
  ]);
  for (const key of [...keys].sort()) {
    const a = s.totalsByKey[key];
    const b = rawByKey.get(key);
    if (!a) {
      drift.push(`${key}: present in file totals, absent from chapters`);
      continue;
    }
    if (!b) {
      drift.push(`${key}: summed from chapters, absent from file totals`);
      continue;
    }
    const flatA = flattenNumbers(a as unknown as Record<string, unknown>);
    const flatB = flattenNumbers(b as unknown as Record<string, unknown>);
    for (const path of new Set([...Object.keys(flatA), ...Object.keys(flatB)])) {
      const va = flatA[path] ?? 0;
      const vb = flatB[path] ?? 0;
      if (Math.abs(va - vb) > 1e-6) {
        drift.push(`${key}.${path}: chapters=${va} file=${vb}`);
      }
    }
  }
  return drift;
}

/** Every numeric leaf, as dotted paths. */
export function flattenNumbers(
  o: Record<string, unknown>,
  prefix = "",
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "number") out[prefix + k] = v;
    else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenNumbers(v as Record<string, unknown>, `${prefix}${k}.`));
    }
  }
  return out;
}

function sessionLines(s: NormalizedSession): string[] {
  const L: string[] = [];
  const tag = s.official ? "official" : "CUSTOM/WORKSHOP";
  L.push(
    `${s.sessionId}  ${s.campaign}  [${tag}]  ${s.gamemode}  ${s.difficultyLabel} (raw "${s.difficulty}")`,
  );
  L.push(`  file        : ${s.source.fileName} (${s.source.origin})`);
  L.push(
    `  time        : started ${utc(s.startedUtc)}  updated ${utc(s.updatedUtc)}${
      s.timeApproximate ? "  << ORDER APPROXIMATE" : ""
    }`,
  );
  L.push(
    `  duration    : ${hms(s.playtimeS)}  rounds=${s.roundStarts}  saves=${s.saves}`,
  );
  L.push(
    `  state       : ${s.complete ? "complete (finale won)" : "INCOMPLETE"}${
      s.inProgress ? " / in progress" : ""
    }  wipes=${s.wipes}`,
  );
  L.push(`  outcomes    : ${topKeys(s.outcomes, 8)}`);
  L.push(`  chapters    : ${s.chapters.length}`);
  for (const c of s.chapters) {
    const roster = c.players
      .map((p) => `${p.label}${p.kind === "bot" ? "*" : ""}`)
      .join(", ");
    const unknown = c.outcomeRaw !== c.outcome ? ` (raw "${c.outcomeRaw}")` : "";
    L.push(
      `    ${String(c.index).padStart(2)} ${c.map.padEnd(24)} ${c.outcome.padEnd(12)}${unknown} ${hms(
        c.playtime_s,
      ).padStart(7)}  ${c.players.length}p: ${roster}`,
    );
  }
  L.push(`  roster (campaign totals, recomputed from chapters):`);
  for (const p of s.totals) {
    const k = p.offense.kills;
    const totalKills = Object.values(k).reduce((a, b) => a + b, 0);
    const hs = Object.values(p.offense.headshots).reduce((a, b) => a + b, 0);
    L.push(
      `    ${p.key.padEnd(24)} ${p.label.padEnd(10)} ${p.kind.padEnd(10)} ` +
        `${p.character.padEnd(8)} play=${hms(p.playtime_s).padStart(7)} ` +
        `kills=${String(p.offense.total_kills).padStart(4)}(sum ${totalKills}) ` +
        `hs=${String(hs).padStart(3)} deaths=${p.defense.deaths} ` +
        `incaps=${p.defense.incaps} ff=${p.offense.ff_damage}`,
    );
    L.push(`      kills       : ${topKeys(k)}`);
    L.push(`      damage_taken: ${topKeys(p.defense.damage_taken)}`);
    L.push(`      grabbed_by  : ${topKeys(p.defense.grabbed_by)}`);
    L.push(`      incapped_by : ${topKeys(p.defense.incapped_by)}`);
    L.push(`      killed_by   : ${topKeys(p.defense.killed_by)}`);
    L.push(`      items_used  : ${topKeys(p.actions.items_used)}`);
    const pairs = Object.entries(p.teamwork.pairs);
    if (pairs.length === 0) {
      L.push(`      pairs       : (none)`);
    } else {
      for (const [other, pr] of pairs) {
        L.push(
          `      pair -> ${other.padEnd(22)} ff_to=${pr.ff_damage_to} ff_from=${pr.ff_damage_from} ` +
            `revived=${pr.revived} revived_by=${pr.revived_by} healed=${pr.healed} healed_by=${pr.healed_by}`,
        );
      }
    }
  }
  const drift = totalsDrift(s);
  L.push(
    `  totals check: ${
      drift.length === 0
        ? "OK - recomputed totals match the file exactly"
        : `${drift.length} MISMATCH(ES)`
    }`,
  );
  for (const d of drift.slice(0, 10)) L.push(`      ${d}`);
  L.push(`  events_seen : ${Object.keys(s.eventsSeen).length} kinds`);
  return L;
}

export function summarizeStore(store: StatsStore): string {
  const L: string[] = [];
  L.push("=".repeat(78));
  L.push(
    `PSTATS store: ${store.sessions.length} session(s), ${store.failures.length} failure(s), ${store.dropped.length} deduped`,
  );
  L.push("=".repeat(78));

  if (store.dropped.length > 0) {
    L.push("");
    L.push("Dedupe decisions:");
    for (const d of store.dropped) {
      L.push(
        `  ${d.sessionId}: kept ${d.kept} (saves=${d.keptSaves}), dropped ${d.dropped} (saves=${d.droppedSaves}) -- ${d.reason}`,
      );
    }
  }

  if (store.failures.length > 0) {
    L.push("");
    L.push("Files that failed to parse:");
    for (const f of store.failures) {
      L.push(`  ${f.fileName} (${f.origin}): ${f.error}`);
      for (const i of f.issues) L.push(`      ${i}`);
    }
  }

  const allKeys = new Map<string, { label: string; kind: string; sessions: number }>();
  for (const s of store.sessions) {
    for (const p of s.totals) {
      const cur = allKeys.get(p.key);
      if (cur) cur.sessions += 1;
      else allKeys.set(p.key, { label: p.label, kind: p.kind, sessions: 1 });
    }
  }
  L.push("");
  L.push(`Players seen across all sessions (${allKeys.size}):`);
  for (const [key, v] of [...allKeys].sort((a, b) => b[1].sessions - a[1].sessions)) {
    L.push(`  ${key.padEnd(24)} ${v.label.padEnd(10)} ${v.kind.padEnd(10)} in ${v.sessions} session(s)`);
  }

  for (const s of store.sessions) {
    L.push("");
    L.push("-".repeat(78));
    L.push(...sessionLines(s));
  }

  return L.join("\n");
}
