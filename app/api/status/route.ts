import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export function GET() {
  return NextResponse.json({ configured: Boolean(process.env.OPENROUTER_API_KEY),provider:'openrouter',polzaEnabled:false });
}
