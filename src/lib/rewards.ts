import type { WantedRecord } from "./types";

export interface RewardAmount {
  amount: number;
  maximum: boolean;
  text: string;
}

/** reward is an official free-text note, often just a safety warning.
 * Accept one explicit TWD reward only; ambiguous ranges or multiple amounts
 * remain unranked instead of becoming a guessed payout.
 */
export function rewardAmount(note?: string): RewardAmount | undefined {
  if (!note) return;
  const normalized = note.normalize("NFKC");
  const clauses = normalized.split(/[。！？!?\n\r]/).filter((s) => /(?:檢舉獎金|懸賞|獎金)/.test(s));
  const candidates: RewardAmount[] = [];
  for (const clause of clauses) {
    if (/(?:美元|美金|人民幣|港幣|日圓)/.test(clause)
      || /[\d元萬千億]\s*(?:至|到|[~～〜–—-])\s*(?:新[臺台]幣)?\s*\d/.test(clause)) continue;
    const amounts = [...clause.matchAll(/(?:新[臺台]幣|NT\$)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*([千萬億]?)\s*元/g)];
    if (amounts.length !== 1) continue;
    const match = amounts[0];
    const before = clause.slice(0, match.index);
    const after = clause.slice(match.index! + match[0].length);
    if (!/(?:獎金|懸賞)[：:\s為共計最高上限至多可達約]*$/.test(before)
      && !/^\s*(?:之|的)?(?:檢舉|懸賞)?獎金/.test(after)) continue;
    // Do not match the tail of unsupported compound or range expressions.
    if (/[\d,萬千億至到~～〜–—-]\s*$/.test(before)) continue;
    const amount = Number(match[1].replaceAll(",", "")) * ({ "": 1, 千: 1e3, 萬: 1e4, 億: 1e8 }[match[2]] ?? 0);
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    candidates.push({ amount, maximum: /最高|上限|至多/.test(clause), text: clause.trim() });
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function rankRewards(records: WantedRecord[]) {
  const entries = records.flatMap((record) => {
    const reward = rewardAmount(record.reward);
    return reward ? [{ record, reward }] : [];
  }).sort((a, b) => b.reward.amount - a.reward.amount || a.record.id.localeCompare(b.record.id));
  let rank = 0;
  return entries.map((entry, index) => {
    if (index === 0 || entry.reward.amount !== entries[index - 1].reward.amount) rank = index + 1;
    return { ...entry, rank };
  });
}

export const formatReward = (amount: number) => new Intl.NumberFormat("zh-TW").format(amount);
