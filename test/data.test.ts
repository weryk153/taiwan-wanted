import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadData } from "../src/lib/data";

describe("loadData", () => {
  it("沒有資料檔時丟出說明怎麼取得資料的錯誤", () => {
    const dir = mkdtempSync(join(tmpdir(), "data-"));
    expect(() => loadData(dir)).toThrow(/pnpm sync/);
  });
  it("讀取 data/wanted.json 與 meta.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "data-"));
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data", "wanted.json"), JSON.stringify([{ id: "x" }]));
    writeFileSync(join(dir, "data", "meta.json"), JSON.stringify({ fetchedAt: "t", sources: {} }));
    const { records, meta } = loadData(dir);
    expect(records).toHaveLength(1);
    expect(meta.fetchedAt).toBe("t");
  });
});
