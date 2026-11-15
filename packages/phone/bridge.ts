export const PHONE_BYTE_LIMIT = 8_000_000;
const FILE_LIMIT = 20;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type PhoneFile = {
  id: number;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
};

type Session = {
  expiresAt: number;
  nextId: number;
  lastSeen?:number;
  files: PhoneFile[];
};

type Memory = { sessions: Map<string, Session> };

export type PhoneRefusal = "unknown" | "empty" | "large" | "full";

function memory(): Memory {
  const holder = globalThis as typeof globalThis & { __doctorOpusPhone?: Memory };
  holder.__doctorOpusPhone ??= { sessions: new Map() };
  return holder.__doctorOpusPhone;
}

function live(token: string, now: number): Session | null {
  const session = memory().sessions.get(token);
  if (!session || session.expiresAt <= now) {
    if (session) memory().sessions.delete(token);
    return null;
  }
  return session;
}

export function openPhoneSession(now = Date.now()): { token: string; expiresAt: string } {
  for (const [key,session] of memory().sessions) if(session.expiresAt<=now) memory().sessions.delete(key);
  const token = crypto.randomUUID();
  const expiresAt = now + SESSION_TTL_MS;
  memory().sessions.set(token, { expiresAt, nextId: 1, files: [] });
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

export function phoneFileName(raw: string, mimeType: string): string {
  const leaf = raw.split(/[/\\]/).pop() ?? "";
  const cleaned = leaf.replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const stem = !cleaned || cleaned === "." || cleaned === ".." ? "phone" : cleaned;
  if (/\.[a-z0-9]{1,8}$/i.test(stem)) return stem;
  const extension = mimeType.toLowerCase().includes("jpeg")
    ? "jpg"
    : mimeType.toLowerCase().includes("png")
      ? "png"
      : mimeType.toLowerCase().includes("webp")
        ? "webp"
        : mimeType.toLowerCase().includes("gif")
          ? "gif"
          : mimeType.toLowerCase().includes("heic")
            ? "heic"
            : mimeType.toLowerCase().includes("heif")
              ? "heif"
              : mimeType.toLowerCase().includes("pdf")
                ? "pdf"
                : mimeType.toLowerCase().includes("audio/mp4")?"m4a":mimeType.toLowerCase().includes("audio/mpeg")?"mp3":mimeType.toLowerCase().includes("audio/wav")?"wav": mimeType.toLowerCase().includes("mp4")
                  ? "mp4"
                  : mimeType.toLowerCase().includes("audio/wav")?"wav":mimeType.toLowerCase().includes("audio/mp4")?"m4a":mimeType.toLowerCase().includes("audio/mpeg")?"mp3": mimeType.toLowerCase().includes("quicktime")
                    ? "mov"
                    : "";
  return extension ? `${stem}.${extension}` : stem;
}

export function bytesFromDataUrl(value: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) return null;
  return { mimeType: match[1].slice(0, 80).toLowerCase(), bytes };
}

export function acceptPhoneFile(
  token: string,
  input: { name: string; mimeType: string; bytes: Uint8Array },
  now = Date.now(),
): { id: number; name: string } | { error: PhoneRefusal } {
  const session = live(token, now);
  if (!session) return { error: "unknown" };
  if (input.bytes.length === 0) return { error: "empty" };
  if (input.bytes.length > PHONE_BYTE_LIMIT) return { error: "large" };
  const stored=[...memory().sessions.values()].reduce((sum,item)=>sum+item.files.reduce((n,file)=>n+file.bytes.length,0),0);
  if(stored+input.bytes.length>64_000_000)return {error:"full"};
  if (session.files.length >= FILE_LIMIT) return { error: "full" };
  session.expiresAt=now+SESSION_TTL_MS;
  const file: PhoneFile = {
    id: session.nextId,
    name: phoneFileName(input.name, input.mimeType),
    mimeType: input.mimeType.slice(0, 80) || "application/octet-stream",
    bytes: input.bytes,
  };
  session.nextId += 1;
  session.files.push(file);
  return { id: file.id, name: file.name };
}

export function phoneFilesSince(token: string, since: number, now = Date.now()): PhoneFile[] | null {
  const session = live(token, now);
  if (!session) return null;
  session.expiresAt=now+SESSION_TTL_MS;
  session.files=session.files.filter(file=>file.id>since);
  return session.files;
}

export function touchPhoneSession(token:string,now=Date.now()):boolean{const session=live(token,now);if(!session)return false;session.expiresAt=now+SESSION_TTL_MS;return true;}
