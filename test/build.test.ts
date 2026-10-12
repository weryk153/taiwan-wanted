import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { slugify } from "../src/lib/slug";
import { recentlyAdded } from "../src/lib/recent";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p: string) => readFileSync(`${ROOT}/dist/${p}`, "utf8");

const HAS_DATA = existsSync(`${ROOT}/data/wanted.json`);

beforeAll(() => {
  if (HAS_DATA) execSync("pnpm build", { cwd: ROOT, stdio: "inherit" });
}, 300_000);

// master 不含資料；本機先 `pnpm sync`，CI 從 site 分支取。沒有資料就整組略過。
describe.skipIf(!HAS_DATA)("build", () => {
  // skipIf 只略過測試，describe 本體仍會執行，所以沒資料時不要讀檔。
  const records = HAS_DATA ? JSON.parse(readFileSync(`${ROOT}/data/wanted.json`, "utf8")) : [];

  it("首頁可索引、含搜尋框", () => {
    const html = read("index.html");
    expect(html).not.toContain('name="robots"');
    expect(html).toContain('type="search"');
  });
  it("首頁卡片數等於資料筆數加最近新增", () => {
    const meta = JSON.parse(readFileSync(`${ROOT}/data/meta.json`, "utf8"));
    const recent = recentlyAdded(records, meta.fetchedAt, 7).length;
    const html = read("index.html");
    expect(html.match(/data-card="/g)?.length).toBe(records.length + recent);
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
  it("首頁有最近新增區塊與 canonical", () => {
    const html = read("index.html");
    expect(html).toContain("最近 7 天");
    expect(html).toContain('<link rel="canonical" href="https://taiwan-wanted.pages.dev/"');
  });
  it("個人頁有列印按鈕", () => {
    expect(read(`p/${records[0].id}/index.html`)).toContain("window.print()");
  });
  it("feed.xml 是 RSS 且最多 50 筆", () => {
    const xml = read("feed.xml");
    expect(xml).toContain("<rss");
    expect((xml.match(/<item>/g) ?? []).length).toBeLessThanOrEqual(50);
    expect(xml).toContain(`https://taiwan-wanted.pages.dev/p/`);
  });
  it("sitemap 只含可索引頁，不含個人頁", () => {
    expect(existsSync(`${ROOT}/dist/sitemap-index.xml`)).toBe(true);
    const sm = read("sitemap-0.xml");
    expect(sm).toContain("https://taiwan-wanted.pages.dev/about/");
    expect(sm).not.toContain("/p/");
    expect(sm).not.toContain("/og/");
  });
  it("robots.txt 擋個人頁、照片、OG 圖", () => {
    const r = read("robots.txt");
    expect(r).toMatch(/Disallow: \/p\//);
    expect(r).toMatch(/Disallow: \/photos\//);
    expect(r).toMatch(/Disallow: \/og\//);
    expect(r).toContain("Sitemap: https://taiwan-wanted.pages.dev/sitemap-index.xml");
  });
  it("通緝機關頁：卡片數等於該機關筆數", () => {
    const unit = records.find((r: { wantedUnit: string }) => r.wantedUnit).wantedUnit as string;
    const html = read(`unit/${slugify(unit)}/index.html`);
    const n = records.filter((r: { wantedUnit: string }) => r.wantedUnit === unit).length;
    expect(html.match(/data-card="/g)?.length).toBe(n);
    expect(read("unit/index.html")).toContain(unit);
  });
  it("類別頁：卡片數等於該類別筆數", () => {
    const n = records.filter((r: { category: string }) => r.category === "詐欺").length;
    expect(read("c/詐欺/index.html").match(/data-card="/g)?.length).toBe(n);
  });
  it("about 有回報下架的 GitHub Issues 連結", () => {
    expect(read("about/index.html")).toContain("github.com/weryk153/taiwan-wanted/issues");
  });
});
