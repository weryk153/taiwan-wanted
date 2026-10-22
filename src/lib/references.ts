import { createHash } from "node:crypto";
import type { CaseReference, ReferenceReview, ReviewedReferences, WantedRecord } from "./types";
import { validJudgment, validProcedure, validPendingJudgment } from "./judgments";

export const REFERENCE_LABELS = {
  judgment: "司法裁判", official: "官方案件說明", news: "新聞報導",
} as const;

/** 使用公告 ID 和案情核對，不按姓名自動配對；同步時間與照片變動不影響關聯。 */
export function caseKey(r: WantedRecord): string {
  return createHash("sha256").update(JSON.stringify([
    r.id, r.source, r.sourceUrl, r.name, r.nameEn, r.birthDate, r.birthYear,
    r.idMasked, r.wantedUnit, r.accusation, r.reason, r.facts, r.publishedAt,
  ])).digest("hex");
}

const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0
  && v.length <= 1500 && !/[A-Z][12]\d{8}/.test(v);

export function validReference(value: unknown): value is CaseReference {
  if (!value || typeof value !== "object") return false;
  const r = value as CaseReference;
  if (!["judgment", "official", "news"].includes(r.kind)
    || ![r.title, r.publisher, r.context, r.matchedOn, r.url].every(text)
    || !date(r.publishedAt) || !date(r.checkedAt) || r.publishedAt > r.checkedAt
    || (r.caseNumber !== undefined && !text(r.caseNumber))
    || (r.kind === "judgment" && !text(r.caseNumber))
    || (r.judgment !== undefined && !validJudgment(r.judgment, r))
    || (r.procedure !== undefined && !validProcedure(r.procedure, r))) return false;
  try {
    const u = new URL(r.url);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    if (r.kind === "judgment" && !u.hostname.endsWith(".judicial.gov.tw")) return false;
    if (r.kind === "official" && !u.hostname.endsWith(".gov.tw")) return false;
    return true;
  } catch { return false; }
}

export function reviewedReferences(r: WantedRecord, value: unknown = r.references): CaseReference[] {
  if (!value || typeof value !== "object") return [];
  const refs = value as ReviewedReferences;
  if (refs.caseKey !== caseKey(r) || !Array.isArray(refs.items)) return [];
  const seen = new Set<string>();
  return refs.items.filter((item) => {
    if (!validReference(item) || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export function validReview(value: unknown): value is ReferenceReview {
  if (!value || typeof value !== "object") return false;
  const review = value as ReferenceReview;
  return date(review.checkedAt) && ["verified", "no_match", "unavailable"].includes(review.status)
    && text(review.note) && Array.isArray(review.queries) && review.queries.length > 0
    && review.queries.every(text);
}

export function referenceReview(r: WantedRecord, value: unknown = r.references): ReferenceReview | undefined {
  if (!value || typeof value !== "object") return undefined;
  const refs = value as ReviewedReferences;
  if (refs.caseKey !== caseKey(r) || !validReview(refs.review)) return undefined;
  const items = reviewedReferences(r, value);
  if ((refs.review.status === "verified") !== (items.length > 0)) return undefined;
  return refs.review;
}

export function pendingJudgments(r: WantedRecord, value: unknown = r.references) {
  if (!value || typeof value !== "object") return [];
  const refs = value as ReviewedReferences;
  if (refs.caseKey !== caseKey(r) || !Array.isArray(refs.pendingJudgments)) return [];
  return refs.pendingJudgments.filter(validPendingJudgment);
}

/** 只延續仍存在且案情一致的公告；已下架與改寫的公告不保留關聯資料。 */
export function carryReferences(next: WantedRecord[], prev: WantedRecord[]): WantedRecord[] {
  const byId = new Map(prev.map((r) => [r.id, r]));
  return next.map((record) => {
    const { references: _discard, ...r } = record;
    const items = reviewedReferences(r, byId.get(r.id)?.references);
    const review = referenceReview(r, byId.get(r.id)?.references);
    const pending = pendingJudgments(r, byId.get(r.id)?.references);
    return items.length || review || pending.length ? { ...r, references: { caseKey: caseKey(r), items, ...(review ? { review } : {}), ...(pending.length ? { pendingJudgments: pending } : {}) } } : r;
  });
}
