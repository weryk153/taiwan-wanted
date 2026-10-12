import type { WantedRecord } from "../src/lib/types";

const MAX_DROP_RATIO = 0.3;
const MAX_SKIP_RATIO = 0.05;

/**
 * 判斷一個來源的新資料能不能用。
 * null（抓取失敗）、0 筆、比上一版少超過 30%、或單筆略過超過 5% → 沿用舊資料並標 stale。
 */
export function guardSource(
  prev: WantedRecord[],
  next: WantedRecord[] | null,
  skipped = 0,
): { records: WantedRecord[]; stale: boolean; reason?: string } {
  if (next === null) return { records: prev, stale: true, reason: "fetch failed" };
  if (next.length === 0) return { records: prev, stale: true, reason: "0 records" };
  if (skipped > (next.length + skipped) * MAX_SKIP_RATIO) {
    return { records: prev, stale: true, reason: `skipped ${skipped} of ${next.length + skipped}` };
  }
  if (prev.length > 0 && next.length < prev.length * (1 - MAX_DROP_RATIO)) {
    return { records: prev, stale: true, reason: `dropped ${prev.length} → ${next.length}` };
  }
  return { records: next, stale: false };
}
