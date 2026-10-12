import { decode } from "he";
import type { WantedRecord } from "../src/lib/types";
import { categorize } from "../src/lib/categories";

export interface CibJson {
  subject: string;
  posterDate: string;
  updateDate: string;
  idNumber: string;
  gender: string;
  birth: string;
  reason: string;
  hidePosition: string;
  note: string;
  wantedUnit: string;
  accusation: string;
  publishUnit: string;
  publishNo: string;
  reportTel: string;
  liaisonTel: string;
  images: { fileurl: string; expFile: string }[];
}

export interface CibRaw {
  serno: string;
  data: CibJson;
}

export interface MjibRaw {
  uid: number;
  photoUrl?: string;
  fields: Record<string, string>;
}

export interface Normalized {
  record: WantedRecord;
  photoUrl?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 民國或西元日期 → ISO YYYY-MM-DD；解析不到回 undefined。 */
export function rocToIso(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return undefined;
  let year = Number(m[1]);
  if (year < 1000) year += 1911;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 證號 → 前三碼 + 7 個 *；少於三碼回 undefined。 */
export function maskId(s: string | undefined): string | undefined {
  const t = (s ?? "").trim();
  if (t.length < 3) return undefined;
  return t.slice(0, 3) + "*".repeat(7);
}

const clean = (s: string | undefined): string | undefined => {
  const t = decode(s ?? "").trim();
  return t && t !== "不詳" ? t : undefined;
};

export function normalizeCib(raw: CibRaw, fetchedAt: string): Normalized {
  const d = raw.data;
  const birthDate = rocToIso(d.birth);
  const publishedAt = rocToIso(d.posterDate);
  const updatedAt = rocToIso(d.updateDate) ?? publishedAt ?? fetchedAt.slice(0, 10);
  const accusation = clean(d.accusation) ?? "";
  const record: WantedRecord = {
    id: `cib-${raw.serno}`,
    source: "cib",
    name: clean(d.subject) ?? "",
    gender: d.gender === "male" || d.gender === "female" ? d.gender : undefined,
    birthYear: birthDate ? Number(birthDate.slice(0, 4)) : undefined,
    birthDate,
    idMasked: maskId(d.idNumber),
    photo: null,
    wantedUnit: clean(d.wantedUnit) ?? "",
    accusation,
    category: categorize(accusation),
    reason: clean(d.reason),
    hidePosition: clean(d.hidePosition),
    reportTel: clean(d.liaisonTel) ?? clean(d.reportTel),
    reward: clean(d.note),
    sourceUrl: `https://www.cib.npa.gov.tw/ch/app/wanted/view?module=wanted&id=1889&serno=${raw.serno}`,
    publishedAt,
    updatedAt,
    fetchedAt,
  };
  return { record, photoUrl: d.images?.[0]?.fileurl || undefined };
}

export function normalizeMjib(raw: MjibRaw, fetchedAt: string): Normalized {
  const f = raw.fields;
  const yearMatch = (f["出生年月日"] ?? "").match(/^(\d{4})/);
  const publishedAt = rocToIso(f["通緝時間"]);
  const accusation = clean(f["通緝罪名"]) ?? "";
  const record: WantedRecord = {
    id: `mjib-${raw.uid}`,
    source: "mjib",
    name: clean(f["中文姓名"]) ?? "",
    nameEn: clean(f["英文姓名"]),
    birthYear: yearMatch ? Number(yearMatch[1]) : undefined,
    idMasked: maskId(f["身分證統一編號"]),
    photo: null,
    wantedUnit: clean(f["通緝機關"]) ?? "",
    accusation,
    category: categorize(accusation),
    facts: clean(f["涉嫌事實"]),
    fledTo: clean(f["可能潛逃地點"]),
    fledAt: clean(f["可能潛逃時間"]),
    sourceUrl: `https://www.mjib.gov.tw/Crimes/Crimes_Detail?uid=${raw.uid}`,
    publishedAt,
    updatedAt: publishedAt ?? fetchedAt.slice(0, 10),
    fetchedAt,
  };
  return { record, photoUrl: raw.photoUrl };
}
