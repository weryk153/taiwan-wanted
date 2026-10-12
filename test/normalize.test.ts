import { describe, it, expect } from "vitest";
import { rocToIso, maskId, normalizeCib, normalizeMjib } from "../scripts/normalize";
import { categorize } from "../src/lib/categories";

const FETCHED = "2026-10-12T22:00:00.000Z";

describe("rocToIso", () => {
  it("民國三位數年、dash", () => expect(rocToIso("044-12-19")).toBe("1955-12-19"));
  it("民國三位數年、slash", () => expect(rocToIso("115/09/15")).toBe("2026-09-15"));
  it("民國兩位數年", () => expect(rocToIso("88-01-05")).toBe("1999-01-05"));
  it("西元", () => expect(rocToIso("2019/03/26")).toBe("2019-03-26"));
  it("空或不詳", () => {
    expect(rocToIso("")).toBeUndefined();
    expect(rocToIso("不詳")).toBeUndefined();
    expect(rocToIso(undefined)).toBeUndefined();
  });
});

describe("maskId", () => {
  it("全碼", () => expect(maskId("A123456789")).toBe("B10*******"));
  it("已遮蔽", () => expect(maskId("T10277****")).toBe("T10*******"));
  it("太短或空", () => {
    expect(maskId("AB")).toBeUndefined();
    expect(maskId("")).toBeUndefined();
    expect(maskId(undefined)).toBeUndefined();
  });
});

describe("categorize", () => {
  it.each([
    ["持槍殺人", "殺人傷害"],
    ["殺人罪", "殺人傷害"],
    ["強制性交", "性侵"],
    ["性犯罪防治法等案", "性侵"],
    ["毒品危害防制條例", "毒品"],
    ["詐欺等罪", "詐欺"],
    ["貪污治罪條例", "貪污"],
    ["貪汙治罪條例", "貪污"],
    ["洗錢防制法", "洗錢"],
    ["槍砲彈藥刀械管制條例", "槍砲"],
    ["組織犯罪防制條例", "組織犯罪"],
    ["證券交易法", "經濟犯罪"],
    ["違反銀行法", "經濟犯罪"],
    ["侵占", "經濟犯罪"],
    ["背信", "經濟犯罪"],
    ["", "其他"],
    ["妨害自由", "其他"],
  ])("%s → %s", (input, expected) => expect(categorize(input)).toBe(expected));
});

describe("normalizeCib", () => {
  const raw = {
    serno: "11111111-1111-1111-1111-111111111111",
    data: {
      subject: "&#28204;&#35430;&#30002;",
      posterDate: "115-09-15",
      updateDate: "115-09-16",
      idNumber: "A123456789",
      gender: "male",
      birth: "044-12-19",
      reason: "刑事案件未依規定報到",
      hidePosition: "機場、港口",
      note: "檢舉獎金：\n最高新臺幣100萬元\n檢舉電話：\n02-00000000",
      wantedUnit: "臺灣臺北地方法院等機關",
      accusation: "貪污治罪條例等罪",
      publishUnit: "新北市政府警察局新店分局",
      publishNo: "1150915-1",
      reportTel: "",
      liaisonTel: "新店分局02-00000000",
      images: [{ fileurl: "https://www.cib.npa.gov.tw/ch/app/wanted/image?module=wanted&detailNo=1&init=Y", expFile: "" }],
    },
  };
  const { record, photoUrl } = normalizeCib(raw, FETCHED);

  it("id 與 source", () => {
    expect(record.id).toBe("cib-11111111-1111-1111-1111-111111111111");
    expect(record.source).toBe("cib");
    expect(record.sourceUrl).toBe(
      "https://www.cib.npa.gov.tw/ch/app/wanted/view?module=wanted&id=1889&serno=11111111-1111-1111-1111-111111111111",
    );
  });
  it("姓名解碼", () => expect(record.name).toBe("測試甲"));
  it("日期", () => {
    expect(record.birthDate).toBe("1955-12-19");
    expect(record.birthYear).toBe(1955);
    expect(record.publishedAt).toBe("2026-09-15");
    expect(record.updatedAt).toBe("2026-09-16");
    expect(record.fetchedAt).toBe(FETCHED);
  });
  it("遮蔽，且記錄裡沒有全碼", () => {
    expect(record.idMasked).toBe("A12*******");
    expect(JSON.stringify(record)).not.toContain("A123456789");
  });
  it("其他欄位", () => {
    expect(record.gender).toBe("male");
    expect(record.category).toBe("貪污");
    expect(record.reason).toBe("刑事案件未依規定報到");
    expect(record.hidePosition).toBe("機場、港口");
    expect(record.reward).toContain("\n");
    expect(record.reportTel).toBe("新店分局02-00000000");
    expect(record.wantedUnit).toBe("臺灣臺北地方法院等機關");
    expect(record.photo).toBeNull();
    expect(photoUrl).toContain("detailNo=1");
  });
  it("沒有圖片時 photoUrl undefined", () => {
    const r = normalizeCib({ ...raw, data: { ...raw.data, images: [] } }, FETCHED);
    expect(r.photoUrl).toBeUndefined();
  });
  it("updateDate 空時用 posterDate", () => {
    const r = normalizeCib({ ...raw, data: { ...raw.data, updateDate: "" } }, FETCHED);
    expect(r.record.updatedAt).toBe("2026-09-15");
  });
});

describe("normalizeMjib 去掉尾端英文", () => {
  const raw = {
    uid: 1,
    fields: {
      "中文姓名": "余劍涵（別名 JANUS YU)",
      "通緝罪名": "毒品危害防制條例 \tNarcotics Hazard Prevention Act",
      "通緝機關": "臺灣臺北地方檢察署Taiwan Taipei District Prosecutors Office",
      "可能潛逃地點": "大陸P.R.C.(China) in October 2013",
      "可能潛逃時間": "不詳unknown",
      "涉嫌事實": "王某自114年7月間寄送網路電話交換機（即IPPBX）來臺。Suspected of smuggling.",
      "出生年月日": "1980/**/**",
    },
  };
  const { record } = normalizeMjib(raw, FETCHED);
  it("罪名、機關、地點只留中文，空白正規化", () => {
    expect(record.accusation).toBe("毒品危害防制條例");
    expect(record.wantedUnit).toBe("臺灣臺北地方檢察署");
    expect(record.fledTo).toBe("大陸");
  });
  it("不詳 + 英文 → undefined", () => expect(record.fledAt).toBeUndefined());
  it("事實保留中間的英文、去掉尾端英文段", () => {
    expect(record.facts).toBe("王某自114年7月間寄送網路電話交換機（即IPPBX）來臺。");
  });
  it("姓名不動", () => expect(record.name).toBe("余劍涵（別名 JANUS YU)"));
  it("純英文值不動", () => {
    const r = normalizeMjib({ uid: 2, fields: { "可能潛逃時間": "October 2012" } }, FETCHED);
    expect(r.record.fledAt).toBe("October 2012");
  });
});

describe("normalizeMjib", () => {
  const raw = {
    uid: 483,
    photoUrl: "https://www.mjib.gov.tw/FileUploads/prisoner_pic/abc.JPG",
    fields: {
      "中文姓名": "測試乙",
      "英文姓名": "TEST, YI",
      "出生年月日": "1950/**/**",
      "身分證統一編號": "T10277****",
      "護照號碼": "211670***",
      "可能潛逃時間": "不詳",
      "可能潛逃地點": "中國大陸",
      "通緝機關": "臺灣屏東地方檢察署",
      "通緝時間": "2019/03/26",
      "通緝罪名": "貪污",
      "涉嫌事實": "測試事實。",
    },
  };
  const { record, photoUrl } = normalizeMjib(raw, FETCHED);

  it("id 與 source", () => {
    expect(record.id).toBe("mjib-483");
    expect(record.source).toBe("mjib");
    expect(record.sourceUrl).toBe("https://www.mjib.gov.tw/Crimes/Crimes_Detail?uid=483");
  });
  it("只取出生年", () => {
    expect(record.birthYear).toBe(1950);
    expect(record.birthDate).toBeUndefined();
  });
  it("遮蔽與護照不落地", () => {
    expect(record.idMasked).toBe("T10*******");
    expect(JSON.stringify(record)).not.toContain("211670");
  });
  it("欄位", () => {
    expect(record.name).toBe("測試乙");
    expect(record.nameEn).toBe("TEST, YI");
    expect(record.fledAt).toBeUndefined();
    expect(record.fledTo).toBe("中國大陸");
    expect(record.wantedUnit).toBe("臺灣屏東地方檢察署");
    expect(record.accusation).toBe("貪污");
    expect(record.category).toBe("貪污");
    expect(record.facts).toBe("測試事實。");
    expect(record.publishedAt).toBe("2019-03-26");
    expect(record.updatedAt).toBe("2019-03-26");
    expect(photoUrl).toBe(raw.photoUrl);
  });
});
