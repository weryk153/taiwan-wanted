import { describe, expect, it } from "vitest";
import { carryReferences, caseKey, referenceReview, reviewedReferences, validReference, validReview } from "../src/lib/references";
import type { CaseReference, ReferenceReview, WantedRecord } from "../src/lib/types";

const record: WantedRecord = {
  id: "mjib-test", source: "mjib", name: "測試人物", photo: null,
  wantedUnit: "測試法院", accusation: "測試案由", category: "其他",
  facts: "測試公司於特定期間的案件", sourceUrl: "https://www.mjib.gov.tw/example",
  updatedAt: "2026-01-01", fetchedAt: "2026-01-01T00:00:00Z",
};
const item: CaseReference = {
  kind: "judgment", title: "測試刑事判決", publisher: "測試法院",
  url: "https://judgment.judicial.gov.tw/example", caseNumber: "測試案號",
  publishedAt: "2025-01-01", checkedAt: "2026-01-01",
  context: "二審，未確認是否確定。", matchedOn: "姓名以外，案件公司及時間均相符。",
};
const reviewed = { ...record, references: { caseKey: caseKey(record), items: [item] } };

describe("逐筆核對的案件來源", () => {
  it("每日同步保留已核對連結，不因擷取時間改變而遺失", () => {
    const next = { ...record, fetchedAt: "2026-02-01T00:00:00Z", updatedAt: "2026-02-01" };
    expect(carryReferences([next], [reviewed])[0].references?.items).toEqual([item]);
  });
  it.each(["id", "name", "sourceUrl", "accusation", "facts", "wantedUnit", "birthYear"] as const)("%s 改變後停止顯示，不能沿用舊的核對結果", (field) => {
    const changed = { ...reviewed, [field]: field === "birthYear" ? 1980 : "已改變" };
    expect(reviewedReferences(changed)).toEqual([]);
    expect(carryReferences([changed], [reviewed])[0].references).toBeUndefined();
  });
  it("同名但不同公告不自動配對，移除的公告不再輸出", () => {
    expect(carryReferences([{ ...record, id: "cib-another" }], [reviewed])[0].references).toBeUndefined();
    expect(carryReferences([], [reviewed])).toEqual([]);
  });
  it.each(["javascript:alert(1)", "http://judgment.judicial.gov.tw/x", "https://judgment.judicial.gov.tw.evil.test/x", "https://user:pass@judgment.judicial.gov.tw/x"])("拒絕不安全或冒充官方的裁判網址 %s", (url) => {
    expect(validReference({ ...item, url })).toBe(false);
  });
  it("拒絕缺少核對依據、錯誤日期或完整證號的來源", () => {
    expect(validReference({ ...item, matchedOn: "" })).toBe(false);
    expect(validReference({ ...item, publishedAt: "2025-02-30" })).toBe(false);
    expect(validReference({ ...item, checkedAt: "2024-01-01" })).toBe(false);
    expect(validReference({ ...item, context: "A123456789" })).toBe(false);
    expect(validReference({ ...item, caseNumber: undefined })).toBe(false);
  });
  it("讀取時過濾無效資料及重複網址", () => {
    expect(reviewedReferences(record, { caseKey: caseKey(record), items: [null, item, item] })).toEqual([item]);
  });
  it.each(["no_match", "unavailable"] as const)("沒有連結也保留 %s 查核結果及原核對日期", (status) => {
    const review: ReferenceReview = { status, checkedAt: "2026-01-01", note: "本輪尚未取得能確認對應的來源。", queries: ["測試人物 測試公司 判決"] };
    const prev = { ...record, references: { caseKey: caseKey(record), items: [], review } };
    const [next] = carryReferences([{ ...record, fetchedAt: "2026-02-01T00:00:00Z" }], [prev]);
    expect(referenceReview(next)).toEqual(review);
    expect(reviewedReferences(next)).toEqual([]);
    expect(referenceReview({ ...next, facts: "不同案件" })).toBeUndefined();
  });
  it("連結無效或查核結果矛盾時不宣稱已核實", () => {
    const review = { status: "verified", checkedAt: "2026-01-01", note: "核對完成", queries: ["測試人物"] };
    expect(referenceReview(record, { caseKey: caseKey(record), items: [], review })).toBeUndefined();
    expect(referenceReview(record, { caseKey: caseKey(record), items: [{ ...item, url: "javascript:alert(1)" }], review })).toBeUndefined();
    expect(referenceReview(record, { caseKey: caseKey(record), items: [item], review })).toEqual(review);
    expect(referenceReview(record, { caseKey: caseKey(record), items: [item], review: { ...review, status: "no_match" } })).toBeUndefined();
  });
  it("查核紀錄必須含有效日期、結果、說明與實際搜尋詞", () => {
    const review = { status: "no_match", checkedAt: "2026-01-01", note: "未確認", queries: ["測試人物"] };
    expect(validReview(review)).toBe(true);
    for (const change of [{ status: "unknown" }, { checkedAt: "2026-02-30" }, { note: "" }, { queries: [] }, { queries: [""] }]) {
      expect(validReview({ ...review, ...change })).toBe(false);
    }
  });
});
