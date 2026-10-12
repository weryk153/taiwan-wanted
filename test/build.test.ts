import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p: string) => readFileSync(`${ROOT}/dist/${p}`, "utf8");

beforeAll(() => {
  execSync("pnpm build", { cwd: ROOT, stdio: "inherit" });
}, 300_000);

describe("build", () => {
  const records = JSON.parse(readFileSync(`${ROOT}/data/wanted.json`, "utf8"));

  it("首頁可索引、含搜尋框", () => {
    const html = read("index.html");
    expect(html).not.toContain('name="robots"');
    expect(html).toContain('type="search"');
  });
  it("首頁卡片數等於資料筆數", () => {
    const html = read("index.html");
    expect(html.match(/data-card="/g)?.length).toBe(records.length);
  });
  it("首頁不含完整身分證格式", () => {
    expect(read("index.html")).not.toMatch(/[A-Z][12]\d{8}/);
  });
  it("dist 存在", () => expect(existsSync(`${ROOT}/dist`)).toBe(true));
});
