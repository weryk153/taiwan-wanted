import { describe, it, expect } from "vitest";
import { CATEGORIES } from "../src/lib/types";

describe("types", () => {
  it("分類順序固定，其他在最後", () => {
    expect(CATEGORIES).toEqual([
      "殺人傷害", "性侵", "毒品", "詐欺", "貪污", "洗錢", "槍砲", "組織犯罪", "其他",
    ]);
  });
});
