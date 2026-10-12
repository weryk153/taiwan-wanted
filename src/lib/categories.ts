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
];

export function categorize(accusation: string): Category {
  for (const [category, keywords] of RULES) {
    if (keywords.some((k) => accusation.includes(k))) return category;
  }
  return "其他";
}
