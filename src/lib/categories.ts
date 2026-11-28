import type { Category } from "./types";

const RULES: [Category, string[]][] = [
  ["殺人傷害", ["殺人", "傷害", "重傷"]],
  ["性侵", ["性交", "性侵", "性犯罪", "猥褻"]],
  ["毒品", ["毒品"]],
  ["詐欺", ["詐欺", "詐騙"]],
  ["貪污", ["貪污", "貪汙"]],
  ["洗錢", ["洗錢"]],
  ["槍砲", ["槍砲", "槍彈", "持槍", "槍械"]],
  ["組織犯罪", ["組織犯罪", "組織"]],
  ["經濟犯罪", ["證券交易法", "銀行法", "侵占", "背信", "期貨", "保險法", "公司法", "商業會計法", "稅捐", "票據"]],
];

export function categorize(accusation: string): Category {
  for (const [category, keywords] of RULES) {
    if (keywords.some((k) => accusation.includes(k))) return category;
  }
  return "其他";
}
