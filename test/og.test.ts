import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { renderOg } from "../src/lib/og";

describe("renderOg", () => {
  it("輸出 1200×630 PNG", async () => {
    const buf = await renderOg({ name: "測試甲", accusation: "貪污治罪條例等罪", wantedUnit: "臺灣臺北地方法院", source: "cib" });
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });
  it("頁尾站名在畫面內（底部 80px 有亮像素）", async () => {
    const buf = await renderOg({ name: "測試甲", accusation: "貪污", wantedUnit: "臺灣屏東地方檢察署", source: "mjib" });
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    let bright = 0;
    for (let y = info.height - 80; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * info.channels] > 60) bright++;
    }
    expect(bright).toBeGreaterThan(200);
  });
  it("超長罪名不丟錯", async () => {
    const buf = await renderOg({ name: "測試乙", accusation: "詐".repeat(80), wantedUnit: "臺灣高雄地方檢察署", source: "mjib" });
    expect(buf.length).toBeGreaterThan(1000);
  });
});
