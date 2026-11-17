import { consultSpecialist, readSpecialistRequest, readSpecialistVoiceRequest } from '@/lib/specialist-chat';
import { operationStream } from '@/lib/stream-operation';
import {transcribeSpecialistVoice} from '@/lib/specialist-voice-stt';
import{geminiRequestEnv}from'@/lib/gemini-pricing';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  const origin = request.headers.get('origin');
  const allowed = ['127.0.0.1', 'localhost', '[::1]'].map(name => `${name}:${url.port}`);
  if (!host || !allowed.includes(host) || origin !== `http://${host}`) {
    return Response.json({ error: 'origin' }, { status: 403 });
  }

  const raw = await request.text();
  if (raw.length > 1_250_000) return Response.json({ error: 'size' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); }
  catch { return Response.json({ error: 'invalid_question' }, { status: 400 }); }
  const selection=await geminiRequestEnv(request);if(selection.response)return selection.response;
  const env=selection.env!;
  if (body && typeof body === 'object' && 'intent' in body && body.intent === 'transcribe') {
    const parsed = readSpecialistVoiceRequest('reviewed' in body ? body.reviewed : undefined);
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: parsed.status });
    if (!env.OPENROUTER_API_KEY) return Response.json({ error: 'gateway' }, { status: 503 });
    return operationStream(request, async (_fetch, quietFetch) => {
      const heard = await transcribeSpecialistVoice(env, parsed.audio, quietFetch);
      if (!heard) throw new Error('SpecialistVoiceError');
      return heard;
    }, 'specialist-voice');
  }
  if (raw.length > 160_000) return Response.json({ error: 'size' }, { status: 413 });
  const parsed = readSpecialistRequest(body);
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: parsed.status });
  if (!env.POLZA_API_KEY && !env.OPENROUTER_API_KEY) return Response.json({ error: 'gateway' }, { status: 503 });
  return operationStream(request, (fetchImpl, quietFetch, report) =>
    consultSpecialist(parsed.input, env, fetchImpl, quietFetch, stage => report('consult.stage', { stage })),
  parsed.input.draft ? 'specialist-review' : 'specialist-chat');
}
