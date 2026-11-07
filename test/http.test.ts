import { describe, it, expect, afterEach, vi } from "vitest";
import { createHttp } from "../scripts/http";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe("createHttp", () => {
  it("超過 timeoutMs 就中止", async () => {
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;
    const http = createHttp({ delayMs: 0, timeoutMs: 30 });
    const t0 = Date.now();
    await expect(http("https://example.test/slow")).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it("帶固定 UA 與 signal", async () => {
    let seen: RequestInit | undefined;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => { seen = init; return new Response("ok"); }) as typeof fetch;
    await createHttp({ delayMs: 0 })("https://example.test/");
    expect((seen?.headers as Record<string, string>)["user-agent"]).toMatch(/^taiwan-wanted\//);
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });
});
