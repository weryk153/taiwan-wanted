# 開發說明

## 指令

- `pnpm sync`：抓兩個來源、正規化、下載縮圖，輸出 `data/wanted.json`、`data/meta.json`、`public/photos/`。約 10 分鐘。
- `pnpm dev`：本機預覽。要先有資料（跑一次 `pnpm sync`，或從 `site` 分支取）。
- `pnpm build`：Astro 靜態輸出到 `dist/`。
- `pnpm test`：Vitest。不碰網路；有資料時 build 測試會真的 build 一次。

## 分支

- `master`：只有程式碼，`.gitignore` 排除資料與照片。
- `site`：每日 workflow 用 master 的程式碼加最新資料做成**單一 orphan commit** force-push。Cloudflare Pages 的 production branch 設 `site`。

從 `site` 取資料到本機：

```bash
git fetch origin site
git checkout origin/site -- data public/photos
git reset -q -- data public/photos
```

## 部署

Cloudflare Pages 連本 repo：production branch `site`，build command `pnpm build`，output `dist`。Node 版本由 `.nvmrc` 決定。

## 資料流

`scripts/fetch.ts` → `sources/cib.ts`、`sources/mjib.ts`（HTTP 與解析）→ `normalize.ts`（統一格式、遮蔽證號、分類）→ `photos.ts`（縮圖、去 metadata）→ `guard.ts`（失敗或掉太多筆就沿用舊資料）→ `io.ts`（寫檔、刪孤兒照片）。

設計與決策紀錄見 `docs/superpowers/specs/`。

## 核對裁判與新聞連結

個別連結放在 `data/wanted.json` 的 `references`，與每日名單一起存放於單一 commit 的 `site` 分支，不把真實個案寫進 master、測試 fixture 或程式常數。`data.json` 會輸出有效的核對連結。

先開啟官方公告及來源全文，核對姓名以外的公司、案發期間、機關、案號等資訊，並確認裁判主文中的被告。不可把同案其他被告的刑度套到通緝對象。舊審級被撤銷或發回時，須在 `context` 明示並一併收錄後續裁判；新聞標題中的結果只屬報導時點。

在 `.tmp/` 建立待匯入 JSON 陣列，每筆包含 `recordId`、`caseKey`、`items`。`caseKey` 使用 `src/lib/references.ts` 的 `caseKey(record)` 取得，代表開始核對時的公告版本。每個 item 欄位：

- `kind`：`judgment`（司法院官方裁判書，必填 `caseNumber`）、`official`（政府案件說明，包含法院新聞稿）或 `news`。
- `title`、`url`（HTTPS 原文直連）、`publisher`、`publishedAt`（YYYY-MM-DD）。
- `checkedAt`：實際核對日期（YYYY-MM-DD）；不隨每日同步自動更新。
- `context`：此來源的審級、程序狀態、後續進度或報導限制。
- `matchedOn`：姓名之外，如何與這一筆官方公告核對。

執行 `pnpm references .tmp/reviewed.json`；全批通過欄位及公告版本驗證才寫入，會取代指定公告的完整連結清單，空 `items` 可清除。再執行 `pnpm test`。這是編輯匯入工具，格式驗證不能代替人工查證。

已查找但未取得可確認連結時，仍可在同一筆資料加上 `review`，避免和未處理公告混淆：

```json
{
  "checkedAt": "2026-10-14",
  "status": "no_match",
  "note": "本輪未找到能和公告案情充分核對的公開來源。",
  "queries": ["實際使用的姓名與案件搜尋詞"]
}
```

`status` 為 `verified`（至少一筆有效連結）、`no_match`（本輪未確認）、`unavailable`（候選原文無法讀取）。後兩者的 `items` 必須為空；格式驗證會拒絕狀態矛盾的資料。`items: []` 搭配 `review` 會保留查核紀錄，不會清除整個欄位。每個公告 ID 都要獨立處理；相同姓名可能是不同人，跨機關也須先核對身分和案情。

個人頁顯示本輪查核結果，關於頁統計目前有連結、查過但無連結及待查核的公告數。這些數字不能解讀為完整刑事紀錄覆蓋率。

同步時按公告 ID 延續連結，身分或案件內容改變則清除連結等待重新核對，公告下架則隨整筆記錄消失。build 與公開 JSON 也會過濾版本不符及不合規的連結。現有 workflow 會從 `site` 還原及發布整份 `wanted.json`，無須另建永久個案庫。

本機匯入不等於發布。部署此功能時，須讓經核對的 `data/wanted.json` 與程式碼一起進入 `site` 的單一 commit；只推 master 不會將本機忽略的資料帶上線。發布前先確認官方公告仍有效並保留遠端最新名單，勿以較舊名單覆蓋。

## 司法院裁判卡片、審級與異動

介接方式參考同一工作區的 `legislator-background/scraper/lib/judicial-feed.ts`、`scraper/judicial.ts` 與 `scraper/judgments-discover.ts`：官方 API 是 **JList 異動清單 → JDoc 全文**，不是姓名搜尋 API。另一專案也使用進階查詢「刑事＋主文姓名」尋找歷史候選；本次沒有搬入其政治人物罪名／選區評分，因為不適用通緝名單。

### 已核對裁判的來源同步

`pnpm judgments:sync` 只讀取目前有效的 `kind: judgment` 原文，以官方 JID 去重，每份間隔 500ms。讀取官方公開列印頁，不需要帳號；若出現維護、驗證或不明版型則保留既有資料，不繞過驗證。每日 `sync.yml` 會在名單更新後執行。

新增的 `judgment` 欄位保存 `jid`、`court`、`documentType`、`caseNumber`、`date`、`contentHash`、`fetchedAt`。只儲存最少 metadata 與全文雜湊，不儲存裁判全文、證號或附件。原文雜湊排除空白及頁面控制元素。`fetchedAt` 為原文檢查日，不能覆寫人工核對的 `checkedAt`。

- 初次讀取為既有已核對連結建立原文基準，不新增人物或案件。
- 後續內容不變，更新原文檢查日。
- 原文變更或明確停止公開，移除該筆舊摘要／關聯，僅保存 `pendingJudgments: [{ jid, reason: "changed" | "removed", detectedAt }]` 等待複核。不能自動套用新主文。
- 暫時失敗保留原資料及舊檢查日。HTTP 404、驗證失敗、維護或空白回應都不視為明確撤下。
- 公告案情改變或下架，待複核標記也隨公告移除。

### 人工標註審級

在原本 `pnpm references` 匯入的 item 加上 `procedure`：

```json
{
  "stage": "appeal",
  "scope": "person",
  "group": { "id": "case-a", "label": "已核對的案件名稱" },
  "priorJid": "TPDM,114,訴,99,20260102,1"
}
```

`stage` 為 `first`／`appeal`／`supreme`／`retrial`／`other`；`scope` 為 `person`（涉及本人之裁判）或 `related`（同案／背景資料）。民事、附帶民事及保全裁定仍須如實標註，不推算刑期或是否定讞。

分組限定同一公告內，`group` 可省略；有至少兩份裁判、相同分組名稱及明確 `priorJid` 前後審鏈才顯示時間線。不能只因同名、同案由或日期先後自動串接。已有來源異動被移除時，不完整鏈停止顯示，仍有效的卡片保留。核對摘要不應依賴「上列／下列」位置，應直接寫出裁判日期及字號。

### API 候選清單

在本機 `.env` 或環境變數設定 `JUDICIAL_API_USER`、`JUDICIAL_API_PASSWORD`（模板見 `.env.example`）。若要明確使用另一個設定檔，可設定 `JUDICIAL_ENV_FILE=/absolute/path/.env`；只讀取這兩個欄位，不複製其他服務憑證。

- `pnpm judicial:measure`：驗證及取得異動清單，只回報筆數。
- `pnpm judicial:feed --max=500`：讀取異動全文，比對主文前的被告／上訴人等欄位，產生 **needs_review** 候選；絕不改寫 `wanted.json`。
- `.tmp/judicial-feed/state.json` 保存待抓 JID、按「異動日＋JID」去重的紀錄及候選。原專案永久略過已看過 JID 的方式在此改為按異動日判斷，確保修訂仍被處理。達上限或失敗的工作保留供續跑，連續五次失敗先結束。候選不含原文、姓名、證號或主文摘錄，依公告指紋與 30 日期限清理。
- 僅文字型 JDoc 可自動比對；PDF、錯誤／不完整回應留待處理，不能當作沒有案件。主文姓名或當事人欄命中僅是候選訊號，仍須人工核對。
- API 候選工具目前在本機執行，不把待核對的人物關聯上傳 GitHub artifacts/cache 或部署。網站現有每日排程只檢查已收錄裁判的公開原文；API 全量異動探索未啟用線上排程。

官方 [2025-08-22 API 規格](https://opendata.judicial.gov.tw/api/Newses/42/file) 限制：每日臺灣時間 00:00–06:00 提供服務，JList 提供 7 日前異動，並非可回補任意日期的歷史搜尋。程式在時段外不送出帳密。缺跑的日期不能宣稱已完整涵蓋，歷史資料仍需另行核對。

## 字型

`fonts/NotoSansTC-Regular.otf` 用於 OG 圖，SIL Open Font License 1.1，見 `fonts/LICENSE-OFL.txt`。

### 懸賞獎金排行

`/rewards/` 由 `src/lib/rewards.ts` 解析官方公告的 `reward` 備註欄位，再按明確的新臺幣獎金降冪排序，同額並列。這個欄位常只有安全提醒，不可直接視為金額；不使用涉案金額或通用獎勵標準推算個人懸賞。保留「最高」上限及原句，無法確認的金額不列入，也不視為零元。來源資料下架時自動移出排行，頁面與個人頁同樣設為 noindex。
