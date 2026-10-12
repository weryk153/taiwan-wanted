import sharp from "sharp";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { Http } from "./http";

const MAX_EDGE = 480;

/** 下載 → 自動轉正 → 長邊 480、不放大 → JPEG q80、去 metadata。失敗回 false，不留檔。 */
export async function savePhoto(http: Http, url: string, outPath: string): Promise<boolean> {
  try {
    const res = await http(url);
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return false;
    const input = Buffer.from(await res.arrayBuffer());
    const output = await sharp(input)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, output);
    return true;
  } catch {
    await rm(outPath, { force: true });
    return false;
  }
}
