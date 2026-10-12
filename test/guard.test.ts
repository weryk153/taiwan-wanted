import { describe, it, expect } from "vitest";
import { guardSource } from "../scripts/guard";
import type { WantedRecord } from "../src/lib/types";

const rec = (id: string): WantedRecord => ({
  id, source: "cib", name: "測試", photo: null, wantedUnit: "", accusation: "", category: "其他",
  sourceUrl: "", updatedAt: "2026-01-01", fetchedAt: "2026-01-01T00:00:00.000Z",
});
const many = (n: number, prefix = "a") => Array.from({ length: n }, (_, i) => rec(`${prefix}${i}`));

describe("guardSource", () => {
  it("正常：用新資料", () => {
    const r = guardSource(many(10), many(9, "b"));
    expect(r.stale).toBe(false);
    expect(r.records.map((x) => x.id)).toEqual(many(9, "b").map((x) => x.id));
  });
  it("抓取失敗（null）→ 沿用舊資料", () => {
    const r = guardSource(many(10), null);
    expect(r.stale).toBe(true);
    expect(r.records).toHaveLength(10);
  });
  it("0 筆 → stale", () => {
    expect(guardSource(many(10), []).stale).toBe(true);
  });
  it("掉超過 30% → stale", () => {
    expect(guardSource(many(100), many(69, "b")).stale).toBe(true);
    expect(guardSource(many(100), many(70, "b")).stale).toBe(false);
  });
  it("第一次（舊資料空）且有新資料 → 不 stale", () => {
    const r = guardSource([], many(3));
    expect(r.stale).toBe(false);
    expect(r.records).toHaveLength(3);
  });
  it("第一次且 0 筆 → stale 但 records 空", () => {
    const r = guardSource([], []);
    expect(r.stale).toBe(true);
    expect(r.records).toEqual([]);
  });
});
