import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  output: "static",
  integrations: [
    svelte(),
    // 個人頁 noindex，不進 sitemap；OG 圖與照片也不列。
    sitemap({ filter: (page) => !/\/(p|og|photos)\//.test(page) && !/\/rewards\/?$/.test(page) }),
  ],
  site: "https://taiwan-wanted.pages.dev",
});
