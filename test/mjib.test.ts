import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMjibListPage, parseMjibDetail, fetchMjib } from "../scripts/sources/mjib";
import type { Http } from "../scripts/http";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseMjibListPage", () => {
  it("uid 與頁數", () => {
    const r = parseMjibListPage(fx("mjib-list.html"));
    expect(r.uids).toEqual([483, 482]);
    expect(r.pageCount).toBe(27);
  });
  it("錯誤頁 → 0 筆 1 頁", () => {
    const r = parseMjibListPage(fx("error-page.html"));
    expect(r.uids).toEqual([]);
    expect(r.pageCount).toBe(1);
  });
});

describe("parseMjibDetail", () => {
  const raw = parseMjibDetail(fx("mjib-detail.html"), 483)!;
  it("欄位成對、去空白", () => {
    expect(raw.uid).toBe(483);
    expect(raw.fields["中文姓名"]).toBe("測試甲");
    expect(raw.fields["出生年月日"]).toBe("1950/**/**");
    expect(raw.fields["身分證統一編號"]).toBe("A12345****");
    expect(raw.fields["通緝罪名"]).toBe("貪污");
    expect(raw.fields["涉嫌事實"]).toBe("測試事實，第一行。\n第二行。");
  });
  it("照片是絕對網址", () => {
    expect(raw.photoUrl).toBe("https://www.mjib.gov.tw/FileUploads/prisoner_pic/aaaa.JPG");
  });
  it("錯誤頁 → null", () => {
    expect(parseMjibDetail(fx("error-page.html"), 1)).toBeNull();
  });
});

describe("fetchMjib", () => {
  const list = fx("mjib-list.html");
  const onePage = list.replace(/<li><a href="\/Crimes\/Crimes_List\?page=\d+">\d+<\/a><\/li>/g, "");
  const detail = fx("mjib-detail.html");

  it("逐頁、逐筆", async () => {
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      if (url.includes("Crimes_List")) return new Response(onePage, { status: 200 });
      return new Response(detail, { status: 200 });
    };
    const out = await fetchMjib(http);
    expect(out.skipped).toBe(0);
    expect(out.records.map((r) => r.uid)).toEqual([483, 482]);
    expect(calls.filter((u) => u.includes("Crimes_Detail"))).toHaveLength(2);
  });

  it("多頁去重", async () => {
    const http: Http = async (url) =>
      new Response(url.includes("Crimes_List") ? list : detail, { status: 200 });
    const out = await fetchMjib(http);
    expect(out.records).toHaveLength(2);
  });

  it("非最後一頁解出 0 筆 → 丟錯", async () => {
    const http: Http = async (url) => {
      if (url.includes("page=3")) return new Response(fx("error-page.html"), { status: 200 });
      if (url.includes("Crimes_List")) return new Response(list, { status: 200 });
      return new Response(detail, { status: 200 });
    };
    await expect(fetchMjib(http)).rejects.toThrow(/page 3/);
  });

  it("列表失敗 → 丟錯；詳細頁錯誤頁 → 略過", async () => {
    await expect(fetchMjib(async () => new Response("", { status: 500 }))).rejects.toThrow();
    let n = 0;
    const http: Http = async (url) => {
      if (url.includes("Crimes_List")) return new Response(onePage, { status: 200 });
      n += 1;
      return new Response(n === 1 ? fx("error-page.html") : detail, { status: 200 });
    };
    const out = await fetchMjib(http);
    expect(out.records).toHaveLength(1);
    expect(out.skipped).toBe(1);
  });
});
