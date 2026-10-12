import type { WantedRecord } from "../src/lib/types";

const MAX_DROP_RATIO = 0.3;

/**
 * 判斷一個來源的新資料能不能用。
 * null（抓取失敗）、0 筆、或比上一版少超過 30% → 沿用舊資料並標 stale。
 */
export function guardSource(
  prev: WantedRecord[],
  next: WantedRecord[] | null,
): { records: WantedRecord[]; stale: boolean; reason?: string } {
  if (next === null) return { records: prev, stale: true, reason: "fetch failed" };
  if (next.length === 0) return { records: prev, stale: true, reason: "0 records" };
  if (prev.length > 0 && next.length < prev.length * (1 - MAX_DROP_RATIO)) {
    return { records: prev, stale: true, reason: `dropped ${prev.length} → ${next.length}` };
  }
  return { records: next, stale: false };
}
