import { NextResponse } from "next/server";
import { ensurePhoneRelay } from "@/packages/phone/relay";
import { openPhoneSession } from "@/packages/phone/bridge";

export const runtime = "nodejs";

export async function POST(request:Request) {
  const port=Number(new URL(request.url).port)||3107;
  const relay=await ensurePhoneRelay(port);
  const session=openPhoneSession();
  return NextResponse.json({...session,phoneOrigin:relay.url,connectionHint:relay.reason});
}
