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
