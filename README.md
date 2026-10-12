# taiwan-wanted

刑事局「重要緊急查緝專案」與調查局「外逃通緝犯」的每日彙整靜態站。

- 抓取：`pnpm sync`（每日 GitHub Actions 自動跑，commit 到 `data/` 與 `public/photos/`）
- 網站：`pnpm dev` / `pnpm build`，Astro 靜態輸出，部署 Cloudflare Pages
- 測試：`pnpm test`（不碰網路；build 測試會真的 build 一次）

## 揭露原則

身分證字號前三碼以外遮蔽且全碼不落地；護照號碼不保留；個人頁 noindex；官方下架次日本站下架，不保留歷史。細節見 `docs/superpowers/specs/`。

## 回報下架

官方已撤銷公告但本站仍顯示時，開一個 Issue（有範本），附頁面網址即可。

## 部署

Cloudflare Pages 連本 repo：build command `pnpm build`，output `dist`，Node 版本由 `.nvmrc` 決定。

## 字型

`fonts/NotoSansTC-Regular.otf` 用於 OG 圖，SIL Open Font License 1.1，見 `fonts/LICENSE-OFL.txt`。
