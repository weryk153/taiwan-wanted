import { readFileSync, existsSync } from "node:fs";
import { writeFile, readdir, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { WantedRecord, Meta } from "../src/lib/types";

export function readPrev(dataDir: string): WantedRecord[] {
  const p = join(dataDir, "wanted.json");
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf8")) as WantedRecord[];
}

export async function writeData(dataDir: string, records: WantedRecord[], meta: Meta): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const sorted = [...records].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id.localeCompare(b.id)));
  await writeFile(join(dataDir, "wanted.json"), JSON.stringify(sorted, null, 2) + "\n");
  await writeFile(join(dataDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
}

export async function pruneOrphanPhotos(photoDir: string, keepIds: Set<string>): Promise<string[]> {
  const removed: string[] = [];
  for (const name of await readdir(photoDir)) {
    if (!name.endsWith(".jpg")) continue;
    if (keepIds.has(name.slice(0, -4))) continue;
    await rm(join(photoDir, name));
    removed.push(name);
  }
  return removed.sort();
}
