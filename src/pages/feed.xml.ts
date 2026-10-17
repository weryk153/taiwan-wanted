import type { APIRoute } from "astro";
import { loadData } from "../lib/data";
import { buildFeed } from "../lib/feed";

export const GET: APIRoute = ({ site }) =>
  new Response(buildFeed(loadData().records, site?.toString() ?? "https://taiwan-wanted.pages.dev", 50), {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
