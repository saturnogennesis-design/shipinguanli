import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

type PutOptions = {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

type StoredMetadata = {
  contentType?: string;
  customMetadata?: Record<string, string>;
};

type RangeValue = { offset: number; length: number };
export type QuarantinedMedia = { originalKey: string; quarantineKey: string; hadMetadata: boolean };

export type LocalMediaObject = {
  body: ReadableStream;
  size: number;
  range?: RangeValue;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
};

function mediaRoot() {
  return resolve(process.env.ORBIT_MEDIA_DIR?.trim() || resolve(process.cwd(), "data", "media"));
}

function safePath(key: string) {
  const root = mediaRoot();
  const target = resolve(root, ...key.replaceAll("\\", "/").split("/").filter(Boolean));
  const relation = relative(root, target);
  if (!relation || relation.startsWith("..") || relation.includes(`..${sep}`)) {
    throw new Error("文件存储路径无效");
  }
  return target;
}

function metadataPath(target: string) {
  return `${target}.orbit-meta.json`;
}

async function readMetadata(target: string): Promise<StoredMetadata> {
  try {
    return JSON.parse(await readFile(metadataPath(target), "utf8")) as StoredMetadata;
  } catch {
    return {};
  }
}

function requestedRange(headers: Headers, size: number): RangeValue | undefined {
  const value = headers.get("range");
  const match = value?.match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return undefined;
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : NaN;
  if (Number.isNaN(start) && Number.isFinite(end)) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else {
    if (!Number.isFinite(start)) return undefined;
    if (!Number.isFinite(end)) end = size - 1;
  }
  start = Math.max(0, Math.min(start, size - 1));
  end = Math.max(start, Math.min(end, size - 1));
  return { offset: start, length: end - start + 1 };
}

class LocalMediaStore {
  async ready() {
    await mkdir(mediaRoot(), { recursive: true });
    return mediaRoot();
  }

  async put(key: string, body: ReadableStream, options: PutOptions = {}) {
    const target = safePath(key);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.uploading-${process.pid}-${Date.now()}`;
    try {
      await pipeline(Readable.fromWeb(body as never), createWriteStream(temporary, { flags: "wx" }));
      await rename(temporary, target);
      await writeFile(metadataPath(target), JSON.stringify({
        contentType: options.httpMetadata?.contentType,
        customMetadata: options.customMetadata,
      } satisfies StoredMetadata));
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async get(key: string, options?: { range?: Headers }): Promise<LocalMediaObject | null> {
    const target = safePath(key);
    let fileStat;
    try {
      fileStat = await stat(target);
    } catch {
      return null;
    }
    if (!fileStat.isFile()) return null;
    const range = options?.range ? requestedRange(options.range, fileStat.size) : undefined;
    const metadata = await readMetadata(target);
    const stream = createReadStream(target, range ? { start: range.offset, end: range.offset + range.length - 1 } : undefined);
    const etag = createHash("sha256").update(`${fileStat.size}:${fileStat.mtimeMs}`).digest("hex");
    return {
      body: Readable.toWeb(stream) as ReadableStream,
      size: fileStat.size,
      range,
      httpEtag: `"${etag}"`,
      writeHttpMetadata(headers) {
        if (metadata.contentType) headers.set("content-type", metadata.contentType);
        headers.set("content-length", String(range?.length ?? fileStat.size));
      },
    };
  }

  async delete(key: string) {
    const target = safePath(key);
    await Promise.all([
      rm(target, { force: true }),
      rm(metadataPath(target), { force: true }),
    ]);
  }

  async missing(keys: string[]) {
    const missing: string[] = [];
    for (const key of keys) {
      try { if (!(await stat(safePath(key))).isFile()) missing.push(key); }
      catch { missing.push(key); }
    }
    return missing;
  }

  async quarantine(keys: string[], batchId: string) {
    const moved: QuarantinedMedia[] = [];
    try {
      for (const originalKey of keys) {
        const quarantineKey = `.quarantine/${batchId}/${originalKey}`;
        const source = safePath(originalKey), target = safePath(quarantineKey);
        await mkdir(dirname(target), { recursive: true });
        await rename(source, target);
        let hadMetadata = false;
        try { await rename(metadataPath(source), metadataPath(target)); hadMetadata = true; } catch { hadMetadata = false; }
        moved.push({ originalKey, quarantineKey, hadMetadata });
      }
      return moved;
    } catch (error) {
      await this.restoreQuarantine(moved);
      throw error;
    }
  }

  async restoreQuarantine(items: QuarantinedMedia[]) {
    for (const item of [...items].reverse()) {
      const source = safePath(item.quarantineKey), target = safePath(item.originalKey);
      await mkdir(dirname(target), { recursive: true });
      await rename(source, target).catch(() => undefined);
      if (item.hadMetadata) await rename(metadataPath(source), metadataPath(target)).catch(() => undefined);
    }
  }

  async deleteQuarantine(items: QuarantinedMedia[]) {
    for (const item of items) await this.delete(item.quarantineKey);
  }
}

const globalStore = globalThis as typeof globalThis & { __orbitMediaStore?: LocalMediaStore };

export function getMediaStore() {
  globalStore.__orbitMediaStore ??= new LocalMediaStore();
  return globalStore.__orbitMediaStore;
}

export function getMediaDirectory() {
  return mediaRoot();
}
