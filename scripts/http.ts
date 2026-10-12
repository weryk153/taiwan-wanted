export type Http = (url: string) => Promise<Response>;

const UA = "taiwan-wanted/1.0 (+https://github.com/weryk153/taiwan-wanted)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 序列化、固定間隔、固定 UA 的 fetch。 */
export function createHttp(opts: { delayMs?: number } = {}): Http {
  const delayMs = opts.delayMs ?? 500;
  let last = 0;
  return async (url) => {
    const wait = last + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    return fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
  };
}
