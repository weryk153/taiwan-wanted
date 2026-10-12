# taiwan-wanted 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每日自動抓刑事局「重要緊急查緝專案」與調查局「外逃通緝犯」，正規化成一份 JSON 與照片，用 Astro 產出可搜尋的靜態站，每人一頁且 noindex。

**Architecture:** `scripts/` 是純 Node 抓取管線（HTTP → parser → normalize → guard → 寫檔），所有 parser 吃字串、所有網路走注入的 `Http` 函式，因此測試不碰網路。`src/` 是 Astro 靜態站，build 時讀 `data/wanted.json`，只有搜尋篩選用一個 Svelte island。GitHub Actions 每日跑抓取並 commit，Cloudflare Pages 看到 push 就重建。

**Tech Stack:** Node 22、pnpm、TypeScript、tsx（跑腳本）、cheerio（解析 HTML）、he（解 HTML entity）、sharp（縮圖）、Vitest、Astro 5、@astrojs/svelte + Svelte 5、satori + @resvg/resvg-js（OG 圖）。

**Spec:** `docs/superpowers/specs/2026-10-12-taiwan-wanted-design.md`

## Global Constraints

- Node 22（`.nvmrc` 內容 `22`）、pnpm；ESM（`"type": "module"`）。
- 全碼身分證、護照號碼、調查局以外來源的出生月日以外的敏感欄位：**只存在抓取程序記憶體**，不寫進任何檔案、log、fixture、commit。
- `idMasked` 格式固定：前三碼 + 7 個 `*`，例如 `B10*******`。
- 測試 fixture 全部手寫假資料：姓名用「測試甲／測試乙」，證號用 `A123456789`、`B223456789`。
- 兩個來源的請求間隔 500ms，不並發。User-Agent 固定 `taiwan-wanted/1.0 (+https://github.com/<owner>/taiwan-wanted)`。
- 分類順序固定：`殺人傷害 → 性侵 → 毒品 → 詐欺 → 貪污 → 洗錢 → 槍砲 → 組織犯罪 → 其他`，第一個命中即歸類。
- 任一來源 stale 時，程序 exit code 非 0，但仍寫出 `data/`（沿用舊資料）。
- 個人頁 `<meta name="robots" content="noindex, nofollow">`；`/` 與 `/about` 可索引。
- 介面文字全部繁體中文；不中英混用。
- 每個 task 結束都 commit；commit 訊息用中文、conventional 前綴（`feat:`、`test:`、`chore:`、`data:`）。

## Review Focus

1. **官方站回 200 但內容是錯誤頁**（刑事局 504 時會 302 到列表頁、調查局偶爾回「找不到頁面」）。期望：parser 解出 0 筆就視為該來源失敗，guard 沿用舊資料，不清空。→ Task 3、4 各加「錯誤頁 fixture 解析得 0 筆」測試，Task 5 加「0 筆 → stale」測試。
2. **刑事局 `subject` 是 HTML entity**（`&#24373;…`），`note` 含 `\n`。期望：姓名顯示正常中文，獎金說明保留換行。→ Task 2 `normalizeCib` 測試斷言解碼後姓名與 `note` 含換行。
3. **民國日期有兩種分隔**（`044-12-19`、`115/09/15`）且年可能三位數或兩位數。期望：都轉成 ISO。→ Task 2 `rocToIso` 測試涵蓋 `-`、`/`、兩位年。
4. **已遮蔽的證號再遮一次**（調查局給 `T10277****`）。期望：輸出一律 `T10*******`，不會變成 `T10****` 或保留第 4–6 碼。→ Task 2 `maskId` 測試。
5. **照片 URL 回非圖片**（刑事局 image 端點在沒有圖時回 HTML 預設圖頁）。期望：`photo: null`、`errors + 1`，不寫壞檔。→ Task 6 測試 content-type 非 `image/*` 時回 `false` 且不建檔。

---

### Task 1: 專案骨架與型別

**Files:**
- Create: `package.json`、`tsconfig.json`、`.nvmrc`、`.gitignore`、`vitest.config.ts`、`src/lib/types.ts`、`test/types.test.ts`

**Interfaces:**
- Produces: `WantedRecord`、`Category`、`Source`、`Meta`、`CATEGORIES`（`src/lib/types.ts`），後續所有 task 依賴。

- [ ] **Step 1: 建立 package.json 與設定檔**

`.nvmrc`:
```
22
```

`.gitignore`:
```
node_modules
dist
.astro
.DS_Store
.tmp
```

`package.json`:
```json
{
  "name": "taiwan-wanted",
  "private": true,
  "type": "module",
  "scripts": {
    "sync": "tsx scripts/fetch.ts",
    "test": "vitest run",
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "engines": { "node": ">=22" }
}
```

`tsconfig.json`:
```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "strict": true,
    "types": ["node"]
  },
  "include": ["src", "scripts", "test"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], testTimeout: 60_000 },
});
```

- [ ] **Step 2: 安裝依賴**

```bash
pnpm add astro @astrojs/svelte svelte cheerio he sharp satori @resvg/resvg-js
pnpm add -D typescript tsx vitest @types/node @types/he
```

- [ ] **Step 3: 寫型別測試（失敗）**

`test/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { CATEGORIES } from "../src/lib/types";

describe("types", () => {
  it("分類順序固定，其他在最後", () => {
    expect(CATEGORIES).toEqual([
      "殺人傷害", "性侵", "毒品", "詐欺", "貪污", "洗錢", "槍砲", "組織犯罪", "其他",
    ]);
  });
});
```

- [ ] **Step 4: 跑測試確認失敗**

Run: `pnpm test`
Expected: FAIL，找不到 `../src/lib/types`。

- [ ] **Step 5: 寫型別**

`src/lib/types.ts`:
```ts
export const CATEGORIES = [
  "殺人傷害", "性侵", "毒品", "詐欺", "貪污", "洗錢", "槍砲", "組織犯罪", "其他",
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
```

- [ ] **Step 6: 跑測試確認通過**

Run: `pnpm test`
Expected: PASS 1 test。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: 專案骨架與資料型別"
```

---

### Task 2: 正規化（日期、遮蔽、分類、兩來源轉換）

**Files:**
- Create: `scripts/normalize.ts`、`src/lib/categories.ts`、`test/normalize.test.ts`

**Interfaces:**
- Consumes: `WantedRecord`、`Category`、`CATEGORIES`（Task 1）。
- Produces:
  - `rocToIso(s: string | undefined): string | undefined`
  - `maskId(s: string | undefined): string | undefined`
  - `categorize(accusation: string): Category`（`src/lib/categories.ts`）
  - `interface CibRaw { serno: string; data: CibJson }`、`interface CibJson {...}`
  - `interface MjibRaw { uid: number; photoUrl?: string; fields: Record<string, string> }`
  - `interface Normalized { record: WantedRecord; photoUrl?: string }`
  - `normalizeCib(raw: CibRaw, fetchedAt: string): Normalized`
  - `normalizeMjib(raw: MjibRaw, fetchedAt: string): Normalized`

- [ ] **Step 1: 寫測試（失敗）**

`test/normalize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { rocToIso, maskId, normalizeCib, normalizeMjib } from "../scripts/normalize";
import { categorize } from "../src/lib/categories";

const FETCHED = "2026-10-12T22:00:00.000Z";

describe("rocToIso", () => {
  it("民國三位數年、dash", () => expect(rocToIso("044-12-19")).toBe("1955-12-19"));
  it("民國三位數年、slash", () => expect(rocToIso("115/09/15")).toBe("2026-09-15"));
  it("民國兩位數年", () => expect(rocToIso("88-01-05")).toBe("1999-01-05"));
  it("西元", () => expect(rocToIso("2019/03/26")).toBe("2019-03-26"));
  it("空或不詳", () => {
    expect(rocToIso("")).toBeUndefined();
    expect(rocToIso("不詳")).toBeUndefined();
    expect(rocToIso(undefined)).toBeUndefined();
  });
});

describe("maskId", () => {
  it("全碼", () => expect(maskId("A123456789")).toBe("B10*******"));
  it("已遮蔽", () => expect(maskId("T10277****")).toBe("T10*******"));
  it("太短或空", () => {
    expect(maskId("AB")).toBeUndefined();
    expect(maskId("")).toBeUndefined();
    expect(maskId(undefined)).toBeUndefined();
  });
});

describe("categorize", () => {
  it.each([
    ["持槍殺人", "殺人傷害"],
    ["殺人罪", "殺人傷害"],
    ["強制性交", "性侵"],
    ["性犯罪防治法等案", "性侵"],
    ["毒品危害防制條例", "毒品"],
    ["詐欺等罪", "詐欺"],
    ["貪污治罪條例", "貪污"],
    ["貪汙治罪條例", "貪污"],
    ["洗錢防制法", "洗錢"],
    ["槍砲彈藥刀械管制條例", "槍砲"],
    ["組織犯罪防制條例", "組織犯罪"],
    ["", "其他"],
    ["違反銀行法", "其他"],
  ])("%s → %s", (input, expected) => expect(categorize(input)).toBe(expected));
});

describe("normalizeCib", () => {
  const raw = {
    serno: "11111111-1111-1111-1111-111111111111",
    data: {
      subject: "&#28204;&#35430;&#30002;",
      posterDate: "115-09-15",
      updateDate: "115-09-16",
      idNumber: "A123456789",
      gender: "male",
      birth: "044-12-19",
      reason: "刑事案件未依規定報到",
      hidePosition: "機場、港口",
      note: "檢舉獎金：\n最高新臺幣100萬元\n檢舉電話：\n02-00000000",
      wantedUnit: "臺灣臺北地方法院等機關",
      accusation: "貪污治罪條例等罪",
      publishUnit: "新北市政府警察局新店分局",
      publishNo: "1150915-1",
      reportTel: "",
      liaisonTel: "新店分局02-00000000",
      images: [{ fileurl: "https://www.cib.npa.gov.tw/ch/app/wanted/image?module=wanted&detailNo=1&init=Y", expFile: "" }],
    },
  };
  const { record, photoUrl } = normalizeCib(raw, FETCHED);

  it("id 與 source", () => {
    expect(record.id).toBe("cib-11111111-1111-1111-1111-111111111111");
    expect(record.source).toBe("cib");
    expect(record.sourceUrl).toBe(
      "https://www.cib.npa.gov.tw/ch/app/wanted/view?module=wanted&id=1889&serno=11111111-1111-1111-1111-111111111111",
    );
  });
  it("姓名解碼", () => expect(record.name).toBe("測試甲"));
  it("日期", () => {
    expect(record.birthDate).toBe("1955-12-19");
    expect(record.birthYear).toBe(1955);
    expect(record.publishedAt).toBe("2026-09-15");
    expect(record.updatedAt).toBe("2026-09-16");
    expect(record.fetchedAt).toBe(FETCHED);
  });
  it("遮蔽，且記錄裡沒有全碼", () => {
    expect(record.idMasked).toBe("A12*******");
    expect(JSON.stringify(record)).not.toContain("A123456789");
  });
  it("其他欄位", () => {
    expect(record.gender).toBe("male");
    expect(record.category).toBe("貪污");
    expect(record.reason).toBe("刑事案件未依規定報到");
    expect(record.hidePosition).toBe("機場、港口");
    expect(record.reward).toContain("\n");
    expect(record.reportTel).toBe("新店分局02-00000000");
    expect(record.wantedUnit).toBe("臺灣臺北地方法院等機關");
    expect(record.photo).toBeNull();
    expect(photoUrl).toContain("detailNo=1");
  });
  it("沒有圖片時 photoUrl undefined", () => {
    const r = normalizeCib({ ...raw, data: { ...raw.data, images: [] } }, FETCHED);
    expect(r.photoUrl).toBeUndefined();
  });
  it("updateDate 空時用 posterDate", () => {
    const r = normalizeCib({ ...raw, data: { ...raw.data, updateDate: "" } }, FETCHED);
    expect(r.record.updatedAt).toBe("2026-09-15");
  });
});

describe("normalizeMjib", () => {
  const raw = {
    uid: 483,
    photoUrl: "https://www.mjib.gov.tw/FileUploads/prisoner_pic/abc.JPG",
    fields: {
      "中文姓名": "測試乙",
      "英文姓名": "TEST, YI",
      "出生年月日": "1950/**/**",
      "身分證統一編號": "T10277****",
      "護照號碼": "211670***",
      "可能潛逃時間": "不詳",
      "可能潛逃地點": "中國大陸",
      "通緝機關": "臺灣屏東地方檢察署",
      "通緝時間": "2019/03/26",
      "通緝罪名": "貪污",
      "涉嫌事實": "測試事實。",
    },
  };
  const { record, photoUrl } = normalizeMjib(raw, FETCHED);

  it("id 與 source", () => {
    expect(record.id).toBe("mjib-483");
    expect(record.source).toBe("mjib");
    expect(record.sourceUrl).toBe("https://www.mjib.gov.tw/Crimes/Crimes_Detail?uid=483");
  });
  it("只取出生年", () => {
    expect(record.birthYear).toBe(1950);
    expect(record.birthDate).toBeUndefined();
  });
  it("遮蔽與護照不落地", () => {
    expect(record.idMasked).toBe("T10*******");
    expect(JSON.stringify(record)).not.toContain("211670");
  });
  it("欄位", () => {
    expect(record.name).toBe("測試乙");
    expect(record.nameEn).toBe("TEST, YI");
    expect(record.fledAt).toBeUndefined();
    expect(record.fledTo).toBe("中國大陸");
    expect(record.wantedUnit).toBe("臺灣屏東地方檢察署");
    expect(record.accusation).toBe("貪污");
    expect(record.category).toBe("貪污");
    expect(record.facts).toBe("測試事實。");
    expect(record.publishedAt).toBe("2019-03-26");
    expect(record.updatedAt).toBe("2019-03-26");
    expect(photoUrl).toBe(raw.photoUrl);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test test/normalize.test.ts`
Expected: FAIL，模組不存在。

- [ ] **Step 3: 寫分類表**

`src/lib/categories.ts`:
```ts
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
```

- [ ] **Step 4: 寫 normalize**

`scripts/normalize.ts`:
```ts
import he from "he";
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
  const t = he.decode(s ?? "").trim();
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
```

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm test test/normalize.test.ts`
Expected: PASS 全部。

- [ ] **Step 6: Commit**

```bash
git add scripts/normalize.ts src/lib/categories.ts test/normalize.test.ts
git commit -m "feat: 正規化、遮蔽、日期轉換與罪名分類"
```

---

### Task 3: HTTP 工具與刑事局來源

**Files:**
- Create: `scripts/http.ts`、`scripts/sources/cib.ts`、`test/fixtures/cib-list.html`、`test/fixtures/cib-record.json`、`test/fixtures/error-page.html`、`test/cib.test.ts`

**Interfaces:**
- Consumes: `CibRaw`、`CibJson`（Task 2）。
- Produces:
  - `type Http = (url: string) => Promise<Response>`
  - `createHttp(opts?: { delayMs?: number }): Http`（`scripts/http.ts`）
  - `parseCibListPage(html: string): { sernos: string[]; pageCount: number }`
  - `fetchCib(http: Http, log?: (m: string) => void): Promise<CibRaw[]>`

- [ ] **Step 1: 寫 fixture**

`test/fixtures/cib-list.html`（仿真結構，兩張卡片，七頁）:
```html
<!DOCTYPE html><html lang="zh-Hant-TW"><body>
<div class="menu"><ul><li>
<a href="/ch/app/artwebsite/view?module=artwebsite&amp;id=1384&amp;serno=f2a4b5d5-f9f6-4a62-9f20-6c4dfcebdaeb">局長介紹</a>
</li></ul></div>
<div id="fs" class="container main">
<form id="filterForm" action="/ch/app/wanted/query?module=wanted&id=1889" method="post">
<select id="page" name="page" class="select">
<option value="1" selected>1</option><option value="2">2</option><option value="3">3</option>
<option value="4">4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option>
</select>
</form>
<div class="list_group">
<div class="list_pic B"><ul class="row">
<li class="col-lg-3">
<a href="/ch/app/wanted/view?module=wanted&id=1889&serno=11111111-1111-1111-1111-111111111111">
<div class="pic"><img src="/ch/app/wanted/image?module=wanted&detailNo=1&init=N" alt=""/></div>
<div class="info"><p class="text02">&#28204;&#35430;&#30002;</p><p class="text02">A123456789</p></div>
</a></li>
<li class="col-lg-3">
<a href="/ch/app/wanted/view?module=wanted&id=1889&serno=22222222-2222-2222-2222-222222222222">
<div class="pic"><img src="/ch/app/wanted/image?module=wanted&detailNo=2&init=N" alt=""/></div>
<div class="info"><p class="text02">&#28204;&#35430;&#20057;</p><p class="text02">B223456789</p></div>
</a></li>
</ul></div></div></div></body></html>
```

`test/fixtures/cib-record.json`:
```json
{
  "subject": "&#28204;&#35430;&#30002;",
  "dataClassName": "重要緊急查緝專案",
  "pubUnitName": "刑事警察局偵查科",
  "posterDate": "115-09-15",
  "updateDate": "115-09-16",
  "secSubject": "",
  "idNumber": "A123456789",
  "gender": "male",
  "birth": "044-12-19",
  "feature": "",
  "reason": "刑事案件未依規定報到",
  "hidePosition": "機場、港口",
  "note": "檢舉獎金：\n最高新臺幣100萬元",
  "wantedUnit": "臺灣臺北地方法院等機關",
  "accusation": "貪污治罪條例等罪",
  "publishUnit": "新北市政府警察局新店分局",
  "publishNo": "1150915-1",
  "reportTel": "",
  "reportEmail": "",
  "sendUnit": "新北市政府警察局",
  "liaisonPer": "",
  "liaisonTel": "新店分局02-00000000",
  "liaisonFax": "",
  "liaisonEmail": "",
  "docs": [],
  "images": [{ "fileurl": "https://www.cib.npa.gov.tw/ch/app/wanted/image?module=wanted&detailNo=1&init=Y", "expFile": "" }],
  "videos": [],
  "audios": [],
  "resources": []
}
```

`test/fixtures/error-page.html`:
```html
<!DOCTYPE html><html><head><title>錯誤訊息頁面</title></head>
<body><h3>抱歉!找不到您輸入頁面</h3></body></html>
```

- [ ] **Step 2: 寫測試（失敗）**

`test/cib.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCibListPage, fetchCib } from "../scripts/sources/cib";
import type { Http } from "../scripts/http";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseCibListPage", () => {
  it("只抓 wanted 的 serno，不抓選單的", () => {
    const r = parseCibListPage(fx("cib-list.html"));
    expect(r.sernos).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });
  it("頁數從 select 讀", () => {
    expect(parseCibListPage(fx("cib-list.html")).pageCount).toBe(7);
  });
  it("錯誤頁解出 0 筆、1 頁", () => {
    const r = parseCibListPage(fx("error-page.html"));
    expect(r.sernos).toEqual([]);
    expect(r.pageCount).toBe(1);
  });
});

describe("fetchCib", () => {
  const listHtml = fx("cib-list.html");
  const onePage = listHtml.replace(/<option value="[2-7]">[2-7]<\/option>/g, "");
  const record = fx("cib-record.json");

  it("走過所有分頁，每筆打單筆 JSON", async () => {
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      if (url.includes("/wanted/list?")) return new Response(onePage, { status: 200 });
      if (url.includes("/openData/wanted/data?")) return new Response(record, { status: 200, headers: { "content-type": "application/json" } });
      return new Response("", { status: 404 });
    };
    const out = await fetchCib(http);
    expect(out.map((r) => r.serno)).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
    expect(out[0].data.publishNo).toBe("1150915-1");
    expect(calls.filter((u) => u.includes("/wanted/list?"))).toHaveLength(1);
    expect(calls.filter((u) => u.includes("/openData/wanted/data?"))).toHaveLength(2);
  });

  it("分頁數 > 1 時逐頁抓且去重", async () => {
    const http: Http = async (url) => {
      if (url.includes("/wanted/list?")) return new Response(listHtml, { status: 200 });
      return new Response(record, { status: 200 });
    };
    const out = await fetchCib(http);
    expect(out).toHaveLength(2); // 七頁都回同兩筆 → 去重後 2
  });

  it("列表 HTTP 失敗 → 丟錯", async () => {
    const http: Http = async () => new Response("", { status: 504 });
    await expect(fetchCib(http)).rejects.toThrow();
  });

  it("單筆失敗 → 略過該筆，其餘保留", async () => {
    let n = 0;
    const http: Http = async (url) => {
      if (url.includes("/wanted/list?")) return new Response(onePage, { status: 200 });
      n += 1;
      return n === 1 ? new Response("", { status: 500 }) : new Response(record, { status: 200 });
    };
    const out = await fetchCib(http);
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm test test/cib.test.ts`
Expected: FAIL，模組不存在。

- [ ] **Step 4: 寫 http.ts**

`scripts/http.ts`:
```ts
export type Http = (url: string) => Promise<Response>;

const UA = "taiwan-wanted/1.0 (+https://github.com/weryk153/taiwan-wanted)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 序列化、固定間隔、固定 UA 的 fetch。 */
export function createHttp(opts: { delayMs?: number } = {}): Http {
  const delayMs = opts.delayMs ?? 500;
  let last = 0;
  return async (url) => {
    const wait = last + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    return fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
  };
}
```

- [ ] **Step 5: 寫 cib.ts**

`scripts/sources/cib.ts`:
```ts
import * as cheerio from "cheerio";
import type { Http } from "../http";
import type { CibRaw, CibJson } from "../normalize";

const BASE = "https://www.cib.npa.gov.tw";
const LIST = `${BASE}/ch/app/wanted/list?module=wanted&id=1889`;
const RECORD = (serno: string) =>
  `${BASE}/ch/app/openData/wanted/data?module=wanted&serno=${serno}&type=json`;

export function parseCibListPage(html: string): { sernos: string[]; pageCount: number } {
  const $ = cheerio.load(html);
  const sernos: string[] = [];
  $('a[href*="/wanted/view?"]').each((_, a) => {
    const m = ($(a).attr("href") ?? "").match(/serno=([0-9a-f-]{36})/);
    if (m && !sernos.includes(m[1])) sernos.push(m[1]);
  });
  const pageCount = Math.max(1, $("select#page option").length);
  return { sernos, pageCount };
}

export async function fetchCib(http: Http, log: (m: string) => void = () => {}): Promise<CibRaw[]> {
  const first = await http(`${LIST}&page=1`);
  if (!first.ok) throw new Error(`cib list page 1: HTTP ${first.status}`);
  const p1 = parseCibListPage(await first.text());
  const sernos = [...p1.sernos];
  for (let page = 2; page <= p1.pageCount; page += 1) {
    const res = await http(`${LIST}&page=${page}`);
    if (!res.ok) throw new Error(`cib list page ${page}: HTTP ${res.status}`);
    for (const s of parseCibListPage(await res.text()).sernos) {
      if (!sernos.includes(s)) sernos.push(s);
    }
  }
  log(`cib: ${sernos.length} sernos over ${p1.pageCount} pages`);

  const out: CibRaw[] = [];
  for (const serno of sernos) {
    try {
      const res = await http(RECORD(serno));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CibJson;
      if (!data || typeof data.subject !== "string") throw new Error("unexpected JSON shape");
      out.push({ serno, data });
    } catch (e) {
      log(`cib: skip ${serno}: ${(e as Error).message}`);
    }
  }
  return out;
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `pnpm test test/cib.test.ts`
Expected: PASS 全部。

- [ ] **Step 7: Commit**

```bash
git add scripts/http.ts scripts/sources/cib.ts test/fixtures test/cib.test.ts
git commit -m "feat: 刑事局來源抓取與列表解析"
```

---

### Task 4: 調查局來源

**Files:**
- Create: `scripts/sources/mjib.ts`、`test/fixtures/mjib-list.html`、`test/fixtures/mjib-detail.html`、`test/mjib.test.ts`

**Interfaces:**
- Consumes: `Http`（Task 3）、`MjibRaw`（Task 2）。
- Produces:
  - `parseMjibListPage(html: string): { uids: number[]; pageCount: number }`
  - `parseMjibDetail(html: string, uid: number): MjibRaw | null`（沒有 `crimes-detail` 區塊回 null）
  - `fetchMjib(http: Http, log?: (m: string) => void): Promise<MjibRaw[]>`

- [ ] **Step 1: 寫 fixture**

`test/fixtures/mjib-list.html`:
```html
<!DOCTYPE html><html lang="zh-Hant-TW"><body>
<form id="Crimes_List" method="post" action="/Crimes/Crimes_List"></form>
<div class="row">
<div class="col"><div class="card crimes-card h-100">
<a href="/Crimes/Crimes_Detail?uid=483" class="text-decoration-none">
<img src="/FileUploads/prisoner_pic/aaaa.JPG" class="card-img-top" alt="測試甲 照片" />
<div class="card-body"><h5 class="card-title mb-1">測試甲</h5><div class="small text-muted">TEST, JIA</div>
<div class="mt-2 small">A12345****</div></div></a></div></div>
<div class="col"><div class="card crimes-card h-100">
<a href="/Crimes/Crimes_Detail?uid=482" class="text-decoration-none">
<img src="/FileUploads/prisoner_pic/bbbb.jpg" class="card-img-top" alt="測試乙 照片" />
<div class="card-body"><h5 class="card-title mb-1">測試乙</h5></div></a></div></div>
</div>
<nav><ul class="pagination">
<li><a href="/Crimes/Crimes_List?page=2">2</a></li>
<li><a href="/Crimes/Crimes_List?page=3">3</a></li>
<li><a href="/Crimes/Crimes_List?page=27">27</a></li>
</ul></nav>
</body></html>
```

`test/fixtures/mjib-detail.html`:
```html
<!DOCTYPE html><html lang="zh-Hant-TW"><body>
<div class="editpage-content-text"><div class="crimes-detail">
<div id="mjib-crimelogo"><img src="/images/crimelogo.png" alt="" /></div>
<ul>
<li><img src="/FileUploads/prisoner_pic/aaaa.JPG" alt="測試甲 照片/TEST, JIA photo" /></li>
<li><div>中文姓名</div><div>測試甲</div></li>
<li><div>英文姓名</div><div>TEST, JIA</div></li>
<li><div>出生年月日</div><div>
1950/**/**                                </div></li>
<li><div>身分證統一編號</div><div>
A12345****                                </div></li>
<li><div>護照號碼</div><div>
123456***                                </div></li>
<li><div>可能潛逃時間</div><div>不詳</div></li>
<li><div>可能潛逃地點</div><div>不詳</div></li>
<li><div>通緝機關</div><div>臺灣屏東地方檢察署</div></li>
<li><div>通緝時間</div><div>2019/03/26</div></li>
<li><div>通緝罪名</div><div>貪污</div></li>
<li><div>涉嫌事實</div><div>測試事實，第一行。
第二行。</div></li>
</ul></div></div>
</body></html>
```

- [ ] **Step 2: 寫測試（失敗）**

`test/mjib.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseMjibListPage, parseMjibDetail, fetchMjib } from "../scripts/sources/mjib";
import type { Http } from "../scripts/http";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseMjibListPage", () => {
  it("uid 與頁數", () => {
    const r = parseMjibListPage(fx("mjib-list.html"));
    expect(r.uids).toEqual([483, 482]);
    expect(r.pageCount).toBe(27);
  });
  it("錯誤頁 → 0 筆 1 頁", () => {
    const r = parseMjibListPage(fx("error-page.html"));
    expect(r.uids).toEqual([]);
    expect(r.pageCount).toBe(1);
  });
});

describe("parseMjibDetail", () => {
  const raw = parseMjibDetail(fx("mjib-detail.html"), 483)!;
  it("欄位成對、去空白", () => {
    expect(raw.uid).toBe(483);
    expect(raw.fields["中文姓名"]).toBe("測試甲");
    expect(raw.fields["出生年月日"]).toBe("1950/**/**");
    expect(raw.fields["身分證統一編號"]).toBe("A12345****");
    expect(raw.fields["通緝罪名"]).toBe("貪污");
    expect(raw.fields["涉嫌事實"]).toBe("測試事實，第一行。\n第二行。");
  });
  it("照片是絕對網址", () => {
    expect(raw.photoUrl).toBe("https://www.mjib.gov.tw/FileUploads/prisoner_pic/aaaa.JPG");
  });
  it("錯誤頁 → null", () => {
    expect(parseMjibDetail(fx("error-page.html"), 1)).toBeNull();
  });
});

describe("fetchMjib", () => {
  const list = fx("mjib-list.html");
  const onePage = list.replace(/<li><a href="\/Crimes\/Crimes_List\?page=\d+">\d+<\/a><\/li>/g, "");
  const detail = fx("mjib-detail.html");

  it("逐頁、逐筆", async () => {
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      if (url.includes("Crimes_List")) return new Response(onePage, { status: 200 });
      return new Response(detail, { status: 200 });
    };
    const out = await fetchMjib(http);
    expect(out.map((r) => r.uid)).toEqual([483, 482]);
    expect(calls.filter((u) => u.includes("Crimes_Detail"))).toHaveLength(2);
  });

  it("多頁去重", async () => {
    const http: Http = async (url) =>
      new Response(url.includes("Crimes_List") ? list : detail, { status: 200 });
    const out = await fetchMjib(http);
    expect(out).toHaveLength(2);
  });

  it("列表失敗 → 丟錯；詳細頁錯誤頁 → 略過", async () => {
    await expect(fetchMjib(async () => new Response("", { status: 500 }))).rejects.toThrow();
    let n = 0;
    const http: Http = async (url) => {
      if (url.includes("Crimes_List")) return new Response(onePage, { status: 200 });
      n += 1;
      return new Response(n === 1 ? fx("error-page.html") : detail, { status: 200 });
    };
    expect(await fetchMjib(http)).toHaveLength(1);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm test test/mjib.test.ts`
Expected: FAIL，模組不存在。

- [ ] **Step 4: 寫 mjib.ts**

`scripts/sources/mjib.ts`:
```ts
import * as cheerio from "cheerio";
import type { Http } from "../http";
import type { MjibRaw } from "../normalize";

const BASE = "https://www.mjib.gov.tw";
const LIST = (page: number) => `${BASE}/Crimes/Crimes_List?page=${page}`;
const DETAIL = (uid: number) => `${BASE}/Crimes/Crimes_Detail?uid=${uid}`;

export function parseMjibListPage(html: string): { uids: number[]; pageCount: number } {
  const $ = cheerio.load(html);
  const uids: number[] = [];
  $('a[href*="Crimes_Detail?uid="]').each((_, a) => {
    const m = ($(a).attr("href") ?? "").match(/uid=(\d+)/);
    if (m) {
      const uid = Number(m[1]);
      if (!uids.includes(uid)) uids.push(uid);
    }
  });
  let pageCount = 1;
  $('a[href*="Crimes_List?page="]').each((_, a) => {
    const m = ($(a).attr("href") ?? "").match(/page=(\d+)/);
    if (m) pageCount = Math.max(pageCount, Number(m[1]));
  });
  return { uids, pageCount };
}

export function parseMjibDetail(html: string, uid: number): MjibRaw | null {
  const $ = cheerio.load(html);
  const root = $(".crimes-detail");
  if (root.length === 0) return null;
  const fields: Record<string, string> = {};
  root.find("ul > li").each((_, li) => {
    const divs = $(li).children("div");
    if (divs.length < 2) return;
    const key = $(divs[0]).text().trim();
    const value = $(divs[1]).text().replace(/\r/g, "").split("\n").map((s) => s.trim()).filter(Boolean).join("\n");
    if (key) fields[key] = value;
  });
  const src = root.find("ul > li img").first().attr("src");
  const photoUrl = src && src.includes("prisoner_pic") ? new URL(src, BASE).toString() : undefined;
  return { uid, photoUrl, fields };
}

export async function fetchMjib(http: Http, log: (m: string) => void = () => {}): Promise<MjibRaw[]> {
  const first = await http(LIST(1));
  if (!first.ok) throw new Error(`mjib list page 1: HTTP ${first.status}`);
  const p1 = parseMjibListPage(await first.text());
  const uids = [...p1.uids];
  for (let page = 2; page <= p1.pageCount; page += 1) {
    const res = await http(LIST(page));
    if (!res.ok) throw new Error(`mjib list page ${page}: HTTP ${res.status}`);
    for (const u of parseMjibListPage(await res.text()).uids) {
      if (!uids.includes(u)) uids.push(u);
    }
  }
  log(`mjib: ${uids.length} uids over ${p1.pageCount} pages`);

  const out: MjibRaw[] = [];
  for (const uid of uids) {
    try {
      const res = await http(DETAIL(uid));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = parseMjibDetail(await res.text(), uid);
      if (!raw) throw new Error("no crimes-detail block");
      out.push(raw);
    } catch (e) {
      log(`mjib: skip ${uid}: ${(e as Error).message}`);
    }
  }
  return out;
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm test test/mjib.test.ts`
Expected: PASS 全部。

- [ ] **Step 6: Commit**

```bash
git add scripts/sources/mjib.ts test/fixtures/mjib-list.html test/fixtures/mjib-detail.html test/mjib.test.ts
git commit -m "feat: 調查局來源抓取與解析"
```

---

### Task 5: 防線（stale 與 30% 規則）

**Files:**
- Create: `scripts/guard.ts`、`test/guard.test.ts`

**Interfaces:**
- Consumes: `WantedRecord`（Task 1）。
- Produces: `guardSource(prev: WantedRecord[], next: WantedRecord[] | null): { records: WantedRecord[]; stale: boolean; reason?: string }`

- [ ] **Step 1: 寫測試（失敗）**

`test/guard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { guardSource } from "../scripts/guard";
import type { WantedRecord } from "../src/lib/types";

const rec = (id: string): WantedRecord => ({
  id, source: "cib", name: "測試", photo: null, wantedUnit: "", accusation: "", category: "其他",
  sourceUrl: "", updatedAt: "2026-01-01", fetchedAt: "2026-01-01T00:00:00.000Z",
});
const many = (n: number, prefix = "a") => Array.from({ length: n }, (_, i) => rec(`${prefix}${i}`));

describe("guardSource", () => {
  it("正常：用新資料", () => {
    const r = guardSource(many(10), many(9, "b"));
    expect(r.stale).toBe(false);
    expect(r.records.map((x) => x.id)).toEqual(many(9, "b").map((x) => x.id));
  });
  it("抓取失敗（null）→ 沿用舊資料", () => {
    const r = guardSource(many(10), null);
    expect(r.stale).toBe(true);
    expect(r.records).toHaveLength(10);
  });
  it("0 筆 → stale", () => {
    expect(guardSource(many(10), []).stale).toBe(true);
  });
  it("掉超過 30% → stale", () => {
    expect(guardSource(many(100), many(69, "b")).stale).toBe(true);
    expect(guardSource(many(100), many(70, "b")).stale).toBe(false);
  });
  it("第一次（舊資料空）且有新資料 → 不 stale", () => {
    const r = guardSource([], many(3));
    expect(r.stale).toBe(false);
    expect(r.records).toHaveLength(3);
  });
  it("第一次且 0 筆 → stale 但 records 空", () => {
    const r = guardSource([], []);
    expect(r.stale).toBe(true);
    expect(r.records).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test test/guard.test.ts`
Expected: FAIL。

- [ ] **Step 3: 寫 guard.ts**

`scripts/guard.ts`:
```ts
import type { WantedRecord } from "../src/lib/types";

const MAX_DROP_RATIO = 0.3;

/**
 * 判斷一個來源的新資料能不能用。
 * null（抓取失敗）、0 筆、或比上一版少超過 30% → 沿用舊資料並標 stale。
 */
export function guardSource(
  prev: WantedRecord[],
  next: WantedRecord[] | null,
): { records: WantedRecord[]; stale: boolean; reason?: string } {
  if (next === null) return { records: prev, stale: true, reason: "fetch failed" };
  if (next.length === 0) return { records: prev, stale: true, reason: "0 records" };
  if (prev.length > 0 && next.length < prev.length * (1 - MAX_DROP_RATIO)) {
    return { records: prev, stale: true, reason: `dropped ${prev.length} → ${next.length}` };
  }
  return { records: next, stale: false };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test test/guard.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add scripts/guard.ts test/guard.test.ts
git commit -m "feat: 來源防線，失敗或掉太多筆就沿用舊資料"
```

---

### Task 6: 照片下載與縮圖

**Files:**
- Create: `scripts/photos.ts`、`test/photos.test.ts`

**Interfaces:**
- Consumes: `Http`（Task 3）。
- Produces: `savePhoto(http: Http, url: string, outPath: string): Promise<boolean>` — 成功寫出 JPEG 回 true；非圖片、HTTP 失敗、解碼失敗回 false 且不留檔。

- [ ] **Step 1: 寫測試（失敗）**

`test/photos.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { savePhoto } from "../scripts/photos";
import type { Http } from "../scripts/http";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "photos-")); });

const png = async (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#808080" } }).png().toBuffer();

describe("savePhoto", () => {
  it("縮到長邊 480、輸出 JPEG、去 metadata", async () => {
    const buf = await png(1200, 800);
    const http: Http = async () => new Response(buf, { status: 200, headers: { "content-type": "image/png" } });
    const out = join(dir, "x.jpg");
    expect(await savePhoto(http, "https://example.test/a.png", out)).toBe(true);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(480);
    expect(meta.height).toBe(320);
    expect(meta.exif).toBeUndefined();
  });
  it("小圖不放大", async () => {
    const buf = await png(200, 300);
    const http: Http = async () => new Response(buf, { status: 200, headers: { "content-type": "image/png" } });
    const out = join(dir, "s.jpg");
    await savePhoto(http, "u", out);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(200);
  });
  it("content-type 不是圖片 → false 且不建檔", async () => {
    const http: Http = async () => new Response("<html>預設圖頁</html>", { status: 200, headers: { "content-type": "text/html" } });
    const out = join(dir, "n.jpg");
    expect(await savePhoto(http, "u", out)).toBe(false);
    expect(existsSync(out)).toBe(false);
  });
  it("HTTP 失敗 → false", async () => {
    const http: Http = async () => new Response("", { status: 404 });
    expect(await savePhoto(http, "u", join(dir, "f.jpg"))).toBe(false);
  });
  it("內容不是合法圖片 → false 且不建檔", async () => {
    const http: Http = async () => new Response("not an image", { status: 200, headers: { "content-type": "image/jpeg" } });
    const out = join(dir, "bad.jpg");
    expect(await savePhoto(http, "u", out)).toBe(false);
    expect(existsSync(out)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test test/photos.test.ts`
Expected: FAIL。

- [ ] **Step 3: 寫 photos.ts**

`scripts/photos.ts`:
```ts
import sharp from "sharp";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { Http } from "./http";

const MAX_EDGE = 480;

/** 下載 → 自動轉正 → 長邊 480、不放大 → JPEG q80、去 metadata。失敗回 false，不留檔。 */
export async function savePhoto(http: Http, url: string, outPath: string): Promise<boolean> {
  try {
    const res = await http(url);
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return false;
    const input = Buffer.from(await res.arrayBuffer());
    const output = await sharp(input)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, output);
    return true;
  } catch {
    await rm(outPath, { force: true });
    return false;
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test test/photos.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add scripts/photos.ts test/photos.test.ts
git commit -m "feat: 照片下載、縮圖、去 metadata"
```

---

### Task 7: 抓取主程式，跑出真實資料

**Files:**
- Create: `scripts/fetch.ts`、`scripts/io.ts`、`test/io.test.ts`、`data/.gitkeep`、`public/photos/.gitkeep`

**Interfaces:**
- Consumes: Task 2–6 全部。
- Produces:
  - `readPrev(dataDir: string): WantedRecord[]`
  - `writeData(dataDir: string, records: WantedRecord[], meta: Meta): Promise<void>`
  - `pruneOrphanPhotos(photoDir: string, keepIds: Set<string>): Promise<string[]>`（回刪掉的檔名）
  - `data/wanted.json`、`data/meta.json`、`public/photos/*.jpg`

- [ ] **Step 1: 寫 io 測試（失敗）**

`test/io.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPrev, writeData, pruneOrphanPhotos } from "../scripts/io";
import type { WantedRecord, Meta } from "../src/lib/types";

const rec = (id: string, updatedAt: string): WantedRecord => ({
  id, source: "cib", name: "測試", photo: null, wantedUnit: "", accusation: "", category: "其他",
  sourceUrl: "", updatedAt, fetchedAt: "2026-01-01T00:00:00.000Z",
});
const meta: Meta = { fetchedAt: "x", sources: { cib: { count: 1, stale: false, errors: 0 }, mjib: { count: 0, stale: false, errors: 0 } } };

describe("io", () => {
  it("readPrev 沒檔案回空陣列", () => {
    expect(readPrev(mkdtempSync(join(tmpdir(), "io-")))).toEqual([]);
  });
  it("writeData 依 updatedAt 倒序、2 空白縮排、結尾換行；readPrev 讀回", async () => {
    const dir = mkdtempSync(join(tmpdir(), "io-"));
    await writeData(dir, [rec("a", "2026-01-01"), rec("b", "2026-03-01")], meta);
    const text = readFileSync(join(dir, "wanted.json"), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text).map((r: WantedRecord) => r.id)).toEqual(["b", "a"]);
    expect(readPrev(dir)).toHaveLength(2);
    expect(JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")).sources.cib.count).toBe(1);
  });
  it("pruneOrphanPhotos 只刪不在 keep 裡的 jpg", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cib-1.jpg"), "");
    writeFileSync(join(dir, "mjib-2.jpg"), "");
    writeFileSync(join(dir, ".gitkeep"), "");
    const removed = await pruneOrphanPhotos(dir, new Set(["cib-1"]));
    expect(removed).toEqual(["mjib-2.jpg"]);
    expect(existsSync(join(dir, "cib-1.jpg"))).toBe(true);
    expect(existsSync(join(dir, ".gitkeep"))).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test test/io.test.ts`
Expected: FAIL。

- [ ] **Step 3: 寫 io.ts**

`scripts/io.ts`:
```ts
import { readFileSync, existsSync } from "node:fs";
import { writeFile, readdir, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { WantedRecord, Meta } from "../src/lib/types";

export function readPrev(dataDir: string): WantedRecord[] {
  const p = join(dataDir, "wanted.json");
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf8")) as WantedRecord[];
}

export async function writeData(dataDir: string, records: WantedRecord[], meta: Meta): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const sorted = [...records].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id.localeCompare(b.id)));
  await writeFile(join(dataDir, "wanted.json"), JSON.stringify(sorted, null, 2) + "\n");
  await writeFile(join(dataDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
}

export async function pruneOrphanPhotos(photoDir: string, keepIds: Set<string>): Promise<string[]> {
  const removed: string[] = [];
  for (const name of await readdir(photoDir)) {
    if (!name.endsWith(".jpg")) continue;
    if (keepIds.has(name.slice(0, -4))) continue;
    await rm(join(photoDir, name));
    removed.push(name);
  }
  return removed.sort();
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test test/io.test.ts`
Expected: PASS。

- [ ] **Step 5: 寫 fetch.ts**

`scripts/fetch.ts`:
```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHttp } from "./http";
import { fetchCib } from "./sources/cib";
import { fetchMjib } from "./sources/mjib";
import { normalizeCib, normalizeMjib, type Normalized } from "./normalize";
import { guardSource } from "./guard";
import { savePhoto } from "./photos";
import { readPrev, writeData, pruneOrphanPhotos } from "./io";
import type { Meta, Source, WantedRecord } from "../src/lib/types";

const ROOT = new URL("..", import.meta.url).pathname;
const DATA_DIR = join(ROOT, "data");
const PHOTO_DIR = join(ROOT, "public", "photos");

const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

async function run() {
  const fetchedAt = new Date().toISOString();
  const http = createHttp({ delayMs: 500 });
  const prev = readPrev(DATA_DIR);
  const prevBy = (s: Source) => prev.filter((r) => r.source === s);

  const meta: Meta = {
    fetchedAt,
    sources: { cib: { count: 0, stale: false, errors: 0 }, mjib: { count: 0, stale: false, errors: 0 } },
  };

  async function collect(source: Source, work: () => Promise<Normalized[]>): Promise<WantedRecord[]> {
    let next: Normalized[] | null = null;
    try {
      next = await work();
    } catch (e) {
      log(`${source}: FAILED ${(e as Error).message}`);
    }
    const prevRecords = prevBy(source);
    const prevById = new Map(prevRecords.map((r) => [r.id, r]));

    let withPhotos: WantedRecord[] | null = null;
    if (next) {
      withPhotos = [];
      for (const { record, photoUrl } of next) {
        const file = join(PHOTO_DIR, `${record.id}.jpg`);
        const already = prevById.get(record.id)?.photo && existsSync(file);
        let ok = Boolean(already);
        if (!ok && photoUrl) ok = await savePhoto(http, photoUrl, file);
        if (!ok && photoUrl) meta.sources[source].errors += 1;
        withPhotos.push({ ...record, photo: ok ? `photos/${record.id}.jpg` : null });
      }
    }

    const g = guardSource(prevRecords, withPhotos);
    meta.sources[source].stale = g.stale;
    meta.sources[source].count = g.records.length;
    log(`${source}: ${g.records.length} records${g.stale ? ` (STALE: ${g.reason})` : ""}`);
    return g.records;
  }

  const cib = await collect("cib", async () =>
    (await fetchCib(http, log)).map((r) => normalizeCib(r, fetchedAt)));
  const mjib = await collect("mjib", async () =>
    (await fetchMjib(http, log)).map((r) => normalizeMjib(r, fetchedAt)));

  const all = [...cib, ...mjib];
  await writeData(DATA_DIR, all, meta);
  const removed = await pruneOrphanPhotos(PHOTO_DIR, new Set(all.map((r) => r.id)));
  if (removed.length) log(`pruned photos: ${removed.join(", ")}`);

  const stale = meta.sources.cib.stale || meta.sources.mjib.stale;
  log(`done: cib=${meta.sources.cib.count} mjib=${meta.sources.mjib.count} stale=${stale}`);
  process.exit(stale ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
```

- [ ] **Step 6: 跑真實抓取**

```bash
touch data/.gitkeep public/photos/.gitkeep
pnpm sync
```

Expected: log 顯示 `cib: 7 pages`、`mjib: 27 pages`，結尾 `cib≈104 mjib≈313 stale=false`，exit 0。約 4 分鐘。

- [ ] **Step 7: 檢查輸出沒有全碼**

```bash
grep -cE '"[A-Z][12][0-9]{8}"' data/wanted.json   # 期望 0
grep -c '"idMasked": "' data/wanted.json           # 期望接近 417
ls public/photos | wc -l                           # 期望接近 417
du -sh public/photos                               # 期望 < 40M
```

若第一行不是 0，**不要 commit**，回 Task 2 修 `maskId`。

- [ ] **Step 8: Commit**

```bash
git add scripts/fetch.ts scripts/io.ts test/io.test.ts data public/photos
git commit -m "feat: 抓取主程式；data: 首次匯入"
```

---

### Task 8: Astro 站：列表頁與搜尋篩選

**Files:**
- Create: `astro.config.mjs`、`src/env.d.ts`、`src/lib/data.ts`、`src/layouts/Base.astro`、`src/styles/global.css`、`src/components/WantedList.svelte`、`src/pages/index.astro`、`test/build.test.ts`

**Interfaces:**
- Consumes: `data/wanted.json`、`data/meta.json`、`WantedRecord`、`CATEGORIES`。
- Produces: `loadData(): { records: WantedRecord[]; meta: Meta }`（`src/lib/data.ts`）；`Base.astro` props `{ title: string; description?: string; noindex?: boolean; ogImage?: string }`。

- [ ] **Step 1: 寫 build 測試（失敗）**

`test/build.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p: string) => readFileSync(`${ROOT}/dist/${p}`, "utf8");

beforeAll(() => {
  execSync("pnpm build", { cwd: ROOT, stdio: "inherit" });
}, 300_000);

describe("build", () => {
  const records = JSON.parse(readFileSync(`${ROOT}/data/wanted.json`, "utf8"));

  it("首頁可索引、含搜尋框", () => {
    const html = read("index.html");
    expect(html).not.toContain('name="robots"');
    expect(html).toContain('type="search"');
  });
  it("首頁卡片數等於資料筆數", () => {
    const html = read("index.html");
    expect(html.match(/data-card="/g)?.length).toBe(records.length);
  });
  it("首頁不含完整身分證格式", () => {
    expect(read("index.html")).not.toMatch(/[A-Z][12]\d{8}/);
  });
  it("dist 存在", () => expect(existsSync(`${ROOT}/dist`)).toBe(true));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test test/build.test.ts`
Expected: FAIL，`astro build` 找不到設定或頁面。

- [ ] **Step 3: Astro 設定與資料載入**

`astro.config.mjs`:
```js
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  output: "static",
  integrations: [svelte()],
  site: "https://taiwan-wanted.pages.dev",
});
```

`src/env.d.ts`:
```ts
/// <reference types="astro/client" />
```

`src/lib/data.ts`:
```ts
import { readFileSync } from "node:fs";
import type { WantedRecord, Meta } from "./types";

const ROOT = new URL("../..", import.meta.url).pathname;

export function loadData(): { records: WantedRecord[]; meta: Meta } {
  const records = JSON.parse(readFileSync(`${ROOT}/data/wanted.json`, "utf8")) as WantedRecord[];
  const meta = JSON.parse(readFileSync(`${ROOT}/data/meta.json`, "utf8")) as Meta;
  return { records, meta };
}

export const SOURCE_LABEL: Record<WantedRecord["source"], string> = {
  cib: "刑事局",
  mjib: "調查局",
};
```

- [ ] **Step 4: Layout 與全域樣式**

`src/styles/global.css`:
```css
:root {
  --bg: #fafafa; --fg: #1a1a1a; --muted: #666; --card: #fff; --line: #e3e3e3; --accent: #b4232c;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #121212; --fg: #ececec; --muted: #9a9a9a; --card: #1c1c1c; --line: #2c2c2c; --accent: #e5535c; }
}
* { box-sizing: border-box; }
html { font-family: system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif; background: var(--bg); color: var(--fg); }
body { margin: 0; }
a { color: inherit; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 16px; }
header.site { border-bottom: 1px solid var(--line); }
header.site .wrap { display: flex; align-items: baseline; gap: 16px; }
header.site h1 { font-size: 1.25rem; margin: 0; }
header.site nav a { color: var(--muted); text-decoration: none; margin-left: 12px; }
.grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 640px) { .grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 960px) { .grid { grid-template-columns: repeat(3, 1fr); } }
.card { display: flex; gap: 12px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; text-decoration: none; }
.card img, .card .noimg { width: 88px; height: 112px; object-fit: cover; border-radius: 4px; background: var(--line); flex: none; }
.card .name { font-weight: 600; font-size: 1.05rem; }
.card .sub { color: var(--muted); font-size: 0.9rem; margin-top: 4px; }
.tag { display: inline-block; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--line); color: var(--muted); margin-right: 4px; }
.tag.cat { border-color: var(--accent); color: var(--accent); }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 16px; }
.toolbar input, .toolbar select { font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); }
.toolbar input { flex: 1 1 200px; }
.count { color: var(--muted); font-size: 0.9rem; margin-bottom: 8px; }
footer.site { color: var(--muted); font-size: 0.85rem; border-top: 1px solid var(--line); margin-top: 32px; }
```

`src/layouts/Base.astro`:
```astro
---
import "../styles/global.css";
interface Props { title: string; description?: string; noindex?: boolean; ogImage?: string }
const { title, description = "刑事局重要緊急查緝專案與調查局外逃通緝犯的每日彙整", noindex = false, ogImage } = Astro.props;
const SITE_NAME = "台灣通緝要犯名單";
const url = new URL(Astro.url.pathname, Astro.site);
---
<!doctype html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} | {SITE_NAME}</title>
  <meta name="description" content={description} />
  {noindex && <meta name="robots" content="noindex, nofollow" />}
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={url} />
  <meta property="og:site_name" content={SITE_NAME} />
  {ogImage && <meta property="og:image" content={new URL(ogImage, Astro.site)} />}
  <meta name="twitter:card" content="summary_large_image" />
</head>
<body>
  <header class="site"><div class="wrap">
    <h1><a href="/" style="text-decoration:none">{SITE_NAME}</a></h1>
    <nav><a href="/about">關於與資料來源</a><a href="/data.json">JSON</a></nav>
  </div></header>
  <main class="wrap"><slot /></main>
  <footer class="site"><div class="wrap">
    資料來自內政部警政署刑事警察局與法務部調查局之公開公告，每日同步。本站非官方，資料以通緝機關最新公告為準。
  </div></footer>
</body>
</html>
```

- [ ] **Step 5: Svelte 列表（卡片只在這裡渲染一次，不另做 Card.astro）**

`src/components/WantedList.svelte`（Svelte 5 runes）:
```svelte
<script lang="ts">
  import type { WantedRecord } from "../lib/types";
  import { CATEGORIES } from "../lib/types";

  let { records }: { records: WantedRecord[] } = $props();
  let q = $state("");
  let source = $state("");
  let category = $state("");

  const SOURCE_LABEL: Record<string, string> = { cib: "刑事局", mjib: "調查局" };

  let shown = $derived.by(() => {
    const needle = q.trim();
    return records.filter((r) => {
      if (source && r.source !== source) return false;
      if (category && r.category !== category) return false;
      if (!needle) return true;
      return [r.name, r.nameEn, r.accusation, r.wantedUnit].some((v) => v?.includes(needle));
    });
  });
</script>

<div class="toolbar">
  <input type="search" placeholder="搜尋姓名、罪名、通緝機關" bind:value={q} aria-label="搜尋" />
  <select bind:value={source} aria-label="來源">
    <option value="">全部來源</option>
    <option value="cib">刑事局</option>
    <option value="mjib">調查局</option>
  </select>
  <select bind:value={category} aria-label="罪名類別">
    <option value="">全部類別</option>
    {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
  </select>
</div>
<div class="count">共 {shown.length} 筆</div>
<div class="grid">
  {#each shown as r (r.id)}
    <a class="card" href={`/p/${r.id}`} data-card={r.id}>
      {#if r.photo}
        <img src={`/${r.photo}`} alt={`${r.name} 照片`} loading="lazy" width="88" height="112" />
      {:else}
        <div class="noimg" aria-hidden="true"></div>
      {/if}
      <div>
        <div class="name">{r.name}</div>
        <div class="sub">{r.birthYear ? `${r.birthYear} 年生` : "出生年不詳"}</div>
        <div class="sub">{r.accusation || "罪名未載明"}</div>
        <div class="sub">{r.wantedUnit}</div>
        <div class="sub"><span class="tag cat">{r.category}</span><span class="tag">{SOURCE_LABEL[r.source]}</span></div>
      </div>
    </a>
  {/each}
</div>
```

`src/pages/index.astro`:
```astro
---
import Base from "../layouts/Base.astro";
import WantedList from "../components/WantedList.svelte";
import { loadData } from "../lib/data";
const { records, meta } = loadData();
const stale = meta.sources.cib.stale || meta.sources.mjib.stale;
---
<Base title="名單">
  <p class="count">
    資料時間 {meta.fetchedAt.slice(0, 10)}。刑事局 {meta.sources.cib.count} 筆、調查局 {meta.sources.mjib.count} 筆。
    {stale && <strong>部分來源本次同步失敗，顯示的是上一版資料。</strong>}
  </p>
  <WantedList client:load records={records} />
</Base>
```

- [ ] **Step 6: 跑測試確認通過**

Run: `pnpm test test/build.test.ts`
Expected: PASS 4 tests。

- [ ] **Step 7: 本機看一眼**

```bash
pnpm preview
```

打開 `http://localhost:4321/`，確認：手機寬度單欄、搜尋能過濾、深色模式有跟。關掉。

- [ ] **Step 8: Commit**

```bash
git add astro.config.mjs src test/build.test.ts
git commit -m "feat: 列表頁與搜尋篩選"
```

---

### Task 9: 個人頁、404、about、data.json

**Files:**
- Create: `src/pages/p/[id].astro`、`src/pages/404.astro`、`src/pages/about.astro`、`src/pages/data.json.ts`
- Modify: `test/build.test.ts`

**Interfaces:**
- Consumes: `loadData`、`Base.astro`、`SOURCE_LABEL`。
- Produces: 靜態路徑 `/p/<id>/index.html`、`/404.html`、`/about/index.html`、`/data.json`。

- [ ] **Step 1: 加 build 測試（失敗）**

在 `test/build.test.ts` 的 `describe("build")` 內追加:
```ts
  it("個人頁 noindex、連回官方、含資料日期", () => {
    const r = records[0];
    const html = read(`p/${r.id}/index.html`);
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain(r.sourceUrl.replace(/&/g, "&amp;"));
    expect(html).toContain(r.fetchedAt.slice(0, 10));
    expect(html).not.toMatch(/[A-Z][12]\d{8}/);
  });
  it("每筆都有個人頁", () => {
    for (const r of records) expect(existsSync(`${ROOT}/dist/p/${r.id}/index.html`)).toBe(true);
  });
  it("data.json 筆數一致", () => {
    expect(JSON.parse(read("data.json"))).toHaveLength(records.length);
  });
  it("404 不含任何姓名", () => {
    const html = read("404.html");
    expect(html).toContain("已不在官方公告中");
    for (const r of records.slice(0, 20)) expect(html).not.toContain(r.name);
  });
  it("about 有回報下架的 GitHub Issues 連結", () => {
    expect(read("about/index.html")).toContain("github.com/weryk153/taiwan-wanted/issues");
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm test test/build.test.ts`
Expected: 新增的 5 個 FAIL。

- [ ] **Step 3: 個人頁**

`src/pages/p/[id].astro`:
```astro
---
import Base from "../../layouts/Base.astro";
import { loadData, SOURCE_LABEL } from "../../lib/data";
import type { WantedRecord } from "../../lib/types";

export function getStaticPaths() {
  return loadData().records.map((r) => ({ params: { id: r.id }, props: { r } }));
}
const { r } = Astro.props as { r: WantedRecord };

const rows: [string, string | undefined][] = [
  ["英文姓名", r.nameEn],
  ["性別", r.gender === "male" ? "男" : r.gender === "female" ? "女" : undefined],
  ["出生", r.birthDate ?? (r.birthYear ? `${r.birthYear} 年` : undefined)],
  ["身分證字號", r.idMasked],
  ["通緝機關", r.wantedUnit],
  ["通緝罪名", r.accusation],
  ["查緝原因", r.reason],
  ["涉嫌事實", r.facts],
  ["可能藏匿處所", r.hidePosition],
  ["可能潛逃地點", r.fledTo],
  ["可能潛逃時間", r.fledAt],
  ["檢舉電話", r.reportTel],
  ["檢舉獎金", r.reward],
  ["通緝／公告日期", r.publishedAt],
  ["官方更新日期", r.updatedAt],
];
const desc = `${r.accusation || "通緝"}｜${r.wantedUnit}｜${SOURCE_LABEL[r.source]}公告`;
---
<Base title={r.name} description={desc} noindex ogImage={`/og/${r.id}.png`}>
  <article class="person">
    <p><a href="/">← 回名單</a></p>
    <div class="card" style="max-width:720px">
      {r.photo ? <img src={`/${r.photo}`} alt={`${r.name} 照片`} width="160" height="200" style="width:160px;height:200px" /> : <div class="noimg" style="width:160px;height:200px"></div>}
      <div>
        <h2 style="margin:0 0 4px">{r.name}</h2>
        <div class="sub"><span class="tag cat">{r.category}</span><span class="tag">{SOURCE_LABEL[r.source]}</span></div>
        <dl>
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <><dt>{k}</dt><dd style="white-space:pre-line">{v}</dd></>
          ))}
        </dl>
      </div>
    </div>
    <p class="count">
      資料擷取日 {r.fetchedAt.slice(0, 10)}。本頁內容轉載自
      <a href={r.sourceUrl} rel="noopener" target="_blank">{SOURCE_LABEL[r.source]}官方公告</a>，
      以通緝機關最新公告為準。若官方已撤銷公告，本頁將於次日自動下架。
    </p>
  </article>
</Base>
<style>
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 12px 0 0; font-size: 0.95rem; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  @media (max-width: 480px) { .person .card { flex-direction: column; } dl { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 4: 404、about、data.json**

`src/pages/404.astro`:
```astro
---
import Base from "../layouts/Base.astro";
---
<Base title="找不到頁面" noindex>
  <h2>此筆已不在官方公告中，或網址有誤</h2>
  <p>通緝公告撤銷後，本站會在次日同步時自動下架該頁。請以通緝機關最新公告為準。</p>
  <p><a href="/">回名單</a></p>
</Base>
```

`src/pages/about.astro`:
```astro
---
import Base from "../layouts/Base.astro";
import { loadData } from "../lib/data";
const { meta } = loadData();
const ISSUES = "https://github.com/weryk153/taiwan-wanted/issues/new?template=takedown.md";
const REPO = "https://github.com/weryk153/taiwan-wanted";
---
<Base title="關於與資料來源">
  <h2>這是什麼</h2>
  <p>把兩份政府主動公告、附照片、請求民眾協助查緝的通緝名單彙整成一頁，方便瀏覽、搜尋與轉傳。本站非官方。</p>

  <h2>資料來源</h2>
  <ul>
    <li><a href="https://www.cib.npa.gov.tw/ch/app/wanted/list?module=wanted&id=1889" rel="noopener" target="_blank">內政部警政署刑事警察局「重要緊急查緝專案」</a>（官方提供開放資料 JSON）</li>
    <li><a href="https://www.mjib.gov.tw/Crimes/Crimes_List" rel="noopener" target="_blank">法務部調查局「外逃通緝犯查詢系統」</a>（依該站資料開放宣告，採政府資料開放授權條款第 1 版）</li>
  </ul>
  <p>不納入警政署「查捕逃犯」與高檢署「通緝要犯」兩套查詢系統，它們設計為逐人核對，非公開名單。</p>

  <h2>更新與下架</h2>
  <p>每日台灣時間 06:00 自動同步。最近一次：{meta.fetchedAt.slice(0, 16).replace("T", " ")} UTC。官方公告消失的筆，次日即從本站移除，不保留歷史，不標示「已到案」。</p>

  <h2>揭露原則</h2>
  <ul>
    <li>身分證字號只顯示前三碼，其餘遮蔽；完整號碼不儲存。</li>
    <li>護照號碼不保留。</li>
    <li>個人頁不開放搜尋引擎索引。</li>
    <li>轉貼預覽圖不使用當事人照片。</li>
  </ul>

  <h2>回報下架</h2>
  <p>若官方已撤銷公告但本站仍顯示，請到 <a href={ISSUES} rel="noopener" target="_blank">GitHub 開一個 Issue</a>，附上本站頁面網址即可，不需要說明你是誰。處理原則：官方已撤銷者，手動立即移除或等次日自動同步；官方仍在公告者，本站不會移除，請洽通緝機關。</p>

  <h2>程式碼</h2>
  <p>抓取、遮蔽與下架邏輯全部公開於 <a href={REPO} rel="noopener" target="_blank">GitHub</a>，歡迎檢視。</p>
</Base>
```

`src/pages/data.json.ts`:
```ts
import type { APIRoute } from "astro";
import { loadData } from "../lib/data";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(loadData().records), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
```

- [ ] **Step 5: 暫時關掉 ogImage，先讓 build 過**

`Base.astro` 的 `ogImage` 只有在有傳才輸出；`/og/<id>.png` 要到 Task 10 才存在。這一步不改 code，只確認 build 不會因為連結不存在而失敗（Astro 不檢查 og:image 目標）。

- [ ] **Step 6: 跑測試確認通過**

Run: `pnpm test test/build.test.ts`
Expected: PASS 全部 9 tests。

- [ ] **Step 7: Commit**

```bash
git add src/pages test/build.test.ts
git commit -m "feat: 個人頁、404、about、data.json"
```

---

### Task 10: OG 文字卡

**Files:**
- Create: `fonts/NotoSansTC-Regular.otf`、`fonts/LICENSE-OFL.txt`、`src/lib/og.ts`、`src/pages/og/[id].png.ts`、`test/og.test.ts`

**Interfaces:**
- Consumes: `loadData`、`WantedRecord`。
- Produces: `renderOg(r: Pick<WantedRecord, "name" | "accusation" | "wantedUnit" | "source">): Promise<Buffer>`（PNG 1200×630）。

- [ ] **Step 1: 取字型**

```bash
mkdir -p fonts
curl -sL -o fonts/NotoSansTC-Regular.otf "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf"
curl -sL -o fonts/LICENSE-OFL.txt "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE"
ls -la fonts   # otf 約 16MB
```

若檔案超過 20MB 或下載失敗，改抓 `Sans/SubsetOTF/TC/NotoSansTC-Regular.otf`（子集版約 6MB），路徑同倉庫。

- [ ] **Step 2: 寫測試（失敗）**

`test/og.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { renderOg } from "../src/lib/og";

describe("renderOg", () => {
  it("輸出 1200×630 PNG", async () => {
    const buf = await renderOg({ name: "測試甲", accusation: "貪污治罪條例等罪", wantedUnit: "臺灣臺北地方法院", source: "cib" });
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });
  it("超長罪名不丟錯", async () => {
    const buf = await renderOg({ name: "測試乙", accusation: "詐".repeat(80), wantedUnit: "臺灣高雄地方檢察署", source: "mjib" });
    expect(buf.length).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm test test/og.test.ts`
Expected: FAIL。

- [ ] **Step 4: 寫 og.ts 與端點**

`src/lib/og.ts`:
```ts
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import type { WantedRecord } from "./types";

const FONT = readFileSync(new URL("../../fonts/NotoSansTC-Regular.otf", import.meta.url));
const SOURCE_LABEL = { cib: "刑事局重要緊急查緝專案", mjib: "調查局外逃通緝犯" } as const;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export async function renderOg(r: Pick<WantedRecord, "name" | "accusation" | "wantedUnit" | "source">): Promise<Buffer> {
  const svg = await satori(
    {
      type: "div",
      props: {
        style: { width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#1a1a1a", color: "#fff", fontFamily: "Noto Sans TC" },
        children: [
          { type: "div", props: { style: { fontSize: 28, color: "#bbb" }, children: SOURCE_LABEL[r.source] } },
          { type: "div", props: { style: { display: "flex", flexDirection: "column", gap: 16 }, children: [
            { type: "div", props: { style: { fontSize: 96, fontWeight: 400 }, children: r.name } },
            { type: "div", props: { style: { fontSize: 40, color: "#e5535c" }, children: clip(r.accusation || "通緝", 24) } },
            { type: "div", props: { style: { fontSize: 32, color: "#bbb" }, children: clip(r.wantedUnit, 30) } },
          ] } },
          { type: "div", props: { style: { fontSize: 28, color: "#888" }, children: "台灣通緝要犯名單 · 以通緝機關最新公告為準" } },
        ],
      },
    },
    { width: 1200, height: 630, fonts: [{ name: "Noto Sans TC", data: FONT, weight: 400, style: "normal" }] },
  );
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}
```

`src/pages/og/[id].png.ts`:
```ts
import type { APIRoute } from "astro";
import { loadData } from "../../lib/data";
import { renderOg } from "../../lib/og";

export function getStaticPaths() {
  return loadData().records.map((r) => ({ params: { id: r.id }, props: { r } }));
}

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOg(props.r);
  return new Response(png, { headers: { "content-type": "image/png" } });
};
```

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm test test/og.test.ts`
Expected: PASS 2 tests。

- [ ] **Step 6: 全部測試與 build**

Run: `pnpm test`
Expected: 全部 PASS；build 測試裡的 `pnpm build` 會多產 ~417 張 PNG，時間約 1–2 分鐘。

在 `test/build.test.ts` 追加一條並跑過:
```ts
  it("每筆都有 OG 圖", () => {
    for (const r of records.slice(0, 5)) expect(existsSync(`${ROOT}/dist/og/${r.id}.png`)).toBe(true);
  });
```

- [ ] **Step 7: Commit**

```bash
git add fonts src/lib/og.ts src/pages/og test/og.test.ts test/build.test.ts
git commit -m "feat: 個人頁 OG 文字卡"
```

---

### Task 11: GitHub Actions 排程與 README

**Files:**
- Create: `.github/workflows/fetch.yml`、`.github/workflows/test.yml`、`.github/ISSUE_TEMPLATE/takedown.md`、`README.md`

**Interfaces:**
- Consumes: `pnpm sync`（exit 1 = stale）、`pnpm test`。

- [ ] **Step 1: 抓取 workflow**

`.github/workflows/fetch.yml`:
```yaml
name: fetch
on:
  schedule:
    - cron: "0 22 * * *"   # 台灣 06:00
  workflow_dispatch:

permissions:
  contents: write

jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - name: sync
        id: sync
        run: pnpm sync
        continue-on-error: true
      - name: commit
        run: |
          git config user.name "taiwan-wanted bot"
          git config user.email "actions@users.noreply.github.com"
          git add data public/photos
          if git diff --cached --quiet; then echo "no changes"; exit 0; fi
          ADD=$(git diff --cached --numstat data/wanted.json | awk '{print $1}')
          DEL=$(git diff --cached --numstat data/wanted.json | awk '{print $2}')
          git commit -m "data: $(date -u +%F) +${ADD:-0} -${DEL:-0}"
          git push
      - name: fail if stale
        if: steps.sync.outcome == 'failure'
        run: |
          echo "::error::某來源同步失敗，已沿用上一版資料，請看 fetch 步驟 log"
          exit 1
```

- [ ] **Step 2: 測試 workflow**

`.github/workflows/test.yml`:
```yaml
name: test
on:
  push:
    paths-ignore: ["data/**", "public/photos/**"]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
```

- [ ] **Step 3: Issue 範本**

`.github/ISSUE_TEMPLATE/takedown.md`:
```markdown
---
name: 回報下架
about: 官方已撤銷公告但本站仍顯示
title: "下架：<本站頁面網址>"
labels: takedown
---

本站頁面網址：

官方頁面目前狀態（例如：已找不到、顯示已到案）：

不需要提供你的身分。處理原則見 /about。
```

- [ ] **Step 4: README**

`README.md`:
```markdown
# taiwan-wanted

刑事局「重要緊急查緝專案」與調查局「外逃通緝犯」的每日彙整靜態站。

- 抓取：`pnpm sync`（每日 GitHub Actions 自動跑，commit 到 `data/` 與 `public/photos/`）
- 網站：`pnpm dev` / `pnpm build`，Astro 靜態輸出，部署 Cloudflare Pages
- 測試：`pnpm test`（不碰網路；build 測試會真的 build 一次）

## 揭露原則

身分證字號前三碼以外遮蔽且全碼不落地；護照號碼不保留；個人頁 noindex；官方下架次日本站下架，不保留歷史。細節見 `docs/superpowers/specs/`。

## 部署

Cloudflare Pages 連本 repo：build command `pnpm build`，output `dist`，Node 版本由 `.nvmrc` 決定。
```

- [ ] **Step 5: 本機驗 commit 訊息邏輯**

```bash
git diff --cached --quiet && echo "no changes (預期，因為沒 stage)"
```

- [ ] **Step 6: Commit**

```bash
git add .github README.md
git commit -m "chore: 每日抓取與測試 workflow、README"
```

- [ ] **Step 7: 建 GitHub repo 並推**

```bash
gh repo create taiwan-wanted --public --source=. --push
```

然後到 Cloudflare Pages 連這個 repo（build `pnpm build`、output `dist`）。這一步要在瀏覽器操作，不在腳本內。推上去後手動在 GitHub Actions 跑一次 `fetch` workflow，確認「no changes」且綠燈。

---

## 自審紀錄

- **Spec 覆蓋**：資料模型（T1）、抓取六步（T3–T7）、分類（T2）、照片規格（T6）、防線（T5）、四個頁面＋data.json（T8–T9）、OG（T10）、workflow 與部署（T11）、刪除請求原則（T9 about）。「不做」清單無對應 task，正確。
- **型別一致**：`Http` 簽名在 T3 定義，T4/T6/T7 沿用；`Normalized` 在 T2 定義，T7 使用；`guardSource` 回傳含 `reason`，T7 有印。卡片樣板只有 `WantedList.svelte` 一份。
- **Review Focus 對應**：1 → T3/T4 錯誤頁測試、T5 零筆測試；2 → T2 `normalizeCib` 解碼與換行；3 → T2 `rocToIso`；4 → T2 `maskId` 已遮蔽案例；5 → T6 content-type 測試。
- **已知取捨**：刑事局單筆 JSON 每筆一個請求（104 次），比整批端點慢但有 `serno`。字型檔 6–16MB 進 repo，已在 spec 決策表。
