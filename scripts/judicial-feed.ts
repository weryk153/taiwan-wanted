import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { createJudicialClient, inApiWindow } from "./judicial-source";
import { candidateRecords, changeKey, reconcileFeed, type FeedState } from "./judicial-candidates";
import { caseKey } from "../src/lib/references";
import type { WantedRecord } from "../src/lib/types";

// 與 legislator-background 相同：只產生待核對清單，不直接寫 wanted.json。
// 只讀兩個司法院設定，不載入其他服務的憑證，也不輸出 token／原始回應。
async function main() {
  if (!inApiWindow()) throw new Error("司法院 API 僅於臺灣時間 00:00–06:00 開放");
  let env: NodeJS.Dict<string> = {};
  try { env = parseEnv(await readFile(resolve(process.env.JUDICIAL_ENV_FILE || ".env"), "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  const client = await createJudicialClient(process.env.JUDICIAL_API_USER || env.JUDICIAL_API_USER || "",
    process.env.JUDICIAL_API_PASSWORD || env.JUDICIAL_API_PASSWORD || "");
  const changes = await client.changes();
  console.log(`司法院異動清單：${changes.length} 筆（官方提供 7 日前異動）。`);
  if (process.argv.includes("--measure")) return;
  const max = Number(process.argv.find(a => a.startsWith("--max="))?.slice(6) ?? "500");
  if (!Number.isInteger(max) || max < 1 || max > 10_000) throw new Error("--max 必須介於 1 與 10000");
  const dir = resolve(".tmp/judicial-feed");
  const file = resolve(dir, "state.json");
  await mkdir(dir, { recursive: true });
  let state: FeedState = { queue: [], completed: {}, candidates: [] };
  try { state = JSON.parse(await readFile(file, "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  const records = JSON.parse(await readFile("data/wanted.json", "utf8")) as WantedRecord[];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  state = reconcileFeed(state, changes, records, today);
  const save = async () => { await writeFile(`${file}.tmp`, JSON.stringify(state, null, 2) + "\n"); await rename(`${file}.tmp`, file); };
  await save(); // 先保存待處理清單；中斷或達上限不會默默丟掉尾端。
  let fetched = 0, failed = 0, consecutiveFailures = 0;
  for (const change of [...state.queue].slice(0, max)) {
    if (!inApiWindow()) break;
    try {
      const doc = await client.document(change.jid);
      // 重新抓取同 ID 時替換舊候選，撤下時也確實移除。
      state.candidates = state.candidates.filter(c => c.jid !== change.jid);
      if (doc.status === "available") {
        for (const r of candidateRecords(doc.text, records)) state.candidates.push({ recordId: r.id, caseKey: caseKey(r),
          jid: change.jid, changeDate: change.date, detectedAt: today, status: "needs_review", signal: "party_name" });
      }
      state.completed[changeKey(change)] = today;
      state.queue = state.queue.filter(c => changeKey(c) !== changeKey(change));
      fetched++;
      consecutiveFailures = 0;
    } catch { failed++; consecutiveFailures++; } // 失敗留在 queue，不能標為已處理／不存在。
    await save();
    if (consecutiveFailures >= 5) break;
    await new Promise(r => setTimeout(r, 500));
  }
  // 最後再依當前名單清除已下架、案情改變或過期的候選。
  const current = JSON.parse(await readFile("data/wanted.json", "utf8")) as WantedRecord[];
  state = reconcileFeed(state, [], current, today);
  await save();
  console.log(`已讀取 ${fetched} 份，暫時失敗 ${failed} 份，待處理 ${state.queue.length} 份，待核對 ${state.candidates.length} 筆。未更動網站名單。`);
  if (failed) process.exitCode = 1;
}
main().catch(e => { console.error(e instanceof Error ? e.message : "司法院介接失敗"); process.exitCode = 1; });
