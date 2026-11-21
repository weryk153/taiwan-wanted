import { describe, it, expect, vi } from "vitest";
import { jidFromUrl, judgmentUrl, judgmentTimelines, validJudgment, validProcedure } from "../src/lib/judgments";
import { caseKey, carryReferences, reviewedReferences } from "../src/lib/references";
import { parseJudgmentHtml, metadataFromText, parseChanges, parseJDoc, createJudicialClient, inApiWindow } from "../scripts/judicial-source";
import { refreshJudgments } from "../scripts/judgment-refresh";
import { candidateRecords, reconcileFeed, changeKey, type FeedState } from "../scripts/judicial-candidates";
import type { CaseReference, WantedRecord } from "../src/lib/types";

const jid = "TPDM,114,訴,99,20260102,1";
const title = "臺灣臺北地方法院 114 年度訴字第 99 號刑事判決";
const body = "臺灣臺北地方法院刑事判決 114年度訴字第99號 公訴人 測試檢察官 被 告 測試甲 選任辯護人 測試乙 上列被告因測試案由案件，本院判決如下：主 文 測試甲無罪。理由 本件為測試用文書，不是真實人物、案件或法院裁判。證人測試丙之證述不足以證明犯罪。";
const date = "2026-10-22";
const html = `<title>${title}</title><div class="printBar">版面大小</div><div class="htmlcontent_print">${body}</div>`;
const metadata = metadataFromText(jid, title, body, date);
const item: CaseReference = { kind: "judgment", title, publisher: "測試法院", url: judgmentUrl(jid), caseNumber: metadata.caseNumber,
  publishedAt: metadata.date, checkedAt: "2026-02-01", context: "測試裁判摘要", matchedOn: "測試公司及案發時間相符", judgment: metadata,
  procedure: { stage: "first", scope: "person" } };
const record: WantedRecord = { id: "mjib-test", source: "mjib", name: "測試甲", photo: null, wantedUnit: "測試法院", accusation: "測試案由", category: "其他",
  sourceUrl: "https://www.mjib.gov.tw/test", updatedAt: date, fetchedAt: date };
const reviewed: WantedRecord = { ...record, references: { caseKey: caseKey(record), items: [item],
  review: { checkedAt: "2026-02-01", status: "verified", note: "測試核對結果", queries: ["測試詞"] } } };

describe("官方裁判解析與卡片資料", () => {
  it("只接受官方裁判 ID 與有效日期，拒絕假網域與其他頁面", () => {
    expect(jidFromUrl(judgmentUrl(jid))).toBe(jid);
    for (const url of [judgmentUrl(jid).replace("judicial.gov.tw", "judicial.gov.tw.evil.test"), judgmentUrl(jid).replace("printData", "default"), judgmentUrl(jid.replace("20260102", "20260230"))]) expect(jidFromUrl(url)).toBeUndefined();
    expect(validJudgment(metadata, item)).toBe(true);
    expect(validJudgment({ ...metadata, jid: jid.replace(",99,", ",98,") }, item)).toBe(false);
    expect(validJudgment({ ...metadata, date: "2026-01-03" }, item)).toBe(false);
    expect(validJudgment(metadata, { ...item, caseNumber: "114年度訴字第98號" })).toBe(false);
    expect(validProcedure({ stage: "final", scope: "person" }, item)).toBe(false);
  });
  it("只雜湊裁判正文，版面文字與空白不觸發異動；附帶民事文書以正文標題為準", () => {
    const a = parseJudgmentHtml(html, jid, date);
    const b = parseJudgmentHtml(html.replace("版面大小", "列印比例").replace("測試甲", "測 試 甲"), jid, date);
    expect(a.status === "available" && a.metadata).toEqual(b.status === "available" && b.metadata);
    expect(a.status === "available" && a.metadata.contentHash).toBe(metadata.contentHash);
    const civil = metadataFromText(jid, title, body.replace("刑事判決", "刑事附帶民事訴訟判決"), date);
    expect(civil.documentType).toBe("刑事附帶民事訴訟判決");
    expect(() => metadataFromText(jid, title.replace("99", "98"), body, date)).toThrow();
  });
  it("維護、驗證頁及不完整 HTML 不能當成撤下裁判", () => {
    expect(() => parseJudgmentHtml("<body>系統維護中，請稍後再試</body>", jid, date)).toThrow();
    expect(parseJudgmentHtml("<body>本裁判可能未公開或已從系統移除</body>", jid, date)).toEqual({ status: "removed" });
  });
});

describe("原文更新與撤下", () => {
  it("重抓不變的原文只更新原文檢查日，人工查核日不變", () => {
    const next = refreshJudgments([reviewed], new Map([[jid, { status: "available", metadata: { ...metadata, fetchedAt: "2026-10-23" }, text: body }]]), "2026-10-23")[0];
    expect(next.references?.items[0].checkedAt).toBe("2026-02-01");
    expect(next.references?.items[0].judgment?.fetchedAt).toBe("2026-10-23");
    expect(next.references?.review).toEqual(reviewed.references?.review);
  });
  it.each(["changed", "removed"] as const)("%s 清除舊摘要與整批核對宣稱，保留最少待複核資訊", reason => {
    const result = reason === "removed" ? { status: "removed" as const } : { status: "available" as const, text: body,
      metadata: { ...metadata, contentHash: "b".repeat(64) } };
    const next = refreshJudgments([reviewed], new Map([[jid, result]]), date)[0];
    expect(next.references?.items).toEqual([]);
    expect(next.references?.review).toBeUndefined();
    expect(next.references?.pendingJudgments).toEqual([{ jid, reason, detectedAt: date }]);
    expect(JSON.stringify(next)).not.toContain("測試裁判摘要");
    expect(carryReferences([record], [next])[0].references?.pendingJudgments).toHaveLength(1);
    expect(carryReferences([{ ...record, facts: "案情改變" }], [next])[0].references).toBeUndefined();
    expect(carryReferences([], [next])).toEqual([]);
  });
  it("暫時失敗保留原資料，不增加原文檢查日", () => {
    expect(refreshJudgments([reviewed], new Map(), "2026-10-23")).toEqual([reviewed]);
  });
});

describe("明確關聯的審級時間線", () => {
  const prior = { ...item, procedure: { stage: "first" as const, scope: "person" as const, group: { id: "case-a", label: "測試案件" } } };
  const laterJid = "TPHM,115,上訴,10,20261001,1";
  const later: CaseReference = { ...item, url: judgmentUrl(laterJid), publishedAt: "2026-10-01", checkedAt: date,
    caseNumber: "115年度上訴字第10號",
    judgment: { ...metadata, jid: laterJid, court: "臺灣高等法院", caseNumber: "115年度上訴字第10號", date: "2026-10-01" },
    procedure: { stage: "appeal", scope: "person", group: { id: "case-a", label: "測試案件" }, priorJid: jid } };
  it("按裁判日期排序並連回正確的前審", () => {
    expect(judgmentTimelines([later, prior])[0].items).toEqual([prior, later]);
  });
  it("只有日期、同名、不同案件或缺少前審都不產生時間線", () => {
    expect(judgmentTimelines([item, later])).toEqual([]);
    expect(judgmentTimelines([prior, { ...later, procedure: { ...later.procedure!, priorJid: undefined } }])).toEqual([]);
    expect(judgmentTimelines([prior, { ...later, procedure: { ...later.procedure!, group: { id: "case-b", label: "別案" } } }])).toEqual([]);
    expect(judgmentTimelines([later])).toEqual([]);
    expect(reviewedReferences(record, { caseKey: caseKey(record), items: [{ ...prior, procedure: { ...prior.procedure, priorJid: jid } }] })).toEqual([]);
  });
});

describe("司法院 API 與候選隔離", () => {
  it("JList 依異動日去重，同一 ID 的後續修訂不會被略過", () => {
    expect(parseChanges([{ date: "2026-10-14", list: [jid, jid] }, { DATE: "20261015", LIST: [jid] }])).toEqual([
      { date: "2026-10-14", jid }, { date: "2026-10-15", jid },
    ]);
    expect(() => parseChanges({ error: "驗證失敗" })).toThrow();
    expect(() => parseChanges([{ date: "2026-02-30", list: [] }])).toThrow();
  });
  it("JDoc 只有明確撤下才回報 removed，驗證失敗與 PDF 均待重試", () => {
    expect(parseJDoc({ error: "查無資料，本裁判可能未公開或已從系統移除" }, jid)).toEqual({ status: "removed" });
    expect(() => parseJDoc({ error: "驗證失敗" }, jid)).toThrow();
    expect(() => parseJDoc({ JID: jid, JFULLX: { JFULLTYPE: "file", JFULLCONTENT: body } }, jid)).toThrow();
    expect(() => parseJDoc({ JID: "different", JFULLX: { JFULLTYPE: "text", JFULLCONTENT: body } }, jid)).toThrow();
    expect(parseJDoc({ JID: jid, JFULLX: { JFULLTYPE: "text", JFULLCONTENT: body } }, jid).status).toBe("available");
  });
  it("遵循官方 Token 大寫、請求 token 小寫及 JDoc j 參數，不洩漏驗證回應", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ Token: "fake-token" })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ date: "2026-10-14", list: [jid] }])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ JID: jid, JFULLX: { JFULLTYPE: "text", JFULLCONTENT: body } })));
    const client = await createJudicialClient("test", "fake-secret", fetcher, new Date("2026-10-21T18:00:00Z"));
    expect(await client.changes()).toHaveLength(1);
    expect((await client.document(jid)).status).toBe("available");
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ token: "fake-token", j: jid });
    const bad = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "fake-secret" })));
    await expect(createJudicialClient("test", "fake-secret", bad, new Date("2026-10-21T18:00:00Z"))).rejects.toThrow("司法院 API 驗證失敗");
  });
  it("服務時段外不送出帳密", async () => {
    const f = vi.fn();
    expect(inApiWindow(new Date("2026-10-21T16:00:00Z"))).toBe(true);
    expect(inApiWindow(new Date("2026-10-21T22:00:00Z"))).toBe(false);
    await expect(createJudicialClient("test", "fake-secret", f, new Date("2026-10-22T07:00:00Z"))).rejects.toThrow("00:00–06:00");
    expect(f).not.toHaveBeenCalled();
  });
  it("被告姓名僅產生候選；律師與內文提及的人不配對，同名公告仍分開核對", () => {
    const records = [record, { ...record, id: "cib-other" }, { ...record, id: "lawyer", name: "測試乙" }, { ...record, id: "witness", name: "測試丙" }];
    expect(candidateRecords(body, records).map(r => r.id)).toEqual(["mjib-test", "cib-other"]);
  });
  it("續跑保留未完成清單，異日同 ID 仍抓取，失效公告與過期候選移除", () => {
    const old = { date: "2026-10-14", jid }, revised = { date: "2026-10-15", jid };
    const candidate = { recordId: record.id, caseKey: caseKey(record), jid, changeDate: old.date, detectedAt: date,
      status: "needs_review" as const, signal: "party_name" as const };
    const state: FeedState = { queue: [revised], completed: { [changeKey(old)]: date }, candidates: [candidate] };
    expect(reconcileFeed(state, [old, revised], [record], date).queue).toEqual([revised]);
    expect(reconcileFeed(state, [], [], date).candidates).toEqual([]);
    expect(reconcileFeed(state, [], [{ ...record, accusation: "改變" }], date).candidates).toEqual([]);
    expect(reconcileFeed(state, [], [record], "2026-12-01").candidates).toEqual([]);
  });
});
