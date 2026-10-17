import { describe, it, expect } from "vitest";
import { matches } from "../src/lib/search";
import type { WantedRecord } from "../src/lib/types";

const rec = (over: Partial<WantedRecord>): WantedRecord => ({
  id: "x", source: "cib", name: "測試", photo: null, wantedUnit: "臺灣臺北地方檢察署", accusation: "詐欺", category: "詐欺",
  sourceUrl: "", updatedAt: "2026-01-01", fetchedAt: "", ...over,
});

describe("matches", () => {
  it("空字串全部命中", () => expect(matches(rec({}), "  ")).toBe(true));
  it("台／臺 互通", () => {
    expect(matches(rec({}), "台北")).toBe(true);
    expect(matches(rec({ wantedUnit: "台灣台中地方法院" }), "臺中")).toBe(true);
  });
  it("英文姓名不分大小寫", () => expect(matches(rec({ nameEn: "LEE, GUI CHONG" }), "lee")).toBe(true));
  it("比對姓名、罪名、機關", () => {
    expect(matches(rec({ name: "王小明" }), "小明")).toBe(true);
    expect(matches(rec({}), "詐欺")).toBe(true);
    expect(matches(rec({}), "毒品")).toBe(false);
  });
});
