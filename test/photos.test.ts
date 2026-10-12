import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
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
