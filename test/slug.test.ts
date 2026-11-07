import { describe, it, expect } from "vitest";
import { slugify } from "../src/lib/slug";

describe("slugify", () => {
  it("中文保留，斜線、括號、空白換成連字號", () => {
    expect(slugify("臺灣臺中地方檢察署(通緝時效至2062/12/6)")).toBe("臺灣臺中地方檢察署-通緝時效至2062-12-6");
    expect(slugify("臺灣臺北地方檢察署")).toBe("臺灣臺北地方檢察署");
    expect(slugify("臺北、士林地檢 等")).toBe("臺北、士林地檢-等");
  });
  it("頭尾連字號去掉，連續合併", () => {
    expect(slugify("/a//b/")).toBe("a-b");
  });
});
