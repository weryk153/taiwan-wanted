import * as cheerio from "cheerio";
import type { Http } from "../http";
import type { CibRaw, CibJson } from "../normalize";

const BASE = "https://www.cib.npa.gov.tw";
const LIST = `${BASE}/ch/app/wanted/list?module=wanted&id=1889`;
const RECORD = (serno: string) =>
  `${BASE}/ch/app/openData/wanted/data?module=wanted&serno=${serno}&type=json`;

export function parseCibListPage(html: string): { sernos: string[]; pageCount: number } {
  const $ = cheerio.load(html);
  const sernos: string[] = [];
  $('a[href*="/wanted/view?"]').each((_, a) => {
    const m = ($(a).attr("href") ?? "").match(/serno=([0-9a-f-]{36})/);
    if (m && !sernos.includes(m[1])) sernos.push(m[1]);
  });
  const pageCount = Math.max(1, $("select#page option").length);
  return { sernos, pageCount };
}

export async function fetchCib(http: Http, log: (m: string) => void = () => {}): Promise<CibRaw[]> {
  // 刑事局的 page 參數從 0 起算：page=0 是最新的 16 筆，最後一頁是 pageCount-1。
  const first = await http(`${LIST}&page=0`);
  if (!first.ok) throw new Error(`cib list page 0: HTTP ${first.status}`);
  const p1 = parseCibListPage(await first.text());
  const sernos = [...p1.sernos];
  for (let page = 1; page < p1.pageCount; page += 1) {
    const res = await http(`${LIST}&page=${page}`);
    if (!res.ok) throw new Error(`cib list page ${page}: HTTP ${res.status}`);
    for (const s of parseCibListPage(await res.text()).sernos) {
      if (!sernos.includes(s)) sernos.push(s);
    }
  }
  log(`cib: ${sernos.length} sernos over ${p1.pageCount} pages`);

  const out: CibRaw[] = [];
  for (const serno of sernos) {
    try {
      const res = await http(RECORD(serno));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CibJson;
      if (!data || typeof data.subject !== "string") throw new Error("unexpected JSON shape");
      out.push({ serno, data });
    } catch (e) {
      log(`cib: skip ${serno}: ${(e as Error).message}`);
    }
  }
  return out;
}
