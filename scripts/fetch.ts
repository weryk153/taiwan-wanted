import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHttp } from "./http";
import { fetchCib } from "./sources/cib";
import { fetchMjib } from "./sources/mjib";
import { normalizeCib, normalizeMjib, type Normalized } from "./normalize";
import { guardSource } from "./guard";
import { savePhoto } from "./photos";
import { readPrev, writeData, pruneOrphanPhotos } from "./io";
import type { Meta, Source, WantedRecord } from "../src/lib/types";

const ROOT = new URL("..", import.meta.url).pathname;
const DATA_DIR = join(ROOT, "data");
const PHOTO_DIR = join(ROOT, "public", "photos");

const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

async function run() {
  const fetchedAt = new Date().toISOString();
  const http = createHttp({ delayMs: 500 });
  const prev = readPrev(DATA_DIR);
  const prevBy = (s: Source) => prev.filter((r) => r.source === s);

  const meta: Meta = {
    fetchedAt,
    sources: { cib: { count: 0, stale: false, errors: 0 }, mjib: { count: 0, stale: false, errors: 0 } },
  };

  async function collect(source: Source, work: () => Promise<Normalized[]>): Promise<WantedRecord[]> {
    let next: Normalized[] | null = null;
    try {
      next = await work();
    } catch (e) {
      log(`${source}: FAILED ${(e as Error).message}`);
    }
    const prevRecords = prevBy(source);
    const prevById = new Map(prevRecords.map((r) => [r.id, r]));

    let withPhotos: WantedRecord[] | null = null;
    if (next) {
      withPhotos = [];
      for (const { record, photoUrl } of next) {
        const file = join(PHOTO_DIR, `${record.id}.jpg`);
        const already = prevById.get(record.id)?.photo && existsSync(file);
        let ok = Boolean(already);
        if (!ok && photoUrl) ok = await savePhoto(http, photoUrl, file);
        if (!ok && photoUrl) meta.sources[source].errors += 1;
        withPhotos.push({ ...record, photo: ok ? `photos/${record.id}.jpg` : null });
      }
    }

    const g = guardSource(prevRecords, withPhotos);
    meta.sources[source].stale = g.stale;
    meta.sources[source].count = g.records.length;
    log(`${source}: ${g.records.length} records${g.stale ? ` (STALE: ${g.reason})` : ""}`);
    return g.records;
  }

  const cib = await collect("cib", async () =>
    (await fetchCib(http, log)).map((r) => normalizeCib(r, fetchedAt)));
  const mjib = await collect("mjib", async () =>
    (await fetchMjib(http, log)).map((r) => normalizeMjib(r, fetchedAt)));

  const all = [...cib, ...mjib];
  await writeData(DATA_DIR, all, meta);
  const removed = await pruneOrphanPhotos(PHOTO_DIR, new Set(all.map((r) => r.id)));
  if (removed.length) log(`pruned photos: ${removed.join(", ")}`);

  const stale = meta.sources.cib.stale || meta.sources.mjib.stale;
  log(`done: cib=${meta.sources.cib.count} mjib=${meta.sources.mjib.count} stale=${stale}`);
  process.exit(stale ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
