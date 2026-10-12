# taiwan-wanted 設計規格

日期：2026-10-12

## 目標

一個公開靜態網站，合併兩份政府主動公告、附照片的通緝名單，讓一般人瀏覽、搜尋、轉傳單一人的頁面。

來源僅限：

| 來源 | 入口 | 形式 | 約略筆數 |
|---|---|---|---|
| 刑事警察局「重要緊急查緝專案」 | `https://www.cib.npa.gov.tw/ch/app/wanted/list?module=wanted&id=1889` | 官方 JSON 端點（固定回 100 筆）＋ HTML 列表 | 104 |
| 法務部調查局「外逃通緝犯查詢系統」 | `https://www.mjib.gov.tw/Crimes/Crimes_List` | HTML 列表（27 頁）＋ `Crimes_Detail?uid=N` | ~300 |

不納入：警政署查捕逃犯（點查）、高檢署通緝要犯（點查）。兩者設計上不可列表，不繞過。

## 使用者與成功條件

- 對象：一般公眾。
- 成功：手機打開能在 2 秒內看到名單並搜尋；每人一頁可以貼到 LINE／FB 有預覽卡；官方下架後一天內本站跟著下架。

## 決策紀錄

| 決策 | 選擇 | 理由 |
|---|---|---|
| 架構 | 靜態站 + 排程抓取 commit JSON | 資料小、變動慢、零伺服器；沿用 legislator-background 模式 |
| 個人頁 | 有，`noindex` | 可分享，但撤緝後不殘留在搜尋結果 |
| 出生日期 | 保留完整年月日 | 官方已公告完整日期，使用者決定沒有法律疑慮就留 |
| 身分證字號 | 遮蔽為前三碼＋`*`，全碼不落地 | 全碼是冒用材料；調查局列表頁自己也遮 |
| 護照號碼 | 不保留 | 對公眾辨認無幫助 |
| 歷史 | 不保留，不標「已到案」 | 官方消失即下架，避免散布已非通緝者的資料 |
| OG 圖 | build 時產文字卡，不用當事人照片 | 避免轉貼預覽即大頭照 |
| Repo | 公開 | 讓人驗證遮蔽與下架邏輯 |

## 資料模型

抓取腳本輸出 `data/wanted.json`，陣列，依 `updatedAt` 倒序。

```ts
interface WantedRecord {
  id: string;            // "cib-<publishNo>" | "mjib-<uid>"
  source: "cib" | "mjib";
  name: string;
  nameEn?: string;       // 調查局有
  gender?: "male" | "female";
  birthDate?: string;    // ISO "YYYY-MM-DD"，民國年轉西元
  idMasked?: string;     // "B10*******"
  photo: string | null;  // "photos/<id>.jpg"；null 用預設圖
  wantedUnit: string;    // 通緝機關
  accusation: string;    // 罪名原文
  category: Category;    // 由 accusation 歸類
  facts?: string;        // 涉嫌事實
  hidePosition?: string; // 可能藏匿地點（刑事局）
  fledTo?: string;       // 可能潛逃地點（調查局）
  fledAt?: string;       // 可能潛逃時間（調查局）
  reportTel?: string;    // 檢舉電話／聯絡分局
  reward?: string;       // 檢舉獎金說明原文
  sourceUrl: string;     // 官方原始頁
  publishedAt?: string;  // ISO date
  updatedAt: string;     // ISO date；來源沒有就用 publishedAt，再沒有就用 fetchedAt
  fetchedAt: string;     // ISO datetime
}

type Category = "毒品" | "詐欺" | "貪污" | "洗錢" | "槍砲" | "組織犯罪" | "殺人傷害" | "其他";
```

`data/meta.json`：

```ts
interface Meta {
  fetchedAt: string;
  sources: Record<"cib" | "mjib", {
    count: number;
    stale: boolean;      // 本次失敗，沿用舊資料
    errors: number;      // 單筆略過數
  }>;
}
```

全碼身分證、護照號碼在抓取腳本記憶體內即丟棄，不寫入任何檔案，git 歷史中也不存在。

## 抓取流程

`pnpm fetch` 執行 `scripts/fetch.ts`：

1. **刑事局** (`scripts/sources/cib.ts`)
   - GET JSON 端點（`mserno` 參數從列表頁 HTML 動態取，不寫死）。
   - GET 列表頁各分頁，蒐集全部筆的連結；JSON 中沒有的筆，抓詳細頁補齊。
   - key：`publishNo`。
2. **調查局** (`scripts/sources/mjib.ts`)
   - GET `Crimes_List` 全部分頁，取所有 `Crimes_Detail?uid=N`。
   - 逐一 GET 詳細頁。
   - key：`uid`。
   - 請求間隔 500ms，不並發。
3. **正規化** (`scripts/normalize.ts`)：兩種原始格式 → `WantedRecord`；遮蔽；民國年轉西元；罪名歸類。
4. **照片** (`scripts/photos.ts`)：下載到 `public/photos/<id>.jpg`，sharp 縮至長邊 480px、去 EXIF、JPEG 品質 80。下載失敗 → `photo: null`，記 errors。
5. **防線** (`scripts/guard.ts`)，每個來源獨立判斷：
   - HTTP 失敗、解析得 0 筆、或筆數比上一版少超過 30% → 該來源沿用上一版記錄與照片，`stale: true`，程序以非零碼結束（讓 workflow 失敗通知）。
   - 單筆失敗 → 略過，`errors + 1`，不影響整批。
6. **寫檔**：`data/wanted.json`、`data/meta.json`；刪除本版不存在的 id 對應照片。

罪名歸類 (`src/lib/categories.ts`)：關鍵字表，順序比對，第一個命中即歸類；全部不命中為「其他」。不做模糊推測。

## 網站

Astro 5 靜態輸出，Svelte 5 只用在搜尋篩選 island。

| 路徑 | 內容 |
|---|---|
| `/` | 全部名單卡片，依 `updatedAt` 倒序。搜尋框（姓名、罪名、通緝機關，前端子字串比對）。篩選：來源、類別。卡片：照片、姓名、出生年、罪名、通緝機關、來源標籤。 |
| `/p/<id>` | 全部欄位、大圖、檢舉電話、官方原始頁連結、資料日期、「以通緝機關最新公告為準」。`<meta name="robots" content="noindex, nofollow">`。OG title／description／image。 |
| `/about` | 來源、更新頻率、免責、刪除請求信箱與處理原則。 |
| `/data.json` | `data/wanted.json` 原樣輸出。 |
| `/404` | 「此筆已不在官方公告中」，不顯示任何姓名。 |

OG 圖：build 時用 satori 或等價工具產 1200×630 文字卡（姓名、罪名、通緝機關、站名）。

視覺：手機優先單欄，桌機三欄；深色模式跟系統；無地圖、無統計圖。

## 更新與部署

- `.github/workflows/fetch.yml`：cron 每日 22:00 UTC（台灣 06:00）＋ `workflow_dispatch`。跑 `pnpm fetch`；`data/` 或 `public/photos/` 有 diff 才 commit，訊息 `data: YYYY-MM-DD +N -M`。
- Cloudflare Pages 連 repo，`pnpm build`，輸出 `dist/`。先用 `*.pages.dev`。
- 刪除請求處理原則（寫在 about）：官方已下架 → 等下次同步；官方仍公告 → 不刪，請對方洽通緝機關。

## 專案結構

```
taiwan-wanted/
  .nvmrc (22)  package.json (pnpm)  astro.config.mjs  tsconfig.json
  scripts/
    fetch.ts  sources/cib.ts  sources/mjib.ts  normalize.ts  photos.ts  guard.ts
  data/wanted.json  data/meta.json
  public/photos/
  src/
    pages/index.astro  pages/p/[id].astro  pages/about.astro  pages/data.json.ts  pages/404.astro
    components/WantedList.svelte  components/Card.astro
    lib/categories.ts  lib/types.ts
  test/
    fixtures/cib.json  fixtures/cib-list.html  fixtures/mjib-list.html  fixtures/mjib-detail.html
    normalize.test.ts  guard.test.ts  cib.test.ts  mjib.test.ts  build.test.ts
  .github/workflows/fetch.yml
  docs/superpowers/specs/
```

## 測試

Vitest，不打真網路。

- `normalize.test.ts`：fixture 原始資料 → 記錄欄位、`idMasked` 格式、民國日期轉換、歸類。
- `guard.test.ts`：掉 30%、0 筆、HTTP 失敗 → 沿用舊資料、`stale: true`、非零結束。
- `cib.test.ts`、`mjib.test.ts`：fixture HTML／JSON → 筆數與欄位。
- `build.test.ts`：`astro build` 後，`/p/<id>` 含 noindex；`/data.json` 筆數等於 `wanted.json`。

不測：網路層、Cloudflare 部署、視覺。

## 建置順序

1. 抓取腳本與其測試，跑出真實 `data/wanted.json` 與照片。
2. 頁面與 island。
3. workflow 與 Cloudflare Pages。

## 不做

- 警政署、高檢署點查系統的任何整合。
- 歷史、時間線、統計、地圖。
- 英文版。
- 人臉比對、地理定位、使用者帳號。
