import type { WantedRecord, Meta } from "./types";
import recordsJson from "../../data/wanted.json";
import metaJson from "../../data/meta.json";

/** build 時由 Vite 直接把 JSON 打包進來；用 import.meta.url 會在 dist 下找不到檔案。 */
export function loadData(): { records: WantedRecord[]; meta: Meta } {
  return { records: recordsJson as unknown as WantedRecord[], meta: metaJson as unknown as Meta };
}

export const SOURCE_LABEL: Record<WantedRecord["source"], string> = {
  cib: "刑事局",
  mjib: "調查局",
};
