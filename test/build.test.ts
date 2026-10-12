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
  it("整份 wanted.json 與 dist/data.json 都沒有完整證號格式", () => {
    expect(readFileSync(`${ROOT}/data/wanted.json`, "utf8")).not.toMatch(/[A-Z][12]\d{8}/);
    expect(read("data.json")).not.toMatch(/[A-Z][12]\d{8}/);
  });
  it("照片與 OG 圖有 X-Robots-Tag noindex", () => {
    const h = read("_headers");
    expect(h).toMatch(/\/photos\/\*\n\s+X-Robots-Tag: noindex/);
    expect(h).toMatch(/\/og\/\*\n\s+X-Robots-Tag: noindex/);
  });
  it("個人頁 noindex、連回官方、含資料日期", () => {
    const r = records[0];
    const html = read(`p/${r.id}/index.html`);
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain(r.sourceUrl.replace(/&/g, "&amp;"));
    expect(html).toContain(r.fetchedAt.slice(0, 10));
    expect(html).not.toMatch(/[A-Z][12]\d{8}/);
  });
  it("每筆都有個人頁", () => {
    for (const r of records) expect(existsSync(`${ROOT}/dist/p/${r.id}/index.html`)).toBe(true);
  });
  it("data.json 筆數一致", () => {
    expect(JSON.parse(read("data.json"))).toHaveLength(records.length);
  });
  it("404 不含任何姓名", () => {
    const html = read("404.html");
    expect(html).toContain("已不在官方公告中");
    for (const r of records.slice(0, 20)) expect(html).not.toContain(r.name);
  });
  it("每筆都有 OG 圖", () => {
    for (const r of records.slice(0, 5)) expect(existsSync(`${ROOT}/dist/og/${r.id}.png`)).toBe(true);
  });
  it("about 有回報下架的 GitHub Issues 連結", () => {
    expect(read("about/index.html")).toContain("github.com/weryk153/taiwan-wanted/issues");
  });
});
