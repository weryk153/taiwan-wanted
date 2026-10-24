import type { WantedRecord } from "../src/lib/types";
import { caseKey } from "../src/lib/references";
import type { JudgmentChange } from "./judicial-source";

export interface JudicialCandidate {
  recordId: string;
  caseKey: string;
  jid: string;
  changeDate: string;
  detectedAt: string;
  status: "needs_review";
  signal: "party_name";
}
export interface FeedState {
  queue: JudgmentChange[];
  completed: Record<string, string>; // date + jid → 實際處理日；同 ID 異日異動必須重抓
  candidates: JudicialCandidate[];
}
export const changeKey = (change: JudgmentChange) => `${change.date}:${change.jid}`;
export function reconcileFeed(state: FeedState, changes: JudgmentChange[], records: WantedRecord[], today: string): FeedState {
  const cutoff = new Date(Date.parse(today) - 30 * 86400_000).toISOString().slice(0, 10);
  const live = new Map(records.map(r => [r.id, caseKey(r)]));
  const completed = Object.fromEntries(Object.entries(state.completed).filter(([, d]) => d >= cutoff));
  const queue = new Map([...state.queue, ...changes].filter(c => c.date >= cutoff && !completed[changeKey(c)]).map(c => [changeKey(c), c]));
  return { queue: [...queue.values()].sort((a, b) => a.date.localeCompare(b.date)), completed,
    candidates: state.candidates.filter(c => c.detectedAt >= cutoff && live.get(c.recordId) === c.caseKey) };
}

/** 只在主文前的當事人欄找候選；律師、法官及內文中的姓名不能觸發自動配對。 */
export function candidateRecords(text: string, records: WantedRecord[]) {
  const compact = text.replace(/\s+/gu, "");
  const end = compact.indexOf("主文");
  if (end < 0) return [];
  const header = compact.slice(0, end);
  const zones = [...header.matchAll(/(?:被上訴人|上訴人|被告|抗告人|聲請人)(.*?)(?=選任辯護人|辯護人|代理人|複代理人|公訴人|參與人|被上訴人|上訴人|被告|抗告人|聲請人|上列|右列|$)/gu)].map(m => m[1].slice(0, 120));
  return records.filter(r => {
    const name = r.name.replace(/[（(].*?[）)]/g, "").replace(/\s+/g, "");
    return name.length >= 2 && zones.some(z => z.includes(name));
  });
}
