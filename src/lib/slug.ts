/** 把機關名稱這類字串變成能放進網址路徑的 slug：中文保留，斜線、括號、空白、問號等換成連字號。 */
export function slugify(s: string): string {
  return s
    .replace(/[\/\\?#%()（）\[\]【】\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
