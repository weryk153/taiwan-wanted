import type { WantedRecord } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0。依 publishedAt 新到舊，最多 limit 筆。 */
export function buildFeed(records: WantedRecord[], site: string, limit: number): string {
  const base = site.replace(/\/$/, "");
  const items = [...records]
    .filter((r) => r.publishedAt)
    .sort((a, b) => (a.publishedAt! < b.publishedAt! ? 1 : a.publishedAt! > b.publishedAt! ? -1 : a.id.localeCompare(b.id)))
    .slice(0, limit)
    .map((r) => {
      const src = r.source === "cib" ? "刑事局" : "調查局";
      const title = `${r.name}（${r.accusation || r.category}，${r.wantedUnit || src}）`;
      const desc = `${src}公告。${r.accusation || ""}${r.wantedUnit ? `，${r.wantedUnit}` : ""}。以通緝機關最新公告為準。`;
      return [
        "<item>",
        `<title>${esc(title)}</title>`,
        `<link>${base}/p/${r.id}</link>`,
        `<guid isPermaLink="true">${base}/p/${r.id}</guid>`,
        `<pubDate>${new Date(r.publishedAt + "T00:00:00Z").toUTCString()}</pubDate>`,
        `<description>${esc(desc)}</description>`,
        "</item>",
      ].join("");
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "<channel>",
    "<title>台灣通緝要犯名單</title>",
    `<link>${base}/</link>`,
    "<description>刑事局重要緊急查緝專案與調查局外逃通緝犯的每日彙整，依公告日期新到舊。</description>",
    "<language>zh-Hant-TW</language>",
    items,
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
}
