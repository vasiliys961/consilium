import {verifyPrivacy} from '@/lib/privacy-ticket';
import {geminiRequestEnv}from'@/lib/gemini-pricing';
import {terminalEvent,writeTerminalEvent} from "@/lib/telemetry";
import { NextResponse } from "next/server";
import { validCaseInput } from "@/lib/input-validation";
import { analyzeCase } from "@/lib/analyze-case";
import { attachEquipment } from "@/packages/attachments/attach";
import { gatewayOf, type ConductInput } from "@/lib/conductor";
import { caseQueue, deadlineOf } from "@/lib/queue";
import { parseLocale } from "@/lib/locale";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function attachedCase(body: ConductInput, env: Record<string, string | undefined>) {
  const id = body.caseId?.trim() || crypto.randomUUID();
  const locale = parseLocale(body.locale);
  const equipmentName = body.equipment?.name ?? "";
  const attached = attachEquipment({
    name: equipmentName,
    caseId: id,
    locale,
    specialty: body.equipment?.specialty,
    draft: body.draft?.summary ?? "",
    speech: body.speech?.text,
  });
  return NextResponse.json({
    id,
    path: "light",
    locale,
    draft: { status: "unsigned", summary: body.draft?.summary ?? "", statements: [] },
    voices: [],
    readings: [],
    interpretation: null,
    ledger: [],
    unassessed: attached.status === "read" ? [] : [equipmentName],
    citations: [],
    visit: attached.visit,
    attachment: equipmentName,
    retained: false,
    cost: { totalUsd: 0, credits: 0, steps: [] },
    gateway: { provider: gatewayOf(env), called: false },
    redactions: 0,
    pixelCovers: [],
  });
}

export async function POST(request: Request) {
  const runId=crypto.randomUUID();
  const reject=(reason:string,status:number)=>{writeTerminalEvent(terminalEvent(runId,"request.rejected",{reason,httpStatus:status}));return NextResponse.json({error:reason},{status});};
  const release = caseQueue.tryEnter();
  if (!release) {writeTerminalEvent(terminalEvent(runId,"request.rejected",{reason:"queue",httpStatus:429}));return NextResponse.json({ error: "queue", unassessed: [] }, { status: 429 });}
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = Promise.resolve();
  let handedOff=false;
  const controller=new AbortController();
  try {
    const raw = await request.text();
    if (raw.length > 15_000_000) return reject("payload_too_large",413);
    let body: ConductInput;
    try { body = JSON.parse(raw); } catch { return reject("invalid_json",400); }
    if (!validCaseInput(body))return reject("invalid_case",400);
    const {privacy,...reviewed}=body as ConductInput&{privacy?:{consent?:boolean;token?:string}};
    if(!(body.equipment?.name&&body.draft?.summary)&&(!privacy?.consent||!verifyPrivacy(reviewed,privacy.token)))return reject('privacy_review_required',428);
    if(privacy?.consent)writeTerminalEvent(terminalEvent(runId,'privacy.approved'));
    const deadline = deadlineOf(body.deadlineMs);
    const selection=await geminiRequestEnv(request);if(selection.response)return selection.response;
    const env=selection.env!;
    if(request.headers.get('accept')?.includes('text/event-stream')){
      handedOff=true;const encoder=new TextEncoder();let closed=false;
      const stream=new ReadableStream<Uint8Array>({start(output){
        const send=(event:string,value:unknown)=>{if(!closed)try{output.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));}catch{closed=true;controller.abort();}};
        const beat=setInterval(()=>send('keepalive',{}),15000);
        timer=setTimeout(()=>{controller.abort();writeTerminalEvent(terminalEvent(runId,'run.failed',{reason:'deadline',durationMs:deadline}));send('error',{code:'deadline'});if(!closed){closed=true;output.close();}},deadline);
        const abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});
        const work=body.equipment?.name&&body.draft?.summary?Promise.resolve(attachedCase(body,env)).then(response=>response.json()):analyzeCase(body,{env,reviewed:true,runId,signal:controller.signal,streaming:true,onEvent:event=>{writeTerminalEvent(event);send('progress',event);},onPreview:(text,id,stage)=>send('preview',{text,id,stage})});
        finished=work.then(result=>{if(!controller.signal.aborted)send('result',result);}).catch(error=>{writeTerminalEvent(terminalEvent(runId,'run.failed',{reason:error instanceof Error?error.name:'unknown'}));send('error',{code:'analysis'});}).finally(()=>{if(timer)clearTimeout(timer);clearInterval(beat);request.signal.removeEventListener('abort',abort);release();if(!closed){closed=true;output.close();}});
      },cancel(){closed=true;controller.abort();}});
      return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
    }
    const work = body.equipment?.name && body.draft?.summary ? Promise.resolve(attachedCase(body, env)) : analyzeCase(body,{env,reviewed:true,signal:controller.signal,runId}).then(result => NextResponse.json(result));
    finished = work.then(() => undefined, () => undefined);
    return await Promise.race([
      work,
      new Promise<Response>((resolve) => {
        timer = setTimeout(() => {controller.abort();writeTerminalEvent(terminalEvent(runId,"run.failed",{reason:"deadline",durationMs:deadline}));resolve(NextResponse.json({ error: "deadline", unassessed: [] }, { status: 504 }));}, deadline);
      }),
    ]);
  } catch (error) {
    writeTerminalEvent(terminalEvent(runId,"run.failed",{reason:error instanceof Error?error.name:"unknown"}));
    return NextResponse.json({ error: "case" }, { status: 500 });
  } finally {
    if(!handedOff){if (timer) clearTimeout(timer);void finished.finally(release);}
  }
}
