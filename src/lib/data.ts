import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { WantedRecord, Meta } from "./types";
import { carryReferences } from "./references";

/**
 * 從 <root>/data 讀資料。build 與測試都從 repo 根目錄執行，所以預設 process.cwd()。
 * master 分支不含資料（見 .gitignore），本機先跑 `pnpm sync`；CI 從 site 分支取。
 */
export function loadData(root: string = process.cwd()): { records: WantedRecord[]; meta: Meta } {
  const wanted = join(root, "data", "wanted.json");
  const metaPath = join(root, "data", "meta.json");
  if (!existsSync(wanted) || !existsSync(metaPath)) {
    throw new Error(`找不到 ${wanted}。先跑 \`pnpm sync\` 產生資料，或從 site 分支取：git checkout origin/site -- data public/photos`);
  }
  const records = JSON.parse(readFileSync(wanted, "utf8")) as WantedRecord[];
  return {
    records: carryReferences(records, records),
    meta: JSON.parse(readFileSync(metaPath, "utf8")) as Meta,
  };
}

export const SOURCE_LABEL: Record<WantedRecord["source"], string> = {
  cib: "刑事局",
  mjib: "調查局",
};
