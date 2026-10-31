import type { CaseReference, JudgmentMetadata, JudgmentProcedure, PendingJudgment } from "./types";

export const STAGE_LABELS = { first: "第一審", appeal: "第二審", supreme: "最高法院", retrial: "更審", other: "其他程序" } as const;
export const validDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const safeText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 200 && !/[A-Z][12]\d{8}/.test(v);

export function parseJid(jid: unknown) {
  if (typeof jid !== "string") return undefined;
  const m = jid.match(/^([A-Z]{2,5}[MVAPC]),(\d{1,3}),([^,\s<>]{1,20}),(\d{1,8}),(\d{4})(\d{2})(\d{2}),(\d+)$/u);
  if (!m) return undefined;
  const date = `${m[5]}-${m[6]}-${m[7]}`;
  if (!validDate(date)) return undefined;
  return { jid, courtCode: m[1], date, caseNumber: `${m[2]}年度${m[3]}字第${m[4]}號` };
}

export function jidFromUrl(value: string): string | undefined {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.hostname !== "judgment.judicial.gov.tw" || u.username || u.password
      || !/^\/FJUD\/(?:printData|data)\.aspx$/i.test(u.pathname)) return;
    return parseJid(u.searchParams.get("id"))?.jid;
  } catch { return; }
}

export const judgmentUrl = (jid: string) => `https://judgment.judicial.gov.tw/FJUD/printData.aspx?id=${encodeURIComponent(jid)}`;

export function validJudgment(value: unknown, item: CaseReference): value is JudgmentMetadata {
  if (!value || typeof value !== "object") return false;
  const j = value as JudgmentMetadata;
  const id = parseJid(j.jid);
  return item.kind === "judgment" && Boolean(id) && j.jid === jidFromUrl(item.url)
    && j.date === id?.date && j.date === item.publishedAt && j.caseNumber === id?.caseNumber
    && Boolean(item.caseNumber?.replace(/\s+/g, "").endsWith(j.caseNumber))
    && safeText(j.court) && /法院/.test(j.court) && safeText(j.documentType)
    && /^(?:刑事(?:附帶民事(?:訴訟)?)?|民事|行政|懲戒|憲法)(?:判決|裁定)$/.test(j.documentType)
    && /^[a-f0-9]{64}$/.test(j.contentHash) && validDate(j.fetchedAt) && j.fetchedAt >= j.date;
}

export function validProcedure(value: unknown, item: CaseReference): value is JudgmentProcedure {
  if (!value || typeof value !== "object" || item.kind !== "judgment" || !jidFromUrl(item.url)) return false;
  const p = value as JudgmentProcedure;
  return Object.hasOwn(STAGE_LABELS, p.stage) && ["person", "related"].includes(p.scope)
    && (p.group === undefined || (Boolean(p.group) && /^[a-z0-9-]{1,64}$/.test(p.group.id) && safeText(p.group.label)))
    && (p.priorJid === undefined || (Boolean(p.group) && Boolean(parseJid(p.priorJid)) && p.priorJid !== jidFromUrl(item.url)));
}

export function validPendingJudgment(value: unknown): value is PendingJudgment {
  if (!value || typeof value !== "object") return false;
  const p = value as PendingJudgment;
  return Boolean(parseJid(p.jid)) && ["changed", "removed"].includes(p.reason) && validDate(p.detectedAt);
}

/** 只有明確前審關聯的分組才畫時間線；同名、同日、不同案件不會串在一起。 */
export function judgmentTimelines(items: CaseReference[]) {
  const groups = new Map<string, CaseReference[]>();
  for (const item of items) {
    const p = item.procedure;
    if (!item.judgment || !validJudgment(item.judgment, item) || !p || !validProcedure(p, item) || !p.group) continue;
    const key = p.group.id;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].flatMap(([id, entries]) => {
    const sorted = [...entries].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
    if (sorted.length < 2 || new Set(sorted.map(x => x.judgment!.jid)).size !== sorted.length
      || new Set(sorted.map(x => x.procedure!.group!.label)).size !== 1) return [];
    // 一條完整的已收錄鏈；缺漏前審或日期矛盾時仍保留卡片，但不宣稱有審級關聯。
    if (sorted[0].procedure!.priorJid || sorted.slice(1).some((x, i) => x.procedure!.priorJid !== sorted[i].judgment!.jid)) return [];
    return [{ id, label: sorted[0].procedure!.group!.label, items: sorted }];
  });
}
