import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WantedRecord } from "./types";

// build 與測試都從 repo 根目錄執行；import.meta.url 在 build 後指向 dist，不能用。
const FONT = readFileSync(join(process.cwd(), "fonts", "NotoSansTC-Regular.otf"));
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
