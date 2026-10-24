import { describe, it, expect } from "vitest";
import { rewardAmount, rankRewards } from "../src/lib/rewards";
import type { WantedRecord } from "../src/lib/types";

describe("rewardAmount", () => {
  it("保留最高金額語意並換算單位，不把聯絡電話當金額", () => {
    expect(rewardAmount("檢舉獎金：\n經查證屬實並協助查緝到案者，將提供最高新臺幣100萬元檢舉獎金。\n電話02-12345678"))
      .toMatchObject({ amount: 1_000_000, maximum: true });
    expect(rewardAmount("懸賞獎金新台幣1,500,000元")).toMatchObject({ amount: 1_500_000, maximum: false });
    expect(rewardAmount("檢舉獎金新臺幣５０萬元")).toMatchObject({ amount: 500_000 });
  });
  it("注意事項、犯罪所得及一般案情不形成個人懸賞", () => {
    for (const text of [undefined, "查緝時請注意自身安全。", "涉嫌侵占新臺幣100萬元。", "檢舉獎金依規定辦理，犯罪所得新臺幣1億元", "詐取推廣獎金5%至10%"])
      expect(rewardAmount(text)).toBeUndefined();
  });
  it("金額區間、多個金額、其他幣別及不完整金額不猜測", () => {
    for (const text of ["獎金新臺幣5萬元至100萬元", "懸賞新臺幣10萬元，另有新臺幣20萬元獎金", "檢舉獎金美金100萬元", "獎金新臺幣1萬5千元", "獎金新臺幣0元", "獎金新臺幣1,00萬元"])
      expect(rewardAmount(text)).toBeUndefined();
  });
});

describe("rankRewards", () => {
  it("排除未知金額、同額並列且不修改原始公告", () => {
    const record = (id: string, reward?: string) => ({ id, reward }) as WantedRecord;
    const input = [record("d"), record("c", "獎金新臺幣10萬元"), record("b", "最高獎金新臺幣100萬元"), record("a", "獎金新臺幣100萬元")];
    expect(rankRewards(input).map(({ record, rank }) => [record.id, rank])).toEqual([["a", 1], ["b", 1], ["c", 3]]);
    expect(input.map((r) => r.id)).toEqual(["d", "c", "b", "a"]);
  });
});
