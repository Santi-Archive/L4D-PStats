import { loadFromDisk, pstatsDir } from "./loader.server";
import type { LoadReport } from "./loader.server";

/**
 * One place every page gets its data. Keeps the fs read in a single spot so
 * a future interval-poll (PLAN.md section 9) has one seam to change.
 */
export async function getReport(): Promise<LoadReport> {
  return loadFromDisk();
}

export { pstatsDir };
