export const CATEGORIES = [
  "殺人傷害", "性侵", "毒品", "詐欺", "貪污", "洗錢", "槍砲", "組織犯罪", "經濟犯罪", "其他",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Source = "cib" | "mjib";

export interface CaseReference {
  kind: "judgment" | "official" | "news";
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
  checkedAt: string;
  caseNumber?: string;
  context: string;       // 審級、報導時點及後續進度；不可把他人判決當成本人判決
  matchedOn: string;     // 除姓名外，與官方公告相符的案情
}

export interface ReviewedReferences {
  caseKey: string;       // 核對時官方公告的指紋；案情改變後須重新核對
  items: CaseReference[];
  review?: ReferenceReview;
}

export interface ReferenceReview {
  checkedAt: string;
  status: "verified" | "no_match" | "unavailable";
  note: string;
  queries: string[];     // 實際執行過的搜尋，供後續補查與稽核
}

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
  references?: ReviewedReferences;
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
