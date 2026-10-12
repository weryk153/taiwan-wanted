import type { APIRoute } from "astro";
import { loadData } from "../lib/data";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(loadData().records), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
