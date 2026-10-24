// 參考 legislator-background 的 JList → JDoc / 候選待核對流程。
// 全文僅在記憶體解析，不把完整裁判或證號寫進本站資料。
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { parseJid, judgmentUrl, validDate } from "../src/lib/judgments";
import type { JudgmentMetadata } from "../src/lib/types";

const BASE = "https://data.judicial.gov.tw/jdg/api";
const UA = "taiwan-wanted/1.0 (+https://github.com/weryk153/taiwan-wanted)";
export type JudgmentResult = { status: "available"; metadata: JudgmentMetadata; text: string }
  | { status: "removed" };
export const normalizedText = (text: string) => text.normalize("NFC").replace(/[\s\u200b\ufeff]+/gu, "");

export function metadataFromText(jid: string, title: string, text: string, fetchedAt: string): JudgmentMetadata {
  const id = parseJid(jid);
  if (!id) throw new Error("裁判 ID 格式錯誤");
  const heading = normalizedText(title);
  const body = normalizedText(text);
  if (!heading.includes(id.caseNumber) || !body.includes(id.caseNumber) || body.length < 80) throw new Error("裁判內文或字號不完整");
  const type = body.slice(0, 200).match(/(?:刑事(?:附帶民事(?:訴訟)?)?|民事|行政|懲戒|憲法)(?:判決|裁定)/)?.[0]
    ?? heading.match(/(?:刑事(?:附帶民事(?:訴訟)?)?|民事|行政|懲戒|憲法)(?:判決|裁定)/)?.[0];
  const court = heading.match(/^(.+?法院(?:.{1,8}?分院)?)/)?.[1];
  if (!type || !court) throw new Error("無法確認裁判法院或文書類型");
  return { jid, court, documentType: type, caseNumber: id.caseNumber, date: id.date, fetchedAt,
    contentHash: createHash("sha256").update(body).digest("hex") };
}

export function parseJudgmentHtml(html: string, jid: string, fetchedAt: string): JudgmentResult {
  const $ = cheerio.load(html);
  const root = $(".htmlcontent_print");
  if (!root.length) {
    const body = $("body").text().replace(/\s+/g, "");
    // 只有明確的官方撤下訊息才能刪除，驗證碼、維護或空頁均屬暫時失敗。
    if (/本裁判(?:可能)?未公開或已從系統移除/.test(body)) return { status: "removed" };
    throw new Error("未取得裁判正文（可能維護、驗證或版型改變）");
  }
  root.find("script,style,.line-no,.line-number").remove();
  const text = root.text();
  return { status: "available", text, metadata: metadataFromText(jid, $("title").text(), text, fetchedAt) };
}

export async function fetchPublicJudgment(jid: string, date: string, fetcher = fetch): Promise<JudgmentResult> {
  if (!parseJid(jid)) throw new Error("無效的裁判 ID");
  const res = await fetcher(judgmentUrl(jid), { headers: { "user-agent": UA }, redirect: "error", signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`裁判來源 HTTP ${res.status}`);
  return parseJudgmentHtml(await res.text(), jid, date);
}

export function inApiWindow(now = new Date()) {
  return (now.getUTCHours() + 8) % 24 < 6;
}

async function post(path: string, body: unknown, fetcher: typeof fetch) {
  const res = await fetcher(`${BASE}/${path}`, { method: "POST", headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`司法院 ${path} HTTP ${res.status}`);
  try { return await res.json(); } catch { throw new Error(`司法院 ${path} 未回傳 JSON`); }
}

export interface JudgmentChange { date: string; jid: string }
export function parseChanges(value: unknown): JudgmentChange[] {
  if (!Array.isArray(value)) throw new Error("JList 回應不完整，不能視為沒有異動");
  const out = new Map<string, JudgmentChange>();
  for (const day of value) {
    const date = String(day?.date ?? day?.DATE ?? "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    const list = day?.list ?? day?.LIST;
    if (!validDate(date) || !Array.isArray(list)) throw new Error("JList 日期或清單格式改變");
    for (const jid of list) {
      if (!parseJid(jid)) throw new Error("JList 含無效裁判 ID");
      out.set(`${date}:${jid}`, { date, jid });
    }
  }
  return [...out.values()];
}

export function parseJDoc(value: any, jid: string): { status: "available"; text: string; cause: string } | { status: "removed" } {
  if (typeof value?.error === "string" && /查無資料.*本裁判可能未公開或已從系統移除/.test(value.error)) return { status: "removed" };
  // 驗證失敗、服務時段限制等錯誤不能當成裁判刪除。
  if (!value || value.error) throw new Error("JDoc 服務或驗證失敗，保留既有資料");
  if (value.JID !== jid || !parseJid(value.JID)) throw new Error("JDoc 裁判 ID 不符");
  const text = value.JFULLX?.JFULLCONTENT;
  if (value.JFULLX?.JFULLTYPE !== "text" || typeof text !== "string" || text.trim().length < 80) {
    throw new Error("JDoc 非完整文字裁判，需另行核對原始檔案");
  }
  return { status: "available", text, cause: typeof value.JTITLE === "string" ? value.JTITLE : "" };
}

export async function createJudicialClient(user: string, password: string, fetcher = fetch, now = new Date()) {
  if (!inApiWindow(now)) throw new Error("司法院 API 僅於臺灣時間 00:00–06:00 開放");
  if (!user || !password) throw new Error("請設定 JUDICIAL_API_USER 與 JUDICIAL_API_PASSWORD");
  const auth = await post("Auth", { user, password }, fetcher);
  const token = auth?.Token ?? auth?.token;
  if (typeof token !== "string" || !token) throw new Error("司法院 API 驗證失敗");
  return {
    changes: async () => parseChanges(await post("JList", { token }, fetcher)),
    document: async (jid: string) => {
      if (!parseJid(jid)) throw new Error("無效的裁判 ID");
      return parseJDoc(await post("JDoc", { token, j: jid }, fetcher), jid);
    },
  };
}
