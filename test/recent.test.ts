import { describe, it, expect } from "vitest";
import { recentlyAdded } from "../src/lib/recent";
import type { WantedRecord } from "../src/lib/types";

const rec = (id: string, publishedAt?: string): WantedRecord => ({
  id, source: "cib", name: id, photo: null, wantedUnit: "", accusation: "", category: "其他",
  sourceUrl: "", publishedAt, updatedAt: publishedAt ?? "2020-01-01", fetchedAt: "",
});

describe("recentlyAdded", () => {
  const now = "2026-10-12T22:00:00.000Z";
  it("取 publishedAt 在 7 天內的，新到舊", () => {
    const out = recentlyAdded([rec("a", "2026-10-01"), rec("b", "2026-10-10"), rec("c", "2026-10-12"), rec("d")], now, 7);
    expect(out.map((r) => r.id)).toEqual(["c", "b"]);
  });
  it("邊界：剛好 7 天算，8 天不算", () => {
    expect(recentlyAdded([rec("x", "2026-10-05")], now, 7)).toHaveLength(1);
    expect(recentlyAdded([rec("y", "2026-10-04")], now, 7)).toHaveLength(0);
  });
  it("沒有 publishedAt 的不算", () => {
    expect(recentlyAdded([rec("z")], now, 7)).toHaveLength(0);
  });
});
