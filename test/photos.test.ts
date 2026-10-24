import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import bmp from "bmp-js";
import { savePhoto } from "../scripts/photos";
import type { Http } from "../scripts/http";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "photos-")); });

const png = async (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#808080" } }).png().toBuffer();

describe("savePhoto", () => {
  it("縮到長邊 480、輸出 JPEG、去 metadata", async () => {
    const buf = await png(1200, 800);
    const http: Http = async () => new Response(buf, { status: 200, headers: { "content-type": "image/png" } });
    const out = join(dir, "x.jpg");
    expect(await savePhoto(http, "https://example.test/a.png", out)).toBe(true);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(480);
    expect(meta.height).toBe(320);
    expect(meta.exif).toBeUndefined();
  });
  it("小圖不放大", async () => {
    const buf = await png(200, 300);
    const http: Http = async () => new Response(buf, { status: 200, headers: { "content-type": "image/png" } });
    const out = join(dir, "s.jpg");
    await savePhoto(http, "u", out);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(200);
  });
  it("content-type 不是圖片 → false 且不建檔", async () => {
    const http: Http = async () => new Response("<html>預設圖頁</html>", { status: 200, headers: { "content-type": "text/html" } });
    const out = join(dir, "n.jpg");
    expect(await savePhoto(http, "u", out)).toBe(false);
    expect(existsSync(out)).toBe(false);
  });
  it("BMP 內容但標成 image/jpeg（調查局實況）→ 解碼成功、顏色正確", async () => {
    const w = 6, h = 4;
    const data = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) { data[i * 4] = 0; data[i * 4 + 1] = 0; data[i * 4 + 2] = 0; data[i * 4 + 3] = 255; } // ABGR → 紅
    const encoded = bmp.encode({ data, width: w, height: h }).data;
    const http: Http = async () => new Response(encoded, { status: 200, headers: { "content-type": "image/jpeg" } });
    const out = join(dir, "bmp.jpg");
    expect(await savePhoto(http, "u", out)).toBe(true);
    const img = sharp(out);
    const meta = await img.metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(6);
    const px = await img.raw().toBuffer();
    expect(px[0]).toBeGreaterThan(200); // R
    expect(px[1]).toBeLessThan(40);     // G
    expect(px[2]).toBeLessThan(40);     // B
  });
  it("HTTP 失敗 → false", async () => {
    const http: Http = async () => new Response("", { status: 404 });
    expect(await savePhoto(http, "u", join(dir, "f.jpg"))).toBe(false);
  });
  it("內容不是合法圖片 → false 且不建檔", async () => {
    const http: Http = async () => new Response("not an image", { status: 200, headers: { "content-type": "image/jpeg" } });
    const out = join(dir, "bad.jpg");
    expect(await savePhoto(http, "u", out)).toBe(false);
    expect(existsSync(out)).toBe(false);
  });
});
