import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCibListPage, fetchCib } from "../scripts/sources/cib";
import type { Http } from "../scripts/http";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseCibListPage", () => {
  it("只抓 wanted 的 serno，不抓選單的", () => {
    const r = parseCibListPage(fx("cib-list.html"));
    expect(r.sernos).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });
  it("頁數從 select 讀", () => {
    expect(parseCibListPage(fx("cib-list.html")).pageCount).toBe(7);
  });
  it("錯誤頁解出 0 筆、1 頁", () => {
    const r = parseCibListPage(fx("error-page.html"));
    expect(r.sernos).toEqual([]);
    expect(r.pageCount).toBe(1);
  });
});

describe("fetchCib", () => {
  const listHtml = fx("cib-list.html");
  const onePage = listHtml.replace(/<option value="[2-7]">[2-7]<\/option>/g, "");
  const record = fx("cib-record.json");

  it("走過所有分頁，每筆打單筆 JSON", async () => {
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      if (url.includes("/wanted/list?")) return new Response(onePage, { status: 200 });
      if (url.includes("/openData/wanted/data?")) return new Response(record, { status: 200, headers: { "content-type": "application/json" } });
      return new Response("", { status: 404 });
    };
    const out = await fetchCib(http);
    expect(out.map((r) => r.serno)).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
    expect(out[0].data.publishNo).toBe("1150915-1");
    expect(calls.filter((u) => u.includes("/wanted/list?"))).toEqual([
      "https://www.cib.npa.gov.tw/ch/app/wanted/list?module=wanted&id=1889&page=0",
    ]);
    expect(calls.filter((u) => u.includes("/openData/wanted/data?"))).toHaveLength(2);
  });

  it("分頁從 0 開始到 pageCount-1，逐頁抓且去重", async () => {
    const pages: string[] = [];
    const http: Http = async (url) => {
      if (url.includes("/wanted/list?")) { pages.push(url.split("page=")[1]); return new Response(listHtml, { status: 200 }); }
      return new Response(record, { status: 200 });
    };
    const out = await fetchCib(http);
    expect(pages).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    expect(out).toHaveLength(2); // 七頁都回同兩筆 → 去重後 2
  });

  it("列表 HTTP 失敗 → 丟錯", async () => {
    const http: Http = async () => new Response("", { status: 504 });
    await expect(fetchCib(http)).rejects.toThrow();
  });

  it("單筆失敗 → 略過該筆，其餘保留", async () => {
    let n = 0;
    const http: Http = async (url) => {
      if (url.includes("/wanted/list?")) return new Response(onePage, { status: 200 });
      n += 1;
      return n === 1 ? new Response("", { status: 500 }) : new Response(record, { status: 200 });
    };
    const out = await fetchCib(http);
    expect(out).toHaveLength(1);
  });
});
