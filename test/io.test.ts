import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPrev, writeData, pruneOrphanPhotos } from "../scripts/io";
import type { WantedRecord, Meta } from "../src/lib/types";

const rec = (id: string, updatedAt: string): WantedRecord => ({
  id, source: "cib", name: "測試", photo: null, wantedUnit: "", accusation: "", category: "其他",
  sourceUrl: "", updatedAt, fetchedAt: "2026-01-01T00:00:00.000Z",
});
const meta: Meta = { fetchedAt: "x", sources: { cib: { count: 1, stale: false, errors: 0 }, mjib: { count: 0, stale: false, errors: 0 } } };

describe("io", () => {
  it("readPrev 沒檔案回空陣列", () => {
    expect(readPrev(mkdtempSync(join(tmpdir(), "io-")))).toEqual([]);
  });
  it("writeData 依 updatedAt 倒序、2 空白縮排、結尾換行；readPrev 讀回", async () => {
    const dir = mkdtempSync(join(tmpdir(), "io-"));
    await writeData(dir, [rec("a", "2026-01-01"), rec("b", "2026-03-01")], meta);
    const text = readFileSync(join(dir, "wanted.json"), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text).map((r: WantedRecord) => r.id)).toEqual(["b", "a"]);
    expect(readPrev(dir)).toHaveLength(2);
    expect(JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")).sources.cib.count).toBe(1);
  });
  it("pruneOrphanPhotos 只刪不在 keep 裡的 jpg", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cib-1.jpg"), "");
    writeFileSync(join(dir, "mjib-2.jpg"), "");
    writeFileSync(join(dir, ".gitkeep"), "");
    const removed = await pruneOrphanPhotos(dir, new Set(["cib-1"]));
    expect(removed).toEqual(["mjib-2.jpg"]);
    expect(existsSync(join(dir, "cib-1.jpg"))).toBe(true);
    expect(existsSync(join(dir, ".gitkeep"))).toBe(true);
  });
});
