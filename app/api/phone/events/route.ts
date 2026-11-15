import { NextResponse } from "next/server";
import { phoneFilesSince } from "@/packages/phone/bridge";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const since = Number(url.searchParams.get("since") ?? "0");
  const files = phoneFilesSince(token, Number.isFinite(since) ? since : 0);
  if (!files) return NextResponse.json({ error: "unknown" }, { status: 404 });
  return NextResponse.json({
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      dataUrl: `data:${file.mimeType};base64,${Buffer.from(file.bytes).toString("base64")}`,
    })),
  });
}
