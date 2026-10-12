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

## 字型

`fonts/NotoSansTC-Regular.otf` 用於 OG 圖，SIL Open Font License 1.1，見 `fonts/LICENSE-OFL.txt`。
