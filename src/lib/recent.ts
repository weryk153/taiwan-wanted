import type { WantedRecord } from "./types";

/** publishedAt 在 now 的日期往前 days 天內（含當天）的記錄，新到舊。沒有 publishedAt 的不算。以日為單位比較。 */
export function recentlyAdded(records: WantedRecord[], now: string, days: number): WantedRecord[] {
  const cutoff = new Date(new Date(now.slice(0, 10) + "T00:00:00Z").getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return records
    .filter((r) => r.publishedAt && r.publishedAt >= cutoff)
    .sort((a, b) => (a.publishedAt! < b.publishedAt! ? 1 : a.publishedAt! > b.publishedAt! ? -1 : a.id.localeCompare(b.id)));
}
