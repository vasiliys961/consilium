export interface ZipMember {
  name: string;
  bytes: number;
  data: Uint8Array | null;
}

const MAX_LIST = 200;
const MAX_OPEN = 2_000_000;

function u16(bytes: Uint8Array, offset: number) {
  return bytes[offset] + (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number) {
  return (bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] << 24)) >>> 0;
}

function findEocd(bytes: Uint8Array) {
  const start = Math.max(0, bytes.length - 22 - 65535);
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06) {
      return offset;
    }
  }
  return -1;
}

function safeName(raw: string) {
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? "";
  if (!base || base === "." || base === ".." || base.includes("\0")) return null;
  return base;
}

function entryName(raw: string, mode: "base" | "full") {
  if (mode === "base") return safeName(raw);
  const name = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!name || name.endsWith("/") || name.includes("\0")) return null;
  if (name.split("/").some((part) => part === "..")) return null;
  return name;
}

async function inflateRaw(bytes: Uint8Array) {
  const source = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(source).arrayBuffer());
}

export interface ZipCatalogEntry {
  name: string;
  bytes: number;
  open: (maxBytes?: number) => Promise<Uint8Array | null>;
}

export function catalogZip(bytes: Uint8Array, mode: "base" | "full" = "base"): ZipCatalogEntry[] {
  const eocd = findEocd(bytes);
  if (eocd < 0) return [];
  const count = u16(bytes, eocd + 8);
  const offset = u32(bytes, eocd + 16);
  if (count === 0xffff || offset === 0xffffffff) return [];
  const entries: ZipCatalogEntry[] = [];
  const used = new Set<string>();
  let cursor = offset;
  for (let index = 0; index < count && entries.length < MAX_LIST && cursor + 46 <= bytes.length; index += 1) {
    if (u32(bytes, cursor) !== 0x02014b50) break;
    const flags = u16(bytes, cursor + 8);
    const method = u16(bytes, cursor + 10);
    const compressed = u32(bytes, cursor + 20);
    const uncompressed = u32(bytes, cursor + 24);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const local = u32(bytes, cursor + 42);
    const nameBytes = bytes.slice(cursor + 46, cursor + 46 + nameLength);
    const rawName = new TextDecoder(flags & 0x800 ? "utf-8" : "latin1").decode(nameBytes);
    cursor += 46 + nameLength + extraLength + commentLength;
    const name = entryName(rawName, mode);
    if (!name || rawName.endsWith("/")) continue;
    let unique = name;
    let suffix = 2;
    while (used.has(unique)) {
      unique = `${suffix}-${name}`;
      suffix += 1;
    }
    used.add(unique);
    const encrypted = (flags & 1) === 1;
    const localFits = local + 30 <= bytes.length && u32(bytes, local) === 0x04034b50;
    entries.push({
      name: unique,
      bytes: uncompressed,
      open: async (maxBytes = MAX_OPEN) => {
        if (encrypted || !localFits || uncompressed > maxBytes || compressed > maxBytes || (method !== 0 && method !== 8)) return null;
        const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
        const payload = bytes.slice(start, start + compressed);
        if (payload.length !== compressed) return null;
        try {
          const data = method === 0 ? payload : await inflateRaw(payload);
          return data.length === uncompressed ? data : null;
        } catch {
          return null;
        }
      },
    });
  }
  return entries;
}

export async function unpackZip(bytes: Uint8Array, mode: "base" | "full" = "base"): Promise<ZipMember[]> {
  const entries = catalogZip(bytes, mode);
  const members: ZipMember[] = [];
  for (const entry of entries) members.push({ name: entry.name, bytes: entry.bytes, data: await entry.open() });
  return members;
}
