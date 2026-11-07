import type { WantedRecord } from "./types";

/** 台／臺互通、英文不分大小寫。 */
const fold = (s: string | undefined) => (s ?? "").replace(/台/g, "臺").toLowerCase();

export function matches(r: WantedRecord, query: string): boolean {
  const needle = fold(query.trim());
  if (!needle) return true;
  return [r.name, r.nameEn, r.accusation, r.wantedUnit].some((v) => fold(v).includes(needle));
}
