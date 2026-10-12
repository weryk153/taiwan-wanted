import * as cheerio from "cheerio";
import type { Http } from "../http";
import type { MjibRaw } from "../normalize";

const BASE = "https://www.mjib.gov.tw";
const LIST = (page: number) => `${BASE}/Crimes/Crimes_List?page=${page}`;
const DETAIL = (uid: number) => `${BASE}/Crimes/Crimes_Detail?uid=${uid}`;

export function parseMjibListPage(html: string): { uids: number[]; pageCount: number } {
  const $ = cheerio.load(html);
  const uids: number[] = [];
  $('a[href*="Crimes_Detail?uid="]').each((_, a) => {
    const m = ($(a).attr("href") ?? "").match(/uid=(\d+)/);
    if (m) {
      const uid = Number(m[1]);
      if (!uids.includes(uid)) uids.push(uid);
    }
  });
  let pageCount = 1;
  $('a[href*="Crimes_List?page="]').each((_, a) => {
    const m = ($(a).attr("href") ?? "").match(/page=(\d+)/);
    if (m) pageCount = Math.max(pageCount, Number(m[1]));
  });
  return { uids, pageCount };
}

export function parseMjibDetail(html: string, uid: number): MjibRaw | null {
  const $ = cheerio.load(html);
  const root = $(".crimes-detail");
  if (root.length === 0) return null;
  const fields: Record<string, string> = {};
  root.find("ul > li").each((_, li) => {
    const divs = $(li).children("div");
    if (divs.length < 2) return;
    const key = $(divs[0]).text().trim();
    const value = $(divs[1]).text().replace(/\r/g, "").split("\n").map((s) => s.trim()).filter(Boolean).join("\n");
    if (key) fields[key] = value;
  });
  const src = root.find("ul > li img").first().attr("src");
  const photoUrl = src && src.includes("prisoner_pic") ? new URL(src, BASE).toString() : undefined;
  return { uid, photoUrl, fields };
}

export async function fetchMjib(http: Http, log: (m: string) => void = () => {}): Promise<MjibRaw[]> {
  const first = await http(LIST(1));
  if (!first.ok) throw new Error(`mjib list page 1: HTTP ${first.status}`);
  const p1 = parseMjibListPage(await first.text());
  const uids = [...p1.uids];
  for (let page = 2; page <= p1.pageCount; page += 1) {
    const res = await http(LIST(page));
    if (!res.ok) throw new Error(`mjib list page ${page}: HTTP ${res.status}`);
    for (const u of parseMjibListPage(await res.text()).uids) {
      if (!uids.includes(u)) uids.push(u);
    }
  }
  log(`mjib: ${uids.length} uids over ${p1.pageCount} pages`);

  const out: MjibRaw[] = [];
  for (const uid of uids) {
    try {
      const res = await http(DETAIL(uid));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = parseMjibDetail(await res.text(), uid);
      if (!raw) throw new Error("no crimes-detail block");
      out.push(raw);
    } catch (e) {
      log(`mjib: skip ${uid}: ${(e as Error).message}`);
    }
  }
  return out;
}
