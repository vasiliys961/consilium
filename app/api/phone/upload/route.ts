import { NextResponse } from "next/server";
import { acceptPhoneFile, bytesFromDataUrl } from "@/packages/phone/bridge";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "empty" }, { status: 400 });
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const name = typeof body.name === "string" ? body.name : "";
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const decoded = bytesFromDataUrl(dataUrl);
  if (!decoded) return NextResponse.json({ error: "empty" }, { status: 400 });
  const requestId=typeof body.requestId==='string'?body.requestId:'';
  const result = acceptPhoneFile(token, { name, mimeType: decoded.mimeType, bytes: decoded.bytes, requestId });
  if ("error" in result) {
    const status = result.error === "unknown" ? 404 : result.error === "large" ? 413 : result.error === "conflict" ? 409 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
