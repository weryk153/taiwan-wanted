import { carryReferences } from "../src/lib/references";
import { jidFromUrl } from "../src/lib/judgments";
import type { WantedRecord } from "../src/lib/types";
import type { JudgmentResult } from "./judicial-source";

/** 成功下載只更新來源檢查日，不冒充重新完成身分／案情核對。 */
export function refreshJudgments(records: WantedRecord[], results: Map<string, JudgmentResult>, checkedAt: string) {
  return carryReferences(records, records).map(record => {
    if (!record.references) return record;
    const refs = record.references;
    const pending = new Map((refs.pendingJudgments ?? []).map(x => [x.jid, x]));
    const items = refs.items.flatMap(item => {
      const jid = jidFromUrl(item.url);
      const result = jid && results.get(jid);
      if (item.kind !== "judgment" || !jid || !result) return [item];
      if (result.status === "removed" || (item.judgment && item.judgment.contentHash !== result.metadata.contentHash)) {
        pending.set(jid, { jid, reason: result.status === "removed" ? "removed" : "changed", detectedAt: checkedAt });
        return []; // 不保留已失效的摘要、身分比對說明或裁判全文。
      }
      if (result.metadata.date !== item.publishedAt) return [item];
      pending.delete(jid);
      return [{ ...item, judgment: result.metadata }];
    });
    // 自動同步不是一次新的人工查核；若移除來源，不繼續宣稱舊的整批查核結果。
    const review = items.length === refs.items.length ? refs.review : undefined;
    return { ...record, references: { caseKey: refs.caseKey, items, ...(review ? { review } : {}),
      ...(pending.size ? { pendingJudgments: [...pending.values()] } : {}) } };
  });
}
