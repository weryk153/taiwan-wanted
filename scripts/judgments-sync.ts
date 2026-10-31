import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { carryReferences, reviewedReferences } from "../src/lib/references";
import { jidFromUrl } from "../src/lib/judgments";
import { fetchPublicJudgment, type JudgmentResult } from "./judicial-source";
import { refreshJudgments } from "./judgment-refresh";
import type { WantedRecord } from "../src/lib/types";

async function main() {
  const path = resolve("data/wanted.json");
  const original = await readFile(path, "utf8");
  const records = carryReferences(JSON.parse(original) as WantedRecord[], JSON.parse(original));
  const jids = [...new Set(records.flatMap(r => reviewedReferences(r).filter(x => x.kind === "judgment").map(x => jidFromUrl(x.url))).filter((x): x is string => Boolean(x)))];
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const results = new Map<string, JudgmentResult>();
  let failed = 0;
  for (const jid of jids) {
    try { results.set(jid, await fetchPublicJudgment(jid, date)); }
    catch { failed++; console.warn("一筆裁判暫時無法讀取，保留上次資料與檢查日期。"); }
    await new Promise(r => setTimeout(r, 500));
  }
  if (await readFile(path, "utf8") !== original) throw new Error("名單於同步期間改變，請重跑以避免覆蓋");
  const next = refreshJudgments(records, results, date);
  await writeFile(`${path}.tmp`, JSON.stringify(next, null, 2) + "\n");
  await rename(`${path}.tmp`, path);
  console.log(`裁判同步：${jids.length} 份原文，${results.size} 份取得結果，${failed} 份暫時失敗。`);
  if (failed) process.exitCode = 1;
}
main().catch(() => { console.error("裁判同步失敗，未完成的來源保留上次資料。"); process.exitCode = 1; });
