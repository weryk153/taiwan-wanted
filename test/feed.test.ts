import { describe, it, expect } from "vitest";
import { buildFeed } from "../src/lib/feed";
import type { WantedRecord } from "../src/lib/types";

const rec = (id: string, publishedAt: string, name = "測試 <甲> & 乙"): WantedRecord => ({
  id, source: "mjib", name, photo: null, wantedUnit: "臺灣臺北地方檢察署", accusation: "詐欺", category: "詐欺",
  sourceUrl: "", publishedAt, updatedAt: publishedAt, fetchedAt: "",
});

describe("buildFeed", () => {
  const xml = buildFeed([rec("mjib-1", "2026-10-01"), rec("mjib-2", "2026-10-10")], "https://example.test", 50);
  it("是 RSS 2.0，新到舊", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<rss");
    expect(xml.indexOf("mjib-2")).toBeLessThan(xml.indexOf("mjib-1"));
  });
  it("跳脫 XML 特殊字元", () => {
    expect(xml).toContain("測試 &lt;甲&gt; &amp; 乙");
    expect(xml).not.toContain("<甲>");
  });
  it("連結是絕對網址", () => {
    expect(xml).toContain("<link>https://example.test/p/mjib-2</link>");
  });
  it("上限筆數", () => {
    const many = Array.from({ length: 60 }, (_, i) => rec(`m-${i}`, `2026-01-${String((i % 28) + 1).padStart(2, "0")}`));
    expect((buildFeed(many, "https://x", 50).match(/<item>/g) ?? []).length).toBe(50);
  });
});
