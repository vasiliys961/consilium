import { NextResponse } from "next/server";
import { ensurePhoneRelay } from "@/packages/phone/relay";
import { openPhoneSession } from "@/packages/phone/bridge";
import { localPorts } from "@/lib/local-ports";

export const runtime = "nodejs";

export async function POST() {
  const port=localPorts().app;
  const relay=await ensurePhoneRelay(port);
  const session=openPhoneSession();
  return NextResponse.json({...session,phoneOrigin:relay.url,connectionHint:relay.reason});
}
