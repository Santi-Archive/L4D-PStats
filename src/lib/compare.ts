/**
 * Deciding which side of a comparison leads.
 *
 * Kept out of the component so the rule is testable on its own: it is the
 * one piece of the compare page that can be quietly wrong in a way the
 * screen would not show — a row that silently awards the lead to the larger
 * number when larger is worse reads as perfectly normal.
 *
 * Three rules, all of them about not overclaiming:
 *
 * 1. Direction is declared per row, never assumed. More kills is better;
 *    more deaths is not; more playtime is neither. A row with no direction
 *    (`better: "none"`) is context, and ties regardless of which number is
 *    larger.
 *
 * 2. A missing value never wins and never loses. Two players with no
 *    recorded shots are tied at "no data", not tied at zero — the same rule
 *    `metrics.ts` follows when it returns null rather than 0.
 *
 * 3. Equal is a tie, not a win for whoever was passed first.
 */

export interface CompareRow {
  label: string;
  /** Hover note, for a metric whose definition is not self-evident. */
  title?: string;
  /** Formatted for display. */
  a: string;
  b: string;
  /** Raw, for deciding the lead. Null where the metric does not exist. */
  aValue: number | null;
  bValue: number | null;
  /** Which direction is the better one, if either. */
  better: "high" | "low" | "none";
  /** Sub-label under the figure, e.g. a count behind a rate. */
  aSub?: string;
  bSub?: string;
}

export interface CompareGroup {
  label: string;
  rows: CompareRow[];
}

export type Lead = "a" | "b" | "tie";

export function leadOf(r: CompareRow): Lead {
  if (r.better === "none") return "tie";
  if (r.aValue === null || r.bValue === null) return "tie";
  if (r.aValue === r.bValue) return "tie";
  const aWins = r.better === "high" ? r.aValue > r.bValue : r.aValue < r.bValue;
  return aWins ? "a" : "b";
}

/** Count the rows each side leads, for the summary line. */
export function tally(groups: CompareGroup[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const g of groups) {
    for (const r of g.rows) {
      const lead = leadOf(r);
      if (lead === "a") a += 1;
      else if (lead === "b") b += 1;
    }
  }
  return { a, b };
}
