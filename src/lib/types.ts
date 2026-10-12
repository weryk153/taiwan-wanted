export const CATEGORIES = [
  "殺人傷害", "性侵", "毒品", "詐欺", "貪污", "洗錢", "槍砲", "組織犯罪", "經濟犯罪", "其他",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Source = "cib" | "mjib";

export interface WantedRecord {
  id: string;            // "cib-<serno>" | "mjib-<uid>"
  source: Source;
  name: string;
  nameEn?: string;
  gender?: "male" | "female";
  birthYear?: number;
  birthDate?: string;    // ISO YYYY-MM-DD，只有刑事局有
  idMasked?: string;     // "B10*******"
  photo: string | null;  // "photos/<id>.jpg"
  wantedUnit: string;
  accusation: string;
  category: Category;
  reason?: string;
  facts?: string;
  hidePosition?: string;
  fledTo?: string;
  fledAt?: string;
  reportTel?: string;
  reward?: string;
  sourceUrl: string;
  publishedAt?: string;  // ISO date
  updatedAt: string;     // ISO date
  fetchedAt: string;     // ISO datetime
}

export interface SourceMeta {
  count: number;
  stale: boolean;
  errors: number;
}

export interface Meta {
  fetchedAt: string;
  sources: Record<Source, SourceMeta>;
}
