import { readFileSync } from "node:fs";
import { writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { caseKey, validReference, validReview } from "../src/lib/references";
import type { WantedRecord, ReviewedReferences } from "../src/lib/types";
import { validPendingJudgment } from "../src/lib/judgments";

// 僅匯入已逐筆核對的連結，不做網路搜尋或姓名推測。
const input = process.argv[2];
if (!input) throw new Error("用法：pnpm references <reviewed.json>；格式見 docs/DEVELOPMENT.md");
const dataPath = resolve("data/wanted.json");
const records = JSON.parse(readFileSync(dataPath, "utf8")) as WantedRecord[];
const batch = JSON.parse(readFileSync(resolve(input), "utf8")) as Array<ReviewedReferences & { recordId: string }>;
if (!Array.isArray(batch)) throw new Error("輸入須為陣列");
const seen = new Set<string>();
for (const entry of batch) {
  if (!entry || typeof entry !== "object") throw new Error("無效的核對資料");
  const r = records.find((r) => r.id === entry.recordId);
  if (!r || seen.has(entry.recordId)) throw new Error(`公告不存在或重複：${entry.recordId}`);
  if (entry.caseKey !== caseKey(r)) throw new Error(`公告案情已改變，請重新核對：${r.id}`);
  if (!Array.isArray(entry.items) || !entry.items.every(validReference)
    || new Set(entry.items.map((x) => x.url)).size !== entry.items.length) throw new Error(`連結欄位不完整、網址不合規或重複：${r.id}`);
  if (entry.review !== undefined && (!validReview(entry.review)
    || (entry.review.status === "verified") !== (entry.items.length > 0))) throw new Error(`查核結果與連結不一致：${r.id}`);
  if (entry.pendingJudgments !== undefined && (!Array.isArray(entry.pendingJudgments) || !entry.pendingJudgments.every(validPendingJudgment))) throw new Error(`無效的待複核裁判：${r.id}`);
  seen.add(r.id);
  if (entry.items.length || entry.review || entry.pendingJudgments?.length) r.references = { caseKey: entry.caseKey, items: entry.items, ...(entry.review ? { review: entry.review } : {}), ...(entry.pendingJudgments?.length ? { pendingJudgments: entry.pendingJudgments } : {}) };
  else delete r.references;
}
// 全批驗證成功才取代原檔。
await writeFile(`${dataPath}.tmp`, JSON.stringify(records, null, 2) + "\n");
await rename(`${dataPath}.tmp`, dataPath);
console.log(`已更新 ${seen.size} 筆公告的核對連結。`);
