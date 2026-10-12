import sharp from "sharp";
import bmp from "bmp-js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { Http } from "./http";

const MAX_EDGE = 480;

/** 調查局有些照片是 BMP 卻標成 image/jpeg；sharp 不吃 BMP，先用 bmp-js 解成 RGB raw。 */
function toSharp(input: Buffer): sharp.Sharp {
  if (input.length > 2 && input[0] === 0x42 && input[1] === 0x4d) {
    const { width, height, data } = bmp.decode(input); // ABGR
    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgb[j] = data[i + 3];
      rgb[j + 1] = data[i + 2];
      rgb[j + 2] = data[i + 1];
    }
    return sharp(rgb, { raw: { width, height, channels: 3 } });
  }
  return sharp(input);
}

/** 下載 → 自動轉正 → 長邊 480、不放大 → JPEG q80、去 metadata。失敗回 false，不留檔。 */
export async function savePhoto(http: Http, url: string, outPath: string): Promise<boolean> {
  try {
    const res = await http(url);
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return false;
    const input = Buffer.from(await res.arrayBuffer());
    const output = await toSharp(input)
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
